// shared/compose/treatmentReadiness.ts
import type { FactSheet, Readiness, Recipe } from './types'
import {
  TREATMENT_CHARACTER_PREFIX,
  TREATMENT_MOVEMENT_FIELD_IDS,
} from './treatmentRecipe'

function has(fs: FactSheet, id: string): boolean {
  return fs.fields.some(f => f.id === id)
}
function hasPrefix(fs: FactSheet, prefix: string): boolean {
  return fs.fields.some(f => f.id.startsWith(prefix))
}

// Format-agnostic: one set of gates for feature and series (Resolved OQ1).
// The story-engine core gate is a disjunction (logline OR concept.premise), which the
// flat coreRequiredFieldIds list cannot express — it lives here.
export function getTreatmentReadiness(fs: FactSheet, recipe: Recipe): Readiness {
  const missingCoreLabels: string[] = []

  if (!has(fs, 'logline') && !has(fs, 'concept.premise')) {
    missingCoreLabels.push('A logline or premise')
  }
  // Custom sections are supplemental passages, not the spine; they never count here.
  const movementCount = TREATMENT_MOVEMENT_FIELD_IDS.filter(id => has(fs, id)).length
  if (movementCount < 2) {
    missingCoreLabels.push('At least two story movements')
  }
  if (missingCoreLabels.length > 0) {
    return { tier: 'sparse', missingCoreLabels, omittedSectionHeadings: [] }
  }

  // Omitted omittable sections are reported for messaging only — never tier-gated.
  const omittedSectionHeadings: string[] = []
  for (const section of recipe.sections) {
    if (!section.omittable) continue
    const present = section.importantFieldIds.some(id => has(fs, id))
      || (section.importantFieldPrefixes ?? []).some(p => hasPrefix(fs, p))
    if (!present) omittedSectionHeadings.push(section.heading)
  }

  const hasNamedCharacter = fs.fields.some(
    f => f.id.startsWith(TREATMENT_CHARACTER_PREFIX) && f.id.endsWith('.name'),
  )
  const allMovements = movementCount === TREATMENT_MOVEMENT_FIELD_IDS.length
  const tier = allMovements && hasNamedCharacter ? 'rich' : 'partial'
  return { tier, missingCoreLabels: [], omittedSectionHeadings }
}
