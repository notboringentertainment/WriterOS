import { AssessmentProfile, StoryMemory, Persona } from "@shared/schema";
import type { VoiceProfileDocument } from "@shared/voiceProfile";
import type { PersonaCapabilitySynthesisInput, PersonaCapabilitySynthesisResult } from "../persona-capability/runPersonaTask";
import { buildPersonaCapabilityFallbackMessage } from "../persona-capability/fallback";
import { createModelProvider, type ModelMessage } from "./modelProvider";

const SYNTHESIS_QUESTION_LABELS: Record<string, string> = {
  q1: 'First creative impulse (character / image / question / dialogue)',
  q2: 'Writers and directors whose work matches yours, and what they do',
  q3: 'How a project started: original spark and early form',
  q4: 'An unsanitizable protagonist: worst trait and why you kept it',
  q5: 'What you build first in a new character (backstory / voice / wound / lie / face)',
  q6: 'A supporting element that refused to stay small, and why',
  q7: 'Role of humor in serious work, with a specific example',
  q8: 'Whose side you take when characters disagree — or whether you do',
  q9: 'Endings you are drawn to and endings you avoid',
  q10: 'A symbol or object that carries metaphorical weight in your work',
  q11: 'Your limit for lore / worldbuilding before it stops serving story',
  q12: 'How much real-world accuracy you demand vs. where you bend',
  q13: 'Sample action description and what you protect about your prose style',
  q14: 'A flavor of bad prose you cannot stand and why it bothers you',
  q15: 'How you handle the gap between what characters say and mean',
  q16: 'Why you write — what makes you sit down today',
  q17: 'Themes or wounds you return to without meaning to',
  q18: 'Whether your characters reflect you or are who you wish to be',
  q19: 'What kind of collaborator note makes you sit up vs. tune out',
  q20: 'What AI assistants do that drives you up a wall',
}

export function buildSynthesisPrompt(answers: Record<string, string>): string {
  const labeledAnswers = Object.entries(answers)
    .filter(([, value]) => value.trim().length > 0)
    .map(([id, answer]) => `### ${SYNTHESIS_QUESTION_LABELS[id] ?? id}\n${answer.trim()}`)
    .join('\n\n')

  return `You are synthesizing a writer's creative identity from their assessment answers. Study their answers carefully and produce a structured Voice Profile that captures how they actually work, not generic advice.

WRITER ASSESSMENT ANSWERS:
${labeledAnswers}

Return ONLY a JSON object matching this exact shape — no prose, no markdown fences.
Keep individual strings concise, and prefer 2-5 items per array unless the answers clearly justify more:
{
  "version": 1,
  "createdAt": "<ISO 8601 timestamp>",
  "updatedAt": "<ISO 8601 timestamp>",
  "displayName": "<optional: writer's name if mentioned, else omit>",
  "archetype": "<2-4 word label that captures their creative identity>",
  "coreStatement": "<one sentence: what kind of stories they write and why>",
  "creativeNorthStars": ["<principle>", "..."],
  "storytellingDNA": {
    "principles": ["<structural or thematic principle>", "..."],
    "recurringThemes": ["<theme>", "..."],
    "notes": "<freeform synthesis of their storytelling approach>"
  },
  "influences": {
    "writers": ["<name>", "..."],
    "directors": ["<name>", "..."],
    "filmsAndShows": ["<title>", "..."],
    "scenesAndLines": ["<reference>", "..."],
    "notes": "<what these influences reveal about their aesthetic>"
  },
  "characterInstincts": {
    "drawnTo": ["<character type or quality>", "..."],
    "rejects": ["<character type or quality>", "..."],
    "notes": "<how they build characters>"
  },
  "dialogue": {
    "rules": ["<dialogue principle>", "..."],
    "instinctsByMode": "<how their dialogue shifts by emotional context>",
    "avoidances": ["<what they won't do>", "..."]
  },
  "visualLanguage": {
    "instincts": ["<visual or prose instinct>", "..."],
    "notes": "<how they think about the page or screen>"
  },
  "process": {
    "whenFlowing": "<what their creative state looks like when it works>",
    "stuckPatterns": ["<what blocks them>", "..."],
    "supportNeeds": ["<what kind of help they need>", "..."]
  },
  "strengths": ["<strength>", "..."],
  "growthEdges": ["<growth area>", "..."],
  "collaborationPreferences": {
    "always": ["<what they want from collaborators>", "..."],
    "never": ["<what they don't want>", "..."],
    "feedbackStyle": "<how they best receive feedback>"
  },
  "alexCoachingNotes": ["<note for their writing coach Alex>", "..."]
}`
}

