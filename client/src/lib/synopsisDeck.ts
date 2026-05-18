import type { ProjectFormat } from '@shared/projectFormat'
import {
  type SynopsisDocumentContent,
  createEmptySynopsisContent,
  createEmptySeriesContent,
} from '@shared/documents'

export type SynopsisDeck = 'feature' | 'series'

export type SynopsisInputKind =
  | 'text'
  | 'textarea'
  | 'comps'
  | 'series-type'
  | 'episode-length'
  | 'future-seasons'
  | 'characters'

export interface SynopsisPromptInput {
  path: string
  kind: SynopsisInputKind
  /** Sub-label rendered under composite-card questions; not shown for single-input prompts. */
  label?: string
  placeholder?: string
}

export interface SynopsisPromptDef {
  id: string
  deck: SynopsisDeck
  groupLabel: string
  question: string
  helper: string
  inputs: readonly SynopsisPromptInput[]
  /** Professional artifact label. Never rendered as the Edit View card headline. */
  documentLabel: string
}

export const FEATURE_SYNOPSIS_DECK: readonly SynopsisPromptDef[] = [
  {
    id: 'feature-title',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'What should appear as the title?',
    helper: 'Use the title you would want on a submission page.',
    inputs: [{ path: 'header.title', kind: 'text' }],
    documentLabel: 'Title',
  },
  {
    id: 'feature-writer',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'Who should be credited as the writer?',
    helper: 'Keep it exactly how you want it to appear.',
    inputs: [{ path: 'header.writer', kind: 'text' }],
    documentLabel: 'Writer',
  },
  {
    id: 'feature-genre-runtime',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'What kind of movie is this?',
    helper: 'Genre, tone, and target length if you know it.',
    inputs: [
      { path: 'header.genre', kind: 'text', label: 'Genre' },
      { path: 'header.targetRuntime', kind: 'text', label: 'Runtime' },
    ],
    documentLabel: 'Genre / Runtime',
  },
  {
    id: 'feature-comps',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'What should a reader compare it to, if anything?',
    helper: 'Optional. Use a few precise comps, not a long market paragraph.',
    inputs: [
      {
        path: 'header.comps',
        kind: 'comps',
        placeholder: 'Comma-separated comps, e.g. Hereditary, Pieces of a Woman',
      },
    ],
    documentLabel: 'Comps',
  },
  {
    id: 'feature-logline',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'Say the movie in one clean sentence.',
    helper: 'Protagonist, problem, pressure, and hook.',
    inputs: [{ path: 'logline.text', kind: 'textarea' }],
    documentLabel: 'Logline',
  },
  {
    id: 'feature-protagonist',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'Who are we following?',
    helper: 'Name them and give the one detail that makes them readable fast.',
    inputs: [{ path: 'logline.protagonist', kind: 'textarea' }],
    documentLabel: 'Protagonist',
  },
  {
    id: 'feature-goal',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'What are they chasing?',
    helper: 'The visible goal an outside reader can track.',
    inputs: [{ path: 'logline.goal', kind: 'textarea' }],
    documentLabel: 'Goal',
  },
  {
    id: 'feature-obstacle',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'What is pushing back?',
    helper: 'Person, system, force, flaw, or situation. Be specific.',
    inputs: [{ path: 'logline.obstacle', kind: 'textarea' }],
    documentLabel: 'Obstacle',
  },
  {
    id: 'feature-stakes',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'Why does it matter if they fail?',
    helper: 'The cost in human terms.',
    inputs: [{ path: 'logline.stakes', kind: 'textarea' }],
    documentLabel: 'Stakes',
  },
  {
    id: 'feature-hook',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'What makes this feel specific or urgent?',
    helper: 'The angle that makes the story feel like this movie, not a generic premise.',
    inputs: [{ path: 'logline.hook', kind: 'textarea' }],
    documentLabel: 'Hook',
  },
  {
    id: 'feature-opening',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'Where do we start, and what is already wrong?',
    helper: 'Establish the world, the lead, and the imbalance.',
    inputs: [{ path: 'prose.opening', kind: 'textarea' }],
    documentLabel: 'Opening',
  },
  {
    id: 'feature-escalation',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'What happens that forces the story forward?',
    helper: 'The event or choice that changes direction.',
    inputs: [{ path: 'prose.escalation', kind: 'textarea' }],
    documentLabel: 'Escalation',
  },
  {
    id: 'feature-middle',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'How does the situation get more complicated?',
    helper: 'Pressure, reversals, relationships, discoveries, and consequences.',
    inputs: [{ path: 'prose.middle', kind: 'textarea' }],
    documentLabel: 'Middle',
  },
  {
    id: 'feature-climax',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'What is the biggest confrontation or turn?',
    helper: 'The decisive collision before the ending.',
    inputs: [{ path: 'prose.climax', kind: 'textarea' }],
    documentLabel: 'Climax',
  },
  {
    id: 'feature-resolution',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'How does it end?',
    helper: 'Reveal the ending. Do not protect the twist from the reader here.',
    inputs: [{ path: 'prose.resolution', kind: 'textarea' }],
    documentLabel: 'Resolution',
  },
] as const

