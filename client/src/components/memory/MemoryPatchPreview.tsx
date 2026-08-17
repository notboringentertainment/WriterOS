// Memory-grounded document patch preview (Task 10): a static inline banner
// above the surface it proposes to change, never a modal — same rule as
// MemoryConflictCard.tsx (Task 9). Shows what would change, why, what it is
// grounded in, and any canon conflicts, and lets the writer Apply, Keep as
// suggestion, or Dismiss without ever interrupting typing.
import React from 'react'
import type { MemoryGroundedPatchCitation, MemoryGroundedPatch, StructuredDocumentSurface } from '@shared/memoryPatches'
import type { MemoryWorkflow } from '@shared/projectMemory'

const SURFACE_LABELS: Record<StructuredDocumentSurface, string> = {
  synopsis: 'Synopsis',
  outline: 'Outline',
  treatment: 'Treatment',
  storyBible: 'Story Bible',
}

const WORKFLOW_LABELS: Record<MemoryWorkflow, string> = {
  writeros: 'WriterOS',
  'writeros-room': "Writer's Room",
  'story-wayfinder': 'Story Wayfinder',
  pitchstudio: 'PitchStudio',
  buzz: 'Buzz',
}

export interface MemoryPatchPreviewProps {
  patch: MemoryGroundedPatch
  rationale: string
  canonConflicts: string[]
  citations: MemoryGroundedPatchCitation[]
  applying?: boolean
  applyError?: string | null
  onApply: () => void
  onKeepAsSuggestion: () => void
  onDismiss: () => void
}

export function MemoryPatchPreview({
  patch,
  rationale,
  canonConflicts,
  citations,
  applying = false,
  applyError = null,
  onApply,
  onKeepAsSuggestion,
  onDismiss,
}: MemoryPatchPreviewProps) {
  const hasConflicts = canonConflicts.length > 0

  return (
    <article style={styles.card} aria-label="Memory-grounded patch preview">
      <p style={styles.heading}>Suggested update to {SURFACE_LABELS[patch.surface]}</p>
      {rationale && <p style={styles.rationale}>{rationale}</p>}

      <div style={styles.section}>
        <div style={styles.sectionLabel}>Changed fields</div>
        {patch.changedPaths.length > 0 ? (
          <ul style={styles.list}>
            {patch.changedPaths.map(path => (
              <li key={path} style={styles.listItem}>{path}</li>
            ))}
          </ul>
        ) : (
          <p style={styles.empty}>No changed fields reported.</p>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionLabel}>Cited memories</div>
        {citations.length > 0 ? (
          <ul style={styles.list}>
            {citations.map(citation => (
              <li key={citation.id} style={styles.citationItem}>
                <span style={styles.citationId}>{citation.id}</span>
                <span style={styles.citationWorkflow}>{WORKFLOW_LABELS[citation.workflow] ?? citation.workflow}</span>
                <span style={styles.citationSource}>{citation.sourceUri}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={styles.empty}>No cited memories.</p>
        )}
      </div>

      {hasConflicts && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Canon conflicts</div>
          <ul style={styles.list}>
            {canonConflicts.map(conflict => (
              <li key={conflict} style={styles.conflictItem}>{conflict}</li>
            ))}
          </ul>
        </div>
      )}

      {applyError && <p role="alert" style={styles.applyError}>{applyError}</p>}

      <div style={styles.actions}>
        <button type="button" disabled={applying} style={styles.primaryButton} onClick={onApply}>
          Apply
        </button>
        <button type="button" disabled={applying} style={styles.actionButton} onClick={onKeepAsSuggestion}>
          Keep as suggestion
        </button>
        <button type="button" disabled={applying} style={styles.actionButton} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </article>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: 'var(--surface)',
  },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    color: 'var(--fg)',
  },
  rationale: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--fg-subtle)',
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    borderLeft: '2px solid var(--border)',
    paddingLeft: 8,
  },
  listItem: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg)',
  },
  citationItem: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
  },
  citationId: {
    color: 'var(--fg)',
  },
  citationWorkflow: {
    color: 'var(--wp-amber)',
  },
  citationSource: {
    color: 'var(--fg-subtle)',
    wordBreak: 'break-all',
  },
  conflictItem: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: '#e05a5a',
  },
  empty: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-subtle)',
  },
  applyError: {
    margin: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: '#e05a5a',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    background: 'var(--wp-amber)',
    border: '1px solid var(--wp-amber)',
    borderRadius: 6,
    padding: '4px 10px',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--bg)',
    cursor: 'pointer',
  },
  actionButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--fg)',
    cursor: 'pointer',
  },
}
