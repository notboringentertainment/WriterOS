import type { SynopsisDocumentContent, SynopsisSeriesContent } from '@shared/documents'

export interface FeatureReadinessCheck {
  id: keyof SynopsisDocumentContent['qa']
  question: string
}

export const FEATURE_READINESS_CHECKS: readonly FeatureReadinessCheck[] = [
  { id: 'protagonistNamedEarly', question: 'Can a reader name the lead early?' },
  { id: 'goalClear', question: 'Can a reader tell what the lead wants?' },
  { id: 'obstacleClear', question: 'Can a reader tell what is pushing back?' },
  { id: 'stakesClear', question: 'Can a reader feel the cost of failure?' },
  { id: 'endingRevealed', question: 'Does the synopsis reveal the ending?' },
  { id: 'paragraphsConnectCausally', question: 'Does each paragraph cause the next?' },
  { id: 'toneMatchesProject', question: 'Does the tone sound like the movie?' },
  {
    id: 'noUnnecessarySubplot',
    question: 'Have you cut backstory or subplots that do not help the main read?',
  },
] as const

export interface DerivedReadinessCheck {
  id: string
  question: string
  satisfied: boolean
}

function isFilled(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Derive series readiness checks from authored series content. V1 has no
 * stored `seriesQa` — readiness is inferred from whether each canonical
 * field carries authored text. UI must render these as plain-language
 * questions, never as professional schema names.
 */
export function deriveSeriesReadiness(
  content: SynopsisDocumentContent,
): readonly DerivedReadinessCheck[] {
  const series: SynopsisSeriesContent | undefined = content.series

  return [
    {
      id: 'series-logline-clear',
      question: 'Can a reader understand the show in one sentence?',
      satisfied: isFilled(content.logline?.text),
    },
    {
      id: 'series-engine-clear',
      question: 'Is the repeatable engine clear?',
      satisfied: isFilled(series?.showOverview),
    },
    {
      id: 'series-pilot-complete',
      question: 'Does the pilot sound like a complete first episode?',
      satisfied: isFilled(series?.pilot?.logline) && isFilled(series?.pilot?.prose),
    },
    {
      id: 'series-season-shape',
      question: 'Does season one have a visible shape?',
      satisfied: isFilled(series?.seasonOneArc),
    },
    {
      id: 'series-characters-sustain',
      question: 'Can the characters sustain recurring pressure?',
      satisfied: (series?.characters?.length ?? 0) > 0,
    },
    {
      id: 'series-why-this-why-now',
      question: 'Does the pitch explain why this show, why now?',
      satisfied: isFilled(series?.compsAndWhyThisShowNow),
    },
  ]
}
