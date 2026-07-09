// Three-state control for tagging a confirmed answer's negotiability before banking:
// locked (canon), leaning (challenge permitted), open (delegated to the room).

import React from 'react'
import type { InterviewMutability } from '../../lib/roomApi'

const OPTIONS: Array<{ value: InterviewMutability; label: string }> = [
  { value: 'locked', label: 'Locked' },
  { value: 'leaning', label: 'Leaning' },
  { value: 'open', label: 'Open' },
]

export interface MutabilityToggleProps {
  value: InterviewMutability
  onChange: (value: InterviewMutability) => void
  ariaLabel?: string
}

export function MutabilityToggle({ value, onChange, ariaLabel }: MutabilityToggleProps) {
  return (
    <div style={styles.root} role="radiogroup" aria-label={ariaLabel ?? 'Mutability'} data-testid="mutability-toggle">
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          style={{ ...styles.option, ...(value === option.value ? styles.optionActive : {}) }}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'inline-flex',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  option: {
    padding: '3px 12px',
    borderRadius: 999,
    border: '1px solid transparent',
    background: 'none',
    color: 'var(--fg-subtle)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  optionActive: {
    border: '1px solid var(--wp-amber)',
    color: 'var(--wp-amber)',
    background: 'hsla(41, 100%, 60%, 0.10)',
  },
}
