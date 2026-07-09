// Writers' Room — the live channel (Phase 1 minimal UI, §12 subset).
// Group-chat feed with per-agent accent colors, real streaming bubbles fed by
// speak deltas over SSE, a writer send box, and proposal adopt/reject cards.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PERSONAS } from '@shared/personas'
import {
  answerInterviewQuestion,
  bankInterview,
  exportInterview,
  fetchInterviewBankPreview,
  fetchInterviewStatus,
  fetchRoomMessages,
  fetchRoomProposals,
  openRoomStream,
  pauseInterview,
  postRoomEvent,
  resolveRoomProposal,
  resumeInterview,
  sendRoomMessage,
  skipInterviewQuestion,
  startInterview,
  syncStoryLocksBlock,
  wrapInterview,
  type InterviewBankPreview,
  type InterviewQuestion,
  type InterviewSession,
  type InterviewStatus,
  type RoomCharacterBrief,
  type RoomMessage,
  type RoomProposal,
  type RoomStreamEvent,
} from '../../lib/roomApi'
import { canApplyProposal } from '../../lib/roomProposals'

export interface RoomChannelProps {
  projectId: string
  characterNames: string[]
  characterBriefs?: RoomCharacterBrief[]
  locksText: string
  // Applies the proposal to the local document. Returns false when the field
  // path can't be applied (the proposal is left pending).
  onAdoptProposal: (proposal: RoomProposal) => boolean
}

interface StreamingTurn {
  agentId: string
  content: string // empty until the first speak delta = "thinking"
}

function personaLabel(author: string): string {
  if (author === 'writer') return 'You'
  const persona = PERSONAS[author]
  return persona?.displayName ?? persona?.name ?? author
}

function personaColor(author: string): string {
  const accent = PERSONAS[author]?.accentColor
  return accent ? `var(${accent})` : 'var(--fg-muted)'
}

function emptyInterviewStatus(): InterviewStatus {
  return { activeSession: null, hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null }
}

