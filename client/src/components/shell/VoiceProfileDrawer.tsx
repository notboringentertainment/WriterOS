import React, { useEffect, useState } from 'react'
import type { VoiceProfileDocument, VoiceProfileState } from '@shared/voiceProfile'
import {
  clearVoiceProfileState,
  saveVoiceProfileState,
} from '../../lib/voiceProfile'
import {
  VOICE_PROFILE_ASSESSMENT_SECTIONS,
} from '../../lib/voiceProfileAssessment'
import { useVoiceProfileFlow } from '../../lib/useVoiceProfileFlow'

interface VoiceProfileDrawerProps {
  open: boolean
  onClose: () => void
  /** Opens the full-bleed Voice Profile ritual (closing the drawer first). */
  onOpenRitual?: () => void
}

type DrawerMode = 'view' | 'edit' | 'assessment' | 'review'

type EditDraft = {
  displayName: string
  archetype: string
  coreStatement: string
  creativeNorthStars: string
  dnaPrinciples: string
  dnaThemes: string
  dnaNotes: string
  influenceWriters: string
  influenceDirectors: string
  influenceFilms: string
  influenceScenes: string
  influenceNotes: string
  characterDrawnTo: string
  characterRejects: string
  characterNotes: string
  dialogueRules: string
  dialogueInstincts: string
  dialogueAvoidances: string
  visualInstincts: string
  visualNotes: string
  processFlowing: string
  processStuck: string
  processSupport: string
  strengths: string
  growthEdges: string
  collabAlways: string
  collabNever: string
  collabFeedback: string
  alexNotes: string
}

function join(values: string[]): string {
  return values.join('\n')
}

