import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisShowOverviewEditor } from '../../client/src/components/writing/synopsis/SynopsisShowOverviewEditor'

describe('SynopsisShowOverviewEditor', () => {
  it('renders the "Show Overview" label', () => {
    render(<SynopsisShowOverviewEditor value="" onChange={vi.fn()} />)
    expect(screen.getByText('Show Overview')).toBeInTheDocument()
  })

  it('renders the textarea with value populated', () => {
    render(<SynopsisShowOverviewEditor value="A dark procedural set in 1970s Detroit." onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('A dark procedural set in 1970s Detroit.')
  })

  it('typing fires onChange with the new value', () => {
    const onChange = vi.fn()
    render(<SynopsisShowOverviewEditor value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New overview text.' } })
    expect(onChange).toHaveBeenCalledWith('New overview text.')
  })

  it('empty value renders an empty textarea without crashing', () => {
    render(<SynopsisShowOverviewEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
