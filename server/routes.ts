import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { OpenAIService, type PersonaResponse } from "./ai/openaiService";
import { isDebugApiEnabled } from "./ai/morganRuntime";
import { PERSONAS } from "@shared/personas";
import { z } from "zod";
import type { StoryMemory } from "@shared/schema";
import type { VoiceProfileDocument } from "@shared/voiceProfile";
import { personaCapabilityRequestSchema } from "@shared/personaCapability";
import { runPersonaTask } from "./persona-capability/runPersonaTask";
import { normalizeProjectFormat } from "@shared/projectFormat";
import { SurfaceAwarenessSchema } from "@shared/surfaceAwareness";
import { WorkspaceLocationSchema } from "@shared/workspaceLocation";
import { scriptFactLines } from "./scriptFactFormatting";
import { ComposeDocumentRequestSchema } from "@shared/compose/requestSchema";
import { composeOutline, composeSynopsis, composeTreatment } from "./compose";
import { registerRoomRoutes } from "./room/roomRoutes";
import { loadProjectLibraryConfig } from "./projectLibrary/config";
import { createProjectLibraryStore, type ProjectLibraryStore } from "./projectLibrary/store";
import { registerProjectLibraryRoutes } from "./projectLibrary/routes";
import {
  STRUCTURED_DOCUMENT_SURFACES,
  isValidStructuredDocumentContent,
  shouldRequestDocumentPatch,
  structuredDocumentSurfaceFromSurfaceId,
  type MemoryGroundedPatchAttempt,
  type MemoryGroundedPatchProposal,
  type StructuredDocumentSurface,
} from "@shared/memoryPatches";
import type { SurfaceAwareness } from "@shared/surfaceAwareness";
import {
  createNonProjectMemoryBodyParser,
  createProjectMemoryJsonParser,
  projectMemoryJsonErrorBoundary,
  registerProjectMemoryRoutes,
  registerProjectMemorySecurityBoundary,
} from "./projectMemory/routes";
import { WRITEROS_JSON_BODY_LIMIT } from "./httpLimits";
import {
  ProjectMemoryAgentUnavailableError,
  buildAgentMemoryContext,
  createProjectMemoryProvider,
  finalizeAgentMemoryText,
  finalizeAgentMemoryValue,
  type AgentMemoryContext,
  type MemoryReceipt,
  type ProjectMemoryProvider,
} from "./projectMemory/agentContext";

const openaiService = new OpenAIService();

// Request schemas
const chatMessageSchema = z.object({
  projectId: z.string().min(1).optional(),
  personaId: z.string(),
  message: z.string(),
  userProfile: z.object({
    entryState: z.enum(['blank_slate', 'idea_only', 'outline_complete', 'pages_written_stuck', 'draft_complete_lost', 'revision_mode']),
    existingWork: z.array(z.string()),
    immediateNeed: z.string(),
    feedbackStyle: z.enum(['direct', 'gentle', 'detailed']),
    writerName: z.string()
  }),
  storyMemory: z.object({
    project: z.object({
      title: z.string().optional(),
      genre: z.string().optional(),
      logline: z.string().optional(),
      synopsis: z.string().optional()
    }),
    characters: z.record(z.any()),
    outline: z.object({
      acts: z.number(),
      beats: z.array(z.any())
    }),
    worldRules: z.object({
      setting: z.string().optional(),
      magicSystem: z.string().optional(),
      technology: z.string().optional()
    }),
    dialogue: z.object({
      samples: z.array(z.string()).optional(),
      characterVoices: z.record(z.string()).optional()
    }),
    userProfile: z.object({
      entryState: z.enum(['blank_slate', 'idea_only', 'outline_complete', 'pages_written_stuck', 'draft_complete_lost', 'revision_mode']),
      existingWork: z.array(z.string()),
      immediateNeed: z.string(),
      feedbackStyle: z.enum(['direct', 'gentle', 'detailed']),
      writerName: z.string(),
    }),
    decisions: z.array(z.any())
  }),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  }))
});

const synopsisAssistSchema = z.object({
  projectId: z.string().min(1).optional(),
  userInput: z.string(),
  currentLogline: z.string(),
  currentSynopsis: z.string(),
  projectDetails: z.object({
    title: z.string().optional(),
    genre: z.string().optional()
  }),
  userProfile: z.object({
    entryState: z.enum(['blank_slate', 'idea_only', 'outline_complete', 'pages_written_stuck', 'draft_complete_lost', 'revision_mode']),
    existingWork: z.array(z.string()),
    immediateNeed: z.string(),
    feedbackStyle: z.enum(['direct', 'gentle', 'detailed']),
    writerName: z.string()
  })
});

const scriptContextSchema = z.object({
  excerpt: z.string().default(''),
  sceneHeadings: z.array(z.string()).default([]),
  dialogueSnippets: z.array(z.string()).default([]),
  actionSnippets: z.array(z.string()).default([]),
  characterNames: z.array(z.string()).default([]),
  facts: z.object({
    rebuiltAt: z.string(),
    characters: z.array(z.object({
      label: z.string(),
      count: z.number(),
    })).default([]),
    locations: z.array(z.object({
      label: z.string(),
      count: z.number(),
    })).default([]),
    times: z.array(z.object({
      label: z.string(),
      count: z.number(),
    })).default([]),
  }).optional(),
  excerptWordCount: z.number().default(0),
  excerptWordLimit: z.number().default(500),
  excerptTruncated: z.boolean().default(false),
  totalWordCount: z.number().default(0),
  estimatedPageCount: z.number().default(0),
  sceneCount: z.number().default(0),
  contextReason: z.string().optional(),
  contextLabel: z.string().optional(),
  pageRange: z.object({
    start: z.number(),
    end: z.number(),
  }).optional(),
  selectedText: z.string().optional(),
}).optional();

const synopsisLoglinePartsDefault = {
  text: '',
  protagonist: '',
  goal: '',
  obstacle: '',
  stakes: '',
  hook: '',
};

const synopsisProseDefault = {
  opening: '',
  escalation: '',
  middle: '',
  climax: '',
  resolution: '',
};

const synopsisQaDefault = {
  protagonistNamedEarly: false,
  goalClear: false,
  obstacleClear: false,
  stakesClear: false,
  endingRevealed: false,
  paragraphsConnectCausally: false,
  toneMatchesProject: false,
  noUnnecessarySubplot: false,
};

const synopsisLoglinePartsSchema = z.object({
  text: z.string().default(''),
  protagonist: z.string().default(''),
  goal: z.string().default(''),
  obstacle: z.string().default(''),
  stakes: z.string().default(''),
  hook: z.string().default(''),
}).default(synopsisLoglinePartsDefault);

const synopsisProseSchema = z.object({
  opening: z.string().default(''),
  escalation: z.string().default(''),
  middle: z.string().default(''),
  climax: z.string().default(''),
  resolution: z.string().default(''),
}).default(synopsisProseDefault);

const synopsisQaSchema = z.object({
  protagonistNamedEarly: z.boolean().default(false),
  goalClear: z.boolean().default(false),
  obstacleClear: z.boolean().default(false),
  stakesClear: z.boolean().default(false),
  endingRevealed: z.boolean().default(false),
  paragraphsConnectCausally: z.boolean().default(false),
  toneMatchesProject: z.boolean().default(false),
  noUnnecessarySubplot: z.boolean().default(false),
}).default(synopsisQaDefault);

