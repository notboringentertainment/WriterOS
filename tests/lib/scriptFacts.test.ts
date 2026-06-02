import { describe, expect, it } from 'vitest'
import { hashScriptHtml } from '../../client/src/lib/scriptBlocks'
import {
  deriveScriptFactsFromBlocks,
  deriveScriptFactsFromHtml,
} from '../../client/src/lib/scriptFacts'

describe('deriveScriptFactsFromHtml', () => {
  it('derives characters, locations, times, transitions, counts, and hash from script HTML', () => {
    const rawHtml = [
      '<p data-element-type="scene-heading">INT. KITCHEN -- NIGHT</p>',
      '<p data-element-type="action">Marcus waits.</p>',
      '<p data-element-type="character">MARCUS</p>',
      '<p data-element-type="dialogue">Where are you?</p>',
      '<p data-element-type="character">MARCUS (O.S.)</p>',
      '<p data-element-type="dialogue">Answer me.</p>',
      '<p data-element-type="transition">CUT TO:</p>',
      '<p data-element-type="scene-heading">EXT. DOCK - DAWN</p>',
      '<p data-element-type="character">MARCOS</p>',
      '<p data-element-type="dialogue">I am here.</p>',
    ].join('')

    const facts = deriveScriptFactsFromHtml(rawHtml)

    expect(facts.contentHash).toBe(hashScriptHtml(rawHtml))
    expect(facts.characters).toEqual([
      { label: 'MARCUS', count: 2, blockIndices: [2, 4] },
      { label: 'MARCOS', count: 1, blockIndices: [8] },
    ])
    expect(facts.locations).toEqual([
      { label: 'EXT. DOCK - DAWN', count: 1, blockIndices: [7] },
      { label: 'INT. KITCHEN -- NIGHT', count: 1, blockIndices: [0] },
    ])
    expect(facts.times).toEqual([
      { label: 'DAWN', count: 1, blockIndices: [7] },
      { label: 'NIGHT', count: 1, blockIndices: [0] },
    ])
    expect(facts.transitions).toEqual([
      { label: 'CUT TO:', count: 1, blockIndices: [6] },
    ])
    expect(facts.warnings).toEqual([
      {
        kind: 'near-match',
        section: 'characters',
        labels: ['MARCUS', 'MARCOS'],
        reason: 'edit-distance',
      },
    ])
  })

  it('keeps short distinct character names out of edit-distance warnings', () => {
    const facts = deriveScriptFactsFromHtml([
      '<p data-element-type="character">JOHN</p>',
      '<p data-element-type="character">JOAN</p>',
    ].join(''))

    expect(facts.characters.map(entry => entry.label)).toEqual(['JOAN', 'JOHN'])
    expect(facts.warnings).toEqual([])
  })

  it('orders facts by count descending, then label', () => {
    const facts = deriveScriptFactsFromHtml([
      '<p data-element-type="character">DANTE</p>',
      '<p data-element-type="character">MAYA</p>',
      '<p data-element-type="character">ALEX</p>',
      '<p data-element-type="character">MAYA</p>',
      '<p data-element-type="character">ALEX</p>',
      '<p data-element-type="character">MAYA</p>',
    ].join(''))

    expect(facts.characters).toEqual([
      { label: 'MAYA', count: 3, blockIndices: [1, 3, 5] },
      { label: 'ALEX', count: 2, blockIndices: [2, 4] },
      { label: 'DANTE', count: 1, blockIndices: [0] },
    ])
  })

  it('preserves character cue display text while deduping with normalized keys', () => {
    const facts = deriveScriptFactsFromHtml([
      '<p data-element-type="character">MRS. SMITH (V.O.)</p>',
      '<p data-element-type="character">MRS SMITH</p>',
      '<p data-element-type="character">JEAN-LUC (O.S.)</p>',
    ].join(''))

    expect(facts.characters).toEqual([
      { label: 'MRS. SMITH', count: 2, blockIndices: [0, 1] },
      { label: 'JEAN-LUC', count: 1, blockIndices: [2] },
    ])
  })

  it('flags location token containment for one extra qualifier or time token', () => {
    const facts = deriveScriptFactsFromHtml([
      '<p data-element-type="scene-heading">INT. KITCHEN</p>',
      '<p data-element-type="scene-heading">INT. KITCHEN -- NIGHT</p>',
    ].join(''))

    expect(facts.locations).toEqual([
      { label: 'INT. KITCHEN', count: 1, blockIndices: [0] },
      { label: 'INT. KITCHEN -- NIGHT', count: 1, blockIndices: [1] },
    ])
    expect(facts.times).toEqual([
      { label: 'NIGHT', count: 1, blockIndices: [1] },
    ])
    expect(facts.warnings).toEqual([
      {
        kind: 'near-match',
        section: 'locations',
        labels: ['INT. KITCHEN', 'INT. KITCHEN -- NIGHT'],
        reason: 'token-containment',
      },
    ])
  })

  it('extracts scene times from compact double-dash headings', () => {
    const facts = deriveScriptFactsFromHtml(
      '<p data-element-type="scene-heading">INT. KITCHEN--NIGHT</p>'
    )

    expect(facts.times).toEqual([
      { label: 'NIGHT', count: 1, blockIndices: [0] },
    ])
  })
})

describe('deriveScriptFactsFromBlocks', () => {
  it('derives from caller-provided normalized blocks without reparsing HTML', () => {
    const facts = deriveScriptFactsFromBlocks([
      { index: 4, type: 'character', text: "DANTE (CONT'D)" },
      { index: 9, type: 'transition', text: 'SMASH CUT TO:' },
    ])

    expect(facts.characters).toEqual([
      { label: 'DANTE', count: 1, blockIndices: [4] },
    ])
    expect(facts.transitions).toEqual([
      { label: 'SMASH CUT TO:', count: 1, blockIndices: [9] },
    ])
  })
})
