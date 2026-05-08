import { describe, expect, it } from 'vitest'
import {
  ESTIMATED_SCRIPT_PAGE_WORDS,
  buildScriptIndex,
  getDialogueWindowBySpeakers,
  getFocusContext,
  getPageRangeContext,
  getSceneContext,
  speakersFromMessage,
} from '../../client/src/lib/scriptIndex'

describe('buildScriptIndex', () => {
  it('parses screenplay HTML into indexed blocks, scenes, speakers, and word ranges', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">The emergency line rings.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear the line breathing.</p>',
      '<p data-element-type="parenthetical">(quietly)</p>',
      '<p data-element-type="dialogue">And it knows my name.</p>',
    ].join(''))

    expect(index.blocks).toHaveLength(6)
    expect(index.plainText).toContain('INT. CALL CENTER - NIGHT')
    expect(index.totalWordCount).toBe(23)
    expect(index.estimatedPageCount).toBe(1)
    expect(index.speakers).toEqual(['ISAIAH'])

    expect(index.blocks[0]).toMatchObject({
      id: 'block-1-scene-heading-int-call-center-night',
      index: 0,
      type: 'scene-heading',
      sceneId: 'scene-1-int-call-center-night',
      sceneHeading: 'INT. CALL CENTER - NIGHT',
      pageNumber: 1,
      wordStart: 0,
      wordEnd: 5,
    })
    expect(index.blocks[3]).toMatchObject({
      type: 'dialogue',
      speaker: 'ISAIAH',
      sceneId: 'scene-1-int-call-center-night',
      wordStart: 10,
      wordEnd: 17,
    })
    expect(index.blocks[4]).toMatchObject({
      type: 'parenthetical',
      speaker: 'ISAIAH',
    })
    expect(index.scenes[0]).toMatchObject({
      id: 'scene-1-int-call-center-night',
      heading: 'INT. CALL CENTER - NIGHT',
      index: 1,
      blockStart: 0,
      blockEnd: 5,
      wordStart: 0,
      wordEnd: 23,
      pageStart: 1,
      pageEnd: 1,
    })
  })

  it('derives scene spans across multiple scene headings', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="action">Isaiah waits.</p>',
      '<p data-element-type="scene-heading">EXT. FREEWAY - NIGHT</p>',
      '<p data-element-type="action">Traffic freezes under red light.</p>',
    ].join(''))

    expect(index.scenes).toHaveLength(2)
    expect(index.scenes[0]).toMatchObject({
      heading: 'INT. OFFICE - DAY',
      blockStart: 0,
      blockEnd: 1,
    })
    expect(index.scenes[1]).toMatchObject({
      heading: 'EXT. FREEWAY - NIGHT',
      blockStart: 2,
      blockEnd: 3,
    })
    expect(index.blocks[3].sceneHeading).toBe('EXT. FREEWAY - NIGHT')
  })

  it('creates deterministic estimated pages at 250 words per page', () => {
    const rawHtml = Array.from({ length: ESTIMATED_SCRIPT_PAGE_WORDS + 1 }, (_, index) => (
      `<p data-element-type="action">word${index}</p>`
    )).join('')

    const index = buildScriptIndex(rawHtml)

    expect(index.totalWordCount).toBe(251)
    expect(index.estimatedPageCount).toBe(2)
    expect(index.pages).toHaveLength(2)
    expect(index.pages[0]).toMatchObject({
      pageNumber: 1,
      blockStart: 0,
      blockEnd: 249,
      wordStart: 0,
      wordEnd: 250,
    })
    expect(index.pages[1]).toMatchObject({
      pageNumber: 2,
      blockStart: 250,
      blockEnd: 250,
      wordStart: 250,
      wordEnd: 251,
    })
    expect(index.blocks[249].pageNumber).toBe(1)
    expect(index.blocks[250].pageNumber).toBe(2)
  })

  it('falls back to plain text when no screenplay blocks are present', () => {
    const index = buildScriptIndex('<section>Loose <strong>notes</strong><br>More notes</section>')

    expect(index.blocks).toEqual([])
    expect(index.scenes).toEqual([])
    expect(index.pages).toEqual([])
    expect(index.plainText).toBe('Loose notes More notes')
    expect(index.totalWordCount).toBe(4)
  })
})

