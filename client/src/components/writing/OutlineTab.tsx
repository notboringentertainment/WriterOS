import React from 'react'
import { BeatCard } from '../shared/BeatCard'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import { defaultProjectState } from '../../lib/projectState'
import type { ProjectFormat } from '@shared/projectFormat'

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
  projectFormat?: ProjectFormat
  onProjectFormatChange?: (next: ProjectFormat) => void
  onUpdateBeat: (beatId: string, patch: { notes: string }) => void
  onReorderBeats: (fromIndex: number, toIndex: number) => void
  onClear?: () => void
}

const DEFAULT_BEAT_IDS = defaultProjectState().outline.beats.map(beat => beat.id)

export function OutlineTab({
  outline,
  projectFormat,
  onProjectFormatChange,
  onUpdateBeat,
  onReorderBeats,
  onClear,
}: OutlineTabProps) {
  const hasContent = Boolean(
    outline.beatType !== 'save-the-cat' ||
    outline.beats.some((beat, index) =>
      beat.notes.trim() ||
      beat.linkedSceneIds.length > 0 ||
      beat.id !== DEFAULT_BEAT_IDS[index]
    )
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <h2 style={styles.title}>Outline</h2>
          {(projectFormat !== undefined || onClear) && (
            <div style={styles.titleControls}>
              {projectFormat !== undefined && onProjectFormatChange && (
                <ProjectFormatSelector
                  value={projectFormat}
                  onChange={onProjectFormatChange}
                />
              )}
              {onClear && (
                <button
                  type="button"
                  style={{
                    ...styles.clearButton,
                    ...(!hasContent ? styles.clearButtonDisabled : {}),
                  }}
                  onClick={onClear}
                  disabled={!hasContent}
                  title="Clear every outline field"
                >
                  Clear outline
                </button>
              )}
            </div>
          )}
        </div>
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
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    margin: 0,
  },
  titleControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  clearButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  clearButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--fg-muted)',
  },
  beats: { display: 'flex', flexDirection: 'column', gap: 12 },
}