export const SERIES_SYNOPSIS_DECK: readonly SynopsisPromptDef[] = [
  {
    id: 'series-title',
    deck: 'series',
    groupLabel: 'The page',
    question: 'What should appear as the title?',
    helper: 'Use the title you would want on a pitch document.',
    inputs: [{ path: 'header.title', kind: 'text' }],
    documentLabel: 'Title',
  },
  {
    id: 'series-writer',
    deck: 'series',
    groupLabel: 'The page',
    question: 'Who should be credited as the writer?',
    helper: 'Keep it exactly how you want it to appear.',
    inputs: [{ path: 'header.writer', kind: 'text' }],
    documentLabel: 'Writer',
  },
  {
    id: 'series-genre-type-length',
    deck: 'series',
    groupLabel: 'The page',
    question: 'What kind of show is this?',
    helper: 'Genre, series type, and episode length.',
    inputs: [
      { path: 'header.genre', kind: 'text', label: 'Genre' },
      { path: 'series.seriesType', kind: 'series-type', label: 'Series type' },
      { path: 'series.episodeLength', kind: 'episode-length', label: 'Episode length' },
    ],
    documentLabel: 'Genre / Series Type / Episode Length',
  },
  {
    id: 'series-logline',
    deck: 'series',
    groupLabel: 'The promise',
    question: 'Say the show in one clean sentence.',
    helper: 'The premise, pressure, and audience promise.',
    inputs: [{ path: 'logline.text', kind: 'textarea' }],
    documentLabel: 'Series Logline',
  },
  {
    id: 'series-show-overview',
    deck: 'series',
    groupLabel: 'The show',
    question: 'What world, tone, and repeatable pressure should a buyer understand first?',
    helper: 'Explain the renewable conflict without pitching every episode.',
    inputs: [{ path: 'series.showOverview', kind: 'textarea' }],
    documentLabel: 'Show Overview',
  },
  {
    id: 'series-pilot-logline',
    deck: 'series',
    groupLabel: 'The pilot',
    question: 'What is the pilot in one sentence?',
    helper: "The first episode's central problem and hook.",
    inputs: [{ path: 'series.pilot.logline', kind: 'textarea' }],
    documentLabel: 'Pilot Logline',
  },
  {
    id: 'series-pilot-prose',
    deck: 'series',
    groupLabel: 'The pilot',
    question: 'What happens in the pilot, including the ending?',
    helper: 'Tell the complete pilot story and why episode two exists.',
    inputs: [{ path: 'series.pilot.prose', kind: 'textarea' }],
    documentLabel: 'Pilot Synopsis',
  },
  {
    id: 'series-season-arc',
    deck: 'series',
    groupLabel: 'The season',
    question: 'What changes across season one?',
    helper: 'The season question, escalation, midpoint pressure, and end state.',
    inputs: [{ path: 'series.seasonOneArc', kind: 'textarea' }],
    documentLabel: 'Season One Arc',
  },
  {
    id: 'series-future-seasons',
    deck: 'series',
    groupLabel: 'The future',
    question: 'If the show continues, where can it go?',
    helper: 'Add future-season promises only when they clarify the engine.',
    inputs: [{ path: 'series.futureSeasons', kind: 'future-seasons' }],
    documentLabel: 'Where It Goes',
  },
  {
    id: 'series-characters',
    deck: 'series',
    groupLabel: 'The people',
    question: 'Who keeps the show alive week after week?',
    helper: 'Characters, roles, pressure, and how their arcs can continue.',
    inputs: [{ path: 'series.characters', kind: 'characters' }],
    documentLabel: 'Characters',
  },
  {
    id: 'series-comps-why-now',
    deck: 'series',
    groupLabel: 'The read',
    question: 'What should a buyer compare it to, and why now?',
    helper: 'Comps plus the reason this show belongs in the market now.',
    inputs: [{ path: 'series.compsAndWhyThisShowNow', kind: 'textarea' }],
    documentLabel: 'Comps & Why This Show Now',
  },
] as const

