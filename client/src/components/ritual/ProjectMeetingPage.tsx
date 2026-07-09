// The Project Meeting — the project-level identity ritual (§A1). A full-bleed page
// driven by the interview state machine; the page itself is the offer (§A3), so
// "Skip for now" simply exits. Never auto-starts.

import React, { useEffect, useState } from 'react'
import { PERSONAS } from '@shared/personas'
import { useInterviewSession, type InterviewAnswerOrigin, type InterviewMutability } from '../../lib/useInterviewSession'
import { RitualPage } from './RitualPage'
import { RitualQuestionCard } from './RitualQuestionCard'
import { RitualStage } from './RitualStage'
import { MutabilityToggle } from './MutabilityToggle'

export interface ProjectMeetingPageProps {
  projectId: string
  projectTitle?: string
  onExit: () => void
}

function personaLabel(lane: string): string {
  const persona = PERSONAS[lane]
  return persona?.displayName ?? persona?.name ?? lane
}

export function ProjectMeetingPage({ projectId, projectTitle, onExit }: ProjectMeetingPageProps) {
  const interview = useInterviewSession(projectId)
  const [seedDraft, setSeedDraft] = useState('')
  const [answerDraft, setAnswerDraft] = useState('')
  const [origin, setOrigin] = useState<InterviewAnswerOrigin>('seed')
  const [seedError, setSeedError] = useState<string | null>(null)
  const [mutabilitySelections, setMutabilitySelections] = useState<Record<string, InterviewMutability>>({})

  const session = interview.status.activeSession
  const stage = session?.state ?? 'intake'
  const question = interview.status.currentQuestion
  const { previewBank } = interview

  // Entering readback loads the taggable answers so the writer reviews before banking.
  useEffect(() => {
    if (stage === 'readback') {
      setMutabilitySelections({})
      void previewBank({})
    }
  }, [stage, previewBank])

  function handleMutabilityChange(proposalId: string, value: InterviewMutability) {
    const next = { ...mutabilitySelections, [proposalId]: value }
    setMutabilitySelections(next)
    void interview.previewBank(next)
  }

  async function handleBegin() {
    const seedText = seedDraft.trim()
    if (!seedText) {
      setSeedError('Paste or type a seed before starting the Project Meeting.')
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
      eyebrow="Project Meeting"
      title={interview.status.actionLabel === 'New interview round' ? 'A new round with the room' : 'The Project Meeting'}
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
              aria-label="Project Meeting seed"
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
                aria-label="Project Meeting answer"
                placeholder="Answer in story terms…"
                value={answerDraft}
                onChange={e => setAnswerDraft(e.target.value)}
                rows={4}
                style={styles.answerInput}
              />
              <div style={styles.originRow} role="radiogroup" aria-label="Project Meeting answer origin">
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
              Here's what the room heard. Tag each answer — locked is canon, leaning invites
              challenge, open delegates it. No memory blocks are written until you bank this round.
            </p>

            {interview.bankPreview && interview.bankPreview.taggable.length > 0 && (
              <ul style={styles.taggableList} data-testid="readback-taggable">
                {interview.bankPreview.taggable.map(item => (
                  <li key={item.proposalId} style={styles.taggableItem}>
                    <div style={styles.taggableValueRow}>
                      <span style={styles.originTag}>{item.origin === 'extrapolated' ? 'EXTRAPOLATED' : 'SEED'}</span>
                      <span style={styles.taggableValue}>{item.value}</span>
                    </div>
                    <MutabilityToggle
                      value={mutabilitySelections[item.proposalId] ?? item.applied}
                      onChange={value => handleMutabilityChange(item.proposalId, value)}
                      ariaLabel={`Mutability for: ${item.value.slice(0, 60)}`}
                    />
                  </li>
                ))}
              </ul>
            )}

            {interview.bankPreview && (
              <div style={styles.groupedPreview} data-testid="readback-grouped-preview">
                <div style={styles.previewGroup}>
                  <div style={styles.previewGroupTitle}>Locks</div>
                  {interview.bankPreview.locks.length
                    ? interview.bankPreview.locks.map((line, i) => <div key={i} style={styles.previewLine}>{line}</div>)
                    : <div style={styles.previewEmpty}>No locks — writer cedes broadly</div>}
                </div>
                <div style={styles.previewGroup}>
                  <div style={styles.previewGroupTitle}>Leanings</div>
                  {interview.bankPreview.leanings.length
                    ? interview.bankPreview.leanings.map((line, i) => <div key={i} style={styles.previewLine}>{line}</div>)
                    : <div style={styles.previewEmpty}>None</div>}
                </div>
                <div style={styles.previewGroup}>
                  <div style={styles.previewGroupTitle}>Open questions</div>
                  {interview.bankPreview.openQuestions.length
                    ? interview.bankPreview.openQuestions.map((line, i) => <div key={i} style={styles.previewLine}>{line}</div>)
                    : <div style={styles.previewEmpty}>Nothing delegated — writer holds all intent</div>}
                </div>
                {interview.bankPreview.seedColor.length > 0 && (
                  <div style={styles.previewGroup}>
                    <div style={styles.previewGroupTitle}>Seed color</div>
                    {interview.bankPreview.seedColor.map((line, i) => <div key={i} style={styles.previewLine}>{line}</div>)}
                  </div>
                )}
              </div>
            )}

            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={() => void interview.bank(mutabilitySelections)}>Bank this round</button>
              <button type="button" style={styles.ghostButton} onClick={() => void interview.pause()}>Pause</button>
            </div>
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
  taggableList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  taggableItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    background: 'var(--surface-1, var(--surface))',
  },
  taggableValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  originTag: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  taggableValue: {
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--fg)',
    lineHeight: 1.55,
  },
  groupedPreview: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 14,
    background: 'var(--surface-2)',
  },
  previewGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  previewGroupTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--wp-amber)',
  },
  previewLine: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.5,
  },
  previewEmpty: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-subtle)',
    fontStyle: 'italic',
  },
}
