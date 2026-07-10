// The Voice Profile ritual — the writer-level identity page ("the story of you").
// One question at a time over the 20-question assessment, then synthesis and review.
// Offered on first run (skippable); the drawer remains the quick view/edit surface.

import React, { useEffect, useMemo, useState } from 'react'
import { VOICE_PROFILE_ASSESSMENT_QUESTIONS, VOICE_PROFILE_ASSESSMENT_SECTIONS } from '../../lib/voiceProfileAssessment'
import { useVoiceProfileFlow } from '../../lib/useVoiceProfileFlow'
import { VoiceProfileView } from '../shell/VoiceProfileDrawer'
import { RitualPage } from './RitualPage'
import { RitualProgress } from './RitualProgress'
import { RitualQuestionCard } from './RitualQuestionCard'
import { RitualStage } from './RitualStage'

export interface VoiceProfileRitualPageProps {
  onExit: () => void
}

type RitualFlowStage = 'intro' | 'assessment' | 'review' | 'done'

const MIN_ANSWERS_FOR_SYNTHESIS = 10

function sectionTitleFor(questionId: string): string {
  const section = VOICE_PROFILE_ASSESSMENT_SECTIONS.find(candidate => candidate.questions.some(q => q.id === questionId))
  return section?.title ?? ''
}

export function VoiceProfileRitualPage({ onExit }: VoiceProfileRitualPageProps) {
  const flow = useVoiceProfileFlow()
  const [stage, setStage] = useState<RitualFlowStage>('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const { reload } = flow

  useEffect(() => {
    const loaded = reload()
    if (loaded?.status === 'draft_profile' && loaded.profile) setStage('review')
  }, [reload])

  const questions = VOICE_PROFILE_ASSESSMENT_QUESTIONS
  const question = questions[questionIndex]
  const profile = flow.profileState?.profile
  const hasAnyProgress = flow.answeredCount > 0
  const canSynthesize = flow.answeredCount >= MIN_ANSWERS_FOR_SYNTHESIS

  const subtitle = useMemo(() => {
    if (stage !== 'intro') return undefined
    return hasAnyProgress
      ? `You've answered ${flow.answeredCount} of ${questions.length}. Pick up where you left off — everything is saved as you go.`
      : `${questions.length} questions about how you actually write — instincts, influences, lines you won't cross. Around ten minutes. The room reads this before it reads anything else.`
  }, [stage, hasAnyProgress, flow.answeredCount, questions.length])

  function handleSkip() {
    // First-run skip is recorded so the gate never re-prompts; the TopBar Voice
    // button remains the standing way back in.
    flow.markSkipped()
    onExit()
  }

  function handleBegin() {
    const firstUnanswered = questions.findIndex(q => !flow.answers[q.id]?.trim())
    setQuestionIndex(firstUnanswered === -1 ? questions.length - 1 : firstUnanswered)
    setStage('assessment')
  }

  async function handleGenerate() {
    if (await flow.generateProfile()) {
      setStage('review')
    }
  }

  function handleApprove() {
    flow.approveProfile()
    setStage('done')
  }

  const isLastQuestion = questionIndex === questions.length - 1

  return (
    <RitualPage
      eyebrow="Voice Profile"
      title={stage === 'done' ? 'The room knows your voice.' : 'The story of you.'}
      subtitle={subtitle}
      exitLabel={stage === 'intro' && !hasAnyProgress ? 'Skip for now' : 'Save & close'}
      onExit={stage === 'intro' && !hasAnyProgress ? handleSkip : onExit}
    >
      {flow.synthesisError && <p style={styles.error}>{flow.synthesisError}</p>}

      {stage === 'intro' && (
        <RitualStage stageKey="intro">
          <div style={styles.actionRow}>
            <button type="button" style={styles.primaryButton} onClick={handleBegin}>
              {hasAnyProgress ? 'Continue' : 'Begin'}
            </button>
            {canSynthesize && (
              <button type="button" style={styles.ghostButton} onClick={() => void handleGenerate()} disabled={flow.synthesisLoading}>
                {flow.synthesisLoading ? 'Generating…' : 'Generate profile from saved answers'}
              </button>
            )}
          </div>
        </RitualStage>
      )}

      {stage === 'assessment' && question && (
        <RitualStage stageKey={`question-${question.id}`}>
          <div style={styles.stack}>
            <RitualProgress current={questionIndex + 1} total={questions.length} />
            <RitualQuestionCard
              asker={sectionTitleFor(question.id)}
              question={question.text}
              actions={
                <>
                  <button
                    type="button"
                    style={styles.ghostButton}
                    disabled={questionIndex === 0}
                    onClick={() => setQuestionIndex(index => Math.max(0, index - 1))}
                  >
                    Back
                  </button>
                  {!isLastQuestion && (
                    <button type="button" style={styles.primaryButton} onClick={() => setQuestionIndex(index => Math.min(questions.length - 1, index + 1))}>
                      Next
                    </button>
                  )}
                  {isLastQuestion && (
                    <button
                      type="button"
                      style={{ ...styles.primaryButton, ...(canSynthesize ? {} : styles.buttonDisabled) }}
                      disabled={!canSynthesize || flow.synthesisLoading}
                      title={canSynthesize ? undefined : `Answer at least ${MIN_ANSWERS_FOR_SYNTHESIS} questions to synthesize`}
                      onClick={() => void handleGenerate()}
                    >
                      {flow.synthesisLoading ? 'Generating…' : 'Generate profile'}
                    </button>
                  )}
                  <span style={styles.hint}>{flow.answeredCount}/{questions.length} answered · saved as you type</span>
                </>
              }
            >
              <textarea
                aria-label={question.text}
                placeholder="Answer in your own voice…"
                value={flow.answers[question.id] ?? ''}
                onChange={e => flow.setAnswer(question.id, e.target.value)}
                rows={5}
                style={styles.answerInput}
              />
            </RitualQuestionCard>
          </div>
        </RitualStage>
      )}

      {stage === 'review' && profile && (
        <RitualStage stageKey="review">
          <div style={styles.stack}>
            <p style={styles.prose}>
              Here's the profile the room synthesized from your answers. Approve it, regenerate,
              or refine details later in the Voice drawer.
            </p>
            <div style={styles.reviewBox}>
              <VoiceProfileView profile={profile} />
            </div>
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={handleApprove}>Approve</button>
              <button type="button" style={styles.ghostButton} onClick={() => void handleGenerate()} disabled={flow.synthesisLoading}>
                {flow.synthesisLoading ? 'Generating…' : 'Regenerate'}
              </button>
              <button type="button" style={styles.ghostButton} onClick={() => setStage('assessment')}>Back to questions</button>
            </div>
          </div>
        </RitualStage>
      )}

      {stage === 'done' && (
        <RitualStage stageKey="done">
          <div style={styles.stack}>
            <p style={styles.prose}>
              Your Voice Profile is complete. Every persona in the room reads it before responding —
              edit it any time from the Voice button.
            </p>
            <div style={styles.actionRow}>
              <button type="button" style={styles.primaryButton} onClick={onExit}>Enter the studio</button>
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
  reviewBox: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 16,
    background: 'var(--surface-1, var(--surface))',
    maxHeight: '52vh',
    overflowY: 'auto',
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
}
