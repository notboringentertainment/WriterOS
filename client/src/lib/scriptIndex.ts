import type { ElementType } from './screenplay'

export const ESTIMATED_SCRIPT_PAGE_WORDS = 250

const ELEMENT_TYPES = new Set<ElementType>([
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
])

export interface ScriptBlockIndex {
  id: string
  index: number
  type: ElementType
  text: string
  speaker?: string
  sceneId?: string
  sceneHeading?: string
  pageNumber: number
  wordStart: number
  wordEnd: number
}

export interface ScriptSceneIndex {
  id: string
  heading: string
  index: number
  pageStart: number
  pageEnd: number
  blockStart: number
  blockEnd: number
  wordStart: number
  wordEnd: number
}

export interface ScriptPageIndex {
  pageNumber: number
  blockStart: number
  blockEnd: number
  wordStart: number
  wordEnd: number
  sceneIds: string[]
}

export interface ScriptIndex {
  blocks: ScriptBlockIndex[]
  scenes: ScriptSceneIndex[]
  pages: ScriptPageIndex[]
  speakers: string[]
  plainText: string
  totalWordCount: number
  estimatedPageCount: number
}

export interface ScriptContextWindow {
  reason: 'requested-speakers' | 'requested-page-range' | 'current-selection' | 'current-scene' | 'current-block'
  label?: string
  pageRange?: { start: number; end: number }
  sceneHeadings: string[]
  blocks: ScriptBlockIndex[]
  dialogueSnippets: string[]
  actionSnippets: string[]
  selectedText?: string
}