export function parseSynthesisResponse(raw: string): VoiceProfileDocument {
  let parsed: Record<string, unknown>
  try {
    parsed = parseJsonObject(raw) as Record<string, unknown>
  } catch (err) {
    console.error(
      'Voice profile synthesis JSON parse failed:',
      err instanceof Error ? err.message : err,
    )
    throw new Error('Voice profile synthesis returned invalid JSON')
  }

  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : fallback
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const obj = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}

  if (!str(parsed.archetype)) {
    throw new Error('Voice profile synthesis response missing required field: archetype')
  }
  if (!str(parsed.coreStatement)) {
    throw new Error('Voice profile synthesis response missing required field: coreStatement')
  }

  const now = new Date().toISOString()
  const dna = obj(parsed.storytellingDNA)
  const inf = obj(parsed.influences)
  const ci = obj(parsed.characterInstincts)
  const dlg = obj(parsed.dialogue)
  const vl = obj(parsed.visualLanguage)
  const proc = obj(parsed.process)
  const collab = obj(parsed.collaborationPreferences)

  return {
    version: 1,
    createdAt: str(parsed.createdAt, now),
    updatedAt: now,
    ...(str(parsed.displayName) ? { displayName: str(parsed.displayName) } : {}),
    archetype: str(parsed.archetype),
    coreStatement: str(parsed.coreStatement),
    creativeNorthStars: strArr(parsed.creativeNorthStars),
    storytellingDNA: {
      principles: strArr(dna.principles),
      recurringThemes: strArr(dna.recurringThemes),
      notes: str(dna.notes),
    },
    influences: {
      writers: strArr(inf.writers),
      directors: strArr(inf.directors),
      filmsAndShows: strArr(inf.filmsAndShows),
      scenesAndLines: strArr(inf.scenesAndLines),
      notes: str(inf.notes),
    },
    characterInstincts: {
      drawnTo: strArr(ci.drawnTo),
      rejects: strArr(ci.rejects),
      notes: str(ci.notes),
    },
    dialogue: {
      rules: strArr(dlg.rules),
      instinctsByMode: str(dlg.instinctsByMode),
      avoidances: strArr(dlg.avoidances),
    },
    visualLanguage: {
      instincts: strArr(vl.instincts),
      notes: str(vl.notes),
    },
    process: {
      whenFlowing: str(proc.whenFlowing),
      stuckPatterns: strArr(proc.stuckPatterns),
      supportNeeds: strArr(proc.supportNeeds),
    },
    strengths: strArr(parsed.strengths),
    growthEdges: strArr(parsed.growthEdges),
    collaborationPreferences: {
      always: strArr(collab.always),
      never: strArr(collab.never),
      feedbackStyle: str(collab.feedbackStyle),
    },
    alexCoachingNotes: strArr(parsed.alexCoachingNotes),
  }
}

export interface PersonaResponse {
  message: string;
  suggestions?: string[];
  storyUpdates?: Partial<StoryMemory>;
}

const PLAIN_TEXT_PERSONA_RESPONSE_RULES = `OUTPUT FORMAT RULES:
- Use plain text only for the message field.
- Do not use Markdown bold, italics, heading markers, decorative markdown, or Markdown tables.
- Simple hyphen bullets are allowed when they make the answer easier to scan.`;

export function sanitizePersonaMessageFormatting(message: unknown): string {
  if (typeof message !== 'string') return '';

  return message
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/(^|[\s([{])\*([^*\n]+?)\*([\s.,!?;:)\]}]|$)/g, '$1$2$3')
    .replace(/(^|[\s([{])_([^_\n]+?)_([\s.,!?;:)\]}]|$)/g, '$1$2$3')
    .trim();
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function truncate(value: string, max = 220): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function wordCount(value: string): number {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

export function parseJsonObject(rawContent: string | null | undefined): Record<string, any> {
  const raw = (rawContent || '{}').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) return JSON.parse(fenced[1].trim());

    const extracted = extractFirstJsonObject(raw);
    if (extracted) return JSON.parse(extracted);
    throw new Error('Invalid JSON object');
  }
}

