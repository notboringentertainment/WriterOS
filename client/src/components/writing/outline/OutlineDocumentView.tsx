import React, { useMemo } from 'react'
import type { OutlineDocumentContent } from '@shared/documents'
import type { ComposedDocument, ComposeIdentity } from '@shared/compose/types'
import { deriveOutlineDocumentState } from '../../../lib/outlineDocumentState'
import { Block, bodyStyle, metaStyle } from '../shared/ComposedBlocks'

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

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  color: 'var(--fg-muted)',
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
