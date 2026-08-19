import React from 'react'
import type { ComposedBlock } from '@shared/compose/types'

// Shared rendering primitives for composed documents (Synopsis, Treatment,
// Outline, What's Standing). These four surfaces render the same seven
// ComposedBlock types identically; this file is the single source of truth
// for that mapping so the four views can't silently drift apart.

export const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700,
  color: 'var(--fg)', margin: 0, lineHeight: 1.25,
}
export const subheadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0,
}
export const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '1rem', lineHeight: 1.75, color: 'var(--fg)', margin: 0,
}
export const metaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0,
}

// A lead gets a trailing period for the run-in, unless it already ends with
// terminal punctuation — avoids "Where We Begin.." when the model returns a
// lead that already carries its own punctuation.
export function formatLead(lead: string): string {
  const trimmed = lead.trim()
  return /[.!?:]$/.test(trimmed) ? `${trimmed} ` : `${trimmed}. `
}

// Renderer purity: the body emits ONLY composed text. It never reads
// sourceFieldIds, recipe labels, fidelity warnings, or answer ids.
export function Block({ block }: { block: ComposedBlock }) {
  switch (block.type) {
    case 'heading': return <h2 style={headingStyle}>{block.text}</h2>
    case 'subheading': return <h3 style={subheadingStyle}>{block.text}</h3>
    case 'divider': return <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
    case 'meta': return <p style={metaStyle}>{block.text}</p>
    case 'logline': return <p style={{ ...bodyStyle, fontStyle: 'italic' }}>{block.text}</p>
    case 'paragraph': return <p style={bodyStyle}>{block.text}</p>
    case 'leadInParagraph': return <p style={bodyStyle}><strong>{formatLead(block.lead)}</strong>{block.text}</p>
    default: return null
  }
}
