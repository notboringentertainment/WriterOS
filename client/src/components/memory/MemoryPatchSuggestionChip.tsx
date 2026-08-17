// Task 10 continuation: what "Keep as suggestion" leaves behind. Kept
// suggestions are not discarded like Dismiss, but they are not durable across
// sessions either (no store) — they stay reachable only as a collapsed chip
// on the transcript message that proposed them, for the rest of this
// session, until the writer reopens or the project changes. Same
// never-a-modal, inline convention as MemoryConflictCard.tsx and
// CapabilityReceiptChip.tsx.
import React from 'react'

export interface MemoryPatchSuggestionChipProps {
  onReopen: () => void
}

export function MemoryPatchSuggestionChip({ onReopen }: MemoryPatchSuggestionChipProps) {
  return (
    <div style={styles.wrap}>
      <button type="button" style={styles.chip} onClick={onReopen}>
        Suggested update kept — Reopen
      </button>
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
}
