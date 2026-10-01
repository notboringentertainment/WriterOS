import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { beatKey, isBeatSheetDeclared, parseBeatSheetDecision } from '../../shared/beatSheet'

const fixture = readFileSync(path.join(__dirname, '../fixtures/beatSheet/synthetic-beat-sheet.md'), 'utf8')

describe('parseBeatSheetDecision', () => {
  it('splits the playing order into keyed beats with movement and full body', () => {
    const result = parseBeatSheetDecision(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('pilot')
    expect(result.beats.map(b => b.key)).toEqual(['beat.cold-open-the-harbour', 'beat.the-dinner', 'beat.the-second-dinner'])
    expect(result.beats[0]).toMatchObject({ number: 1, title: 'Cold open: the harbour.', movement: 'Movement one — Arrival' })
    expect(result.beats[0].body).toBe('Night. A ferry docks late. Nobody is waiting. The harbour master counts cars.')
    expect(result.beats[2].movement).toBe('Movement two — The turn')
  })

  it('stops at the next ### heading', () => {
    const result = parseBeatSheetDecision(fixture)
    expect(result.ok && result.beats).toHaveLength(3)
  })

  it('refuses two beats with the same title and names it', () => {
    const dup = fixture.replace('**The second dinner.**', '**The dinner.**')
    const result = parseBeatSheetDecision(dup)
    expect(result).toMatchObject({ ok: false, reason: 'duplicate-title' })
    expect(!result.ok && result.message).toContain('The dinner.')
  })

  it('refuses a file with no Answer section', () => {
    const result = parseBeatSheetDecision('# T\ntype: grill\nresolved: 2026-01-01\n\n## Question\n\nq\n')
    expect(result).toMatchObject({ ok: false, reason: 'no-answer' })
  })

  it('refuses an Answer without a Playing order', () => {
    const result = parseBeatSheetDecision('# T\nresolved: 2026-01-01\n\n## Answer\n\nProse only.\n')
    expect(result).toMatchObject({ ok: false, reason: 'no-playing-order' })
  })

  it('refuses a Playing order with no bold-titled numbered beats', () => {
    const result = parseBeatSheetDecision('# T\nresolved: 2026-01-01\n\n## Answer\n\n### Playing order\n\n1. plain line\n')
    expect(result).toMatchObject({ ok: false, reason: 'no-beats' })
  })

  it('refuses a file that is not resolved', () => {
    const unresolved = fixture.replace('resolved: 2026-01-12\n', '')
    expect(parseBeatSheetDecision(unresolved)).toMatchObject({ ok: false, reason: 'not-resolved' })
  })

  it('keeps sub-items (a., b.) inside the parent beat body', () => {
    const md = '# T\nresolved: 2026-01-01\n\n## Answer\n\n### Playing order\n\n1. **The kitchen.** In this order:\n   a. First.\n   b. Second.\n'
    const result = parseBeatSheetDecision(md)
    expect(result.ok && result.beats[0].body).toBe('In this order: a. First. b. Second.')
  })
})

describe('beatKey', () => {
  it('slugs the title deterministically', () => {
    expect(beatKey("The chef's kitchen.")).toBe('beat.the-chef-s-kitchen')
    expect(beatKey("The chef's kitchen.")).toBe('beat.the-chef-s-kitchen')
  })
})

describe('isBeatSheetDeclared', () => {
  it('finds the header line only in the header block', () => {
    expect(isBeatSheetDeclared(fixture)).toBe(true)
    expect(isBeatSheetDeclared('# T\n\n## Answer\n\nbeat-sheet: no\n')).toBe(false)
  })
})
