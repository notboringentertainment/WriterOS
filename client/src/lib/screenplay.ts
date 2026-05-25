export type ElementType =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'

export const ELEMENT_LABELS: Record<ElementType, string> = {
  'scene-heading':  'Scene Heading',
  'action':         'Action',
  'character':      'Character',
  'dialogue':       'Dialogue',
  'parenthetical':  'Parenthetical',
  'transition':     'Transition',
}

export type ScreenplayBlankLines = 0 | 1

// WriterOS V1 matches Final Draft's tighter default: one blank line around
// scene breaks and cue changes, no extra blank line between action paragraphs.
export const SCREENPLAY_SPACING: Record<ElementType, Record<ElementType, ScreenplayBlankLines>> = {
  'scene-heading': {
    'scene-heading': 1,
    'action': 1,
    'character': 1,
    'dialogue': 1,
    'parenthetical': 1,
    'transition': 1,
  },
  'action': {
    'scene-heading': 1,
    'action': 0,
    'character': 1,
    'dialogue': 1,
    'parenthetical': 1,
    'transition': 1,
  },
  'character': {
    'scene-heading': 1,
    'action': 1,
    'character': 1,
    'dialogue': 0,
    'parenthetical': 0,
    'transition': 1,
  },
  'dialogue': {
    'scene-heading': 1,
    'action': 1,
    'character': 1,
    'dialogue': 0,
    'parenthetical': 0,
    'transition': 1,
  },
  'parenthetical': {
    'scene-heading': 1,
    'action': 1,
    'character': 1,
    'dialogue': 0,
    'parenthetical': 0,
    'transition': 1,
  },
  'transition': {
    'scene-heading': 1,
    'action': 1,
    'character': 1,
    'dialogue': 1,
    'parenthetical': 1,
    'transition': 1,
  },
}

const TAB_NEXT: Record<ElementType, ElementType> = {
  'scene-heading':  'action',
  'action':         'character',
  'character':      'dialogue',
  'dialogue':       'parenthetical',
  'parenthetical':  'dialogue',
  'transition':     'scene-heading',
}

const TAB_PREV: Record<ElementType, ElementType> = {
  'scene-heading':  'transition',
  'action':         'scene-heading',
  'character':      'action',
  'dialogue':       'character',
  'parenthetical':  'dialogue',
  'transition':     'parenthetical',
}

const ENTER_NEXT: Record<ElementType, ElementType> = {
  'scene-heading':  'action',
  'action':         'action',
  'character':      'dialogue',
  'dialogue':       'action',
  'parenthetical':  'dialogue',
  'transition':     'scene-heading',
}

const UPPERCASE_ELEMENTS = new Set<ElementType>(['scene-heading', 'character'])
const SENTENCE_CASE_ELEMENTS = new Set<ElementType>(['action', 'dialogue'])

export function getTabNext(type: ElementType): ElementType {
  return TAB_NEXT[type]
}

export function getTabPrev(type: ElementType): ElementType {
  return TAB_PREV[type]
}

export function getEnterNext(type: ElementType): ElementType {
  return ENTER_NEXT[type]
}

export function shouldUppercase(type: ElementType): boolean {
  return UPPERCASE_ELEMENTS.has(type)
}

export function shouldSentenceCapitalize(type: ElementType, textBeforeCursor: string): boolean {
  if (!SENTENCE_CASE_ELEMENTS.has(type)) return false

  const meaningfulBefore = textBeforeCursor.replace(/[\s"'“”‘’([{]+$/g, '')
  return meaningfulBefore === '' || /[.!?]$/.test(meaningfulBefore)
}

export function getScreenplaySpacingBefore(previousType: ElementType | null, currentType: ElementType): ScreenplayBlankLines {
  if (previousType === null) return 0
  return SCREENPLAY_SPACING[previousType]?.[currentType] ?? 0
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).filter(w => /\w/.test(w)).length
}

export function estimatePageCount(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 250))
}
