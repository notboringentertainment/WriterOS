import React, { useState } from 'react'
import type { StoryLock, StoryLockScope } from '@shared/documents'

export interface StoryBibleLockCardProps {
  lock: StoryLock
  onChange: (next: StoryLock) => void
  onRemove: () => void
}

const SCOPE_OPTIONS: ReadonlyArray<{ value: StoryLockScope; label: string }> = [
  { value: 'story', label: 'Story' },
  { value: 'character', label: 'Character' },
  { value: 'world', label: 'World' },
  { value: 'tone', label: 'Tone' },
  { value: 'ending', label: 'Ending' },
]

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const retiredCardStyle: React.CSSProperties = {
  ...cardStyle,
  opacity: 0.6,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
}

const retiredTagStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.7rem',
  color: 'var(--fg-subtle)',
  marginRight: 'auto',
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.8rem',
  padding: '4px 8px',
  cursor: 'pointer',
  flexShrink: 0,
}

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--danger, #b94a48)',
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  color: 'var(--fg-muted)',
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.92rem',
  color: 'var(--fg)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '8px 10px',
  width: '100%',
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 60,
  resize: 'vertical',
  lineHeight: 1.45,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

export function StoryBibleLockCard({ lock, onChange, onRemove }: StoryBibleLockCardProps) {
  const [removeArmed, setRemoveArmed] = useState(false)
  const retired = lock.status === 'retired'

  function patch(next: Partial<StoryLock>) {
    onChange({ ...lock, ...next })
  }

  function handleRemoveClick() {
    if (!removeArmed) {
      setRemoveArmed(true)
      return
    }
    onRemove()
  }

  return (
    <article style={retired ? retiredCardStyle : cardStyle} data-testid="story-bible-lock-card">
      <div style={headerStyle}>
        {retired && <span style={retiredTagStyle}>Retired</span>}
        <button
          type="button"
          style={buttonStyle}
          onClick={() => patch({ status: retired ? 'active' : 'retired' })}
        >
          {retired ? 'Reactivate' : 'Retire'}
        </button>
        {removeArmed && (
          <button type="button" style={buttonStyle} onClick={() => setRemoveArmed(false)}>
            Cancel
          </button>
        )}
        <button
          type="button"
          style={removeArmed ? dangerButtonStyle : buttonStyle}
          onClick={handleRemoveClick}
        >
          {removeArmed ? 'Confirm remove' : 'Remove'}
        </button>
      </div>

      <label style={fieldStyle}>
        <span style={labelStyle}>What must always stay true?</span>
        <textarea
          aria-label="Lock statement"
          value={lock.statement}
          placeholder="The protagonist goes to space in Act 3"
          style={textareaStyle}
          onChange={(event) => patch({ statement: event.target.value })}
        />
      </label>

      <div style={rowStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>What does it protect?</span>
          <select
            aria-label="Lock scope"
            value={lock.scope}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onChange={(event) => patch({ scope: event.target.value as StoryLockScope })}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Who or what established it?</span>
          <input
            type="text"
            aria-label="Lock source"
            value={lock.source}
            placeholder="Ben, initial pitch"
            style={inputStyle}
            onChange={(event) => patch({ source: event.target.value })}
          />
        </label>
      </div>

      <label style={fieldStyle}>
        <span style={labelStyle}>Why does this rule exist?</span>
        <textarea
          aria-label="Lock rationale"
          value={lock.rationale}
          placeholder="What breaks if this is violated"
          style={textareaStyle}
          onChange={(event) => patch({ rationale: event.target.value })}
        />
      </label>
    </article>
  )
}
