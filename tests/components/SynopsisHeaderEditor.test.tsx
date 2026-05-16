import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisHeaderEditor } from '../../client/src/components/writing/synopsis/SynopsisHeaderEditor'

const defaultHeader = {
  title: 'Heat',
  writer: 'Michael Mann',
  format: 'feature',
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
    // format is now a <select> — verify via aria-label
    const formatSelect = screen.getByLabelText(/format/i) as HTMLSelectElement
    expect(formatSelect.value).toBe('feature')
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

describe('SynopsisHeaderEditor — format dropdown', () => {
  it('renders the format dropdown with Feature and Series options', () => {
    render(<SynopsisHeaderEditor value={{ ...emptyHeader, format: '' }} onChange={vi.fn()} />)
    const select = screen.getByLabelText(/format/i) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
    expect(options).toEqual(['feature', 'series'])
  })

  it('empty format renders as Feature selected (legacy default)', () => {
    render(<SynopsisHeaderEditor value={{ ...emptyHeader, format: '' }} onChange={vi.fn()} />)
    const select = screen.getByLabelText(/format/i) as HTMLSelectElement
    expect(select.value).toBe('feature')
  })

  it('format=feature renders Feature selected', () => {
    render(<SynopsisHeaderEditor value={{ ...emptyHeader, format: 'feature' }} onChange={vi.fn()} />)
    const select = screen.getByLabelText(/format/i) as HTMLSelectElement
    expect(select.value).toBe('feature')
  })

  it('format=series renders Series selected', () => {
    render(<SynopsisHeaderEditor value={{ ...emptyHeader, format: 'series' }} onChange={vi.fn()} />)
    const select = screen.getByLabelText(/format/i) as HTMLSelectElement
    expect(select.value).toBe('series')
  })

  it('changing the format dropdown fires onChange with the new format', () => {
    const onChange = vi.fn()
    render(<SynopsisHeaderEditor value={{ ...emptyHeader, format: 'feature' }} onChange={onChange} />)
    const select = screen.getByLabelText(/format/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'series' } })
    expect(onChange).toHaveBeenCalledWith({ format: 'series' })
  })
})

describe('SynopsisHeaderEditor — series rows', () => {
  it('does NOT render seriesType and episodeLength rows when format is feature', () => {
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'feature' }}
        onChange={vi.fn()}
        seriesType="ongoing"
        episodeLength="hour"
        onSeriesTypeChange={vi.fn()}
        onEpisodeLengthChange={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/series type/i)).toBeNull()
    expect(screen.queryByLabelText(/episode length/i)).toBeNull()
  })

  it('does NOT render seriesType row when format=series but onSeriesTypeChange is missing', () => {
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'series' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/series type/i)).toBeNull()
  })

  it('renders seriesType and episodeLength rows when format=series and both callbacks provided', () => {
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'series' }}
        onChange={vi.fn()}
        seriesType="ongoing"
        episodeLength="hour"
        onSeriesTypeChange={vi.fn()}
        onEpisodeLengthChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/series type/i)).toBeTruthy()
    expect(screen.getByLabelText(/episode length/i)).toBeTruthy()
  })

  it('seriesType dropdown defaults to Ongoing when prop is undefined', () => {
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'series' }}
        onChange={vi.fn()}
        onSeriesTypeChange={vi.fn()}
        onEpisodeLengthChange={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/series type/i) as HTMLSelectElement
    expect(select.value).toBe('ongoing')
  })

  it('episodeLength dropdown defaults to Hour when prop is undefined', () => {
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'series' }}
        onChange={vi.fn()}
        onSeriesTypeChange={vi.fn()}
        onEpisodeLengthChange={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/episode length/i) as HTMLSelectElement
    expect(select.value).toBe('hour')
  })

  it('changing seriesType fires onSeriesTypeChange with new value', () => {
    const onSeriesTypeChange = vi.fn()
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'series' }}
        onChange={vi.fn()}
        seriesType="ongoing"
        episodeLength="hour"
        onSeriesTypeChange={onSeriesTypeChange}
        onEpisodeLengthChange={vi.fn()}
      />,
    )
    const select = screen.getByLabelText(/series type/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'limited' } })
    expect(onSeriesTypeChange).toHaveBeenCalledWith('limited')
  })

  it('changing episodeLength fires onEpisodeLengthChange with new value', () => {
    const onEpisodeLengthChange = vi.fn()
    render(
      <SynopsisHeaderEditor
        value={{ ...emptyHeader, format: 'series' }}
        onChange={vi.fn()}
        seriesType="ongoing"
        episodeLength="hour"
        onSeriesTypeChange={vi.fn()}
        onEpisodeLengthChange={onEpisodeLengthChange}
      />,
    )
    const select = screen.getByLabelText(/episode length/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'half_hour' } })
    expect(onEpisodeLengthChange).toHaveBeenCalledWith('half_hour')
  })
})
