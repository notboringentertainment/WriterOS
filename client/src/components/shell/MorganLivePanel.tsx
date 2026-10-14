import React, { useEffect, useReducer, useRef, useState } from 'react'
import type { MorganScreenEvent, PageProposal } from '@shared/morganLive'
import type { MorganApi } from '../../lib/projectStorage'
import { initialModel, reduce } from '../../lib/morganLive/model'
import { MorganApprovalCard } from './MorganApprovalCard'

interface MorganLivePanelProps {
  projectId: string
  morgan: MorganApi
  surface: string
  onPageProposal(p: { proposalId: string; proposal: PageProposal } | null): void
  onProjectChanged?(): void   // Morgan changed the beat sheet; reload the project so the Outline shows it
}

export function MorganLivePanel({ projectId, morgan, surface, onPageProposal, onProjectChanged }: MorganLivePanelProps) {
  const [model, dispatch] = useReducer(reduce, undefined, initialModel)
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lostContact, setLostContact] = useState(false)
  const generation = useRef(0)
  const project = useRef(projectId)
  project.current = projectId
  const close = useRef<(() => void) | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionRunning = useRef(false)
  const operation = useRef(false)
  const feed = useRef<HTMLDivElement>(null)
  const proposalCallback = useRef(onPageProposal)
  proposalCallback.current = onPageProposal
  const changedCallback = useRef(onProjectChanged)
  changedCallback.current = onProjectChanged
  const renderGeneration = generation.current

  function disconnect() {
    close.current?.(); close.current = null
    if (retryTimer.current !== null) clearTimeout(retryTimer.current)
    retryTimer.current = null
  }
  useEffect(() => {
    // The parent also keys by project; guard direct rerenders and every async callback.
    generation.current++
    operation.current = false; sessionRunning.current = false
    setRunning(false); setBusy(false); setSending(false); setDraft(''); setError(null); setLostContact(false)
    dispatch({ type: 'reset' })
    return () => { generation.current++; sessionRunning.current = false; disconnect() }
  }, [projectId, morgan])
  useEffect(() => { proposalCallback.current(model.proposals.at(-1) ?? null) }, [model.proposals])
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [model.feed, model.provisional])
  useEffect(() => {
    const update = model.composer
    if (!update) return
    if (update.outcome !== 'sent') {
      setDraft(current => current || update.text)
      setError(update.reason ?? (update.outcome === 'uncertain' ? 'Morgan may not have received that message. Check before sending again.' : 'That message was not sent.'))
    }
  }, [model.composer])

  const current = (g: number) => generation.current === g && project.current === projectId
  function subscribe(g: number, retry = false) {
    if (!current(g)) return
    close.current = morgan.stream(projectId, (event: MorganScreenEvent) => {
      if (!current(g)) return
      if (event.type === 'ended') { sessionRunning.current = false; setRunning(false) }
      if (event.type === 'project-changed') changedCallback.current?.()
      dispatch(event)
    }, () => {
      if (!current(g) || !sessionRunning.current) return
      if (!retry) {
        retryTimer.current = setTimeout(() => { retryTimer.current = null; if (current(g) && sessionRunning.current) subscribe(g, true) }, 1000)
      } else { sessionRunning.current = false; setRunning(false); setLostContact(true) }
    })
  }
  async function start(restart = false, fresh = false) {
    if (operation.current) return
    operation.current = true
    const g = ++generation.current
    disconnect(); sessionRunning.current = false
    setBusy(true); setError(null); setLostContact(false)
    try {
      if (restart) { await morgan.end(projectId); if (!current(g)) return }
      await (fresh ? morgan.start(projectId, { fresh: true }) : morgan.start(projectId))
      if (!current(g)) return
      dispatch({ type: 'reset' })
      sessionRunning.current = true; setRunning(true); subscribe(g)
    } catch (e) { if (current(g)) { setRunning(false); setError(e instanceof Error ? e.message : 'Morgan could not start.') } }
    finally { if (current(g)) { operation.current = false; setBusy(false) } }
  }
  async function send() {
    const text = draft.trim()
    if (!text || !running || busy || sending || model.stuck || model.working) return
    const g = generation.current
    setSending(true); setError(null); setDraft('')
    try { await morgan.submit(projectId, text, { surface }) }
    catch (e) { if (current(g)) { setDraft(currentDraft => currentDraft || text); setError(e instanceof Error ? e.message : 'Message could not be sent.') } }
    finally { if (current(g)) setSending(false) }
  }
  async function stop() {
    if (!model.working) return
    const g = generation.current
    try { await morgan.stop(projectId, model.working.turnId) }
    catch (e) { if (current(g)) setError(e instanceof Error ? e.message : 'Could not stop Morgan.') }
  }
  return <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, maxWidth: '100%', color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>
    <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
      {running && <button style={styles.button} disabled={busy} onClick={() => { if (window.confirm('Start a new conversation with Morgan?')) void start(true, true) }}>New conversation</button>}
    </div>
    {model.notice && <p style={styles.notice}>{model.notice}</p>}
    {error && <p role="alert" style={styles.notice}>{error}</p>}
    {lostContact && <p style={styles.notice}>Lost contact with Morgan.</p>}
    {model.ended && <p style={styles.notice}>{model.endReason === 'start-failed' && model.endMessage ? model.endMessage : "Morgan's session ended — start a new one."}</p>}
    {!running && <button style={styles.button} disabled={busy} onClick={() => void start()}>Start Morgan</button>}
    <div ref={feed} aria-label="Morgan conversation" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
      {model.earlierHidden && <p style={styles.notice}>Earlier messages are not shown.</p>}
      {model.feed.map(item => item.kind === 'tools' ? <details key={item.id} style={styles.tools}><summary>{item.label}</summary>{item.files.map((file, index) => <div key={index} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{file}</div>)}</details>
        : <div key={item.id} style={{ ...styles.message, ...(item.kind === 'you' ? styles.user : {}) }}>
          {item.kind === 'prose' && <div style={styles.speaker}>Morgan</div>}
          {item.kind === 'prose' ? item.markdown : item.kind === 'you' ? item.text.replace(/^\[WriterOS: Ben is on the .+ page\]\n/, '') : 'Interrupted'}
        </div>)}
      {model.provisional && <div aria-label="Morgan is writing" style={styles.message}>{model.provisional}</div>}
      {model.proposals.map(p => <div key={p.proposalId} style={styles.message}>{p.proposal.summary}{' '}<button style={styles.button} onClick={() => onPageProposal(p)}>Show on page</button></div>)}
    </div>
    {model.stuck && <div style={styles.notice}><p>Morgan is stuck on a prompt this screen cannot show yet.</p>{model.stuck.detail && <p>{model.stuck.detail}</p>}<button style={styles.button} disabled={busy} onClick={() => void start(true)}>Restart Morgan</button></div>}
    <div style={{ padding: '4px 12px 12px', flexShrink: 0, maxHeight: '60%', overflowY: 'auto' }}>
      {model.cards.map(card => <MorganApprovalCard key={card.requestId} card={card}
        onAnswer={async answer => { const g = renderGeneration; if (!current(g)) return; try { await morgan.answerApproval(projectId, card.requestId, answer) } catch (e) { if (current(g)) throw e } }}
        onNoLongerWaiting={() => { if (current(renderGeneration)) dispatch({ type: 'approval-answered', requestId: card.requestId, allow: false }) }} />)}
      <textarea aria-label="Message Morgan" placeholder="Message Morgan…" rows={2} value={draft} disabled={!running || busy || !!model.stuck || !!model.working || sending}
        style={styles.input} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send() } }} />
      <button style={styles.button} disabled={!running || busy || sending || !draft.trim() || !!model.stuck || !!model.working} onClick={() => void send()}>Send</button>
      {model.working && <button style={styles.button} onClick={() => void stop()}>Stop</button>}
    </div>
  </div>
}

const styles: Record<string, React.CSSProperties> = {
  button: { background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 8px' },
  notice: { fontSize: 12, color: 'var(--fg-muted)', padding: '0 12px', margin: '4px 0', flexShrink: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  message: { fontSize: 13, lineHeight: 1.5, marginBottom: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' },
  user: { background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', marginLeft: '10%' },
  speaker: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--wp-amber)', marginBottom: 3 },
  tools: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', marginBottom: 10, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  input: { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', fontFamily: 'var(--font-body)', fontSize: 13, padding: '8px 12px', lineHeight: 1.5 },
}
