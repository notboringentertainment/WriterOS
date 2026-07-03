import {
  type ElementType,
  SCREENPLAY_INDENTS,
  getScreenplaySpacingBefore,
} from './screenplay'

// Deterministic screenplay pagination model (Slice 1c foundation).
//
// Page geometry is fixed to the screenplay constants in screenplay.ts:
// - US Letter, Courier 12pt.
// - 1 line = 12pt vertical = 1/6 inch; 1em = 1/6 inch.
// - Body content width 6in (8.5in - 1.5in left - 1in right).
// - 54 usable 12pt lines per page (9in body height).
// Courier 12pt is exactly 10 characters per inch, so wrapping widths are
// derived per element type from the body width minus that element's indents.

export const SCREENPLAY_LINES_PER_PAGE = 54

const BODY_WIDTH_INCHES = 6
const CHARS_PER_INCH = 10
const INCHES_PER_EM = 1 / 6

export type ScriptPaginationBlock = {
  index: number
  type: ElementType
  text: string
  sceneId?: string
}

export type ScriptPaginationPosition = {
  blockIndex: number
  lineIndex: number
}

export type ScriptPaginationFragment = {
  blockIndex: number
  fragmentIndex: number
  pageNumber: number
  lineStart: number
  lineEnd: number
  isContinuation: boolean
}

export type ScriptPaginationPage = {
  pageNumber: number
  start: ScriptPaginationPosition
  end: ScriptPaginationPosition
  blockStart: number
  blockEnd: number
  sceneIds: string[]
}

export type ScriptPaginationBlockResult = {
  blockIndex: number
  pageStart: number
  pageEnd: number
  lineCount: number
  fragments: ScriptPaginationFragment[]
}

export type ScriptPaginationResult = {
  pageCount: number
  pages: ScriptPaginationPage[]
  blocks: ScriptPaginationBlockResult[]
}

/** Characters that fit on one wrapped line for the given element type. */
export function screenplayCharsPerLine(type: ElementType): number {
  const indent = SCREENPLAY_INDENTS[type]
  const widthInches = BODY_WIDTH_INCHES - (indent.marginLeftEm + indent.marginRightEm) * INCHES_PER_EM
  return Math.max(1, Math.floor(widthInches * CHARS_PER_INCH))
}

/**
 * Wrap a block's text and return the character offset (into the original text)
 * where each wrapped line begins. Wraps at whitespace where possible and
 * hard-wraps only tokens longer than the available width. Excludes
 * spacing-before, which is charged separately during page placement. An empty
 * or whitespace-only block is a single line starting at offset 0.
 */
function wrapLineStarts(text: string, maxChars: number): number[] {
  const lineStarts: number[] = []
  let lineOpen = false
  let lineLength = 0

  const wordPattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[0]
    const wordStart = match.index

    if (word.length > maxChars) {
      // Hard-wrap an oversized token; each full chunk opens its own line.
      lineOpen = false
      lineLength = 0
      let consumed = 0
      while (word.length - consumed > maxChars) {
        lineStarts.push(wordStart + consumed)
        consumed += maxChars
      }
      lineStarts.push(wordStart + consumed)
      lineLength = word.length - consumed
      lineOpen = lineLength > 0
      continue
    }

    if (!lineOpen) {
      lineStarts.push(wordStart)
      lineLength = word.length
      lineOpen = true
    } else if (lineLength + 1 + word.length <= maxChars) {
      lineLength += 1 + word.length
    } else {
      // lineOpen is already true here (we are in the else of `!lineOpen`).
      lineStarts.push(wordStart)
      lineLength = word.length
    }
  }

  return lineStarts.length ? lineStarts : [0]
}

/**
 * Count the wrapped text lines for a block (excludes spacing-before).
 */
function wrappedLineCount(text: string, maxChars: number): number {
  return wrapLineStarts(text, maxChars).length
}

function emptyResult(): ScriptPaginationResult {
  return {
    pageCount: 1,
    pages: [
      {
        pageNumber: 1,
        start: { blockIndex: 0, lineIndex: 0 },
        end: { blockIndex: 0, lineIndex: 0 },
        blockStart: 0,
        blockEnd: 0,
        sceneIds: [],
      },
    ],
    blocks: [],
  }
}

