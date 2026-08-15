// Renders below an agent response wherever project memory grounded it
// (Writing Partner chat, Writer's Room, Project Meeting, and document
// composition — see server/projectMemory/agentContext.ts). Disabled status
// is disclosed rather than hidden; citations are collapsed by default and
// expand in place so reading a response is never interrupted.
import React, { useId, useState } from 'react'
import type { MemoryReceipt as MemoryReceiptData } from '@shared/schema'
import type { MemoryWorkflow } from '@shared/projectMemory'

export interface MemoryReceiptProps {
  receipt?: MemoryReceiptData
}

const WORKFLOW_LABELS: Record<MemoryWorkflow, string> = {
  writeros: 'WriterOS',
  'writeros-room': "Writer's Room",
  'story-wayfinder': 'Story Wayfinder',
  pitchstudio: 'PitchStudio',
  buzz: 'Buzz',
}

export function MemoryReceipt({ receipt }: MemoryReceiptProps) {
  const [expanded, setExpanded] = useState(false)
  const citationsId = useId()

  if (!receipt) return null

  if (receipt.status === 'disabled') {
    return <span role="status" style={styles.disclosure}>Project memory disabled</span>
  }

  const hasCitations = receipt.citations.length > 0
  const hasConflicts = receipt.conflictIds.length > 0

  return (
    <div style={styles.wrap}>
      <span role="status" style={styles.disclosure}>{`Project memory revision ${receipt.revision}`}</span>
      {hasCitations && (
        <button
          type="button"
          style={styles.toggle}
          aria-expanded={expanded}
          aria-controls={citationsId}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? 'Hide citations' : `Show citations (${receipt.citations.length})`}
        </button>
      )}
      {expanded && hasCitations && (
        <ul id={citationsId} style={styles.citationList}>
          {receipt.citations.map(citation => (
            <li key={citation.id} style={styles.citationItem}>
              <span style={styles.citationId}>{citation.id}</span>
              <span style={styles.citationWorkflow}>{WORKFLOW_LABELS[citation.workflow] ?? citation.workflow}</span>
              <span style={styles.citationSource}>{citation.sourceUri}</span>
            </li>
          ))}
        </ul>
      )}
      {hasConflicts && (
        <span style={styles.conflictNote}>
          {receipt.conflictIds.length === 1
            ? 'Touches 1 unresolved memory conflict — see Memory.'
            : `Touches ${receipt.conflictIds.length} unresolved memory conflicts — see Memory.`}
        </span>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 8,
  },
  disclosure: {
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  },
  toggle: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  citationList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    borderLeft: '2px solid var(--border)',
    paddingLeft: 8,
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
  conflictNote: {
    color: 'var(--wp-amber)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  },
}
