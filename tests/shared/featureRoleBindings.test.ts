import { describe, expect, it } from 'vitest'
import { createEmptyOutlineContent } from '../../shared/documents'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { resolveFeatureRoleUnitIds } from '../../shared/featureRoleBindings'

describe('resolveFeatureRoleUnitIds', () => {
  it('offers missing stock roles when a partial stock outline has no map', () => {
    const content = {
      ...createEmptyOutlineContent(),
      units: [createOutlineUnit('feature.midpoint')],
    }
    const roles = resolveFeatureRoleUnitIds(content)
    expect(roles.midpoint).toBe('feature.midpoint')
    expect(roles.climax).toBe('feature.climax')
  })

  it('uses only explicit IDs when a map is present and permits shared units', () => {
    const content = {
      ...createEmptyOutlineContent(),
      units: [createOutlineUnit('feature.beat08'), createOutlineUnit('feature.midpoint')],
      featureRoleUnitIds: { midpoint: 'feature.beat08', climax: 'feature.beat08' },
    }
    const roles = resolveFeatureRoleUnitIds(content)
    expect(roles.midpoint).toBe('feature.beat08')
    expect(roles.climax).toBe('feature.beat08')
    expect(roles.openingNormalWorld).toBeUndefined()
  })
})
