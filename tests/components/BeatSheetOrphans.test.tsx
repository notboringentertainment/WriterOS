import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { BeatSheetView } from '../../client/src/components/writing/outline/BeatSheetView'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { createEmptyOutlineContent, type OutlineDocumentContent } from '../../shared/documents'
import type { LookbookDocument } from '../../shared/lookbook'

const content: OutlineDocumentContent = {
  ...createEmptyOutlineContent(),
  units: [{ ...createOutlineUnit('b1'), number: 1, actOrSequence: 'Setup', title: 'Opening image', whatHappens: 'Dawn.' }],
  beatSheetSource: { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1, label: null },
}
const q = (id: string, prompt: string, answer: string) => ({ id, prompt, answer, askedBy: 'zoe' as const, createdAt: '2026-09-29T10:00:00.000Z' })
const lookbook: LookbookDocument = {
  version: 1,
  beats: {
    b1: { titleAtAsk: 'Opening image', questions: [q('q1', 'Live question?', 'live answer')] },
    gone: { titleAtAsk: 'Old midpoint', questions: [q('q2', 'Orphan question?', 'orphan answer')] },
  },
}

function renderView(onRemoveOrphan = vi.fn()) {
  render(
    <BeatSheetView
      content={content} status={null} lookbook={lookbook} onRefresh={vi.fn()}
      onAskQuestions={vi.fn()} onAnswer={vi.fn()} onDismiss={vi.fn()} onRemoveOrphan={onRemoveOrphan}
      onContentChange={vi.fn()} refreshing={false}
    />,
  )
  return { onRemoveOrphan }
}

describe('BeatSheetView orphaned answers', () => {
  it('shows answers for dead beat keys under their own header with titleAtAsk, not under a live beat', () => {
    renderView()
    const header = screen.getByText('Answers from beats that are no longer in Story-drive')
    const section = header.closest('section') as HTMLElement
    expect(within(section).getByText('Old midpoint')).toBeInTheDocument()
    expect(within(section).getByText('Orphan question?')).toBeInTheDocument()
    expect(within(section).getByText('orphan answer')).toBeInTheDocument()
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument()
    const article = screen.getByText('1. Opening image').closest('article') as HTMLElement
    expect(within(article).queryByText('Orphan question?')).not.toBeInTheDocument()
    expect(within(article).getByText('Live question?')).toBeInTheDocument()
    expect(section.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('Remove on an orphan calls onRemoveOrphan with only that beat key', () => {
    const { onRemoveOrphan } = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemoveOrphan).toHaveBeenCalledTimes(1)
    expect(onRemoveOrphan).toHaveBeenCalledWith('gone')
  })

  it('renders no orphan section when nothing is orphaned', () => {
    render(
      <BeatSheetView
        content={content} status={null} lookbook={{ version: 1, beats: { b1: lookbook.beats.b1 } }} onRefresh={vi.fn()}
        onAskQuestions={vi.fn()} onAnswer={vi.fn()} onDismiss={vi.fn()} onRemoveOrphan={vi.fn()}
        onContentChange={vi.fn()} refreshing={false}
      />,
    )
    expect(screen.queryByText('Answers from beats that are no longer in Story-drive')).not.toBeInTheDocument()
  })
})