describe('scene windows', () => {
  it('retrieves a scene from a fuzzy heading reference', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">The phones blink in the dark.</p>',
      '<p data-element-type="scene-heading">EXT. ROOFTOP - DAY</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">End of the line.</p>',
    ].join(''))

    const window = getSceneContext(index, 'Can you review the rooftop scene?')

    expect(window).not.toBeNull()
    expect(window!.reason).toBe('requested-scene')
    expect(window!.label).toBe('EXT. ROOFTOP - DAY')
    expect(window!.sceneHeadings).toEqual(['EXT. ROOFTOP - DAY'])
    expect(window!.dialogueSnippets).toEqual(['ISAIAH: End of the line.'])
    expect(window!.blocks.map(block => block.text)).not.toContain('The phones blink in the dark.')
  })

  it('uses requested speakers to break ties between similar scene headings', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. OFFICE - MORNING</p>',
      '<p data-element-type="character">CASEY</p>',
      '<p data-element-type="dialogue">This room is too quiet.</p>',
      '<p data-element-type="scene-heading">INT. LIFELINE HQ - DANTE OFFICE - DAY</p>',
      '<p data-element-type="action">Dante shuts the office door.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">So it was you.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join(''))

    const window = getSceneContext(index, 'Review Isaiah and Dante office exchange.', ['ISAIAH', 'DANTE'])

    expect(window).not.toBeNull()
    expect(window!.label).toBe('INT. LIFELINE HQ - DANTE OFFICE - DAY')
    expect(window!.dialogueSnippets).toEqual([
      'ISAIAH: So it was you.',
      'DANTE: Your war is over, brotha.',
    ])
  })

  it('retrieves opening and final scene references', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. OPENING ROOM - NIGHT</p>',
      '<p data-element-type="action">Isaiah waits.</p>',
      '<p data-element-type="scene-heading">EXT. FINAL STREET - DAWN</p>',
      '<p data-element-type="action">The city exhales.</p>',
    ].join(''))

    expect(getSceneContext(index, 'Does the opening scene work?')!.label).toBe('INT. OPENING ROOM - NIGHT')
    expect(getSceneContext(index, 'How does the final scene land?')!.label).toBe('EXT. FINAL STREET - DAWN')
  })

  it('returns null when a scene request has no heading match', () => {
    const index = buildScriptIndex('<p data-element-type="scene-heading">INT. OFFICE - DAY</p>')
    expect(getSceneContext(index, 'Can you review the rooftop scene?')).toBeNull()
  })
})

