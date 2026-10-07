import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeftRail } from '../../client/src/components/shell/LeftRail'
import type { MorganApi } from '../../client/src/lib/projectStorage'

const props = {
  open: true, onToggle: vi.fn(), projectTitle: 'Untitled', activeTab: 'script' as const,
  transcript: [{ id: 'm1', role: 'assistant' as const, content: 'Existing conversation.', speaker: 'Morgan', ts: 1 }],
  loading: false, onSend: vi.fn(), onClearTranscript: vi.fn(),
}
const api = {} as MorganApi

describe('hosted Morgan rail gate', () => {
  it('preserves the exact existing DOM when disabled or on a browser project', () => {
    const view = render(<LeftRail {...props} />)
    const before = view.container.innerHTML
    view.rerender(<LeftRail {...props} morgan={null} morganProjectId="p1" />)
    expect(view.container.innerHTML).toBe(before)
    view.rerender(<LeftRail {...props} morgan={api} morganProjectId={null} />)
    expect(view.container.innerHTML).toBe(before)
  })

  it('renders the hosted screen only with both the capability and server project', () => {
    render(<LeftRail {...props} morgan={api} morganProjectId="p1" />)
    expect(screen.getByRole('button', { name: 'Start Morgan' })).toBeInTheDocument()
    expect(screen.queryByText('Existing conversation.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })
})
