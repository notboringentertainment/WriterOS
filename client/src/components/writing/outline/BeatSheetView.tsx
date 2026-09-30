import React, { useState } from 'react'
import type { OutlineDocumentContent } from '@shared/documents'
import { orphanedBeatKeys, type LookbookDocument } from '@shared/lookbook'
import type { BeatSheetSyncStatusResponse } from '@shared/projectLibraryApi'
import { SERIES_FOUNDATIONS, setOutlinePath } from '../../../lib/outlineDeck'
import { OutlineCard } from './OutlineCard'
import { BeatSheetStatusLine } from './BeatSheetStatusLine'
import { LookbookBeat } from './LookbookBeat'

export interface BeatSheetViewProps {
  content: OutlineDocumentContent
  status: BeatSheetSyncStatusResponse | null
  lookbook: LookbookDocument | undefined
  onRefresh: () => Promise<void>
  /** Resolve with `{ nothingToSee: true }` when Zoe returned no questions; reject to show an error. */
  onAskQuestions: (beatKey: string) => Promise<{ nothingToSee: boolean } | void>
  onAnswer: (beatKey: string, questionId: string, answer: string) => void
  onDismiss: (beatKey: string, questionId: string) => void
  onRemoveOrphan: (beatKey: string) => void
  refreshing: boolean
  onContentChange: (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void
  changedSince?: boolean
  refreshError?: string | null
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
  const [asking, setAsking] = useState<Record<string, boolean>>({})
  const [askErrors, setAskErrors] = useState<Record<string, string | null>>({})
  const [nothingToSee, setNothingToSee] = useState<Record<string, boolean>>({})

  async function handleAsk(beatKey: string) {
    setAsking(current => ({ ...current, [beatKey]: true }))
    setAskErrors(current => ({ ...current, [beatKey]: null }))
    try {
      const result = await onAskQuestions(beatKey)
      setNothingToSee(current => ({ ...current, [beatKey]: !!result && result.nothingToSee }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      setAskErrors(current => ({ ...current, [beatKey]: `Zoe could not answer: ${message}` }))
    } finally {
      setAsking(current => ({ ...current, [beatKey]: false }))
    }
  }

  const liveKeys = new Set(content.units.map(unit => unit.id))
  const orphanKeys = lookbook ? orphanedBeatKeys(lookbook, liveKeys) : []

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
                beatTitle={unit.title}
                beat={lookbook?.beats[unit.id]}
                nothingToSee={!!nothingToSee[unit.id]}
                onAsk={() => handleAsk(unit.id)}
                asking={!!asking[unit.id]}
                askError={askErrors[unit.id] ?? null}
                onAnswer={(questionId, answer) => onAnswer(unit.id, questionId, answer)}
                onDismiss={questionId => onDismiss(unit.id, questionId)}
              />
            </article>
          </React.Fragment>
        )
      })}

      {lookbook && orphanKeys.length > 0 && (
        <section style={styles.orphans}>
          <h3 style={styles.sectionTitle}>Answers from beats that are no longer in Story-drive</h3>
          {orphanKeys.map(key => {
            const entry = lookbook.beats[key]
            return (
              <div key={key} style={styles.beat}>
                <h4 style={styles.beatTitle}>{entry.titleAtAsk}</h4>
                {entry.questions.filter(question => !question.dismissedAt).map(question => (
                  <div key={question.id} style={styles.orphanQuestion}>
                    <p style={styles.orphanPrompt}>{question.prompt}</p>
                    {question.answer && <p style={styles.beatBody}>{question.answer}</p>}
                  </div>
                ))}
                <button type="button" style={styles.removeButton} onClick={() => onRemoveOrphan(key)}>
                  Remove
                </button>
              </div>
            )
          })}
        </section>
      )}
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
  orphans: { display: 'flex', flexDirection: 'column', gap: 12 },
  orphanQuestion: { marginTop: 8 },
  orphanPrompt: { fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-muted)', margin: 0 },
  removeButton: {
    marginTop: 10,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 10px',
    cursor: 'pointer',
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
