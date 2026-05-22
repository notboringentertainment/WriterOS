import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentViewToggle } from '../../client/src/components/shared/DocumentViewToggle'

describe('DocumentViewToggle', () => {
  it('renders both segments', () => {
    render(<DocumentViewToggle value="edit" onChange={vi.fn()} />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Document')).toBeInTheDocument()
  })

  it('marks the active segment via aria-pressed matching the value prop', () => {
    render(<DocumentViewToggle value="document" onChange={vi.fn()} />)
    expect(screen.getByText('Edit')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Document')).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the inactive segment calls onChange with the other value', () => {
    const onChange = vi.fn()
    render(<DocumentViewToggle value="edit" onChange={onChange} />)
    fireEvent.click(screen.getByText('Document'))
    expect(onChange).toHaveBeenCalledWith('document')
  })

  it('clicking the already-active segment still calls onChange with the same value', () => {
    const onChange = vi.fn()
    render(<DocumentViewToggle value="edit" onChange={onChange} />)
    fireEvent.click(screen.getByText('Edit'))
    expect(onChange).toHaveBeenCalledWith('edit')
  })
})
