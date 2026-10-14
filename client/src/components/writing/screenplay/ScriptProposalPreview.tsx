import React from 'react'
import type { ScriptProposal } from '../../../lib/scriptProposal'
import { getScreenplaySpacingBefore } from '../../../lib/screenplay'
import './screenplay.css'

export function ScriptProposalPreview({ proposal, error, onKeep, onDismiss }: {
  proposal: ScriptProposal
  error?: 'stale' | 'ambiguous'
  onKeep: () => void
  onDismiss: () => void
}) {
  const target = proposal.target
  const location = target.kind === 'append' ? 'At the end' : `${target.kind === 'replace-scene' ? 'Replaces the scene' : 'After the scene'} ${target.sceneHeading}`
  return (
    <article aria-label="Morgan script proposal" style={styles.card}>
      <p style={styles.heading}>Suggested update to Script</p>
      <p style={styles.rationale}>{proposal.summary}</p>
      <p style={styles.location}>{location}</p>
      <div className="ProseMirror" style={styles.blocks}>
        {proposal.blocks.map((block, index) => <p key={index} data-element-type={block.type} data-screenplay-space-before={getScreenplaySpacingBefore(proposal.blocks[index - 1]?.type ?? null, block.type)}>{block.text}</p>)}
      </div>
      {error && <p role="alert" style={styles.error}>{error === 'ambiguous'
        ? 'That scene heading appears more than once with the same text — ask Morgan to be more specific.'
        : 'The script changed since Morgan read it — ask her to redo it.'}</p>}
      <div style={styles.actions}>
        <button type="button" disabled={Boolean(error)} style={styles.primaryButton} onClick={onKeep}>Keep</button>
        <button type="button" style={styles.actionButton} onClick={onDismiss}>Dismiss</button>
      </div>
    </article>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { width: 816, boxSizing: 'border-box', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)' },
  heading: { margin: 0, fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg)' },
  rationale: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)' },
  location: { margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' },
  blocks: { padding: 16, minHeight: 0, background: 'var(--script-page)' },
  error: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: '#e05a5a' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  primaryButton: { background: 'var(--wp-amber)', border: '1px solid var(--wp-amber)', borderRadius: 6, padding: '4px 10px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--bg)', cursor: 'pointer' },
  actionButton: { background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--fg)', cursor: 'pointer' },
}
