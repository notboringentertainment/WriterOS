import { describe, it, expect } from 'vitest'
import { parseMention, getDefaultPersona, buildProjectContext } from '../../client/src/lib/wpRouting'
import { defaultProjectState } from '../../client/src/lib/projectState'

describe('parseMention', () => {
  it('returns null when no mention', () => {
    expect(parseMention('just a message')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseMention('')).toBeNull()
  })

  it('returns null for @writingPartner mention', () => {
    expect(parseMention('@WritingPartner help me')).toBeNull()
  })

  it('returns null for unknown mention', () => {
    expect(parseMention('@unknown help')).toBeNull()
  })

  it('returns null when mention is not leading', () => {
    expect(parseMention('hello @sam can you')).toBeNull()
  })

  it('parses @Sam case-insensitive', () => {
    const result = parseMention('@Sam help with structure')
    expect(result).not.toBeNull()
    expect(result!.personaId).toBe('sam')
    expect(result!.strippedText).toBe('help with structure')
  })

  it('parses @sam lowercase', () => {
    expect(parseMention('@sam ideas')!.personaId).toBe('sam')
  })

  it('parses @SAM uppercase', () => {
    expect(parseMention('@SAM ideas')!.personaId).toBe('sam')
  })

  it('parses @Casey', () => {
    expect(parseMention('@Casey who is the protagonist?')!.personaId).toBe('casey')
  })

  it('parses @Oliver', () => {
    expect(parseMention('@Oliver check my outline')!.personaId).toBe('oliver')
  })

  it('parses @Maya', () => {
    expect(parseMention('@Maya what tone should this have?')!.personaId).toBe('maya')
  })

  it('parses @Zoe', () => {
    expect(parseMention('@Zoe describe my world')!.personaId).toBe('zoe')
  })

  it('parses @Alex', () => {
    expect(parseMention('@Alex big picture?')!.personaId).toBe('alex')
  })

  it('strips the leading @Mention from strippedText', () => {
    expect(parseMention('@Oliver check this')!.strippedText).toBe('check this')
  })

  it('handles mention with no trailing text', () => {
    const result = parseMention('@Sam')
    expect(result).not.toBeNull()
    expect(result!.personaId).toBe('sam')
    expect(result!.strippedText).toBe('')
  })
})

describe('getDefaultPersona', () => {
  it('script tab -> writingPartner', () => {
    expect(getDefaultPersona('script', null)).toBe('writingPartner')
  })

  it('synopsis tab -> sam', () => {
    expect(getDefaultPersona('synopsis', null)).toBe('sam')
  })

  it('outline tab -> oliver', () => {
    expect(getDefaultPersona('outline', null)).toBe('oliver')
  })

  it('story-bible + world section -> zoe', () => {
    expect(getDefaultPersona('story-bible', 'world')).toBe('zoe')
  })

  it('story-bible + rules section -> zoe', () => {
    expect(getDefaultPersona('story-bible', 'rules')).toBe('zoe')
  })

  it('story-bible + characters section -> casey', () => {
    expect(getDefaultPersona('story-bible', 'characters')).toBe('casey')
  })

  it('story-bible + themes section -> casey', () => {
    expect(getDefaultPersona('story-bible', 'themes')).toBe('casey')
  })

  it('story-bible + tone section -> casey', () => {
    expect(getDefaultPersona('story-bible', 'tone')).toBe('casey')
  })

  it('story-bible + null section -> casey', () => {
    expect(getDefaultPersona('story-bible', null)).toBe('casey')
  })
})

describe('buildProjectContext', () => {
  it('maps empty default state', () => {
    const ctx = buildProjectContext(defaultProjectState())
    expect(ctx.title).toBe('Untitled Project')
    expect(ctx.genre).toBe('')
    expect(ctx.logline).toBe('')
    expect(ctx.characters).toEqual([])
    expect(ctx.beats.length).toBeGreaterThan(0)
    expect(ctx.world.setting).toBe('')
  })

  it('maps character names', () => {
    const state = defaultProjectState()
    state.storyBible.characters = [
      { id: '1', name: 'Alice', role: 'Hero', wound: '', want: '', need: '', arc: '' },
      { id: '2', name: 'Bob', role: 'Mentor', wound: '', want: '', need: '', arc: '' },
    ]
    const ctx = buildProjectContext(state)
    expect(ctx.characters).toEqual(['Alice', 'Bob'])
  })

  it('maps beat names', () => {
    const ctx = buildProjectContext(defaultProjectState())
    expect(ctx.beats).toContain('Opening Image')
  })

  it('maps world setting', () => {
    const state = defaultProjectState()
    state.storyBible.world.setting = 'Near-future Tokyo'
    expect(buildProjectContext(state).world.setting).toBe('Near-future Tokyo')
  })

  it('maps logline from synopsis', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'A hero rises.'
    expect(buildProjectContext(state).logline).toBe('A hero rises.')
  })
})
