import { describe, expect, it } from 'vitest'
import { getTreatmentRecipe, TREATMENT_RECIPE_VERSION } from '../../../shared/compose/treatmentRecipe'

describe('getTreatmentRecipe', () => {
  it('emits the five pinned sections in order with professional headings', () => {
    const recipe = getTreatmentRecipe('feature')
    expect(recipe.surface).toBe('treatment')
    expect(recipe.format).toBe('feature')
    expect(recipe.recipeVersion).toBe(TREATMENT_RECIPE_VERSION)
    expect(recipe.coreRequiredFieldIds).toEqual([])
    expect(recipe.sections.map(s => s.key)).toEqual([
      'logline', 'concept', 'mainCharacters', 'treatmentBody', 'visualAndTonal',
    ])
    expect(recipe.sections.map(s => s.heading)).toEqual([
      'Logline', 'Concept', 'Main Characters', 'The Story', 'Visual and Tonal Language',
    ])
  })

  it('logline section is non-omittable and draws from logline plus premise fallback', () => {
    const s = getTreatmentRecipe('feature').sections[0]
    expect(s.omittable).toBe(false)
    expect(s.style).toBe('prose')
    expect(s.importantFieldIds).toEqual(['logline', 'concept.premise'])
  })

  it('concept and visualAndTonal sections are omittable with their pinned important fields', () => {
    const recipe = getTreatmentRecipe('feature')
    const concept = recipe.sections.find(s => s.key === 'concept')!
    expect(concept.omittable).toBe(true)
    expect(concept.importantFieldIds).toEqual([
      'concept.premise', 'concept.tone', 'concept.theme', 'concept.emotionalPromise',
    ])
    const visual = recipe.sections.find(s => s.key === 'visualAndTonal')!
    expect(visual.omittable).toBe(true)
    expect(visual.importantFieldIds).toEqual([
      'visualAndTonal.overallTone', 'visualAndTonal.visualWorld',
      'visualAndTonal.recurringImagesOrMotifs', 'visualAndTonal.musicOrSoundFeeling',
      'visualAndTonal.pacing', 'visualAndTonal.genreRules', 'visualAndTonal.compsAndReferences',
    ])
  })

  it('mainCharacters is omittable and prefix-covered; treatmentBody is non-omittable with movement ids plus custom-passage prefix', () => {
    const recipe = getTreatmentRecipe('feature')
    const chars = recipe.sections.find(s => s.key === 'mainCharacters')!
    expect(chars.omittable).toBe(true)
    expect(chars.importantFieldPrefixes).toEqual(['mainCharacters.'])
    const body = recipe.sections.find(s => s.key === 'treatmentBody')!
    expect(body.omittable).toBe(false)
    expect(body.importantFieldIds).toEqual([
      'prose.opening', 'prose.actOne', 'prose.actTwo', 'prose.actThree',
    ])
    expect(body.importantFieldPrefixes).toEqual(['prose.customSections.'])
  })

  it('series recipe carries format but is otherwise identical to feature (format-agnostic V1)', () => {
    const feature = getTreatmentRecipe('feature')
    const series = getTreatmentRecipe('series')
    expect(series.format).toBe('series')
    expect(series.sections).toEqual(feature.sections)
    expect(series.coreRequiredFieldIds).toEqual(feature.coreRequiredFieldIds)
    expect(series.recipeVersion).toBe(feature.recipeVersion)
  })
})
