import type { ElementType } from './screenplay'
import { parseScriptBlocks } from './scriptBlocks'
import { paginateScript, type ScriptPaginationBlock } from './scriptPagination'

export interface ScriptBlockIndex {
  id: string
  index: number
  type: ElementType
  text: string
  speaker?: string
  sceneId?: string
  sceneHeading?: string
  pageNumber: number
  pageEnd: number
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
  reason: 'requested-speakers' | 'requested-page-range' | 'requested-scene' | 'script-overview' | 'current-selection' | 'current-scene' | 'current-block'
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

const SCENE_QUERY_STOPWORDS = new Set([
  'about',
  'again',
  'and',
  'are',
  'can',
  'could',
  'day',
  'does',
  'evening',
  'exchange',
  'ext',
  'exterior',
  'for',
  'from',
  'happens',
  'happening',
  'how',
  'int',
  'interior',
  'into',
  'later',
  'look',
  'moment',
  'morning',
  'night',
  'review',
  'same',
  'scene',
  'sequence',
  'the',
  'this',
  'through',
  'to',
  'what',
  'with',
  'work',
  'working',
])

function speakerAliases(speaker: string): string[] {
  const normalized = normalizeName(speaker)
  const tokens = normalized.split(/\s+/).filter(Boolean)
  const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : ''
  return Array.from(new Set([
    normalized,
    lastToken.length >= 3 ? lastToken : '',
  ].filter(Boolean)))
}

function sceneQueryTokens(value: string): string[] {
  return Array.from(new Set(
    normalizeName(value)
      .split(/\s+/)
      .filter(token => token.length >= 3 && !SCENE_QUERY_STOPWORDS.has(token))
  ))
}

function slug(value: string): string {
  return normalizeName(value).replace(/\s+/g, '-').slice(0, 48) || 'empty'
}

export function pageRangeLabel(pageRange: { start: number; end: number }): string {
  return pageRange.start === pageRange.end
    ? `Page ${pageRange.start}`
    : `Pages ${pageRange.start}–${pageRange.end}`
}

// Map the shared layout pagination result onto the script index page shape.
// Page count, page numbers, and block/scene page ranges are all layout-derived;
// the word offsets are retained per page for backward compatibility.
function buildPages(
  pages: ReturnType<typeof paginateScript>['pages'],
  blocksByIndex: Map<number, ScriptBlockIndex>,
): ScriptPageIndex[] {
  return pages.map((page) => {
    const pageBlocks: ScriptBlockIndex[] = []
    // Block indices are monotonic source-order indices, not dense: empty
    // filtered elements can leave gaps in [blockStart, blockEnd]. The Map
    // lookup intentionally skips those non-content gaps.
    for (let index = page.blockStart; index <= page.blockEnd; index++) {
      const block = blocksByIndex.get(index)
      if (block) pageBlocks.push(block)
    }
    const wordStart = pageBlocks[0]?.wordStart ?? 0
    const wordEnd = pageBlocks[pageBlocks.length - 1]?.wordEnd ?? wordStart
    return {
      pageNumber: page.pageNumber,
      blockStart: page.blockStart,
      blockEnd: page.blockEnd,
      wordStart,
      wordEnd,
      sceneIds: page.sceneIds,
    }
  })
}

export function buildScriptIndex(rawHtml: string): ScriptIndex {
  const parsed = parseScriptBlocks(rawHtml)
  if (!parsed.length) {
    const plainText = stripScriptHtmlFallback(rawHtml)
    const totalWordCount = countWords(plainText)
    // An empty screenplay is one blank screenplay page, not zero pages. Expose
    // the paginator's empty-screenplay result so page count and the single
    // sentinel page stay consistent with paginateScript.
    const pagination = paginateScript([])
    return {
      blocks: [],
      scenes: [],
      pages: buildPages(pagination.pages, new Map()),
      speakers: [],
      plainText,
      totalWordCount,
      estimatedPageCount: pagination.pageCount,
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
    const sourceIndex = block.index

    if (block.type === 'scene-heading') {
      activeSpeaker = ''
      activeScene = {
        id: `scene-${scenes.length + 1}-${slug(block.text)}`,
        heading: block.text,
        index: scenes.length + 1,
        pageStart: 1,
        pageEnd: 1,
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
      pageNumber: 1,
      pageEnd: 1,
      wordStart,
      wordEnd,
    }
    blocks.push(indexedBlock)

    if (activeScene) {
      activeScene.blockEnd = sourceIndex
      activeScene.wordEnd = wordEnd
    }

    totalWordCount = wordEnd
  })

  // Layout-derived pagination is the single source of truth for page count,
  // page numbers, and page ranges (replaces the legacy 250-word estimate).
  const paginationInput: ScriptPaginationBlock[] = blocks.map(block => ({
    index: block.index,
    type: block.type,
    text: block.text,
    sceneId: block.sceneId,
  }))
  const pagination = paginateScript(paginationInput)
  const blocksByIndex = new Map(blocks.map(block => [block.index, block]))

  pagination.blocks.forEach((result) => {
    const block = blocksByIndex.get(result.blockIndex)
    if (!block) return
    block.pageNumber = result.pageStart
    block.pageEnd = result.pageEnd
  })

  scenes.forEach((scene) => {
    let pageStart = Infinity
    let pageEnd = 1
    for (let index = scene.blockStart; index <= scene.blockEnd; index++) {
      const block = blocksByIndex.get(index)
      if (!block) continue
      pageStart = Math.min(pageStart, block.pageNumber)
      pageEnd = Math.max(pageEnd, block.pageEnd)
    }
    scene.pageStart = Number.isFinite(pageStart) ? pageStart : 1
    scene.pageEnd = pageEnd
  })

  return {
    blocks,
    scenes,
    pages: buildPages(pagination.pages, blocksByIndex),
    speakers,
    plainText: blocks.map(block => block.text).join('\n'),
    totalWordCount,
    estimatedPageCount: pagination.pageCount,
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
  return {
    start: Math.min(...blocks.map(block => block.pageNumber)),
    end: Math.max(...blocks.map(block => block.pageEnd)),
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

function sceneBlocks(index: ScriptIndex, scene: ScriptSceneIndex): ScriptBlockIndex[] {
  return index.blocks.filter(block => block.index >= scene.blockStart && block.index <= scene.blockEnd)
}

function contextWindowFromScene(
  index: ScriptIndex,
  scene: ScriptSceneIndex,
  reason: ScriptContextWindow['reason'],
  selectedText?: string,
): ScriptContextWindow | null {
  const window = contextWindowFromBlocks(sceneBlocks(index, scene), reason, scene.heading, selectedText)
  return window
    ? {
      ...window,
      pageRange: { start: scene.pageStart, end: scene.pageEnd },
      sceneHeadings: [scene.heading],
    }
    : null
}

function sceneBlocksContainSpeakers(blocks: ScriptBlockIndex[], speakers: string[]): boolean {
  return speakers.length > 0 && sceneContainsSpeakers(blocks, speakers)
}

function sceneHeadingScore(scene: ScriptSceneIndex, queryTokens: string[]): number {
  if (!queryTokens.length) return 0

  const headingTokens = sceneQueryTokens(scene.heading)
  if (!headingTokens.length) return 0

  const headingTokenSet = new Set(headingTokens)
  const matchedTokens = queryTokens.filter(token => headingTokenSet.has(token))
  if (!matchedTokens.length) return 0

  const coverage = matchedTokens.length / Math.min(queryTokens.length, headingTokens.length)
  const strongTokenBonus = matchedTokens.some(token => token.length >= 5) ? 0.5 : 0
  return matchedTokens.length + coverage + strongTokenBonus
}

function overviewBlocksForScene(index: ScriptIndex, scene: ScriptSceneIndex): ScriptBlockIndex[] {
  const blocks = sceneBlocks(index, scene)
  const headingBlock = blocks.find(block => block.type === 'scene-heading')
  const firstActionBlock = blocks.find(block => block.type === 'action')
  const firstDialogueBlock = blocks.find(block => block.type === 'dialogue')
  return [headingBlock, firstActionBlock ?? firstDialogueBlock]
    .filter((block): block is ScriptBlockIndex => Boolean(block))
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
      blocks: sceneBlocks(index, scene),
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

export function getSceneContext(
  index: ScriptIndex,
  userMessage: string,
  requestedSpeakers: string[] = [],
): ScriptContextWindow | null {
  if (!index.scenes.length || !index.blocks.length) return null

  const normalizedMessage = normalizeName(userMessage)
  const explicitFirstScene = /\b(opening|first)\s+scene\b/.test(normalizedMessage)
  const explicitLastScene = /\b(final|last|ending)\s+scene\b/.test(normalizedMessage)
  const selectedScene = explicitFirstScene
    ? index.scenes[0]
    : explicitLastScene
      ? index.scenes[index.scenes.length - 1]
      : undefined

  if (selectedScene) {
    return contextWindowFromScene(index, selectedScene, 'requested-scene')
  }

  const queryTokens = sceneQueryTokens(userMessage)
  if (!queryTokens.length) return null

  const scoredScenes = index.scenes
    .map(scene => {
      const blocks = sceneBlocks(index, scene)
      const speakerBonus = sceneBlocksContainSpeakers(blocks, requestedSpeakers) ? 0.75 : 0
      return {
        scene,
        blocks,
        score: sceneHeadingScore(scene, queryTokens) + speakerBonus,
      }
    })
    .filter(result => result.score >= 1.5)
    .sort((a, b) => b.score - a.score || a.scene.index - b.scene.index)

  const best = scoredScenes[0]
  if (!best) return null

  return contextWindowFromScene(index, best.scene, 'requested-scene')
}

export function getScriptOverviewContext(index: ScriptIndex, maxScenes = 80): ScriptContextWindow | null {
  if (!index.blocks.length) return null

  const blocks = index.scenes.length
    ? index.scenes
      .slice(0, maxScenes)
      .flatMap(scene => overviewBlocksForScene(index, scene))
    : index.blocks.slice(0, maxScenes)

  const window = contextWindowFromBlocks(blocks, 'script-overview', 'Script overview')
  return window
    ? {
      ...window,
      pageRange: index.estimatedPageCount ? { start: 1, end: index.estimatedPageCount } : undefined,
      sceneHeadings: index.scenes.length
        ? index.scenes.slice(0, maxScenes).map(scene => scene.heading)
        : window.sceneHeadings,
    }
    : null
}

export function getPageRangeContext(
  index: ScriptIndex,
  startPage: number,
  endPage?: number,
): ScriptContextWindow | null {
  if (!index.blocks.length) return null
  const end = endPage ?? startPage
  const pageBlocks = index.blocks.filter(block => block.pageNumber <= end && block.pageEnd >= startPage)
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
    const focusedScene = focusedBlock.sceneId
      ? index.scenes.find(scene => scene.id === focusedBlock.sceneId)
      : undefined
    if (focusedScene) {
      return contextWindowFromScene(index, focusedScene, 'current-selection', selectedText)
    }
    return contextWindowFromBlocks(
      selectionBlocks,
      'current-selection',
      focusedBlock.sceneHeading ?? 'Current selection',
      selectedText,
    )
  }

  if (focusedBlock.sceneId) {
    const focusedScene = index.scenes.find(scene => scene.id === focusedBlock.sceneId)
    if (focusedScene) return contextWindowFromScene(index, focusedScene, 'current-scene')
  }

  const focusedBlockPosition = index.blocks.findIndex(block => block.index === focusedBlock.index)
  const nearbyBlocks = index.blocks.slice(Math.max(0, focusedBlockPosition - 3), focusedBlockPosition + 4)
  return contextWindowFromBlocks(nearbyBlocks, 'current-block', 'Current script position')
}
