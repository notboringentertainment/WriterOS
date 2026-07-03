import { describe, expect, it } from 'vitest'
import { computeSynopsisSourceHash } from '../../../shared/compose/synopsisSourceHash'
import { createEmptySynopsisContent } from '../../../shared/documents'

const identity = { title: 'Tideline', genre: 'Thriller' }

describe('computeSynopsisSourceHash', () => {
  it('is stable for identical content', () => {
    const a = createEmptySynopsisContent(); a.logline.protagonist = 'Mara'
    const b = createEmptySynopsisContent(); b.logline.protagonist = 'Mara'
    expect(computeSynopsisSourceHash(a, 'feature', identity)).toBe(computeSynopsisSourceHash(b, 'feature', identity))
  })

  it('changes when an authored answer changes (drives answer-stale)', () => {
    const base = createEmptySynopsisContent(); base.logline.protagonist = 'Mara'
    const edited = createEmptySynopsisContent(); edited.logline.protagonist = 'Mara'; edited.prose.resolution = 'She lets go.'
    expect(computeSynopsisSourceHash(base, 'feature', identity)).not.toBe(computeSynopsisSourceHash(edited, 'feature', identity))
  })

  it('changes when identity changes', () => {
    const c = createEmptySynopsisContent(); c.logline.protagonist = 'Mara'
    expect(computeSynopsisSourceHash(c, 'feature', identity))
      .not.toBe(computeSynopsisSourceHash(c, 'feature', { title: 'Other', genre: 'Thriller' }))
  })
})
