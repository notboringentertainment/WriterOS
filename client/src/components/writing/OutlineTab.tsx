import React from 'react'
import { BeatCard } from '../shared/BeatCard'

interface Beat {
  id: string
  name: string
  description: string
  notes: string
  linkedSceneIds: string[]
}

interface OutlineData {
  beatType: string
  beats: Beat[]
}

interface OutlineTabProps {
  outline: OutlineData
  onUpdateBeat: (beatId: string, patch: { notes: string }) => void
  onReorderBeats: (fromIndex: number, toIndex: number) => void
}

export function OutlineTab({ outline, onUpdateBeat, onReorderBeats }: OutlineTabProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Outline</h2>
        <p style={styles.subtitle}>
          A writer-facing structural map for beats, reversals, and missing turns. Writing Partner naturally asks @Oliver here.
        </p>
      </div>
      <div style={styles.beats}>
        {outline.beats.map((beat, index) => (
          <BeatCard
            key={beat.id}
            beat={beat}
            index={index}
            onUpdate={onUpdateBeat}
            onMove={onReorderBeats}
          />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 24px 64px',
  },
  header: { marginBottom: 28 },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--fg-muted)',
  },
  beats: { display: 'flex', flexDirection: 'column', gap: 12 },
}
