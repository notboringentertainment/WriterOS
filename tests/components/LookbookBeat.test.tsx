import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { LookbookBeat } from '../../client/src/components/writing/outline/LookbookBeat'
import { BeatSheetView } from '../../client/src/components/writing/outline/BeatSheetView'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { createEmptyOutlineContent, type OutlineDocumentContent } from '../../shared/documents'
import type { LookbookDocument } from '../../shared/lookbook'

type LookbookBeatData = LookbookDocument['beats'][string]

const beatData: LookbookBeatData = {
  titleAtAsk: 'Opening image',
  questions: [
    { id: 'q1', prompt: 'What is the light like?', answer: '', askedBy: 'zoe', createdAt: '2026-09-29T10:00:00.000Z' },
    { id: 'q2', prompt: 'What is on the table?', answer: 'A cold cup.', askedBy: 'zoe', createdAt: '2026-09-29T10:00:00.000Z' },
    { id: 'q3', prompt: 'Hidden one?', answer: 'x', askedBy: 'zoe', createdAt: '2026-09-29T10:00:00.000Z', dismissedAt: '2026-09-29T11:00:00.000Z' },
  ],
}

function renderBeat(overrides: Partial<ComponentProps<typeof LookbookBeat>> = {}) {
  const props: ComponentProps<typeof LookbookBeat> = {
    beatKey: 'b1',
    beatTitle: 'Opening image',
    beat: beatData,
    nothingToSee: false,
    onAsk: vi.fn().mockResolvedValue(undefined),
    asking: false,
    askError: null,
    onAnswer: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
  render(<LookbookBeat {...props} />)
  return props
}

describe('LookbookBeat', () => {
  it('renders questions with a free-text answer box and no option pickers', () => {
    renderBeat()
    expect(screen.getByText('What is the light like?')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByDisplayValue('A cold cup.')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden one?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask Zoe for more' })).toBeInTheDocument()
  })

  it('typing an answer calls onAnswer with the question id', () => {
    const props = renderBeat()
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Grey, low, from the left.' } })
    expect(props.onAnswer).toHaveBeenCalledWith('q1', 'Grey, low, from the left.')
  })

  it('shows the first-ask label with no questions, and the nothing-to-see line', () => {
    renderBeat({ beat: undefined, nothingToSee: true })
    expect(screen.getByRole('button', { name: 'Ask Zoe what this looks like' })).toBeInTheDocument()
    expect(screen.getByText('Zoe found nothing to see here yet.')).toBeInTheDocument()
  })

  it('shows the ask error next to the button', () => {
    renderBeat({ askError: 'Zoe could not answer.' })
    expect(screen.getByText('Zoe could not answer.')).toBeInTheDocument()
  })

  it('Dismiss reports the question id', () => {
    const props = renderBeat()
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0])
    expect(props.onDismiss).toHaveBeenCalledWith('q1')
  })
})

describe('BeatSheetView lookbook wiring', () => {
  const content: OutlineDocumentContent = {
    ...createEmptyOutlineContent(),
    units: [{ ...createOutlineUnit('b1'), number: 1, actOrSequence: 'Setup', title: 'Opening image', whatHappens: 'Dawn.' }],
    beatSheetSource: { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1, label: null },
  }
  const base = {
    content, status: null, onRefresh: vi.fn(), onAnswer: vi.fn(), onDismiss: vi.fn(),
    onRemoveOrphan: vi.fn(), onContentChange: vi.fn(), refreshing: false,
  }

  it('a beat with zero questions after an ask shows the nothing-to-see line', async () => {
    const onAskQuestions = vi.fn().mockResolvedValue({ nothingToSee: true })
    render(<BeatSheetView {...base} lookbook={undefined} onAskQuestions={onAskQuestions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Zoe what this looks like' }))
    expect(await screen.findByText('Zoe found nothing to see here yet.')).toBeInTheDocument()
    expect(onAskQuestions).toHaveBeenCalledWith('b1')
  })

  it('a rejected ask shows the error', async () => {
    const onAskQuestions = vi.fn().mockRejectedValue(new Error('boom'))
    render(<BeatSheetView {...base} lookbook={undefined} onAskQuestions={onAskQuestions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Zoe what this looks like' }))
    expect(await screen.findByText(/boom/)).toBeInTheDocument()
  })
})
