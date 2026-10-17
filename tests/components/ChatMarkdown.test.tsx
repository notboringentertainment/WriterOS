import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ChatMarkdown } from '../../client/src/lib/chatMarkdown'

describe('ChatMarkdown', () => {
  it('shows bold, italic, code and headings without the markdown marks, keeping line breaks', () => {
    const { container } = render(<div><ChatMarkdown text={'## Plan\nThe **beat** is *quiet* — see `MAP.md`.\nNext line'} /></div>)
    expect(container.querySelectorAll('strong')).toHaveLength(2)
    expect(container.querySelector('em')?.textContent).toBe('quiet')
    expect(container.querySelector('code')?.textContent).toBe('MAP.md')
    expect(container.textContent).toBe('Plan\nThe beat is quiet — see MAP.md.\nNext line')
  })

  it('leaves stray asterisks and arithmetic alone', () => {
    const { container } = render(<div><ChatMarkdown text={'2 * 3 * 4 and a lone ** here'} /></div>)
    expect(container.textContent).toBe('2 * 3 * 4 and a lone ** here')
    expect(container.querySelector('em')).toBeNull()
  })
})
