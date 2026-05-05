import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { ScreenplayExtension } from '../../client/src/components/writing/screenplay/ScreenplayExtension'

describe('ScreenplayExtension — smoke', () => {
  it('Editor instantiates with ScreenplayExtension in jsdom', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const editor = new Editor({
      element: el,
      extensions: [Document, Paragraph, Text, ScreenplayExtension],
      content: '<p data-element-type="action">Hello</p>',
    })
    expect(editor.state.doc.firstChild?.attrs.elementType).toBe('action')
    editor.destroy()
    el.remove()
  })
})