export function extractFirstJsonObject(raw: string): string | undefined {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (start === -1) {
      if (char === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return raw.slice(start, i + 1);
  }

  return undefined;
}

const SECTION_LABELS: Record<string, string> = {
  setup: 'Setup',
  act1Break: 'Act 1 Break',
  midpoint: 'Midpoint',
  act2Break: 'Act 2 Break',
  resolution: 'Resolution',
};

const DIALOGUE_SAMPLE_LIMIT = 12;

function sectionLines(sections?: Record<string, string>): string[] {
  if (!sections) return [];
  return Object.entries(sections)
    .filter(([, value]) => filled(value))
    .map(([key, value]) => `- ${SECTION_LABELS[key] ?? key}: ${truncate(value)}`);
}

function filledCount(values: unknown[]): number {
  return values.filter(filled).length;
}

function compactList(values: string[], maxItems = 6): string {
  const filledValues = values.filter(filled);
  if (!filledValues.length) return '';
  const visible = filledValues.slice(0, maxItems).join(', ');
  const extra = filledValues.length > maxItems ? ` +${filledValues.length - maxItems} more` : '';
  return `${visible}${extra}`;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function speakerFromDialogueSample(sample: string): string {
  const match = sample.match(/^([^:]{1,60}):\s+/);
  return match ? match[1].trim() : '';
}

function requestedSpeakers(dialogueSamples: string[], characterNames: string[], userMessage: string): string[] {
  const normalizedMessage = ` ${normalizeName(userMessage)} `;
  if (!normalizedMessage.trim()) return [];

  const candidates = [
    ...characterNames,
    ...dialogueSamples.map(speakerFromDialogueSample),
  ].filter(filled);
  const seen = new Set<string>();

  return candidates.filter(candidate => {
    const normalized = normalizeName(candidate);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return normalizedMessage.includes(` ${normalized} `);
  });
}

function dialogueSpeakerCounts(dialogueSamples: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sample of dialogueSamples) {
    const speaker = normalizeName(speakerFromDialogueSample(sample));
    if (!speaker) continue;
    counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
  }
  return counts;
}

function addDialogueWindow(indices: Set<number>, center: number, sampleCount: number): void {
  const start = Math.max(0, center - 5);
  const end = Math.min(sampleCount - 1, center + 6);
  for (let i = start; i <= end; i++) indices.add(i);
}

function selectDialogueSamples(
  samples: string[],
  characterNames: string[],
  userMessage: string,
): string[] {
  // Server fallback for legacy/capped script packs; client retrieval sends focused samples when it can.
  const filledSamples = samples.filter(filled);
  const speakers = requestedSpeakers(filledSamples, characterNames, userMessage);
  if (!speakers.length) return filledSamples.slice(0, DIALOGUE_SAMPLE_LIMIT);

  const counts = dialogueSpeakerCounts(filledSamples);
  const anchorSpeaker = speakers
    .filter(speaker => (counts.get(normalizeName(speaker)) ?? 0) > 0)
    .sort((a, b) => (counts.get(normalizeName(a)) ?? 0) - (counts.get(normalizeName(b)) ?? 0))[0];

  if (!anchorSpeaker) return filledSamples.slice(0, DIALOGUE_SAMPLE_LIMIT);

  const selectedIndices = new Set<number>();
  const normalizedAnchor = normalizeName(anchorSpeaker);
  const anchorIndex = filledSamples.findIndex(sample => normalizeName(speakerFromDialogueSample(sample)) === normalizedAnchor);
  if (anchorIndex >= 0) addDialogueWindow(selectedIndices, anchorIndex, filledSamples.length);

  for (const speaker of speakers) {
    const normalizedSpeaker = normalizeName(speaker);
    const hasSpeaker = Array.from(selectedIndices).some(index => (
      normalizeName(speakerFromDialogueSample(filledSamples[index])) === normalizedSpeaker
    ));
    if (hasSpeaker) continue;

    const speakerIndex = filledSamples.findIndex(sample => normalizeName(speakerFromDialogueSample(sample)) === normalizedSpeaker);
    if (speakerIndex >= 0) addDialogueWindow(selectedIndices, speakerIndex, filledSamples.length);
  }

  return Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .slice(0, DIALOGUE_SAMPLE_LIMIT)
    .map(index => filledSamples[index]);
}

export function createWritingPartnerBrief(storyMemory: StoryMemory): string {
  const lines: string[] = [];
  const titleGenre = [
    storyMemory.project.title && `"${storyMemory.project.title}"`,
    storyMemory.project.genre,
  ].filter(Boolean).join(' | ');
  if (titleGenre) lines.push(`- Project: ${titleGenre}`);
  if (filled(storyMemory.project.format)) lines.push(`- Format: ${storyMemory.project.format}`);
  if (filled(storyMemory.project.logline)) lines.push(`- Logline: ${truncate(storyMemory.project.logline, 180)}`);

  const characterNames = compactList(Object.values(storyMemory.characters).map(character => character.name));
  if (characterNames) lines.push(`- Primary characters: ${characterNames}`);

  const script = storyMemory.script;
  const sceneCount = (script?.sceneHeadings ?? []).filter(filled).length;
  const rawScriptExcerpt = script?.excerpt;
  if (filled(rawScriptExcerpt)) {
    const excerptWords = script?.excerptWordCount ?? wordCount(rawScriptExcerpt);
    const wordLimit = script?.excerptWordLimit ?? 500;
    const capNote = script?.excerptTruncated ? `, capped at first ${wordLimit} words` : '';
    const sceneNote = sceneCount ? `, ${sceneCount} scene heading${sceneCount === 1 ? '' : 's'}` : '';
    const pageNote = script?.estimatedPageCount ? `, about ${script.estimatedPageCount} estimated page${script.estimatedPageCount === 1 ? '' : 's'}` : '';
    lines.push(`- Script: ${excerptWords} excerpt words available${capNote}${sceneNote}${pageNote}.`);
  } else if (sceneCount) {
    lines.push(`- Script: ${sceneCount} scene heading${sceneCount === 1 ? '' : 's'} available; no page excerpt packaged.`);
  }

  if (storyMemory.outline.beats.length) {
    lines.push(`- Outline: ${storyMemory.outline.beats.length} beat${storyMemory.outline.beats.length === 1 ? '' : 's'} available.`);
  }

  if (filled(storyMemory.project.treatment)) {
    lines.push('- Treatment: story prose available.');
  }

  const synopsisSectionCount = filledCount(Object.values(storyMemory.project.synopsisSections ?? {}));
  if (synopsisSectionCount) {
    lines.push(`- Synopsis: ${synopsisSectionCount} section${synopsisSectionCount === 1 ? '' : 's'} filled.`);
  } else if (filled(storyMemory.project.synopsis)) {
    lines.push('- Synopsis: summary text available.');
  }

  const storyBibleFieldCount = filledCount([
    storyMemory.worldRules.setting,
    storyMemory.worldRules.toneAnchors,
    storyMemory.worldRules.rules,
    storyMemory.project.themes,
    storyMemory.dialogue.voiceNotes,
  ]);
  if (storyBibleFieldCount) {
    lines.push(`- Story Bible: ${storyBibleFieldCount} field${storyBibleFieldCount === 1 ? '' : 's'} filled.`);
  }

  if (storyMemory.decisions.length) {
    lines.push(`- Project memory: ${storyMemory.decisions.length} decision${storyMemory.decisions.length === 1 ? '' : 's'} captured.`);
  }

  return lines.length ? `WRITING PARTNER BRIEF:\n${lines.join('\n')}` : '';
}

type ContextSection = 'brief' | 'synopsis' | 'characters' | 'outline' | 'treatment' | 'scenes' | 'storyBible';

const DEFAULT_CONTEXT_ORDER: ContextSection[] = ['brief', 'synopsis', 'characters', 'outline', 'treatment', 'scenes', 'storyBible'];

const PERSONA_CONTEXT_ORDER: Record<string, ContextSection[]> = {
  writingPartner: DEFAULT_CONTEXT_ORDER,
  sam: ['brief', 'synopsis', 'treatment', 'outline', 'characters'],
  casey: ['brief', 'characters', 'storyBible', 'scenes', 'synopsis'],
  oliver: ['brief', 'outline', 'scenes', 'synopsis'],
  maya: ['brief', 'scenes', 'characters', 'storyBible'],
  zoe: ['brief', 'storyBible', 'scenes', 'characters'],
  alex: ['brief', 'treatment', 'outline', 'scenes', 'synopsis', 'storyBible', 'characters'],
};

export function createContextSummary(storyMemory: StoryMemory, personaId = 'writingPartner', userMessage = ''): string {
  const contextOrder = PERSONA_CONTEXT_ORDER[personaId] ?? DEFAULT_CONTEXT_ORDER;
  const writingPartnerBrief = createWritingPartnerBrief(storyMemory);
  const characterLines = Object.values(storyMemory.characters)
    .filter(character => filled(character.name))
    .slice(0, 8)
    .map(character => {
      const details = [
        character.role && `role: ${character.role}`,
        character.backstory && `wound/backstory: ${character.backstory}`,
        character.motivation && `motivation: ${character.motivation}`,
        character.arc && `arc: ${character.arc}`,
      ].filter(Boolean).join('; ');
      return `- ${character.name}${details ? ` (${truncate(details, 180)})` : ''}`;
    });

  const beatLines = storyMemory.outline.beats
    .slice(0, 15)
    .map(beat => `- ${truncate(beat.description, 220)}`);

  const script = storyMemory.script;
  const scriptSceneLines = script?.sceneHeadings?.filter(filled)
    .slice(0, 12)
    .map((heading, index) => `- ${index + 1}. ${truncate(heading, 120)}`) ?? [];
  const legacySceneLines = (storyMemory.outline.scenes ?? [])
    .slice(0, 12)
    .map(scene => `- ${scene.index}. ${truncate(scene.heading, 120)}`);
  const sceneLines = scriptSceneLines.length ? scriptSceneLines : legacySceneLines;

  const rawDialogueSamples = script?.dialogueSnippets?.length ? script.dialogueSnippets : storyMemory.dialogue.samples ?? [];
  const dialogueSamples = selectDialogueSamples(rawDialogueSamples, script?.characterNames ?? [], userMessage)
    .map(sample => `- ${truncate(sample, 220)}`);
  const actionSnippets = (script?.actionSnippets ?? [])
    .filter(filled)
    .slice(0, 8)
    .map(sample => `- ${truncate(sample, 220)}`);
  const scriptCharacterNames = compactList(script?.characterNames ?? []);
  const rawScriptExcerpt = script?.excerpt;
  const scriptExcerpt = filled(rawScriptExcerpt)
    ? `SCRIPT EXCERPT (${script?.excerptWordCount ?? wordCount(rawScriptExcerpt)} words${script?.excerptTruncated ? `, first ${script?.excerptWordLimit ?? 500} words` : ''}):\n${rawScriptExcerpt}`
    : '';
  const pageRange = script?.pageRange;
  const selectedText = script?.selectedText?.trim();
  const scriptContextLine = script?.contextReason
    ? `SCRIPT CONTEXT:\n- ${[
      script.contextLabel,
      pageRange ? `estimated page${pageRange.start === pageRange.end ? '' : 's'} ${pageRange.start === pageRange.end ? pageRange.start : `${pageRange.start}-${pageRange.end}`}` : '',
      script.contextReason,
    ].filter(filled).join(' | ')}`
    : '';
  const scriptBlocks = [
    scriptContextLine,
    selectedText ? `SELECTED TEXT:\n${truncate(selectedText, 600)}` : '',
    sceneLines.length ? `SCRIPT SCENES:\n${sceneLines.join('\n')}` : '',
    scriptCharacterNames ? `SCRIPT CHARACTER NAMES:\n- ${scriptCharacterNames}` : '',
    scriptExcerpt,
    dialogueSamples.length ? `DIALOGUE SAMPLES:\n${dialogueSamples.join('\n')}` : '',
    actionSnippets.length ? `ACTION SNIPPETS:\n${actionSnippets.join('\n')}` : '',
  ].filter(Boolean);

  const synopsisLines = sectionLines(storyMemory.project.synopsisSections);
  const synopsisBlock = synopsisLines.length
    ? `SYNOPSIS SECTIONS:\n${synopsisLines.join('\n')}`
    : filled(storyMemory.project.synopsis)
      ? `SYNOPSIS:\n${truncate(storyMemory.project.synopsis, 1400)}`
      : '';
  const treatmentBlock = filled(storyMemory.project.treatment)
    ? `TREATMENT:\n${truncate(storyMemory.project.treatment, 1800)}`
    : '';
  const worldLines = [
    filled(storyMemory.worldRules.setting) && `- Setting: ${truncate(storyMemory.worldRules.setting)}`,
    filled(storyMemory.worldRules.toneAnchors) && `- Tone anchors: ${truncate(storyMemory.worldRules.toneAnchors)}`,
    filled(storyMemory.worldRules.rules) && `- Rules: ${truncate(storyMemory.worldRules.rules)}`,
    filled(storyMemory.project.themes) && `- Themes: ${truncate(storyMemory.project.themes)}`,
    filled(storyMemory.dialogue.voiceNotes) && `- Voice notes: ${truncate(storyMemory.dialogue.voiceNotes)}`,
  ].filter(Boolean);

  const sectionBlocks: Record<ContextSection, string> = {
    brief: writingPartnerBrief,
    synopsis: synopsisBlock,
    characters: characterLines.length ? `CHARACTERS:\n${characterLines.join('\n')}` : '',
    outline: beatLines.length ? `OUTLINE BEATS:\n${beatLines.join('\n')}` : '',
    treatment: treatmentBlock,
    scenes: scriptBlocks.join('\n\n'),
    storyBible: worldLines.length ? `STORY BIBLE:\n${worldLines.join('\n')}` : '',
  };

  return contextOrder.map(section => sectionBlocks[section]).filter(Boolean).join('\n\n') || 'No structured project details yet.';
}

function sourceLinesForCapability(input: PersonaCapabilitySynthesisInput): string {
  if (!input.sources.length) return '- None supplied'
  return input.sources
    .map(source => `- ${source.label}${source.url ? ` (${source.url})` : ''}`)
    .join('\n')
}

function findingLinesForCapability(input: PersonaCapabilitySynthesisInput): string {
  const verified = input.taskResult.findings
    .filter(finding => finding.verified)
    .map(finding => {
      const label = finding.sourceLabel ? ` [${finding.sourceLabel}]` : ''
      return `- ${truncate(finding.claim, 320)}${label}`
    })
  const unverified = [
    ...input.taskResult.findings
      .filter(finding => !finding.verified)
      .map(finding => finding.claim),
    ...input.taskResult.unverified,
  ].map(item => `- ${truncate(item, 240)}`)

  return [
    verified.length ? `Verified findings:\n${verified.join('\n')}` : 'Verified findings:\n- None supplied',
    unverified.length ? `Unverified notes:\n${unverified.join('\n')}` : 'Unverified notes:\n- None supplied',
    input.taskResult.missing.length
      ? `Missing / clarification notes:\n${input.taskResult.missing.map(item => `- ${truncate(item, 220)}`).join('\n')}`
      : 'Missing / clarification notes:\n- None supplied',
  ].join('\n\n')
}

function profileLinesForCapability(input: PersonaCapabilitySynthesisInput): string {
  const profile = input.voiceProfile
  if (!profile) return '- None supplied'

  return [
    profile.displayName && `- Display name: ${truncate(profile.displayName, 100)}`,
    `- Archetype: ${truncate(profile.archetype, 160)}`,
    `- Core statement: ${truncate(profile.coreStatement, 240)}`,
    profile.storytellingDNA.recurringThemes.length
      ? `- Recurring themes: ${compactList(profile.storytellingDNA.recurringThemes)}`
      : '',
    filled(profile.influences.notes) ? `- Influence notes: ${truncate(profile.influences.notes, 220)}` : '',
    profile.visualLanguage.instincts.length
      ? `- Visual instincts: ${compactList(profile.visualLanguage.instincts)}`
      : '',
    filled(profile.visualLanguage.notes) ? `- Visual notes: ${truncate(profile.visualLanguage.notes, 220)}` : '',
  ].filter(Boolean).join('\n')
}

export function buildPersonaCapabilitySynthesisPrompt(input: PersonaCapabilitySynthesisInput): string {
  const sourceLabels = input.sources.map(source => source.label).join(', ') || 'none'
  const statusNote = input.status === 'ok'
    ? 'The research pass completed.'
    : `The research pass did not complete cleanly. Status: ${input.status}${input.failureReason ? ` (${input.failureReason})` : ''}.`

  return `You are Zoe, WriterOS's world-building architect. The writer asked you a world-context research question, and WriterOS may have run a bounded research pass behind you.

User request:
${input.userRequest}

Research status:
${statusNote}

Source labels allowed in the final reply:
${sourceLabels}

Research task result:
${findingLinesForCapability(input)}

Sources:
${sourceLinesForCapability(input)}

Writer Voice Profile slice, if supplied:
${profileLinesForCapability(input)}

Project context snapshot:
- Title: ${input.projectContext.title || 'Untitled'}
- Genre: ${input.projectContext.genre || 'Not supplied'}
- Format: ${input.projectContext.format}
- Logline: ${input.projectContext.logline || input.projectContext.synopsis.logline || 'Not supplied'}
- Story Bible setting: ${input.projectContext.storyBible.world.setting || 'Not supplied'}
- Story Bible rules: ${input.projectContext.storyBible.rules || 'Not supplied'}
- Script context: ${input.projectContext.script?.contextLabel || (input.projectContext.script?.excerpt ? `${input.projectContext.script.excerptWordCount} excerpt words` : 'Not supplied')}

Rules for Zoe's final response:
- Sound like Zoe: practical, immersive, precise, and focused on how the world works on the page.
- Answer the writer directly. Do not mention OpenSwarm, assistant threads, hidden agents, or implementation details.
- If the research status is not ok, give an in-voice fallback and do not present outside facts as verified.
- Use bracketed source labels like [label] for any factual claim drawn from verified findings.
- Only cite labels from the allowed source label list. Never invent a citation.
- Do not cite Voice Profile content. It is style guidance only.
- If a note is unverified, either omit it or explicitly call it not yet verified.
- Use plain text only. Do not use Markdown bold, italics, heading markers, or decorative formatting.
- Keep the response under 350 words unless the user asked for more.

Return ONLY JSON:
{
  "finalMessage": "Zoe's final user-facing answer",
  "citedLabels": ["source labels actually cited in finalMessage"]
}`
}

export function parsePersonaCapabilitySynthesisResponse(
  rawContent: string,
  allowedSourceLabels: string[]
): PersonaCapabilitySynthesisResult {
  const parsed = parseJsonObject(rawContent)
  const finalMessage = typeof parsed.finalMessage === 'string' && parsed.finalMessage.trim()
    ? parsed.finalMessage.trim()
    : ''
  if (!finalMessage) throw new Error('Persona capability synthesis missing finalMessage')

  const allowed = new Set(allowedSourceLabels.map(label => label.toLowerCase()))
  const parsedLabels = Array.isArray(parsed.citedLabels)
    ? parsed.citedLabels.filter((label): label is string => typeof label === 'string')
    : []
  const scannedLabels = allowedSourceLabels.filter(label =>
    finalMessage.toLowerCase().includes(`[${label.toLowerCase()}]`)
  )

  const citedLabels = Array.from(new Set([...parsedLabels, ...scannedLabels]))
    .filter(label => allowed.has(label.toLowerCase()))

  return { finalMessage, citedLabels }
}

export class OpenAIService {
  private createPersonaSystemPrompt(
    persona: Persona, 
    userProfile: AssessmentProfile, 
    storyMemory: StoryMemory,
    userMessage: string
  ): string {
    const contextSummary = createContextSummary(storyMemory, persona.id, userMessage);
    const basePrompt = `You are ${persona.name}, a ${persona.role}. ${persona.personality}.

YOUR PERSONALITY TRAITS:
- Warm and encouraging, but specific and actionable
- ${userProfile.feedbackStyle === 'direct' ? 'Direct and to-the-point' : 
     userProfile.feedbackStyle === 'gentle' ? 'Gentle and supportive' : 
     'Detailed with examples'}
- Expert in: ${persona.expertise.join(', ')}
- Always address the writer as ${userProfile.writerName}
- Available specialists are Writing Partner, Sam, Casey, Oliver, Maya, Zoe, and Alex. Do not invent or refer writers to any other specialist names.

CURRENT PROJECT CONTEXT:
${storyMemory.project.title ? `Project: "${storyMemory.project.title}"` : 'New project'}
${storyMemory.project.genre ? `Genre: ${storyMemory.project.genre}` : ''}
${storyMemory.project.format ? `Format: ${storyMemory.project.format}` : ''}
${storyMemory.project.logline ? `Logline: ${storyMemory.project.logline}` : ''}
${storyMemory.project.synopsis ? `Synopsis: ${storyMemory.project.synopsis}` : ''}

STRUCTURED PROJECT MEMORY:
${contextSummary}

WRITER'S STATE: ${userProfile.entryState.replace('_', ' ')}
IMMEDIATE NEED: ${userProfile.immediateNeed}

${PLAIN_TEXT_PERSONA_RESPONSE_RULES}

EXPERTISE-SPECIFIC GUIDELINES:`;

    // Add persona-specific expertise
    switch (persona.id) {
      case 'sam':
        return `${basePrompt}
- Help craft compelling loglines (20-35 words, protagonist + conflict + stakes)
- Develop one-page synopses with clear three-act structure
- Provide pitch strategies and comparable titles
- Focus on marketability and hook strength
- Ask probing questions about the core story conflict

RESPONSE STYLE: Like a mentor who's pitched 100 scripts to studios. Warm but business-savvy.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, ask 1-2 precise questions, provide 1 concrete next step, use market-savvy phrasing, optionally suggest comparable titles)",
  "suggestions": ["2-3 specific actionable suggestions"],
  "storyUpdates": {
    "project": {"field": "updated_value"} // only include if user provided new information about title, genre, logline, etc.
  }
}`;

      case 'casey':
        return `${basePrompt}
- Dive deep into character psychology and motivation
- Explore backstory, internal conflicts, and character arcs
- Use method acting insights and psychological understanding
- Help create authentic, complex characters
- Ask about characters' deepest fears and desires

RESPONSE STYLE: Like a method actor who lives inside characters' heads. Intuitive and empathetic.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, ask 1-2 deep psychological questions, provide intuitive character insights)",
  "suggestions": ["2-3 character development suggestions"],
  "storyUpdates": {
    "characters": {"characterName": {"field": "updated_value"}} // only if user provides character info
  }
}`;

      case 'oliver':
        return `${basePrompt}
- Focus on story structure, pacing, and narrative flow
- Help with three-act structure, beat sheets, and scene organization
- Identify structural problems and suggest solutions
- Balance plot advancement with character development
- Ensure each scene serves the larger story

RESPONSE STYLE: Like a seasoned story editor who spots issues while inspiring creativity.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, ask 1-2 structural questions, provide concrete story guidance)",
  "suggestions": ["2-3 structural improvements"],
  "storyUpdates": {
    "outline": {"beats": []} // only if user provides plot/structure info
  }
}`;

      case 'maya':
        return `${basePrompt}
- Focus on dialogue, character voice, and conversation dynamics
- Help with speech patterns, subtext, and authentic character voices
- Analyze dialogue for rhythm, flow, and character differentiation
- Provide techniques from acting and screenwriting
- Ensure each character sounds unique and authentic

RESPONSE STYLE: Like a former actor who can slip into any character's voice. Intuitive about speech patterns.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, focus on voice and dialogue craft, ask about character speech patterns)",
  "suggestions": ["2-3 dialogue improvement techniques"],
  "storyUpdates": {
    "dialogue": {"samples": "example dialogue"} // only if user provides dialogue to work on
  }
}`;

      case 'zoe':
        return `${basePrompt}
- Specialize in world-building, setting creation, and consistency
- Help with fantasy/sci-fi systems, cultural rules, and immersive settings
- Focus on internal logic, believability, and rich detail
- Balance world complexity with story needs
- Ensure consistent rules and cultural authenticity

RESPONSE STYLE: Like a fantasy author who's built dozens of consistent worlds. Detail-oriented but practical.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, focus on world consistency and immersion, ask about setting details)",
  "suggestions": ["2-3 world-building improvements"],
  "storyUpdates": {
    "worldRules": {"setting": "world details"} // only if user provides world information
  }
}`;

      case 'alex':
        return `${basePrompt}
- Focus on writing process, habits, and overcoming creative blocks
- Provide encouragement and practical daily writing strategies
- Help with motivation, momentum, and sustainable writing practices
- Address writer's block, perfectionism, and productivity issues
- Keep writers moving forward with their projects

RESPONSE STYLE: Like an encouraging writing coach who's been through every creative struggle. Supportive but action-oriented.

IMPORTANT: Respond with JSON in this format:
{
  "message": "Your response (150-220 words, greet ${userProfile.writerName} by name, focus on writing process and momentum, ask about current challenges)",
  "suggestions": ["2-3 practical writing strategies"],
  "storyUpdates": {
    "decisions": [{"type": "process", "decision": "writing habit change"}] // only if user commits to process changes
  }
}`;

      default:
        return basePrompt + '\n\nIMPORTANT: Respond with JSON format: {"message": "your response", "suggestions": []}';
    }
  }

  async generatePersonaResponse(
    persona: Persona,
    userMessage: string,
    userProfile: AssessmentProfile,
    storyMemory: StoryMemory,
    conversationHistory: Array<{role: 'user' | 'assistant', content: string}>
  ): Promise<PersonaResponse> {
    try {
      const systemPrompt = this.createPersonaSystemPrompt(persona, userProfile, storyMemory, userMessage);
      
      const messages: ModelMessage[] = [
        ...conversationHistory.slice(-6).map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      const provider = createModelProvider();
      const rawContent = await provider.generateResponse({
        systemPrompt,
        messages,
        temperature: 0.7,
        maxTokens: 800,
      });
      
      try {
        const parsedResponse = parseJsonObject(rawContent);
        return {
          message: sanitizePersonaMessageFormatting(parsedResponse.message) || "I'm here to help! What would you like to work on?",
          suggestions: parsedResponse.suggestions || [],
          storyUpdates: parsedResponse.storyUpdates
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          message: sanitizePersonaMessageFormatting(rawContent) || "I'm here to help! What would you like to work on?",
          suggestions: []
        };
      }
    } catch (error) {
      console.error('AI provider error:', error);
      return {
        message: `I'm having trouble connecting right now, ${userProfile.writerName}. Let me try to help based on what we've discussed so far.`
      };
    }
  }

  private async extractStoryUpdates(
    persona: Persona,
    userMessage: string,
    aiResponse: string,
    currentStory: StoryMemory
  ): Promise<Partial<StoryMemory> | undefined> {
    // Simple extraction based on keywords - in a full implementation, this could use a separate AI call
    const updates: Partial<StoryMemory> = {};
    let hasUpdates = false;

    // Extract potential title updates
    const titleMatch = userMessage.match(/(?:title|called|name).*?["']([^"']+)["']/i) || 
                      aiResponse.match(/(?:title|called|name).*?["']([^"']+)["']/i);
    if (titleMatch && !currentStory.project.title) {
      updates.project = { ...currentStory.project, title: titleMatch[1] };
      hasUpdates = true;
    }

    // Extract potential genre updates
    const genreMatch = userMessage.match(/(?:genre|type).*?(thriller|romance|horror|comedy|drama|sci-fi|fantasy|mystery)/i);
    if (genreMatch && !currentStory.project.genre) {
      if (!updates.project) updates.project = { ...currentStory.project };
      updates.project.genre = genreMatch[1];
      hasUpdates = true;
    }

    // For Sam specifically, look for logline/synopsis content
    if (persona.id === 'sam') {
      const loglineIndicators = /(?:logline|pitch|one[- ]line|elevator pitch)/i;
      if (loglineIndicators.test(userMessage) || loglineIndicators.test(aiResponse)) {
        // Mark that logline work is in progress
        if (!updates.project) updates.project = { ...currentStory.project };
        hasUpdates = true;
      }
    }

    return hasUpdates ? updates : undefined;
  }

  async generateSynopsisAssistance(
    userInput: string,
    currentLogline: string,
    currentSynopsis: string,
    projectDetails: { title?: string; genre?: string },
    userProfile: AssessmentProfile
  ): Promise<{
    feedback: string;
    suggestions: string[];
    improvedVersion?: string;
  }> {
    const prompt = `As Sam, a synopsis specialist and warm mentor, help ${userProfile.writerName} improve their logline/synopsis.

PROJECT: ${projectDetails.title || 'Untitled'} (${projectDetails.genre || 'Genre TBD'})
CURRENT LOGLINE: ${currentLogline || 'Not written yet'}
CURRENT SYNOPSIS: ${currentSynopsis || 'Not written yet'}
USER REQUEST: ${userInput}

FEEDBACK STYLE: ${userProfile.feedbackStyle}

Provide specific, actionable feedback that feels like it comes from someone who's pitched 100 scripts. Be encouraging but business-savvy.

Respond with JSON in this format:
{
  "feedback": "Your main response to their request",
  "suggestions": ["3-4 specific actionable suggestions"],
  "improvedVersion": "If they asked for help rewriting, provide an improved version"
}`;

    try {
      const provider = createModelProvider();
      const rawContent = await provider.generateResponse({
        systemPrompt: 'You are Sam, a synopsis specialist for WriterOS. Respond only with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 800,
      });

      return parseJsonObject(rawContent) as {
        feedback: string;
        suggestions: string[];
        improvedVersion?: string;
      };
    } catch (error) {
      console.error('Synopsis assistance error:', error);
      return {
        feedback: "I'm having trouble connecting right now, but I can see you're working hard on this. Keep refining your logline - focus on the central conflict and what makes your story unique.",
        suggestions: [
          "Make sure your protagonist's goal is clear",
          "Include the central conflict or obstacle",
          "Show what's at stake if they fail",
          "Keep it under 35 words for a logline"
        ]
      };
    }
  }

  async synthesizeVoiceProfile(answers: Record<string, string>): Promise<VoiceProfileDocument> {
    const prompt = buildSynthesisPrompt(answers)
    const provider = createModelProvider()
    const rawContent = await provider.generateResponse({
      systemPrompt:
        'You are a voice profile synthesizer for WriterOS. Return ONLY a single JSON object. No prose before or after, no markdown fences, no explanations. Begin your response with `{` and end with `}`.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      maxTokens: 5000,
    })
    return parseSynthesisResponse(rawContent ?? '')
  }

  async synthesizePersonaCapabilityResponse(
    input: PersonaCapabilitySynthesisInput
  ): Promise<PersonaCapabilitySynthesisResult> {
    if (input.status !== 'ok') {
      return {
        finalMessage: buildPersonaCapabilityFallbackMessage(input.status, input.failureReason),
        citedLabels: [],
      }
    }

    try {
      const provider = createModelProvider()
      const rawContent = await provider.generateResponse({
        systemPrompt:
          'You synthesize a WriterOS capability result into Zoe’s final answer. Return ONLY JSON with finalMessage and citedLabels.',
        messages: [{ role: 'user', content: buildPersonaCapabilitySynthesisPrompt(input) }],
        temperature: 0.5,
        maxTokens: 1200,
      })

      return parsePersonaCapabilitySynthesisResponse(
        rawContent ?? '',
        input.sources.map(source => source.label)
      )
    } catch (error) {
      console.error('Persona capability synthesis error:', error instanceof Error ? error.message : error)
      return {
        finalMessage: buildPersonaCapabilityFallbackMessage(input.status, input.failureReason),
        citedLabels: [],
      }
    }
  }

  async healthCheck(): Promise<{ status: string; model: string; error?: string }> {
    try {
      const provider = createModelProvider();
      if (!provider.isConfigured()) {
        return {
          status: 'error',
          model: provider.model,
          error: `${provider.name === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} not configured`
        };
      }

      const rawContent = await provider.generateResponse({
        systemPrompt: 'Respond only with valid JSON.',
        messages: [{ role: 'user', content: 'Test connection. Respond with JSON: {"status": "ok"}' }],
        maxTokens: 50,
      });
      
      const result = parseJsonObject(rawContent);
      if (result.status !== 'ok') {
        throw new Error('AI model did not respond correctly');
      }
      
      return {
        status: 'ok',
        model: provider.model
      };
    } catch (error: any) {
      const provider = createModelProvider();
      return {
        status: 'error',
        model: provider.model,
        error: error.message
      };
    }
  }
}
