import React from 'react'
import type { OutlineCardDef } from '../../../lib/outlineDeck'
import { resolveOutlinePath } from '../../../lib/outlineDeck'
import type { OutlineDocumentContent } from '@shared/documents'

interface OutlineCardProps {
  card: OutlineCardDef
  content: OutlineDocumentContent
  onFieldChange: (path: string, value: string) => void
}

export function OutlineCard({ card, content, onFieldChange }: OutlineCardProps) {
  const bindings = typeof card.mappingPath === 'string'
    ? [{ label: card.question, path: card.mappingPath }]
    : card.mappingPath
  const composite = bindings.length > 1

  return (
    <article style={styles.card}>
      <label style={styles.question} htmlFor={`${card.id}-field-0`}>
        {card.question}
      </label>
      <p style={styles.helper}>{card.helper}</p>
      <div style={styles.fields}>
        {bindings.map((binding, index) => (
          <div key={binding.path} style={styles.fieldGroup}>
            {composite && (
              <label style={styles.fieldLabel} htmlFor={`${card.id}-field-${index}`}>
                {binding.label}
              </label>
            )}
            <textarea
              id={`${card.id}-field-${index}`}
              value={resolveOutlinePath(content, binding.path)}
              placeholder={card.placeholder ?? ''}
              onChange={(event) => onFieldChange(binding.path, event.target.value)}
              style={styles.textarea}
              rows={composite ? 3 : 4}
            />
          </div>
        ))}
      </div>
    </article>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    padding: 16,
  },
  question: {
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--fg)',
    lineHeight: 1.25,
    marginBottom: 6,
  },
  helper: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.45,
    margin: '0 0 12px',
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 96,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.5,
    padding: '10px 12px',
    outline: 'none',
  },
}
