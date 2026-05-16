import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisHeaderEditor } from '../../client/src/components/writing/synopsis/SynopsisHeaderEditor'

const defaultHeader = {
  title: 'Heat',
  writer: 'Michael Mann',
  format: 'Feature',
  genre: 'Crime',
  targetRuntime: '170m',
  comps: ['Collateral', 'Thief'],
}

const emptyHeader = {
  title: '',
  writer: '',
  format: '',
  genre: '',
  targetRuntime: '',
  comps: [],
}

describe('SynopsisHeaderEditor', () => {
  it('renders all six labels: TITLE, WRITER, FORMAT, GENRE, RUNTIME, COMPS', () => {
    render(<SynopsisHeaderEditor value={emptyHeader} onChange={vi.fn()} />)
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Writer')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.getByText('Runtime')).toBeInTheDocument()
    expect(screen.getByText('Comps')).toBeInTheDocument()
  })

  it('renders each non-comps field with its current value', () => {
    render(<SynopsisHeaderEditor value={defaultHeader} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Heat')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Michael Mann')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Feature')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Crime')).toBeInTheDocument()
    expect(screen.getByDisplayValue('170m')).toBeInTheDocument()
  })

  it('editing title input fires onChange({ title: "new" })', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={defaultHeader} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'title' })
    fireEvent.change(input, { target: { value: 'new' } })
    expect(onChange).toHaveBeenCalledWith({ title: 'new' })
  })

  it('editing writer input fires onChange({ writer: "new" })', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={defaultHeader} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'writer' })
    fireEvent.change(input, { target: { value: 'new' } })
    expect(onChange).toHaveBeenCalledWith({ writer: 'new' })
  })

  it('editing runtime input fires onChange({ targetRuntime: "90m" })', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={defaultHeader} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'targetRuntime' })
    fireEvent.change(input, { target: { value: '90m' } })
    expect(onChange).toHaveBeenCalledWith({ targetRuntime: '90m' })
  })

  it('comps input renders value.comps.join(", ") when not focused', () => {
    render(<SynopsisHeaderEditor value={defaultHeader} onChange={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'comps' })
    expect(input).toHaveValue('Collateral, Thief')
  })

  it('blurring comps with "Heat, Manchester by the Sea" fires onChange({ comps: ["Heat", "Manchester by the Sea"] })', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={emptyHeader} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'comps' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Heat, Manchester by the Sea' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ comps: ['Heat', 'Manchester by the Sea'] })
  })

  it('blurring comps with "Heat,   Manchester  ,  " trims and drops empties', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={emptyHeader} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'comps' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Heat,   Manchester  ,  ' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ comps: ['Heat', 'Manchester'] })
  })

  it('blurring comps with empty input fires onChange({ comps: [] })', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={defaultHeader} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'comps' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ comps: [] })
  })
})
