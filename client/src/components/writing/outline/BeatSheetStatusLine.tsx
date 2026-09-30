import React from 'react'
import type { BeatSheetSyncStatusResponse } from '@shared/projectLibraryApi'

interface BeatSheetStatusLineProps {
  status: BeatSheetSyncStatusResponse
  changedSince?: boolean
  refreshing: boolean
  onRefresh: () => void | Promise<void>
}

function formatSyncedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function statusText(status: BeatSheetSyncStatusResponse, changedSince: boolean): string {
  switch (status.kind) {
    case 'unchanged':
    case 'updated': {
      const base = `Beat sheet from Story-drive · ${status.beatCount} beats · synced ${formatSyncedAt(status.syncedAt)}`
      return changedSince ? `${base} · Story-drive has changed since — Refresh` : base
    }
    case 'unavailable':
      return `Couldn't reach Story-drive (${status.message}). Showing the last synced beats.`
    case 'malformed':
      return `Story-drive's beat sheet couldn't be read (${status.message}). Showing the last synced beats.`
    case 'reopened':
      return 'This beat sheet was reopened in Story-drive. Showing the last ratified beats.'
    case 'ambiguous':
      return 'More than one decision claims to be the beat sheet. Nothing changed.'
    case 'no-beat-sheet':
      return 'Linked to Story-drive, but no ratified beat sheet yet.'
    case 'not-linked':
      return ''
  }
}

export function BeatSheetStatusLine({ status, changedSince = false, refreshing, onRefresh }: BeatSheetStatusLineProps) {
  if (status.kind === 'not-linked') return null
  return (
    <div style={styles.row} role="status">
      <span style={styles.text}>{statusText(status, changedSince)}</span>
      <button
        type="button"
        style={{ ...styles.button, ...(refreshing ? styles.buttonDisabled : {}) }}
        disabled={refreshing}
        onClick={() => { void onRefresh() }}
      >
        Refresh
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  text: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
  },
  button: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  buttonDisabled: { opacity: 0.45, cursor: 'not-allowed' },
}
