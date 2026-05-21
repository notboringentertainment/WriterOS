import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedSection } from '../../client/src/components/shared/GuidedSection'

describe('GuidedSection', () => {
  it('renders the label', () => {
    render(<GuidedSection label="Logline" guidance="1-2 sentences" value="" onChange={vi.fn()} />)
    expect(screen.getByText('Logline')).toBeInTheDocument()
  })

  it('renders guidance text', () => {
    render(<GuidedSection label="Logline" guidance="1-2 sentences, character-driven" value="" onChange={vi.fn()} />)
    expect(screen.getByText('1-2 sentences, character-driven')).toBeInTheDocument()
  })

  it('calls onChange when textarea changes', () => {
    const onChange = vi.fn()
    render(<GuidedSection label="Logline" guidance="guidance" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A hero rises.' } })
    expect(onChange).toHaveBeenCalledWith('A hero rises.')
  })

  it('shows current value in textarea', () => {
    render(<GuidedSection label="Logline" guidance="guidance" value="A hero rises." onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('A hero rises.')
  })
})
