import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisCompsEditor } from '../../client/src/components/writing/synopsis/SynopsisCompsEditor'

describe('SynopsisCompsEditor', () => {
  it('renders the "Comps & Why This Show Now" label', () => {
    render(<SynopsisCompsEditor value="" onChange={vi.fn()} />)
    expect(screen.getByText('Comps & Why This Show Now')).toBeInTheDocument()
  })

  it('renders textarea with value populated', () => {
    render(<SynopsisCompsEditor value="The Wire meets Succession." onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('The Wire meets Succession.')
  })

  it('typing fires onChange with the new value', () => {
    const onChange = vi.fn()
    render(<SynopsisCompsEditor value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New comps text.' } })
    expect(onChange).toHaveBeenCalledWith('New comps text.')
  })

  it('empty value renders an empty textarea without crashing', () => {
    render(<SynopsisCompsEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
