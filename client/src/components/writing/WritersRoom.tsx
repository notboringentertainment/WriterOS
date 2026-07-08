import React, { useState, useEffect, useRef } from 'react'
import { PERSONAS } from '@shared/personas'
import type { AgentId, ProjectState } from '../../lib/projectState'
import { getDisplayProjectTitle } from '../../lib/projectIdentity'
import { RoomChannel, type RoomChannelProps } from '../room/RoomChannel'

type SpecialistId = 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'
type SelectedId = SpecialistId | 'room'

const SPECIALISTS: SpecialistId[] = ['sam', 'casey', 'oliver', 'maya', 'zoe', 'alex']

interface WritersRoomProps {
  projectState: ProjectState
  onSendToSpecialist: (specialistId: SpecialistId, text: string) => void
  onClearTranscript?: (specialistId: AgentId) => void
  mode?: 'full' | 'dock'
  // Live room channel (Phase 1 spike). Absent = entry hidden, 1:1 chats only.
  roomProps?: RoomChannelProps
}

function getContextSummary(id: SpecialistId, state: ProjectState): string {
  switch (id) {
    case 'oliver': {
      const content = state.documents.outline.content
      const spineFilled = Object.values(content.spine).filter(value => value.trim()).length
      const unitFilled = content.units.filter(unit => (
        unit.whatHappens.trim() ||
        unit.conflict.trim() ||
        unit.turn.trim() ||
        unit.consequence.trim() ||
        unit.whyNext.trim() ||
        unit.draftNotes.trim()
      )).length
      return `${spineFilled} spine fields · ${unitFilled} outline beats`
    }
    case 'sam':
      return state.synopsis.logline || 'No logline yet'
    case 'casey': {
      const names = state.storyBible.characters.map(c => c.name)
      return names.length ? names.join(', ') : 'No characters yet'
    }
    case 'zoe':
      return state.storyBible.world.setting || 'No world setting yet'
    case 'maya':
      return state.storyBible.world.voiceNotes || 'No voice notes yet'
    case 'alex':
      return state.documents.treatment.content.prose.opening ||
        state.documents.treatment.content.concept.premise ||
        `${getDisplayProjectTitle(state.meta.title)} · ${state.meta.genre || 'genre TBD'}`
  }
}