describe('script dialogue windows', () => {
  it('matches speaker names from the user message', () => {
    const index = buildScriptIndex([
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">Line one.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Line two.</p>',
      '<p data-element-type="character">DR. QADIR</p>',
      '<p data-element-type="dialogue">Line three.</p>',
    ].join(''))

    expect(speakersFromMessage(index, 'Rate Isaiah and Dante here.')).toEqual(['ISAIAH', 'DANTE'])
    expect(speakersFromMessage(index, 'What does Qadir want?')).toEqual(['DR. QADIR'])
  })

  it('retrieves the scene containing the requested speaker exchange instead of the first speaker occurrence', () => {
    const earlyIsaiahScene = [
      '<p data-element-type="scene-heading">INT. PROLOGUE ROOM - NIGHT</p>',
      ...Array.from({ length: 20 }, (_, index) => [
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
    const index = buildScriptIndex(earlyIsaiahScene + danteScene)

    const window = getDialogueWindowBySpeakers(index, ['ISAIAH', 'DANTE'])

    expect(window).not.toBeNull()
    expect(window!.reason).toBe('requested-speakers')
    expect(window!.label).toBe('INT. LIFELINE HQ - DANTE OFFICE - DAY')
    expect(window!.sceneHeadings).toEqual(['INT. LIFELINE HQ - DANTE OFFICE - DAY'])
    expect(window!.dialogueSnippets).toEqual([
      'ISAIAH: So it was you. You gave him my direct line.',
      'DANTE: Your war is over, brotha.',
    ])
    expect(window!.actionSnippets).toEqual(['Dante shuts the office door.'])
    expect(window!.dialogueSnippets).not.toContain('ISAIAH: Early line 0.')
  })

  it('can retrieve speaker dialogue even when a script has no scene headings yet', () => {
    const index = buildScriptIndex([
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join(''))

    const window = getDialogueWindowBySpeakers(index, ['DANTE'])

    expect(window).not.toBeNull()
    expect(window!.label).toBe('Script excerpt')
    expect(window!.sceneHeadings).toEqual([])
    expect(window!.dialogueSnippets).toEqual(['DANTE: Your war is over, brotha.'])
  })
})

describe('page range windows', () => {
  function buildTwoPageScript() {
    const fillerHtml = Array.from({ length: ESTIMATED_SCRIPT_PAGE_WORDS }, (_, i) =>
      `<p data-element-type="action">filler${i}</p>`
    ).join('')
    const page2Html = [
      '<p data-element-type="scene-heading">EXT. ROOFTOP - DAY</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">End of the line.</p>',
    ].join('')
    return fillerHtml + page2Html
  }

  it('retrieves blocks on the requested page', () => {
    const index = buildScriptIndex(buildTwoPageScript())
    expect(index.estimatedPageCount).toBeGreaterThanOrEqual(2)

    const window = getPageRangeContext(index, 2)

    expect(window).not.toBeNull()
    expect(window!.reason).toBe('requested-page-range')
    expect(window!.label).toBe('Page 2')
    expect(window!.pageRange).toEqual({ start: 2, end: 2 })
    expect(window!.sceneHeadings).toEqual(['EXT. ROOFTOP - DAY'])
    expect(window!.dialogueSnippets).toEqual(['ISAIAH: End of the line.'])
    expect(window!.blocks.every(b => b.pageNumber === 2)).toBe(true)
  })

  it('retrieves a block that starts earlier but overlaps the requested page', () => {
    const longAction = Array.from({ length: ESTIMATED_SCRIPT_PAGE_WORDS + 20 }, (_, i) => `road${i}`).join(' ')
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">EXT. DESERT ROAD - DAY</p>',
      `<p data-element-type="action">${longAction}</p>`,
    ].join(''))

    const window = getPageRangeContext(index, 2)

    expect(window).not.toBeNull()
    expect(window!.label).toBe('Page 2')
    expect(window!.pageRange).toEqual({ start: 2, end: 2 })
    expect(window!.sceneHeadings).toEqual(['EXT. DESERT ROAD - DAY'])
    expect(window!.actionSnippets[0]).toContain('road260')
    expect(window!.blocks.some(block => block.pageNumber === 1)).toBe(true)
  })

  it('retrieves blocks spanning a page range', () => {
    const index = buildScriptIndex(buildTwoPageScript())

    const window = getPageRangeContext(index, 1, 2)

    expect(window).not.toBeNull()
    expect(window!.label).toBe('Pages 1–2')
    expect(window!.pageRange).toEqual({ start: 1, end: 2 })
    expect(window!.sceneHeadings).toContain('EXT. ROOFTOP - DAY')
    expect(window!.blocks.length).toBeGreaterThan(ESTIMATED_SCRIPT_PAGE_WORDS)
  })

  it('returns null when the requested page exceeds the script', () => {
    const index = buildScriptIndex('<p data-element-type="action">Short script.</p>')
    expect(getPageRangeContext(index, 5)).toBeNull()
  })

  it('returns null for an empty index', () => {
    const index = buildScriptIndex('')
    expect(getPageRangeContext(index, 1)).toBeNull()
  })
})

describe('script focus windows', () => {
  it('retrieves the current scene when focus is inside a scene', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. CALL CENTER - NIGHT</p>',
      '<p data-element-type="action">The emergency line rings.</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear it breathing.</p>',
      '<p data-element-type="scene-heading">EXT. FREEWAY - NIGHT</p>',
      '<p data-element-type="action">Traffic freezes.</p>',
    ].join(''))

    const window = getFocusContext(index, { blockIndex: 2, updatedAt: 1 })

    expect(window).not.toBeNull()
    expect(window!.reason).toBe('current-scene')
    expect(window!.label).toBe('INT. CALL CENTER - NIGHT')
    expect(window!.sceneHeadings).toEqual(['INT. CALL CENTER - NIGHT'])
    expect(window!.dialogueSnippets).toEqual(['ISAIAH: I can still hear it breathing.'])
    expect(window!.blocks.map(block => block.text)).not.toContain('EXT. FREEWAY - NIGHT')
  })

  it('marks selected text while still sending the surrounding scene', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="action">Dante closes the blinds.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join(''))

    const window = getFocusContext(index, {
      blockIndex: 3,
      selectedText: 'war is over',
      updatedAt: 1,
    })

    expect(window).not.toBeNull()
    expect(window!.reason).toBe('current-selection')
    expect(window!.selectedText).toBe('war is over')
    expect(window!.dialogueSnippets).toEqual(['DANTE: Your war is over, brotha.'])
  })

  it('maps focus by source paragraph index when empty paragraphs are filtered out', () => {
    const index = buildScriptIndex([
      '<p data-element-type="scene-heading">INT. OFFICE - DAY</p>',
      '<p data-element-type="action"></p>',
      '<p data-element-type="action">Dante closes the blinds.</p>',
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="dialogue">Your war is over, brotha.</p>',
    ].join(''))

    expect(index.blocks.map(block => block.index)).toEqual([0, 2, 3, 4])

    const window = getFocusContext(index, { blockIndex: 4, updatedAt: 1 })

    expect(window).not.toBeNull()
    expect(window!.reason).toBe('current-scene')
    expect(window!.dialogueSnippets).toEqual(['DANTE: Your war is over, brotha.'])
  })
})
