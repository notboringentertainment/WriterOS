import type { OutlineDocumentContent } from '../../../shared/documents'
import type { ComposeIdentity, ComposedDocument } from '../../../shared/compose/types'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { getOutlineRecipe } from '../../../shared/compose/recipe'
import { getOutlineReadiness } from '../../../shared/compose/readiness'
import { computeOutlineSourceHash } from '../../../shared/compose/sourceHash'

export type OutlineDocumentStateKind =
  | 'below_readiness' | 'ready_uncomposed' | 'fresh' | 'missing_context'
  | 'answer_stale' | 'recipe_stale' | 'flagged'

export interface OutlineDocumentState {
  kind: OutlineDocumentStateKind
  missingCoreLabels: string[]
  omittedSectionHeadings: string[]
  composed?: ComposedDocument
}

export function deriveOutlineDocumentState(input: {
  content: OutlineDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  composed: ComposedDocument | undefined
}): OutlineDocumentState {
  const { content, format, identity, composed } = input
  const recipe = getOutlineRecipe(format)
  const fs = buildOutlineFactSheet(content, format)
  const readiness = getOutlineReadiness(fs, recipe)

  if (!composed) {
    return readiness.tier === 'sparse'
      ? { kind: 'below_readiness', missingCoreLabels: readiness.missingCoreLabels, omittedSectionHeadings: [] }
      : { kind: 'ready_uncomposed', missingCoreLabels: [], omittedSectionHeadings: readiness.omittedSectionHeadings }
  }

  const currentHash = computeOutlineSourceHash(content, format, identity)
  if (currentHash !== composed.sourceHash) {
    return { kind: 'answer_stale', missingCoreLabels: [], omittedSectionHeadings: [], composed }
  }
  if (composed.recipeVersion !== recipe.recipeVersion) {
    return { kind: 'recipe_stale', missingCoreLabels: [], omittedSectionHeadings: [], composed }
  }
  if (composed.fidelity.status === 'flagged') {
    return { kind: 'flagged', missingCoreLabels: [], omittedSectionHeadings: [], composed }
  }
  if (readiness.tier === 'partial') {
    return { kind: 'missing_context', missingCoreLabels: [], omittedSectionHeadings: readiness.omittedSectionHeadings, composed }
  }
  return { kind: 'fresh', missingCoreLabels: [], omittedSectionHeadings: [], composed }
}
