import { describe, it, expect } from 'vitest'
import {
  getTabNext,
  getTabPrev,
  getEnterNext,
  shouldUppercase,
  shouldSentenceCapitalize,
  getScreenplaySpacingBefore,
  getIndent,
  normalizeElementType,
  SCREENPLAY_SPACING,
  SCREENPLAY_INDENTS,
  countWords,
  estimatePageCount,
  ELEMENT_LABELS,
  type ElementType,
} from '../../client/src/lib/screenplay'

describe('getTabNext — Tab cycles to next element', () => {
  it('scene-heading → action', () => expect(getTabNext('scene-heading')).toBe('action'))
  it('action → character', () => expect(getTabNext('action')).toBe('character'))
  it('character → dialogue', () => expect(getTabNext('character')).toBe('dialogue'))
  it('dialogue → parenthetical', () => expect(getTabNext('dialogue')).toBe('parenthetical'))
  it('parenthetical → dialogue', () => expect(getTabNext('parenthetical')).toBe('dialogue'))
  it('transition → scene-heading', () => expect(getTabNext('transition')).toBe('scene-heading'))
})

describe('getTabPrev — Shift+Tab reverses', () => {
  it('action → scene-heading', () => expect(getTabPrev('action')).toBe('scene-heading'))
  it('scene-heading → transition', () => expect(getTabPrev('scene-heading')).toBe('transition'))
  it('character → action', () => expect(getTabPrev('character')).toBe('action'))
  it('dialogue → character', () => expect(getTabPrev('dialogue')).toBe('character'))
  it('parenthetical → dialogue', () => expect(getTabPrev('parenthetical')).toBe('dialogue'))
  it('transition → parenthetical', () => expect(getTabPrev('transition')).toBe('parenthetical'))
})

describe('getEnterNext — Enter creates next element', () => {
  it('scene-heading → action', () => expect(getEnterNext('scene-heading')).toBe('action'))
  it('action → action', () => expect(getEnterNext('action')).toBe('action'))
  it('character → dialogue', () => expect(getEnterNext('character')).toBe('dialogue'))
  it('dialogue → action', () => expect(getEnterNext('dialogue')).toBe('action'))
  it('parenthetical → dialogue', () => expect(getEnterNext('parenthetical')).toBe('dialogue'))
  it('transition → scene-heading', () => expect(getEnterNext('transition')).toBe('scene-heading'))
})

describe('shouldUppercase', () => {
  it('scene-heading → true', () => expect(shouldUppercase('scene-heading')).toBe(true))
  it('character → true', () => expect(shouldUppercase('character')).toBe(true))
  it('action → false', () => expect(shouldUppercase('action')).toBe(false))
  it('dialogue → false', () => expect(shouldUppercase('dialogue')).toBe(false))
  it('parenthetical → false', () => expect(shouldUppercase('parenthetical')).toBe(false))
  it('transition → true (was a CSS-only lie before Slice C)', () =>
    expect(shouldUppercase('transition')).toBe(true))
})

describe('shouldSentenceCapitalize', () => {
  it('capitalizes at the start of action', () => {
    expect(shouldSentenceCapitalize('action', '')).toBe(true)
  })

  it('capitalizes at the start of dialogue', () => {
    expect(shouldSentenceCapitalize('dialogue', '')).toBe(true)
  })

  it('capitalizes after sentence-ending punctuation', () => {
    expect(shouldSentenceCapitalize('action', 'He stops. ')).toBe(true)
    expect(shouldSentenceCapitalize('dialogue', 'What? "')).toBe(true)
  })

  it('does not capitalize after mid-sentence text', () => {
    expect(shouldSentenceCapitalize('action', 'He ')).toBe(false)
    expect(shouldSentenceCapitalize('dialogue', 'I am ')).toBe(false)
  })

  it('does not sentence-capitalize non-action elements', () => {
    expect(shouldSentenceCapitalize('scene-heading', '')).toBe(false)
    expect(shouldSentenceCapitalize('character', '')).toBe(false)
    expect(shouldSentenceCapitalize('parenthetical', '')).toBe(false)
  })
})