const synopsisSeriesSchema = z.object({
  seriesType: z.enum(['limited', 'ongoing']).default('ongoing'),
  episodeLength: z.enum(['half_hour', 'hour', 'other']).default('hour'),
  showOverview: z.string().default(''),
  pilot: z.object({
    logline: z.string().default(''),
    prose: z.string().default(''),
  }).default({ logline: '', prose: '' }),
  seasonOneArc: z.string().default(''),
  futureSeasons: z.array(z.object({
    id: z.string().default(''),
    label: z.string().default(''),
    summary: z.string().default(''),
  })).default([]),
  characters: z.array(z.object({
    id: z.string().default(''),
    name: z.string().default(''),
    role: z.string().default(''),
    bio: z.string().default(''),
    arcPerSeason: z.array(z.string()).default([]),
  })).default([]),
  compsAndWhyThisShowNow: z.string().default(''),
}).optional();

const treatmentConceptSchema = z.object({
  premise: z.string().default(''),
  tone: z.string().default(''),
  theme: z.string().default(''),
  emotionalPromise: z.string().default(''),
});

const treatmentCharacterSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  role: z.string().default(''),
  externalWant: z.string().default(''),
  internalNeed: z.string().default(''),
  flawOrWound: z.string().default(''),
  secretOrContradiction: z.string().default(''),
  arc: z.string().default(''),
  relationshipPressure: z.string().default(''),
});

const treatmentProseSchema = z.object({
  opening: z.string().default(''),
  actOne: z.string().default(''),
  actTwo: z.string().default(''),
  actThree: z.string().default(''),
  customSections: z.array(z.object({
    id: z.string().default(''),
    heading: z.string().default(''),
    body: z.string().default(''),
  })).default([]),
});

const treatmentVisualAndTonalSchema = z.object({
  overallTone: z.string().default(''),
  visualWorld: z.string().default(''),
  recurringImagesOrMotifs: z.string().default(''),
  musicOrSoundFeeling: z.string().default(''),
  pacing: z.string().default(''),
  genreRules: z.string().default(''),
  compsAndReferences: z.string().default(''),
});

const treatmentOpenQuestionsSchema = z.object({
  story: z.array(z.string()).default([]),
  character: z.array(z.string()).default([]),
  worldOrMythology: z.array(z.string()).default([]),
  production: z.array(z.string()).default([]),
});

const treatmentContextSchema = z.object({
  logline: z.string().default(''),
  concept: treatmentConceptSchema.default({}),
  mainCharacters: z.array(treatmentCharacterSchema).default([]),
  prose: treatmentProseSchema.default({}),
  visualAndTonal: treatmentVisualAndTonalSchema.default({}),
  openQuestions: treatmentOpenQuestionsSchema.default({}),
}).default({});

const projectContextSchema = z.object({
  title: z.string().optional(),
  genre: z.string().optional(),
  format: z.string().default('feature').transform(normalizeProjectFormat),
  logline: z.string().optional(),
  // Surface Awareness Contract — optional, advisory context. A malformed surface must
  // never break chat, so it degrades to undefined (no block) instead of failing the parse
  // and 500ing the whole request.
  surface: SurfaceAwarenessSchema.optional().catch(undefined),
  // WorkspaceLocation is optional, advisory, and read-only. Malformed packets degrade to
  // undefined just like surface awareness so chat keeps working without a location block.
  location: WorkspaceLocationSchema.optional().catch(undefined),
  script: scriptContextSchema,
  synopsis: z.object({
    logline: z.string(),
    loglineParts: synopsisLoglinePartsSchema,
    prose: synopsisProseSchema,
    qa: synopsisQaSchema,
    series: synopsisSeriesSchema,
    sections: z.object({
      setup: z.string(),
      act1Break: z.string(),
      midpoint: z.string(),
      act2Break: z.string(),
      resolution: z.string(),
    }),
    format: z.string().optional(),
    showOverview: z.string().optional(),
  }),
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    wound: z.string(),
    want: z.string(),
    need: z.string(),
    arc: z.string(),
  })),
  beats: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    notes: z.string(),
    linkedSceneIds: z.array(z.string()).default([]),
  })),
  treatment: treatmentContextSchema,
  scenes: z.array(z.object({
    id: z.string(),
    heading: z.string(),
    index: z.number(),
  })),
  storyBible: z.object({
    themes: z.string().default(''),
    rules: z.string().default(''),
    world: z.object({
      setting: z.string().default(''),
      toneAnchors: z.string().default(''),
      voiceNotes: z.string().default(''),
    }),
  }),
  world: z.object({
    setting: z.string().default(''),
    toneAnchors: z.string().default(''),
    voiceNotes: z.string().default(''),
  }),
});

const stringArraySchema = z.array(z.string()).default([]);

const voiceProfileDocumentSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  displayName: z.string().optional(),
  archetype: z.string(),
  coreStatement: z.string(),
  creativeNorthStars: stringArraySchema,
  storytellingDNA: z.object({
    principles: stringArraySchema,
    recurringThemes: stringArraySchema,
    notes: z.string(),
  }),
  influences: z.object({
    writers: stringArraySchema,
    directors: stringArraySchema,
    filmsAndShows: stringArraySchema,
    scenesAndLines: stringArraySchema,
    notes: z.string(),
  }),
  characterInstincts: z.object({
    drawnTo: stringArraySchema,
    rejects: stringArraySchema,
    notes: z.string(),
  }),
  dialogue: z.object({
    rules: stringArraySchema,
    instinctsByMode: z.string(),
    avoidances: stringArraySchema,
  }),
  visualLanguage: z.object({
    instincts: stringArraySchema,
    notes: z.string(),
  }),
  process: z.object({
    whenFlowing: z.string(),
    stuckPatterns: stringArraySchema,
    supportNeeds: stringArraySchema,
  }),
  strengths: stringArraySchema,
  growthEdges: stringArraySchema,
  collaborationPreferences: z.object({
    always: stringArraySchema,
    never: stringArraySchema,
    feedbackStyle: z.string(),
  }),
  alexCoachingNotes: stringArraySchema,
});

const wpChatSchema = z.object({
  projectId: z.string().min(1),
  personaId: z.string(),
  message: z.string(),
  projectContext: projectContextSchema,
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  // Writer Voice Profile — optional, advisory style guidance. A malformed profile
  // must never break chat, so it degrades to undefined (no conditioning) instead of
  // failing the parse. Mirrors the `surface` safety rule.
  voiceProfile: voiceProfileDocumentSchema.optional().catch(undefined),
  // Task 10 (review Important 4): the writer's own in-memory revision/content
  // for whichever structured document they are currently on. A
  // structured-document patch's baseVersion is built from this, not the
  // folder-backed package on disk — the debounced autosave can lag the
  // browser by up to its ~600ms debounce, which made every Apply refuse as
  // stale even when the writer made no edits after asking for the rewrite.
  // Malformed/absent degrades to undefined, same as voiceProfile/surface.
  documentSnapshot: z.object({
    surface: z.enum(STRUCTURED_DOCUMENT_SURFACES),
    revision: z.number().int().nonnegative(),
    content: z.unknown(),
  }).optional().catch(undefined),
});

