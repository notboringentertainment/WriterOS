import { describe, expect, it } from 'vitest'
import { syntheticOutlineFeature } from './syntheticOutline'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { getOutlineReadiness } from '../../../shared/compose/readiness'
import { getOutlineRecipe } from '../../../shared/compose/recipe'

describe('syntheticOutlineFeature', () => {
  it('is rich-tier and shaped like a professional outline', () => {
    const fs = buildOutlineFactSheet(syntheticOutlineFeature, 'feature')
    expect(getOutlineReadiness(fs, getOutlineRecipe('feature')).tier).toBe('rich')
    expect(fs.fields.find(f => f.id === 'spine.protagonist')).toBeTruthy()
  })
})
