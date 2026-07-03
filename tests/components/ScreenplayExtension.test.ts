import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { ScreenplayExtension } from '../../client/src/components/writing/screenplay/ScreenplayExtension'
import type { ElementType } from '../../client/src/lib/screenplay'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mountEl: HTMLElement | undefined

function makeEditor(content: string): Editor {
  mountEl = document.createElement('div')
  document.body.appendChild(mountEl)
  return new Editor({
    element: mountEl,
    extensions: [Document, Paragraph, Text, ScreenplayExtension],
    content,
  })
}

function nodeType(editor: Editor, childIndex = 0): ElementType {
  return (editor.state.doc.child(childIndex).attrs.elementType ?? 'action') as ElementType
}

function typeTextInput(editor: Editor, text: string): boolean {
  const { from, to } = editor.state.selection
  let handled = false
  editor.view.someProp('handleTextInput', handler => {
    handled = handler(editor.view, from, to, text, () => editor.state.tr) === true
    return handled
  })
  if (!handled) editor.commands.insertContent(text)
  return handled
}

afterEach(() => {
  mountEl?.remove()
  mountEl = undefined
})

// ---------------------------------------------------------------------------
// setElementType command
// ---------------------------------------------------------------------------

describe('setElementType command', () => {
  let editor: Editor

  beforeEach(() => {
    editor = makeEditor('<p data-element-type="action">Hello</p>')
  })

  afterEach(() => editor.destroy())

  it('action → character', () => {
    editor.commands.setElementType('character')
    expect(nodeType(editor)).toBe('character')
  })

  it('action → scene-heading', () => {
    editor.commands.setElementType('scene-heading')
    expect(nodeType(editor)).toBe('scene-heading')
  })

  it('action → dialogue', () => {
    editor.commands.setElementType('dialogue')
    expect(nodeType(editor)).toBe('dialogue')
  })

  it('action → parenthetical', () => {
    editor.commands.setElementType('parenthetical')
    expect(nodeType(editor)).toBe('parenthetical')
  })

  it('action → transition', () => {
    editor.commands.setElementType('transition')
    expect(nodeType(editor)).toBe('transition')
  })
})

// ---------------------------------------------------------------------------
// uppercaseCurrentBlock command
// ---------------------------------------------------------------------------

