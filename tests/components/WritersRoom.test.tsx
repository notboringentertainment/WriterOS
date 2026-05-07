import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WritersRoom } from '../../client/src/components/writing/WritersRoom'
import { defaultProjectState } from '../../client/src/lib/projectState'

const defaultProps = {
  projectState: defaultProjectState(),
  onSendToSpecialist: vi.fn(),
}

describe('WritersRoom', () => {
  it('renders six specialist nav items', () => {
    render(<WritersRoom {...defaultProps} />)
    const nav = screen.getByTestId('specialist-nav')
    // each specialist name appears at least once in the nav
    for (const name of ['Sam', 'Casey', 'Oliver', 'Maya', 'Zoe', 'Alex']) {
      expect(nav.textContent).toContain(name)
    }
  })

  it('does not render Writing Partner as a nav item', () => {
    render(<WritersRoom {...defaultProps} />)
    // "Writing Partner" may appear in other contexts; check nav specifically
    const navItems = screen.getAllByRole('button').filter(btn =>
      btn.closest('[data-testid="specialist-nav"]')
    )
    const labels = navItems.map(btn => btn.textContent)
    expect(labels.some(l => l?.includes('Writing Partner'))).toBe(false)
  })

  it('default selected specialist is Oliver', () => {
    render(<WritersRoom {...defaultProps} />)
    expect(screen.getByTestId('specialist-workspace')).toHaveTextContent('Oliver')
  })

  it('clicking Sam changes selected workspace to Sam', () => {
    render(<WritersRoom {...defaultProps} />)
    // Sam only appears in nav (Oliver is default); safe to use getAllByText[0]
    fireEvent.click(screen.getAllByText('Sam')[0])
    expect(screen.getByTestId('specialist-workspace')).toHaveTextContent('Sam')
  })

  it('calls onSendToSpecialist with selected id and text on Enter', () => {
    const onSendToSpecialist = vi.fn()
    render(<WritersRoom {...defaultProps} onSendToSpecialist={onSendToSpecialist} />)
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: 'Help me outline' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSendToSpecialist).toHaveBeenCalledWith('oliver', 'Help me outline')
  })

  it('does not call onSendToSpecialist for empty input', () => {
    const onSendToSpecialist = vi.fn()
    render(<WritersRoom {...defaultProps} onSendToSpecialist={onSendToSpecialist} />)
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSendToSpecialist).not.toHaveBeenCalled()
  })

  it('renders selected specialist transcript messages', () => {
    const state = defaultProjectState()
    state.agents.oliver.transcript = [
      { id: '1', role: 'user', content: 'Check my beats', speaker: 'Writer', ts: 1 },
      { id: '2', role: 'assistant', content: 'Your midpoint is weak.', speaker: 'Oliver', ts: 2 },
    ]
    render(<WritersRoom projectState={state} onSendToSpecialist={vi.fn()} />)
    expect(screen.getByText('Check my beats')).toBeInTheDocument()
    expect(screen.getByText('Your midpoint is weak.')).toBeInTheDocument()
  })

  it('calls onClearTranscript for the selected specialist', () => {
    const state = defaultProjectState()
    state.agents.oliver.transcript = [
      { id: '1', role: 'assistant', content: 'Your midpoint is weak.', speaker: 'Oliver', ts: 1 },
    ]
    const onClearTranscript = vi.fn()

    render(
      <WritersRoom
        projectState={state}
        onSendToSpecialist={vi.fn()}
        onClearTranscript={onClearTranscript}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClearTranscript).toHaveBeenCalledWith('oliver')
  })

  it('Shift+Enter does not send', () => {
    const onSendToSpecialist = vi.fn()
    render(<WritersRoom {...defaultProps} onSendToSpecialist={onSendToSpecialist} />)
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSendToSpecialist).not.toHaveBeenCalled()
  })
})
