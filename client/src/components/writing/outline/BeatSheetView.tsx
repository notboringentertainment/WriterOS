import React from 'react'
import type { OutlineDocumentContent } from '@shared/documents'
import type { LookbookDocument } from '@shared/lookbook'
import type { BeatSheetSyncStatusResponse } from '@shared/projectLibraryApi'
import { SERIES_FOUNDATIONS, setOutlinePath } from '../../../lib/outlineDeck'
import { OutlineCard } from './OutlineCard'
import { BeatSheetStatusLine } from './BeatSheetStatusLine'

export interface BeatSheetViewProps {
  content: OutlineDocumentContent
  status: BeatSheetSyncStatusResponse | null
  lookbook: LookbookDocument | undefined
  onRefresh: () => Promise<void>
  onAskQuestions: (beatKey: string) => Promise<void>
  onAnswer: (beatKey: string, questionId: string, answer: string) => void
  onDismiss: (beatKey: string, questionId: string) => void
  onRemoveOrphan: (beatKey: string) => void
  refreshing: boolean
  onContentChange: (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void
  changedSince?: boolean
  refreshError?: string | null
}

// Task 8 fills this slot with the per-beat Lookbook questions.
function LookbookBeat(_props: {
  beatKey: string
  lookbook: LookbookDocument | undefined
  onAskQuestions: BeatSheetViewProps['onAskQuestions']
  onAnswer: BeatSheetViewProps['onAnswer']
  onDismiss: BeatSheetViewProps['onDismiss']
  onRemoveOrphan: BeatSheetViewProps['onRemoveOrphan']
}) {
  return null
}

export function BeatSheetView({
  content,
  status,
  lookbook,
  onRefresh,
  onAskQuestions,
  onAnswer,
  onDismiss,
  onRemoveOrphan,
  refreshing,
  onContentChange,
  changedSince,
  refreshError,
}: BeatSheetViewProps) {
  let currentSection = ''
  let currentMovement: string | null = null

  return (
    <div style={styles.stack}>
      {status && (
        <BeatSheetStatusLine
          status={status}
          changedSince={changedSince}
          errorMessage={refreshError}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {SERIES_FOUNDATIONS.map(card => {
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

      {content.units.map(unit => {
        const showMovement = unit.actOrSequence !== currentMovement
        currentMovement = unit.actOrSequence
        return (
          <React.Fragment key={unit.id}>
            {showMovement && unit.actOrSequence && (
              <h3 style={styles.sectionTitle}>{unit.actOrSequence}</h3>
            )}
            <article style={styles.beat}>
              <h4 style={styles.beatTitle}>{`${unit.number}. ${unit.title}`}</h4>
              <p style={styles.beatBody}>{unit.whatHappens}</p>
              <LookbookBeat
                beatKey={unit.id}
                lookbook={lookbook}
                onAskQuestions={onAskQuestions}
                onAnswer={onAnswer}
                onDismiss={onDismiss}
                onRemoveOrphan={onRemoveOrphan}
              />
            </article>
          </React.Fragment>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 12 },
  sectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0,
    margin: '18px 0 0',
  },
  beat: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--surface)',
    padding: '14px 16px',
  },
  beatTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--fg)',
    margin: 0,
  },
  beatBody: {
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.55,
    color: 'var(--fg)',
    margin: '8px 0 0',
    whiteSpace: 'pre-wrap',
  },
}
