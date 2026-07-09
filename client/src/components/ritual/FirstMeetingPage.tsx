// The First Meeting — the project-level identity ritual (§A1). A full-bleed page
// driven by the interview state machine; the page itself is the offer (§A3), so
// "Skip for now" simply exits. Never auto-starts.

import React, { useState } from 'react'
import { PERSONAS } from '@shared/personas'
import { useInterviewSession, type InterviewAnswerOrigin } from '../../lib/useInterviewSession'
import { RitualPage } from './RitualPage'
import { RitualQuestionCard } from './RitualQuestionCard'
import { RitualStage } from './RitualStage'

export interface FirstMeetingPageProps {
  projectId: string
  projectTitle?: string
  onExit: () => void
}

function personaLabel(lane: string): string {
  const persona = PERSONAS[lane]
  return persona?.displayName ?? persona?.name ?? lane
}

export function FirstMeetingPage({ projectId, projectTitle, onExit }: FirstMeetingPageProps) {
  const interview = useInterviewSession(projectId)
  const [seedDraft, setSeedDraft] = useState('')
  const [answerDraft, setAnswerDraft] = useState('')
  const [origin, setOrigin] = useState<InterviewAnswerOrigin>('seed')
  const [seedError, setSeedError] = useState<string | null>(null)

  const session = interview.status.activeSession
  const stage = session?.state ?? 'intake'
  const question = interview.status.currentQuestion

  async function handleBegin() {
    const seedText = seedDraft.trim()
    if (!seedText) {
      setSeedError('Paste or type a seed before starting the First Meeting.')
      return
    }
    setSeedError(null)
    if (await interview.start({ mode: 'full', seedText })) {
      setSeedDraft('')
    }
  }

  async function handleAnswer(rejectMapping: boolean) {
    if (await interview.answer({ answerText: answerDraft, origin, rejectMapping })) {
      setAnswerDraft('')
      setOrigin('seed')
    }
  }

  const answeredCount = session?.answers.length ?? 0
  const error = seedError ?? interview.error

  return (
    <RitualPage
      eyebrow="First Meeting"
      title={interview.status.actionLabel === 'New interview round' ? 'A new round with the room' : 'The First Meeting'}
      subtitle={
        stage === 'intake'
          ? `Bring the raw idea${projectTitle ? ` for ${projectTitle}` : ''}. The room reads it, then asks only what the story actually needs. Skipping is fine — the meeting waits.`
          : undefined
      }
      exitLabel={stage === 'intake' ? 'Skip for now' : 'Back to writing'}
      onExit={onExit}
    >
      {error && <p style={styles.error}>{error}</p>}

      {!session && (
        <RitualStage stageKey="intake">
          <div style={styles.stack}>
            <textarea
              aria-label="First Meeting seed"
              placeholder="Paste the seed or one-sentence idea…"
              value={seedDraft}
              onChange={e => setSeedDraft(e.target.value)}
              rows={6}
              style={styles.seedInput}
            />
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={() => void handleBegin()}>
                Begin the meeting
              </button>
              <span style={styles.hint}>Explicit start · audit-driven · never auto-started</span>
            </div>
          </div>
        </RitualStage>
      )}

      {session?.state === 'auditing' && (
        <RitualStage stageKey="auditing">
          <p style={styles.prose}>The room is reading your seed…</p>
        </RitualStage>
      )}

      {session?.state === 'paused' && (
        <RitualStage stageKey="paused">
          <div style={styles.stack}>
            <p style={styles.prose}>Paused at {session.cursor.question_id ?? 'readback'}. The room holds its place.</p>
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={() => void interview.resume()}>
                Resume the meeting
              </button>
            </div>
          </div>
        </RitualStage>
      )}

      {session?.state === 'interviewing' && question && (
        <RitualStage stageKey={`question-${question.id}`}>
          <div style={styles.stack}>
            <div style={styles.counter}>Question {answeredCount + 1} · {personaLabel(question.lane)} · {question.trigger}</div>
            <RitualQuestionCard
              asker={personaLabel(question.lane)}
              question={question.question}
              actions={
                <>
                  <button type="button" style={styles.primaryButton} onClick={() => void handleAnswer(false)}>Confirm mapping</button>
                  <button type="button" style={styles.ghostButton} onClick={() => void handleAnswer(true)}>Keep as seed color</button>
                  <button type="button" style={styles.ghostButton} onClick={() => void interview.skip()}>Skip / delegate</button>
                  <button type="button" style={styles.ghostButton} onClick={() => void interview.pause()}>Pause</button>
                  <button type="button" style={styles.ghostButton} onClick={() => void interview.wrap()}>Wrap it up</button>
                </>
              }
            >
              <textarea
                aria-label="First Meeting answer"
                placeholder="Answer in story terms…"
                value={answerDraft}
                onChange={e => setAnswerDraft(e.target.value)}
                rows={4}
                style={styles.answerInput}
              />
              <div style={styles.originRow} role="radiogroup" aria-label="First Meeting answer origin">
                <span style={styles.originLabel}>This answer comes from</span>
                {(['seed', 'extrapolated'] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={origin === value}
                    style={{ ...styles.originChip, ...(origin === value ? styles.originChipActive : {}) }}
                    onClick={() => setOrigin(value)}
                  >
                    {value === 'seed' ? 'The seed' : 'Extrapolation'}
                  </button>
                ))}
              </div>
            </RitualQuestionCard>
          </div>
        </RitualStage>
      )}

      {session?.state === 'readback' && (
        <RitualStage stageKey="readback">
          <div style={styles.stack}>
            <p style={styles.prose}>
              Readback ready: review locks, leanings, and open questions before banking.
              No memory blocks are written until you bank this round.
            </p>
            <div style={styles.actionRow}>
              <button type="button" style={styles.ghostButton} onClick={() => void interview.previewBank()}>Preview banking</button>
              <button type="button" style={styles.primaryButton} onClick={() => void interview.bank()}>Bank this round</button>
              <button type="button" style={styles.ghostButton} onClick={() => void interview.pause()}>Pause</button>
            </div>
            {interview.bankPreview && <pre style={styles.previewBox}>{interview.bankPreview.conceptSeedAppend}</pre>}
          </div>
        </RitualStage>
      )}

      {session?.state === 'banked' && (
        <RitualStage stageKey="banked">
          <div style={styles.stack}>
            <p style={styles.prose}>This round is banked. Future rounds append; they do not edit this one.</p>
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={() => void interview.exportToPitchStudio()}>Export to PitchStudio</button>
              <button type="button" style={styles.ghostButton} onClick={onExit}>Back to writing</button>
            </div>
          </div>
        </RitualStage>
      )}

      {session?.state === 'exported' && (
        <RitualStage stageKey="exported">
          <div style={styles.stack}>
            <p style={styles.prose}>Export prepared for PitchStudio.</p>
            {interview.exportMarkdown && <pre style={styles.previewBox}>{interview.exportMarkdown}</pre>}
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={onExit}>Back to writing</button>
            </div>
          </div>
        </RitualStage>
      )}
    </RitualPage>
  )
}

const styles: Record<string, React.CSSProperties> = {
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  prose: {
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    color: 'var(--fg)',
    lineHeight: 1.6,
    margin: 0,
  },
  counter: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  hint: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  error: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--danger, #d66)',
    margin: 0,
  },
  seedInput: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    lineHeight: 1.6,
    padding: '14px 16px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    width: '100%',
  },
  answerInput: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.6,
    padding: '12px 14px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    width: '100%',
  },
  originRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  originLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  originChip: {
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'none',
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },
  originChipActive: {
    border: '1px solid var(--wp-amber)',
    color: 'var(--wp-amber)',
    background: 'hsla(41, 100%, 60%, 0.08)',
  },
  actionRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '8px 18px',
    borderRadius: 8,
    border: '1px solid var(--wp-amber)',
    background: 'var(--wp-amber)',
    color: '#1a1200',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 700,
  },
  ghostButton: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'none',
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  },
  previewBox: {
    maxHeight: 320,
    overflow: 'auto',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 14,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    margin: 0,
  },
}
