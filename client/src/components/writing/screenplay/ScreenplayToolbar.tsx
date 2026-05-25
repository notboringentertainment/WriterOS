import React from 'react'
import { ElementType, ELEMENT_LABELS } from '../../../lib/screenplay'

const ELEMENT_TYPES: ElementType[] = [
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
]

interface ScreenplayToolbarProps {
  elementType: ElementType
  wordCount: number
  pageCount: number
  focusMode: boolean
  onElementTypeChange: (type: ElementType) => void
  onToggleFocusMode: () => void
  onImportFdx?: () => void
  onReplaceFdx?: () => void
  importingFdx?: boolean
}

export function ScreenplayToolbar({
  elementType,
  wordCount,
  pageCount,
  focusMode,
  onElementTypeChange,
  onToggleFocusMode,
  onImportFdx,
  onReplaceFdx,
  importingFdx = false,
}: ScreenplayToolbarProps) {
  if (focusMode) return null

  return (
    <div style={styles.toolbar}>
      <select
        value={elementType}
        onChange={e => onElementTypeChange(e.target.value as ElementType)}
        style={styles.select}
        aria-label="Element type"
      >
        {ELEMENT_TYPES.map(type => (
          <option key={type} value={type}>
            {ELEMENT_LABELS[type]}
          </option>
        ))}
      </select>

      <span style={styles.counts}>
        {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {wordCount} words
      </span>

      <button style={styles.focusBtn} onClick={onToggleFocusMode}>
        Focus
      </button>

      {onImportFdx && (
        <button
          type="button"
          style={styles.focusBtn}
          onClick={onImportFdx}
          disabled={importingFdx}
        >
          {importingFdx ? 'Importing' : 'Import .fdx'}
        </button>
      )}

      {onReplaceFdx && (
        <button
          type="button"
          style={styles.focusBtn}
          onClick={onReplaceFdx}
          disabled={importingFdx}
        >
          Replace .fdx
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    position: 'sticky',
    top: 0,
    zIndex: 4,
    width: 816,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
    background: 'var(--bg)',
    borderBottom: '1px solid var(--border)',
    marginBottom: 32,
    flexShrink: 0,
    boxShadow: '0 8px 20px hsla(38, 24%, 12%, 0.06)',
  },
  select: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
    outline: 'none',
  },
  counts: {
    flex: 1,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
  },
  focusBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 10px',
    cursor: 'pointer',
  },
}
