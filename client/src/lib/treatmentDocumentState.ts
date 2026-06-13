import type { TreatmentDocumentContent } from '../../../shared/documents'
import type { ComposeIdentity, ComposedDocument } from '../../../shared/compose/types'
import { buildTreatmentFactSheet } from '../../../shared/compose/treatmentFactSheet'
import { getTreatmentRecipe } from '../../../shared/compose/treatmentRecipe'
import { getTreatmentReadiness } from '../../../shared/compose/treatmentReadiness'
import { computeTreatmentSourceHash } from '../../../shared/compose/treatmentSourceHash'

export type TreatmentDocumentStateKind =
  | 'below_readiness' | 'ready_uncomposed' | 'fresh' | 'missing_context'
  | 'answer_stale' | 'recipe_stale' | 'flagged'

export interface TreatmentDocumentState {
  kind: TreatmentDocumentStateKind
  missingCoreLabels: string[]
  omittedSectionHeadings: string[]
  // True when act three is not yet answered (drives "The ending isn't answered yet.").
  endingMissing: boolean
  composed?: ComposedDocument
}

export function deriveTreatmentDocumentState(input: {
  content: TreatmentDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  composed: ComposedDocument | undefined
}): TreatmentDocumentState {
  const { content, format, identity, composed } = input
  const recipe = getTreatmentRecipe(format)
  const fs = buildTreatmentFactSheet(content, format)
  const readiness = getTreatmentReadiness(fs, recipe)
  const endingMissing = content.prose.actThree.trim() === ''

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

  const currentHash = computeTreatmentSourceHash(content, format, identity)
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
