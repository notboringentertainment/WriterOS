import React from 'react'

interface Beat {
  id: string
  name: string
  description: string
  notes: string
  linkedSceneIds: string[]
}

interface BeatCardProps {
  beat: Beat
  onUpdate: (beatId: string, patch: { notes: string }) => void
  onMove: (fromIndex: number, toIndex: number) => void
  index: number
}

export function BeatCard({ beat, onUpdate, onMove, index }: BeatCardProps) {
  return (
    <div
      style={styles.card}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
      }}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={e => {
        e.preventDefault()
        const fromIndexRaw = e.dataTransfer.getData('text/plain')
        if (!/^\d+$/.test(fromIndexRaw)) return
        const fromIndex = Number(fromIndexRaw)
        if (Number.isInteger(fromIndex) && fromIndex !== index) onMove(fromIndex, index)
      }}
    >
      <div style={styles.left}>
        <span style={styles.index}>{String(index + 1).padStart(2, '0')}</span>
        <div style={styles.drag} title="Drag to reorder" aria-hidden="true">⠿</div>
      </div>
      <div style={styles.body}>
        <div style={styles.beatName}>{beat.name}</div>
        <p style={styles.description}>{beat.description}</p>
        <textarea
          value={beat.notes}
          onChange={e => onUpdate(beat.id, { notes: e.target.value })}
          placeholder="Your notes for this beat…"
          style={styles.notes}
          rows={2}
        />
        {beat.linkedSceneIds.length > 0 && (
          <div style={styles.linkedScenes}>
            {beat.linkedSceneIds.map(id => (
              <span key={id} style={styles.sceneChip}>Scene {id}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px 16px 16px 8px',
    display: 'flex',
    gap: 12,
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    width: 28,
  },
  index: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  drag: {
    color: 'var(--fg-subtle)',
    fontSize: 14,
    cursor: 'grab',
    userSelect: 'none',
  },
  body: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },
  beatName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--fg)',
  },
  description: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  notes: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '8px 12px',
    lineHeight: 1.6,
    outline: 'none',
  },
  linkedScenes: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  sceneChip: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 6px',
    color: 'var(--fg-muted)',
  },
}
