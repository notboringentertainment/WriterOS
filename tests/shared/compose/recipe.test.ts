import { describe, expect, it } from 'vitest'
import { getOutlineRecipe } from '../../../shared/compose/recipe'

describe('getOutlineRecipe', () => {
  it('feature recipe has editorial sections and version 1', () => {
    const r = getOutlineRecipe('feature')
    expect(r.recipeVersion).toBe(1)
    expect(r.sections.map(s => s.heading)).toEqual(['Who We Follow', 'What Stands in the Way', 'The Shape of the Story'])
    const shape = r.sections.find(s => s.heading === 'The Shape of the Story')!
    expect(shape.style).toBe('leadIns')
    expect(shape.beats?.map(b => b.lead)).toEqual(['Where We Begin', 'Disruption', 'Point of No Return', 'Turn', 'Where It Lands'])
  })
  it('series recipe has Episode Map', () => {
    const r = getOutlineRecipe('series')
    expect(r.sections.map(s => s.heading)).toContain('Episode Map')
  })
})
