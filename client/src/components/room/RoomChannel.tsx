// Writers' Room — the live channel (Phase 1 minimal UI, §12 subset).
// Group-chat feed with per-agent accent colors, real streaming bubbles fed by
// speak deltas over SSE, a writer send box, and proposal adopt/reject cards.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PERSONAS } from '@shared/personas'
import {
  fetchRoomMessages,
  fetchRoomProposals,
  openRoomStream,
  postRoomEvent,
  resolveRoomProposal,
  sendRoomMessage,
  syncStoryLocksBlock,
  type RoomCharacterBrief,
  type RoomMessage,
  type RoomProposal,
  type RoomStreamEvent,
} from '../../lib/roomApi'
import { canApplyProposal } from '../../lib/roomProposals'
import { useInterviewSession } from '../../lib/useInterviewSession'

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

export function RoomChannel({ projectId, characterNames, characterBriefs = [], locksText, onAdoptProposal }: RoomChannelProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [proposals, setProposals] = useState<RoomProposal[]>([])
  const [streaming, setStreaming] = useState<Map<string, StreamingTurn>>(new Map())
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const interview = useInterviewSession(projectId)
  const [interviewSeed, setInterviewSeed] = useState('')
  const [interviewAnswer, setInterviewAnswer] = useState('')
  const [interviewOrigin, setInterviewOrigin] = useState<'seed' | 'extrapolated'>('seed')
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

  async function handleStartInterview() {
    const seedText = interviewSeed.trim()
    if (!seedText) {
      setError('Paste or type a seed before starting First Meeting.')
      return
    }
    if (await interview.start({ mode: 'full', seedText })) {
      setInterviewSeed('')
    }
  }

  async function handleAnswerInterview(rejectMapping = false) {
    if (await interview.answer({ answerText: interviewAnswer, origin: interviewOrigin, rejectMapping })) {
      setInterviewAnswer('')
      setInterviewOrigin('seed')
    }
  }

  const canSend = inputText.trim().length > 0
  const interviewStatus = interview.status
  const displayError = error ?? interview.error

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
            <button type="button" style={styles.adoptButton} onClick={() => void interview.resume()}>Resume First Meeting</button>
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
            <select
              aria-label="First Meeting answer origin"
              value={interviewOrigin}
              onChange={e => setInterviewOrigin(e.target.value as 'seed' | 'extrapolated')}
              style={styles.input}
            >
              <option value="seed">Seed</option>
              <option value="extrapolated">Extrapolated</option>
            </select>
            <div style={styles.proposalActions}>
              <button type="button" style={styles.adoptButton} onClick={() => void handleAnswerInterview(false)}>Confirm mapping</button>
              <button type="button" style={styles.rejectButton} onClick={() => void handleAnswerInterview(true)}>Reject mapping / keep as seed color</button>
              <button type="button" style={styles.rejectButton} onClick={() => void interview.skip()}>Skip / delegate</button>
              <button type="button" style={styles.rejectButton} onClick={() => void interview.pause()}>Pause</button>
              <button type="button" style={styles.rejectButton} onClick={() => void interview.wrap()}>Wrap it up</button>
            </div>
          </div>
        )}

        {interviewStatus.activeSession?.state === 'readback' && (
          <div style={styles.interviewStack}>
            <div style={styles.body}>Readback ready: review locks, leanings, and open questions before banking. No memory blocks are written until Bank this round.</div>
            <div style={styles.proposalActions}>
              <button type="button" style={styles.rejectButton} onClick={() => void interview.previewBank()}>Preview banking</button>
              <button type="button" style={styles.adoptButton} onClick={() => void interview.bank()}>Bank this round</button>
              <button type="button" style={styles.rejectButton} onClick={() => void interview.pause()}>Pause</button>
            </div>
            {interview.bankPreview && (
              <pre style={styles.previewBox}>{interview.bankPreview.conceptSeedAppend}</pre>
            )}
          </div>
        )}

        {interviewStatus.activeSession?.state === 'banked' && (
          <div style={styles.interviewStack}>
            <div style={styles.body}>This First Meeting round is banked. Future rounds append; they do not edit this one.</div>
            <button type="button" style={styles.adoptButton} onClick={() => void interview.exportToPitchStudio()}>Export to PitchStudio</button>
          </div>
        )}

        {interviewStatus.activeSession?.state === 'exported' && (
          <div style={styles.interviewStack}>
            <div style={styles.body}>Export prepared for PitchStudio.</div>
            {interview.exportMarkdown && <pre style={styles.previewBox}>{interview.exportMarkdown}</pre>}
          </div>
        )}
      </section>

      <div ref={feedRef} style={styles.feed}>
        {displayError && <p style={styles.error}>{displayError}</p>}
        {messages.length === 0 && streaming.size === 0 && !displayError && (
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
