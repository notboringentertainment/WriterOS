import React, { useMemo } from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'
import type { ComposedBlock, ComposedDocument, ComposeIdentity } from '@shared/compose/types'
import { deriveSynopsisDocumentState } from '../../../lib/synopsisDocumentState'

export interface SynopsisDocumentViewProps {
  content: SynopsisDocumentContent
  format: 'feature' | 'series'
  identity: ComposeIdentity
  composed: ComposedDocument | undefined
  isComposing: boolean
  onCompose: () => void
  error: string | null
}

const pageStyle: React.CSSProperties = {
  maxWidth: 680, margin: '0 auto', padding: '48px 24px',
  display: 'flex', flexDirection: 'column', gap: 24,
}
const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700,
  color: 'var(--fg)', margin: 0, lineHeight: 1.25,
}
const subheadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0,
}
const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '1rem', lineHeight: 1.75, color: 'var(--fg)', margin: 0,
}
const metaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0,
}
const footerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fg-muted)',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 700,
  color: 'var(--fg)', margin: 0, lineHeight: 1.2,
}
const metaLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--fg-muted)', paddingTop: 2,
}
const metaValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--fg)',
}

const SERIES_TYPE_LABELS: Record<string, string> = { limited: 'Limited', ongoing: 'Ongoing' }
const EPISODE_LENGTH_LABELS: Record<string, string> = { half_hour: 'Half-hour', hour: 'Hour', other: 'Other' }

// Title + useful metadata, rendered OUTSIDE the composed body (the prompt forbids the
// model from emitting a title/byline/meta block). Format is taken from the prop authority,
// not the stale header.format mirror.
function ArtifactHeader({ content, format }: { content: SynopsisDocumentContent; format: 'feature' | 'series' }) {
  const { header, series } = content
  const showMetadata = Boolean(header.title || header.writer)
  const rows: Array<[string, string]> = []
  if (header.title) rows.push(['TITLE', header.title])
  if (header.writer) rows.push(['WRITER', header.writer])
  rows.push(['FORMAT', format])
  if (header.genre) rows.push(['GENRE', header.genre])
  if (format !== 'series' && header.targetRuntime) rows.push(['RUNTIME', header.targetRuntime])
  if (format === 'series' && series) {
    if (series.seriesType) rows.push(['SERIES TYPE', SERIES_TYPE_LABELS[series.seriesType] ?? series.seriesType])
    if (series.episodeLength) rows.push(['EPISODE LENGTH', EPISODE_LENGTH_LABELS[series.episodeLength] ?? series.episodeLength])
  }
  if (header.comps && header.comps.length > 0) rows.push(['COMPS', header.comps.join(', ')])

  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {header.title && <h1 style={titleStyle}>{header.title}</h1>}
      {showMetadata && (
        <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '16px 0', display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px' }}>
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={metaLabelStyle}>{label}</span>
              <span style={metaValueStyle}>{value}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </header>
  )
}

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

export function SynopsisDocumentView(props: SynopsisDocumentViewProps) {
  const { content, format, identity, composed, isComposing, onCompose, error } = props
  const state = useMemo(
    () => deriveSynopsisDocumentState({ content, format, identity, composed }),
    [content, format, identity, composed],
  )

  if (isComposing) {
    return <div style={pageStyle}><p style={bodyStyle}>Composing…</p></div>
  }

  if (state.kind === 'below_readiness') {
    return (
      <div style={pageStyle}>
        <p style={bodyStyle}>Add a few more answers before composing your Synopsis.</p>
        {state.missingCoreLabels.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {state.missingCoreLabels.map(l => <li key={l} style={bodyStyle}>{l}</li>)}
          </ul>
        )}
        <button type="button" disabled onClick={onCompose}>Compose this Synopsis</button>
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
        <button type="button" onClick={onCompose}>Compose this Synopsis</button>
      </div>
    )
  }

  const endingNote = state.endingMissing ? ' The ending isn’t answered yet.' : ''
  const missingContextCopy = state.omittedSectionHeadings.length > 0
    ? `Composed from what you’ve answered so far — add ${state.omittedSectionHeadings.join(', ')} for a fuller document.${endingNote}`
    : `Composed from what you’ve answered so far.${endingNote}`

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
      <ArtifactHeader content={content} format={format} />
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
