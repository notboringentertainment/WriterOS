import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisFutureSeasonsEditor } from '../../client/src/components/writing/synopsis/SynopsisFutureSeasonsEditor'
import type { SynopsisFutureSeason } from '../../shared/documents'

const season1: SynopsisFutureSeason = { id: 'id-1', label: 'Season 2', summary: 'Things escalate.' }
const season2: SynopsisFutureSeason = { id: 'id-2', label: 'Season 3', summary: 'Final confrontation.' }

describe('SynopsisFutureSeasonsEditor', () => {
  it('renders the "Where It Goes" section header', () => {
    render(<SynopsisFutureSeasonsEditor value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Where It Goes')).toBeInTheDocument()
  })

  it('renders no rows but shows Add button when value is empty', () => {
    render(<SynopsisFutureSeasonsEditor value={[]} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('textbox', { name: 'Season label' })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Add future season' })).toBeInTheDocument()
  })

  it('renders both rows with label inputs and summary textareas when two seasons provided', () => {
    render(<SynopsisFutureSeasonsEditor value={[season1, season2]} onChange={vi.fn()} />)
    const labelInputs = screen.getAllByRole('textbox', { name: 'Season label' })
    const summaryTextareas = screen.getAllByRole('textbox', { name: 'Season summary' })
    expect(labelInputs).toHaveLength(2)
    expect(summaryTextareas).toHaveLength(2)
    expect(labelInputs[0]).toHaveValue('Season 2')
    expect(labelInputs[1]).toHaveValue('Season 3')
  })

  it('editing a row label fires onChange with updated array (other rows untouched)', () => {
    const onChange = vi.fn()
    render(<SynopsisFutureSeasonsEditor value={[season1, season2]} onChange={onChange} />)
    const labelInputs = screen.getAllByRole('textbox', { name: 'Season label' })
    fireEvent.change(labelInputs[0], { target: { value: 'Season 2 – Revised' } })
    expect(onChange).toHaveBeenCalledWith([
      { ...season1, label: 'Season 2 – Revised' },
      season2,
    ])
  })

  it('editing a row summary fires onChange with updated array', () => {
    const onChange = vi.fn()
    render(<SynopsisFutureSeasonsEditor value={[season1, season2]} onChange={onChange} />)
    const summaryTextareas = screen.getAllByRole('textbox', { name: 'Season summary' })
    fireEvent.change(summaryTextareas[1], { target: { value: 'Updated summary.' } })
    expect(onChange).toHaveBeenCalledWith([
      season1,
      { ...season2, summary: 'Updated summary.' },
    ])
  })

  it('clicking Add fires onChange with new empty row appended', () => {
    const onChange = vi.fn()
    render(<SynopsisFutureSeasonsEditor value={[season1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add future season' }))
    const [next] = onChange.mock.calls
    const newArr: SynopsisFutureSeason[] = next[0]
    expect(newArr).toHaveLength(2)
    expect(newArr[0]).toEqual(season1)
    expect(newArr[1].label).toBe('')
    expect(newArr[1].summary).toBe('')
    expect(typeof newArr[1].id).toBe('string')
    expect(newArr[1].id.length).toBeGreaterThan(0)
  })

  it('clicking Remove on a row fires onChange with that row dropped', () => {
    const onChange = vi.fn()
    render(<SynopsisFutureSeasonsEditor value={[season1, season2]} onChange={onChange} />)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith([season2])
  })

  it('renders without crash when value is empty array', () => {
    expect(() => {
      render(<SynopsisFutureSeasonsEditor value={[]} onChange={vi.fn()} />)
    }).not.toThrow()
  })
})