export function WritersRoom({
  projectState,
  onSendToSpecialist,
  onClearTranscript,
  mode = 'full',
  roomProps,
}: WritersRoomProps) {
  const [selectedId, setSelectedId] = useState<SelectedId>(roomProps ? 'room' : 'oliver')
  const [inputText, setInputText] = useState('')
  const transcriptRef = useRef<HTMLDivElement>(null)

  const specialistId: SpecialistId = selectedId === 'room' ? 'oliver' : selectedId
  const persona = PERSONAS[specialistId]
  const transcript = projectState.agents[specialistId].transcript

  // Auto-scroll the specialist transcript to the latest message — on new
  // messages and when switching specialists (which swaps the whole transcript).
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript.length, selectedId])
  const contextSummary = getContextSummary(specialistId, projectState)
  const docked = mode === 'dock'
  const canSend = inputText.trim().length > 0

  function handleSend() {
    const text = inputText.trim()
    if (!text) return
    onSendToSpecialist(specialistId, text)
    setInputText('')
  }

  return (
    <div style={docked ? styles.dockRoot : styles.root}>
      {/* Left nav */}
      <nav style={docked ? styles.dockNav : styles.nav} data-testid="specialist-nav">
        {roomProps && (
          <button
            onClick={() => setSelectedId('room')}
            style={{
              ...styles.navBtn,
              ...(selectedId === 'room' ? styles.navBtnActive : {}),
            }}
          >
            <span style={styles.navName}>The Room</span>
            <span style={styles.navRole}>Live channel</span>
          </button>
        )}
        {SPECIALISTS.map(id => {
          const p = PERSONAS[id]
          return (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              style={{
                ...styles.navBtn,
                ...(id === selectedId ? styles.navBtnActive : {}),
              }}
            >
              <span style={styles.navName}>{p.name}</span>
              <span style={styles.navRole}>{p.role}</span>
            </button>
          )
        })}
      </nav>

      {/* Center workspace */}
      {!docked && (
        <div style={styles.center} data-testid="specialist-workspace">
          <div style={styles.personaHeader}>
            <span style={styles.personaName}>{persona.name}</span>
            <span style={styles.personaRole}>{persona.role}</span>
          </div>
          <p style={styles.personaPersonality}>{persona.personality}</p>
          <div style={styles.expertiseChips}>
            {persona.expertise.map(e => (
              <span key={e} style={styles.chip}>{e}</span>
            ))}
          </div>
          <div style={styles.contextSummary}>
            <span style={styles.contextLabel}>Context</span>
            <span style={styles.contextText}>{contextSummary}</span>
          </div>
        </div>
      )}

      {/* Right pane: live room channel or 1:1 specialist chat */}
      {selectedId === 'room' && roomProps ? (
        <RoomChannel {...roomProps} />
      ) : (
      <div style={docked ? styles.dockChat : styles.chat}>
        <div style={styles.chatHeader}>
          <span style={styles.chatTitle}>
            {persona.name} Chat
            {docked && <span style={styles.chatSubtitle}> · {persona.role}</span>}
          </span>
          {transcript.length > 0 && onClearTranscript && (
            <button
              type="button"
              style={styles.clearButton}
              onClick={() => onClearTranscript(specialistId)}
            >
              Clear
            </button>
          )}
        </div>
        <div ref={transcriptRef} style={styles.transcript}>
          {transcript.length === 0 ? (
            <p style={styles.emptyState}>Start a conversation with {persona.name}…</p>
          ) : (
            transcript.map(msg => (
              <div key={msg.id} style={msg.role === 'user' ? styles.userMsg : styles.assistantMsg}>
                {msg.role === 'assistant' && (
                  <span style={styles.speakerLabel}>{msg.speaker}</span>
                )}
                <div style={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={styles.inputRow}>
          <textarea
            placeholder={`Message ${persona.name}…`}
            style={styles.input}
            rows={2}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            type="button"
            aria-label={`Send message to ${persona.name}`}
            disabled={!canSend}
            onClick={handleSend}
            style={{
              ...styles.sendButton,
              ...(!canSend ? styles.sendButtonDisabled : {}),
            }}
          >
            Send
          </button>
        </div>
      </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
  },
  dockRoot: {
    display: 'flex',
    height: '100%',
    width: 560,
    maxWidth: '48vw',
    minWidth: 440,
    flexShrink: 0,
    overflow: 'hidden',
    borderLeft: '1px solid var(--border)',
    background: 'var(--bg)',
  },
  nav: {
    width: 180,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 0',
    gap: 2,
    overflowY: 'auto',
  },
  dockNav: {
    width: 156,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
    gap: 2,
    overflowY: 'auto',
  },
  navBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 500,
    gap: 2,
    borderRadius: 0,
  },
  navBtnActive: {
    color: 'var(--fg)',
    background: 'var(--surface-2)',
  },
  navName: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 500,
  },
  navRole: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    fontWeight: 400,
  },
  center: {
    flex: 1,
    padding: '32px 24px',
    overflowY: 'auto',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  personaHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  personaName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 22,
    color: 'var(--fg)',
  },
  personaRole: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-muted)',
  },
  personaPersonality: {
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    color: 'var(--fg-muted)',
    lineHeight: 1.6,
    margin: 0,
  },
  expertiseChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    background: 'var(--surface-2)',
    borderRadius: 4,
    padding: '2px 8px',
  },
  contextSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 8,
  },
  contextLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  contextText: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
  },
  chat: {
    width: 320,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  dockChat: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  chatHeader: {
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 16px',
  },
  chatTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--fg-muted)',
  },
  chatSubtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 400,
    color: 'var(--fg-subtle)',
  },
  clearButton: {
    background: 'none',
    border: 'none',
    color: 'var(--fg-subtle)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: 0,
  },
  transcript: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  emptyState: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
  },
  userMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  assistantMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  speakerLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--wp-amber)',
    marginBottom: 3,
  },
  userBubble: {
    background: 'var(--surface-2)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--fg)',
    maxWidth: '90%',
    lineHeight: 1.5,
  },
  assistantBubble: {
    background: 'none',
    padding: '4px 0',
    fontSize: 13,
    color: 'var(--fg)',
    maxWidth: '95%',
    lineHeight: 1.5,
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
  sendButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
}
