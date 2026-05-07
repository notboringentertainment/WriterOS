import React, { useState, useEffect, useRef } from 'react'
import type { TranscriptMessage } from '../../lib/projectState'

type WritingTab = 'script' | 'story-bible' | 'outline' | 'synopsis'

interface LeftRailProps {
  open: boolean
  onToggle: () => void
  projectTitle: string
  activeTab: WritingTab
  transcript: TranscriptMessage[]
  loading: boolean
  onSend: (text: string) => void
  onClearTranscript?: () => void
}

export function LeftRail({ open, onToggle, projectTitle, transcript, loading, onSend, onClearTranscript }: LeftRailProps) {
  const [hasProactive, setHasProactive] = useState(false)
  const [inputText, setInputText] = useState('')
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Pulse after 20 min of no toggle — placeholder for real idle detection
  useEffect(() => {
    const timer = setTimeout(() => setHasProactive(true), 20 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [])

  // Auto-scroll to bottom on new messages or loading change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript.length, loading])

  function handleSend() {
    const text = inputText.trim()
    if (!text) return
    onSend(text)
    setInputText('')
  }

  return (
    <aside
      style={{
        ...styles.rail,
        width: open ? 'var(--rail-expanded)' : 'var(--rail-collapsed)',
      }}
    >
      {/* Avatar button — always visible */}
      <button
        title="Writing Partner"
        onClick={onToggle}
        style={styles.avatar}
      >
        <span style={styles.avatarInner}>WP</span>
        {hasProactive && !open && (
          <span style={styles.pulse} aria-hidden="true" />
        )}
        {!open && (
          <span style={styles.shortcutHint}>⌘\</span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitleRow}>
              <span style={styles.panelTitle}>Writing Partner</span>
              {transcript.length > 0 && onClearTranscript && (
                <button
                  type="button"
                  style={styles.clearButton}
                  onClick={onClearTranscript}
                >
                  Clear
                </button>
              )}
            </div>
            <span style={styles.contextChip}>{projectTitle}</span>
          </div>
          <div ref={transcriptRef} style={styles.transcript} aria-label="Writing Partner conversation">
            {transcript.length === 0 && !loading ? (
              <p style={styles.emptyState}>
                Ask anything about your project, or <code>@Oliver</code>, <code>@Sam</code>, <code>@Maya</code>…
              </p>
            ) : (
              <>
                {transcript.map(msg => (
                  <div key={msg.id} style={msg.role === 'user' ? styles.userMsg : styles.assistantMsg}>
                    {msg.role === 'assistant' && (
                      <span style={styles.speakerLabel}>{msg.speaker}</span>
                    )}
                    <div style={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={styles.assistantMsg}>
                    <div style={styles.assistantBubble} aria-label="loading">…</div>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={styles.inputRow}>
            <textarea
              placeholder="Message Writing Partner…"
              style={styles.input}
              rows={2}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
          </div>
        </div>
      )}
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  rail: {
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'width var(--rail-transition)',
    overflow: 'hidden',
    position: 'relative',
  },
  avatar: {
    width: 'var(--rail-collapsed)',
    height: 48,
    background: 'none',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    cursor: 'pointer',
  },
  avatarInner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--wp-amber)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: '#1a1200',
  },
  pulse: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--wp-amber)',
    animation: 'wp-pulse 3s ease-in-out infinite',
  },
  shortcutHint: {
    position: 'absolute',
    bottom: 4,
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--fg-subtle)',
    pointerEvents: 'none',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    paddingTop: 0,
  },
  panelHeader: {
    padding: '12px 16px 8px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  panelTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--wp-amber)',
  },
  panelTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  contextChip: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
  },
  transcript: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  emptyState: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.6,
    fontStyle: 'italic',
  },
  inputRow: {
    padding: '8px 12px 12px',
    borderTop: '1px solid var(--border)',
  },
  input: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    lineHeight: 1.5,
  },
  userMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  assistantMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 10,
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
    borderRadius: 8,
    padding: '4px 0',
    fontSize: 13,
    color: 'var(--fg)',
    maxWidth: '95%',
    lineHeight: 1.5,
  },
}
