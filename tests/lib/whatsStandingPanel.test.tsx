import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuestionCard } from '../../client/src/components/writing/whatsStanding/QuestionCard'
import { WhatsStandingView } from '../../client/src/components/writing/whatsStanding/WhatsStandingView'
import type { EnrichedQuestion, WhatsStandingPayload } from '../../shared/whatsStandingPanel'

const question: EnrichedQuestion = {
  annotationId: 'ann_1', status: 'new', questionText: 'Which records does it refer to?',
  recordId: 'mem-ref', questionVersion: 'a'.repeat(64),
  candidates: [{ id: 'mem-a', headline: 'First decision' }, { id: 'mem-b', headline: 'Second decision' }],
}

describe('WhatsStanding panel components', () => {
  it('QuestionCard: confirm disabled until a candidate is selected; multi-select posts all ids', () => {
    const onAnswer = vi.fn()
    render(<QuestionCard question={question} disabled={false} onAnswer={onAnswer} />)
    const confirm = screen.getByRole('button', { name: /confirm/i })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByText('First decision'))
    fireEvent.click(screen.getByText('Second decision'))
    fireEvent.click(confirm)
    expect(onAnswer).toHaveBeenCalledWith('ann_1', 'a'.repeat(64),
      { kind: 'referents', recordIds: ['mem-a', 'mem-b'] })
  })

  it('QuestionCard: cant-say and decline; no text input exists; zero candidates hides confirm', () => {
    const onAnswer = vi.fn()
    const { container, rerender } = render(<QuestionCard question={question} disabled={false} onAnswer={onAnswer} />)
    expect(container.querySelector('input[type=text], textarea')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /can.t say/i }))
    expect(onAnswer).toHaveBeenCalledWith('ann_1', 'a'.repeat(64), { kind: 'cant-say' })
    rerender(<QuestionCard question={{ ...question, candidates: [] }} disabled={false} onAnswer={onAnswer} />)
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
  })

  it('WhatsStandingView: card renders beneath its anchor block; unanchored questions fall back to a bottom list; parked cant-say line present', () => {
    const payload: WhatsStandingPayload = {
      composed: {
        schemaVersion: 1, generatedAt: '2026-08-18T00:00:00.000Z', model: null,
        recipeVersion: 1, composerVersion: 1, sourceHash: 'a'.repeat(64), format: 'feature',
        blocks: [
          { type: 'heading', text: "What's Standing" },
          { type: 'leadInParagraph', lead: 'This record points elsewhere:', text: '“Superseded by beats 9-11”', sourceFieldIds: ['mem-ref'], annotationId: 'ann_1' },
        ],
        fidelity: { status: 'flagged', warnings: [
          { kind: 'unresolved_reference', message: 'Unresolved reference in mem-ref (unasked): “beats 9-11”.' },
          { kind: 'unresolved_reference', message: 'Unresolved reference in mem-x (cant-say): “the pilot ticket”.' },
        ] },
      },
      questions: [question, { ...question, annotationId: 'ann_orphan' }],
    }
    render(<WhatsStandingView payload={payload} answeringId={null} notice={null} onAnswer={() => {}} />)
    expect(screen.getByText(/2 references unresolved/i)).toBeInTheDocument()
    expect(screen.getByText(/parked/i)).toBeInTheDocument()          // cant-say banner line
    expect(screen.getAllByText(/can.t say/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/still needs an answer/i)).toBeInTheDocument() // fallback section for ann_orphan
  })
})
