import React from 'react'

interface ClearOutlineDialogProps {
  open: boolean
  onClose: () => void
  onClearAll: () => void
  onKeepFoundations: () => void
}

export function ClearOutlineDialog({
  open,
  onClose,
  onClearAll,
  onKeepFoundations,
}: ClearOutlineDialogProps) {
  if (!open) return null

  return (
    <div style={styles.backdrop} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="clear-outline-title" style={styles.dialog}>
        <h3 id="clear-outline-title" style={styles.title}>Clear outline?</h3>
        <p style={styles.copy}>Choose how much to remove from this outline.</p>
        <div style={styles.actions}>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={styles.secondaryButton} onClick={onKeepFoundations}>
            Keep foundations
          </button>
          <button type="button" style={styles.dangerButton} onClick={onClearAll}>
            Clear everything
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.52)',
    padding: 24,
  },
  dialog: {
    width: 'min(440px, 100%)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    color: 'var(--fg)',
    padding: 20,
    boxShadow: '0 18px 60px rgba(0, 0, 0, 0.35)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 600,
    margin: 0,
  },
  copy: {
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--fg-muted)',
    margin: '8px 0 18px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 10px',
    cursor: 'pointer',
  },
  dangerButton: {
    border: '1px solid rgba(220, 90, 90, 0.55)',
    borderRadius: 8,
    background: 'rgba(160, 40, 40, 0.18)',
    color: '#ffb3b3',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 700,
    padding: '8px 10px',
    cursor: 'pointer',
  },
}
