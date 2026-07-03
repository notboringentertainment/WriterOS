import type { StoryBibleDocumentContent } from '@shared/documents'
import { createEmptyStoryBibleContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'

export type StoryBibleDeck = 'feature' | 'series'

export type StoryBibleInputKind =
  | 'text'
  | 'textarea'
  | 'comps'
  | 'status'
  | 'tone-words'
  | 'characters'
  | 'locks'

export interface StoryBiblePromptInput {
  path: string
  kind: StoryBibleInputKind
  /** Sub-label rendered under composite-card questions; not shown for single-input prompts. */
  label?: string
  placeholder?: string
}

export interface StoryBiblePromptDef {
  id: string
  deck: StoryBibleDeck
  groupLabel: string
  question: string
  helper: string
  inputs: readonly StoryBiblePromptInput[]
  /** Professional artifact label. Never rendered as the Edit View card headline. */
  documentLabel: string
}

interface StoryBiblePromptSeed {
  id: string
  groupLabel: string
  question: string
  helper: string
  inputs: readonly StoryBiblePromptInput[]
  documentLabel: string
}

const SHARED_STORY_BIBLE_PROMPTS: readonly StoryBiblePromptSeed[] = [
  {
    id: 'title',
    groupLabel: 'The cover',
    question: 'What should appear as the title?',
    helper: 'Use the title you would want on a pitch document.',
    inputs: [{ path: 'cover.title', kind: 'text' }],
    documentLabel: 'Title',
  },
  {
    id: 'writer',
    groupLabel: 'The cover',
    question: 'Who should be credited as the writer or creator?',
    helper: 'Keep it exactly how you want it to appear.',
    inputs: [{ path: 'cover.writer', kind: 'text' }],
    documentLabel: 'Writer',
  },
  {
    id: 'genre',
    groupLabel: 'The cover',
    question: 'What kind of project is this?',
    helper: "Genre, plus how you'd describe the format on a cover page.",
    inputs: [{ path: 'cover.genre', kind: 'text' }],
    documentLabel: 'Genre',
  },
  {
    id: 'status',
    groupLabel: 'The cover',
    question: 'Where is this bible right now?',
    helper: 'Pitch, development, production, or living canon.',
    inputs: [{ path: 'cover.status', kind: 'status' }],
    documentLabel: 'Status',
  },
  {
    id: 'clean-sentence',
    groupLabel: 'The pitch',
    question: 'Say the project in one clean sentence.',
    helper: 'The protagonist, problem, pressure, and hook.',
    inputs: [{ path: 'onePagePitch.logline', kind: 'textarea' }],
    documentLabel: 'Logline',
  },
  {
    id: 'nutshell',
    groupLabel: 'The pitch',
    question: 'What is this in a nutshell?',
    helper: 'One short paragraph an outsider could repeat back.',
    inputs: [{ path: 'onePagePitch.inANutshell', kind: 'textarea' }],
    documentLabel: 'In a nutshell',
  },
  {
    id: 'why-matters',
    groupLabel: 'The pitch',
    question: 'Why does this story matter?',
    helper: 'The personal, cultural, or emotional reason it exists.',
    inputs: [{ path: 'onePagePitch.whyThisMatters', kind: 'textarea' }],
    documentLabel: 'Why this matters',
  },
  {
    id: 'reader-promise',
    groupLabel: 'The pitch',
    question: 'What is the promise to the reader?',
    helper: 'What they should feel by the end.',
    inputs: [{ path: 'onePagePitch.corePromise', kind: 'textarea' }],
    documentLabel: 'Core promise',
  },
  {
    id: 'central-question',
    groupLabel: 'The pitch',
    question: 'What question does the story argue?',
    helper: 'The central thematic question.',
    inputs: [{ path: 'onePagePitch.centralQuestion', kind: 'textarea' }],
    documentLabel: 'Central question',
  },
  {
    id: 'different-angle',
    groupLabel: 'The pitch',
    question: 'What makes this different from things it could be confused with?',
    helper: 'The angle that makes it specific.',
    inputs: [{ path: 'onePagePitch.whatMakesItDifferent', kind: 'textarea' }],
    documentLabel: 'What makes it different',
  },
  {
    id: 'tone-words',
    groupLabel: 'The tone',
    question: 'What three to six tone words describe how this should feel?',
    helper: "Comma-separated. Match how you'd describe it to a director.",
    inputs: [{ path: 'toneAndStyle.toneWords', kind: 'tone-words' }],
    documentLabel: 'Tone words',
  },
  {
    id: 'comps',
    groupLabel: 'The tone',
    question: 'What should a reader compare it to?',
    helper: 'Optional. A few precise comps, not a market paragraph.',
    inputs: [{ path: 'toneAndStyle.comps', kind: 'comps' }],
    documentLabel: 'Comps',
  },
  {
    id: 'anti-comps',
    groupLabel: 'The tone',
    question: 'What should a reader never confuse it with?',
    helper: 'Optional. Anti-comps that frame what this is not.',
    inputs: [{ path: 'toneAndStyle.antiComps', kind: 'comps' }],
    documentLabel: 'Anti-comps',
  },
  {
    id: 'style-feel',
    groupLabel: 'The tone',
    question: 'How should the dialogue, visuals, and sound feel?',
    helper: 'One or two sentences each across dialogue, visual, and sound style.',
    inputs: [
      { path: 'toneAndStyle.dialogueStyle', kind: 'textarea', label: 'Dialogue' },
      { path: 'toneAndStyle.visualStyle', kind: 'textarea', label: 'Visuals' },
      { path: 'toneAndStyle.soundOrMusicStyle', kind: 'textarea', label: 'Sound' },
    ],
    documentLabel: 'Dialogue / Visual / Sound',
  },
  {
    id: 'tone-rules',
    groupLabel: 'The tone',
    question: 'What rules govern pacing, humor, and intensity?',
    helper: 'One short note each on pacing, humor, and violence or intensity rules.',
    inputs: [
      { path: 'toneAndStyle.pacingRules', kind: 'textarea', label: 'Pacing' },
      { path: 'toneAndStyle.humorRules', kind: 'textarea', label: 'Humor' },
      { path: 'toneAndStyle.violenceOrIntensityRules', kind: 'textarea', label: 'Intensity' },
    ],
    documentLabel: 'Pacing / Humor / Intensity',
  },
  {
    id: 'never-feel-like',
    groupLabel: 'The tone',
    question: 'What must this project never feel like?',
    helper: "The single line you'd write on a wall in the writers' room.",
    inputs: [{ path: 'toneAndStyle.mustNeverFeelLike', kind: 'textarea' }],
    documentLabel: 'Must never feel like',
  },
  {
    id: 'story-world',
    groupLabel: 'The world',
    question: 'What is the world of this story?',
    helper: 'Time, place, social texture, and the imbalance the story enters.',
    inputs: [{ path: 'premiseAndWorld.premise', kind: 'textarea' }],
    documentLabel: 'Premise',
  },
  {
    id: 'world-rules',
    groupLabel: 'The world',
    question: 'What rules govern this world?',
    helper: 'The non-negotiables. Violations break reader trust.',
    inputs: [{ path: 'premiseAndWorld.worldRules', kind: 'textarea' }],
    documentLabel: 'World rules',
  },
  {
    id: 'public-history',
    groupLabel: 'The world',
    question: "What does the public know about this world's history?",
    helper: 'The history a casual character would tell you.',
    inputs: [{ path: 'premiseAndWorld.publicHistory', kind: 'textarea' }],
    documentLabel: 'Public history',
  },
  {
    id: 'hidden-history',
    groupLabel: 'The world',
    question: 'What is hidden underneath that history?',
    helper: 'The buried truth the story uncovers.',
    inputs: [{ path: 'premiseAndWorld.hiddenHistory', kind: 'textarea' }],
    documentLabel: 'Hidden history',
  },
  {
    id: 'mythology-reveals',
    groupLabel: 'The world',
    question: 'What mythology or reveals unfold over the story?',
    helper: 'The sequence of large reveals, if any.',
    inputs: [{ path: 'premiseAndWorld.mythologyReveals', kind: 'textarea' }],
    documentLabel: 'Mythology reveals',
  },
  {
    id: 'characters',
    groupLabel: 'The people',
    question: 'Who lives in this story?',
    helper: 'Add each major character. Each character gets a small interview.',
    inputs: [{ path: 'characters', kind: 'characters' }],
    documentLabel: 'Characters',
  },
  {
    id: 'locks',
    groupLabel: 'The locks',
    question: 'What must always stay true, no matter who touches this story?',
    helper: 'Hard rules development must never violate. Retire a lock instead of deleting it when it stops being true.',
    inputs: [{ path: 'locks', kind: 'locks' }],
    documentLabel: 'Story locks',
  },
] as const

const FEATURE_STORY_BIBLE_PROMPTS: readonly StoryBiblePromptSeed[] = [
  {
    id: 'starting-state',
    groupLabel: 'The shape',
    question: 'What state is the world in when we start?',
    helper: 'The beginning balance the story disrupts.',
    inputs: [{ path: 'storyEngine.featurePropulsion', kind: 'textarea' }],
    documentLabel: 'Feature propulsion',
  },
  {
    id: 'premise-alive',
    groupLabel: 'The shape',
    question: 'What keeps the premise alive across the whole story?',
    helper: 'The renewable pressure inside the feature.',
    inputs: [{ path: 'storyEngine.whatKeepsThePremiseAlive', kind: 'textarea' }],
    documentLabel: 'What keeps the premise alive',
  },
  {
    id: 'future-potential',
    groupLabel: 'The reach',
    question: 'If this could continue, where could it go?',
    helper: 'Sequel or franchise potential. Skip if not relevant.',
    inputs: [{ path: 'storyEngine.futureSeasonPotential', kind: 'textarea' }],
    documentLabel: 'Future potential',
  },
] as const

const SERIES_STORY_BIBLE_PROMPTS: readonly StoryBiblePromptSeed[] = [
  {
    id: 'repeatable-pressure',
    groupLabel: 'The engine',
    question: 'What is the repeatable pressure that generates episodes?',
    helper: 'The renewable conflict the show keeps drawing from.',
    inputs: [{ path: 'storyEngine.seriesEngine', kind: 'textarea' }],
    documentLabel: 'Series engine',
  },
  {
    id: 'premise-renewal',
    groupLabel: 'The engine',
    question: 'What stops this premise from exhausting itself?',
    helper: 'The safeguard against running out of story.',
    inputs: [{ path: 'storyEngine.whatKeepsThePremiseAlive', kind: 'textarea' }],
    documentLabel: 'What keeps the premise alive',
  },
  {
    id: 'pilot-pressure',
    groupLabel: 'The pilot',
    question: "What is the pilot's central pressure?",
    helper: 'The specific conflict that defines episode one.',
    inputs: [{ path: 'storyEngine.pilotEngine', kind: 'textarea' }],
    documentLabel: 'Pilot engine',
  },
  {
    id: 'season-one-shape',
    groupLabel: 'The season',
    question: 'What is the shape of season one?',
    helper: 'The season question, escalation, midpoint pressure, and end state.',
    inputs: [{ path: 'storyEngine.seasonArc', kind: 'textarea' }],
    documentLabel: 'Season one arc',
  },
  {
    id: 'future-potential',
    groupLabel: 'The future',
    question: 'If the show continues, where can it go?',
    helper: 'Future-season promises only when they clarify the engine.',
    inputs: [{ path: 'storyEngine.futureSeasonPotential', kind: 'textarea' }],
    documentLabel: 'Future seasons',
  },
] as const

function buildDeck(
  deck: StoryBibleDeck,
  prompts: readonly StoryBiblePromptSeed[],
): readonly StoryBiblePromptDef[] {
  return prompts.map((prompt) => ({
    ...prompt,
    id: `${deck}-${prompt.id}`,
    deck,
  }))
}

export const FEATURE_STORY_BIBLE_DECK: readonly StoryBiblePromptDef[] = buildDeck('feature', [
  ...SHARED_STORY_BIBLE_PROMPTS,
  ...FEATURE_STORY_BIBLE_PROMPTS,
])

export const SERIES_STORY_BIBLE_DECK: readonly StoryBiblePromptDef[] = buildDeck('series', [
  ...SHARED_STORY_BIBLE_PROMPTS,
  ...SERIES_STORY_BIBLE_PROMPTS,
])

export function getDeckForFormat(format: ProjectFormat): readonly StoryBiblePromptDef[] {
  return format === 'series' ? SERIES_STORY_BIBLE_DECK : FEATURE_STORY_BIBLE_DECK
}

export function getMappingPaths(prompt: StoryBiblePromptDef): readonly string[] {
  return prompt.inputs.map((input) => input.path)
}

export function isComposite(prompt: StoryBiblePromptDef): boolean {
  return prompt.inputs.length > 1
}

export function resolveStoryBiblePath(
  content: StoryBibleDocumentContent,
  path: string,
): { defined: boolean; value: unknown } {
  const segments = path.split('.')
  let cursor: unknown = content

  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return { defined: false, value: undefined }
      }
      cursor = cursor[index]
      continue
    }

    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return { defined: false, value: undefined }
    }

    if (!(segment in (cursor as Record<string, unknown>))) {
      return { defined: false, value: undefined }
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }

  return { defined: true, value: cursor }
}

