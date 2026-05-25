import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { ScreenplayEditor } from '../../client/src/components/writing/screenplay/ScreenplayEditor'
import { SCREENPLAY_INDENTS } from '../../client/src/lib/screenplay'

function typeViaHandler(editor: Editor, text: string) {
  const { from, to } = editor.state.selection
  let handled = false
  editor.view.someProp('handleTextInput', handler => {
    handled = handler(editor.view, from, to, text, () => editor.state.tr) === true
    return handled
  })
  if (!handled) editor.commands.insertContent(text)
}

describe('ScreenplayEditor indent + casing integration', () => {
  it('preserves data-element-type so CSS can render SCREENPLAY_INDENTS values', async () => {
    const { container } = render(
      <ScreenplayEditor
        initialContent={[
          '<p data-element-type="scene-heading">INT. ROOM - NIGHT</p>',
          '<p data-element-type="action">Rain.</p>',
          '<p data-element-type="character">MARA</p>',
          '<p data-element-type="parenthetical">(quietly)</p>',
          '<p data-element-type="dialogue">We are late.</p>',
          '<p data-element-type="transition">CUT TO:</p>',
        ].join('')}
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.ProseMirror p')).toHaveLength(6)
    })

    const types = Array.from(container.querySelectorAll('.ProseMirror p')).map(p =>
      p.getAttribute('data-element-type')
    )
    expect(types).toEqual([
      'scene-heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
    ])

    // Sanity that the layout model covers every rendered element type.
    for (const type of types) {
      expect(SCREENPLAY_INDENTS[type as keyof typeof SCREENPLAY_INDENTS]).toBeDefined()
    }
  })

  it('saves lowercase typed into transition as uppercase (CSS-lie regression)', async () => {
    let editor: Editor | undefined
    render(
      <ScreenplayEditor
        initialContent='<p data-element-type="transition"></p>'
        onEditorReady={ed => {
          editor = ed
        }}
      />
    )

    await waitFor(() => expect(editor).toBeDefined())
    if (!editor) throw new Error('editor not ready')

    editor.commands.setTextSelection(1)
    typeViaHandler(editor, 'c')
    typeViaHandler(editor, 'u')
    typeViaHandler(editor, 't')

    expect(editor.state.doc.firstChild?.textContent).toBe('CUT')
    expect(editor.getHTML()).toContain('CUT')
    expect(editor.getHTML()).not.toContain('cut')
  })

  it('saves lowercase typed into scene-heading and character as uppercase', async () => {
    let editor: Editor | undefined
    render(
      <ScreenplayEditor
        initialContent={[
          '<p data-element-type="scene-heading"></p>',
          '<p data-element-type="character"></p>',
        ].join('')}
        onEditorReady={ed => {
          editor = ed
        }}
      />
    )

    await waitFor(() => expect(editor).toBeDefined())
    if (!editor) throw new Error('editor not ready')

    editor.commands.setTextSelection(1)
    typeViaHandler(editor, 'i')
    typeViaHandler(editor, 'n')
    typeViaHandler(editor, 't')
    expect(editor.state.doc.child(0).textContent).toBe('INT')

    // Move to second paragraph (scene-heading is 1 paragraph: open(1)+content(3)+close(1)=5,
    // so character content starts at pos 6).
    editor.commands.setTextSelection(6)
    typeViaHandler(editor, 'm')
    typeViaHandler(editor, 'a')
    expect(editor.state.doc.child(1).textContent).toBe('MA')
  })

  it('keeps sentence-case behavior in action and dialogue (no double-uppercase)', async () => {
    let editor: Editor | undefined
    render(
      <ScreenplayEditor
        initialContent='<p data-element-type="action"></p>'
        onEditorReady={ed => {
          editor = ed
        }}
      />
    )

    await waitFor(() => expect(editor).toBeDefined())
    if (!editor) throw new Error('editor not ready')

    editor.commands.setTextSelection(1)
    typeViaHandler(editor, 'h')
    typeViaHandler(editor, 'e')
    // First letter capitalized; second letter left as typed.
    expect(editor.state.doc.firstChild?.textContent).toBe('He')
  })
})
