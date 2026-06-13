import type { SynopsisDocumentContent } from '../../../shared/documents'
import type { ComposeIdentity, ComposedDocument } from '../../../shared/compose/types'
import { buildSynopsisFactSheet } from '../../../shared/compose/synopsisFactSheet'
import { getSynopsisRecipe } from '../../../shared/compose/synopsisRecipe'
import { getSynopsisReadiness } from '../../../shared/compose/synopsisReadiness'
import { computeSynopsisSourceHash } from '../../../shared/compose/synopsisSourceHash'

export type SynopsisDocumentStateKind =
  | 'below_readiness' | 'ready_uncomposed' | 'fresh' | 'missing_context'
  | 'answer_stale' | 'recipe_stale' | 'flagged'

export interface SynopsisDocumentState {
  kind: SynopsisDocumentStateKind
  missingCoreLabels: string[]
  omittedSectionHeadings: string[]
  // True when the known ending is not yet answered (drives the missing-context note).
  endingMissing: boolean
  composed?: ComposedDocument
}

// The ending fact differs by format: feature resolution vs the pilot synopsis for series.
function isEndingMissing(content: SynopsisDocumentContent, format: 'feature' | 'series'): boolean {
  if (format === 'feature') return content.prose.resolution.trim() === ''
  return (content.series?.pilot.prose ?? '').trim() === ''
}

export function deriveSynopsisDocumentState(input: {
  content: SynopsisDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  composed: ComposedDocument | undefined
}): SynopsisDocumentState {
  const { content, format, identity, composed } = input
  const recipe = getSynopsisRecipe(format)
  const fs = buildSynopsisFactSheet(content, format)
  const readiness = getSynopsisReadiness(fs, recipe)
  const endingMissing = isEndingMissing(content, format)

  // The readiness gate outranks staleness: if answers drop below the gate after a
  // compose, Recompose must disable rather than POST sparse content (authored content
  // is the only canon — a composed artifact it no longer supports does not keep the
  // gate open).
  if (readiness.tier === 'sparse') {
    return { kind: 'below_readiness', missingCoreLabels: readiness.missingCoreLabels, omittedSectionHeadings: [], endingMissing }
  }

  if (!composed) {
    return { kind: 'ready_uncomposed', missingCoreLabels: [], omittedSectionHeadings: readiness.omittedSectionHeadings, endingMissing }
  }

  const currentHash = computeSynopsisSourceHash(content, format, identity)
  if (currentHash !== composed.sourceHash) {
    return { kind: 'answer_stale', missingCoreLabels: [], omittedSectionHeadings: [], endingMissing, composed }
  }
  if (composed.recipeVersion !== recipe.recipeVersion) {
    return { kind: 'recipe_stale', missingCoreLabels: [], omittedSectionHeadings: [], endingMissing, composed }
  }
  if (composed.fidelity.status === 'flagged') {
    return { kind: 'flagged', missingCoreLabels: [], omittedSectionHeadings: [], endingMissing, composed }
  }
  if (readiness.tier === 'partial') {
    return { kind: 'missing_context', missingCoreLabels: [], omittedSectionHeadings: readiness.omittedSectionHeadings, endingMissing, composed }
  }
  return { kind: 'fresh', missingCoreLabels: [], omittedSectionHeadings: [], endingMissing, composed }
}
