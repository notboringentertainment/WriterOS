import { describe, it, expect } from 'vitest'
import {
  SCRIPT_EXCERPT_WORD_LIMIT,
  parseMention,
  parseOpenSwarmCommand,
  getDefaultPersona,
  getActiveHelperText,
  formatWritingPartnerSpeaker,
  buildProjectContext,
  extractScriptContext,
} from '../../client/src/lib/wpRouting'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { rebuildScriptFactsCache } from '../../client/src/lib/scriptFacts'

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

describe('parseOpenSwarmCommand', () => {
  it('returns null for normal Writing Partner chat', () => {
    expect(parseOpenSwarmCommand('does this scene work?')).toBeNull()
  })

  it('parses /swarm as an OpenSwarm Writing Partner command', () => {
    expect(parseOpenSwarmCommand('/swarm review this premise')).toBe('review this premise')
  })

  it('parses /openswarm case-insensitively', () => {
    expect(parseOpenSwarmCommand('/OpenSwarm compare this to recent films')).toBe('compare this to recent films')
  })

  it('returns null when the command has no task text', () => {
    expect(parseOpenSwarmCommand('/swarm')).toBeNull()
  })
})

describe('formatWritingPartnerSpeaker', () => {
  it('labels general partner responses plainly', () => {
    expect(formatWritingPartnerSpeaker('writingPartner')).toBe('Morgan')
  })

  it('labels auto-routed specialist responses as writing partner delegates', () => {
    expect(formatWritingPartnerSpeaker('sam')).toBe('Morgan (@Sam)')
    expect(formatWritingPartnerSpeaker('oliver')).toBe('Morgan (@Oliver)')
    expect(formatWritingPartnerSpeaker('maya')).toBe('Morgan (@Maya)')
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

  it('treatment tab -> alex', () => {
    expect(getDefaultPersona('treatment', null)).toBe('alex')
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

  it('story-bible + world section + character psychology message -> casey', () => {
    expect(getDefaultPersona('story-bible', 'world', "What about Isaiah's state of mind?")).toBe('casey')
  })

  it('story-bible + rules section + motivation message -> casey', () => {
    expect(getDefaultPersona('story-bible', 'rules', 'What is Zalmai motivated by?')).toBe('casey')
  })

  it('story-bible + characters section + world message -> zoe', () => {
    expect(getDefaultPersona('story-bible', 'characters', 'How should the celebrity protection world work?')).toBe('zoe')
  })

  it('story-bible + characters section + rules message -> zoe', () => {
    expect(getDefaultPersona('story-bible', 'characters', 'What are the rules of Lifeline security?')).toBe('zoe')
  })
})

describe('getActiveHelperText', () => {
  it('uses Writing Partner directly on script', () => {
    expect(getActiveHelperText('', 'script', null)).toBe('Morgan')
  })

  it('uses Morgan directly by default on all writing surfaces', () => {
    expect(getActiveHelperText('', 'script', null)).toBe('Morgan')
    expect(getActiveHelperText('', 'synopsis', null)).toBe('Morgan')
    expect(getActiveHelperText('', 'outline', null)).toBe('Morgan')
    expect(getActiveHelperText('', 'treatment', null)).toBe('Morgan')
    expect(getActiveHelperText('', 'story-bible', 'characters')).toBe('Morgan')
    expect(getActiveHelperText('', 'story-bible', 'world')).toBe('Morgan')
  })

  it('lets a typed manual mention override the surface hint', () => {
    expect(getActiveHelperText('@Maya help with this exchange', 'synopsis', null)).toBe('Morgan will ask @Maya')
    expect(getActiveHelperText('  @Partner stay broad', 'outline', null)).toBe('Morgan')
  })

  it('shows OpenSwarm Writing Partner for /swarm commands', () => {
    expect(getActiveHelperText('/swarm review this premise', 'synopsis', null)).toBe('OpenSwarm Writing Partner')
  })

  it('does not infer specialist delegation from plain Story Bible message intent', () => {
    expect(getActiveHelperText("What about Isaiah's state of mind?", 'story-bible', 'world')).toBe('Morgan')
    expect(getActiveHelperText('How do the rules of this world work?', 'story-bible', 'characters')).toBe('Morgan')
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
    expect(ctx.beats).toEqual([])
    expect(ctx.treatment.logline).toBe('')
    expect(ctx.treatment.concept.premise).toBe('')
    expect(ctx.scenes).toEqual([])
    expect(ctx.script.excerpt).toBe('')
    expect(ctx.script.sceneHeadings).toEqual([])
    expect(ctx.script.excerptWordLimit).toBe(SCRIPT_EXCERPT_WORD_LIMIT)
    expect(ctx.script.totalWordCount).toBe(0)
    expect(ctx.script.estimatedPageCount).toBe(1)
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

  it('maps outline document answers instead of stale legacy beats', () => {
    const state = defaultProjectState()
    state.outline.beats[0].notes = 'Stale legacy note agents should not see.'
    const unit = createOutlineUnit('feature.incitingIncident')
    unit.whatHappens = 'Sara hears a rescue call from a missing patient.'
    unit.consequence = 'She has to answer even though the system warns her off.'
    state.documents.outline.content.spine.protagonist = 'Sara'
    state.documents.outline.content.units = [unit]

    const ctx = buildProjectContext(state)

    expect(ctx.beats[0]).toMatchObject({
      id: 'outline-spine',
      name: 'Story spine',
      notes: expect.stringContaining('Sara'),
    })
    expect(ctx.beats[1]).toMatchObject({
      id: 'feature.incitingIncident',
      name: 'Inciting incident',
    })
    expect(ctx.beats[1].notes).toContain('Sara hears a rescue call')
    expect(ctx.beats[1].notes).toContain('She has to answer')
    expect(JSON.stringify(ctx.beats)).not.toContain('Stale legacy note')
  })

  it('maps treatment document prose for Alex and broad story-flow context', () => {
    const state = defaultProjectState()
    state.documents.treatment.content.logline = 'A medic hears impossible calls from missing patients.'
    state.documents.treatment.content.concept.premise = 'A rescue network is choosing who gets saved.'
    state.documents.treatment.content.prose.opening = 'Sara ends a night shift as the silent emergency line rings.'
    state.documents.treatment.content.visualAndTonal.pacing = 'Procedural pressure with slow dread.'

    const ctx = buildProjectContext(state)

    expect(ctx.treatment.logline).toBe('A medic hears impossible calls from missing patients.')
    expect(ctx.treatment.concept.premise).toBe('A rescue network is choosing who gets saved.')
    expect(ctx.treatment.prose.opening).toBe('Sara ends a night shift as the silent emergency line rings.')
    expect(ctx.treatment.visualAndTonal.pacing).toBe('Procedural pressure with slow dread.')
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

  it('maps current Script Facts into script context for agent grounding', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. SAFEHOUSE - NIGHT</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear the line breathing.</p>',
      '<p data-element-type="scene-heading">EXT. FREEWAY - DAWN</p>',
    ].join('')
    state.script.facts = rebuildScriptFactsCache(state.script.rawHtml, '2026-06-02T10:00:00.000Z')

    const ctx = buildProjectContext(state)

    expect(ctx.script.facts).toEqual({
      rebuiltAt: '2026-06-02T10:00:00.000Z',
      characters: [{ label: 'ISAIAH', count: 1 }],
      locations: [
        { label: 'EXT. FREEWAY - DAWN', count: 1 },
        { label: 'INT. SAFEHOUSE - NIGHT', count: 1 },
      ],
      times: [
        { label: 'DAWN', count: 1 },
        { label: 'NIGHT', count: 1 },
      ],
    })
  })

  it('omits stale Script Facts from script context after script changes', () => {
    const state = defaultProjectState()
    const originalHtml = '<p data-element-type="character">ISAIAH</p>'
    state.script.rawHtml = '<p data-element-type="character">DANTE</p>'
    state.script.facts = rebuildScriptFactsCache(originalHtml, '2026-06-02T10:00:00.000Z')

    const ctx = buildProjectContext(state)

    expect(ctx.script.facts).toBeUndefined()
    expect(ctx.script.characterNames).toEqual(['DANTE'])
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

  it('uses requested-scene context when the user names a scene heading', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">The phones blink in the dark.</p>',
      '<p data-element-type="scene-heading">EXT. ROOFTOP - DAY</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">End of the line.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Can you review the rooftop scene?')

    expect(ctx.script.contextReason).toBe('requested-scene')
    expect(ctx.script.contextLabel).toBe('EXT. ROOFTOP - DAY')
    expect(ctx.script.sceneHeadings).toEqual(['EXT. ROOFTOP - DAY'])
    expect(ctx.script.dialogueSnippets).toEqual(['ISAIAH: End of the line.'])
    expect(ctx.script.excerpt).not.toContain('The phones blink in the dark.')
  })

  it('uses scene wording to choose the named exchange over an earlier speaker match', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. PROLOGUE ROOM - NIGHT</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">Early line.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Early answer.</p>',
      '<p data-element-type="scene-heading">INT. LIFELINE HQ - DANTE OFFICE - DAY</p>',
      '<p data-element-type="action">Dante shuts the office door.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">So it was you.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Rate Isaiah and Dante in the office exchange.')

    expect(ctx.script.contextReason).toBe('requested-scene')
    expect(ctx.script.contextLabel).toBe('INT. LIFELINE HQ - DANTE OFFICE - DAY')
    expect(ctx.script.dialogueSnippets).toEqual([
      'ISAIAH: So it was you.',
      'DANTE: Your war is over, brotha.',
    ])
    expect(ctx.script.excerpt).not.toContain('Early line.')
  })

  it('falls back to speaker retrieval when scene wording has no heading match', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear it breathing.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Then stop listening.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Rate the rooftop exchange between Isaiah and Dante.')

    expect(ctx.script.contextReason).toBe('requested-speakers')
    expect(ctx.script.contextLabel).toBe('INT. CALL CENTER - NIGHT')
    expect(ctx.script.dialogueSnippets).toEqual([
      'ISAIAH: I can still hear it breathing.',
      'DANTE: Then stop listening.',
    ])
  })

  it('keeps explicit page requests ahead of scene requests', () => {
    const state = defaultProjectState()
    // 54 single-line actions fill page 1 under screenplay layout; the next
    // scene starts page 2.
    const fillerHtml = Array.from({ length: 54 }, (_, i) =>
      `<p data-element-type="action">filler${i}</p>`
    ).join('')
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="action">The first office scene waits.</p>',
      fillerHtml,
      '<p data-element-type="scene-heading">EXT. ROOFTOP - DAY</p>',
      '<p data-element-type="action">Wind snaps across the roof.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'What happens on page 2 in the office scene?')

    expect(ctx.script.contextReason).toBe('requested-page-range')
    expect(ctx.script.contextLabel).toBe('Page 2')
    expect(ctx.script.excerpt).not.toContain('The first office scene waits.')
  })

  it('uses script overview context for broad whole-script questions', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">Isaiah answers the emergency line.</p>',
      '<p data-element-type="scene-heading">EXT. FREEWAY - DAWN</p>',
      '<p data-element-type="action">Traffic opens under a bruised sky.</p>',
      '<p data-element-type="scene-heading">INT. DANTE OFFICE - DAY</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'What are the weak spots in the script overall?')

    expect(ctx.script.contextReason).toBe('script-overview')
    expect(ctx.script.contextLabel).toBe('Script overview')
    expect(ctx.script.sceneHeadings).toEqual([
      'INT. CALL CENTER - NIGHT',
      'EXT. FREEWAY - DAWN',
      'INT. DANTE OFFICE - DAY',
    ])
    expect(ctx.script.actionSnippets).toEqual([
      'Isaiah answers the emergency line.',
      'Traffic opens under a bruised sky.',
    ])
    expect(ctx.script.excerpt).toContain('EXT. FREEWAY - DAWN')
  })

  it('uses script overview before speaker windows for broad arc questions', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear it breathing.</p>',
      '<p data-element-type="scene-heading">INT. DANTE OFFICE - DAY</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">So it was you.</p>',
    ].join('')

    const ctx = buildProjectContext(state, "Does Isaiah's arc track across the draft?")

    expect(ctx.script.contextReason).toBe('script-overview')
    expect(ctx.script.sceneHeadings).toEqual(['INT. CALL CENTER - NIGHT', 'INT. DANTE OFFICE - DAY'])
  })

  it('keeps dialogue-specific speaker requests on speaker retrieval', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear it breathing.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Then stop listening.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Rate the dialogue between Isaiah and Dante.')

    expect(ctx.script.contextReason).toBe('requested-speakers')
    expect(ctx.script.dialogueSnippets).toEqual([
      'ISAIAH: I can still hear it breathing.',
      'DANTE: Then stop listening.',
    ])
  })

  it('keeps selected script text ahead of broad overview wording', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">Isaiah answers the emergency line.</p>',
      '<p data-element-type="scene-heading">EXT. FREEWAY - DAWN</p>',
      '<p data-element-type="action">Traffic opens under a bruised sky.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Does this overall moment work?', {
      script: {
        rawHtml: state.script.rawHtml,
        scenes: [],
        focus: { blockIndex: 1, selectedText: 'emergency line', updatedAt: 1 },
      },
    })

    expect(ctx.script.contextReason).toBe('current-selection')
    expect(ctx.script.selectedText).toBe('emergency line')
    expect(ctx.script.contextLabel).toBe('INT. CALL CENTER - NIGHT')
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

  it('uses page range context when user requests a specific page number', () => {
    const state = defaultProjectState()
    // 54 single-line actions fill page 1 under screenplay layout; the next
    // scene starts page 2.
    const fillerHtml = Array.from({ length: 54 }, (_, i) =>
      `<p data-element-type="action">filler${i}</p>`
    ).join('')
    const page2Html = [
      '<p data-element-type="scene-heading">EXT. ROOFTOP - DAY</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">End of the line.</p>',
    ].join('')
    state.script.rawHtml = fillerHtml + page2Html

    const ctx = buildProjectContext(state, 'What is happening on page 2?')

    expect(ctx.script.contextReason).toBe('requested-page-range')
    expect(ctx.script.contextLabel).toBe('Page 2')
    expect(ctx.script.pageRange).toEqual({ start: 2, end: 2 })
    expect(ctx.script.sceneHeadings).toContain('EXT. ROOFTOP - DAY')
    expect(ctx.script.dialogueSnippets).toContain('ISAIAH: End of the line.')
    expect(ctx.script.excerpt).not.toContain('filler0')
  })

  it('uses page range context when user requests a page range', () => {
    const state = defaultProjectState()
    // 54 single-line actions fill page 1 under screenplay layout; the next
    // scene starts page 2.
    const fillerHtml = Array.from({ length: 54 }, (_, i) =>
      `<p data-element-type="action">filler${i}</p>`
    ).join('')
    const page2Html = [
      '<p data-element-type="scene-heading">EXT. ROOFTOP - DAY</p>',
      '<p data-element-type="dialogue">End of the line.</p>',
    ].join('')
    state.script.rawHtml = fillerHtml + page2Html

    const ctx = buildProjectContext(state, 'Can you review pages 1 to 2?')

    expect(ctx.script.contextReason).toBe('requested-page-range')
    expect(ctx.script.contextLabel).toBe('Pages 1–2')
    expect(ctx.script.pageRange).toEqual({ start: 1, end: 2 })
    expect(ctx.script.sceneHeadings).toContain('EXT. ROOFTOP - DAY')
  })

  it('does not fall back to unrelated script context when a requested page is missing', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'What happens on page 40 with Dante?')

    expect(ctx.script.contextReason).toBe('requested-page-range')
    expect(ctx.script.contextLabel).toBe('Page 40')
    expect(ctx.script.pageRange).toEqual({ start: 40, end: 40 })
    expect(ctx.script.excerpt).toBe('')
    expect(ctx.script.sceneHeadings).toEqual([])
    expect(ctx.script.dialogueSnippets).toEqual([])
  })

  it('does not treat "page" without a number as a page range request', () => {
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="dialogue">Some dialogue.</p>',
    ].join('')

    const ctx = buildProjectContext(state, 'Is this page layout correct?')

    expect(ctx.script.contextReason).toBeUndefined()
  })
})

