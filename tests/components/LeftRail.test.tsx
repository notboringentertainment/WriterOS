import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeftRail } from '../../client/src/components/shell/LeftRail'
import type { TranscriptMessage } from '../../client/src/lib/projectState'

const defaultProps = {
  open: false,
  onToggle: vi.fn(),
  projectTitle: 'The Long Hallway',
  activeTab: 'script' as const,
  transcript: [] as TranscriptMessage[],
  loading: false,
  onSend: vi.fn(),
}

function makeMsg(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return { id: 'msg1', role: 'user', content: 'Hello', speaker: 'Writer', ts: 1, ...overrides }
}

describe('LeftRail', () => {
  it('renders Writing Partner avatar in collapsed state', () => {
    render(<LeftRail {...defaultProps} open={false} />)
    expect(screen.getByTitle('Writing Partner')).toBeInTheDocument()
  })

  it('calls onToggle when avatar clicked', () => {
    const onToggle = vi.fn()
    render(<LeftRail {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByTitle('Writing Partner'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('shows chat panel when open', () => {
    render(<LeftRail {...defaultProps} open={true} />)
    expect(screen.getAllByText('Writing Partner').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument()
  })

  it('shows the active helper hint for the current surface', () => {
    render(<LeftRail {...defaultProps} open={true} activeTab="synopsis" />)
    expect(screen.getByLabelText('Active helper')).toHaveTextContent('Writing Partner will ask @Sam')
  })

  it('updates the helper hint when a manual mention is typed', () => {
    render(<LeftRail {...defaultProps} open={true} activeTab="outline" />)
    const textarea = screen.getByPlaceholderText(/message/i)

    expect(screen.getByLabelText('Active helper')).toHaveTextContent('Writing Partner will ask @Oliver')

    fireEvent.change(textarea, { target: { value: '@Partner keep this broad' } })

    expect(screen.getByLabelText('Active helper')).toHaveTextContent('Writing Partner')
  })

  it('updates Story Bible helper hint from message intent', () => {
    render(<LeftRail {...defaultProps} open={true} activeTab="story-bible" storyBibleSection="world" />)
    const textarea = screen.getByPlaceholderText(/message/i)

    expect(screen.getByLabelText('Active helper')).toHaveTextContent('Writing Partner will ask @Zoe')

    fireEvent.change(textarea, { target: { value: "What about Isaiah's state of mind?" } })

    expect(screen.getByLabelText('Active helper')).toHaveTextContent('Writing Partner will ask @Casey')
  })

  it('does not show chat panel when closed', () => {
    render(<LeftRail {...defaultProps} open={false} />)
    expect(screen.queryByPlaceholderText(/message/i)).not.toBeInTheDocument()
  })

  it('renders user and assistant messages', () => {
    const transcript: TranscriptMessage[] = [
      makeMsg({ id: '1', role: 'user', content: 'What should I write?', speaker: 'Writer' }),
      makeMsg({ id: '2', role: 'assistant', content: 'Try a logline first.', speaker: 'Sam' }),
    ]
    render(<LeftRail {...defaultProps} open={true} transcript={transcript} />)
    expect(screen.getByText('What should I write?')).toBeInTheDocument()
    expect(screen.getByText('Try a logline first.')).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
  })

  it('calls onClearTranscript from the clear button when transcript has messages', () => {
    const onClearTranscript = vi.fn()
    const transcript: TranscriptMessage[] = [
      makeMsg({ id: '1', role: 'user', content: 'Clear me', speaker: 'Writer' }),
    ]

    render(
      <LeftRail
        {...defaultProps}
        open={true}
        transcript={transcript}
        onClearTranscript={onClearTranscript}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClearTranscript).toHaveBeenCalled()
  })

  it('calls onSend with entered text on Enter', () => {
    const onSend = vi.fn()
    render(<LeftRail {...defaultProps} open={true} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: 'Help me' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Help me')
  })

  it('does not call onSend for empty or whitespace text', () => {
    const onSend = vi.fn()
    render(<LeftRail {...defaultProps} open={true} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<LeftRail {...defaultProps} open={true} onSend={onSend} />)
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows loading indicator when loading is true', () => {
    render(<LeftRail {...defaultProps} open={true} loading={true} />)
    expect(screen.getByLabelText('loading')).toBeInTheDocument()
  })
})