describe('screenplay spacing', () => {
  it('uses one Final Draft-style blank line after scene headings before action', () => {
    expect(getScreenplaySpacingBefore('scene-heading', 'action')).toBe(1)
  })

  it('keeps action paragraphs single-spaced without extra blank lines', () => {
    expect(getScreenplaySpacingBefore('action', 'action')).toBe(0)
  })

  it('breathes between action and character cues', () => {
    expect(getScreenplaySpacingBefore('action', 'character')).toBe(1)
  })

  it('keeps dialogue blocks tight under cues and parentheticals', () => {
    expect(getScreenplaySpacingBefore('character', 'dialogue')).toBe(0)
    expect(getScreenplaySpacingBefore('character', 'parenthetical')).toBe(0)
    expect(getScreenplaySpacingBefore('parenthetical', 'dialogue')).toBe(0)
  })

  it('adds one blank line before the next block after dialogue', () => {
    expect(getScreenplaySpacingBefore('dialogue', 'action')).toBe(1)
    expect(getScreenplaySpacingBefore('dialogue', 'character')).toBe(1)
    expect(getScreenplaySpacingBefore('dialogue', 'scene-heading')).toBe(1)
  })

  it('does not add space before the first screenplay block', () => {
    expect(getScreenplaySpacingBefore(null, 'scene-heading')).toBe(0)
    expect(getScreenplaySpacingBefore(null, 'action')).toBe(0)
  })

  it('falls back safely for stored element types outside the spacing table', () => {
    expect(getScreenplaySpacingBefore('future-type' as never, 'action')).toBe(0)
    expect(getScreenplaySpacingBefore('action', 'future-type' as never)).toBe(0)
  })

  it('keeps the Slice A spacing scale to zero or one blank line', () => {
    for (const row of Object.values(SCREENPLAY_SPACING)) {
      expect(Object.values(row).every(value => value === 0 || value === 1)).toBe(true)
    }
  })
})

describe('SCREENPLAY_INDENTS layout table', () => {
  const allTypes: ElementType[] = [
    'scene-heading',
    'action',
    'character',
    'dialogue',
    'parenthetical',
    'transition',
  ]

  it('defines an entry for every element type', () => {
    for (const type of allTypes) {
      expect(SCREENPLAY_INDENTS[type]).toBeDefined()
    }
  })

  it('keeps scene-heading and action flush with the action column', () => {
    expect(SCREENPLAY_INDENTS['scene-heading']).toEqual({
      marginLeftEm: 0,
      marginRightEm: 0,
      textAlign: 'left',
    })
    expect(SCREENPLAY_INDENTS['action']).toEqual({
      marginLeftEm: 0,
      marginRightEm: 0,
      textAlign: 'left',
    })
  })

  it('indents character, dialogue, and parenthetical per WGA layout', () => {
    expect(SCREENPLAY_INDENTS['character'].marginLeftEm).toBeGreaterThan(
      SCREENPLAY_INDENTS['parenthetical'].marginLeftEm
    )
    expect(SCREENPLAY_INDENTS['parenthetical'].marginLeftEm).toBeGreaterThan(
      SCREENPLAY_INDENTS['dialogue'].marginLeftEm
    )
    expect(SCREENPLAY_INDENTS['parenthetical'].marginRightEm).toBeGreaterThan(
      SCREENPLAY_INDENTS['dialogue'].marginRightEm
    )
  })

  it('right-aligns transitions, left-aligns everything else', () => {
    expect(SCREENPLAY_INDENTS['transition'].textAlign).toBe('right')
    for (const type of allTypes) {
      if (type === 'transition') continue
      expect(SCREENPLAY_INDENTS[type].textAlign).toBe('left')
    }
  })

  it('uses non-negative em values for every margin', () => {
    for (const type of allTypes) {
      const indent = SCREENPLAY_INDENTS[type]
      expect(indent.marginLeftEm).toBeGreaterThanOrEqual(0)
      expect(indent.marginRightEm).toBeGreaterThanOrEqual(0)
    }
  })

  it('getIndent returns the table entry for the type', () => {
    expect(getIndent('character')).toBe(SCREENPLAY_INDENTS['character'])
    expect(getIndent('dialogue')).toBe(SCREENPLAY_INDENTS['dialogue'])
  })
})

describe('normalizeElementType', () => {
  it('keeps known element types and falls back to action for unknown stored values', () => {
    expect(normalizeElementType('dialogue')).toBe('dialogue')
    expect(normalizeElementType('future-type')).toBe('action')
    expect(normalizeElementType('__proto__')).toBe('action')
    expect(normalizeElementType(null)).toBe('action')
  })
})

describe('countWords', () => {
  it('empty string = 0', () => expect(countWords('')).toBe(0))
  it('whitespace only = 0', () => expect(countWords('   ')).toBe(0))
  it('single word = 1', () => expect(countWords('INT.')).toBe(1))
  it('counts words in scene heading', () => expect(countWords('INT. THE ROOM - DAY')).toBe(4))
})

describe('estimatePageCount', () => {
  it('0 words = 1 page', () => expect(estimatePageCount(0)).toBe(1))
  it('250 words ≈ 1 page', () => expect(estimatePageCount(250)).toBe(1))
  it('500 words ≈ 2 pages', () => expect(estimatePageCount(500)).toBe(2))
  it('1250 words ≈ 5 pages', () => expect(estimatePageCount(1250)).toBe(5))
})

describe('ELEMENT_LABELS', () => {
  it('has label for all 6 element types', () => {
    expect(ELEMENT_LABELS['scene-heading']).toBe('Scene Heading')
    expect(ELEMENT_LABELS['action']).toBe('Action')
    expect(ELEMENT_LABELS['character']).toBe('Character')
    expect(ELEMENT_LABELS['dialogue']).toBe('Dialogue')
    expect(ELEMENT_LABELS['parenthetical']).toBe('Parenthetical')
    expect(ELEMENT_LABELS['transition']).toBe('Transition')
  })
})
