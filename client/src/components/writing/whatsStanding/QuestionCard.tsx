// Visual language copied from MemoryConflictCard.tsx (Task 9): bordered
// card, mono meta labels, discrete buttons — no free-text input anywhere.
// The writer resolves a reference by picking from candidates the composer
// already found, or by explicitly declining to answer.
import React, { useState } from 'react'
import type { z } from 'zod'
import type { EnrichedQuestion } from '@shared/whatsStandingPanel'
import { WhatsStandingAnswerSchema } from '@shared/whatsStandingPanel'

export type WhatsStandingAnswer = z.infer<typeof WhatsStandingAnswerSchema>

export interface QuestionCardProps {
  question: EnrichedQuestion
  disabled: boolean
  onAnswer: (annotationId: string, questionVersion: string, answer: WhatsStandingAnswer) => void
  /** Card-level error from a failed answer attempt (400/404) — renders above the buttons, not
   *  as a panel-wide error that hides the whole report. */
  errorMessage?: string
}

export function QuestionCard({ question, disabled, onAnswer, errorMessage }: QuestionCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const hasCandidates = question.candidates.length > 0

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCandidates = question.candidates.filter(candidate => selected.has(candidate.id))

  function confirmReferents() {
    const recordIds = selectedCandidates.map(candidate => candidate.id)
    onAnswer(question.annotationId, question.questionVersion, { kind: 'referents', recordIds })
  }

  return (
    <article style={styles.card} aria-label="What's Standing question">
      <p style={styles.meta}>{question.status === 'proposed' ? 'Proposed referents' : 'Unresolved reference'}</p>
      <p style={styles.questionText}>{question.questionText}</p>
      {errorMessage && <p style={styles.error}>{errorMessage}</p>}
      {hasCandidates && (
        <div style={styles.candidates}>
          {question.candidates.map(candidate => {
            const isSelected = selected.has(candidate.id)
            return (
              <button
                key={candidate.id}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                style={{ ...styles.candidateButton, ...(isSelected ? styles.candidateButtonSelected : {}) }}
                onClick={() => toggle(candidate.id)}
              >
                {candidate.headline}
              </button>
            )
          })}
        </div>
      )}
      <div style={styles.actions}>
        {hasCandidates && (
          <button
            type="button"
            disabled={disabled || selectedCandidates.length === 0}
            style={styles.actionButton}
            onClick={confirmReferents}
          >
            Confirm referents
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          style={styles.actionButton}
          onClick={() => onAnswer(question.annotationId, question.questionVersion, { kind: 'cant-say' })}
        >
          Can’t say — keeps the report incomplete
        </button>
        <button
          type="button"
          disabled={disabled}
          style={styles.actionButton}
          onClick={() => onAnswer(question.annotationId, question.questionVersion, { kind: 'decline' })}
        >
          Not a reference — don’t ask again
        </button>
      </div>
    </article>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: 'var(--surface)',
  },
  meta: {
    margin: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--fg-subtle)',
  },
  error: {
    margin: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.04em',
    color: 'var(--error, #b91c1c)',
  },
  questionText: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--fg)',
  },
  candidates: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  candidateButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  candidateButtonSelected: {
    borderColor: 'var(--fg)',
    background: 'hsla(0, 0%, 50%, 0.12)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--fg)',
    cursor: 'pointer',
  },
}
