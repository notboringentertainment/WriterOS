import React from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'

type Prose = SynopsisDocumentContent['prose']

interface SynopsisProseEditorProps {
  value: Prose
  mode: 'prose' | 'paragraphs'
  onValueChange: (next: Prose) => void
  onModeChange: (next: 'prose' | 'paragraphs') => void
}

const FIELDS: Array<keyof Prose> = ['opening', 'escalation', 'middle', 'climax', 'resolution']
const FIELD_LABELS: Record<keyof Prose, string> = {
  opening: 'Opening',
  escalation: 'Escalation',
  middle: 'Middle',
  climax: 'Climax',
  resolution: 'Resolution',
}

function joinProse(value: Prose): string {
  return FIELDS.map(f => value[f]).filter(Boolean).join('\n\n')
}

function splitProse(text: string): Prose {
  const parts = text.split(/\n\n+/)
  return {
    opening: parts[0] ?? '',
    escalation: parts[1] ?? '',
    middle: parts[2] ?? '',
    climax: parts[3] ?? '',
    resolution: parts.length > 4 ? parts.slice(4).join('\n\n') : (parts[4] ?? ''),
  }
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginBottom: '8px',
}

const toggleStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  color: 'var(--fg-muted)',
  padding: '2px 6px',
  borderRadius: '4px',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.7rem',
  color: 'var(--fg-subtle)',
  display: 'block',
  marginBottom: '4px',
}

const textareaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  color: 'var(--fg)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '8px',
  width: '100%',
  resize: 'vertical',
  fontSize: '0.9rem',
  lineHeight: '1.6',
  boxSizing: 'border-box',
}

const rowStyle: React.CSSProperties = {
  marginBottom: '12px',
}

export function SynopsisProseEditor({
  value,
  mode,
  onValueChange,
  onModeChange,
}: SynopsisProseEditorProps) {
  const otherMode = mode === 'prose' ? 'paragraphs' : 'prose'

  function handleProseChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = splitProse(e.target.value)
    onValueChange(next)
  }

  return (
    <div>
      <div style={headerStyle}>
        <button
          style={toggleStyle}
          onClick={() => onModeChange(otherMode)}
          aria-label={`switch to ${otherMode} mode`}
        >
          prose ⇄ paragraphs
        </button>
      </div>

      {mode === 'prose' ? (
        <textarea
          aria-label="prose editor"
          value={joinProse(value)}
          onChange={handleProseChange}
          style={{ ...textareaStyle, minHeight: '200px' }}
          rows={10}
        />
      ) : (
        <div>
          {FIELDS.map(field => (
            <div key={field} style={rowStyle}>
              <label style={labelStyle}>{FIELD_LABELS[field]}</label>
              <textarea
                aria-label={field}
                value={value[field]}
                onChange={e => onValueChange({ ...value, [field]: e.target.value })}
                style={textareaStyle}
                rows={3}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
