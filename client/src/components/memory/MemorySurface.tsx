// The Memory review surface (Task 9) — the writer-facing window onto the
// per-project memory ledger built in Tasks 1-8. Five views (Canon, Review,
// Developed, Open Questions, Sources and History) over the same snapshot;
// Review is the only view with actions, since it is the only one holding
// candidates and open conflicts.
import React, { useMemo, useState } from 'react'
import type {
  MemoryKind,
  ProjectMemoryConflict,
  ProjectMemoryRecord,
} from '@shared/projectMemory'
import type { MemoryAnalysisQueueEntry, UseProjectMemoryResult } from '../../lib/useProjectMemory'
import { MemoryConflictCard, type ProjectMemoryConflictResolution } from './MemoryConflictCard'

export type MemoryView = 'canon' | 'review' | 'developed' | 'open-questions' | 'sources'

const VIEWS: MemoryView[] = ['canon', 'review', 'developed', 'open-questions', 'sources']

const VIEW_LABELS: Record<MemoryView, string> = {
  canon: 'Canon',
  review: 'Review',
  developed: 'Developed',
  'open-questions': 'Open Questions',
  sources: 'Sources and History',
}

const DEVELOPED_KINDS: MemoryKind[] = ['development', 'decision']

export interface MemorySurfaceProps {
  /**
   * The single app-level `useProjectMemory` instance, owned and passed down
   * by App.tsx — never a second independent instance here. Actions taken in
   * this surface (promote/reject/resolve-conflict/retry) mutate this same
   * object's state, so the App-level conflict banners re-render with the
   * result immediately, without a separate refresh handshake.
   */
  memory: UseProjectMemoryResult
  onExit: () => void
}

function recordsForView(records: ProjectMemoryRecord[], view: MemoryView): ProjectMemoryRecord[] {
  switch (view) {
    case 'canon':
      return records.filter(record => record.kind === 'canon' && record.status === 'active')
    case 'review':
      return records.filter(record => record.status === 'candidate')
    case 'developed':
      return records.filter(record => DEVELOPED_KINDS.includes(record.kind) && record.status !== 'rejected')
    case 'open-questions':
      return records.filter(record => record.kind === 'open_question' && record.status !== 'rejected')
    case 'sources':
      return records
  }
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString()
}

function supersessionChain(record: ProjectMemoryRecord, recordsById: Map<string, ProjectMemoryRecord>, all: ProjectMemoryRecord[]): string[] {
  const lines: string[] = []
  for (const id of record.supersedes) {
    const superseded = recordsById.get(id)
    lines.push(superseded ? `Supersedes: "${superseded.claim}"` : `Supersedes: ${id}`)
  }
  for (const other of all) {
    if (other.supersedes.includes(record.id)) {
      lines.push(`Superseded by: "${other.claim}"`)
    }
  }
  return lines
}

interface MemoryRecordRowProps {
  record: ProjectMemoryRecord
  view: MemoryView
  recordsById: Map<string, ProjectMemoryRecord>
  allRecords: ProjectMemoryRecord[]
  activeCanonOfSameKind: ProjectMemoryRecord[]
  pending: boolean
  onPromote: (record: ProjectMemoryRecord, supersedesId?: string) => void
  onReject: (record: ProjectMemoryRecord) => void
}

