import React, { useEffect, useMemo, useRef, useState } from 'react'
import { lookHash } from '@shared/canonicalJson'
import { findFirewallProblems, validateLookSpecForPromotion, type LookSpecProblem } from '@shared/lookSpec'
import type { LookDraft, LookPromoteRequest, LookPromoteResponse } from '@shared/looks'
import type { TranscriptMessage } from '../../../lib/projectState'
import { candidateSpec, isPristineDraft, matchesPromotedLook, type LookTarget, type PromotedLook } from '../../../lib/lookDraftEdits'
import { LookRequestUnanswered, type LookPromoteOutcome } from '../../../lib/looksClient'
import { LOOK_FIELD_LABELS, LookDraftForm, friendlyProblem, isMissingField } from './LookDraftForm'

// The Look panel (look sessions plan, Task 6): Zoe asks, the writer types,
// Promote makes the look canon in WriterOS. Ratification still happens in
// OpenMontage, from a terminal. Zoe's replies are shown here and never written
// into the form.

export interface LookPanelProps {
  target: LookTarget
  draft: LookDraft | undefined
  messages: TranscriptMessage[]
  sending: boolean
  onSend: (text: string) => void
  prior: PromotedLook | undefined
  /** Current memory revision, or undefined while memory is loading or unavailable. */
  memoryRevision: number | undefined
  onField: (field: string, value: unknown) => void
  onClear: (field: string) => void
  onReference: (reference: LookDraft['reference']) => void
  /** Absent when the project is not on the server library (promotion needs it). */
  promote?: (body: LookPromoteRequest) => Promise<LookPromoteOutcome>
  reexport?: () => Promise<void>
  /** Called after a successful promotion: remove the draft, refresh memory. */
  onPromoted: (response: LookPromoteResponse) => void
  onMemoryStale: () => void
  /** Copy the writer's own promoted answers into an empty draft (shown only then). */
  onStartFromPromoted?: () => void
  onExit: () => void
}

type PromoteState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'refused'; message: string; problems: LookSpecProblem[] }
  | { kind: 'unanswered'; message: string }
  | { kind: 'promoted'; response: LookPromoteResponse }

const labelFor = (path: string) => LOOK_FIELD_LABELS[path.split(/[.[]/)[0]] ?? path

/** Problems in the writer's terms: missing fields collapse into one line. */
export function summarizeProblems(problems: LookSpecProblem[]): { missing: string[]; other: LookSpecProblem[] } {
  const missing = new Set<string>()
  const other: LookSpecProblem[] = []
  for (const problem of problems) {
    if (isMissingField(problem)) missing.add(labelFor(problem.path))
    else other.push({ ...problem, message: friendlyProblem(problem) })
  }
  return { missing: [...missing], other }
}

/** True while the chat and form sit side by side; only then does the chat stay in view. */
function useSideBySide(minWidth = 1000): boolean {
  const query = `(min-width: ${minWidth}px)`
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener?.('change', update)
    return () => list.removeEventListener?.('change', update)
  }, [query])
  return matches
}

