import { describe, expect, it } from 'vitest'
import { computeTreatmentSourceHash } from '../../../shared/compose/treatmentSourceHash'
import { createEmptyTreatmentContent } from '../../../shared/documents'

const identity = { title: 'Tidewrack', genre: 'Thriller' }

describe('computeTreatmentSourceHash', () => {
  it('is stable for identical content, format, and identity', () => {
    const a = createEmptyTreatmentContent()
    a.logline = 'L'
    const b = createEmptyTreatmentContent()
    b.logline = 'L'
    expect(computeTreatmentSourceHash(a, 'feature', identity))
      .toBe(computeTreatmentSourceHash(b, 'feature', identity))
  })

  it('changes when an answered field changes', () => {
    const a = createEmptyTreatmentContent()
    a.logline = 'L'
    const b = createEmptyTreatmentContent()
    b.logline = 'Different'
    expect(computeTreatmentSourceHash(a, 'feature', identity))
      .not.toBe(computeTreatmentSourceHash(b, 'feature', identity))
  })

  it('changes when the project format flips (format participates in the hash)', () => {
    const c = createEmptyTreatmentContent()
    c.logline = 'L'
    expect(computeTreatmentSourceHash(c, 'feature', identity))
      .not.toBe(computeTreatmentSourceHash(c, 'series', identity))
  })

  it('changes when identity changes', () => {
    const c = createEmptyTreatmentContent()
    c.logline = 'L'
    expect(computeTreatmentSourceHash(c, 'feature', identity))
      .not.toBe(computeTreatmentSourceHash(c, 'feature', { title: 'Other', genre: 'Thriller' }))
  })

  it('ignores excluded fields (openQuestions never affect the hash)', () => {
    const a = createEmptyTreatmentContent()
    a.logline = 'L'
    const b = createEmptyTreatmentContent()
    b.logline = 'L'
    b.openQuestions.story = ['Unresolved?']
    expect(computeTreatmentSourceHash(a, 'feature', identity))
      .toBe(computeTreatmentSourceHash(b, 'feature', identity))
  })
})
