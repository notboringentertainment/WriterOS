import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '../../client/src/components/shell/TopBar'

const defaultProps = {
  activeTab: 'script' as const,
  writersRoomActive: false,
  projectTitle: 'The Long Hallway',
  onTabChange: vi.fn(),
  onWritersRoom: vi.fn(),
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

  it('shows project title', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('The Long Hallway')).toBeInTheDocument()
  })
})