export function LookPanel(props: LookPanelProps) {
  const { target, draft, messages, sending, onSend, prior, memoryRevision, promote, reexport, onPromoted, onMemoryStale, onExit } = props
  const [input, setInput] = useState('')
  const [state, setState] = useState<PromoteState>({ kind: 'idle' })
  const [reexporting, setReexporting] = useState(false)
  const [reexportNote, setReexportNote] = useState<string | null>(null)
  // One id per Promote click; kept only while that click is unanswered, so a retry reuses it.
  const pendingOpId = useRef<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const sideBySide = useSideBySide()

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages.length])

  // A refusal describes the draft as it was; once the writer edits, the live check takes over.
  useEffect(() => {
    setState(current => (current.kind === 'refused' ? { kind: 'idle' } : current))
  }, [draft])

  const check = useMemo(() => {
    if (!draft) return { problems: [] as LookSpecProblem[], valid: false, hash: null as string | null }
    const candidate = candidateSpec(draft)
    const problems: LookSpecProblem[] = []
    if (draft.reference === 'unasked') {
      problems.push({ path: 'reference', message: 'Answer the reference-image question first.' })
    }
    problems.push(...findFirewallProblems(candidate, draft.reference))
    const validated = validateLookSpecForPromotion(candidate)
    if (!validated.ok) problems.push(...validated.problems)
    const valid = problems.length === 0 && validated.ok
    return { problems, valid, hash: valid && validated.ok && draft.citedRecordIds.length === 0 ? lookHash(validated.spec) : null }
  }, [draft])

  const unchanged = !!draft && !!prior && matchesPromotedLook(draft, prior)
  const { missing, other } = summarizeProblems(state.kind === 'refused' && state.problems.length > 0 ? state.problems : check.problems)
  const canPromote = !!draft && !!promote && check.valid && !unchanged && memoryRevision !== undefined && state.kind !== 'sending'

  async function handlePromote() {
    if (!draft || !promote || memoryRevision === undefined) return
    const { version: _version, depends_on: _deps, ...spec } = candidateSpec(draft)
    if (!pendingOpId.current) pendingOpId.current = crypto.randomUUID()
    setState({ kind: 'sending' })
    try {
      const outcome = await promote({
        spec,
        entityName: draft.entityName,
        sessionId: draft.sessionId,
        citedRecordIds: draft.citedRecordIds,
        reference: draft.reference === 'unasked' ? 'none' : draft.reference,
        fieldSources: draft.fieldSources,
        expectedRevision: memoryRevision,
        promotionOpId: pendingOpId.current,
      })
      pendingOpId.current = null
      if (outcome.ok) {
        setState({ kind: 'promoted', response: outcome.response })
        onPromoted(outcome.response)
        return
      }
      if (outcome.error === 'revision-conflict') {
        onMemoryStale()
        setState({ kind: 'refused', message: 'Memory moved on; reload and try again.', problems: [] })
        return
      }
      setState({ kind: 'refused', message: outcome.message, problems: outcome.problems })
    } catch (error) {
      if (error instanceof LookRequestUnanswered) {
        setState({ kind: 'unanswered', message: `${error.message} Click Promote again to retry the same promotion.` })
        return
      }
      pendingOpId.current = null
      setState({ kind: 'refused', message: error instanceof Error ? error.message : 'Promote failed.', problems: [] })
    }
  }

  async function handleReexport() {
    if (!reexport) return
    setReexporting(true)
    setReexportNote(null)
    try {
      await reexport()
      setReexportNote('Export written. OpenMontage can read it now.')
    } catch (error) {
      setReexportNote(error instanceof Error ? error.message : 'Re-export failed.')
    } finally {
      setReexporting(false)
    }
  }

  function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    onSend(text)
  }

  const kindLabel = target.entityKind === 'character' ? 'Character' : 'Location'
  const promoted = state.kind === 'promoted' ? state.response : null

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerText}>
          <h1 style={styles.title}>{target.entityName}</h1>
          <p style={styles.meta}>
            {kindLabel} look · {promoted ? 'promoted' : 'draft saved in this project'}
          </p>
        </div>
        <button type="button" style={styles.exitButton} onClick={onExit}>Close</button>
      </header>

      {prior && !promoted && (
        <p style={styles.notice}>
          A promoted look already exists for {prior.entityName} (look_hash <code style={styles.code}>{prior.lookHash.slice(0, 12)}</code>).
          Promoting this one replaces it; once ratified, headshots and sheets made from the old look stop being usable.
          {props.onStartFromPromoted && isPristineDraft(draft) && (
            <>
              {' '}To change a detail without retyping the look, start from your promoted answers.{' '}
              <button type="button" style={styles.inlineButton} onClick={props.onStartFromPromoted}>
                Start from the promoted look
              </button>
            </>
          )}
        </p>
      )}

      <div style={styles.body}>
        <section style={{ ...styles.chat, ...(sideBySide ? styles.chatPinned : styles.chatStacked) }} aria-label="Conversation with Zoe">
          <div ref={transcriptRef} style={styles.transcript}>
            {messages.length === 0 ? (
              <p style={styles.empty}>
                Zoe asks one question at a time and never fills in the form. Say hello, or tell her where this {target.entityKind} first appears.
              </p>
            ) : messages.map(message => (
              <div key={message.id} style={message.role === 'user' ? styles.userMsg : styles.zoeMsg}>
                {message.role === 'assistant' && <span style={styles.speaker}>{message.speaker}</span>}
                <div style={message.role === 'user' ? styles.userBubble : styles.zoeBubble}>{message.content}</div>
              </div>
            ))}
            {sending && <p style={styles.empty} aria-live="polite">Zoe is thinking…</p>}
          </div>
          <div style={styles.inputRow}>
            <textarea
              aria-label="Message Zoe"
              placeholder="Answer Zoe…"
              style={styles.chatInput}
              rows={2}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <button type="button" style={{ ...styles.sendButton, ...(!input.trim() || sending ? styles.disabled : {}) }}
              disabled={!input.trim() || sending} onClick={send}>
              Send
            </button>
          </div>
        </section>

        <section style={styles.formColumn} aria-label="Look form">
          {draft && !promoted ? (
            <LookDraftForm draft={draft} problems={check.problems} onField={props.onField} onClear={props.onClear}
              onReference={props.onReference} disabled={state.kind === 'sending'} />
          ) : !promoted ? (
            <p style={styles.empty}>Preparing the draft…</p>
          ) : null}

          <footer style={styles.promoteBox}>
            {promoted ? (
              <div style={styles.promotedBlock} role="status">
                <p style={styles.promotedLine}>
                  Promoted · look_hash <code style={styles.code}>{promoted.lookHash.slice(0, 12)}</code> · awaiting Front Lot ratification
                </p>
                <p style={styles.hint}>
                  Next, in OpenMontage: <code style={styles.code}>look_run.py --entity {draft?.spec.entity_id as string ?? target.entityId} --source writeros</code>,
                  then approve the gate in a terminal.
                </p>
                {!promoted.exportWritten && (
                  <p style={styles.problem}>Promoted, but the export file was not written. Click Re-export.</p>
                )}
                {reexport && (
                  <button type="button" style={styles.secondaryButton} disabled={reexporting} onClick={() => { void handleReexport() }}>
                    {reexporting ? 'Re-exporting…' : 'Re-export'}
                  </button>
                )}
                {reexportNote && <p style={styles.hint} role="status">{reexportNote}</p>}
              </div>
            ) : (
              <>
                {missing.length > 0 && (
                  <p style={styles.hint}>Still to fill: {missing.join(', ')}.</p>
                )}
                {other.length > 0 && (
                  <ul style={styles.problemList}>
                    {other.map((problem, index) => <li key={`${problem.path}-${index}`} style={styles.problem}>{problem.message}</li>)}
                  </ul>
                )}
                {(state.kind === 'refused' || state.kind === 'unanswered') && (
                  <p style={styles.problem} role="alert">{state.message}</p>
                )}
                {unchanged && <p style={styles.hint}>This is identical to the promoted look. Change something before promoting.</p>}
                {!promote && <p style={styles.hint}>Promotion needs this project open from the WriterOS project folder.</p>}
                {promote && memoryRevision === undefined && <p style={styles.hint}>Loading project memory…</p>}
                {check.hash && (
                  <p style={styles.hint}>look_hash preview <code style={styles.code}>{check.hash.slice(0, 12)}</code></p>
                )}
                <div style={styles.promoteRow}>
                  <button type="button" style={{ ...styles.promoteButton, ...(!canPromote ? styles.disabled : {}) }}
                    disabled={!canPromote} onClick={() => { void handlePromote() }}>
                    {state.kind === 'sending' ? 'Promoting…' : 'Promote to canon'}
                  </button>
                  <span style={styles.hint}>Promotion is not ratification. Ratify in OpenMontage.</span>
                </div>
              </>
            )}
          </footer>
        </section>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 20, padding: '32px min(64px, 6vw)', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerText: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  title: { fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--fg)', margin: 0, lineHeight: 1.15, textWrap: 'balance' as React.CSSProperties['textWrap'] },
  meta: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', margin: 0 },
  exitButton: {
    background: 'none', border: 'none', color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', padding: '6px 8px',
  },
  notice: {
    fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg)', margin: 0, maxWidth: '72ch',
    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-1, var(--surface-2))',
  },
  body: { display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' },
  chat: {
    flex: '1 1 320px', maxWidth: 440, minWidth: 0, display: 'flex', flexDirection: 'column',
    border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-1, var(--bg))',
  },
  chatPinned: { position: 'sticky', top: 16, maxHeight: 'calc(100vh - 140px)', minHeight: 420 },
  chatStacked: { maxWidth: 'none', height: 420 },
  transcript: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-muted)', fontStyle: 'italic', margin: 0 },
  userMsg: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  zoeMsg: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  speaker: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--wp-amber)', marginBottom: 3 },
  userBubble: { background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--fg)', maxWidth: '90%', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  zoeBubble: { padding: '2px 0', fontSize: 14, color: 'var(--fg)', maxWidth: '95%', lineHeight: 1.55, whiteSpace: 'pre-wrap' },
  inputRow: { padding: '8px 12px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', gap: 8 },
  chatInput: {
    flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)',
    fontFamily: 'var(--font-body)', fontSize: 13, padding: '8px 12px', lineHeight: 1.5, boxSizing: 'border-box', resize: 'none',
  },
  sendButton: {
    height: 38, minWidth: 58, padding: '0 12px', borderRadius: 8, border: '1px solid var(--wp-amber)', background: 'var(--wp-amber)',
    color: '#1a1200', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flexShrink: 0,
  },
  disabled: { opacity: 0.45, cursor: 'not-allowed' },
  formColumn: { flex: '2 1 460px', minWidth: 0, maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 },
  promoteBox: { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 18, borderTop: '1px solid var(--border)' },
  promoteRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  promoteButton: {
    border: '1px solid var(--wp-amber)', background: 'var(--wp-amber)', color: '#1a1200', borderRadius: 8,
    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, padding: '10px 16px', cursor: 'pointer',
  },
  inlineButton: {
    display: 'block', border: '1px solid var(--wp-amber)', borderRadius: 8, background: 'transparent', color: 'var(--fg)',
    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', marginTop: 8,
  },
  secondaryButton: {
    alignSelf: 'flex-start', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--fg)',
    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '7px 12px', cursor: 'pointer',
  },
  hint: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-muted)', margin: 0 },
  problemList: { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 },
  problem: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--danger, #b3261e)', margin: 0 },
  promotedBlock: { display: 'flex', flexDirection: 'column', gap: 8 },
  promotedLine: { fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 },
  code: { fontFamily: 'var(--font-mono)', fontSize: 12 },
}
