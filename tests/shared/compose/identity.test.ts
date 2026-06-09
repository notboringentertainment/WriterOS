import { describe, expect, it } from 'vitest'
import { IDENTITY_ALLOWLIST, pickIdentity } from '../../../shared/compose/identity'

describe('pickIdentity', () => {
  it('includes only allowlisted identity fields', () => {
    expect(IDENTITY_ALLOWLIST).toEqual(['title', 'genre'])
    const id = pickIdentity({ title: 'My Film', genre: 'Drama', format: 'feature', wordCount: 0 } as never)
    expect(id).toEqual({ title: 'My Film', genre: 'Drama' })
  })
  it('coerces missing fields to empty strings', () => {
    expect(pickIdentity({} as never)).toEqual({ title: '', genre: '' })
  })
})
