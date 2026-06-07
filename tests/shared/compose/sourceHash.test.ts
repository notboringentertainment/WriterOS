import { describe, expect, it } from 'vitest'
import { computeOutlineSourceHash } from '../../../shared/compose/sourceHash'
import { createEmptyOutlineContent } from '../../../shared/documents'

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
})