describe('buildProjectContext — project format and showOverview', () => {
  it('exposes meta.format on the top-level project context', () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    const ctx = buildProjectContext(state)
    expect(ctx.format).toBe('series')
    expect(ctx.synopsis.format).toBe('series')
  })

  it('normalizes unknown meta.format values to feature', () => {
    const state = defaultProjectState()
    ;(state.meta as any).format = 'pilot'
    const ctx = buildProjectContext(state)
    expect(ctx.format).toBe('feature')
    expect(ctx.synopsis.format).toBe('feature')
  })

  it('does not let synopsis header format override meta.format', () => {
    const state = defaultProjectState()
    state.meta.format = 'feature'
    state.documents.synopsis.content.header.format = 'series'
    const ctx = buildProjectContext(state)
    expect(ctx.format).toBe('feature')
    expect(ctx.synopsis.format).toBe('feature')
  })

  it('exposes series.showOverview when populated', () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.synopsis.content.series = {
      seriesType: 'ongoing',
      episodeLength: 'hour',
      showOverview: 'A renewable conflict in a sealed city.',
      pilot: { logline: '', prose: '' },
      seasonOneArc: '',
      futureSeasons: [],
      characters: [],
      compsAndWhyThisShowNow: '',
    }
    const ctx = buildProjectContext(state)
    expect(ctx.synopsis.showOverview).toBe('A renewable conflict in a sealed city.')
  })

  it('exposes empty string for showOverview when content.series is undefined', () => {
    const state = defaultProjectState()
    expect(state.documents.synopsis.content.series).toBeUndefined()
    const ctx = buildProjectContext(state)
    expect(ctx.synopsis.showOverview).toBe('')
  })

  it('does NOT change synopsis.logline or synopsis.sections', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'Legacy logline.'
    state.synopsis.sections.setup = 'Setup text.'
    const ctx = buildProjectContext(state)
    expect(ctx.synopsis.logline).toBe('Legacy logline.')
    expect(ctx.synopsis.sections.setup).toBe('Setup text.')
  })

  it('exposes Feature synopsis document content for Sam without relying on header.format', () => {
    const state = defaultProjectState()
    state.meta.format = 'feature'
    state.documents.synopsis.content.header.format = 'series'
    state.documents.synopsis.content.logline = {
      text: 'A medic exposes a rescue conspiracy before her brother vanishes.',
      protagonist: 'A medic',
      goal: 'exposes a rescue conspiracy',
      obstacle: 'a corrupt emergency network',
      stakes: 'her brother vanishes',
      hook: 'the calls are coming from missing patients',
    }
    state.documents.synopsis.content.prose.opening = 'A medic hears a missing patient on the emergency line.'
    state.documents.synopsis.content.prose.resolution = 'She exposes the network and saves her brother.'
    state.documents.synopsis.content.qa.endingRevealed = true

    const ctx = buildProjectContext(state)

    expect(ctx.format).toBe('feature')
    expect(ctx.logline).toBe('A medic exposes a rescue conspiracy before her brother vanishes.')
    expect(ctx.synopsis.loglineParts.goal).toBe('exposes a rescue conspiracy')
    expect(ctx.synopsis.prose.opening).toBe('A medic hears a missing patient on the emergency line.')
    expect(ctx.synopsis.prose.resolution).toBe('She exposes the network and saves her brother.')
    expect(ctx.synopsis.qa.endingRevealed).toBe(true)
    expect(ctx.synopsis.series).toBeUndefined()
  })

  it('exposes active Series synopsis document content and ignores inactive feature mode', () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.synopsis.content.header.format = 'feature'
    state.documents.synopsis.content.prose.opening = 'Inactive feature-only prose.'
    state.documents.synopsis.content.series = {
      seriesType: 'limited',
      episodeLength: 'hour',
      showOverview: 'A renewable conflict in a sealed city.',
      pilot: {
        logline: 'A runner takes the wrong rescue call.',
        prose: 'The pilot traps the team inside the system they serve.',
      },
      seasonOneArc: 'The team learns the rescue network is choosing who lives.',
      futureSeasons: [{ id: 's2', label: 'Season 2', summary: 'The conspiracy moves outside the city.' }],
      characters: [{
        id: 'c1',
        name: 'Mara',
        role: 'Lead medic',
        bio: 'A disciplined medic with a personal stake.',
        arcPerSeason: ['Trusts no one', 'Builds a real team'],
      }],
      compsAndWhyThisShowNow: 'Emergency procedural pressure with serialized civic paranoia.',
    }

    const ctx = buildProjectContext(state)

    expect(ctx.format).toBe('series')
    expect(ctx.synopsis.format).toBe('series')
    expect(ctx.synopsis.showOverview).toBe('A renewable conflict in a sealed city.')
    expect(ctx.synopsis.series?.seriesType).toBe('limited')
    expect(ctx.synopsis.series?.pilot.logline).toBe('A runner takes the wrong rescue call.')
    expect(ctx.synopsis.series?.futureSeasons[0].summary).toBe('The conspiracy moves outside the city.')
    expect(ctx.synopsis.series?.characters[0].arcPerSeason).toEqual(['Trusts no one', 'Builds a real team'])
  })

  it('does not expose inactive series synopsis content while project format is Feature', () => {
    const state = defaultProjectState()
    state.meta.format = 'feature'
    state.documents.synopsis.content.series = {
      seriesType: 'ongoing',
      episodeLength: 'hour',
      showOverview: 'Inactive show overview.',
      pilot: { logline: '', prose: '' },
      seasonOneArc: '',
      futureSeasons: [],
      characters: [],
      compsAndWhyThisShowNow: '',
    }

    const ctx = buildProjectContext(state)

    expect(ctx.format).toBe('feature')
    expect(ctx.synopsis.showOverview).toBe('')
    expect(ctx.synopsis.series).toBeUndefined()
  })
})
