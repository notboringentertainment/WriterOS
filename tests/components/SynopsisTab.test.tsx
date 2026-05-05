import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisTab } from '../../client/src/components/writing/SynopsisTab'

const defaultSynopsis = {
  logline: '',
  sections: { setup: '', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
}

describe('SynopsisTab', () => {
  it('renders all six section labels', () => {
    render(<SynopsisTab synopsis={defaultSynopsis} onUpdate={vi.fn()} />)
    expect(screen.getByText('Logline')).toBeInTheDocument()
    expect(screen.getByText('Setup')).toBeInTheDocument()
    expect(screen.getByText('Act One Break')).toBeInTheDocument()
    expect(screen.getByText('Midpoint')).toBeInTheDocument()
    expect(screen.getByText('Act Two Break')).toBeInTheDocument()
    expect(screen.getByText('Resolution')).toBeInTheDocument()
  })

  it('calls onUpdate with logline key when logline textarea changes', () => {
    const onUpdate = vi.fn()
    render(<SynopsisTab synopsis={defaultSynopsis} onUpdate={onUpdate} />)
    const textareas = screen.getAllByRole('textbox')
    fireEvent.change(textareas[0], { target: { value: 'A hero rises.' } })
    expect(onUpdate).toHaveBeenCalledWith('logline', 'A hero rises.')
  })

  it('shows existing synopsis values', () => {
    const synopsis = {
      logline: 'A detective confronts her past.',
      sections: { setup: 'Set in 1970s Chicago.', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
    }
    render(<SynopsisTab synopsis={synopsis} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('A detective confronts her past.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Set in 1970s Chicago.')).toBeInTheDocument()
  })
})
