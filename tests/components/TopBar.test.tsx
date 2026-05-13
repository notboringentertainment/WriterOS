import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '../../client/src/components/shell/TopBar'

const defaultProps = {
  activeTab: 'script' as const,
  writersRoomActive: false,
  projectTitle: 'The Long Hallway',
  onTabChange: vi.fn(),
  onWritersRoom: vi.fn(),
  onVoiceProfile: vi.fn(),
  voiceProfileOpen: false,
}

describe('TopBar', () => {
  it('renders all four writing tabs', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('Script')).toBeInTheDocument()
    expect(screen.getByText('Story Bible')).toBeInTheDocument()
    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByText('Synopsis')).toBeInTheDocument()
  })

  it("renders Writer's Room tab", () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText("Writer's Room")).toBeInTheDocument()
  })

  it('renders Voice Profile button', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Voice Profile' })).toBeInTheDocument()
  })

  it('marks active tab with aria-selected true', () => {
    render(<TopBar {...defaultProps} activeTab="outline" />)
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Script' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabChange with tab id when writing tab clicked', () => {
    const onTabChange = vi.fn()
    render(<TopBar {...defaultProps} onTabChange={onTabChange} />)
    fireEvent.click(screen.getByText('Synopsis'))
    expect(onTabChange).toHaveBeenCalledWith('synopsis')
  })

  it("calls onWritersRoom when Writer's Room clicked", () => {
    const onWritersRoom = vi.fn()
    render(<TopBar {...defaultProps} onWritersRoom={onWritersRoom} />)
    fireEvent.click(screen.getByText("Writer's Room"))
    expect(onWritersRoom).toHaveBeenCalled()
  })

  it('calls onVoiceProfile when Voice clicked', () => {
    const onVoiceProfile = vi.fn()
    render(<TopBar {...defaultProps} onVoiceProfile={onVoiceProfile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voice Profile' }))
    expect(onVoiceProfile).toHaveBeenCalled()
  })

  it('marks Voice Profile button pressed when open', () => {
    render(<TopBar {...defaultProps} voiceProfileOpen={true} />)
    expect(screen.getByRole('button', { name: 'Voice Profile' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows project title', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('The Long Hallway')).toBeInTheDocument()
  })

  it('shows default display title when stored title is unset', () => {
    render(<TopBar {...defaultProps} projectTitle="" />)
    expect(screen.getByText('Untitled Project')).toBeInTheDocument()
  })

  it('edits project title inline and saves on Enter', () => {
    const onProjectTitleChange = vi.fn()
    render(<TopBar {...defaultProps} projectTitle="" onProjectTitleChange={onProjectTitleChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Project title: Untitled Project' }))
    const input = screen.getByLabelText('Project title')
    fireEvent.change(input, { target: { value: ' Lifeline ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onProjectTitleChange).toHaveBeenCalledWith('Lifeline')
  })

  it('saves project title on blur', () => {
    const onProjectTitleChange = vi.fn()
    render(<TopBar {...defaultProps} projectTitle="" onProjectTitleChange={onProjectTitleChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Project title: Untitled Project' }))
    const input = screen.getByLabelText('Project title')
    fireEvent.change(input, { target: { value: ' Lifeline ' } })
    fireEvent.blur(input)

    expect(onProjectTitleChange).toHaveBeenCalledWith('Lifeline')
  })

  it('cancels project title edit on Escape', () => {
    const onProjectTitleChange = vi.fn()
    render(<TopBar {...defaultProps} projectTitle="Lifeline" onProjectTitleChange={onProjectTitleChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Project title: Lifeline' }))
    const input = screen.getByLabelText('Project title')
    fireEvent.change(input, { target: { value: 'Other Title' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onProjectTitleChange).not.toHaveBeenCalled()
    expect(screen.getByText('Lifeline')).toBeInTheDocument()
  })
})
