import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '../../client/src/components/shell/TopBar'

describe('Phase 1 shell', () => {
  it('has four places, Home on the brand, and Canon destinations', () => {
    const onTabChange = vi.fn()
    const onHome = vi.fn()
    const onOpenMemory = vi.fn()
    render(<TopBar activeTab="synopsis" projectTitle="The Long Hallway" writersRoomActive={false}
      onTabChange={onTabChange} onHome={onHome} onOpenMemory={onOpenMemory}
      onWritersRoom={vi.fn()} onVoiceProfile={vi.fn()} voiceProfileOpen={false} />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Script', 'Beat Sheet', 'Pages', 'Story Facts'])
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'WriterOS' }))
    expect(onHome).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Canon' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Memory' }))
    expect(onOpenMemory).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Canon' }))
    fireEvent.click(screen.getByRole('menuitem', { name: "What's Standing" }))
    expect(onTabChange).toHaveBeenCalledWith('whats-standing')
    expect(screen.queryByRole('button', { name: 'New script' })).not.toBeInTheDocument()
  })
})
