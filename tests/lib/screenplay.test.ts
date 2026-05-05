import { describe, it, expect } from 'vitest'
import {
  getTabNext,
  getTabPrev,
  getEnterNext,
  shouldUppercase,
  countWords,
  estimatePageCount,
  ELEMENT_LABELS,
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
  it('transition → false', () => expect(shouldUppercase('transition')).toBe(false))
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
