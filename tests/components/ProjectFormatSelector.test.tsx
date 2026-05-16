import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProjectFormatSelector } from '../../client/src/components/shared/ProjectFormatSelector'

describe('ProjectFormatSelector', () => {
  it('renders Feature and Series options', () => {
    render(<ProjectFormatSelector value="feature" onChange={vi.fn()} />)

    const select = screen.getByLabelText(/^format$/i) as HTMLSelectElement
    expect(Array.from(select.options).map(option => option.value)).toEqual(['feature', 'series'])
  })

  it('normalizes unknown values to Feature', () => {
    render(<ProjectFormatSelector value="pilot" onChange={vi.fn()} />)

    expect(screen.getByLabelText(/^format$/i)).toHaveValue('feature')
  })

  it('emits normalized project format values on change', () => {
    const onChange = vi.fn()
    render(<ProjectFormatSelector value="feature" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/^format$/i), { target: { value: 'series' } })

    expect(onChange).toHaveBeenCalledWith('series')
  })

  it('supports a custom aria label', () => {
    render(<ProjectFormatSelector value="series" ariaLabel="Project format" onChange={vi.fn()} />)

    expect(screen.getByLabelText(/project format/i)).toHaveValue('series')
  })

  it('supports inline variant for document headers', () => {
    render(<ProjectFormatSelector value="feature" variant="inline" onChange={vi.fn()} />)

    expect(screen.getByLabelText(/^format$/i)).toHaveStyle({ background: 'transparent' })
  })
})
