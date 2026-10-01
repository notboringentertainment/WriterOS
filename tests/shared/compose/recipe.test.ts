import { describe, expect, it } from 'vitest'
import { getOutlineRecipe } from '../../../shared/compose/recipe'
import { resolveFeatureRoleUnitIds } from '../../../shared/featureRoleBindings'
import { createOutlineUnit } from '../../../client/src/lib/outlineDeck'

describe('getOutlineRecipe', () => {
  it('feature recipe has editorial sections and version 1', () => {
    const r = getOutlineRecipe('feature', undefined)
    expect(r.recipeVersion).toBe(1)
    expect(r.sections.map(s => s.heading)).toEqual(['Who We Follow', 'What Stands in the Way', 'The Shape of the Story'])
    const shape = r.sections.find(s => s.heading === 'The Shape of the Story')!
    expect(shape.style).toBe('leadIns')
    expect(shape.beats?.map(b => b.lead)).toEqual(['Where We Begin', 'Disruption', 'Point of No Return', 'Turn', 'Where It Lands'])
  })
  it('series recipe has Episode Map', () => {
    const r = getOutlineRecipe('series', undefined)
    expect(r.sections.map(s => s.heading)).toContain('Episode Map')
  })

  it('uses the supplied role resolution for feature lead-ins and readiness', () => {
    const resolution = resolveFeatureRoleUnitIds({
      units: [createOutlineUnit('feature.beat08')],
      featureRoleUnitIds: { midpoint: 'feature.beat08' },
    })
    const recipe = getOutlineRecipe('feature', resolution)
    const shape = recipe.sections.find(section => section.key === 'shapeOfTheStory')!
    expect(shape.beats?.find(beat => beat.lead === 'Turn')?.fieldIds).toEqual(['feature.beat08.whatHappens'])
    expect(shape.importantFieldIds).toEqual(['feature.beat08.whatHappens'])
    expect(recipe.coreAlternativeFieldIds).toEqual(['feature.beat08.whatHappens'])
  })
})
