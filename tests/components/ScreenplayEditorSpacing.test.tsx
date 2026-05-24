import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ScreenplayEditor } from '../../client/src/components/writing/screenplay/ScreenplayEditor'

describe('ScreenplayEditor spacing', () => {
  it('decorates paragraphs with table-driven spacing without changing saved HTML', async () => {
    let savedHtml = ''
    const { container } = render(
      <ScreenplayEditor
        initialContent={[
          '<p data-element-type="scene-heading">INT. ROOM - NIGHT</p>',
          '<p data-element-type="action">Rain needles the window.</p>',
          '<p data-element-type="action">A clock clicks.</p>',
          '<p data-element-type="character">MARA</p>',
          '<p data-element-type="dialogue">We are late.</p>',
          '<p data-element-type="action">The phone rings.</p>',
        ].join('')}
        onEditorReady={editor => {
          savedHtml = editor.getHTML()
        }}
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.ProseMirror p')).toHaveLength(6)
    })

    const paragraphs = Array.from(container.querySelectorAll('.ProseMirror p'))
    expect(paragraphs.map(p => p.getAttribute('data-screenplay-space-before'))).toEqual([
      '0',
      '1',
      '0',
      '1',
      '0',
      '1',
    ])
    expect(savedHtml).not.toContain('data-screenplay-space-before')
  })
})
