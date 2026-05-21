import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROJECT_TITLE,
  getDisplayProjectTitle,
  getProjectContextTitle,
  normalizeProjectTitle,
} from '../../client/src/lib/projectIdentity'

describe('projectIdentity', () => {
  it('normalizes whitespace around project titles', () => {
    expect(normalizeProjectTitle('  Lifeline  ')).toBe('Lifeline')
    expect(normalizeProjectTitle('Life\nLine')).toBe('Life Line')
  })

  it('treats the default display title as unset', () => {
    expect(normalizeProjectTitle(DEFAULT_PROJECT_TITLE)).toBe('')
  })

  it('returns a display fallback for unset titles', () => {
    expect(getDisplayProjectTitle('')).toBe(DEFAULT_PROJECT_TITLE)
    expect(getDisplayProjectTitle(undefined)).toBe(DEFAULT_PROJECT_TITLE)
  })

  it('omits unset titles from agent context', () => {
    expect(getProjectContextTitle('')).toBeUndefined()
    expect(getProjectContextTitle(DEFAULT_PROJECT_TITLE)).toBeUndefined()
    expect(getProjectContextTitle('Lifeline')).toBe('Lifeline')
  })
})
