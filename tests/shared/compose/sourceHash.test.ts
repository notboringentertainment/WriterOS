import { describe, expect, it } from 'vitest'
import { computeOutlineSourceHash } from '../../../shared/compose/sourceHash'
import { createEmptyOutlineContent } from '../../../shared/documents'
import { createOutlineUnit } from '../../../client/src/lib/outlineDeck'

const id = { title: 'T', genre: 'Drama' }

describe('computeOutlineSourceHash', () => {
  it('is stable for identical inputs', () => {
    const c = createEmptyOutlineContent(); c.spine.protagonist = 'Mara'
    expect(computeOutlineSourceHash(c, 'feature', id)).toBe(computeOutlineSourceHash(c, 'feature', id))
  })
  it('does not change on cosmetic trailing whitespace', () => {
    const a = createEmptyOutlineContent(); a.spine.protagonist = 'Mara'
    const b = createEmptyOutlineContent(); b.spine.protagonist = 'Mara   '
    expect(computeOutlineSourceHash(a, 'feature', id)).toBe(computeOutlineSourceHash(b, 'feature', id))
  })
  it('changes on wording change', () => {
    const a = createEmptyOutlineContent(); a.spine.protagonist = 'Mara'
    const b = createEmptyOutlineContent(); b.spine.protagonist = 'Nora'
    expect(computeOutlineSourceHash(a, 'feature', id)).not.toBe(computeOutlineSourceHash(b, 'feature', id))
  })
  it('changes on format change', () => {
    const c = createEmptyOutlineContent(); c.spine.protagonist = 'Mara'
    expect(computeOutlineSourceHash(c, 'feature', id)).not.toBe(computeOutlineSourceHash(c, 'series', id))
  })
  it('changes on identity.title change', () => {
    const c = createEmptyOutlineContent(); c.spine.protagonist = 'Mara'
    expect(computeOutlineSourceHash(c, 'feature', id)).not.toBe(
      computeOutlineSourceHash(c, 'feature', { ...id, title: 'Other' }),
    )
  })
  it('changes on identity.genre change', () => {
    const c = createEmptyOutlineContent(); c.spine.protagonist = 'Mara'
    expect(computeOutlineSourceHash(c, 'feature', id)).not.toBe(
      computeOutlineSourceHash(c, 'feature', { ...id, genre: 'Comedy' }),
    )
  })
  it('changes when the explicit role assignment changes even if the prose is the same', () => {
    const base = createEmptyOutlineContent()
    base.units = [
      { ...createOutlineUnit('feature.beat01'), whatHappens: 'A turn.' },
      { ...createOutlineUnit('feature.beat02'), whatHappens: 'A turn.' },
    ]
    const first = { ...base, featureRoleUnitIds: { midpoint: 'feature.beat01' } }
    const second = { ...base, featureRoleUnitIds: { midpoint: 'feature.beat02' } }
    expect(computeOutlineSourceHash(first, 'feature', id)).not.toBe(computeOutlineSourceHash(second, 'feature', id))
  })
})