export const openSwarmWritingPartnerSchema = z.object({
  projectId: z.string().min(1).optional(),
  message: z.string(),
  projectContext: projectContextSchema,
  voiceProfile: voiceProfileDocumentSchema.optional(),
});

export const voiceProfileSynthesizeSchema = z.object({
  answers: z.record(z.string(), z.string()).refine(
    v => Object.keys(v).length > 0,
    { message: 'answers must not be empty' }
  ),
});

type ProjectContextForOpenSwarm = z.infer<typeof projectContextSchema>;

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function truncate(value: string, limit = 900): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit).trim()}...`;
}

function bulletLines(items: string[]): string {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None supplied';
}

function compactList(values: string[], limit = 5): string {
  const compacted = values.filter(filled).map(value => truncate(value, 120));
  if (!compacted.length) return '';
  const visible = compacted.slice(0, limit).join('; ');
  const extra = compacted.length > limit ? `; +${compacted.length - limit} more` : '';
  return `${visible}${extra}`;
}

function labeledLine(label: string, value: string): string | null {
  return filled(value) ? `${label}: ${truncate(value, 500)}` : null;
}

function listLine(label: string, values: string[]): string | null {
  const compacted = compactList(values);
  return compacted ? `${label}: ${compacted}` : null;
}

function characterKey(name: string, fallback: string): string {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return key || fallback;
}

function joinedDetails(values: Array<string | false | null | undefined>): string {
  return values.filter(filled).join('; ');
}

function mergeDetail(existing?: string, next?: string): string | undefined {
  if (!filled(next)) return existing;
  if (!filled(existing)) return next;
  return existing.includes(next) ? existing : `${existing}; ${next}`;
}

function buildStoryMemoryCharacters(projectContext: ProjectContextForOpenSwarm): StoryMemory['characters'] {
  const characters: StoryMemory['characters'] = {};

  function addCharacter(input: {
    id?: string
    name?: string
    role?: string
    backstory?: string
    motivation?: string
    arc?: string
  }) {
    const name = input.name || '';
    const id = input.id || characterKey(name, `character-${Object.keys(characters).length + 1}`);
    const key = characterKey(name, id);
    const existing = characters[key];

    characters[key] = {
      id: existing?.id || id,
      name: existing?.name || name,
      role: mergeDetail(existing?.role, input.role) || '',
      backstory: mergeDetail(existing?.backstory, input.backstory),
      motivation: mergeDetail(existing?.motivation, input.motivation),
      arc: mergeDetail(existing?.arc, input.arc),
    };
  }

  for (const character of projectContext.characters) {
    addCharacter({
      id: character.id,
      name: character.name,
      role: character.role,
      backstory: character.wound,
      motivation: joinedDetails([
        filled(character.want) && `want: ${character.want}`,
        filled(character.need) && `need: ${character.need}`,
      ]),
      arc: character.arc,
    });
  }

  for (const character of projectContext.treatment.mainCharacters) {
    addCharacter({
      id: character.id,
      name: character.name,
      role: character.role,
      backstory: joinedDetails([
        filled(character.flawOrWound) && `flaw/wound: ${character.flawOrWound}`,
        filled(character.secretOrContradiction) && `secret/contradiction: ${character.secretOrContradiction}`,
        filled(character.relationshipPressure) && `relationship pressure: ${character.relationshipPressure}`,
      ]),
      motivation: joinedDetails([
        filled(character.externalWant) && `want: ${character.externalWant}`,
        filled(character.internalNeed) && `need: ${character.internalNeed}`,
      ]),
      arc: character.arc,
    });
  }

  for (const character of projectContext.synopsis.series?.characters ?? []) {
    addCharacter({
      id: character.id,
      name: character.name,
      role: character.role,
      backstory: character.bio,
      arc: character.arcPerSeason.filter(filled).join('; '),
    });
  }

  return Object.fromEntries(
    Object.entries(characters).filter(([, character]) =>
      filled(character.name) ||
      filled(character.role) ||
      filled(character.backstory) ||
      filled(character.motivation) ||
      filled(character.arc)
    )
  );
}

function countFilled(values: string[]): number {
  return values.filter(filled).length;
}

function projectContextLogline(projectContext: ProjectContextForOpenSwarm): string {
  return projectContext.synopsis.loglineParts.text || projectContext.logline || projectContext.synopsis.logline || '';
}

function activeShowOverview(projectContext: ProjectContextForOpenSwarm): string {
  return projectContext.format === 'series'
    ? projectContext.synopsis.series?.showOverview || projectContext.synopsis.showOverview || ''
    : '';
}

function seriesHasCharacter(character: NonNullable<ProjectContextForOpenSwarm['synopsis']['series']>['characters'][number]): boolean {
  return filled(character.name) ||
    filled(character.role) ||
    filled(character.bio) ||
    character.arcPerSeason.some(filled);
}

function buildSynopsisContextLines(projectContext: ProjectContextForOpenSwarm): string[] {
  const logline = projectContextLogline(projectContext);
  const legacySectionLines = Object.entries(projectContext.synopsis.sections)
    .filter(([, value]) => filled(value))
    .map(([key, value]) => `${key}: ${truncate(value, 500)}`);

  if (projectContext.format === 'series' && projectContext.synopsis.series) {
    const series = projectContext.synopsis.series;
    const futureSeasons = series.futureSeasons
      .filter(season => filled(season.label) || filled(season.summary))
      .map((season, index) => {
        const label = filled(season.label) ? season.label : `Season ${index + 2}`;
        return `${label}: ${truncate(season.summary, 400)}`;
      });
    const characters = series.characters
      .filter(seriesHasCharacter)
      .map(character => {
        const details = [
          filled(character.role) && `role: ${character.role}`,
          filled(character.bio) && `bio: ${character.bio}`,
          character.arcPerSeason.some(filled) && `arcs: ${character.arcPerSeason.filter(filled).join('; ')}`,
        ].filter(Boolean).join('; ');
        return `${character.name || 'Unnamed character'}${details ? ` (${truncate(details, 400)})` : ''}`;
      });

    return [
      filled(logline) ? `Series logline: ${truncate(logline, 500)}` : '',
      filled(series.showOverview) ? `Show Overview: ${truncate(series.showOverview, 500)}` : '',
      filled(series.pilot.logline) ? `Pilot logline: ${truncate(series.pilot.logline, 500)}` : '',
      filled(series.pilot.prose) ? `Pilot synopsis: ${truncate(series.pilot.prose, 900)}` : '',
      filled(series.seasonOneArc) ? `Season One Arc: ${truncate(series.seasonOneArc, 700)}` : '',
      futureSeasons.length ? `Where It Goes: ${futureSeasons.join(' | ')}` : '',
      characters.length ? `Characters: ${characters.join(' | ')}` : '',
      filled(series.compsAndWhyThisShowNow) ? `Comps & Why This Show Now: ${truncate(series.compsAndWhyThisShowNow, 700)}` : '',
    ].filter(filled);
  }

  const proseLines = [
    filled(logline) ? `Feature logline: ${truncate(logline, 500)}` : '',
    filled(projectContext.synopsis.prose.opening) ? `Opening: ${truncate(projectContext.synopsis.prose.opening, 500)}` : '',
    filled(projectContext.synopsis.prose.escalation) ? `Escalation: ${truncate(projectContext.synopsis.prose.escalation, 500)}` : '',
    filled(projectContext.synopsis.prose.middle) ? `Middle: ${truncate(projectContext.synopsis.prose.middle, 500)}` : '',
    filled(projectContext.synopsis.prose.climax) ? `Climax: ${truncate(projectContext.synopsis.prose.climax, 500)}` : '',
    filled(projectContext.synopsis.prose.resolution) ? `Resolution: ${truncate(projectContext.synopsis.prose.resolution, 500)}` : '',
  ].filter(filled);

  if (proseLines.length) return proseLines;
  return legacySectionLines;
}

function buildStoryMemorySynopsis(projectContext: ProjectContextForOpenSwarm): string {
  return buildSynopsisContextLines(projectContext)
    .map(line => line.replace(/\s+\|\s+/g, '\n'))
    .join('\n\n');
}

function buildTreatmentContextLines(projectContext: ProjectContextForOpenSwarm): string[] {
  const treatment = projectContext.treatment;
  const conceptLines = [
    labeledLine('Treatment logline', treatment.logline),
    labeledLine('Premise', treatment.concept.premise),
    labeledLine('Tone', treatment.concept.tone),
    labeledLine('Theme', treatment.concept.theme),
    labeledLine('Emotional promise', treatment.concept.emotionalPromise),
  ].filter(filled);
  const proseLines = [
    labeledLine('Opening', treatment.prose.opening),
    labeledLine('Act One', treatment.prose.actOne),
    labeledLine('Act Two', treatment.prose.actTwo),
    labeledLine('Act Three', treatment.prose.actThree),
    ...treatment.prose.customSections
      .filter(section => filled(section.heading) || filled(section.body))
      .map(section => `${section.heading || 'Additional movement'}: ${truncate(section.body, 700)}`),
  ].filter(filled);
  const characterLines = treatment.mainCharacters
    .filter(character => filled(character.name))
    .slice(0, 8)
    .map(character => {
      const details = [
        filled(character.role) && `role: ${character.role}`,
        filled(character.externalWant) && `want: ${character.externalWant}`,
        filled(character.internalNeed) && `need: ${character.internalNeed}`,
        filled(character.arc) && `arc: ${character.arc}`,
      ].filter(Boolean).join('; ');
      return `${character.name}${details ? ` (${truncate(details, 240)})` : ''}`;
    });
  const visualLines = [
    labeledLine('Overall tone', treatment.visualAndTonal.overallTone),
    labeledLine('Visual world', treatment.visualAndTonal.visualWorld),
    labeledLine('Recurring images or motifs', treatment.visualAndTonal.recurringImagesOrMotifs),
    labeledLine('Music or sound feeling', treatment.visualAndTonal.musicOrSoundFeeling),
    labeledLine('Pacing', treatment.visualAndTonal.pacing),
    labeledLine('Genre rules', treatment.visualAndTonal.genreRules),
    labeledLine('Comps or references', treatment.visualAndTonal.compsAndReferences),
  ].filter(filled);
  const openQuestionLines = [
    listLine('Open story questions', treatment.openQuestions.story),
    listLine('Open character questions', treatment.openQuestions.character),
    listLine('Open world or mythology questions', treatment.openQuestions.worldOrMythology),
    listLine('Open production questions', treatment.openQuestions.production),
  ].filter(filled);

  return [
    ...conceptLines,
    ...characterLines.map(line => `Character: ${line}`),
    ...proseLines,
    ...visualLines,
    ...openQuestionLines,
  ].map(line => truncate(line, 900));
}

function buildStoryMemoryTreatment(projectContext: ProjectContextForOpenSwarm): string {
  return buildTreatmentContextLines(projectContext).join('\n');
}

function buildVoiceProfileLines(voiceProfile?: VoiceProfileDocument): string[] {
  if (!voiceProfile) return [];

  return [
    labeledLine('Display name', voiceProfile.displayName || ''),
    labeledLine('Archetype', voiceProfile.archetype),
    labeledLine('Core statement', voiceProfile.coreStatement),
    listLine('Creative north stars', voiceProfile.creativeNorthStars),
    listLine('Storytelling principles', voiceProfile.storytellingDNA.principles),
    listLine('Recurring themes', voiceProfile.storytellingDNA.recurringThemes),
    labeledLine('Storytelling notes', voiceProfile.storytellingDNA.notes),
    listLine('Influence writers', voiceProfile.influences.writers),
    listLine('Influence films/shows', voiceProfile.influences.filmsAndShows),
    labeledLine('Influence notes', voiceProfile.influences.notes),
    listLine('Character instincts drawn to', voiceProfile.characterInstincts.drawnTo),
    listLine('Character instincts rejects', voiceProfile.characterInstincts.rejects),
    labeledLine('Character notes', voiceProfile.characterInstincts.notes),
    listLine('Dialogue rules', voiceProfile.dialogue.rules),
    labeledLine('Dialogue instincts by mode', voiceProfile.dialogue.instinctsByMode),
    listLine('Dialogue avoidances', voiceProfile.dialogue.avoidances),
    listLine('Visual instincts', voiceProfile.visualLanguage.instincts),
    labeledLine('Visual notes', voiceProfile.visualLanguage.notes),
    labeledLine('Process when flowing', voiceProfile.process.whenFlowing),
    listLine('Stuck patterns', voiceProfile.process.stuckPatterns),
    listLine('Support needs', voiceProfile.process.supportNeeds),
    listLine('Strengths', voiceProfile.strengths),
    listLine('Growth edges', voiceProfile.growthEdges),
    listLine('Collaboration always', voiceProfile.collaborationPreferences.always),
    listLine('Collaboration never', voiceProfile.collaborationPreferences.never),
    labeledLine('Feedback style', voiceProfile.collaborationPreferences.feedbackStyle),
    listLine('Alex coaching notes', voiceProfile.alexCoachingNotes),
  ].filter(filled);
}

export function buildOpenSwarmWritingPartnerPrompt(
  message: string,
  projectContext: ProjectContextForOpenSwarm,
  voiceProfile?: VoiceProfileDocument,
  projectMemoryPrompt = '',
): string {
  const synopsisContextLines = buildSynopsisContextLines(projectContext)
    .map(line => `- ${line}`);
  const treatmentContextLines = buildTreatmentContextLines(projectContext)
    .map(line => `- ${line}`);

  const characterLines = projectContext.characters
    .filter(character => filled(character.name))
    .slice(0, 8)
    .map(character => {
      const details = [
        character.role && `role: ${character.role}`,
        character.wound && `wound: ${character.wound}`,
        character.want && `want: ${character.want}`,
        character.need && `need: ${character.need}`,
        character.arc && `arc: ${character.arc}`,
      ].filter(Boolean).join('; ');
      return `${character.name}${details ? ` (${truncate(details, 220)})` : ''}`;
    });

  const beatLines = projectContext.beats
    .filter(beat => filled(beat.notes))
    .slice(0, 12)
    .map(beat => `${beat.name}: ${truncate(beat.notes, 260)}`);

  const script = projectContext.script;
  const scriptLines = [
    script?.contextLabel && `Context: ${script.contextLabel}`,
    script?.selectedText && `Selected text: ${truncate(script.selectedText, 900)}`,
    script?.excerpt && `Excerpt: ${truncate(script.excerpt, 900)}`,
    script?.sceneHeadings?.length ? `Scene headings: ${script.sceneHeadings.slice(0, 10).join('; ')}` : '',
    ...(script ? scriptFactLines(script) : []),
  ].filter(filled);

  const storyBibleLines = [
    projectContext.storyBible.world.setting && `Setting: ${projectContext.storyBible.world.setting}`,
    projectContext.storyBible.world.toneAnchors && `Tone anchors: ${projectContext.storyBible.world.toneAnchors}`,
    projectContext.storyBible.world.voiceNotes && `Project voice notes: ${projectContext.storyBible.world.voiceNotes}`,
    projectContext.storyBible.themes && `Themes: ${projectContext.storyBible.themes}`,
    projectContext.storyBible.rules && `Rules: ${projectContext.storyBible.rules}`,
  ].filter(filled).map(line => truncate(line, 500));
  const voiceProfileLines = buildVoiceProfileLines(voiceProfile);
  const synopsisFilledCount = countFilled([
    projectContextLogline(projectContext),
    ...Object.values(projectContext.synopsis.prose),
    ...Object.values(projectContext.synopsis.sections),
    ...(projectContext.format === 'series' && projectContext.synopsis.series ? [
      projectContext.synopsis.series.showOverview,
      projectContext.synopsis.series.pilot.logline,
      projectContext.synopsis.series.pilot.prose,
      projectContext.synopsis.series.seasonOneArc,
      ...projectContext.synopsis.series.futureSeasons.flatMap(season => [season.label, season.summary]),
      ...projectContext.synopsis.series.characters.flatMap(character => [
        character.name,
        character.role,
        character.bio,
        ...character.arcPerSeason,
      ]),
      projectContext.synopsis.series.compsAndWhyThisShowNow,
    ] : []),
  ]);
  const storyBibleFilledCount = countFilled([
    projectContext.storyBible.themes,
    projectContext.storyBible.rules,
    projectContext.storyBible.world.setting,
    projectContext.storyBible.world.toneAnchors,
    projectContext.storyBible.world.voiceNotes,
  ]);
  const contextInventory = [
    `Voice Profile: ${voiceProfileLines.length ? 'supplied' : 'not supplied'}`,
    `Project identity: ${compactList([projectContext.title || '', projectContext.genre || '', projectContext.logline || projectContext.synopsis.logline || '']) || 'not supplied'}`,
    `Synopsis: ${synopsisFilledCount} filled field${synopsisFilledCount === 1 ? '' : 's'}`,
    `Characters: ${characterLines.length} named character${characterLines.length === 1 ? '' : 's'}`,
    `Outline: ${beatLines.length} beat note${beatLines.length === 1 ? '' : 's'} supplied`,
    `Treatment: ${treatmentContextLines.length} filled field${treatmentContextLines.length === 1 ? '' : 's'}`,
    `Story Bible: ${storyBibleFilledCount} filled field${storyBibleFilledCount === 1 ? '' : 's'}`,
    `Script: ${script?.excerptWordCount || 0} excerpt word${script?.excerptWordCount === 1 ? '' : 's'}, ${script?.sceneCount || 0} scene${script?.sceneCount === 1 ? '' : 's'}${script?.contextLabel ? ` (${script.contextLabel})` : ''}`,
    `Script Facts: ${script?.facts ? `${script.facts.characters.length} character${script.facts.characters.length === 1 ? '' : 's'}, ${script.facts.locations.length} location${script.facts.locations.length === 1 ? '' : 's'}, ${script.facts.times.length} time marker${script.facts.times.length === 1 ? '' : 's'}` : 'not supplied'}`,
  ];

  return `You are OpenSwarm Writing Partner. Review only this bounded WriterOS handoff packet.