describe('uppercaseCurrentBlock command', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('uppercases mixed-case text', () => {
    editor = makeEditor('<p data-element-type="action">hello world</p>')
    // Place cursor inside the paragraph (pos 1 = start of first para content)
    editor.commands.setTextSelection(1)
    editor.commands.uppercaseCurrentBlock()
    expect(editor.state.doc.firstChild?.textContent).toBe('HELLO WORLD')
  })

  it('no-ops on already-uppercase text', () => {
    editor = makeEditor('<p data-element-type="action">ALREADY</p>')
    editor.commands.uppercaseCurrentBlock()
    expect(editor.state.doc.firstChild?.textContent).toBe('ALREADY')
  })

  it('no-ops on empty block', () => {
    editor = makeEditor('<p data-element-type="action"></p>')
    editor.commands.uppercaseCurrentBlock()
    expect(editor.state.doc.firstChild?.textContent).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Sentence capitalization — handleTextInput capitalizes action/dialogue starts.
// ---------------------------------------------------------------------------

describe('sentence capitalization text input', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('capitalizes the first typed letter in action', () => {
    editor = makeEditor('<p data-element-type="action"></p>')
    editor.commands.setTextSelection(1)
    expect(typeTextInput(editor, 'b')).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe('B')
  })

  it('capitalizes the first typed letter in dialogue', () => {
    editor = makeEditor('<p data-element-type="dialogue"></p>')
    editor.commands.setTextSelection(1)
    expect(typeTextInput(editor, 'i')).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe('I')
  })

  it('capitalizes after sentence-ending punctuation', () => {
    editor = makeEditor('<p data-element-type="action">He stops.</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    typeTextInput(editor, ' ')
    expect(typeTextInput(editor, 't')).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe('He stops. T')
  })

  it('does not capitalize mid-sentence action text', () => {
    editor = makeEditor('<p data-element-type="action">He</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    typeTextInput(editor, ' ')
    expect(typeTextInput(editor, 'w')).toBe(false)
    expect(editor.state.doc.firstChild?.textContent).toBe('He w')
  })

  it('does not sentence-capitalize parenthetical text', () => {
    editor = makeEditor('<p data-element-type="parenthetical"></p>')
    editor.commands.setTextSelection(1)
    expect(typeTextInput(editor, 'b')).toBe(false)
    expect(editor.state.doc.firstChild?.textContent).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// Real-time uppercase — handleTextInput uppercases letters typed into
// scene-heading, character, and transition so saved HTML matches the visual.
// ---------------------------------------------------------------------------

describe('real-time uppercase text input', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('uppercases letters typed into scene-heading', () => {
    editor = makeEditor('<p data-element-type="scene-heading"></p>')
    editor.commands.setTextSelection(1)
    expect(typeTextInput(editor, 'i')).toBe(true)
    expect(typeTextInput(editor, 'n')).toBe(true)
    expect(typeTextInput(editor, 't')).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe('INT')
  })

  it('uppercases letters typed into character', () => {
    editor = makeEditor('<p data-element-type="character"></p>')
    editor.commands.setTextSelection(1)
    expect(typeTextInput(editor, 'b')).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe('B')
  })

  it('uppercases letters typed into transition (regression: CSS lie)', () => {
    editor = makeEditor('<p data-element-type="transition"></p>')
    editor.commands.setTextSelection(1)
    expect(typeTextInput(editor, 'c')).toBe(true)
    expect(typeTextInput(editor, 'u')).toBe(true)
    expect(typeTextInput(editor, 't')).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe('CUT')
  })

  it('leaves uppercase-letter input alone (no double-dispatch)', () => {
    editor = makeEditor('<p data-element-type="character"></p>')
    editor.commands.setTextSelection(1)
    // Uppercase input does not match /[a-z]/, so handler returns false and
    // ProseMirror's default insert path runs.
    expect(typeTextInput(editor, 'A')).toBe(false)
    expect(editor.state.doc.firstChild?.textContent).toBe('A')
  })

  it('leaves digit input alone in uppercase elements', () => {
    editor = makeEditor('<p data-element-type="scene-heading">INT</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    expect(typeTextInput(editor, '1')).toBe(false)
    expect(editor.state.doc.firstChild?.textContent).toBe('INT1')
  })
})

// ---------------------------------------------------------------------------
// Tab shortcut logic — command chains mirroring the Tab handler
// getTabNext(current) → setElementType; shouldUppercase → uppercaseCurrentBlock first
// ---------------------------------------------------------------------------

describe('Tab shortcut logic (command chains)', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('action → character (no uppercase)', () => {
    editor = makeEditor('<p data-element-type="action">Hello</p>')
    // getTabNext('action') = 'character'; shouldUppercase('action') = false
    editor.commands.setElementType('character')
    expect(nodeType(editor)).toBe('character')
  })

  it('scene-heading → uppercases then cycles to action', () => {
    editor = makeEditor('<p data-element-type="scene-heading">int. room - day</p>')
    // getTabNext('scene-heading') = 'action'; shouldUppercase('scene-heading') = true
    editor.chain().uppercaseCurrentBlock().setElementType('action').run()
    expect(editor.state.doc.firstChild?.textContent).toBe('INT. ROOM - DAY')
    expect(nodeType(editor)).toBe('action')
  })

  it('character → uppercases then cycles to dialogue', () => {
    editor = makeEditor('<p data-element-type="character">alex</p>')
    // getTabNext('character') = 'dialogue'; shouldUppercase('character') = true
    editor.chain().uppercaseCurrentBlock().setElementType('dialogue').run()
    expect(editor.state.doc.firstChild?.textContent).toBe('ALEX')
    expect(nodeType(editor)).toBe('dialogue')
  })

  it('dialogue → parenthetical (no uppercase)', () => {
    editor = makeEditor('<p data-element-type="dialogue">Some line.</p>')
    // getTabNext('dialogue') = 'parenthetical'; shouldUppercase('dialogue') = false
    editor.commands.setElementType('parenthetical')
    expect(nodeType(editor)).toBe('parenthetical')
  })
})

// ---------------------------------------------------------------------------
// Enter shortcut logic — splitBlock then setElementType
// The handler only fires when cursor is at end of block.
// ---------------------------------------------------------------------------

describe('Enter shortcut logic (splitBlock + setElementType chains)', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('character → Enter → creates dialogue block', () => {
    editor = makeEditor('<p data-element-type="character">ALEX</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('character') = 'dialogue'; shouldUppercase('character') = true
    editor.chain().uppercaseCurrentBlock().splitBlock().setElementType('dialogue').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('dialogue')
  })

  it('action → Enter → creates another action block', () => {
    editor = makeEditor('<p data-element-type="action">A hero walks in.</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('action') = 'action'; shouldUppercase('action') = false
    editor.chain().splitBlock().setElementType('action').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('action')
  })

  it('scene-heading → Enter → creates action block', () => {
    editor = makeEditor('<p data-element-type="scene-heading">INT. ROOM - DAY</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('scene-heading') = 'action'; shouldUppercase('scene-heading') = true
    editor.chain().uppercaseCurrentBlock().splitBlock().setElementType('action').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('action')
  })

  it('dialogue → Enter → creates action block', () => {
    editor = makeEditor('<p data-element-type="dialogue">She nods.</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('dialogue') = 'action'; shouldUppercase('dialogue') = false
    editor.chain().splitBlock().setElementType('action').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('action')
  })

  it('parenthetical → Enter → creates dialogue block', () => {
    editor = makeEditor('<p data-element-type="parenthetical">(quietly)</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('parenthetical') = 'dialogue'; shouldUppercase('parenthetical') = false
    editor.chain().splitBlock().setElementType('dialogue').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('dialogue')
  })
})
