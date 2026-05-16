import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisQaChecklist } from '../../client/src/components/writing/synopsis/SynopsisQaChecklist'
import type { SynopsisDocumentContent } from '@shared/documents'

type Qa = SynopsisDocumentContent['qa']

const allFalse: Qa = {
  protagonistNamedEarly: false,
  goalClear: false,
  obstacleClear: false,
  stakesClear: false,
  endingRevealed: false,
  paragraphsConnectCausally: false,
  toneMatchesProject: false,
  noUnnecessarySubplot: false,
}

const mixedValue: Qa = {
  ...allFalse,
  protagonistNamedEarly: true,
  goalClear: true,
  stakesClear: true,
}

const ALL_LABELS = [
  'Protagonist named early',
  'Goal clear',
  'Obstacle clear',
  'Stakes clear',
  'Ending revealed',
  'Paragraphs connect causally',
  'Tone matches intended project',
  'No unnecessary subplot',
]

describe('SynopsisQaChecklist', () => {
  it('renders all eight labels', () => {
    render(<SynopsisQaChecklist value={allFalse} onToggle={vi.fn()} />)
    ALL_LABELS.forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('initial checkbox states reflect the value prop (mixed true/false)', () => {
    render(<SynopsisQaChecklist value={mixedValue} onToggle={vi.fn()} />)
    expect(screen.getByLabelText('Protagonist named early')).toBeChecked()
    expect(screen.getByLabelText('Goal clear')).toBeChecked()
    expect(screen.getByLabelText('Stakes clear')).toBeChecked()
    expect(screen.getByLabelText('Obstacle clear')).not.toBeChecked()
    expect(screen.getByLabelText('Ending revealed')).not.toBeChecked()
    expect(screen.getByLabelText('Paragraphs connect causally')).not.toBeChecked()
    expect(screen.getByLabelText('Tone matches intended project')).not.toBeChecked()
    expect(screen.getByLabelText('No unnecessary subplot')).not.toBeChecked()
  })

  it('clicking a checked checkbox calls onToggle with the correct key and false', () => {
    const onToggle = vi.fn()
    render(<SynopsisQaChecklist value={mixedValue} onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText('Protagonist named early'))
    expect(onToggle).toHaveBeenCalledWith('protagonistNamedEarly', false)
  })

  it('clicking an unchecked checkbox calls onToggle with the correct key and true', () => {
    const onToggle = vi.fn()
    render(<SynopsisQaChecklist value={allFalse} onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText('Paragraphs connect causally'))
    expect(onToggle).toHaveBeenCalledWith('paragraphsConnectCausally', true)
  })
})
