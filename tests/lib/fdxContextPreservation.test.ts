import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildScriptIndex } from '../../client/src/lib/scriptIndex'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import { defaultProjectState } from '../../client/src/lib/projectState'

// FDX context-preservation fixture gate only. This does not implement FDX import.
// Future import code must satisfy these expectations before it is wired into Home or Script.
// FUTURE COVERAGE: TitlePage, styled <Text>, (CONT'D), dual dialogue, empty runs.

function readFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures/fdx', name), 'utf8')
}

const sourceFdx = readFixture('context-preservation.fdx')
const expectedWriterOSHtml = readFixture('context-preservation.expected.html').trim()

describe('FDX context-preservation fixture gate', () => {
  it('pins the source paragraph cases the FDX parser must preserve', () => {
    expect(sourceFdx).toContain('<Paragraph Type="Scene Heading">')
    expect(sourceFdx).toContain('<Paragraph Type="Action">')
    expect(sourceFdx).toContain('<Paragraph Type="Character">')
    expect(sourceFdx).toContain('<Paragraph Type="Parenthetical">')
    expect(sourceFdx).toContain('<Paragraph Type="Dialogue">')
    expect(sourceFdx).toContain('<Paragraph Type="Transition">')
    expect(sourceFdx).toContain('<Paragraph Type="Shot">')
    expect(sourceFdx).toContain('<Paragraph Type="General">')
    expect(sourceFdx).toContain('<Paragraph Type="New Act">')
    expect(sourceFdx).toContain('&amp;')
    expect(sourceFdx.match(/<Text>/g)).toHaveLength(13)
  })

  it('pins expected script indexing for future FDX conversion output', () => {
    const index = buildScriptIndex(expectedWriterOSHtml)

    expect(index.blocks).toHaveLength(12)
    expect(index.scenes).toHaveLength(2)
    expect(index.blocks.map(block => ({
      type: block.type,
      text: block.text,
      speaker: block.speaker,
      sceneHeading: block.sceneHeading,
    }))).toMatchInlineSnapshot(`
      [
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": undefined,
          "text": "INT. PALACE ATRIUM - NIGHT",
          "type": "scene-heading",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": undefined,
          "text": "Damascus rain ticks against geometric glass. Brass lanterns throw honey light across carved cedar screens.",
          "type": "action",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": undefined,
          "text": "PRINCE KHALID AL-MANSOUR. Late 20s. Effortlessly poised. Born into privilege, wrapped in silk and tradition. A tailored bisht draped over his shoulders. A bespoke Patek Philippe Grandmaster flashing beneath his sleeve. His half-smile hints at mischief. His eyes cut sharper.",
          "type": "action",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": undefined,
          "text": "PRINCE KHALID AL-MANSOUR",
          "type": "character",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": "PRINCE KHALID AL-MANSOUR",
          "text": "(quietly, to the guard)",
          "type": "parenthetical",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": "PRINCE KHALID AL-MANSOUR",
          "text": "The city has a memory. Tonight it remembers us.",
          "type": "dialogue",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": undefined,
          "text": "A call to prayer bends through hidden speakers & over the security monitors.",
          "type": "action",
        },
        {
          "sceneHeading": "INT. PALACE ATRIUM - NIGHT",
          "speaker": undefined,
          "text": "CUT TO:",
          "type": "transition",
        },
        {
          "sceneHeading": "EXT. OLD CITY CHECKPOINT - DAWN",
          "speaker": undefined,
          "text": "EXT. OLD CITY CHECKPOINT - DAWN",
          "type": "scene-heading",
        },
        {
          "sceneHeading": "EXT. OLD CITY CHECKPOINT - DAWN",
          "speaker": undefined,
          "text": "A drone tilts above the checkpoint, its lens fogged by desert cold.",
          "type": "action",
        },
        {
          "sceneHeading": "EXT. OLD CITY CHECKPOINT - DAWN",
          "speaker": undefined,
          "text": "The checkpoint gates answer with a hydraulic groan.",
          "type": "action",
        },
        {
          "sceneHeading": "EXT. OLD CITY CHECKPOINT - DAWN",
          "speaker": undefined,
          "text": "The old district forbids armed drones past the gate.",
          "type": "action",
        },
      ]
    `)
    expect(index.scenes.map(scene => ({
      heading: scene.heading,
      index: scene.index,
      blockStart: scene.blockStart,
      blockEnd: scene.blockEnd,
    }))).toMatchInlineSnapshot(`
      [
        {
          "blockEnd": 7,
          "blockStart": 0,
          "heading": "INT. PALACE ATRIUM - NIGHT",
          "index": 1,
        },
        {
          "blockEnd": 11,
          "blockStart": 8,
          "heading": "EXT. OLD CITY CHECKPOINT - DAWN",
          "index": 2,
        },
      ]
    `)
    expect(index.speakers).toEqual(['PRINCE KHALID AL-MANSOUR'])
  })

  it('preserves agent-relevant screenplay context from the expected converted HTML', () => {
    const state = defaultProjectState()
    state.script.rawHtml = expectedWriterOSHtml

    const worldContext = buildProjectContext(state, 'What world details are established in the palace atrium scene?')
    expect(worldContext.script.contextReason).toBe('requested-scene')
    expect(worldContext.script.contextLabel).toBe('INT. PALACE ATRIUM - NIGHT')
    expect(worldContext.script.sceneHeadings).toEqual(['INT. PALACE ATRIUM - NIGHT'])
    expect(worldContext.script.actionSnippets).toEqual([
      'Damascus rain ticks against geometric glass. Brass lanterns throw honey light across carved cedar screens.',
      'PRINCE KHALID AL-MANSOUR. Late 20s. Effortlessly poised. Born into privilege, wrapped in silk and tradition. A tailored bisht draped over his shoulders. A bespoke Patek Philippe Grandmaster flashing beneath his sleeve. His half-smile hints at mischief. His eyes cut sharper.',
      'A call to prayer bends through hidden speakers & over the security monitors.',
    ])
    expect(worldContext.script.excerpt).not.toContain('A drone tilts above the checkpoint')

    const characterContext = buildProjectContext(state, "What does Prince Khalid's psychology feel like in the palace atrium scene?")
    expect(characterContext.script.contextReason).toBe('requested-scene')
    expect(characterContext.script.contextLabel).toBe('INT. PALACE ATRIUM - NIGHT')
    expect(characterContext.script.excerpt).toContain('Effortlessly poised')
    expect(characterContext.script.excerpt).toContain('His half-smile hints at mischief')
    expect(characterContext.script.dialogueSnippets).toEqual([
      'PRINCE KHALID AL-MANSOUR: The city has a memory. Tonight it remembers us.',
    ])

    const dialogueContext = buildProjectContext(state, 'Rate the dialogue from Prince Khalid Al-Mansour.')
    expect(dialogueContext.script.contextReason).toBe('requested-speakers')
    expect(dialogueContext.script.characterNames).toEqual(['PRINCE KHALID AL-MANSOUR'])
    expect(dialogueContext.script.dialogueSnippets).toEqual([
      'PRINCE KHALID AL-MANSOUR: The city has a memory. Tonight it remembers us.',
    ])
  })
})
