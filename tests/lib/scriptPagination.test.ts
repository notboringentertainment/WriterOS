import { describe, expect, it } from 'vitest'
import {
  SCREENPLAY_LINES_PER_PAGE,
  computePageBreaks,
  paginateScript,
  screenplayCharsPerLine,
  type ScriptPaginationBlock,
} from '../../client/src/lib/scriptPagination'

let nextIndex = 0
function block(type: ScriptPaginationBlock['type'], text: string, sceneId?: string): ScriptPaginationBlock {
  return { index: nextIndex++, type, text, sceneId }
}
function reset() {
  nextIndex = 0
}

// Action wraps at 60 chars/line, dialogue at 35. A 40-char token cannot share a
// 60-char line with another (40 + 1 + 40 > 60), so N such tokens => N wrapped lines.
const ACTION_TOKEN = 'x'.repeat(40)
function actionLines(n: number, sceneId?: string): ScriptPaginationBlock {
  return block('action', Array.from({ length: n }, () => ACTION_TOKEN).join(' '), sceneId)
}

describe('screenplayCharsPerLine', () => {
  it('derives per-element wrapping widths from SCREENPLAY_INDENTS', () => {
    expect(screenplayCharsPerLine('action')).toBe(60)
    expect(screenplayCharsPerLine('scene-heading')).toBe(60)
    expect(screenplayCharsPerLine('transition')).toBe(60)
    expect(screenplayCharsPerLine('character')).toBe(38)
    expect(screenplayCharsPerLine('dialogue')).toBe(35)
    expect(screenplayCharsPerLine('parenthetical')).toBe(25)
  })
})

describe('paginateScript', () => {
  it('returns one blank page sentinel for an empty screenplay', () => {
    const result = paginateScript([])
    expect(result.pageCount).toBe(1)
    expect(result.blocks).toEqual([])
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        start: { blockIndex: 0, lineIndex: 0 },
        end: { blockIndex: 0, lineIndex: 0 },
        blockStart: 0,
        blockEnd: 0,
        sceneIds: [],
      },
    ])
  })

  it('places a short script on a single page starting at page 1', () => {
    reset()
    const result = paginateScript([
      block('scene-heading', 'INT. ROOM - DAY', 's1'),
      block('action', 'A short line.', 's1'),
    ])

    expect(result.pageCount).toBe(1)
    expect(result.pages[0].pageNumber).toBe(1)
    expect(result.pages[0].blockStart).toBe(0)
    expect(result.pages[0].blockEnd).toBe(1)
    expect(result.pages[0].sceneIds).toEqual(['s1'])
    expect(result.blocks[0]).toMatchObject({ blockIndex: 0, pageStart: 1, pageEnd: 1, lineCount: 1 })
    expect(result.blocks[0].fragments).toEqual([
      { blockIndex: 0, fragmentIndex: 0, pageNumber: 1, lineStart: 0, lineEnd: 1, isContinuation: false },
    ])
  })

  it('counts wrapped text lines per block excluding spacing-before', () => {
    reset()
    const result = paginateScript([actionLines(3)])
    expect(result.blocks[0].lineCount).toBe(3)
  })

  it('fits exactly 54 single lines on one page and overflows the 55th', () => {
    reset()
    const oneLiners = Array.from({ length: 55 }, () => actionLines(1))
    const result = paginateScript(oneLiners)

    expect(result.pageCount).toBe(2)
    expect(result.pages[0].blockStart).toBe(0)
    expect(result.pages[0].blockEnd).toBe(53)
    expect(result.pages[1].blockStart).toBe(54)
    expect(result.pages[1].blockEnd).toBe(54)
    expect(result.blocks[53].pageStart).toBe(1)
    expect(result.blocks[54].pageStart).toBe(2)
  })

  it('keeps a scene heading with its first following line', () => {
    reset()
    const filler = Array.from({ length: 52 }, () => actionLines(1))
    const heading = block('scene-heading', 'INT. NEXT - DAY', 's2')
    const follow = block('action', 'First beat of the new scene.', 's2')
    const result = paginateScript([...filler, heading, follow])

    // Heading alone would fit on line 54 of page 1, but is pushed so it stays
    // with its first content line on page 2.
    expect(result.pageCount).toBe(2)
    const headingBlock = result.blocks.find(b => b.blockIndex === 52)!
    const followBlock = result.blocks.find(b => b.blockIndex === 53)!
    expect(headingBlock.pageStart).toBe(2)
    expect(followBlock.pageStart).toBe(2)
  })

  it('keeps a character cue with its first dialogue line', () => {
    reset()
    const filler = Array.from({ length: 53 }, () => actionLines(1))
    const cue = block('character', 'ISAIAH')
    const line = block('dialogue', 'I can hear it.')
    const result = paginateScript([...filler, cue, line])

    const cueBlock = result.blocks.find(b => b.blockIndex === 53)!
    const lineBlock = result.blocks.find(b => b.blockIndex === 54)!
    expect(cueBlock.pageStart).toBe(2)
    expect(lineBlock.pageStart).toBe(2)
  })

  it('keeps a parenthetical with its first dialogue line', () => {
    reset()
    const filler = Array.from({ length: 53 }, () => actionLines(1))
    const paren = block('parenthetical', '(quietly)')
    const line = block('dialogue', 'And it knows my name.')
    const result = paginateScript([...filler, paren, line])

    const parenBlock = result.blocks.find(b => b.blockIndex === 53)!
    const lineBlock = result.blocks.find(b => b.blockIndex === 54)!
    expect(parenBlock.pageStart).toBe(2)
    expect(lineBlock.pageStart).toBe(2)
  })

  it('splits a long action block by wrapped line with a 2/2 minimum', () => {
    reset()
    // 55-line block starting at the top of page 1: cannot fit (54 budget), so it
    // splits leaving >= 2 lines on the next page rather than a single widow.
    const result = paginateScript([actionLines(55)])

    expect(result.pageCount).toBe(2)
    const frags = result.blocks[0].fragments
    expect(frags).toHaveLength(2)
    expect(frags[0]).toMatchObject({ fragmentIndex: 0, pageNumber: 1, lineStart: 0, isContinuation: false })
    expect(frags[1]).toMatchObject({ fragmentIndex: 1, pageNumber: 2, lineEnd: 55, isContinuation: true })
    // First fragment stops at 53 (not 54) so the continuation carries 2 lines.
    expect(frags[0].lineEnd).toBe(53)
    expect(frags[1].lineStart).toBe(53)
    // No content lost or duplicated across the split.
    expect(frags[0].lineEnd).toBe(frags[1].lineStart)
  })

  it('suppresses spacing-before for a block at the top of a page', () => {
    reset()
    // 54 one-line actions fill page 1; the 55th starts page 2 with no leading
    // blank line charged, so it occupies line index 0.
    const oneLiners = Array.from({ length: 55 }, () => actionLines(1))
    const result = paginateScript(oneLiners)
    expect(result.pages[1].start).toEqual({ blockIndex: 54, lineIndex: 0 })
  })
})

