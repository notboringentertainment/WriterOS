import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RitualPage } from '../../client/src/components/ritual/RitualPage'
import { RitualProgress } from '../../client/src/components/ritual/RitualProgress'

describe('RitualPage', () => {
  it('renders eyebrow, title, subtitle, and content', () => {
    render(
      <RitualPage eyebrow="First Meeting" title="The First Meeting" subtitle="Bring the raw idea.">
        <p>content</p>
      </RitualPage>,
    )
    expect(screen.getByTestId('ritual-page')).toBeInTheDocument()
    expect(screen.getByText('First Meeting')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The First Meeting' })).toBeInTheDocument()
    expect(screen.getByText('Bring the raw idea.')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('shows the exit affordance only when onExit is provided', () => {
    const onExit = vi.fn()
    const { rerender } = render(
      <RitualPage eyebrow="Voice" title="The story of you" exitLabel="Skip for now" onExit={onExit}>
        <p>content</p>
      </RitualPage>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onExit).toHaveBeenCalled()

    rerender(
      <RitualPage eyebrow="Voice" title="The story of you">
        <p>content</p>
      </RitualPage>,
    )
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
  })
})

describe('RitualProgress', () => {
  it('renders the counter clamped to the total', () => {
    render(<RitualProgress current={4} total={16} />)
    expect(screen.getByText('4 of 16')).toBeInTheDocument()

    render(<RitualProgress current={20} total={16} label="Question" />)
    expect(screen.getByText('Question · 16 of 16')).toBeInTheDocument()
  })
})
