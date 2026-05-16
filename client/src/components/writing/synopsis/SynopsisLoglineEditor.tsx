import React from 'react'

export interface SynopsisLoglineEditorProps {
  value: { text: string }
  onTextChange: (next: string) => void
}

export function SynopsisLoglineEditor({ value, onTextChange }: SynopsisLoglineEditorProps) {
  const isEmpty = !value.text.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-muted)',
          margin: 0,
        }}
      >
        Logline
      </h3>
      <textarea
        aria-label="Logline"
        value={value.text}
        onChange={e => onTextChange(e.target.value)}
        rows={3}
        placeholder="A [protagonist] must [goal] before [stakes], but [obstacle]."
        style={{
          width: '100%',
          resize: 'vertical',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--fg)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px 10px',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {isEmpty && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--fg-subtle)',
            margin: 0,
          }}
        >
          One or two sentences: protagonist, goal, obstacle, stakes.
        </p>
      )}
    </div>
  )
}
