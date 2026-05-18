import type { ProjectFormat } from '@shared/projectFormat'
import {
  type SynopsisDocumentContent,
  createEmptySynopsisContent,
  createEmptySeriesContent,
} from '@shared/documents'

export type SynopsisDeck = 'feature' | 'series'

export interface SynopsisPromptDef {
  id: string
  deck: SynopsisDeck
  groupLabel: string
  question: string
  helper: string
  placeholder?: string
  mappingPath: string | readonly string[]
  documentLabel: string
}

export const FEATURE_SYNOPSIS_DECK: readonly SynopsisPromptDef[] = [
  {
    id: 'feature-title',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'What should appear as the title?',
    helper: 'Use the title you would want on a submission page.',
    mappingPath: 'header.title',
    documentLabel: 'Title',
  },
  {
    id: 'feature-writer',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'Who should be credited as the writer?',
    helper: 'Keep it exactly how you want it to appear.',
    mappingPath: 'header.writer',
    documentLabel: 'Writer',
  },
  {
    id: 'feature-genre-runtime',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'What kind of movie is this?',
    helper: 'Genre, tone, and target length if you know it.',
    mappingPath: ['header.genre', 'header.targetRuntime'],
    documentLabel: 'Genre / Runtime',
  },
  {
    id: 'feature-comps',
    deck: 'feature',
    groupLabel: 'The page',
    question: 'What should a reader compare it to, if anything?',
    helper: 'Optional. Use a few precise comps, not a long market paragraph.',
    mappingPath: 'header.comps',
    documentLabel: 'Comps',
  },
  {
    id: 'feature-logline',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'Say the movie in one clean sentence.',
    helper: 'Protagonist, problem, pressure, and hook.',
    mappingPath: 'logline.text',
    documentLabel: 'Logline',
  },
  {
    id: 'feature-protagonist',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'Who are we following?',
    helper: 'Name them and give the one detail that makes them readable fast.',
    mappingPath: 'logline.protagonist',
    documentLabel: 'Protagonist',
  },
  {
    id: 'feature-goal',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'What are they chasing?',
    helper: 'The visible goal an outside reader can track.',
    mappingPath: 'logline.goal',
    documentLabel: 'Goal',
  },
  {
    id: 'feature-obstacle',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'What is pushing back?',
    helper: 'Person, system, force, flaw, or situation. Be specific.',
    mappingPath: 'logline.obstacle',
    documentLabel: 'Obstacle',
  },
  {
    id: 'feature-stakes',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'Why does it matter if they fail?',
    helper: 'The cost in human terms.',
    mappingPath: 'logline.stakes',
    documentLabel: 'Stakes',
  },
  {
    id: 'feature-hook',
    deck: 'feature',
    groupLabel: 'The promise',
    question: 'What makes this feel specific or urgent?',
    helper: 'The angle that makes the story feel like this movie, not a generic premise.',
    mappingPath: 'logline.hook',
    documentLabel: 'Hook',
  },
  {
    id: 'feature-opening',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'Where do we start, and what is already wrong?',
    helper: 'Establish the world, the lead, and the imbalance.',
    mappingPath: 'prose.opening',
    documentLabel: 'Opening',
  },
  {
    id: 'feature-escalation',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'What happens that forces the story forward?',
    helper: 'The event or choice that changes direction.',
    mappingPath: 'prose.escalation',
    documentLabel: 'Escalation',
  },
  {
    id: 'feature-middle',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'How does the situation get more complicated?',
    helper: 'Pressure, reversals, relationships, discoveries, and consequences.',
    mappingPath: 'prose.middle',
    documentLabel: 'Middle',
  },
  {
    id: 'feature-climax',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'What is the biggest confrontation or turn?',
    helper: 'The decisive collision before the ending.',
    mappingPath: 'prose.climax',
    documentLabel: 'Climax',
  },
  {
    id: 'feature-resolution',
    deck: 'feature',
    groupLabel: 'The story',
    question: 'How does it end?',
    helper: 'Reveal the ending. Do not protect the twist from the reader here.',
    mappingPath: 'prose.resolution',
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
    mappingPath: 'header.title',
    documentLabel: 'Title',
  },
  {
    id: 'series-writer',
    deck: 'series',
    groupLabel: 'The page',
    question: 'Who should be credited as the writer?',
    helper: 'Keep it exactly how you want it to appear.',
    mappingPath: 'header.writer',
    documentLabel: 'Writer',
  },
  {
    id: 'series-genre-type-length',
    deck: 'series',
    groupLabel: 'The page',
    question: 'What kind of show is this?',
    helper: 'Genre, series type, and episode length.',
    mappingPath: ['header.genre', 'series.seriesType', 'series.episodeLength'],
    documentLabel: 'Genre / Series Type / Episode Length',
  },
  {
    id: 'series-logline',
    deck: 'series',
    groupLabel: 'The promise',
    question: 'Say the show in one clean sentence.',
    helper: 'The premise, pressure, and audience promise.',
    mappingPath: 'logline.text',
    documentLabel: 'Series Logline',
  },
  {
    id: 'series-show-overview',
    deck: 'series',
    groupLabel: 'The show',
    question: 'What world, tone, and repeatable pressure should a buyer understand first?',
    helper: 'Explain the renewable conflict without pitching every episode.',
    mappingPath: 'series.showOverview',
    documentLabel: 'Show Overview',
  },
  {
    id: 'series-pilot-logline',
    deck: 'series',
    groupLabel: 'The pilot',
    question: 'What is the pilot in one sentence?',
    helper: "The first episode's central problem and hook.",
    mappingPath: 'series.pilot.logline',
    documentLabel: 'Pilot Logline',
  },
  {
    id: 'series-pilot-prose',
    deck: 'series',
    groupLabel: 'The pilot',
    question: 'What happens in the pilot, including the ending?',
    helper: 'Tell the complete pilot story and why episode two exists.',
    mappingPath: 'series.pilot.prose',
    documentLabel: 'Pilot Synopsis',
  },
  {
    id: 'series-season-arc',
    deck: 'series',
    groupLabel: 'The season',
    question: 'What changes across season one?',
    helper: 'The season question, escalation, midpoint pressure, and end state.',
    mappingPath: 'series.seasonOneArc',
    documentLabel: 'Season One Arc',
  },
  {
    id: 'series-future-seasons',
    deck: 'series',
    groupLabel: 'The future',
    question: 'If the show continues, where can it go?',
    helper: 'Add future-season promises only when they clarify the engine.',
    mappingPath: 'series.futureSeasons',
    documentLabel: 'Where It Goes',
  },
  {
    id: 'series-characters',
    deck: 'series',
    groupLabel: 'The people',
    question: 'Who keeps the show alive week after week?',
    helper: 'Characters, roles, pressure, and how their arcs can continue.',
    mappingPath: 'series.characters',
    documentLabel: 'Characters',
  },
  {
    id: 'series-comps-why-now',
    deck: 'series',
    groupLabel: 'The read',
    question: 'What should a buyer compare it to, and why now?',
    helper: 'Comps plus the reason this show belongs in the market now.',
    mappingPath: 'series.compsAndWhyThisShowNow',
    documentLabel: 'Comps & Why This Show Now',
  },
] as const

export function getDeckForFormat(format: ProjectFormat): readonly SynopsisPromptDef[] {
  return format === 'series' ? SERIES_SYNOPSIS_DECK : FEATURE_SYNOPSIS_DECK
}

export function getMappingPaths(prompt: SynopsisPromptDef): readonly string[] {
  return Array.isArray(prompt.mappingPath) ? prompt.mappingPath : [prompt.mappingPath as string]
}

export function isComposite(prompt: SynopsisPromptDef): boolean {
  return Array.isArray(prompt.mappingPath) && prompt.mappingPath.length > 1
}

/**
 * Resolve a dot-path against a SynopsisDocumentContent shape that includes a
 * non-empty `series` block. Used by tests to verify every deck mappingPath
 * lands on a defined schema leaf.
 */
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
