import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ScreenplayEditor } from '../../client/src/components/writing/screenplay/ScreenplayEditor'

// 40-char action lines each occupy one wrapped screenplay line, so 55 of them
// fill page 1 (54 lines) and push the 55th onto page 2.
const ACTION_LINE = 'x'.repeat(40)
const MULTI_PAGE_CONTENT = Array.from({ length: 55 }, () =>
  `<p data-element-type="action">${ACTION_LINE}</p>`,
).join('')

describe('ScreenplayEditor pagination decorations', () => {
  it('renders a layout-derived page break and page number without persisting them', async () => {
    let getHtml = () => ''
    let reportedPageCount = 0
    const { container } = render(
      <ScreenplayEditor
        initialContent={MULTI_PAGE_CONTENT}
        onPageCountChange={count => {
          reportedPageCount = count
        }}
        onEditorReady={editor => {
          getHtml = () => editor.getHTML()
        }}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.screenplay-page-break')).not.toBeNull()
    })
    const savedHtml = getHtml()

    // Page count is layout-derived (54 lines/page), not a scroll-height guess.
    expect(reportedPageCount).toBe(2)

    // The page-number widget shows page 2 at the break.
    const pageNumber = container.querySelector('.screenplay-page-number')
    expect(pageNumber?.textContent).toBe('2')

    // Decorations are derived presentation only: never serialized into the
    // saved document.
    expect(savedHtml.length).toBeGreaterThan(0)
    expect(savedHtml).not.toContain('screenplay-page-break')
    expect(savedHtml).not.toContain('screenplay-page-number')
  })

  it('renders a page break inside a long block that spans a page boundary', async () => {
    let getHtml = () => ''
    let reportedPageCount = 0
    // A single action paragraph that wraps to 60 lines spans onto page 2.
    const longAction = Array.from({ length: 60 }, () => ACTION_LINE).join(' ')
    const { container } = render(
      <ScreenplayEditor
        initialContent={`<p data-element-type="action">${longAction}</p>`}
        onPageCountChange={count => {
          reportedPageCount = count
        }}
        onEditorReady={editor => {
          getHtml = () => editor.getHTML()
        }}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.screenplay-page-break')).not.toBeNull()
    })
    const savedHtml = getHtml()

    expect(reportedPageCount).toBe(2)

    // The long block stays a single paragraph — the widget must not split it.
    const paragraphs = container.querySelectorAll('.ProseMirror p[data-element-type="action"]')
    expect(paragraphs).toHaveLength(1)
    const paragraph = paragraphs[0]

    // The divider renders inside the paragraph as an inline-safe <span> (a <div>
    // here would be invalid phrasing content inside <p> and trigger reflow).
    const pageBreak = paragraph.querySelector('.screenplay-page-break')
    expect(pageBreak).not.toBeNull()
    expect(pageBreak?.tagName).toBe('SPAN')
    expect(pageBreak?.parentElement).toBe(paragraph)
    expect(container.querySelector('.screenplay-page-number')?.textContent).toBe('2')

    // The paragraph's script text survives intact around the inline widget.
    expect(paragraph.textContent).toContain(ACTION_LINE)
    expect(savedHtml).not.toContain('screenplay-page-break')
  })

  it('reports a single page for an empty screenplay', async () => {
    let reportedPageCount = 0
    const { container } = render(
      <ScreenplayEditor
        initialContent={'<p data-element-type="scene-heading"></p>'}
        onPageCountChange={count => {
          reportedPageCount = count
        }}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror p')).not.toBeNull()
    })

    expect(reportedPageCount).toBe(1)
    expect(container.querySelector('.screenplay-page-break')).toBeNull()
  })
})