function MemoryRecordRow({
  record,
  view,
  recordsById,
  allRecords,
  activeCanonOfSameKind,
  pending,
  onPromote,
  onReject,
}: MemoryRecordRowProps) {
  const [replaceTargetId, setReplaceTargetId] = useState('')
  const chain = supersessionChain(record, recordsById, allRecords)
  const canReview = view === 'review'
  const isFlagged = record.safety === 'flagged'
  const replaceCandidates = activeCanonOfSameKind.filter(candidate => candidate.id !== record.id)

  return (
    <article style={styles.row} aria-label={`Memory record: ${record.claim}`}>
      <p style={styles.claim}>{record.claim}</p>
      <div style={styles.badgeRow}>
        <span style={styles.badge}>{record.kind}</span>
        <span style={styles.badge}>{record.status}</span>
        <span style={styles.badge}>{record.source.workflow}</span>
        {record.spoiler && <span style={{ ...styles.badge, ...styles.spoilerBadge }}>Spoiler</span>}
        {isFlagged && <span style={{ ...styles.badge, ...styles.flaggedBadge }}>Flagged</span>}
      </div>
      {record.detail && <p style={styles.detail}>{record.detail}</p>}
      <div style={styles.metaLine}>Source: {record.source.sourceUri}</div>
      {record.evidence[0] && <p style={styles.evidence}>&ldquo;{record.evidence[0].excerpt}&rdquo;</p>}
      <div style={styles.metaLine}>Updated {formatTimestamp(record.updatedAt)}</div>
      {chain.map(line => (
        <div key={line} style={styles.metaLine}>{line}</div>
      ))}

      {canReview && (
        <div style={styles.actions}>
          {!isFlagged && (
            <button
              type="button"
              disabled={pending}
              style={styles.actionButton}
              onClick={() => onPromote(record)}
            >
              Promote
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            style={styles.actionButton}
            onClick={() => onReject(record)}
          >
            Reject
          </button>
          {!isFlagged && record.kind === 'canon' && replaceCandidates.length > 0 && (
            <div style={styles.replaceRow}>
              <label style={styles.replaceLabel}>
                Replace canon
                <select
                  aria-label={`Canon to replace with "${record.claim}"`}
                  value={replaceTargetId}
                  onChange={event => setReplaceTargetId(event.target.value)}
                  style={styles.select}
                >
                  <option value="">Choose active canon…</option>
                  {replaceCandidates.map(candidate => (
                    <option key={candidate.id} value={candidate.id}>{candidate.claim}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || !replaceTargetId}
                style={styles.actionButton}
                onClick={() => onPromote(record, replaceTargetId)}
              >
                Replace selected canon
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

interface PendingAnalysisSectionProps {
  items: MemoryAnalysisQueueEntry[]
  pendingId: string | null
  onRetry: (itemId: string) => void
}

function PendingAnalysisSection({ items, pendingId, onRetry }: PendingAnalysisSectionProps) {
  if (items.length === 0) return null
  return (
    <section aria-label="WriterOS analysis" style={styles.analysisSection}>
      <h3 style={styles.sectionTitle}>WriterOS analysis</h3>
      {items.map(item => (
        <div key={item.id} style={styles.analysisRow}>
          <div style={styles.metaLine}>{item.surface} · {item.status} · {item.sourceUri}</div>
          {item.error && <div style={styles.analysisError}>{item.error}</div>}
          {item.status === 'failed' && (
            <button
              type="button"
              disabled={pendingId === item.id}
              style={styles.actionButton}
              onClick={() => onRetry(item.id)}
            >
              Retry analysis
            </button>
          )}
        </div>
      ))}
    </section>
  )
}

export function MemorySurface({ memory, onExit }: MemorySurfaceProps) {
  const [view, setView] = useState<MemoryView>('canon')
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const snapshot = memory.snapshot
  const allRecords = snapshot?.records ?? []
  const recordsById = useMemo(() => new Map(allRecords.map(record => [record.id, record])), [allRecords])
  const openConflicts = useMemo(
    () => (snapshot?.conflicts ?? []).filter(conflict => conflict.status === 'open'),
    [snapshot],
  )

  async function handlePromote(record: ProjectMemoryRecord, supersedesId?: string) {
    if (!snapshot) return
    if (supersedesId) {
      const target = recordsById.get(supersedesId)
      const confirmed = window.confirm(
        `Replace the current active canon${target ? ` ("${target.claim}")` : ''} with "${record.claim}"? This cannot be undone.`,
      )
      if (!confirmed) return
    }
    setPendingActionId(record.id)
    setActionError(null)
    const result = await memory.runAction({
      type: 'promote',
      recordId: record.id,
      expectedRevision: snapshot.revision,
      supersedes: supersedesId ? [supersedesId] : [],
    })
    setPendingActionId(null)
    if (!result.ok) setActionError(result.message)
  }

  async function handleReject(record: ProjectMemoryRecord) {
    if (!snapshot) return
    setPendingActionId(record.id)
    setActionError(null)
    const result = await memory.runAction({
      type: 'reject',
      recordId: record.id,
      expectedRevision: snapshot.revision,
    })
    setPendingActionId(null)
    if (!result.ok) setActionError(result.message)
  }

  async function handleResolveConflict(conflict: ProjectMemoryConflict, resolution: ProjectMemoryConflictResolution) {
    if (!snapshot) return
    // Keep left/right can supersede the losing side (server/projectMemory/store.ts:
    // deriveConflictResolutionMutation pushes an active loser onto
    // supersededRecordIds). Both-valid and false-positive never supersede.
    if (resolution === 'left' || resolution === 'right') {
      const loserId = resolution === 'left' ? conflict.rightRecordId : conflict.leftRecordId
      const loser = recordsById.get(loserId)
      if (loser?.status === 'active') {
        const confirmed = window.confirm(
          `Keeping this side will supersede the current active canon${loser ? ` ("${loser.claim}")` : ''}. This cannot be undone.`,
        )
        if (!confirmed) return
      }
    }
    setPendingActionId(conflict.id)
    setActionError(null)
    const result = await memory.runAction({
      type: 'resolve-conflict',
      conflictId: conflict.id,
      expectedRevision: snapshot.revision,
      resolution,
    })
    setPendingActionId(null)
    if (!result.ok) setActionError(result.message)
  }

  async function handleRetryAnalysis(itemId: string) {
    setPendingActionId(itemId)
    setActionError(null)
    const result = await memory.retryAnalysis(itemId)
    setPendingActionId(null)
    if (!result.ok) setActionError(result.message)
  }

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Memory</div>
          <h1 style={styles.title}>Project memory</h1>
        </div>
        <button type="button" style={styles.exitButton} onClick={onExit}>Close</button>
      </header>

      {memory.browserOnly ? (
        <p style={styles.browserOnly}>{memory.browserOnlyMessage}</p>
      ) : (
        <>
          <nav role="tablist" aria-label="Memory views" style={styles.tabs}>
            {VIEWS.map(candidate => (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={view === candidate}
                style={{ ...styles.tab, ...(view === candidate ? styles.tabActive : {}) }}
                onClick={() => setView(candidate)}
              >
                {VIEW_LABELS[candidate]}
              </button>
            ))}
          </nav>

          {memory.loading && <p style={styles.status}>Loading project memory…</p>}
          {memory.error && <p style={styles.error}>{memory.error}</p>}
          {actionError && <p style={styles.error}>{actionError}</p>}

          {snapshot && (
            <div style={styles.content}>
              {view === 'review' && openConflicts.length > 0 && (
                <section aria-label="Open conflicts" style={styles.conflictSection}>
                  <h3 style={styles.sectionTitle}>Open conflicts</h3>
                  {openConflicts.map(conflict => (
                    <MemoryConflictCard
                      key={conflict.id}
                      conflict={conflict}
                      left={recordsById.get(conflict.leftRecordId)}
                      right={recordsById.get(conflict.rightRecordId)}
                      resolving={pendingActionId === conflict.id}
                      onResolve={resolution => void handleResolveConflict(conflict, resolution)}
                    />
                  ))}
                </section>
              )}

              {view === 'review' && (
                <PendingAnalysisSection
                  items={memory.analysisQueue}
                  pendingId={pendingActionId}
                  onRetry={itemId => void handleRetryAnalysis(itemId)}
                />
              )}

              <div style={styles.recordList}>
                {recordsForView(allRecords, view).map(record => (
                  <MemoryRecordRow
                    key={record.id}
                    record={record}
                    view={view}
                    recordsById={recordsById}
                    allRecords={allRecords}
                    activeCanonOfSameKind={allRecords.filter(other => other.kind === record.kind && other.status === 'active')}
                    pending={pendingActionId === record.id}
                    onPromote={(target, supersedesId) => void handlePromote(target, supersedesId)}
                    onReject={target => void handleReject(target)}
                  />
                ))}
                {recordsForView(allRecords, view).length === 0 && (
                  <p style={styles.empty}>Nothing here yet.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100%',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: '32px min(64px, 6vw)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
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
    fontSize: 30,
    fontWeight: 500,
    color: 'var(--fg)',
    margin: '4px 0 0',
  },
  exitButton: {
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
  browserOnly: {
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--fg-muted)',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
  },
  tab: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '4px 12px',
    cursor: 'pointer',
  },
  tabActive: {
    color: 'var(--fg)',
    borderColor: 'var(--border)',
    background: 'var(--surface-2)',
  },
  status: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
  },
  error: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--wp-amber)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 16,
    color: 'var(--fg)',
    margin: '0 0 8px',
  },
  conflictSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  analysisSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
  },
  analysisRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingBottom: 8,
    borderBottom: '1px solid var(--border)',
  },
  analysisError: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--wp-amber)',
  },
  recordList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--surface)',
  },
  claim: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 15,
    color: 'var(--fg)',
  },
  detail: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    whiteSpace: 'pre-wrap',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--fg-subtle)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '1px 6px',
  },
  spoilerBadge: {
    color: 'var(--wp-amber)',
    borderColor: 'var(--wp-amber)',
  },
  flaggedBadge: {
    color: '#e05a5a',
    borderColor: '#e05a5a',
  },
  metaLine: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    wordBreak: 'break-all',
  },
  evidence: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
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
  replaceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  replaceLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  select: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--fg)',
  },
  empty: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-subtle)',
  },
}
