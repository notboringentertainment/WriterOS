import React from 'react'
import type { OutlineDocumentContent, OutlineEpisode } from '@shared/documents'
import type { OutlineDeckFormat } from '../../../lib/outlineDeck'
import {
  getOutlineDeck,
  setOutlinePath,
} from '../../../lib/outlineDeck'
import { OutlineCard } from './OutlineCard'
import { EpisodeCard } from './EpisodeCard'

type EpisodeTextField = Exclude<keyof OutlineEpisode, 'id' | 'number'>

interface OutlineEditViewProps {
  format: OutlineDeckFormat
  content: OutlineDocumentContent
  onContentChange: (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void
  onAddEpisode: () => void
  onEpisodeFieldChange: (episodeId: string, field: EpisodeTextField, value: string) => void
}

export function OutlineEditView({
  format,
  content,
  onContentChange,
  onAddEpisode,
  onEpisodeFieldChange,
}: OutlineEditViewProps) {
  const deck = getOutlineDeck(format)
  let currentSection = ''

  return (
    <div style={styles.stack}>
      {deck.map(card => {
        const showSection = card.sectionLabel !== currentSection
        currentSection = card.sectionLabel

        return (
          <React.Fragment key={card.id}>
            {showSection && <h3 style={styles.sectionTitle}>{card.sectionLabel}</h3>}
            <OutlineCard
              card={card}
              content={content}
              onFieldChange={(path, value) =>
                onContentChange(current => setOutlinePath(current, path, value))
              }
            />
          </React.Fragment>
        )
      })}

      {format === 'series' && (
        <section style={styles.episodeSection}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Episode map</h3>
            <button type="button" style={styles.addButton} onClick={onAddEpisode}>
              Add episode
            </button>
          </div>
          <div style={styles.episodes}>
            {content.episodes.map(episode => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                onFieldChange={onEpisodeFieldChange}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0,
    margin: '18px 0 0',
  },
  episodeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 18,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  addButton: {
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
  episodes: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
}