export function storyBibleProbeContent(): StoryBibleDocumentContent {
  const content = createEmptyStoryBibleContent()
  content.characters = [
    {
      id: 'character-probe',
      name: 'Probe Character',
      role: '',
      want: '',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    },
  ]
  return content
}

/**
 * Build a Partial<StoryBibleDocumentContent> patch that sets `value` at `path`.
 * Immutable: returns a new top-level key with unchanged siblings preserved.
 */
export function buildStoryBiblePatch(
  content: StoryBibleDocumentContent,
  path: string,
  value: unknown,
): Partial<StoryBibleDocumentContent> {
  const segments = path.split('.')
  const topKey = segments[0] as keyof StoryBibleDocumentContent

  if (segments.length === 1) {
    return { [topKey]: value } as Partial<StoryBibleDocumentContent>
  }

  const updated = setDeep(content[topKey], segments.slice(1), value)
  return { [topKey]: updated } as Partial<StoryBibleDocumentContent>
}

function setDeep(node: unknown, segments: string[], value: unknown): unknown {
  if (segments.length === 0) return value

  const [head, ...rest] = segments

  if (Array.isArray(node)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0 || index >= node.length) {
      throw new Error(`setDeep: cannot traverse missing array index "${head}"`)
    }
    const next = [...node]
    next[index] = setDeep(next[index], rest, value)
    return next
  }

  if (node === null || node === undefined || typeof node !== 'object') {
    throw new Error(`setDeep: cannot traverse non-object node at segment "${head}"`)
  }

  const obj = node as Record<string, unknown>
  if (!(head in obj)) {
    throw new Error(`setDeep: cannot traverse missing segment "${head}"`)
  }

  return {
    ...obj,
    [head]: setDeep(obj[head], rest, value),
  }
}
