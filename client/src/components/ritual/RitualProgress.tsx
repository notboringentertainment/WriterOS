// Quiet progress marker for ritual flows: mono counter plus a dot strip.

import React from 'react'

export interface RitualProgressProps {
  current: number
  total: number
  label?: string
}

export function RitualProgress({ current, total, label }: RitualProgressProps) {
  const safeTotal = Math.max(total, 1)
  const clamped = Math.min(Math.max(current, 0), safeTotal)
  return (
    <div style={styles.root} data-testid="ritual-progress">
      <span style={styles.counter}>
        {label ? `${label} · ` : ''}{clamped} of {safeTotal}
      </span>
      <span style={styles.dots} aria-hidden="true">
        {Array.from({ length: safeTotal }, (_, i) => (
          <span key={i} style={{ ...styles.dot, ...(i < clamped ? styles.dotFilled : {}) }} />
        ))}
      </span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  counter: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  dots: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--border)',
    display: 'inline-block',
  },
  dotFilled: {
    background: 'var(--wp-amber)',
  },
}
