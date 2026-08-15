// Conflict UI (Task 9): a compact inline banner for writing/room surfaces,
// and a full resolution card for the Memory Review view. Never a modal — the
// banner is a static strip above the surface's own content, so it can never
// interrupt typing.
import React from 'react'
import type { z } from 'zod'
import type { ProjectMemoryConflict, ProjectMemoryConflictResolutionSchema, ProjectMemoryRecord } from '@shared/projectMemory'

export type ProjectMemoryConflictResolution = z.infer<typeof ProjectMemoryConflictResolutionSchema>

export interface MemoryConflictBannerProps {
  conflictCount: number
  onOpenMemory: () => void
}

export function MemoryConflictBanner({ conflictCount, onOpenMemory }: MemoryConflictBannerProps) {
  if (conflictCount <= 0) return null
  return (
    <div role="note" style={styles.banner}>
      <span style={styles.bannerText}>
        {conflictCount === 1
          ? '1 unresolved memory conflict touches this surface.'
          : `${conflictCount} unresolved memory conflicts touch this surface.`}
      </span>
      <button type="button" style={styles.bannerButton} onClick={onOpenMemory}>
        Review in Memory
      </button>
    </div>
  )
}

export interface MemoryConflictCardProps {
  conflict: ProjectMemoryConflict
  left?: ProjectMemoryRecord
  right?: ProjectMemoryRecord
  resolving?: boolean
  onResolve: (resolution: ProjectMemoryConflictResolution) => void
}

function RecordSummary({ label, record }: { label: string; record?: ProjectMemoryRecord }) {
  if (!record) {
    return (
      <div style={styles.side}>
        <div style={styles.sideLabel}>{label}</div>
        <p style={styles.missing}>Record no longer available.</p>
      </div>
    )
  }
  return (
    <div style={styles.side}>
      <div style={styles.sideLabel}>{label}</div>
      <p style={styles.claim}>{record.claim}</p>
      <div style={styles.meta}>{record.kind} · {record.status} · {record.source.workflow}</div>
      {record.evidence[0] && <p style={styles.evidence}>&ldquo;{record.evidence[0].excerpt}&rdquo;</p>}
    </div>
  )
}

export function MemoryConflictCard({ conflict, left, right, resolving = false, onResolve }: MemoryConflictCardProps) {
  return (
    <article style={styles.card} aria-label="Memory conflict">
      <p style={styles.reason}>{conflict.reason}</p>
      <div style={styles.sides}>
        <RecordSummary label="Left" record={left} />
        <RecordSummary label="Right" record={right} />
      </div>
      <div style={styles.actions}>
        <button type="button" disabled={resolving} style={styles.actionButton} onClick={() => onResolve('left')}>
          Keep left
        </button>
        <button type="button" disabled={resolving} style={styles.actionButton} onClick={() => onResolve('right')}>
          Keep right
        </button>
        <button type="button" disabled={resolving} style={styles.actionButton} onClick={() => onResolve('both-valid')}>
          Both valid
        </button>
        <button type="button" disabled={resolving} style={styles.actionButton} onClick={() => onResolve('not-conflict')}>
          False positive
        </button>
      </div>
    </article>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 14px',
    background: 'hsla(38, 90%, 55%, 0.12)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  bannerText: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--wp-amber)',
  },
  bannerButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '3px 10px',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--fg)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: 'var(--surface)',
  },
  reason: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
  },
  sides: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  side: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 8,
    border: '1px solid var(--border)',
    borderRadius: 6,
  },
  sideLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--fg-subtle)',
  },
  claim: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    color: 'var(--fg)',
  },
  meta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  evidence: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
  },
  missing: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-subtle)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
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
