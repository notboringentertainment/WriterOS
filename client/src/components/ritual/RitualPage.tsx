// Shared full-bleed shell for the identity rituals (Voice Profile, First Meeting).
// One visual language: centered column, mono eyebrow, Fraunces display title,
// quiet exit affordance. The ritual must never feel like a form with extra steps.

import React from 'react'

export interface RitualPageProps {
  eyebrow: string
  title: string
  subtitle?: string
  exitLabel?: string
  onExit?: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}

export function RitualPage({ eyebrow, title, subtitle, exitLabel, onExit, footer, children }: RitualPageProps) {
  return (
    <div style={styles.root} data-testid="ritual-page">
      {onExit && (
        <button type="button" style={styles.exit} onClick={onExit}>
          {exitLabel ?? 'Close'}
        </button>
      )}
      <div style={styles.column}>
        <header style={styles.header}>
          <div style={styles.eyebrow}>{eyebrow}</div>
          <h1 style={styles.title}>{title}</h1>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </header>
        <div style={styles.content}>{children}</div>
        {footer && <footer style={styles.footer}>{footer}</footer>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100%',
    background: 'var(--bg)',
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    overflowY: 'auto',
  },
  exit: {
    position: 'absolute',
    top: 20,
    right: 24,
    background: 'none',
    border: 'none',
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    padding: '6px 8px',
  },
  column: {
    width: 'min(680px, 92vw)',
    padding: '56px 0 72px',
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--wp-amber)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 36,
    fontWeight: 500,
    letterSpacing: '-0.02em',
    color: 'var(--fg)',
    margin: 0,
    lineHeight: 1.15,
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    color: 'var(--fg-muted)',
    lineHeight: 1.55,
    margin: 0,
    maxWidth: 560,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  footer: {
    borderTop: '1px solid var(--border)',
    paddingTop: 16,
  },
}
