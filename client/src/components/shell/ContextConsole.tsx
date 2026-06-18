import React from 'react'
import type { ConsoleState } from '../../lib/leftZone'

interface ContextConsoleProps {
  state: ConsoleState
}

/**
 * Context Console — lean, pinned, glanceable project state. Bounded by the .zone-console
 * wrapper (height-capped, overflows internally, never clips). Display-only.
 */
export function ContextConsole({ state }: ContextConsoleProps) {
  return (
    <div style={styles.root} aria-label="Project state">
      <div style={styles.titleRow}>
        <span style={styles.dot} aria-hidden="true" />
        <span style={styles.title}>{state.title}</span>
      </div>

      <div style={styles.metaRow}>
        <span style={styles.surface}>{state.surfaceLabel}</span>
        <span style={styles.persona}>{state.persona}</span>
      </div>

      {state.counts.length > 0 && (
        <div style={styles.counts}>
          {state.counts.map(count => (
            <span key={count.label} style={styles.count}>
              <span style={styles.countValue}>{count.value}</span> {count.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '10px 16px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--wp-amber)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  },
  surface: {
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
  },
  persona: {
    color: 'var(--wp-amber)',
  },
  counts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
  },
  count: {
    whiteSpace: 'nowrap',
  },
  countValue: {
    color: 'var(--fg)',
  },
}
