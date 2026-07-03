import React from 'react'
import type { SynopsisSeriesCharacter } from '@shared/documents'

interface SynopsisSeriesCharactersEditorProps {
  value: SynopsisSeriesCharacter[]
  onChange: (next: SynopsisSeriesCharacter[]) => void
  hideHeading?: boolean
}

export function SynopsisSeriesCharactersEditor({
  value,
  onChange,
  hideHeading = false,
}: SynopsisSeriesCharactersEditorProps) {
  function handleAdd() {
    onChange([...value, { id: crypto.randomUUID(), name: '', role: '', bio: '', arcPerSeason: [] }])
  }

  function handleRemoveCharacter(id: string) {
    onChange(value.filter(c => c.id !== id))
  }

  function handleFieldChange(id: string, field: 'name' | 'role' | 'bio', val: string) {
    onChange(value.map(c => c.id === id ? { ...c, [field]: val } : c))
  }

  function handleArcChange(id: string, index: number, val: string) {
    onChange(value.map(c => {
      if (c.id !== id) return c
      const arcs = [...c.arcPerSeason]
      arcs[index] = val
      return { ...c, arcPerSeason: arcs }
    }))
  }

  function handleAddArc(id: string) {
    onChange(value.map(c =>
      c.id === id ? { ...c, arcPerSeason: [...c.arcPerSeason, ''] } : c
    ))
  }

  function handleRemoveArc(id: string, index: number) {
    onChange(value.map(c => {
      if (c.id !== id) return c
      const arcs = c.arcPerSeason.filter((_, i) => i !== index)
      return { ...c, arcPerSeason: arcs }
    }))
  }

  return (
    <div style={styles.wrapper}>
      {!hideHeading && <h3 style={styles.sectionHeader}>Characters</h3>}
      <div style={styles.list}>
        {value.map(char => (
          <div key={char.id} style={styles.row}>
            <input
              type="text"
              aria-label="Character name"
              value={char.name}
              onChange={e => handleFieldChange(char.id, 'name', e.target.value)}
              placeholder="Name"
              style={styles.nameInput}
            />
            <input
              type="text"
              aria-label="Character role"
              value={char.role}
              onChange={e => handleFieldChange(char.id, 'role', e.target.value)}
              placeholder="Role"
              style={styles.roleInput}
            />
            <textarea
              aria-label="Character bio"
              value={char.bio}
              onChange={e => handleFieldChange(char.id, 'bio', e.target.value)}
              placeholder="Bio…"
              rows={3}
              style={styles.bioTextarea}
            />
            <div style={styles.arcSection}>
              {char.arcPerSeason.map((arc, i) => (
                <div key={i} style={styles.arcRow}>
                  <input
                    type="text"
                    aria-label={`Season arc ${i + 1}`}
                    value={arc}
                    onChange={e => handleArcChange(char.id, i, e.target.value)}
                    placeholder={`Season ${i + 1} arc…`}
                    style={styles.arcInput}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveArc(char.id, i)}
                    style={styles.removeArcBtn}
                  >
                    Remove arc
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleAddArc(char.id)}
                style={styles.addArcBtn}
              >
                Add season arc
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveCharacter(char.id)}
              style={styles.removeCharBtn}
            >
              Remove character
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={handleAdd} style={styles.addCharBtn}>
        Add character
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
    gap: 12,
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
  nameInput: {
    width: '100%',
    fontFamily: 'var(--font-display)',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--fg)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 8px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  roleInput: {
    width: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontStyle: 'italic',
    color: 'var(--fg-muted)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 8px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  bioTextarea: {
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
  arcSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingTop: 4,
  },
  arcRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  arcInput: {
    flex: 1,
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 8px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  removeArcBtn: {
    fontFamily: 'var(--font-body)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  addArcBtn: {
    alignSelf: 'flex-start',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  removeCharBtn: {
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
  addCharBtn: {
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
