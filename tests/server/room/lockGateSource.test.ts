import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression guard (Codex review): the lock-gate cache key separator was once
// written as literal NUL bytes in the source file. Control characters in
// source break diff tools and editors silently; separators must be escape
// sequences. Tab/LF/CR are the only control bytes allowed in source.
describe('lockGate source hygiene', () => {
  it('contains no literal control bytes', () => {
    const source = readFileSync(resolve(__dirname, '../../../server/room/lockGate.ts'), 'utf8')
    const forbidden = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]')
    expect(forbidden.test(source)).toBe(false)
  })

  it('this test file itself contains no literal control bytes', () => {
    const source = readFileSync(__filename, 'utf8')
    const forbidden = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]')
    expect(forbidden.test(source)).toBe(false)
  })
})
