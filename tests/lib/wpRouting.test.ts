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
    expect(ctx.synopsis.sections.setup).toBe('')
    expect(ctx.beats.length).toBeGreaterThan(0)
    expect(ctx.beats[0]).toMatchObject({ id: 'opening-image', name: 'Opening Image', notes: '' })
    expect(ctx.scenes).toEqual([])
    expect(ctx.world.setting).toBe('')
    expect(ctx.storyBible.themes).toBe('')
    expect(ctx.storyBible.rules).toBe('')
  })

  it('maps character details', () => {
    const state = defaultProjectState()
    state.storyBible.characters = [
      { id: '1', name: 'Alice', role: 'Hero', wound: 'Lost her sister', want: 'Justice', need: 'Mercy', arc: 'Learns restraint' },
      { id: '2', name: 'Bob', role: 'Mentor', wound: '', want: '', need: '', arc: '' },
    ]
    const ctx = buildProjectContext(state)
    expect(ctx.characters).toEqual([
      { id: '1', name: 'Alice', role: 'Hero', wound: 'Lost her sister', want: 'Justice', need: 'Mercy', arc: 'Learns restraint' },
      { id: '2', name: 'Bob', role: 'Mentor', wound: '', want: '', need: '', arc: '' },
    ])
  })

  it('maps beat details and notes', () => {
    const state = defaultProjectState()
    state.outline.beats[0].notes = 'Open on the hero alone in rain.'
    const ctx = buildProjectContext(state)
    expect(ctx.beats[0]).toMatchObject({
      id: 'opening-image',
      name: 'Opening Image',
      notes: 'Open on the hero alone in rain.',
    })
  })

  it('maps world and story bible fields', () => {
    const state = defaultProjectState()
    state.storyBible.world.setting = 'Near-future Tokyo'
    state.storyBible.world.toneAnchors = 'Michael Mann meets Arrival'
    state.storyBible.world.voiceNotes = 'Spare, procedural, intimate'
    state.storyBible.themes = 'Grief can become civic courage.'
    state.storyBible.rules = 'Surveillance drones cannot enter temples.'
    expect(buildProjectContext(state).world.setting).toBe('Near-future Tokyo')
    expect(buildProjectContext(state).world.toneAnchors).toBe('Michael Mann meets Arrival')
    expect(buildProjectContext(state).storyBible.world.voiceNotes).toBe('Spare, procedural, intimate')
    expect(buildProjectContext(state).storyBible.themes).toBe('Grief can become civic courage.')
    expect(buildProjectContext(state).storyBible.rules).toBe('Surveillance drones cannot enter temples.')
  })

  it('maps logline from synopsis', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'A hero rises.'
    expect(buildProjectContext(state).logline).toBe('A hero rises.')
    expect(buildProjectContext(state).synopsis.logline).toBe('A hero rises.')
  })

  it('maps synopsis sections and script scenes', () => {
    const state = defaultProjectState()
    state.synopsis.sections.midpoint = 'The hero wins but loses her ally.'
    state.script.scenes = [{ id: 'scene-1', heading: 'INT. OFFICE - NIGHT', index: 1 }]
    const ctx = buildProjectContext(state)
    expect(ctx.synopsis.sections.midpoint).toBe('The hero wins but loses her ally.')
    expect(ctx.scenes).toEqual([{ id: 'scene-1', heading: 'INT. OFFICE - NIGHT', index: 1 }])
  })

  it('defaults sparse legacy story bible fields to empty strings', () => {
    const state = defaultProjectState() as any
    delete state.storyBible.themes
    delete state.storyBible.rules
    delete state.storyBible.world.toneAnchors
    delete state.storyBible.world.voiceNotes

    const ctx = buildProjectContext(state)

    expect(ctx.storyBible.themes).toBe('')
    expect(ctx.storyBible.rules).toBe('')
    expect(ctx.world.toneAnchors).toBe('')
    expect(ctx.world.voiceNotes).toBe('')
  })
})
