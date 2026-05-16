import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisSeasonArcEditor } from '../../client/src/components/writing/synopsis/SynopsisSeasonArcEditor'

describe('SynopsisSeasonArcEditor', () => {
  it('renders the "Season One Arc" label', () => {
    render(<SynopsisSeasonArcEditor value="" onChange={vi.fn()} />)
    expect(screen.getByText('Season One Arc')).toBeInTheDocument()
  })

  it('renders textarea with value populated', () => {
    render(<SynopsisSeasonArcEditor value="Tension builds to a breaking point." onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('Tension builds to a breaking point.')
  })

  it('typing fires onChange with the new value', () => {
    const onChange = vi.fn()
    render(<SynopsisSeasonArcEditor value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Arc text here.' } })
    expect(onChange).toHaveBeenCalledWith('Arc text here.')
  })

  it('empty value renders an empty textarea without crashing', () => {
    render(<SynopsisSeasonArcEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
