import { describe, expect, it } from 'vitest'
import { syntheticOutlineFeature } from './syntheticOutline'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { getOutlineReadiness } from '../../../shared/compose/readiness'
import { getOutlineRecipe } from '../../../shared/compose/recipe'
import { resolveFeatureRoleUnitIds } from '../../../shared/featureRoleBindings'

describe('syntheticOutlineFeature', () => {
  it('is rich-tier and shaped like a professional outline', () => {
    const fs = buildOutlineFactSheet(syntheticOutlineFeature, 'feature', resolveFeatureRoleUnitIds(syntheticOutlineFeature))
    expect(getOutlineReadiness(fs, getOutlineRecipe('feature', resolveFeatureRoleUnitIds(syntheticOutlineFeature))).tier).toBe('rich')
    expect(fs.fields.find(f => f.id === 'spine.protagonist')).toBeTruthy()
  })
})