function split(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

function profileToEditDraft(profile: VoiceProfileDocument): EditDraft {
  return {
    displayName: profile.displayName ?? '',
    archetype: profile.archetype,
    coreStatement: profile.coreStatement,
    creativeNorthStars: join(profile.creativeNorthStars),
    dnaPrinciples: join(profile.storytellingDNA.principles),
    dnaThemes: join(profile.storytellingDNA.recurringThemes),
    dnaNotes: profile.storytellingDNA.notes,
    influenceWriters: join(profile.influences.writers),
    influenceDirectors: join(profile.influences.directors),
    influenceFilms: join(profile.influences.filmsAndShows),
    influenceScenes: join(profile.influences.scenesAndLines),
    influenceNotes: profile.influences.notes,
    characterDrawnTo: join(profile.characterInstincts.drawnTo),
    characterRejects: join(profile.characterInstincts.rejects),
    characterNotes: profile.characterInstincts.notes,
    dialogueRules: join(profile.dialogue.rules),
    dialogueInstincts: profile.dialogue.instinctsByMode,
    dialogueAvoidances: join(profile.dialogue.avoidances),
    visualInstincts: join(profile.visualLanguage.instincts),
    visualNotes: profile.visualLanguage.notes,
    processFlowing: profile.process.whenFlowing,
    processStuck: join(profile.process.stuckPatterns),
    processSupport: join(profile.process.supportNeeds),
    strengths: join(profile.strengths),
    growthEdges: join(profile.growthEdges),
    collabAlways: join(profile.collaborationPreferences.always),
    collabNever: join(profile.collaborationPreferences.never),
    collabFeedback: profile.collaborationPreferences.feedbackStyle,
    alexNotes: join(profile.alexCoachingNotes),
  }
}

function editDraftToProfile(draft: EditDraft, existing: VoiceProfileDocument): VoiceProfileDocument {
  return {
    ...existing,
    displayName: draft.displayName.trim() || undefined,
    archetype: draft.archetype.trim(),
    coreStatement: draft.coreStatement.trim(),
    creativeNorthStars: split(draft.creativeNorthStars),
    storytellingDNA: {
      principles: split(draft.dnaPrinciples),
      recurringThemes: split(draft.dnaThemes),
      notes: draft.dnaNotes.trim(),
    },
    influences: {
      writers: split(draft.influenceWriters),
      directors: split(draft.influenceDirectors),
      filmsAndShows: split(draft.influenceFilms),
      scenesAndLines: split(draft.influenceScenes),
      notes: draft.influenceNotes.trim(),
    },
    characterInstincts: {
      drawnTo: split(draft.characterDrawnTo),
      rejects: split(draft.characterRejects),
      notes: draft.characterNotes.trim(),
    },
    dialogue: {
      rules: split(draft.dialogueRules),
      instinctsByMode: draft.dialogueInstincts.trim(),
      avoidances: split(draft.dialogueAvoidances),
    },
    visualLanguage: {
      instincts: split(draft.visualInstincts),
      notes: draft.visualNotes.trim(),
    },
    process: {
      whenFlowing: draft.processFlowing.trim(),
      stuckPatterns: split(draft.processStuck),
      supportNeeds: split(draft.processSupport),
    },
    strengths: split(draft.strengths),
    growthEdges: split(draft.growthEdges),
    collaborationPreferences: {
      always: split(draft.collabAlways),
      never: split(draft.collabNever),
      feedbackStyle: draft.collabFeedback.trim(),
    },
    alexCoachingNotes: split(draft.alexNotes),
    updatedAt: new Date().toISOString(),
  }
}

export function VoiceProfileDrawer({ open, onClose, onOpenRitual }: VoiceProfileDrawerProps) {
  const flow = useVoiceProfileFlow()
  const [mode, setMode] = useState<DrawerMode>('view')
  const [editDraft, setEditDraft] = useState<EditDraft | undefined>(undefined)
  const [assessmentSaved, setAssessmentSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const [clearPending, setClearPending] = useState(false)
  const { reload } = flow

  useEffect(() => {
    if (!open) return
    const loadedState = reload()
    setMode(
      loadedState && !loadedState.profile && loadedState.status === 'draft_answers' ? 'assessment'
        : loadedState?.status === 'draft_profile' ? 'review'
        : 'view'
    )
    setEditDraft(undefined)
    setAssessmentSaved(false)
    setSaveError(undefined)
    setClearPending(false)
  }, [open, reload])

  if (!open) return null

  const profileState = flow.profileState
  const assessmentAnswers = flow.answers
  const synthesisLoading = flow.synthesisLoading
  const synthesisError = flow.synthesisError
  const profile = profileState?.profile
  const status = profileState?.status ?? 'not_started'
  const answeredCount = flow.answeredCount

  function handleStartEdit() {
    if (!profile) return
    setEditDraft(profileToEditDraft(profile))
    setSaveError(undefined)
    setClearPending(false)
    setMode('edit')
  }

  function handleCancelEdit() {
    setEditDraft(undefined)
    setSaveError(undefined)
    setMode(profileState?.status === 'draft_profile' ? 'review' : 'view')
  }

  function handleStartAssessment() {
    setAssessmentSaved(false)
    setClearPending(false)
    setMode('assessment')
  }

  function handleAssessmentAnswer(questionId: string, value: string) {
    flow.setAnswer(questionId, value)
    setAssessmentSaved(true)
  }

  function handleSaveAssessment() {
    flow.saveDraftAnswers()
    setAssessmentSaved(true)
  }

  function handleSave() {
    if (!editDraft || !profileState?.profile) return
    if (!editDraft.archetype.trim() || !editDraft.coreStatement.trim()) {
      setSaveError('Archetype and core statement are required.')
      return
    }

    const updatedProfile = editDraftToProfile(editDraft, profileState.profile)
    const updatedState: VoiceProfileState = {
      ...profileState,
      status: 'complete',
      profile: updatedProfile,
      updatedAt: new Date().toISOString(),
    }
    saveVoiceProfileState(updatedState)
    flow.applyState(updatedState)
    setEditDraft(undefined)
    setSaveError(undefined)
    setMode('view')
  }

  function handleClear() {
    if (!clearPending) {
      setClearPending(true)
      return
    }
    clearVoiceProfileState()
    flow.applyState(undefined)
    setAssessmentSaved(false)
    setClearPending(false)
    setMode('view')
  }

  async function handleGenerateProfile() {
    if (await flow.generateProfile()) {
      setMode('review')
    }
  }

  function handleApprove() {
    if (!profileState?.profile) return
    flow.approveProfile()
    setMode('view')
  }

  return (
    <>
      <div aria-hidden="true" style={styles.backdrop} onClick={onClose} />
      <aside aria-label="Voice Profile" style={styles.drawer}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.drawerTitle}>Voice Profile</span>
            <StatusBadge status={status} />
          </div>
          <button type="button" aria-label="Close Voice Profile" style={styles.closeButton} onClick={onClose}>
            X
          </button>
        </div>

        <div style={styles.body}>
          {mode === 'assessment' ? (
            <AssessmentMode answers={assessmentAnswers} onAnswer={handleAssessmentAnswer} />
          ) : mode === 'edit' && editDraft ? (
            <EditMode draft={editDraft} onChange={setEditDraft} error={saveError} />
          ) : profile ? (
            <ViewMode profile={profile} />
          ) : (
            <EmptyState status={status} answeredCount={answeredCount} />
          )}
        </div>

        {mode === 'view' && profile && status === 'complete' && (
          <div style={styles.footer}>
            <button type="button" style={styles.editButton} onClick={handleStartEdit}>
              Edit
            </button>
            <button
              type="button"
              style={clearPending ? styles.clearButtonConfirm : styles.clearButton}
              onClick={handleClear}
            >
              {clearPending ? 'Confirm clear' : 'Clear profile'}
            </button>
            {clearPending && (
              <button type="button" style={styles.cancelButton} onClick={() => setClearPending(false)}>
                Cancel
              </button>
            )}
          </div>
        )}

        {mode === 'review' && profile && (
          <div style={styles.footer}>
            <button type="button" style={styles.editButton} onClick={handleApprove}>
              Approve
            </button>
            <button type="button" style={styles.cancelButton} onClick={handleStartEdit}>
              Edit
            </button>
            <button
              type="button"
              style={styles.cancelButton}
              onClick={handleGenerateProfile}
              disabled={synthesisLoading}
            >
              {synthesisLoading ? 'Generating…' : 'Regenerate'}
            </button>
            {synthesisError && <span style={styles.footerHint}>{synthesisError}</span>}
          </div>
        )}

        {mode === 'edit' && profile && (
          <div style={styles.footer}>
            <button type="button" style={styles.editButton} onClick={handleSave}>
              Save
            </button>
            <button type="button" style={styles.cancelButton} onClick={handleCancelEdit}>
              Cancel
            </button>
          </div>
        )}

        {mode === 'view' && !profile && (
          <div style={styles.footer}>
            <button type="button" style={styles.editButton} onClick={handleStartAssessment}>
              {answeredCount > 0 ? 'Continue assessment' : 'Start assessment'}
            </button>
            {onOpenRitual && (
              <button
                type="button"
                style={styles.cancelButton}
                onClick={() => {
                  onClose()
                  onOpenRitual()
                }}
              >
                Begin the full ritual
              </button>
            )}
            <span style={styles.footerHint}>{answeredCount}/20 answered</span>
          </div>
        )}

        {mode === 'assessment' && (
          <div style={styles.footer}>
            <button type="button" style={styles.editButton} onClick={handleSaveAssessment}>
              Save answers
            </button>
            {answeredCount >= 10 && (
              <button
                type="button"
                style={styles.editButton}
                onClick={handleGenerateProfile}
                disabled={synthesisLoading}
              >
                {synthesisLoading ? 'Generating…' : 'Generate profile'}
              </button>
            )}
            <button type="button" style={styles.cancelButton} onClick={() => setMode(profile ? 'review' : 'view')}>
              Back
            </button>
            <span style={styles.footerHint}>
              {synthesisError ?? (assessmentSaved ? `Saved - ${answeredCount}/20 answered` : `${answeredCount}/20 answered`)}
            </span>
          </div>
        )}
      </aside>
    </>
  )
}

function StatusBadge({ status }: { status: VoiceProfileState['status'] }) {
  const label: Record<VoiceProfileState['status'], string> = {
    not_started: 'No profile',
    skipped: 'Skipped',
    draft_answers: 'In progress',
    draft_profile: 'Draft',
    complete: 'Complete',
  }
  const color: Record<VoiceProfileState['status'], string> = {
    not_started: 'var(--fg-subtle)',
    skipped: 'var(--fg-subtle)',
    draft_answers: 'var(--fg-muted)',
    draft_profile: 'var(--fg-muted)',
    complete: 'var(--primary)',
  }
  return <span style={{ ...styles.badge, color: color[status] }}>{label[status]}</span>
}

function EmptyState({ status, answeredCount }: { status: VoiceProfileState['status']; answeredCount: number }) {
  const title =
    status === 'draft_answers' ? 'Assessment in progress'
    : status === 'draft_profile' ? 'Profile draft ready'
    : 'No Voice Profile yet'
  return (
    <div style={styles.emptyState}>
      <p style={styles.emptyTitle}>{title}</p>
      <p style={styles.emptyBody}>
        {answeredCount > 0 ? `${answeredCount} answers saved.` : 'Start with the questions that reveal your creative wiring.'}
      </p>
    </div>
  )
}

function AssessmentMode({
  answers,
  onAnswer,
}: {
  answers: Record<string, string>
  onAnswer: (questionId: string, value: string) => void
}) {
  return (
    <div style={assessmentStyles.root}>
      {VOICE_PROFILE_ASSESSMENT_SECTIONS.map(section => (
        <section key={section.id} style={assessmentStyles.section}>
          <h3 style={assessmentStyles.sectionTitle}>{section.title}</h3>
          {section.questions.map(question => (
            <div key={question.id} style={assessmentStyles.question}>
              <label htmlFor={`voice-profile-answer-${question.id}`} style={assessmentStyles.questionLabel}>
                <span style={assessmentStyles.questionNumber}>{question.id.toUpperCase()}</span>
                {question.text}
              </label>
              <textarea
                id={`voice-profile-answer-${question.id}`}
                rows={4}
                value={answers[question.id] ?? ''}
                onChange={event => onAnswer(question.id, event.target.value)}
                style={assessmentStyles.textarea}
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export function VoiceProfileView({ profile }: { profile: VoiceProfileDocument }) {
  return <ViewMode profile={profile} />
}

function ViewMode({ profile }: { profile: VoiceProfileDocument }) {
  return (
    <div style={styles.viewRoot}>
      {profile.displayName && (
        <ProfileSection label="Writer">
          <ProfileText>{profile.displayName}</ProfileText>
        </ProfileSection>
      )}

      <ProfileSection label="Archetype">
        <ProfileText>{profile.archetype}</ProfileText>
      </ProfileSection>

      <ProfileSection label="Core Statement">
        <ProfileText>{profile.coreStatement}</ProfileText>
      </ProfileSection>

      <ProfileSection label="Creative North Stars">
        <ProfileList items={profile.creativeNorthStars} />
      </ProfileSection>

      <ProfileSection label="Storytelling DNA">
        <ProfileSubLabel>Principles</ProfileSubLabel>
        <ProfileList items={profile.storytellingDNA.principles} />
        <ProfileSubLabel>Recurring Themes</ProfileSubLabel>
        <ProfileList items={profile.storytellingDNA.recurringThemes} />
        {profile.storytellingDNA.notes && <ProfileText muted>{profile.storytellingDNA.notes}</ProfileText>}
      </ProfileSection>

      <ProfileSection label="Influences">
        <ProfileSubLabel>Writers</ProfileSubLabel>
        <ProfileList items={profile.influences.writers} />
        <ProfileSubLabel>Directors</ProfileSubLabel>
        <ProfileList items={profile.influences.directors} />
        <ProfileSubLabel>Films And Shows</ProfileSubLabel>
        <ProfileList items={profile.influences.filmsAndShows} />
        <ProfileSubLabel>Scenes And Lines</ProfileSubLabel>
        <ProfileList items={profile.influences.scenesAndLines} />
        {profile.influences.notes && <ProfileText muted>{profile.influences.notes}</ProfileText>}
      </ProfileSection>

      <ProfileSection label="Character Instincts">
        <ProfileSubLabel>Drawn To</ProfileSubLabel>
        <ProfileList items={profile.characterInstincts.drawnTo} />
        <ProfileSubLabel>Rejects</ProfileSubLabel>
        <ProfileList items={profile.characterInstincts.rejects} />
        {profile.characterInstincts.notes && <ProfileText muted>{profile.characterInstincts.notes}</ProfileText>}
      </ProfileSection>

      <ProfileSection label="Dialogue">
        <ProfileSubLabel>Rules</ProfileSubLabel>
        <ProfileList items={profile.dialogue.rules} />
        {profile.dialogue.instinctsByMode && <ProfileText muted>{profile.dialogue.instinctsByMode}</ProfileText>}
        <ProfileSubLabel>Avoidances</ProfileSubLabel>
        <ProfileList items={profile.dialogue.avoidances} />
      </ProfileSection>

      <ProfileSection label="Visual Language">
        <ProfileList items={profile.visualLanguage.instincts} />
        {profile.visualLanguage.notes && <ProfileText muted>{profile.visualLanguage.notes}</ProfileText>}
      </ProfileSection>

      <ProfileSection label="Process">
        {profile.process.whenFlowing && <ProfileText>{profile.process.whenFlowing}</ProfileText>}
        <ProfileSubLabel>Stuck Patterns</ProfileSubLabel>
        <ProfileList items={profile.process.stuckPatterns} />
        <ProfileSubLabel>Support Needs</ProfileSubLabel>
        <ProfileList items={profile.process.supportNeeds} />
      </ProfileSection>

      <ProfileSection label="Strengths">
        <ProfileList items={profile.strengths} />
      </ProfileSection>

      <ProfileSection label="Growth Edges">
        <ProfileList items={profile.growthEdges} />
      </ProfileSection>

      <ProfileSection label="Collaboration">
        <ProfileSubLabel>Always</ProfileSubLabel>
        <ProfileList items={profile.collaborationPreferences.always} />
        <ProfileSubLabel>Never</ProfileSubLabel>
        <ProfileList items={profile.collaborationPreferences.never} />
        {profile.collaborationPreferences.feedbackStyle && (
          <ProfileText muted>{profile.collaborationPreferences.feedbackStyle}</ProfileText>
        )}
      </ProfileSection>

      <ProfileSection label="Alex Coaching Notes">
        <ProfileList items={profile.alexCoachingNotes} />
      </ProfileSection>
    </div>
  )
}

function EditMode({
  draft,
  onChange,
  error,
}: {
  draft: EditDraft
  onChange: (draft: EditDraft) => void
  error: string | undefined
}) {
  function field(key: keyof EditDraft, label: string, rows = 2) {
    return (
      <div style={editStyles.field}>
        <label style={editStyles.label} htmlFor={`voice-profile-${key}`}>{label}</label>
        <textarea
          id={`voice-profile-${key}`}
          rows={rows}
          value={draft[key]}
          onChange={event => onChange({ ...draft, [key]: event.target.value })}
          style={editStyles.textarea}
        />
      </div>
    )
  }

  return (
    <div style={editStyles.root}>
      {error && <p style={editStyles.error}>{error}</p>}

      <EditSection title="Identity">
        {field('displayName', 'Display name', 1)}
        {field('archetype', 'Archetype', 3)}
        {field('coreStatement', 'Core statement', 5)}
        {field('creativeNorthStars', 'Creative north stars, one per line', 5)}
      </EditSection>

      <EditSection title="Storytelling DNA">
        {field('dnaPrinciples', 'Principles, one per line', 6)}
        {field('dnaThemes', 'Recurring themes, one per line', 4)}
        {field('dnaNotes', 'Notes', 3)}
      </EditSection>

      <EditSection title="Influences">
        {field('influenceWriters', 'Writers, one per line', 4)}
        {field('influenceDirectors', 'Directors, one per line', 4)}
        {field('influenceFilms', 'Films and shows, one per line', 4)}
        {field('influenceScenes', 'Scenes and lines, one per line', 5)}
        {field('influenceNotes', 'Notes', 3)}
      </EditSection>

      <EditSection title="Character Instincts">
        {field('characterDrawnTo', 'Drawn to, one per line', 5)}
        {field('characterRejects', 'Rejects, one per line', 5)}
        {field('characterNotes', 'Notes', 3)}
      </EditSection>

      <EditSection title="Dialogue">
        {field('dialogueRules', 'Rules, one per line', 5)}
        {field('dialogueInstincts', 'Instincts by mode', 3)}
        {field('dialogueAvoidances', 'Avoidances, one per line', 4)}
      </EditSection>

      <EditSection title="Visual Language">
        {field('visualInstincts', 'Instincts, one per line', 5)}
        {field('visualNotes', 'Notes', 3)}
      </EditSection>

      <EditSection title="Process">
        {field('processFlowing', 'When flowing', 3)}
        {field('processStuck', 'Stuck patterns, one per line', 4)}
        {field('processSupport', 'Support needs, one per line', 4)}
      </EditSection>

      <EditSection title="Strengths And Growth">
        {field('strengths', 'Strengths, one per line', 5)}
        {field('growthEdges', 'Growth edges, one per line', 4)}
      </EditSection>

      <EditSection title="Collaboration">
        {field('collabAlways', 'Always, one per line', 5)}
        {field('collabNever', 'Never, one per line', 5)}
        {field('collabFeedback', 'Feedback style', 3)}
      </EditSection>

      <EditSection title="Alex Coaching Notes">
        {field('alexNotes', 'Notes, one per line', 4)}
      </EditSection>
    </div>
  )
}

function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionLabel}>{label}</h3>
      {children}
    </section>
  )
}

function ProfileSubLabel({ children }: { children: React.ReactNode }) {
  return <p style={styles.subLabel}>{children}</p>
}

function ProfileText({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <p style={{ ...styles.profileText, ...(muted ? { color: 'var(--fg-muted)' } : {}) }}>{children}</p>
}

function ProfileList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul style={styles.profileList}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`} style={styles.profileListItem}>{item}</li>
      ))}
    </ul>
  )
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={editStyles.section}>
      <h3 style={editStyles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 19,
    background: 'rgba(0, 0, 0, 0.04)',
  },
  drawer: {
    position: 'fixed',
    top: 'var(--topbar-height)',
    right: 0,
    bottom: 0,
    width: 'min(440px, calc(100vw - 24px))',
    background: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '-16px 0 36px rgba(0, 0, 0, 0.18)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  drawerTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    fontSize: 14,
    color: 'var(--fg)',
    letterSpacing: 0,
  },
  badge: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--primary)',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 4,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '3px 7px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  footer: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  footerHint: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    lineHeight: 1.5,
  },
  editButton: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '6px 14px',
    cursor: 'pointer',
  },
  clearButton: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '6px 14px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  clearButtonConfirm: {
    background: 'none',
    border: '1px solid var(--error, #c0392b)',
    borderRadius: 6,
    color: 'var(--error, #c0392b)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '6px 14px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  cancelButton: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '6px 10px',
    cursor: 'pointer',
  },
  emptyState: {
    padding: '32px 0',
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--fg)',
    margin: '0 0 10px',
  },
  emptyBody: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.6,
    maxWidth: 300,
    margin: '0 auto',
  },
  viewRoot: {
    display: 'flex',
    flexDirection: 'column',
  },
  section: {
    borderBottom: '1px solid var(--border)',
    paddingBottom: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    margin: '0 0 8px',
  },
  subLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.02em',
    margin: '10px 0 4px',
  },
  profileText: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.55,
    margin: '4px 0',
  },
  profileList: {
    margin: 0,
    paddingLeft: 16,
  },
  profileListItem: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.55,
    marginBottom: 3,
  },
}

const editStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
  },
  section: {
    borderBottom: '1px solid var(--border)',
    paddingBottom: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    margin: '0 0 10px',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    marginBottom: 4,
    letterSpacing: 0,
  },
  textarea: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '7px 8px',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },
  error: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    color: 'var(--error, #c0392b)',
    margin: '0 0 12px',
  },
}

const assessmentStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
  },
  section: {
    borderBottom: '1px solid var(--border)',
    paddingBottom: 16,
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--fg-subtle)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    margin: '0 0 12px',
  },
  question: {
    marginBottom: 14,
  },
  questionLabel: {
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.45,
    marginBottom: 6,
  },
  questionNumber: {
    display: 'inline-block',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    marginRight: 8,
  },
  textarea: {
    width: '100%',
    background: 'var(--surface-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    lineHeight: 1.5,
    padding: '8px 9px',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },
}
