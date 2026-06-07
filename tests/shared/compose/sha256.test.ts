import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../../shared/compose/sha256'

describe('sha256Hex', () => {
  it('matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('is deterministic and unicode-safe', () => {
    expect(sha256Hex('café')).toBe(sha256Hex('café'))
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
  })
  it('matches authoritative UTF-8 SHA-256 vectors (cross-env parity with Node/Web Crypto)', () => {
    // Digests produced by Node crypto over UTF-8 bytes. Proves the hand-rolled UTF-8
    // encoder (incl. surrogate pairs) matches platform crypto, so client and server agree.
    expect(sha256Hex('café')).toBe('850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e')
    expect(sha256Hex('🦄')).toBe('36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc') // 4-byte surrogate pair
    expect(sha256Hex('naïve café — 北京 🎬')).toBe('b269a1c6b537a6dd0be7f4e5614393f84ec97147a02dcebb9586d89f6d28196b')
  })
})
