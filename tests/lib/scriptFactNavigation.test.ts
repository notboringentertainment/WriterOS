import { describe, it, expect } from 'vitest'
import {
  liveScriptBlocksFromDoc,
  resolveFactOccurrences,
  type DocLike,
} from '../../client/src/lib/scriptFactNavigation'

// Minimal fake of a ProseMirror doc: forEach(node, offset).
// `pos` values are supplied explicitly so we can simulate empty paragraphs
// occupying earlier positions (which shifts later blocks' live positions).
function fakeDoc(
  nodes: Array<{ elementType?: string; text: string; pos: number; name?: string }>,
): DocLike {
  return {
    forEach(cb) {
      for (const n of nodes) {
        cb(
          { type: { name: n.name ?? 'paragraph' }, attrs: { elementType: n.elementType }, textContent: n.text },
          n.pos,
        )
      }
    },
  }
}

describe('liveScriptBlocksFromDoc', () => {
  it('skips empty paragraphs and preserves live positions of later blocks', () => {
    const doc = fakeDoc([
      { elementType: 'action', text: '', pos: 0 },
      { elementType: 'character', text: 'ISAIAH', pos: 2 },
    ])
    expect(liveScriptBlocksFromDoc(doc)).toEqual([{ type: 'character', text: 'ISAIAH', pos: 2 }])
  })

  it('ignores non-paragraph nodes', () => {
    const doc = fakeDoc([{ name: 'horizontal_rule', text: '', pos: 0, elementType: undefined }])
    expect(liveScriptBlocksFromDoc(doc)).toEqual([])
  })
})

describe('resolveFactOccurrences', () => {
  const doc = fakeDoc([
    { elementType: 'scene-heading', text: 'INT. SAFEHOUSE - NIGHT', pos: 0 },
    { elementType: 'character', text: "ISAIAH (CONT'D)", pos: 30 },
    { elementType: 'dialogue', text: 'Still here.', pos: 50 },
    { elementType: 'scene-heading', text: 'INT. SAFEHOUSE - DAY', pos: 70 },
    { elementType: 'character', text: 'ISAIAH', pos: 100 },
    { elementType: 'transition', text: 'CUT TO:', pos: 120 },
  ])
  const blocks = liveScriptBlocksFromDoc(doc)

  it('matches a character across cue decorations, in document order', () => {
    expect(resolveFactOccurrences(blocks, { section: 'characters', label: 'ISAIAH' })).toEqual([30, 100])
  })

  it('matches a location by folded key', () => {
    expect(resolveFactOccurrences(blocks, { section: 'locations', label: 'INT. SAFEHOUSE - NIGHT' })).toEqual([0])
  })

  it('matches a time against scene headings that contain it', () => {
    expect(resolveFactOccurrences(blocks, { section: 'times', label: 'NIGHT' })).toEqual([0])
  })

  it('matches a transition', () => {
    expect(resolveFactOccurrences(blocks, { section: 'transitions', label: 'CUT TO:' })).toEqual([120])
  })

  it('returns empty for a label not present live', () => {
    expect(resolveFactOccurrences(blocks, { section: 'characters', label: 'DANTE' })).toEqual([])
  })

  // REQUIRED (design spec): empty paragraph before a fact must not misdirect navigation.
  it('lands on the correct live position when an empty paragraph precedes the fact', () => {
    const shifted = liveScriptBlocksFromDoc(
      fakeDoc([
        { elementType: 'action', text: '', pos: 0 },
        { elementType: 'character', text: 'ISAIAH', pos: 2 },
      ]),
    )
    expect(resolveFactOccurrences(shifted, { section: 'characters', label: 'ISAIAH' })).toEqual([2])
  })
})
