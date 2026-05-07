import { describe, expect, it } from 'vitest'
import {
  ESTIMATED_SCRIPT_PAGE_WORDS,
  buildScriptIndex,
  getDialogueWindowBySpeakers,
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
