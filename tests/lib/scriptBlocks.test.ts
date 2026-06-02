import { describe, expect, it } from 'vitest'
import {
  fnv1a32Hex,
  hashScriptBlocks,
  hashScriptHtml,
  parseScriptBlocks,
} from '../../client/src/lib/scriptBlocks'

describe('parseScriptBlocks', () => {
  it('parses WriterOS screenplay HTML into normalized blocks', () => {
    const blocks = parseScriptBlocks([
      '<p data-element-type="scene-heading"> INT. KITCHEN   - NIGHT </p>',
      '<p data-element-type="character">Marcus</p>',
      '<p data-element-type="dialogue">We  should   go.</p>',
      '<p data-element-type="unknown">Fallback action.</p>',
    ].join(''))

    expect(blocks).toEqual([
      { index: 0, type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' },
      { index: 1, type: 'character', text: 'Marcus' },
      { index: 2, type: 'dialogue', text: 'We should go.' },
      { index: 3, type: 'action', text: 'Fallback action.' },
    ])
  })

  it('preserves sparse source indices when empty paragraphs are filtered out', () => {
    const blocks = parseScriptBlocks([
      '<p data-element-type="scene-heading">INT. KITCHEN - NIGHT</p>',
      '<p data-element-type="action"></p>',
      '<p data-element-type="action">Marcus waits.</p>',
    ].join(''))

    expect(blocks).toEqual([
      { index: 0, type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' },
      { index: 2, type: 'action', text: 'Marcus waits.' },
    ])
  })
})

describe('script block hashing', () => {
  it('uses stable FNV-1a 32-bit hex output', () => {
    expect(fnv1a32Hex('script-facts:v1:[]')).toBe('7b05e753')
  })

  it('ignores sparse indices and equivalent empty-paragraph churn', () => {
    const withoutEmpty = [
      '<p data-element-type="scene-heading">INT. KITCHEN - NIGHT</p>',
      '<p data-element-type="action">Marcus waits.</p>',
    ].join('')
    const withEmpty = [
      '<p data-element-type="scene-heading">INT. KITCHEN - NIGHT</p>',
      '<p data-element-type="action"></p>',
      '<p data-element-type="action">Marcus waits.</p>',
    ].join('')

    expect(parseScriptBlocks(withEmpty).map(block => block.index)).toEqual([0, 2])
    expect(hashScriptHtml(withEmpty)).toBe(hashScriptHtml(withoutEmpty))
  })

  it('changes when normalized visible block type, text, or order changes', () => {
    const baseline = hashScriptBlocks([
      { type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' },
      { type: 'action', text: 'Marcus waits.' },
    ])

    expect(hashScriptBlocks([
      { type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' },
      { type: 'dialogue', text: 'Marcus waits.' },
    ])).not.toBe(baseline)
    expect(hashScriptBlocks([
      { type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' },
      { type: 'action', text: 'Maya waits.' },
    ])).not.toBe(baseline)
    expect(hashScriptBlocks([
      { type: 'action', text: 'Marcus waits.' },
      { type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' },
    ])).not.toBe(baseline)
  })
})
