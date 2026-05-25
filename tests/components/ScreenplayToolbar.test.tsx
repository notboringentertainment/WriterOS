import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScreenplayToolbar } from '../../client/src/components/writing/screenplay/ScreenplayToolbar'

describe('ScreenplayToolbar', () => {
  const defaultProps = {
    elementType: 'action' as const,
    wordCount: 0,
    pageCount: 1,
    focusMode: false,
    onElementTypeChange: vi.fn(),
    onToggleFocusMode: vi.fn(),
  }

  it('renders the current element type label', () => {
    render(<ScreenplayToolbar {...defaultProps} elementType="character" />)
    expect(screen.getByDisplayValue('Character')).toBeInTheDocument()
  })

  it('renders word count and page count', () => {
    render(<ScreenplayToolbar {...defaultProps} wordCount={500} pageCount={2} />)
    expect(screen.getByText(/500 words/i)).toBeInTheDocument()
    expect(screen.getByText(/2 pages/i)).toBeInTheDocument()
  })

  it('calls onElementTypeChange when select changes', () => {
    const onElementTypeChange = vi.fn()
    render(<ScreenplayToolbar {...defaultProps} onElementTypeChange={onElementTypeChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dialogue' } })
    expect(onElementTypeChange).toHaveBeenCalledWith('dialogue')
  })

  it('calls onToggleFocusMode when Focus button clicked', () => {
    const onToggleFocusMode = vi.fn()
    render(<ScreenplayToolbar {...defaultProps} onToggleFocusMode={onToggleFocusMode} />)
    fireEvent.click(screen.getByText('Focus'))
    expect(onToggleFocusMode).toHaveBeenCalled()
  })

  it('routes Final Draft import and replace actions separately', () => {
    const onImportFdx = vi.fn()
    const onReplaceFdx = vi.fn()
    render(
      <ScreenplayToolbar
        {...defaultProps}
        onImportFdx={onImportFdx}
        onReplaceFdx={onReplaceFdx}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Import .fdx' }))
    expect(onImportFdx).toHaveBeenCalledTimes(1)
    expect(onReplaceFdx).toHaveBeenCalledTimes(0)

    fireEvent.click(screen.getByRole('button', { name: 'Replace .fdx' }))
    expect(onImportFdx).toHaveBeenCalledTimes(1)
    expect(onReplaceFdx).toHaveBeenCalledTimes(1)
  })

  it('hides when focusMode is true', () => {
    const { container } = render(<ScreenplayToolbar {...defaultProps} focusMode={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('sticks to the top of the script scroll area', () => {
    render(<ScreenplayToolbar {...defaultProps} />)
    const toolbar = screen.getByRole('combobox', { name: /element type/i }).closest('div')
    expect(toolbar).toHaveStyle({ position: 'sticky', top: '0px' })
  })
})