describe('computePageBreaks', () => {
  const ACTION_LINE = 'x'.repeat(40)

  it('returns one page and no breaks for empty input', () => {
    expect(computePageBreaks([])).toEqual({ pageCount: 1, breaks: [] })
  })

  it('returns no breaks for a single-page script', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ pos: i * 10, type: 'action' as const, text: ACTION_LINE }))
    expect(computePageBreaks(items)).toEqual({ pageCount: 1, breaks: [] })
  })

  it('marks a page break at the first block of page 2', () => {
    const items = Array.from({ length: 55 }, (_, i) => ({ pos: i * 10, type: 'action' as const, text: ACTION_LINE }))
    const result = computePageBreaks(items)
    expect(result.pageCount).toBe(2)
    expect(result.breaks).toEqual([{ pos: 540, pageNumber: 2 }])
  })

  it('ignores empty paragraphs when mapping break positions', () => {
    const items = [
      { pos: 0, type: 'action' as const, text: '' },
      ...Array.from({ length: 55 }, (_, i) => ({ pos: (i + 1) * 10, type: 'action' as const, text: ACTION_LINE })),
    ]
    const result = computePageBreaks(items)
    expect(result.pageCount).toBe(2)
    // The 55th non-empty action (original pos 550) opens page 2.
    expect(result.breaks).toEqual([{ pos: 550, pageNumber: 2 }])
  })

  it('places a mid-block break at the wrapped-line offset where the page begins', () => {
    // One 60-line action splits across two pages. Page 2 begins at wrapped line
    // 54; each 40-char token + 1 space is 41 chars, so that line starts at
    // character offset 54 * 41 = 2214 inside the paragraph text.
    const items = [{ pos: 0, type: 'action' as const, text: Array.from({ length: 60 }, () => ACTION_LINE).join(' ') }]
    const result = computePageBreaks(items)
    expect(result.pageCount).toBe(2)
    expect(result.breaks).toEqual([{ pos: 0, pageNumber: 2, charOffset: 2214 }])
  })
})