Boundary rules:
- Do not claim access to WriterOS transcripts, files, Voice Profile, or project state beyond this packet.
- Do not mutate WriterOS state.
- Voice Profile is writer-scoped and project-agnostic. Story Bible voice notes are project-scoped. Keep them separate.
- Treat this as advisory output that may be shown in the WriterOS Writing Partner transcript.
- For story development, recommend only WriterOS creative partners: Sam, Casey, Oliver, Maya, Zoe, or Alex.
- Recommend Deep Research only when the user explicitly asks for current/recent facts, source-backed research, real-world analogs, or market comps.
- If current/recent web research is explicitly required, do not guess; provide a Deep Research brief.
- Use the context inventory below to distinguish writer-authored project material from empty WriterOS surfaces.
- If project material is missing, say which WriterOS surface needs material instead of implying you can see more in-app context than the packet contains.
- Do not treat default outline beat labels or descriptions as story content unless writer-authored beat notes are supplied.

Task response contract:
- Treat the user question as a task request, not an open-ended chat.
- Respond like a concise review memo or task report that could be saved as a document.
- Use plain text only. Do not use Markdown heading markers (# or ##), bold/italic markers (** or _), or decorative markdown.
- Target 250-450 words unless the user explicitly asks for more detail.
- Start with the task result or verdict, then the evidence from the supplied packet.
- Use compact section labels that end with a colon, such as "Verdict:", "Evidence:", "Missing Context:", and "Next Actions:".
- Simple hyphen bullets are allowed. Avoid conversational throat-clearing.
- Include a "Missing Context" section only when the context inventory shows material is absent.
- When context is missing, name the WriterOS surface to fill (Synopsis, Characters, Outline, Treatment, Story Bible, or Script context). Do not ask the user to paste material into chat unless they explicitly ask for a paste-based workflow.
- Keep specialist recommendations brief and only include them when they directly advance the task.

Creative partner lanes:
- Sam: loglines, synopsis, pitch language, hook, stakes, comps framing.
- Casey: character motivation, want/need/wound, relationships, emotional engine, theme-through-behavior.
- Oliver: outline beats, act turns, scene-level escalation, pacing, causality, structure.
- Maya: dialogue, character voice, subtext, rhythm, line alternatives.
- Zoe: world-building, rules, continuity, canon questions, setting logic.
- Alex: draft readiness, process, momentum, treatment-to-pages planning.

User question:
${message}

Context inventory:
${bulletLines(contextInventory)}

Project context supplied by WriterOS:
- Title: ${projectContext.title || 'Untitled'}
- Genre: ${projectContext.genre || 'Not supplied'}
- Logline: ${projectContextLogline(projectContext) || 'Not supplied'}
- Format: ${projectContext.format}
- Show Overview: ${activeShowOverview(projectContext) || 'Not supplied'}

Writer Voice Profile supplied by WriterOS:
${voiceProfileLines.length ? bulletLines(voiceProfileLines) : '- None supplied by WriterOS for this request.'}

Synopsis material:
${synopsisContextLines.length ? synopsisContextLines.join('\n') : '- None supplied'}

Characters:
${bulletLines(characterLines)}

Outline beats:
${bulletLines(beatLines)}

Treatment:
${treatmentContextLines.length ? treatmentContextLines.join('\n') : '- None supplied'}

Story Bible:
${bulletLines(storyBibleLines)}

Script context:
${scriptLines.length ? scriptLines.join('\n') : '- None supplied'}${projectMemoryPrompt ? `\n\n${projectMemoryPrompt}` : ''}`;
}

// Build the HTTP body for a PersonaResponse, gating admin/debug trace metadata.
// `debug` is included ONLY when MORGAN_DEBUG_API=on AND the runtime produced it.
// EVERY persona-chat adapter (/api/chat, /api/wp-chat) must route through this so
// debug never leaks from any surface by default. The default contract stays
// { message, suggestions }.
function personaResponseBody(response: PersonaResponse, memory: AgentMemoryContext) {
  const finalized = finalizeAgentMemoryValue({
    message: response.message,
    suggestions: response.suggestions,
  }, memory);
  const body: { message: string; suggestions?: string[]; debug?: PersonaResponse['debug']; memoryReceipt: typeof finalized.receipt } = {
    message: finalized.value.message,
    suggestions: finalized.value.suggestions,
    memoryReceipt: finalized.receipt,
  };
  if (isDebugApiEnabled() && response.debug) {
    body.debug = response.debug;
  }
  return body;
}

// Review round 2 (Important): documentSnapshot.content is untrusted request
// input, unlike the disk-read document (already guaranteed valid by
// ProjectDocumentsSchema). A generous but bounded cap on top of exact-schema
// validation — full documents are text; ~200k characters comfortably covers
// even a large treatment or story bible while refusing anything padded far
// past what a real document could be.
const MAX_DOCUMENT_SNAPSHOT_CONTENT_CHARS = 200_000;

function isUsableDocumentSnapshot(
  snapshot: { surface: StructuredDocumentSurface; revision: number; content: unknown } | undefined,
  surface: StructuredDocumentSurface,
): boolean {
  if (!snapshot || snapshot.surface !== surface) return false;
  let serialized: string;
  try {
    serialized = JSON.stringify(snapshot.content) ?? '';
  } catch {
    return false;
  }
  if (serialized.length === 0 || serialized.length > MAX_DOCUMENT_SNAPSHOT_CONTENT_CHARS) return false;
  return isValidStructuredDocumentContent(surface, snapshot.content);
}

// Task 10: gates and orchestrates one memory-grounded structured-document
// patch attempt alongside a wp-chat response — same "attach it next to the
// response" shape as personaResponseBody attaches a MemoryReceipt. Never
// throws: every failure mode (no folder-backed project, no matching surface,
// no intent, an unreadable package) degrades to 'not-requested', which is the
// normal/silent case, not a visible failure.
async function attemptStructuredDocumentPatch(input: {
  projectId: string;
  message: string;
  surfaceAwareness: SurfaceAwareness | undefined;
  documentSnapshot?: { surface: StructuredDocumentSurface; revision: number; content: unknown };
  memory: AgentMemoryContext;
  projectLibraryStore: ProjectLibraryStore | null;
}): Promise<MemoryGroundedPatchAttempt> {
  if (!input.projectLibraryStore) return { status: 'not-requested' };
  // Plan ruling: only on an explicit fill/rewrite/apply/revise ask that names
  // (or deictically means) the CURRENT structured surface — never for script
  // (surfaceAwareness only models the four structured-document surfaces;
  // script always reports { kind: 'none' }, see shared/surfaceAwareness.ts),
  // and never unprompted. Surface must be resolved first: shouldRequestDocumentPatch
  // needs to know which surface is "current" to judge whether the message
  // actually refers to it.
  if (input.surfaceAwareness?.kind !== 'intake') return { status: 'not-requested' };
  const surface = structuredDocumentSurfaceFromSurfaceId(input.surfaceAwareness.surface);
  if (!surface) return { status: 'not-requested' };
  if (!shouldRequestDocumentPatch(input.message, surface)) return { status: 'not-requested' };

  let read;
  try {
    read = await input.projectLibraryStore.readProject(input.projectId);
  } catch {
    // Not found (browser-only project, stale id) or any other read error —
    // there is no authoritative document/revision to propose a patch
    // against, so this is simply inapplicable, not a failure to surface.
    return { status: 'not-requested' };
  }
  if (!read.ok) return { status: 'not-requested' };

  // Review Important 4: prefer the writer's own in-memory revision/content
  // for this exact surface over the folder-backed package on disk. The
  // package is written by a debounced autosave (~600ms) and so can lag the
  // browser by a beat — reading it here would attribute baseVersion to a
  // moment already behind the writer's live document, making the apply-time
  // staleness check in client/src/lib/memoryPatch.ts fail even when the
  // writer made no edits after asking for the rewrite.
  //
  // Review round 2 (Important): unlike the disk read (already guaranteed
  // schema-valid by ProjectDocumentsSchema), a snapshot is untrusted request
  // input — isUsableDocumentSnapshot checks its declared surface matches the
  // one we just resolved, its size is bounded, and its content validates
  // against that exact surface's content schema. Any failure there falls
  // back to the disk read (same path as "no snapshot sent") rather than
  // erroring the chat or trusting unvalidated content into the model prompt.
  const document = isUsableDocumentSnapshot(input.documentSnapshot, surface)
    ? { content: input.documentSnapshot!.content, revision: input.documentSnapshot!.revision }
    : read.project.state.documents[surface];
  return openaiService.generateStructuredDocumentPatch({
    surface,
    currentContent: document.content,
    baseVersion: document.revision,
    userMessage: input.message,
    agentMemory: input.memory,
  });
}

function patchAttemptResponseFields(
  attempt: MemoryGroundedPatchAttempt,
): { patch?: MemoryGroundedPatchProposal; patchFailure?: { reason: string } } {
  if (attempt.status === 'generated') return { patch: attempt.proposal };
  if (attempt.status === 'failed') return { patchFailure: { reason: attempt.reason } };
  return {};
}

export interface RegisterRoutesOptions {
  projectMemoryProvider?: ProjectMemoryProvider | null;
}

export async function registerRoutes(app: Express, options: RegisterRoutesOptions = {}): Promise<Server> {
  let projectLibraryConfig;
  try {
    projectLibraryConfig = await loadProjectLibraryConfig(process.env);
  } catch (error) {
    console.warn('Server project library disabled:', error instanceof Error ? error.message : 'invalid configuration');
    projectLibraryConfig = await loadProjectLibraryConfig({
      ...process.env,
      WRITEROS_PROJECTS_ROOT: undefined,
    });
  }
  registerProjectMemorySecurityBoundary(app, projectLibraryConfig);
  app.use(createProjectMemoryJsonParser(WRITEROS_JSON_BODY_LIMIT));
  app.use(createNonProjectMemoryBodyParser(express.json({ limit: WRITEROS_JSON_BODY_LIMIT })));
  app.use(createNonProjectMemoryBodyParser(express.urlencoded({ extended: false })));
  app.use(projectMemoryJsonErrorBoundary);
  const projectLibraryStore = projectLibraryConfig.enabled && projectLibraryConfig.rootPath
    ? await createProjectLibraryStore(projectLibraryConfig.rootPath)
    : null;
  const agentMemoryProvider = options.projectMemoryProvider !== undefined
    ? options.projectMemoryProvider
    : projectLibraryStore
      ? createProjectMemoryProvider({ projectLibraryStore })
      : null;
  registerProjectLibraryRoutes(app, projectLibraryConfig, projectLibraryStore);
  registerProjectMemoryRoutes(app, projectLibraryConfig, projectLibraryStore);

  // Writers' Room runtime (Phase 1 spike). Routes 503 and the scheduler stays
  // off when Supabase env vars are absent — the rest of WriterOS is unaffected.
  registerRoomRoutes(app, agentMemoryProvider);

  // Chat with persona
  app.post("/api/chat", async (req, res) => {
    try {
      const data = chatMessageSchema.parse(req.body);
      const persona = PERSONAS[data.personaId];
      
      if (!persona) {
        return res.status(400).json({ error: "Invalid persona ID" });
      }

      const memory = await buildAgentMemoryContext(agentMemoryProvider, data.projectId, {
        message: data.message,
        surface: 'chat',
        personaId: data.personaId,
      });
      const response = await openaiService.generatePersonaResponse(
        persona,
        data.message,
        data.userProfile,
        data.storyMemory,
        data.conversationHistory,
        undefined,
        memory,
      );

      res.json(personaResponseBody(response, memory));
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({
          error: 'project-memory-unavailable',
          message: error.message,
        });
      }
      console.error("Chat error:", error);
      res.status(500).json({
        error: "Failed to process chat message",
        message: "I'm having trouble connecting right now. Please try again in a moment."
      });
    }
  });

  // Synopsis assistance
  app.post("/api/synopsis-assist", async (req, res) => {
    try {
      const data = synopsisAssistSchema.parse(req.body);
      const memory = await buildAgentMemoryContext(agentMemoryProvider, data.projectId, {
        message: data.userInput,
        surface: 'synopsis',
        personaId: 'sam',
      });
      
      const response = await openaiService.generateSynopsisAssistance(
        data.userInput,
        data.currentLogline,
        data.currentSynopsis,
        data.projectDetails,
        data.userProfile,
        memory,
      );

      const finalized = finalizeAgentMemoryValue(response, memory);
      res.json({ ...finalized.value, memoryReceipt: finalized.receipt });
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({ error: 'project-memory-unavailable', message: error.message });
      }
      console.error("Synopsis assist error:", error);
      res.status(500).json({ 
        error: "Failed to process synopsis assistance",
        feedback: "I'm having trouble connecting right now, but keep working on making your story's central conflict clear and compelling."
      });
    }
  });

  // Writing Partner chat — thin adapter over generatePersonaResponse
  app.post("/api/wp-chat", async (req, res) => {
    try {
      const data = wpChatSchema.parse(req.body);
      const persona = PERSONAS[data.personaId];

      if (!persona) {
        return res.status(400).json({ error: "Invalid persona ID" });
      }

      const userProfile = {
        writerName: 'Writer',
        feedbackStyle: 'direct' as const,
        entryState: 'idea_only' as const,
        existingWork: [] as string[],
        immediateNeed: '',
      };
      const scriptContext = data.projectContext.script;
      const memory = await buildAgentMemoryContext(agentMemoryProvider, data.projectId, {
        message: data.message,
        surface: data.projectContext.surface?.kind === 'intake'
          ? data.projectContext.surface.surface
          : 'writing-partner',
        personaId: data.personaId,
        currentEntities: data.projectContext.characters.map(character => character.name).filter(Boolean),
      });

      const storyMemory: StoryMemory = {
        sharedMemory: [],
        project: {
          title: data.projectContext.title,
          genre: data.projectContext.genre,
          format: data.projectContext.format,
          logline: projectContextLogline(data.projectContext),
          synopsis: buildStoryMemorySynopsis(data.projectContext),
          synopsisSections: data.projectContext.synopsis.sections,
          treatment: buildStoryMemoryTreatment(data.projectContext),
          themes: data.projectContext.storyBible.themes,
        },
        surface: data.projectContext.surface,
        location: data.projectContext.location,
        script: scriptContext ? {
          excerpt: scriptContext.excerpt,
          sceneHeadings: scriptContext.sceneHeadings,
          dialogueSnippets: scriptContext.dialogueSnippets,
          actionSnippets: scriptContext.actionSnippets,
          characterNames: scriptContext.characterNames,
          facts: scriptContext.facts,
          excerptWordCount: scriptContext.excerptWordCount,
          excerptWordLimit: scriptContext.excerptWordLimit,
          excerptTruncated: scriptContext.excerptTruncated,
          totalWordCount: scriptContext.totalWordCount,
          estimatedPageCount: scriptContext.estimatedPageCount,
          sceneCount: scriptContext.sceneCount,
          contextReason: scriptContext.contextReason,
          contextLabel: scriptContext.contextLabel,
          pageRange: scriptContext.pageRange,
          selectedText: scriptContext.selectedText,
        } : undefined,
        characters: buildStoryMemoryCharacters(data.projectContext),
        outline: {
          acts: 3,
          beats: data.projectContext.beats.map((beat, i) => ({
            id: beat.id,
            act: i < 5 ? 1 : i < 12 ? 2 : 3,
            description: beat.notes ? `${beat.name}: ${beat.notes}` : `${beat.name}: ${beat.description}`,
            purpose: beat.description,
          })),
          scenes: data.projectContext.scenes,
        },
        worldRules: {
          setting: data.projectContext.world.setting,
          toneAnchors: data.projectContext.world.toneAnchors,
          rules: data.projectContext.storyBible.rules,
        },
        dialogue: {
          samples: [],
          voiceNotes: data.projectContext.world.voiceNotes,
        },
        userProfile,
        decisions: [],
      };

      // Runs alongside the main chat call, not after it: patch generation
      // reads its own document snapshot and never depends on the persona
      // reply, so there is no reason to serialize them.
      const [response, patchAttempt] = await Promise.all([
        openaiService.generatePersonaResponse(
          persona,
          data.message,
          userProfile,
          storyMemory,
          data.conversationHistory,
          data.voiceProfile,
          memory,
        ),
        attemptStructuredDocumentPatch({
          projectId: data.projectId,
          message: data.message,
          surfaceAwareness: data.projectContext.surface,
          // Zod infers `content` as optional here (z.unknown() accepts a
          // missing key, same quirk documented in shared/memoryPatches.ts);
          // the object is either absent or has all three keys from the
          // request body, so this cast is safe.
          documentSnapshot: data.documentSnapshot as { surface: StructuredDocumentSurface; revision: number; content: unknown } | undefined,
          memory,
          projectLibraryStore,
        }),
      ]);

      res.json({ ...personaResponseBody(response, memory), ...patchAttemptResponseFields(patchAttempt) });
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({ error: 'project-memory-unavailable', message: error.message });
      }
      console.error("WP chat error:", error);
      res.status(500).json({
        error: "Failed to process message",
        message: "I'm having trouble connecting right now. Please try again."
      });
    }
  });

  // OpenSwarm Writing Partner bridge — explicit opt-in, separate from /api/wp-chat
  app.post("/api/openswarm/writing-partner", async (req, res) => {
    let failureMemoryReceipt: MemoryReceipt | undefined;
    try {
      const data = openSwarmWritingPartnerSchema.parse(req.body);
      const memory = await buildAgentMemoryContext(agentMemoryProvider, data.projectId, {
        message: data.message,
        surface: 'openswarm-writing-partner',
        personaId: 'writingPartner',
        currentEntities: data.projectContext.characters.map(character => character.name).filter(Boolean),
      });
      failureMemoryReceipt = finalizeAgentMemoryText('', memory).receipt;
      const baseUrl = process.env.OPENSWARM_URL || process.env.OPEN_SWARM_URL || 'http://localhost:8080';
      const token = process.env.OPENSWARM_APP_TOKEN || process.env.OPEN_SWARM_APP_TOKEN;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let response: Response;

      try {
        response = await fetch(`${baseUrl.replace(/\/$/, '')}/open-swarm/get_response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            recipient_agent: 'Writing Partner',
            message: buildOpenSwarmWritingPartnerPrompt(data.message, data.projectContext, data.voiceProfile, memory.prompt),
            chat_history: [],
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenSwarm Writing Partner error:", response.status, errorText);
        return res.status(502).json({
          error: "OpenSwarm request failed",
          message: "OpenSwarm is reachable, but Writing Partner could not complete the request.",
          memoryReceipt: failureMemoryReceipt,
        });
      }

      const payload = await response.json() as { response?: unknown; error?: unknown };
      if (payload.error) {
        console.error("OpenSwarm Writing Partner payload error:", payload.error);
        return res.status(502).json({
          error: "OpenSwarm returned an error",
          message: "OpenSwarm Writing Partner returned an error.",
          memoryReceipt: failureMemoryReceipt,
        });
      }

      const finalized = finalizeAgentMemoryText(
        typeof payload.response === 'string' ? payload.response : "OpenSwarm Writing Partner did not return a text response.",
        memory,
      );
      res.json({ message: finalized.text, memoryReceipt: finalized.receipt });
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({ error: 'project-memory-unavailable', message: error.message });
      }
      if (error instanceof z.ZodError) {
        console.error("OpenSwarm bridge validation error:", error.flatten());
        return res.status(400).json({
          error: "Invalid OpenSwarm bridge request",
          message: "WriterOS could not build a valid OpenSwarm Writing Partner handoff packet.",
        });
      }

      console.error("OpenSwarm bridge error:", error);
      res.status(502).json({
        error: "Failed to reach OpenSwarm",
        message: "Start OpenSwarm's FastAPI server on port 8080, then try again.",
        ...(failureMemoryReceipt ? { memoryReceipt: failureMemoryReceipt } : {}),
      });
    }
  });

  // Persona capability adapter — visible WriterOS persona, hidden bounded task layer
  app.post("/api/persona-capability/run", async (req, res) => {
    try {
      const data = personaCapabilityRequestSchema.parse(req.body);
      const memory = await buildAgentMemoryContext(agentMemoryProvider, data.projectId, {
        message: data.message,
        surface: 'persona-capability',
        personaId: data.personaId,
        currentEntities: data.projectContext.characters.map(character => character.name).filter(Boolean),
      });
      const baseUrl = process.env.OPENSWARM_URL || process.env.OPEN_SWARM_URL || 'http://localhost:8080';
      const token = process.env.OPENSWARM_APP_TOKEN || process.env.OPEN_SWARM_APP_TOKEN;
      const response = await runPersonaTask(data, {
        baseUrl,
        token,
        synthesizeFinal: input => openaiService.synthesizePersonaCapabilityResponse(input),
        agentMemory: memory,
      });

      res.json(response);
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({ error: 'project-memory-unavailable', message: error.message });
      }
      if (error instanceof z.ZodError) {
        console.error("Persona capability validation error:", error.flatten());
        return res.status(400).json({
          error: "Invalid persona capability request",
          message: "WriterOS could not build a valid persona capability request.",
        });
      }

      console.error("Persona capability route error:", error instanceof Error ? error.message : error);
      res.status(502).json({
        error: "Failed to run persona capability",
        message: "Zoe could not complete that research pass right now.",
      });
    }
  });

  app.post("/api/compose-document", async (req, res) => {
    let failureMemoryReceipt: MemoryReceipt | undefined;
    try {
      const data = ComposeDocumentRequestSchema.parse(req.body);
      const memory = await buildAgentMemoryContext(agentMemoryProvider, data.projectId, {
        message: `${data.identity.title} ${data.identity.genre}`,
        surface: data.surface,
      });
      failureMemoryReceipt = finalizeAgentMemoryText('', memory).receipt;
      const result = data.surface === "treatment"
        ? await composeTreatment({ content: data.content, format: data.format, identity: data.identity, projectMemoryPrompt: memory.prompt })
        : data.surface === "synopsis"
          ? await composeSynopsis({ content: data.content, format: data.format, identity: data.identity, projectMemoryPrompt: memory.prompt })
          : await composeOutline({ content: data.content, format: data.format, identity: data.identity, projectMemoryPrompt: memory.prompt });
      if (!result.ok) {
        console.error("compose-document soft-fail:", result.reason);
        return res.status(422).json({
          error: "compose_failed", message: "WriterOS could not compose this document right now.",
          reason: "compose_failed", memoryReceipt: failureMemoryReceipt,
        });
      }
      const finalized = finalizeAgentMemoryValue(result.composed, memory);
      res.json({ composed: finalized.value, memoryReceipt: finalized.receipt });
    } catch (error) {
      if (error instanceof ProjectMemoryAgentUnavailableError) {
        return res.status(503).json({ error: 'project-memory-unavailable', message: error.message });
      }
      if (error instanceof z.ZodError) {
        console.error("compose-document validation error:", error.flatten());
        return res.status(400).json({ error: "invalid_request", message: "WriterOS could not build a valid compose request." });
      }
      console.error("compose-document route error:", error instanceof Error ? error.message : error);
      res.status(502).json({
        error: "compose_error", message: "WriterOS could not compose this document right now.",
        ...(failureMemoryReceipt ? { memoryReceipt: failureMemoryReceipt } : {}),
      });
    }
  });

  // Voice profile synthesis
  app.post("/api/voice-profile/synthesize", async (req, res) => {
    try {
      const data = voiceProfileSynthesizeSchema.parse(req.body);
      const profile = await openaiService.synthesizeVoiceProfile(data.answers);
      res.json({ profile });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "invalid_request",
          message: "answers must be a non-empty record of string → string",
        });
      }
      console.error("Voice profile synthesis error:", error);
      res.status(502).json({
        error: "synthesis_failed",
        message: error instanceof Error ? error.message : "Voice profile synthesis failed",
      });
    }
  });

  // Health check
  app.get("/api/health", async (req, res) => {
    const aiHealth = await openaiService.healthCheck();
    res.json({ 
      status: "ok", 
      ai: aiHealth.status === 'ok',
      aiService: aiHealth
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
