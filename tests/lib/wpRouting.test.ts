import { describe, it, expect } from 'vitest'
import {
  SCRIPT_EXCERPT_WORD_LIMIT,
  parseMention,
  getDefaultPersona,
  formatWritingPartnerSpeaker,
  buildProjectContext,
  extractScriptContext,
} from '../../client/src/lib/wpRouting'
import { defaultProjectState } from '../../client/src/lib/projectState'

describe('parseMention', () => {
  it('returns null when no mention', () => {
    expect(parseMention('just a message')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseMention('')).toBeNull()
  })

  it('parses @WritingPartner as the general partner override', () => {
    const result = parseMention('@WritingPartner help me')
    expect(result).not.toBeNull()
    expect(result!.personaId).toBe('writingPartner')
    expect(result!.strippedText).toBe('help me')
  })

  it('parses @Partner as the general partner override', () => {
    const result = parseMention('@Partner stay broad')
    expect(result).not.toBeNull()
    expect(result!.personaId).toBe('writingPartner')
    expect(result!.strippedText).toBe('stay broad')
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

describe('formatWritingPartnerSpeaker', () => {
  it('labels general partner responses plainly', () => {
    expect(formatWritingPartnerSpeaker('writingPartner')).toBe('Writing Partner')
  })

  it('labels auto-routed specialist responses as writing partner delegates', () => {
    expect(formatWritingPartnerSpeaker('sam')).toBe('Writing Partner (@Sam)')
    expect(formatWritingPartnerSpeaker('oliver')).toBe('Writing Partner (@Oliver)')
    expect(formatWritingPartnerSpeaker('maya')).toBe('Writing Partner (@Maya)')
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
    expect(ctx.title).toBeUndefined()
    expect(ctx.genre).toBe('')
    expect(ctx.logline).toBe('')
    expect(ctx.characters).toEqual([])
    expect(ctx.synopsis.sections.setup).toBe('')
    expect(ctx.beats.length).toBeGreaterThan(0)
    expect(ctx.beats[0]).toMatchObject({ id: 'opening-image', name: 'Opening Image', notes: '' })
    expect(ctx.scenes).toEqual([])
    expect(ctx.script.excerpt).toBe('')
    expect(ctx.script.sceneHeadings).toEqual([])
    expect(ctx.script.excerptWordLimit).toBe(SCRIPT_EXCERPT_WORD_LIMIT)
    expect(ctx.script.totalWordCount).toBe(0)
    expect(ctx.script.estimatedPageCount).toBe(0)
    expect(ctx.script.sceneCount).toBe(0)
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

  it('maps real project title while omitting unset display fallback', () => {
    const state = defaultProjectState()
    state.meta.title = 'Lifeline'
    expect(buildProjectContext(state).title).toBe('Lifeline')

    state.meta.title = 'Untitled Project'
    expect(buildProjectContext(state).title).toBeUndefined()
  })

  it('maps synopsis sections and script scenes', () => {
    const state = defaultProjectState()
    state.synopsis.sections.midpoint = 'The hero wins but loses her ally.'
    state.script.scenes = [{ id: 'scene-1', heading: 'INT. OFFICE - NIGHT', index: 1 }]
    const ctx = buildProjectContext(state)
    expect(ctx.synopsis.sections.midpoint).toBe('The hero wins but loses her ally.')
    expect(ctx.scenes).toEqual([{ id: 'scene-1', heading: 'INT. OFFICE - NIGHT', index: 1 }])
  })

  it('maps plain script context from rawHtml', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. SAFEHOUSE - NIGHT</p>',
      '<p data-element-type="action">Isaiah grips the receiver.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear the line breathing.</p>',
    ].join('')

    const ctx = buildProjectContext(state)

    expect(ctx.script.excerpt).toContain('INT. SAFEHOUSE - NIGHT')
    expect(ctx.script.excerpt).toContain('I can still hear the line breathing.')
    expect(ctx.script.sceneHeadings).toEqual(['INT. SAFEHOUSE - NIGHT'])
    expect(ctx.script.dialogueSnippets).toEqual(['ISAIAH: I can still hear the line breathing.'])
    expect(ctx.script.actionSnippets).toEqual(['Isaiah grips the receiver.'])
    expect(ctx.script.characterNames).toEqual(['ISAIAH'])
    expect(ctx.script.totalWordCount).toBe(16)
    expect(ctx.script.estimatedPageCount).toBe(1)
    expect(ctx.script.sceneCount).toBe(1)
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

describe('extractScriptContext', () => {
  it('strips screenplay rawHtml into capped plain text and dialogue snippets', () => {
    const context = extractScriptContext([
      '<p data-element-type="scene-heading">INT. TRAIN - NIGHT</p>',
      '<p data-element-type="action">A red phone <strong>rings</strong> beneath the seat.</p>',
      '<p data-element-type="character">MARA</p>',
      '<p data-element-type="dialogue">Tell Isaiah the signal is alive.</p>',
      '<p data-element-type="parenthetical">(barely above a whisper)</p>',
      '<p data-element-type="dialogue">And tell him not to answer it.</p>',
    ].join(''))

    expect(context.excerpt).toBe([
      'INT. TRAIN - NIGHT',
      'A red phone rings beneath the seat.',
      'MARA',
      'Tell Isaiah the signal is alive.',
      '(barely above a whisper)',
      'And tell him not to answer it.',
    ].join('\n'))
    expect(context.dialogueSnippets).toEqual([
      'MARA: Tell Isaiah the signal is alive.',
      'MARA: And tell him not to answer it.',
    ])
    expect(context.sceneHeadings).toEqual(['INT. TRAIN - NIGHT'])
    expect(context.actionSnippets).toEqual(['A red phone rings beneath the seat.'])
    expect(context.excerptTruncated).toBe(false)
  })

  it('falls back to simple HTML stripping when no screenplay blocks are present', () => {
    const context = extractScriptContext('<section>Loose <strong>notes</strong><br>More notes</section>')

    expect(context.excerpt).toBe('Loose notes More notes')
    expect(context.sceneHeadings).toEqual([])
    expect(context.dialogueSnippets).toEqual([])
    expect(context.actionSnippets).toEqual([])
    expect(context.characterNames).toEqual([])
  })

  it('handles empty rawHtml', () => {
    expect(extractScriptContext('')).toMatchObject({
      excerpt: '',
      sceneHeadings: [],
      dialogueSnippets: [],
      actionSnippets: [],
      characterNames: [],
      excerptWordCount: 0,
      excerptTruncated: false,
    })
  })

  it('caps script excerpts to the first 500 words reproducibly', () => {
    const words = Array.from({ length: SCRIPT_EXCERPT_WORD_LIMIT + 5 }, (_, index) => `word${index}`)
    const context = extractScriptContext(`<p data-element-type="action">${words.join(' ')}</p>`)

    expect(context.excerptWordCount).toBe(SCRIPT_EXCERPT_WORD_LIMIT)
    expect(context.excerpt.split(/\s+/)).toHaveLength(SCRIPT_EXCERPT_WORD_LIMIT)
    expect(context.excerpt).toContain(`word${SCRIPT_EXCERPT_WORD_LIMIT - 1}`)
    expect(context.excerpt).not.toContain(`word${SCRIPT_EXCERPT_WORD_LIMIT}`)
    expect(context.excerptTruncated).toBe(true)
  })

  it('keeps later dialogue snippets available beyond the prompt sample limit', () => {
    const rawHtml = Array.from({ length: 13 }, (_, index) => [
      `<p data-element-type="character">CHAR${index}</p>`,
      `<p data-element-type="dialogue">Line ${index}</p>`,
    ].join('')).join('')

    const context = extractScriptContext(rawHtml)

    expect(context.dialogueSnippets).toHaveLength(13)
    expect(context.dialogueSnippets[12]).toBe('CHAR12: Line 12')
  })

  it('caps dialogue snippets at the script context list limit', () => {
    const rawHtml = Array.from({ length: 81 }, (_, index) => [
      `<p data-element-type="character">CHAR${index}</p>`,
      `<p data-element-type="dialogue">Line ${index}</p>`,
    ].join('')).join('')

    const context = extractScriptContext(rawHtml)

    expect(context.dialogueSnippets).toHaveLength(80)
    expect(context.dialogueSnippets[79]).toBe('CHAR79: Line 79')
    expect(context.dialogueSnippets).not.toContain('CHAR80: Line 80')
  })

  it('uses indexed scene retrieval when the request names later speakers', () => {
    const earlyScene = [
      '<p data-element-type="scene-heading">INT. PROLOGUE ROOM - NIGHT</p>',
      ...Array.from({ length: 85 }, (_, index) => [
        '<p data-element-type="character">ISAIAH</p>',
        `<p data-element-type="dialogue">Early line ${index}.</p>`,
      ].join('')),
    ].join('')
    const danteScene = [
      '<p data-element-type="scene-heading">INT. LIFELINE HQ - DANTE OFFICE - DAY</p>',
      '<p data-element-type="action">Dante shuts the office door.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">So it was you. You gave him my direct line.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')
    const state = defaultProjectState()
    state.script.rawHtml = earlyScene + danteScene

    const unfocused = buildProjectContext(state)
    const focused = buildProjectContext(state, 'Rate the dialogue between Isaiah and Dante.')

    expect(unfocused.script.dialogueSnippets).toHaveLength(80)
    expect(unfocused.script.dialogueSnippets).not.toContain('DANTE: Your war is over, brotha.')
    expect(focused.script.contextReason).toBe('requested-speakers')
    expect(focused.script.contextLabel).toBe('INT. LIFELINE HQ - DANTE OFFICE - DAY')
    expect(focused.script.sceneHeadings).toEqual(['INT. LIFELINE HQ - DANTE OFFICE - DAY'])
    expect(focused.script.dialogueSnippets).toEqual([
      'ISAIAH: So it was you. You gave him my direct line.',
      'DANTE: Your war is over, brotha.',
    ])
    expect(focused.script.actionSnippets).toEqual(['Dante shuts the office door.'])
    expect(focused.script.excerpt).toContain('Dante shuts the office door.')
    expect(focused.script.excerpt).not.toContain('Early line 0.')
  })

  it('uses current scene focus for current-scene requests', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">The emergency line rings.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear it breathing.</p>',
      '<p data-element-type="scene-heading">EXT. FREEWAY - NIGHT</p>',
      '<p data-element-type="action">Traffic freezes.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'What about this scene?', {
      script: {
        rawHtml: state.script.rawHtml,
        scenes: [],
        focus: { blockIndex: 2, updatedAt: 1 },
      },
    })

    expect(ctx.script.contextReason).toBe('current-scene')
    expect(ctx.script.contextLabel).toBe('INT. CALL CENTER - NIGHT')
    expect(ctx.script.sceneHeadings).toEqual(['INT. CALL CENTER - NIGHT'])
    expect(ctx.script.dialogueSnippets).toEqual(['ISAIAH: I can still hear it breathing.'])
    expect(ctx.script.excerpt).not.toContain('EXT. FREEWAY - NIGHT')
  })

  it('does not leak unrelated dialogue into an action-only focused scene', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. EMPTY HALL - NIGHT</p>',
      '<p data-element-type="action">The light above the elevator flickers.</p>',
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'What about this scene?', {
      script: {
        rawHtml: state.script.rawHtml,
        scenes: [],
        focus: { blockIndex: 1, updatedAt: 1 },
      },
    })

    expect(ctx.script.contextReason).toBe('current-scene')
    expect(ctx.script.contextLabel).toBe('INT. EMPTY HALL - NIGHT')
    expect(ctx.script.dialogueSnippets).toEqual([])
    expect(ctx.script.actionSnippets).toEqual(['The light above the elevator flickers.'])
    expect(ctx.script.excerpt).not.toContain('Your war is over')
  })

  it('does not treat bare "this" as a current-focus request', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. FOCUSED ROOM - NIGHT</p>',
      '<p data-element-type="action">The phone rings.</p>',
      '<p data-element-type="scene-heading">EXT. OTHER STREET - DAY</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Is this working?', {
      script: {
        rawHtml: state.script.rawHtml,
        scenes: [],
        focus: { blockIndex: 1, updatedAt: 1 },
      },
    })

    expect(ctx.script.contextReason).toBeUndefined()
    expect(ctx.script.sceneHeadings).toEqual(['INT. FOCUSED ROOM - NIGHT', 'EXT. OTHER STREET - DAY'])
    expect(ctx.script.dialogueSnippets).toEqual(['DANTE: Your war is over, brotha.'])
  })

  it('privileges selected script text when present', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="action">Dante closes the blinds.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Polish this line.', {
      script: {
        rawHtml: state.script.rawHtml,
        scenes: [],
        focus: { blockIndex: 3, selectedText: 'Your war is over', updatedAt: 1 },
      },
    })

    expect(ctx.script.contextReason).toBe('current-selection')
    expect(ctx.script.selectedText).toBe('Your war is over')
    expect(ctx.script.dialogueSnippets).toEqual(['DANTE: Your war is over, brotha.'])
  })
})
