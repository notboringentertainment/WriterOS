import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutlineTab } from '../../client/src/components/writing/OutlineTab'
import { defaultProjectState } from '../../client/src/lib/projectState'

describe('OutlineTab', () => {
  const defaultOutline = defaultProjectState().outline

  it('renders all 15 Save the Cat beat names', () => {
    render(<OutlineTab outline={defaultOutline} onUpdateBeat={vi.fn()} onReorderBeats={vi.fn()} />)
    expect(screen.getByText('Opening Image')).toBeInTheDocument()
    expect(screen.getByText('Midpoint')).toBeInTheDocument()
    expect(screen.getByText('Final Image')).toBeInTheDocument()
  })

  it('calls onUpdateBeat when notes textarea changes', () => {
    const onUpdateBeat = vi.fn()
    render(<OutlineTab outline={defaultOutline} onUpdateBeat={onUpdateBeat} onReorderBeats={vi.fn()} />)
    const textareas = screen.getAllByRole('textbox')
    fireEvent.change(textareas[0], { target: { value: 'Hero is shown alone in rain.' } })
    expect(onUpdateBeat).toHaveBeenCalledWith('opening-image', { notes: 'Hero is shown alone in rain.' })
  })

  it('shows existing beat notes', () => {
    const outline = {
      ...defaultOutline,
      beats: defaultOutline.beats.map((b: any) =>
        b.id === 'midpoint' ? { ...b, notes: 'Hero defeats henchman but loses ally.' } : b
      ),
    }
    render(<OutlineTab outline={outline} onUpdateBeat={vi.fn()} onReorderBeats={vi.fn()} />)
    expect(screen.getByDisplayValue('Hero defeats henchman but loses ally.')).toBeInTheDocument()
  })

  it('calls onReorderBeats when a beat is dragged onto another beat', () => {
    const onReorderBeats = vi.fn()
    const data = new Map<string, string>()
    render(<OutlineTab outline={defaultOutline} onUpdateBeat={vi.fn()} onReorderBeats={onReorderBeats} />)

    const openingImage = screen.getByText('Opening Image').closest('div[draggable="true"]')!
    const midpoint = screen.getByText('Midpoint').closest('div[draggable="true"]')!
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ''),
    }

    fireEvent.dragStart(openingImage, { dataTransfer })
    fireEvent.dragOver(midpoint, { dataTransfer })
    fireEvent.drop(midpoint, { dataTransfer })

    expect(onReorderBeats).toHaveBeenCalledWith(0, 8)
  })

  it('ignores drops without a valid dragged beat index', () => {
    const onReorderBeats = vi.fn()
    render(<OutlineTab outline={defaultOutline} onUpdateBeat={vi.fn()} onReorderBeats={onReorderBeats} />)

    const midpoint = screen.getByText('Midpoint').closest('div[draggable="true"]')!
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(() => ''),
    }

    fireEvent.dragOver(midpoint, { dataTransfer })
    fireEvent.drop(midpoint, { dataTransfer })

    expect(onReorderBeats).not.toHaveBeenCalled()
  })
})
