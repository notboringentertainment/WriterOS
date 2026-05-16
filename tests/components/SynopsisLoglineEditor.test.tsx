import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisLoglineEditor } from '../../client/src/components/writing/synopsis/SynopsisLoglineEditor'

describe('SynopsisLoglineEditor', () => {
  it('renders the textarea with value.text populated', () => {
    render(<SynopsisLoglineEditor value={{ text: 'A detective must solve the case.' }} onTextChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Logline' })).toHaveValue('A detective must solve the case.')
  })

  it('typing fires onTextChange with the new value', () => {
    const onTextChange = vi.fn()
    render(<SynopsisLoglineEditor value={{ text: '' }} onTextChange={onTextChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Logline' }), {
      target: { value: 'New logline text.' },
    })
    expect(onTextChange).toHaveBeenCalledWith('New logline text.')
  })

  it('renders the "Logline" header in display font', () => {
    render(<SynopsisLoglineEditor value={{ text: '' }} onTextChange={vi.fn()} />)
    expect(screen.getByText('Logline')).toBeInTheDocument()
  })

  it('renders the placeholder hint when value is empty', () => {
    render(<SynopsisLoglineEditor value={{ text: '' }} onTextChange={vi.fn()} />)
    expect(screen.getByText('One or two sentences: protagonist, goal, obstacle, stakes.')).toBeInTheDocument()
  })

  it('does not render the placeholder hint when value has text', () => {
    render(<SynopsisLoglineEditor value={{ text: 'Something here.' }} onTextChange={vi.fn()} />)
    expect(screen.queryByText('One or two sentences: protagonist, goal, obstacle, stakes.')).not.toBeInTheDocument()
  })
})
