import React, { useMemo } from 'react'
import type { OutlineDocumentContent } from '@shared/documents'
import type { ComposedBlock, ComposedDocument, ComposeIdentity } from '@shared/compose/types'
import { deriveOutlineDocumentState } from '../../../lib/outlineDocumentState'

export interface OutlineDocumentViewProps {
  content: OutlineDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  composed: ComposedDocument | undefined
  isComposing: boolean
  onCompose: () => void
  error: string | null
}

const pageStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: '0 auto',
  padding: '48px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.5rem',
  fontWeight: 700,
  color: 'var(--fg)',
  margin: 0,
  lineHeight: 1.25,
}

const subheadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
  margin: 0,
}

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  lineHeight: 1.75,
  color: 'var(--fg)',
  margin: 0,
}

const metaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
  margin: 0,
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  color: 'var(--fg-muted)',
}

// A lead gets a trailing period for the run-in, unless it already ends with
// terminal punctuation — avoids "Where We Begin.." when the model returns a
// lead that already carries its own punctuation.
function formatLead(lead: string): string {
  const trimmed = lead.trim()
  return /[.!?:]$/.test(trimmed) ? `${trimmed} ` : `${trimmed}. `
}

// Renderer purity: the body emits ONLY composed text. It never reads
// sourceFieldIds, recipe labels, fidelity warnings, or answer ids.
function Block({ block }: { block: ComposedBlock }) {
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

export function OutlineDocumentView(props: OutlineDocumentViewProps) {
  const { content, format, identity, composed, isComposing, onCompose, error } = props
  const state = useMemo(
    () => deriveOutlineDocumentState({ content, format, identity, composed }),
    [content, format, identity, composed],
  )

  if (isComposing) {
    return <div style={pageStyle}><p style={bodyStyle}>Composing…</p></div>
  }

  if (state.kind === 'below_readiness') {
    return (
      <div style={pageStyle}>
        <p style={bodyStyle}>Add a few more answers before composing your Outline.</p>
        {state.missingCoreLabels.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {state.missingCoreLabels.map(l => <li key={l} style={bodyStyle}>{l}</li>)}
          </ul>
        )}
        <button type="button" disabled onClick={onCompose}>Compose this Outline</button>
      </div>
    )
  }

  const errorBanner = error ? (
    <p style={{ ...metaStyle, color: 'var(--error, #b91c1c)' }}>
      {error} <button type="button" onClick={onCompose}>Retry</button>
    </p>
  ) : null

  if (state.kind === 'ready_uncomposed') {
    return (
      <div style={pageStyle}>
        {errorBanner}
        {state.omittedSectionHeadings.length > 0 && (
          <p style={metaStyle}>Some sections will be omitted until you add more: {state.omittedSectionHeadings.join(', ')}.</p>
        )}
        <button type="button" onClick={onCompose}>Compose this Outline</button>
      </div>
    )
  }

  const missingContextCopy = state.omittedSectionHeadings.length > 0
    ? `Composed from what you’ve answered so far — add ${state.omittedSectionHeadings.join(', ')} for a fuller document.`
    : 'Composed from what you’ve answered so far.'

  const banner =
    state.kind === 'answer_stale' ? <p style={{ ...metaStyle, color: 'var(--warn, #b45309)' }}>Your answers changed — Recompose.</p>
    : state.kind === 'recipe_stale' ? <p style={metaStyle}>A newer document format is available — Recompose.</p>
    : state.kind === 'missing_context' ? <p style={metaStyle}>{missingContextCopy}</p>
    : state.kind === 'flagged' ? <p style={metaStyle}>Review: some lines may not match your answers. Structure-checked, not meaning-verified.</p>
    : null

  return (
    <div style={pageStyle}>
      {errorBanner}
      {banner}
      <article style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {state.composed!.blocks.map((b, i) => <Block key={i} block={b} />)}
      </article>
      <footer style={footerStyle}>
        <span>Composed from your answers · {new Date(state.composed!.generatedAt).toLocaleDateString()}</span>
        <button type="button" onClick={onCompose}>Recompose</button>
      </footer>
    </div>
  )
}
