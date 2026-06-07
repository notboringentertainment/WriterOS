import { describe, expect, it } from 'vitest'
import { stableHash } from '../../../shared/compose/stableHash'

describe('stableHash', () => {
  it('is stable across key order', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }))
  })
  it('ignores trailing whitespace and CRLF (cosmetic edits do not change hash)', () => {
    expect(stableHash({ v: 'hello world' })).toBe(stableHash({ v: '  hello world  ' }))
    expect(stableHash({ v: 'a\nb' })).toBe(stableHash({ v: 'a\r\nb' }))
  })
  it('treats absent and empty-string identically', () => {
    expect(stableHash({ a: 'x', b: '' })).toBe(stableHash({ a: 'x' }))
  })
  it('DOES change on punctuation, casing, or wording', () => {
    expect(stableHash({ v: 'Hello.' })).not.toBe(stableHash({ v: 'hello.' }))
    expect(stableHash({ v: 'Hello.' })).not.toBe(stableHash({ v: 'Hello' }))
    expect(stableHash({ v: 'cat' })).not.toBe(stableHash({ v: 'dog' }))
  })
})
