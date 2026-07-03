import React, { useId, useState } from 'react'
import type { CapabilityReceipt } from '@shared/personaCapability'

interface CapabilityReceiptChipProps {
  receipt: CapabilityReceipt
}

const TASK_LABELS = {
  research_world_context: 'World-context research',
} as const

const STATUS_LABELS = {
  ok: 'completed',
  soft_fail: 'failed',
  timeout: 'timed out',
  cancelled: 'cancelled',
} as const

const CONTEXT_LABELS = {
  logline: 'Logline',
  synopsis: 'Synopsis',
  storyBible: 'Story Bible',
  characters: 'Characters',
  scriptExcerpt: 'Script excerpt',
} as const

const MISSING_LABELS = {
  logline: 'Logline',
  synopsis: 'Synopsis',
  storyBible: 'Story Bible',
  characters: 'Characters',
} as const

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`
  return `${Math.round(durationMs / 1000)}s`
}

export function CapabilityReceiptChip({ receipt }: CapabilityReceiptChipProps) {
  const [expanded, setExpanded] = useState(false)
  const inspectorId = useId()
  const sourceLabel = `${receipt.sources.length} source${receipt.sources.length === 1 ? '' : 's'}`
  const statusLabel = STATUS_LABELS[receipt.status]

  return (
    <div style={styles.wrap}>
      <button
        type="button"
        style={styles.chip}
        aria-expanded={expanded}
        aria-controls={expanded ? inspectorId : undefined}
        aria-label={`${TASK_LABELS[receipt.taskKind]} receipt, ${sourceLabel}, ${statusLabel}`}
        onClick={() => setExpanded(value => !value)}
      >
        Research · {sourceLabel} · {statusLabel}
      </button>
      {expanded && (
        <CapabilityReceiptInspector
          id={inspectorId}
          receipt={receipt}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  )
}

function CapabilityReceiptInspector({
  id,
  receipt,
  onClose,
}: {
  id: string
  receipt: CapabilityReceipt
  onClose: () => void
}) {
  const hasContext = receipt.contextChips.length > 0
  const hasMissing = receipt.missingSurfaces.length > 0

  return (
    <div id={id} role="dialog" aria-label="Research receipt" style={styles.inspector}>
      <div style={styles.inspectorHeader}>
        <span style={styles.inspectorTitle}>{TASK_LABELS[receipt.taskKind]}</span>
        <button
          type="button"
          style={styles.closeButton}
          aria-label="Close research receipt"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div style={styles.metaLine}>
        {STATUS_LABELS[receipt.status]} · {formatDuration(receipt.durationMs)}
      </div>

      <div style={styles.section}>
        <span style={styles.sectionLabel}>Context</span>
        <div style={styles.chipRow}>
          {hasContext ? receipt.contextChips.map(chip => (
            <span key={chip} style={styles.contextPill}>{CONTEXT_LABELS[chip]}</span>
          )) : (
            <span style={styles.muted}>No project surfaces included</span>
          )}
          {receipt.voiceProfile.included && (
            <span style={styles.contextPill}>Voice Profile (world-context slice)</span>
          )}
        </div>
      </div>

      {hasMissing && (
        <div style={styles.section}>
          <span style={styles.sectionLabel}>Missing</span>
          <div style={styles.chipRow}>
            {receipt.missingSurfaces.map(surface => (
              <span key={surface} style={styles.missingPill}>{MISSING_LABELS[surface]}</span>
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <span style={styles.sectionLabel}>Sources</span>
        {receipt.sources.length ? (
          <ol style={styles.sourceList}>
            {receipt.sources.map(source => (
              <li key={source.label} style={styles.sourceItem}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" style={styles.sourceLink}>
                    {source.label}
                  </a>
                ) : source.label}
                {source.citedInFinal && <span style={styles.cited}>cited</span>}
              </li>
            ))}
          </ol>
        ) : (
          <span style={styles.muted}>No sources returned</span>
        )}
      </div>

      {receipt.failureReason && (
        <div style={styles.failure}>Reason: {receipt.failureReason.replace('_', ' ')}</div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    marginTop: 6,
    maxWidth: '95%',
  },
  chip: {
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    borderRadius: 8,
    padding: '4px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    cursor: 'pointer',
  },
  inspector: {
    marginTop: 8,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    padding: 10,
    color: 'var(--fg)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  },
  inspectorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  inspectorTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--wp-amber)',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--fg-subtle)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: 0,
  },
  metaLine: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    marginBottom: 8,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 8,
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    textTransform: 'uppercase',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  contextPill: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '3px 6px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
  },
  missingPill: {
    border: '1px solid rgba(236, 180, 90, 0.35)',
    borderRadius: 8,
    padding: '3px 6px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--wp-amber)',
  },
  sourceList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 11,
    lineHeight: 1.5,
  },
  sourceItem: {
    marginBottom: 4,
  },
  sourceLink: {
    color: 'var(--fg)',
  },
  cited: {
    marginLeft: 6,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
  },
  muted: {
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-body)',
    fontSize: 11,
  },
  failure: {
    marginTop: 8,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  },
}
