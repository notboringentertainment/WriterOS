// The Project Meeting — the project-level identity ritual (§A1). A full-bleed page
// driven by the interview state machine; the page itself is the offer (§A3), so
// "Skip for now" simply exits. Never auto-starts.

import React, { useEffect, useState } from 'react'
import { PERSONAS } from '@shared/personas'
import type { ProjectDocuments } from '@shared/documents'
import { useInterviewSession, type InterviewAnswerOrigin, type InterviewMutability } from '../../lib/useInterviewSession'
import type { MeetingRevisionInput } from '../../lib/roomApi'
import { RitualPage } from './RitualPage'
import { RitualQuestionCard } from './RitualQuestionCard'
import { RitualStage } from './RitualStage'
import { MutabilityToggle } from './MutabilityToggle'
import { PitchPacketReview } from './PitchPacketReview'

export interface ProjectMeetingPageProps {
  projectId: string
  projectTitle?: string
  documents: ProjectDocuments
  onExit: () => void
}

function personaLabel(lane: string): string {
  const persona = PERSONAS[lane]
  return persona?.displayName ?? persona?.name ?? lane
}

export function ProjectMeetingPage({ projectId, projectTitle, documents, onExit }: ProjectMeetingPageProps) {
  const interview = useInterviewSession(projectId)
  const [seedDraft, setSeedDraft] = useState('')
  const [answerDraft, setAnswerDraft] = useState('')
  const [origin, setOrigin] = useState<InterviewAnswerOrigin>('seed')
  const [seedError, setSeedError] = useState<string | null>(null)
  const [mutabilitySelections, setMutabilitySelections] = useState<Record<string, InterviewMutability>>({})
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({})
  const [revisionOpen, setRevisionOpen] = useState<Record<string, boolean>>({})
  const [retractNotices, setRetractNotices] = useState<Record<string, boolean>>({})

  const session = interview.status.activeSession ?? interview.status.latestTerminalSession ?? null
  const stage = session?.state ?? 'intake'
  const question = interview.status.currentQuestion

  // Entering readback loads the taggable answers so the writer reviews before banking.
  useEffect(() => {
    if (stage === 'readback') {
      setMutabilitySelections({})
      void interview.previewBank({})
    }
  }, [stage, session?.id])

  function applyRevisionOperation(operation: MeetingRevisionInput) {
    const next = interview.setRevisionOperation(operation)
    if (stage === 'readback') void interview.previewBank(mutabilitySelections, next)
  }

  function handleMutabilityChange(proposalId: string, value: InterviewMutability) {
    const next = { ...mutabilitySelections, [proposalId]: value }
    setMutabilitySelections(next)
    void interview.previewBank(next)
  }

  async function handleBegin() {
    const seedText = seedDraft
    if (!seedText.trim()) {
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

      {session && interview.status.recap.length > 0 && session.state !== 'banked' && session.state !== 'exported' && (
        <section style={styles.recapSection} aria-label="Earlier round direction">
          <h2 style={styles.sectionTitle}>What's standing from earlier rounds</h2>
          <p style={styles.hint}>Selections from an earlier visit are not restored. Review these choices again before banking this round.</p>
          {interview.status.recap.map(item => (
            <article key={item.decisionId} style={styles.recapItem}>
              <div style={styles.recapArea}>{item.area.replaceAll('_', ' ')}</div>
              <p style={styles.prose}>{item.statement}</p>
              <p style={styles.hint}>Answered in Round {item.roundNumber}. We won't re-ask unless you reopen it.</p>
              <div style={styles.actionRow}>
                <button type="button" style={styles.ghostButton} onClick={() => applyRevisionOperation({ op: 'keep', targetId: item.decisionId })}>Keep</button>
                <button type="button" style={styles.ghostButton} onClick={() => setRevisionOpen(prev => ({ ...prev, [item.decisionId]: true }))}>Revise</button>
                <button type="button" style={styles.ghostButton} onClick={() => {
                  applyRevisionOperation({ op: 'retract', targetId: item.decisionId })
                  setRetractNotices(prev => ({ ...prev, [item.decisionId]: true }))
                }}>Retract</button>
                <button type="button" style={styles.ghostButton} disabled={!item.questionId} onClick={() => item.questionId && void interview.redirect(item.area, item.questionId)}>Ask me again</button>
              </div>
              {revisionOpen[item.decisionId] && (
                <div style={styles.stack}>
                  <textarea
                    aria-label={`Revised direction for ${item.area}`}
                    value={revisionDrafts[item.decisionId] ?? item.statement}
                    onChange={event => setRevisionDrafts(prev => ({ ...prev, [item.decisionId]: event.target.value }))}
                    rows={3}
                    style={styles.answerInput}
                  />
                  <button type="button" style={styles.primaryButton} onClick={() => {
                    const statement = revisionDrafts[item.decisionId] ?? item.statement
                    applyRevisionOperation({ op: 'revise', targetId: item.decisionId, statement })
                    setRevisionOpen(prev => ({ ...prev, [item.decisionId]: false }))
                  }}>Use revision</button>
                </div>
              )}
              {retractNotices[item.decisionId] && (
                <p style={styles.warning}>Retracting removes this from your project's active direction. Your Round {item.roundNumber} answer stays in the record.</p>
              )}
            </article>
          ))}
        </section>
      )}

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

            {!interview.bankPreview && <p style={styles.hint}>Preparing the readback…</p>}

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

            {interview.finalValues && (
              <details>
                <summary>Exact block values to be written</summary>
                <div><strong>concept_seed</strong><pre>{interview.finalValues.concept_seed}</pre></div>
                <div><strong>story_locks</strong><pre>{interview.finalValues.story_locks}</pre></div>
                <div><strong>open_questions</strong><pre>{interview.finalValues.open_questions}</pre></div>
              </details>
            )}

            {interview.directionDiff.length > 0 && (
              <section style={styles.diffSection}>
                <h2 style={styles.sectionTitle}>Exactly what this round changes</h2>
                {interview.directionDiff.map((entry, index) => (
                  <div key={`${entry.area}-${entry.op}-${index}`} style={styles.diffItem}>
                    <strong>{entry.area.replaceAll('_', ' ')}</strong>
                    <div>{entry.before.length ? entry.before.join(' · ') : 'Nothing standing'} → {entry.after.length ? entry.after.join(' · ') : 'Removed from active direction'}</div>
                  </div>
                ))}
              </section>
            )}

            <div style={styles.actionRow}>
              <button
                type="button"
                style={{ ...styles.primaryButton, ...(!interview.previewPending && interview.bankPreview && interview.finalValues ? {} : styles.buttonDisabled) }}
                disabled={interview.previewPending || !interview.bankPreview || !interview.finalValues}
                title={!interview.previewPending && interview.bankPreview && interview.finalValues ? undefined : 'The readback is still loading — bank only what you can see'}
                onClick={() => void interview.bank(mutabilitySelections)}
              >
                Bank this round
              </button>
              <button type="button" style={styles.ghostButton} onClick={() => void interview.pause()}>Pause</button>
            </div>
          </div>
        </RitualStage>
      )}

      {interview.pitchPacketRow && (
        <RitualStage stageKey="pitch-packet-review">
          <PitchPacketReview
            row={interview.pitchPacketRow}
            proposalUnavailable={interview.proposalUnavailable}
            message={interview.packetMessage}
            downloadError={interview.packetDownloadError}
            onSave={interview.savePitchPacket}
            onApprove={interview.approvePitchPacketReview}
            onExport={interview.exportPitchPacketFiles}
            onRedownload={interview.redownloadPitchPacket}
          />
        </RitualStage>
      )}

      {session?.state === 'banked' && !interview.pitchPacketRow && (
        <RitualStage stageKey="banked">
          <div style={styles.stack}>
            <p style={styles.prose}>This round is banked. Future rounds append; they do not edit this one.</p>
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={() => void interview.openPitchPacket(documents, projectTitle)}>Export to PitchStudio</button>
              <button type="button" style={styles.ghostButton} onClick={interview.prepareNewRound}>Start new interview round</button>
              <button type="button" style={styles.ghostButton} onClick={onExit}>Back to writing</button>
            </div>
          </div>
        </RitualStage>
      )}

      {session?.state === 'exported' && !interview.pitchPacketRow && (
        <RitualStage stageKey="exported">
          <div style={styles.stack}>
            <p style={styles.prose}>Export prepared for PitchStudio.</p>
            <div style={styles.actionRow}>
              <button type="button" style={styles.ghostButton} onClick={interview.prepareNewRound}>Start new interview round</button>
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
  recapSection: {
    display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--surface-1)',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--fg)', margin: 0,
  },
  recapItem: {
    display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12,
  },
  recapArea: {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--wp-amber)', textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  warning: {
    fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--danger, #d66)', margin: 0,
  },
  diffSection: {
    display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 14,
  },
  diffItem: {
    display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)',
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
  buttonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
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
