export type FactKind = 'name' | 'number' | 'prose' | 'list'

export interface FactSheetField {
  id: string
  label: string
  kind: FactKind
  value: string
  items?: string[]
}

export interface FactSheet {
  surface: 'outline'
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
  omittable: boolean
  beats?: RecipeBeat[]
}

export interface Recipe {
  surface: 'outline'
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
  | { type: 'leadInParagraph'; lead: string; text: string; sourceFieldIds: string[] }

export type FidelityWarningKind =
  | 'missing_provenance' | 'dangling_source_id' | 'coverage' | 'entity_diff' | 'injection_echo'

export interface FidelityWarning {
  kind: FidelityWarningKind
  message: string
  blockIndex?: number
  fieldId?: string
  entity?: string
}

export interface ComposedDocument {
  schemaVersion: number
  generatedAt: string
  model: string
  recipeVersion: number
  composerVersion: number
  sourceHash: string
  format: 'feature' | 'series'
  blocks: ComposedBlock[]
  fidelity: { status: 'clean' | 'flagged'; warnings: FidelityWarning[] }
}

export const COMPOSED_SCHEMA_VERSION = 1
export const COMPOSER_VERSION = 1