type PageBuilder = {
  pageNumber: number
  start: ScriptPaginationPosition | null
  end: ScriptPaginationPosition | null
  blockStart: number | null
  blockEnd: number | null
  sceneIds: string[]
  sceneSeen: Set<string>
}

function keepsAdjacent(current: ElementType, next: ElementType): boolean {
  if (current === 'scene-heading') return true
  if (current === 'character') return next === 'dialogue' || next === 'parenthetical'
  if (current === 'parenthetical') return next === 'dialogue'
  return false
}

function keepWithRunEnd(blocks: ScriptPaginationBlock[], pos: number): number {
  let end = pos
  while (end + 1 < blocks.length && keepsAdjacent(blocks[end].type, blocks[end + 1].type)) {
    end += 1
  }
  return end
}

function leadingFragmentLineCount(lineCount: number): number {
  return lineCount >= 4 ? 2 : Math.max(1, lineCount)
}

export function paginateScript(blocks: ScriptPaginationBlock[]): ScriptPaginationResult {
  if (!blocks.length) return emptyResult()

  const lineCounts = blocks.map(block => wrappedLineCount(block.text, screenplayCharsPerLine(block.type)))

  const blockResults: ScriptPaginationBlockResult[] = blocks.map((block, pos) => ({
    blockIndex: block.index,
    pageStart: 0,
    pageEnd: 0,
    lineCount: lineCounts[pos],
    fragments: [],
  }))

  const pages: ScriptPaginationPage[] = []
  let pageNumber = 1
  let linesUsed = 0
  let current: PageBuilder = newPageBuilder(pageNumber)

  function newPageBuilder(n: number): PageBuilder {
    return {
      pageNumber: n,
      start: null,
      end: null,
      blockStart: null,
      blockEnd: null,
      sceneIds: [],
      sceneSeen: new Set(),
    }
  }

  function flush(): void {
    if (current.blockStart === null || current.start === null || current.end === null) return
    pages.push({
      pageNumber: current.pageNumber,
      start: current.start,
      end: current.end,
      blockStart: current.blockStart,
      blockEnd: current.blockEnd as number,
      sceneIds: current.sceneIds,
    })
  }

  function startNewPage(): void {
    flush()
    pageNumber += 1
    linesUsed = 0
    current = newPageBuilder(pageNumber)
  }

  function placeFragment(pos: number, lineStart: number, lineEnd: number): void {
    const block = blocks[pos]
    const result = blockResults[pos]
    const fragmentIndex = result.fragments.length
    result.fragments.push({
      blockIndex: block.index,
      fragmentIndex,
      pageNumber: current.pageNumber,
      lineStart,
      lineEnd,
      isContinuation: fragmentIndex > 0,
    })
    if (fragmentIndex === 0) result.pageStart = current.pageNumber
    result.pageEnd = current.pageNumber

    if (current.blockStart === null) {
      current.blockStart = block.index
      current.start = { blockIndex: block.index, lineIndex: lineStart }
    }
    current.blockEnd = block.index
    current.end = { blockIndex: block.index, lineIndex: lineEnd }
    if (block.sceneId && !current.sceneSeen.has(block.sceneId)) {
      current.sceneSeen.add(block.sceneId)
      current.sceneIds.push(block.sceneId)
    }
  }

  for (let pos = 0; pos < blocks.length; pos++) {
    const block = blocks[pos]
    const lineCount = lineCounts[pos]
    const prevType = pos > 0 ? blocks[pos - 1].type : null
    let spacing = linesUsed > 0 ? getScreenplaySpacingBefore(prevType, block.type) : 0

    const keepEnd = keepWithRunEnd(blocks, pos)
    // Keep-with: push a protected run to a fresh page if the current page cannot
    // host it. Intermediate blocks are kept in full; the terminal block reserves
    // the leading fragment required by the same 2/2 split rule used below.
    if (keepEnd > pos) {
      let together = lineCount
      for (let runPos = pos + 1; runPos <= keepEnd; runPos++) {
        together += getScreenplaySpacingBefore(blocks[runPos - 1].type, blocks[runPos].type)
        together += runPos === keepEnd ? leadingFragmentLineCount(lineCounts[runPos]) : lineCounts[runPos]
      }
      const availForRun = SCREENPLAY_LINES_PER_PAGE - linesUsed - spacing
      if (together > availForRun && together <= SCREENPLAY_LINES_PER_PAGE) {
        startNewPage()
        // Spacing-before is suppressed at the top of a page: the protected
        // block now opens the fresh page, so its leading gap collapses.
        spacing = 0
      }
    }

    // Charge spacing-before (suppressed at the top of a page).
    if (linesUsed > 0) {
      if (linesUsed + spacing >= SCREENPLAY_LINES_PER_PAGE) {
        startNewPage()
      } else {
        linesUsed += spacing
      }
    }

    let placed = 0
    while (placed < lineCount) {
      let avail = SCREENPLAY_LINES_PER_PAGE - linesUsed
      if (avail <= 0) {
        startNewPage()
        avail = SCREENPLAY_LINES_PER_PAGE
      }
      const remaining = lineCount - placed
      if (remaining <= avail) {
        placeFragment(pos, placed, lineCount)
        linesUsed += remaining
        placed = lineCount
        continue
      }

      // Block does not fit on the current page: split at a wrapped-line boundary.
      let chunk: number
      if (lineCount >= 4) {
        if (avail < 2) {
          if (placed === 0) {
            startNewPage()
            continue
          }
          chunk = avail
        } else {
          // Leave at least 2 lines for the continuation (2/2 minimum).
          chunk = Math.min(avail, lineCount - placed - 2)
          if (chunk < 2) chunk = avail
        }
      } else {
        chunk = avail
      }
      if (chunk <= 0) {
        startNewPage()
        continue
      }
      placeFragment(pos, placed, placed + chunk)
      placed += chunk
      linesUsed += chunk
      if (placed < lineCount) startNewPage()
    }
  }
  flush()

  return {
    pageCount: pages.length,
    pages,
    blocks: blockResults,
  }
}