export function getDeckForFormat(format: ProjectFormat): readonly SynopsisPromptDef[] {
  return format === 'series' ? SERIES_SYNOPSIS_DECK : FEATURE_SYNOPSIS_DECK
}

export function getMappingPaths(prompt: SynopsisPromptDef): readonly string[] {
  return prompt.inputs.map((i) => i.path)
}

export function isComposite(prompt: SynopsisPromptDef): boolean {
  return prompt.inputs.length > 1
}

export function resolveSynopsisPath(
  content: SynopsisDocumentContent,
  path: string,
): { defined: boolean; value: unknown } {
  const segments = path.split('.')
  let cursor: unknown = content
  for (const seg of segments) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return { defined: false, value: undefined }
    }
    if (!(seg in (cursor as Record<string, unknown>))) {
      return { defined: false, value: undefined }
    }
    cursor = (cursor as Record<string, unknown>)[seg]
  }
  return { defined: true, value: cursor }
}

export function synopsisProbeContent(): SynopsisDocumentContent {
  return {
    ...createEmptySynopsisContent(),
    series: createEmptySeriesContent(),
  }
}

/**
 * Build a Partial<SynopsisDocumentContent> patch that sets `value` at `path`.
 * Immutable: returns a new top-level key with all unchanged siblings preserved.
 * Series writes auto-init `content.series` from createEmptySeriesContent if absent.
 */
export function buildSynopsisPatch(
  content: SynopsisDocumentContent,
  path: string,
  value: unknown,
): Partial<SynopsisDocumentContent> {
  const segments = path.split('.')
  const topKey = segments[0] as keyof SynopsisDocumentContent

  if (segments.length === 1) {
    return { [topKey]: value } as Partial<SynopsisDocumentContent>
  }

  const seriesBase =
    topKey === 'series' ? (content.series ?? createEmptySeriesContent()) : undefined
  const base = topKey === 'series' ? seriesBase! : (content[topKey] as unknown)

  const updated = setDeep(base, segments.slice(1), value)
  return { [topKey]: updated } as Partial<SynopsisDocumentContent>
}

function setDeep(node: unknown, segments: string[], value: unknown): unknown {
  if (segments.length === 0) return value
  if (node === null || node === undefined || typeof node !== 'object') {
    throw new Error(`setDeep: cannot traverse non-object node at segment "${segments[0]}"`)
  }
  const [head, ...rest] = segments
  const obj = node as Record<string, unknown>
  return {
    ...obj,
    [head]: setDeep(obj[head], rest, value),
  }
}
