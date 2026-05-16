import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisPilotEditor } from '../../client/src/components/writing/synopsis/SynopsisPilotEditor'

describe('SynopsisPilotEditor', () => {
  it('renders both "Pilot logline" and "Pilot synopsis" labels', () => {
    render(<SynopsisPilotEditor value={{ logline: '', prose: '' }} onChange={vi.fn()} />)
    expect(screen.getByText('Pilot logline')).toBeInTheDocument()
    expect(screen.getByText('Pilot synopsis')).toBeInTheDocument()
  })

  it('renders the logline input populated', () => {
    render(<SynopsisPilotEditor value={{ logline: 'Hero meets villain.', prose: '' }} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Pilot logline' })).toHaveValue('Hero meets villain.')
  })

  it('renders the prose textarea populated', () => {
    render(<SynopsisPilotEditor value={{ logline: '', prose: 'A long story begins here.' }} onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/write your pilot synopsis/i)).toHaveValue('A long story begins here.')
  })

  it('typing in logline fires onChange with updated logline and existing prose', () => {
    const onChange = vi.fn()
    render(<SynopsisPilotEditor value={{ logline: 'old', prose: 'existing prose' }} onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Pilot logline' }), {
      target: { value: 'new' },
    })
    expect(onChange).toHaveBeenCalledWith({ logline: 'new', prose: 'existing prose' })
  })

  it('typing in prose fires onChange with updated prose and existing logline', () => {
    const onChange = vi.fn()
    render(<SynopsisPilotEditor value={{ logline: 'existing logline', prose: 'old' }} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText(/write your pilot synopsis/i), {
      target: { value: 'new' },
    })
    expect(onChange).toHaveBeenCalledWith({ logline: 'existing logline', prose: 'new' })
  })

  it('renders empty fields without crash when value is empty', () => {
    render(<SynopsisPilotEditor value={{ logline: '', prose: '' }} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Pilot logline' })).toHaveValue('')
    expect(screen.getByPlaceholderText(/write your pilot synopsis/i)).toHaveValue('')
  })
})