export type PageBreakInput = {
  /** Opaque caller coordinate (e.g. a ProseMirror node position). */
  pos: number
  type: ElementType
  text: string
}

export type PageBreakMarker = {
  /** Node position of the block that opens this page (caller coordinate). */
  pos: number
  pageNumber: number
  /**
   * Present only when the page opens mid-block (a block that spans the page
   * boundary): the character offset into that block's text where the page's
   * portion begins. Callers render the divider inside the paragraph at this
   * offset; when absent, the divider sits at the block boundary (`pos`).
   */
  charOffset?: number
}

/**
 * Map a flat list of editor paragraphs to page-break markers for continuous
 * scroll rendering. Empty paragraphs are excluded from the layout (matching
 * buildScriptIndex). A marker is emitted for the first block of each page after
 * page 1. When the page opens at a clean block boundary the marker sits at that
 * block's position; when a long block spans the boundary the marker carries the
 * `charOffset` of the wrapped line where the new page begins, so the divider can
 * render inside the paragraph (PRD fragment rendering).
 */
export function computePageBreaks(items: PageBreakInput[]): {
  pageCount: number
  breaks: PageBreakMarker[]
} {
  const included = items.filter(item => item.text.trim().length > 0)
  const blocks: ScriptPaginationBlock[] = included.map((item, index) => ({
    index,
    type: item.type,
    text: item.text,
  }))
  const result = paginateScript(blocks)
  const blockResultsByIndex = new Map(result.blocks.map(block => [block.blockIndex, block]))

  const breaks: PageBreakMarker[] = []
  let previousBlockEnd = -1
  for (const page of result.pages) {
    if (page.pageNumber > 1) {
      const node = included[page.blockStart]
      if (node && page.blockStart !== previousBlockEnd) {
        // Clean boundary: divider sits above the block.
        breaks.push({ pos: node.pos, pageNumber: page.pageNumber })
      } else if (node) {
        // Mid-block continuation: locate the wrapped line where this page begins
        // and translate it to a character offset inside the paragraph text.
        const fragment = blockResultsByIndex.get(page.blockStart)?.fragments.find(
          frag => frag.pageNumber === page.pageNumber,
        )
        if (fragment) {
          const lineStarts = wrapLineStarts(node.text, screenplayCharsPerLine(node.type))
          const charOffset = lineStarts[fragment.lineStart] ?? 0
          breaks.push({ pos: node.pos, pageNumber: page.pageNumber, charOffset })
        }
      }
    }
    previousBlockEnd = page.blockEnd
  }
  return { pageCount: result.pageCount, breaks }
}
