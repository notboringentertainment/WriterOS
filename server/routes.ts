import type { Express } from "express";
import { createServer, type Server } from "http";
import { OpenAIService } from "./ai/openaiService";
import { PERSONAS } from "@shared/personas";
import { z } from "zod";
import type { StoryMemory } from "@shared/schema";
import type { VoiceProfileDocument } from "@shared/voiceProfile";
import { personaCapabilityRequestSchema } from "@shared/personaCapability";
import { runPersonaTask } from "./persona-capability/runPersonaTask";
import { normalizeProjectFormat } from "@shared/projectFormat";

const openaiService = new OpenAIService();

// Request schemas
const chatMessageSchema = z.object({
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
  personaId: z.string(),
  message: z.string(),
  projectContext: projectContextSchema,
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

export const openSwarmWritingPartnerSchema = z.object({
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
    labeledLine('Pacing', treatment.visualAndTonal.pacing),
    labeledLine('Genre rules', treatment.visualAndTonal.genreRules),
    labeledLine('Comps or references', treatment.visualAndTonal.compsAndReferences),
  ].filter(filled);

  return [
    ...conceptLines,
    ...characterLines.map(line => `Character: ${line}`),
    ...proseLines,
    ...visualLines,
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
  voiceProfile?: VoiceProfileDocument
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
${scriptLines.length ? scriptLines.join('\n') : '- None supplied'}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Chat with persona
  app.post("/api/chat", async (req, res) => {
    try {
      const data = chatMessageSchema.parse(req.body);
      const persona = PERSONAS[data.personaId];
      
      if (!persona) {
        return res.status(400).json({ error: "Invalid persona ID" });
      }

      const response = await openaiService.generatePersonaResponse(
        persona,
        data.message,
        data.userProfile,
        data.storyMemory,
        data.conversationHistory
      );

      res.json(response);
    } catch (error) {
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
      
      const response = await openaiService.generateSynopsisAssistance(
        data.userInput,
        data.currentLogline,
        data.currentSynopsis,
        data.projectDetails,
        data.userProfile
      );

      res.json(response);
    } catch (error) {
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

      const storyMemory: StoryMemory = {
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
        script: scriptContext ? {
          excerpt: scriptContext.excerpt,
          sceneHeadings: scriptContext.sceneHeadings,
          dialogueSnippets: scriptContext.dialogueSnippets,
          actionSnippets: scriptContext.actionSnippets,
          characterNames: scriptContext.characterNames,
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
        characters: Object.fromEntries(
          data.projectContext.characters.map(character => [
            character.id,
            {
              id: character.id,
              name: character.name,
              role: character.role,
              backstory: character.wound,
              motivation: character.want || character.need,
              arc: character.arc,
            },
          ])
        ),
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

      const response = await openaiService.generatePersonaResponse(
        persona,
        data.message,
        userProfile,
        storyMemory,
        data.conversationHistory
      );

      res.json({ message: response.message, suggestions: response.suggestions });
    } catch (error) {
      console.error("WP chat error:", error);
      res.status(500).json({
        error: "Failed to process message",
        message: "I'm having trouble connecting right now. Please try again."
      });
    }
  });

  // OpenSwarm Writing Partner bridge — explicit opt-in, separate from /api/wp-chat
  app.post("/api/openswarm/writing-partner", async (req, res) => {
    try {
      const data = openSwarmWritingPartnerSchema.parse(req.body);
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
            message: buildOpenSwarmWritingPartnerPrompt(data.message, data.projectContext, data.voiceProfile),
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
        });
      }

      const payload = await response.json() as { response?: unknown; error?: unknown };
      if (payload.error) {
        console.error("OpenSwarm Writing Partner payload error:", payload.error);
        return res.status(502).json({
          error: "OpenSwarm returned an error",
          message: "OpenSwarm Writing Partner returned an error.",
        });
      }

      res.json({
        message: typeof payload.response === 'string' ? payload.response : "OpenSwarm Writing Partner did not return a text response.",
      });
    } catch (error) {
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
      });
    }
  });

  // Persona capability adapter — visible WriterOS persona, hidden bounded task layer
  app.post("/api/persona-capability/run", async (req, res) => {
    try {
      const data = personaCapabilityRequestSchema.parse(req.body);
      const baseUrl = process.env.OPENSWARM_URL || process.env.OPEN_SWARM_URL || 'http://localhost:8080';
      const token = process.env.OPENSWARM_APP_TOKEN || process.env.OPEN_SWARM_APP_TOKEN;
      const response = await runPersonaTask(data, {
        baseUrl,
        token,
        synthesizeFinal: input => openaiService.synthesizePersonaCapabilityResponse(input),
      });

      res.json(response);
    } catch (error) {
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
