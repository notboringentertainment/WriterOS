// One ritual question: who's asking, the question in display type, then the
// caller-supplied input and action row. Purely presentational so Voice Profile
// and Project Meeting share the same conversational shape.

import React from 'react'

export interface RitualQuestionCardProps {
  asker?: string
  meta?: string
  question: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export function RitualQuestionCard({ asker, meta, question, children, actions }: RitualQuestionCardProps) {
  return (
    <section style={styles.root} data-testid="ritual-question-card">
      {(asker || meta) && (
        <div style={styles.askerRow}>
          {asker && <span style={styles.asker}>{asker}</span>}
          {meta && <span style={styles.meta}>{meta}</span>}
        </div>
      )}
      <h2 style={styles.question}>{question}</h2>
      <div style={styles.body}>{children}</div>
      {actions && <div style={styles.actions}>{actions}</div>}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  askerRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  asker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--wp-amber)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  meta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  question: {
    fontFamily: 'var(--font-display)',
    fontSize: 24,
    fontWeight: 500,
    color: 'var(--fg)',
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
    margin: 0,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
}