export function RoomChannel({ projectId, characterNames, characterBriefs = [], locksText, onAdoptProposal }: RoomChannelProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [proposals, setProposals] = useState<RoomProposal[]>([])
  const [streaming, setStreaming] = useState<Map<string, StreamingTurn>>(new Map())
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [interviewStatus, setInterviewStatus] = useState<InterviewStatus>(emptyInterviewStatus)
  const [interviewSeed, setInterviewSeed] = useState('')
  const [interviewAnswer, setInterviewAnswer] = useState('')
  const [bankPreview, setBankPreview] = useState<InterviewBankPreview | null>(null)
  const [exportMarkdown, setExportMarkdown] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)

  const pendingProposals = useMemo(
    () => proposals.filter((p) => p.status === 'pending' && p.kind !== 'interview_answer'),
    [proposals],
  )

  const handleStreamEvent = useCallback((event: RoomStreamEvent) => {
    switch (event.type) {
      case 'turn_started':
        setStreaming((prev) => new Map(prev).set(event.turnId, { agentId: event.agentId, content: '' }))
        break
      case 'speak_delta':
        setStreaming((prev) => new Map(prev).set(event.turnId, { agentId: event.agentId, content: event.content }))
        break
      case 'turn_ended':
        setStreaming((prev) => {
          const next = new Map(prev)
          next.delete(event.turnId)
          return next
        })
        break
      case 'message':
        setMessages((prev) => (prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message]))
        if (event.turnId) {
          setStreaming((prev) => {
            const next = new Map(prev)
            next.delete(event.turnId!)
            return next
          })
        }
        break
      case 'proposal':
        setProposals((prev) => {
          const existing = prev.findIndex((p) => p.id === event.proposal.id)
          if (existing === -1) return [...prev, event.proposal]
          const next = [...prev]
          next[existing] = event.proposal
          return next
        })
        break
    }
  }, [])

  // Connect: load history, open the stream, announce the session.
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setProposals([])
    setStreaming(new Map())
    setError(null)

    Promise.all([fetchRoomMessages(projectId), fetchRoomProposals(projectId, 'pending')])
      .then(([msgs, props]) => {
        if (cancelled) return
        setMessages(msgs)
        setProposals(props)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Room unavailable')
      })

    const close = openRoomStream(projectId, handleStreamEvent)
    void postRoomEvent(projectId, 'session_opened', {})

    return () => {
      cancelled = true
      close()
    }
  }, [projectId, handleStreamEvent])

  useEffect(() => {
    let cancelled = false
    setInterviewStatus(emptyInterviewStatus())
    setBankPreview(null)
    setExportMarkdown('')
    fetchInterviewStatus(projectId)
      .then(status => {
        if (!cancelled) setInterviewStatus(status)
      })
      .catch(() => {
        // First Meeting is an explicit enhancement; room chat remains usable if unavailable.
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Writer-only sync of the story_locks shared block (§10).
  useEffect(() => {
    void syncStoryLocksBlock(projectId, locksText)
  }, [projectId, locksText])

  // Keep the feed pinned to the latest activity.
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages.length, streaming, pendingProposals.length])

  async function handleSend() {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    try {
      await sendRoomMessage(projectId, text, characterNames, characterBriefs)
      // The message itself arrives via the SSE broadcast.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
      setInputText(text)
    }
  }

  async function handleResolve(proposal: RoomProposal, status: 'adopted' | 'rejected') {
    // Server resolve FIRST — the document is never written unless the server
    // accepted the resolution (a stale/double click 409s and changes nothing).
    let resolved: RoomProposal
    try {
      resolved = await resolveRoomProposal(projectId, proposal.id, status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolve failed')
      return
    }
    setProposals((prev) => prev.map((p) => (p.id === proposal.id ? resolved : p)))

    if (status === 'adopted') {
      const applied = onAdoptProposal(resolved)
      if (!applied) {
        // Resolved as adopted server-side but the path couldn't be applied
        // locally (should be prevented by the canApplyProposal button gate).
        setError(`Adopted, but ${resolved.field_path} couldn't be applied automatically — copy the value into the field by hand.`)
      }
    }
  }

  function setInterviewResult(result: { session: InterviewSession; currentQuestion?: InterviewQuestion | null }) {
    setInterviewStatus(prev => ({ ...prev, activeSession: result.session, currentQuestion: result.currentQuestion ?? prev.currentQuestion }))
  }

  async function handleStartInterview() {
    const seedText = interviewSeed.trim()
    if (!seedText) {
      setError('Paste or type a seed before starting First Meeting.')
      return
    }
    try {
      const result = await startInterview(projectId, { mode: 'full', seedText })
      setInterviewStatus(prev => ({ ...prev, activeSession: result.session, currentQuestion: result.currentQuestion }))
      setInterviewSeed('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'First Meeting start failed')
    }
  }

  async function handleAnswerInterview(rejectMapping = false) {
    const session = interviewStatus.activeSession
    const answerText = interviewAnswer.trim()
    if (!session || !answerText) return
    try {
      const result = await answerInterviewQuestion(projectId, session.id, { answerText, origin: 'seed', rejectMapping })
      setInterviewResult(result)
      setInterviewAnswer('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'First Meeting answer failed')
    }
  }

  async function handleSkipInterview() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      setInterviewResult(await skipInterviewQuestion(projectId, session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'First Meeting skip failed')
    }
  }

  async function handlePauseInterview() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      const result = await pauseInterview(projectId, session.id)
      setInterviewStatus(prev => ({ ...prev, activeSession: result.session }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'First Meeting pause failed')
    }
  }

  async function handleResumeInterview() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      const result = await resumeInterview(projectId, session.id)
      setInterviewStatus(prev => ({ ...prev, activeSession: result.session }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'First Meeting resume failed')
    }
  }

  async function handleWrapInterview() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      const result = await wrapInterview(projectId, session.id)
      setInterviewStatus(prev => ({ ...prev, activeSession: result.session, currentQuestion: null }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'First Meeting wrap failed')
    }
  }

  async function handlePreviewBank() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      setBankPreview(await fetchInterviewBankPreview(projectId, session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bank preview failed')
    }
  }

  async function handleBankInterview() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      const result = await bankInterview(projectId, session.id)
      setInterviewStatus(prev => ({ ...prev, activeSession: result.session, hasBankedSeed: true, actionLabel: 'New interview round' }))
      setBankPreview(result.preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bank failed')
    }
  }

  async function handleExportInterview() {
    const session = interviewStatus.activeSession
    if (!session) return
    try {
      const result = await exportInterview(projectId, session.id)
      setInterviewStatus(prev => ({ ...prev, activeSession: result.session }))
      setExportMarkdown(result.markdown)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const canSend = inputText.trim().length > 0

  return (
    <div style={styles.root} data-testid="room-channel">
      <div style={styles.header}>
        <span style={styles.title}>The Room</span>
        <span style={styles.subtitle}>Morgan · Casey — live</span>
      </div>

      <section style={styles.interviewPanel} data-testid="first-meeting-panel">
        <div style={styles.interviewHeader}>
          <div>
            <div style={styles.interviewTitle}>{interviewStatus.actionLabel}</div>
            <div style={styles.interviewMeta}>Explicit start · audit-driven · never auto-started</div>
          </div>
          {!interviewStatus.activeSession && <span style={styles.interviewMeta}>Skip is simply: do nothing.</span>}
        </div>

        {!interviewStatus.activeSession && (
          <div style={styles.interviewStack}>
            <textarea
              aria-label="First Meeting seed"
              placeholder="Paste the seed or one-sentence idea…"
              value={interviewSeed}
              onChange={e => setInterviewSeed(e.target.value)}
              rows={3}
              style={styles.input}
            />
            <button type="button" style={styles.adoptButton} onClick={() => void handleStartInterview()}>
              Start First Meeting
            </button>
          </div>
        )}

        {interviewStatus.activeSession?.state === 'paused' && (
          <div style={styles.interviewStack}>
            <div style={styles.interviewMeta}>Paused at {interviewStatus.activeSession.cursor.question_id ?? 'readback'}.</div>
            <button type="button" style={styles.adoptButton} onClick={() => void handleResumeInterview()}>Resume First Meeting</button>
          </div>
        )}

        {interviewStatus.activeSession?.state === 'interviewing' && interviewStatus.currentQuestion && (
          <div style={styles.interviewStack}>
            <div style={styles.interviewMeta}>{personaLabel(interviewStatus.currentQuestion.lane)} · {interviewStatus.currentQuestion.trigger}</div>
            <div style={styles.body}>{interviewStatus.currentQuestion.question}</div>
            <textarea
              aria-label="First Meeting answer"
              placeholder="Answer in story terms…"
              value={interviewAnswer}
              onChange={e => setInterviewAnswer(e.target.value)}
              rows={3}
              style={styles.input}
            />
            <div style={styles.proposalActions}>
              <button type="button" style={styles.adoptButton} onClick={() => void handleAnswerInterview(false)}>Confirm mapping</button>
              <button type="button" style={styles.rejectButton} onClick={() => void handleAnswerInterview(true)}>Reject mapping / keep as seed color</button>
              <button type="button" style={styles.rejectButton} onClick={() => void handleSkipInterview()}>Skip / delegate</button>
              <button type="button" style={styles.rejectButton} onClick={() => void handlePauseInterview()}>Pause</button>
              <button type="button" style={styles.rejectButton} onClick={() => void handleWrapInterview()}>Wrap it up</button>
            </div>
          </div>
        )}

        {interviewStatus.activeSession?.state === 'readback' && (
          <div style={styles.interviewStack}>
            <div style={styles.body}>Readback ready: review locks, leanings, and open questions before banking. No memory blocks are written until Bank this round.</div>
            <div style={styles.proposalActions}>
              <button type="button" style={styles.rejectButton} onClick={() => void handlePreviewBank()}>Preview banking</button>
              <button type="button" style={styles.adoptButton} onClick={() => void handleBankInterview()}>Bank this round</button>
              <button type="button" style={styles.rejectButton} onClick={() => void handlePauseInterview()}>Pause</button>
            </div>
            {bankPreview && (
              <pre style={styles.previewBox}>{bankPreview.conceptSeedAppend}</pre>
            )}
          </div>
        )}

        {interviewStatus.activeSession?.state === 'banked' && (
          <div style={styles.interviewStack}>
            <div style={styles.body}>This First Meeting round is banked. Future rounds append; they do not edit this one.</div>
            <button type="button" style={styles.adoptButton} onClick={() => void handleExportInterview()}>Export to PitchStudio</button>
          </div>
        )}

        {interviewStatus.activeSession?.state === 'exported' && (
          <div style={styles.interviewStack}>
            <div style={styles.body}>Export prepared for PitchStudio.</div>
            {exportMarkdown && <pre style={styles.previewBox}>{exportMarkdown}</pre>}
          </div>
        )}
      </section>

      <div ref={feedRef} style={styles.feed}>
        {error && <p style={styles.error}>{error}</p>}
        {messages.length === 0 && streaming.size === 0 && !error && (
          <p style={styles.empty}>The room is quiet. Say something, or change the work — they're watching it.</p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={styles.message}>
            <span style={{ ...styles.author, color: personaColor(msg.author) }}>
              {personaLabel(msg.author)}
              {msg.kind !== 'say' && <span style={styles.kindTag}> {msg.kind === 'system' ? '·' : '· proposal'}</span>}
            </span>
            <div style={msg.kind === 'say' ? styles.body : styles.bodyMeta}>{msg.content}</div>
          </div>
        ))}

        {[...streaming.entries()].map(([turnId, turn]) => (
          <div key={turnId} style={styles.message} data-testid="room-streaming">
            <span style={{ ...styles.author, color: personaColor(turn.agentId) }}>
              {personaLabel(turn.agentId)}
            </span>
            <div style={styles.body}>
              {turn.content || <em style={styles.thinking}>thinking…</em>}
              {turn.content && <span style={styles.cursor}>▋</span>}
            </div>
          </div>
        ))}

        {pendingProposals.map((proposal) => {
          const applicable = canApplyProposal(proposal.surface, proposal.field_path)
          return (
            <div key={proposal.id} style={styles.proposalCard} data-testid="proposal-card">
              <div style={styles.proposalHeader}>
                <span style={{ ...styles.author, color: personaColor(proposal.agent_id) }}>
                  {personaLabel(proposal.agent_id)} proposes
                </span>
                <span style={styles.proposalPath}>
                  {proposal.surface} → {proposal.field_path}
                </span>
              </div>
              <div style={styles.proposalValue}>{proposal.proposed_value}</div>
              <div style={styles.proposalRationale}>{proposal.rationale}</div>
              <div style={styles.proposalActions}>
                <button
                  type="button"
                  style={{ ...styles.adoptButton, ...(applicable ? {} : styles.buttonDisabled) }}
                  disabled={!applicable}
                  title={applicable ? undefined : 'This field path can\'t be applied automatically in Phase 1'}
                  onClick={() => void handleResolve(proposal, 'adopted')}
                >
                  Adopt
                </button>
                <button
                  type="button"
                  style={styles.rejectButton}
                  onClick={() => void handleResolve(proposal, 'rejected')}
                >
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={styles.inputRow}>
        <textarea
          placeholder="Say something to the room…"
          style={styles.input}
          rows={2}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <button
          type="button"
          aria-label="Send message to the room"
          disabled={!canSend}
          onClick={() => void handleSend()}
          style={{ ...styles.sendButton, ...(!canSend ? styles.buttonDisabled : {}) }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '10px 16px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--fg)',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  interviewPanel: {
    borderBottom: '1px solid var(--border)',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: 'var(--surface-1)',
  },
  interviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  interviewTitle: {
    fontFamily: 'var(--font-display)',
    color: 'var(--fg)',
    fontSize: 13,
    fontWeight: 700,
  },
  interviewMeta: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--fg-subtle)',
    fontSize: 10,
  },
  interviewStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  previewBox: {
    maxHeight: 180,
    overflow: 'auto',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 10,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    whiteSpace: 'pre-wrap',
  },
  feed: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  empty: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
  },
  error: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--danger, #d66)',
  },
  message: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  author: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 700,
  },
  kindTag: {
    fontWeight: 400,
    color: 'var(--fg-subtle)',
  },
  body: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
  bodyMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
    lineHeight: 1.5,
  },
  thinking: {
    color: 'var(--fg-subtle)',
    fontSize: 12,
  },
  cursor: {
    opacity: 0.6,
    marginLeft: 1,
  },
  proposalCard: {
    border: '1px solid var(--border)',
    borderLeft: '3px solid var(--wp-amber)',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--surface-2)',
  },
  proposalHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  proposalPath: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  proposalValue: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg)',
    lineHeight: 1.5,
  },
  proposalRationale: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    lineHeight: 1.45,
  },
  proposalActions: {
    display: 'flex',
    gap: 8,
    marginTop: 2,
  },
  adoptButton: {
    padding: '4px 14px',
    borderRadius: 6,
    border: '1px solid var(--wp-amber)',
    background: 'var(--wp-amber)',
    color: '#1a1200',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
  },
  rejectButton: {
    padding: '4px 14px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'none',
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },
  buttonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  inputRow: {
    padding: '8px 12px 12px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  sendButton: {
    height: 38,
    minWidth: 58,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--wp-amber)',
    background: 'var(--wp-amber)',
    color: '#1a1200',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
}