export interface ScriptFocusState {
  blockIndex?: number
  selectedText?: string
  updatedAt: number
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function stripScriptHtmlFallback(rawHtml: string): string {
  return normalizeWhitespace(
    rawHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
}

function countWords(value: string): number {
  return value.trim().match(/\S+/g)?.length ?? 0
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function speakerAliases(speaker: string): string[] {
  const normalized = normalizeName(speaker)
  const tokens = normalized.split(/\s+/).filter(Boolean)
  const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : ''
  return Array.from(new Set([
    normalized,
    lastToken.length >= 3 ? lastToken : '',
  ].filter(Boolean)))
}

function slug(value: string): string {
  return normalizeName(value).replace(/\s+/g, '-').slice(0, 48) || 'empty'
}

function normalizeElementType(value: string | null): ElementType {
  return ELEMENT_TYPES.has(value as ElementType) ? value as ElementType : 'action'
}

function estimatedPageForWord(wordOffset: number): number {
  return Math.floor(wordOffset / ESTIMATED_SCRIPT_PAGE_WORDS) + 1
}

function pageRangeForWords(wordStart: number, wordEnd: number): { start: number; end: number } {
  if (wordEnd <= wordStart) {
    const page = estimatedPageForWord(wordStart)
    return { start: page, end: page }
  }
  return {
    start: estimatedPageForWord(wordStart),
    end: estimatedPageForWord(Math.max(wordStart, wordEnd - 1)),
  }
}

export function pageRangeLabel(pageRange: { start: number; end: number }): string {
  return pageRange.start === pageRange.end
    ? `Page ${pageRange.start}`
    : `Pages ${pageRange.start}–${pageRange.end}`
}

function parseElements(rawHtml: string): Array<{ sourceIndex: number; type: ElementType; text: string }> {
  if (!rawHtml.trim() || typeof DOMParser === 'undefined') return []

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  const elements = Array.from(doc.body.querySelectorAll<HTMLElement>('[data-element-type], p'))

  return elements
    .map((el, sourceIndex) => ({
      sourceIndex,
      type: normalizeElementType(el.getAttribute('data-element-type')),
      text: normalizeWhitespace(el.textContent ?? ''),
    }))
    .filter(block => block.text.length > 0)
}

function buildPages(blocks: ScriptBlockIndex[], totalWordCount: number): ScriptPageIndex[] {
  if (!blocks.length) return []

  const pageCount = Math.max(1, Math.ceil(totalWordCount / ESTIMATED_SCRIPT_PAGE_WORDS))
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1
    const wordStart = index * ESTIMATED_SCRIPT_PAGE_WORDS
    const wordEnd = Math.min(totalWordCount, wordStart + ESTIMATED_SCRIPT_PAGE_WORDS)
    const pageBlocks = blocks.filter(block => block.wordStart < wordEnd && block.wordEnd > wordStart)
    const sceneIds = Array.from(new Set(pageBlocks.map(block => block.sceneId).filter(Boolean))) as string[]
    const firstBlock = pageBlocks[0] ?? blocks[0]
    const lastBlock = pageBlocks[pageBlocks.length - 1] ?? firstBlock

    return {
      pageNumber,
      blockStart: firstBlock.index,
      blockEnd: lastBlock.index,
      wordStart,
      wordEnd,
      sceneIds,
    }
  })
}

export function buildScriptIndex(rawHtml: string): ScriptIndex {
  const parsed = parseElements(rawHtml)
  if (!parsed.length) {
    const plainText = stripScriptHtmlFallback(rawHtml)
    const totalWordCount = countWords(plainText)
    return {
      blocks: [],
      scenes: [],
      pages: [],
      speakers: [],
      plainText,
      totalWordCount,
      estimatedPageCount: totalWordCount > 0 ? Math.ceil(totalWordCount / ESTIMATED_SCRIPT_PAGE_WORDS) : 0,
    }
  }

  const blocks: ScriptBlockIndex[] = []
  const scenes: ScriptSceneIndex[] = []
  const speakers: string[] = []
  let activeSpeaker = ''
  let activeScene: ScriptSceneIndex | undefined
  let totalWordCount = 0

  parsed.forEach((block) => {
    const wordStart = totalWordCount
    const blockWordCount = countWords(block.text)
    const wordEnd = wordStart + blockWordCount
    const pageNumber = estimatedPageForWord(wordStart)
    const sourceIndex = block.sourceIndex

    if (block.type === 'scene-heading') {
      activeSpeaker = ''
      activeScene = {
        id: `scene-${scenes.length + 1}-${slug(block.text)}`,
        heading: block.text,
        index: scenes.length + 1,
        pageStart: pageNumber,
        pageEnd: pageNumber,
        blockStart: sourceIndex,
        blockEnd: sourceIndex,
        wordStart,
        wordEnd,
      }
      scenes.push(activeScene)
    } else if (block.type === 'character') {
      activeSpeaker = block.text
      if (!speakers.includes(block.text)) speakers.push(block.text)
    } else if (block.type !== 'dialogue' && block.type !== 'parenthetical') {
      activeSpeaker = ''
    }

    const speaker = (block.type === 'dialogue' || block.type === 'parenthetical') && activeSpeaker
      ? activeSpeaker
      : undefined

    const indexedBlock: ScriptBlockIndex = {
      id: `block-${sourceIndex + 1}-${block.type}-${slug(block.text)}`,
      index: sourceIndex,
      type: block.type,
      text: block.text,
      speaker,
      sceneId: activeScene?.id,
      sceneHeading: activeScene?.heading,
      pageNumber,
      wordStart,
      wordEnd,
    }
    blocks.push(indexedBlock)

    if (activeScene) {
      const scenePages = pageRangeForWords(activeScene.wordStart, wordEnd)
      activeScene.blockEnd = sourceIndex
      activeScene.wordEnd = wordEnd
      activeScene.pageStart = scenePages.start
      activeScene.pageEnd = scenePages.end
    }

    totalWordCount = wordEnd
  })

  return {
    blocks,
    scenes,
    pages: buildPages(blocks, totalWordCount),
    speakers,
    plainText: blocks.map(block => block.text).join('\n'),
    totalWordCount,
    estimatedPageCount: Math.max(1, Math.ceil(totalWordCount / ESTIMATED_SCRIPT_PAGE_WORDS)),
  }
}

export function speakersFromMessage(index: ScriptIndex, userMessage: string): string[] {
  const normalizedMessage = ` ${normalizeName(userMessage)} `
  if (!normalizedMessage.trim()) return []

  return index.speakers.filter(speaker => {
    return speakerAliases(speaker).some(alias => normalizedMessage.includes(` ${alias} `))
  })
}

function dialogueSnippet(block: ScriptBlockIndex): string {
  return block.speaker ? `${block.speaker}: ${block.text}` : block.text
}

function pageRangeForBlocks(blocks: ScriptBlockIndex[]): { start: number; end: number } | undefined {
  if (!blocks.length) return undefined
  const pageNumbers = blocks.map(block => block.pageNumber)
  return {
    start: Math.min(...pageNumbers),
    end: Math.max(...pageNumbers),
  }
}

function contextWindowFromBlocks(
  blocks: ScriptBlockIndex[],
  reason: ScriptContextWindow['reason'],
  label?: string,
  selectedText?: string,
): ScriptContextWindow | null {
  if (!blocks.length) return null

  const sceneHeadings = Array.from(new Set(
    blocks
      .map(block => block.type === 'scene-heading' ? block.text : block.sceneHeading)
      .filter((heading): heading is string => Boolean(heading))
  ))
  const dialogueBlocks = blocks.filter(block => block.type === 'dialogue')
  const actionBlocks = blocks.filter(block => block.type === 'action')

  return {
    reason,
    label,
    pageRange: pageRangeForBlocks(blocks),
    sceneHeadings,
    blocks,
    dialogueSnippets: dialogueBlocks.map(dialogueSnippet),
    actionSnippets: actionBlocks.map(block => block.text),
    selectedText,
  }
}

function sceneContainsSpeakers(blocks: ScriptBlockIndex[], speakers: string[]): boolean {
  const normalizedSpeakers = new Set(
    blocks
      .filter(block => block.type === 'dialogue' && block.speaker)
      .map(block => normalizeName(block.speaker ?? ''))
  )
  return speakers.every(speaker => normalizedSpeakers.has(normalizeName(speaker)))
}

export function getDialogueWindowBySpeakers(
  index: ScriptIndex,
  speakers: string[],
  maxDialogueSnippets = 80,
): ScriptContextWindow | null {
  const requestedSpeakers = speakers.filter(Boolean)
  if (!requestedSpeakers.length || !index.blocks.length) return null

  const scenesWithBlocks = index.scenes.length
    ? index.scenes.map(scene => ({
      scene,
      blocks: index.blocks.filter(block => block.index >= scene.blockStart && block.index <= scene.blockEnd),
    }))
    : [{
      scene: {
        id: 'script',
        heading: 'Script excerpt',
        index: 1,
        pageStart: index.pages[0]?.pageNumber ?? 1,
        pageEnd: index.pages[index.pages.length - 1]?.pageNumber ?? 1,
        blockStart: index.blocks[0].index,
        blockEnd: index.blocks[index.blocks.length - 1].index,
        wordStart: 0,
        wordEnd: index.totalWordCount,
      },
      blocks: index.blocks,
    }]
  const matchingScene = scenesWithBlocks.find(({ blocks }) => sceneContainsSpeakers(blocks, requestedSpeakers))
  const fallbackScene = scenesWithBlocks.find(({ blocks }) => (
    blocks.some(block => block.type === 'dialogue' && requestedSpeakers.some(speaker => normalizeName(block.speaker ?? '') === normalizeName(speaker)))
  ))
  const selected = matchingScene ?? fallbackScene
  if (!selected) return null

  const dialogueBlocks = selected.blocks.filter(block => block.type === 'dialogue')
  const actionBlocks = selected.blocks.filter(block => block.type === 'action')

  return {
    reason: 'requested-speakers',
    label: selected.scene.heading,
    pageRange: { start: selected.scene.pageStart, end: selected.scene.pageEnd },
    sceneHeadings: selected.scene.id === 'script' ? [] : [selected.scene.heading],
    blocks: selected.blocks,
    dialogueSnippets: dialogueBlocks.slice(0, maxDialogueSnippets).map(dialogueSnippet),
    actionSnippets: actionBlocks.map(block => block.text),
  }
}

export function getPageRangeContext(
  index: ScriptIndex,
  startPage: number,
  endPage?: number,
): ScriptContextWindow | null {
  if (!index.blocks.length) return null
  const end = endPage ?? startPage
  const wordStart = (startPage - 1) * ESTIMATED_SCRIPT_PAGE_WORDS
  const wordEnd = end * ESTIMATED_SCRIPT_PAGE_WORDS
  const pageBlocks = index.blocks.filter(block => block.wordStart < wordEnd && block.wordEnd > wordStart)
  if (!pageBlocks.length) return null
  const requestedRange = { start: startPage, end }
  const window = contextWindowFromBlocks(pageBlocks, 'requested-page-range', pageRangeLabel(requestedRange))
  return window ? { ...window, pageRange: requestedRange } : null
}

export function getFocusContext(index: ScriptIndex, focus?: ScriptFocusState): ScriptContextWindow | null {
  if (!focus || focus.blockIndex === undefined || !index.blocks.length) return null

  const focusedBlock = index.blocks.find(block => block.index === focus.blockIndex)
  if (!focusedBlock) return null

  const selectedText = focus.selectedText?.trim()
  if (selectedText) {
    const selectionBlocks = focusedBlock.sceneId
      ? index.blocks.filter(block => block.sceneId === focusedBlock.sceneId)
      : index.blocks.slice(Math.max(0, focusedBlock.index - 3), focusedBlock.index + 4)
    return contextWindowFromBlocks(
      selectionBlocks,
      'current-selection',
      focusedBlock.sceneHeading ?? 'Current selection',
      selectedText,
    )
  }

  if (focusedBlock.sceneId) {
    const sceneBlocks = index.blocks.filter(block => block.sceneId === focusedBlock.sceneId)
    return contextWindowFromBlocks(sceneBlocks, 'current-scene', focusedBlock.sceneHeading)
  }

  const focusedBlockPosition = index.blocks.findIndex(block => block.index === focusedBlock.index)
  const nearbyBlocks = index.blocks.slice(Math.max(0, focusedBlockPosition - 3), focusedBlockPosition + 4)
  return contextWindowFromBlocks(nearbyBlocks, 'current-block', 'Current script position')
}
