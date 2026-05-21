import React from 'react'

export interface SynopsisViewToggleProps {
  value: 'edit' | 'document'
  onChange: (next: 'edit' | 'document') => void
}

const SEGMENTS: { id: 'edit' | 'document'; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'document', label: 'Document' },
]

export function SynopsisViewToggle({ value, onChange }: SynopsisViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="View mode"
      style={{
        display: 'inline-flex',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        fontSize: 12,
        fontFamily: 'var(--font-display)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {SEGMENTS.map((seg, i) => {
        const isActive = value === seg.id
        return (
          <button
            key={seg.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(seg.id)}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              borderRadius: 0,
              background: isActive ? 'var(--surface-2)' : 'transparent',
              color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              textTransform: 'inherit',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              lineHeight: 1.4,
            }}
          >
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
