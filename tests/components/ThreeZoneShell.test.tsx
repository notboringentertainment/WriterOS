import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThreeZoneShell } from '../../client/src/components/shell/ThreeZoneShell'

const slots = {
  spine: <div>SPINE_CONTENT</div>,
  console: <div>CONSOLE_CONTENT</div>,
  paper: <div>PAPER_CONTENT</div>,
  morgan: <div>MORGAN_CONTENT</div>,
}

describe('ThreeZoneShell', () => {
  it('renders all four zone slots', () => {
    render(<ThreeZoneShell {...slots} />)
    expect(screen.getByText('SPINE_CONTENT')).toBeInTheDocument()
    expect(screen.getByText('CONSOLE_CONTENT')).toBeInTheDocument()
    expect(screen.getByText('PAPER_CONTENT')).toBeInTheDocument()
    expect(screen.getByText('MORGAN_CONTENT')).toBeInTheDocument()
  })

  it('keeps Spine and Console as two stacked regions inside one left zone', () => {
    render(<ThreeZoneShell {...slots} />)
    const leftZone = screen.getByLabelText('Structure and state')
    const spine = within(leftZone).getByLabelText('Surface Map')
    const console = within(leftZone).getByLabelText('Project status')
    // Both regions live inside the single left zone — not separate columns
    expect(spine).toBeInTheDocument()
    expect(console).toBeInTheDocument()
    expect(leftZone).toContainElement(spine)
    expect(leftZone).toContainElement(console)
  })

  it('exposes accessible summon buttons for Map, Status, and Morgan', () => {
    render(<ThreeZoneShell {...slots} />)
    const summon = screen.getByLabelText('Summon')
    expect(within(summon).getByRole('button', { name: /map/i })).toBeInTheDocument()
    expect(within(summon).getByRole('button', { name: /status/i })).toBeInTheDocument()
    expect(within(summon).getByRole('button', { name: /morgan/i })).toBeInTheDocument()
  })

  it('uses honest labels — no zone or control claims to be a teleprompter', () => {
    render(<ThreeZoneShell {...slots} />)
    // The right zone hosts the Morgan rail today; nothing should imply a real teleprompter.
    expect(screen.queryByLabelText(/teleprompter/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /teleprompter/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Morgan')).toBeInTheDocument()
  })

  it('opens an accessible overlay when a summon button is clicked', () => {
    render(<ThreeZoneShell {...slots} />)
    const summon = screen.getByLabelText('Summon')
    fireEvent.click(within(summon).getByRole('button', { name: /map/i }))
    const overlay = screen.getByRole('dialog')
    expect(overlay).toBeInTheDocument()
    expect(within(overlay).getByText('SPINE_CONTENT')).toBeInTheDocument()
  })

  it('closes the summon overlay', () => {
    render(<ThreeZoneShell {...slots} />)
    fireEvent.click(within(screen.getByLabelText('Summon')).getByRole('button', { name: /morgan/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not keep summon overlay visible in chromeless mode', () => {
    const { rerender } = render(<ThreeZoneShell {...slots} />)
    fireEvent.click(within(screen.getByLabelText('Summon')).getByRole('button', { name: /map/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    rerender(<ThreeZoneShell {...slots} chromeless />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
