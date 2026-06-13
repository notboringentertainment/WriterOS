// shared/compose/treatmentRecipe.ts
import type { Recipe } from './types'

export const TREATMENT_RECIPE_VERSION = 1

// Dynamic-id prefixes for citation coverage (per-character, per-custom-passage).
export const TREATMENT_CHARACTER_PREFIX = 'mainCharacters.'
export const TREATMENT_CUSTOM_SECTION_PREFIX = 'prose.customSections.'

// The four story movements; the readiness spine gate counts these (custom sections
// are supplemental passages, not the spine).
export const TREATMENT_MOVEMENT_FIELD_IDS = [
  'prose.opening', 'prose.actOne', 'prose.actTwo', 'prose.actThree',
]

// Format-agnostic V1: one section list for both formats. format participates in the
// Recipe shape and the source hash only.
export function getTreatmentRecipe(format: 'feature' | 'series'): Recipe {
  return {
    surface: 'treatment', format, recipeVersion: TREATMENT_RECIPE_VERSION,
    // The story-engine disjunction (logline OR concept.premise) lives in
    // getTreatmentReadiness; a flat list cannot express it.
    coreRequiredFieldIds: [],
    sections: [
      {
        // When logline is unanswered but the premise carries the engine, the lead
        // line composes from the premise.
        key: 'logline', heading: 'Logline', style: 'prose', omittable: false,
        requiredFieldIds: [], importantFieldIds: ['logline', 'concept.premise'],
      },
      {
        key: 'concept', heading: 'Concept', style: 'prose', omittable: true,
        requiredFieldIds: [],
        importantFieldIds: ['concept.premise', 'concept.tone', 'concept.theme', 'concept.emotionalPromise'],
      },
      {
        key: 'mainCharacters', heading: 'Main Characters', style: 'prose', omittable: true,
        requiredFieldIds: [], importantFieldIds: [],
        importantFieldPrefixes: [TREATMENT_CHARACTER_PREFIX],
      },
      {
        key: 'treatmentBody', heading: 'The Story', style: 'prose', omittable: false,
        requiredFieldIds: [], importantFieldIds: [...TREATMENT_MOVEMENT_FIELD_IDS],
        importantFieldPrefixes: [TREATMENT_CUSTOM_SECTION_PREFIX],
      },
      {
        key: 'visualAndTonal', heading: 'Visual and Tonal Language', style: 'prose', omittable: true,
        requiredFieldIds: [],
        importantFieldIds: [
          'visualAndTonal.overallTone', 'visualAndTonal.visualWorld',
          'visualAndTonal.recurringImagesOrMotifs', 'visualAndTonal.musicOrSoundFeeling',
          'visualAndTonal.pacing', 'visualAndTonal.genreRules', 'visualAndTonal.compsAndReferences',
        ],
      },
    ],
  }
}
