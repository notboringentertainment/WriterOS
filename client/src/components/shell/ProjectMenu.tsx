import React, { useEffect, useRef, useState } from 'react'

interface Props {
  onSave: () => void
  onRename: () => void
  onDelete: () => void
  onExportSeed?: () => void
  onProjectMeeting?: () => void
}

export function ProjectMenu({ onSave, onRename, onDelete, onExportSeed, onProjectMeeting }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={containerRef} style={styles.container}>
      <button
        type="button"
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Project actions"
        style={styles.trigger}
        onClick={() => setOpen(v => !v)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
      </button>

      {open && (
        <div role="menu" style={styles.panel}>
          {onProjectMeeting && <button type="button" role="menuitem" style={styles.item}
            onClick={run(onProjectMeeting)}>Project Meeting</button>}
          <button
            type="button"
            role="menuitem"
            style={styles.item}
            onClick={run(onSave)}
          >
            Save
          </button>
          <button
            type="button"
            role="menuitem"
            style={styles.item}
            onClick={run(onRename)}
          >
            Rename
          </button>
          {onExportSeed && (
            <button
              type="button"
              role="menuitem"
              style={styles.item}
              onClick={run(onExportSeed)}
            >
              Export seed
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            style={{ ...styles.item, ...styles.itemDanger }}
            onClick={run(onDelete)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'inline-flex',
  },
  trigger: {
    background: 'none',
    border: 'none',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-ui)',
    fontSize: 14,
    lineHeight: 1,
    padding: '6px 10px',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    minWidth: 140,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    zIndex: 20,
  },
  item: {
    background: 'none',
    border: 'none',
    borderRadius: 4,
    color: 'var(--fg)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    textAlign: 'left',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  itemDanger: {
    color: 'var(--danger, #d4543c)',
  },
}
