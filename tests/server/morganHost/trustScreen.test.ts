// @vitest-environment node
import { readFileSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { describe, expect, it } from 'vitest'
import { detectTrustScreen, normalizeTrustScreen } from '../../../server/morganHost/morganSession'

describe('folder-trust screen detection', () => {
  it('detects captured Claude output accumulated in 64-byte chunks', () => {
    const raw = readFileSync(new URL('../../fixtures/morgan/claude-trust-screen.raw.txt', import.meta.url))
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    let detected = false
    for (let offset = 0; offset < raw.length; offset += 64) {
      buffer = (buffer + decoder.write(raw.subarray(offset, offset + 64))).slice(-8192)
      detected ||= detectTrustScreen(buffer)
    }
    buffer += decoder.end()
    expect(detected).toBe(true)
    expect(detectTrustScreen(buffer)).toBe(true)
  })

  it('turns cursor columns and forward movements into spaces before stripping other escapes', () => {
    expect(normalizeTrustScreen('Quick\x1b[8Gsafety\x1b[1Ccheck:\x1b[0m')).toBe('Quick safety check:')
  })

  it('also recognizes words without whitespace', () => {
    expect(detectTrustScreen('Quicksafetycheck:')).toBe(true)
    expect(detectTrustScreen('Yes,Itrustthisfolder')).toBe(true)
    expect(detectTrustScreen('YesItrustthisfolder')).toBe(true)
  })

  it('does not mistake ordinary output for the trust screen', () => {
    expect(detectTrustScreen('\x1b[32mReading project files...\x1b[0m\nSafety checks passed. Ready.')).toBe(false)
  })
})
