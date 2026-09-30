import React from 'react'
import type { LookbookDocument } from '@shared/lookbook'

type LookbookBeatData = LookbookDocument['beats'][string]

export interface LookbookBeatProps {
  beatKey: string
  beatTitle: string
  beat: LookbookBeatData | undefined
  nothingToSee: boolean
  onAsk: () => Promise<void>
  asking: boolean
  askError: string | null
  onAnswer: (questionId: string, answer: string) => void
  onDismiss: (questionId: string) => void
}

export function LookbookBeat({
  beatKey,
  beatTitle,
  beat,
  nothingToSee,
  onAsk,
  asking,
  askError,
  onAnswer,
  onDismiss,
}: LookbookBeatProps) {
  const hasQuestions = (beat?.questions.length ?? 0) > 0
  const live = (beat?.questions ?? []).filter(question => !question.dismissedAt)

  return (
    <div style={styles.wrap}>
      <p style={styles.label}>Lookbook</p>
      {live.map(question => (
        <div key={question.id} style={styles.question}>
          <label style={styles.prompt} htmlFor={`lookbook-${beatKey}-${question.id}`}>
            {question.prompt}
          </label>
          <textarea
            id={`lookbook-${beatKey}-${question.id}`}
            style={styles.answer}
            rows={3}
            value={question.answer}
            placeholder="In your own words"
            aria-label={`${beatTitle}: ${question.prompt}`}
            onChange={event => onAnswer(question.id, event.target.value)}
          />
          <button type="button" style={styles.linkButton} onClick={() => onDismiss(question.id)}>
            Dismiss
          </button>
        </div>
      ))}
      {nothingToSee && <p style={styles.note}>Zoe found nothing to see here yet.</p>}
      <div style={styles.askRow}>
        <button type="button" style={styles.askButton} disabled={asking} onClick={() => { void onAsk() }}>
          {hasQuestions ? 'Ask Zoe for more' : 'Ask Zoe what this looks like'}
        </button>
        {askError && <span role="alert" style={styles.error}>{askError}</span>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  label: {
    fontFamily: 'var(--font-body)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--fg-muted)',
    margin: 0,
  },
  question: { display: 'flex', flexDirection: 'column', gap: 6 },
  prompt: { fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-muted)' },
  answer: {
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--fg)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 10px',
    resize: 'vertical',
  },
  linkButton: {
    alignSelf: 'flex-start',
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  note: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', margin: 0 },
  askRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  askButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  error: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--danger, #b3261e)' },
}
