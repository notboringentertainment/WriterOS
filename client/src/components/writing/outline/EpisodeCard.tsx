import React from 'react'
import type { OutlineEpisode } from '@shared/documents'

type EpisodeTextField = Exclude<keyof OutlineEpisode, 'id' | 'number'>

interface EpisodeCardProps {
  episode: OutlineEpisode
  onFieldChange: (episodeId: string, field: EpisodeTextField, value: string) => void
}

const FIELDS: Array<{ field: EpisodeTextField; label: string; rows?: number }> = [
  { field: 'title', label: 'Working title', rows: 1 },
  { field: 'hookLogline', label: "What's the hook for this episode?" },
  { field: 'aStory', label: "What's the main plot this episode?" },
  { field: 'bcStory', label: "What's running underneath?" },
  { field: 'changeByEnd', label: "What's different by the end?" },
  { field: 'endingHook', label: 'What pulls a viewer into the next episode?' },
]

export function EpisodeCard({ episode, onFieldChange }: EpisodeCardProps) {
  return (
    <article style={styles.card}>
      <input
        aria-label="Episode label"
        value={episode.label}
        onChange={(event) => onFieldChange(episode.id, 'label', event.target.value)}
        style={styles.episodeLabel}
      />
      <div style={styles.grid}>
        {FIELDS.map(item => (
          <label key={item.field} style={styles.field}>
            <span style={styles.label}>{item.label}</span>
            {item.rows === 1 ? (
              <input
                value={String(episode[item.field])}
                onChange={(event) => onFieldChange(episode.id, item.field, event.target.value)}
                style={styles.input}
              />
            ) : (
              <textarea
                value={String(episode[item.field])}
                onChange={(event) => onFieldChange(episode.id, item.field, event.target.value)}
                style={styles.textarea}
                rows={3}
              />
            )}
          </label>
        ))}
      </div>
    </article>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    padding: 16,
  },
  episodeLabel: {
    width: '100%',
    boxSizing: 'border-box',
    border: 0,
    borderBottom: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 600,
    padding: '0 0 10px',
    marginBottom: 14,
    outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.35,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    padding: '9px 10px',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 86,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.45,
    padding: '9px 10px',
    outline: 'none',
  },
}
