import { describe, expect, it } from 'vitest'
import { normalizeProjectFormat } from '../../shared/projectFormat'

describe('normalizeProjectFormat', () => {
  it('preserves feature and series values', () => {
    expect(normalizeProjectFormat('feature')).toBe('feature')
    expect(normalizeProjectFormat('series')).toBe('series')
  })

  it('defaults empty, unknown, and non-string values to feature', () => {
    expect(normalizeProjectFormat('')).toBe('feature')
    expect(normalizeProjectFormat('pilot')).toBe('feature')
    expect(normalizeProjectFormat(undefined)).toBe('feature')
    expect(normalizeProjectFormat(null)).toBe('feature')
  })
})
