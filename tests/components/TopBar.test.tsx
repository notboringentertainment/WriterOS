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
  it('renders four writing tabs', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('Script')).toBeInTheDocument()
    expect(screen.getByText('Story Bible')).toBeInTheDocument()
    expect(screen.getByText('Beat Sheet')).toBeInTheDocument()
    expect(screen.getByText('Pages')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
  })

  it("renders Writer tool", () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText("Writer")).toBeInTheDocument()
  })

  it('keeps voice controls on the Writer page', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Voice Profile' })).not.toBeInTheDocument()
  })

  it('marks active tab with aria-selected true', () => {
    render(<TopBar {...defaultProps} activeTab="outline" />)
    expect(screen.getByRole('tab', { name: 'Beat Sheet' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Script' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabChange with tab id when writing tab clicked', () => {
    const onTabChange = vi.fn()
    render(<TopBar {...defaultProps} onTabChange={onTabChange} />)
    fireEvent.click(screen.getByText('Pages'))
    expect(onTabChange).toHaveBeenCalledWith('treatment')
  })

  it("calls onWritersRoom when Writer's Room clicked", () => {
    const onWritersRoom = vi.fn()
    render(<TopBar {...defaultProps} onWritersRoom={onWritersRoom} />)
    fireEvent.click(screen.getByText("Writer"))
    expect(onWritersRoom).toHaveBeenCalled()
  })

  it('marks Writer pressed when its page is open', () => {
    render(<TopBar {...defaultProps} writersRoomActive />)
    expect(screen.getByRole('button', { name: 'Writer' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not render a non-functional ⌘K command-palette button', () => {
    // Guard against re-adding a control that implies a command palette before one exists.
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByText('⌘K')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /⌘k/i })).not.toBeInTheDocument()
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

  it('keeps project creation and library navigation on Home', () => {
    render(<TopBar {...defaultProps} onNewProject={vi.fn()} onProjectChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'New script' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('TopBar save status', () => {
  it('drops "Saved …" when another project opens', async () => {
    const props = { ...defaultProps, onSaveProject: vi.fn(async () => true) }
    const { rerender } = render(<TopBar {...props} activeProjectId="a" />)
    fireEvent.click(screen.getByRole('button', { name: /project actions/i }))
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument()
    rerender(<TopBar {...props} activeProjectId="b" />)
    expect(screen.queryByText(/^Saved /)).not.toBeInTheDocument()
  })
})

describe('TopBar Canon menu', () => {
  it('disables Memory when there is no project to open it for', () => {
    const { rerender } = render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canon' }))
    expect(screen.getByRole('menuitem', { name: 'Memory' })).toBeDisabled()
    const onOpenMemory = vi.fn()
    rerender(<TopBar {...defaultProps} onOpenMemory={onOpenMemory} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Memory' }))
    expect(onOpenMemory).toHaveBeenCalledTimes(1)
  })
})
