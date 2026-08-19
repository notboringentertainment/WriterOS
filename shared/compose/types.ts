import type { UnresolvedReferenceState } from './whatsStandingReadiness'

export type FactKind = 'name' | 'number' | 'prose' | 'list'

export interface FactSheetField {
  id: string
  label: string
  kind: FactKind
  value: string
  items?: string[]
}

export type ComposeSurface = 'outline' | 'synopsis' | 'treatment' | 'whatsStanding'

export interface FactSheet {
  surface: ComposeSurface
  format: 'feature' | 'series'
  fields: FactSheetField[]
}

export interface RecipeBeat { lead: string; fieldIds: string[] }

export interface RecipeSection {
  key: string
  heading: string
  style: 'prose' | 'leadIns'
  requiredFieldIds: string[]
  importantFieldIds: string[]
  // Coverage for dynamic-id sections (per-character, per-future-season): any answered
  // fact whose id starts with one of these prefixes must be cited by some block.
  importantFieldPrefixes?: string[]
  omittable: boolean
  beats?: RecipeBeat[]
}

export interface Recipe {
  surface: ComposeSurface
  format: 'feature' | 'series'
  recipeVersion: number
  sections: RecipeSection[]
  coreRequiredFieldIds: string[]
}

export type ReadinessTier = 'sparse' | 'partial' | 'rich'
export interface Readiness {
  tier: ReadinessTier
  missingCoreLabels: string[]
  omittedSectionHeadings: string[]
}

export interface ComposeIdentity { title: string; genre: string }

export type ComposedBlock =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'divider' }
  | { type: 'meta'; text: string }
  | { type: 'logline'; text: string; sourceFieldIds: string[] }
  | { type: 'paragraph'; text: string; sourceFieldIds: string[] }
  | { type: 'leadInParagraph'; lead: string; text: string; sourceFieldIds: string[]; annotationId?: string }

export type FidelityWarningKind =
  | 'missing_provenance' | 'dangling_source_id' | 'coverage' | 'entity_diff' | 'injection_echo'
  | 'unresolved_reference'

export interface FidelityWarning {
  kind: FidelityWarningKind
  message: string
  blockIndex?: number
  fieldId?: string
  entity?: string
  /** For kind 'unresolved_reference': the structural readiness state, so consumers don't
   *  have to substring-match the message prose to tell a parked (cant-say) warning apart. */
  referenceState?: UnresolvedReferenceState
}

/**
 * Provenance for a generated run. Present only on deterministically composed documents,
 * which depend on more than the source hash: the memory revision they were taken from and
 * (once questioning lands) the annotation revision that resolved their references.
 *
 * A report is a snapshot of a moment, not a live view. Without these a reader cannot tell
 * whether what they are holding is current, which is the failure mode the report exists to
 * prevent in the first place.
 */
export interface ComposedRun {
  runId: string
  snapshotRevision: number
  annotationRevision?: number
}

export interface ComposedDocument {
  schemaVersion: number
  generatedAt: string
  /** null for deterministic composition, where no model was involved. */
  model: string | null
  recipeVersion: number
  composerVersion: number
  sourceHash: string
  format: 'feature' | 'series'
  blocks: ComposedBlock[]
  fidelity: { status: 'clean' | 'flagged'; warnings: FidelityWarning[] }
  run?: ComposedRun
}

export const COMPOSED_SCHEMA_VERSION = 1
export const COMPOSER_VERSION = 1
