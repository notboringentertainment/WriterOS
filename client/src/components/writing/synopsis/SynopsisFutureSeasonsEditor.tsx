import React from 'react'
import type { SynopsisFutureSeason } from '@shared/documents'

interface SynopsisFutureSeasonsEditorProps {
  value: SynopsisFutureSeason[]
  onChange: (next: SynopsisFutureSeason[]) => void
}

export function SynopsisFutureSeasonsEditor({ value, onChange }: SynopsisFutureSeasonsEditorProps) {
  function handleAdd() {
    onChange([...value, { id: crypto.randomUUID(), label: '', summary: '' }])
  }

  function handleRemove(id: string) {
    onChange(value.filter(s => s.id !== id))
  }

  function handleLabelChange(id: string, label: string) {
    onChange(value.map(s => s.id === id ? { ...s, label } : s))
  }

  function handleSummaryChange(id: string, summary: string) {
    onChange(value.map(s => s.id === id ? { ...s, summary } : s))
  }

  return (
    <div style={styles.wrapper}>
      <h3 style={styles.sectionHeader}>Where It Goes</h3>
      <div style={styles.list}>
        {value.map(season => (
          <div key={season.id} style={styles.row}>
            <input
              type="text"
              aria-label="Season label"
              value={season.label}
              onChange={e => handleLabelChange(season.id, e.target.value)}
              placeholder="Season 2"
              style={styles.labelInput}
            />
            <textarea
              aria-label="Season summary"
              value={season.summary}
              onChange={e => handleSummaryChange(season.id, e.target.value)}
              placeholder="Where the story goes…"
              rows={3}
              style={styles.summaryTextarea}
            />
            <button
              type="button"
              onClick={() => handleRemove(season.id)}
              style={styles.removeBtn}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={handleAdd} style={styles.addBtn}>
        Add future season
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeader: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--fg)',
    margin: 0,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  row: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  labelInput: {
    width: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--fg)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 8px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  summaryTextarea: {
    width: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--fg)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 8px',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
  },
  removeBtn: {
    alignSelf: 'flex-end',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  addBtn: {
    alignSelf: 'flex-start',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
  },
}
