import { describe, expect, it } from 'vitest'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'

describe('HTTP request limits', () => {
  it('allows multi-megabyte WriterOS project packages', () => {
    expect(WRITEROS_JSON_BODY_LIMIT).toBe('10mb')
  })
})
