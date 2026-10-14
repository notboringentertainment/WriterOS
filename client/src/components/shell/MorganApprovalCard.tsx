import React, { useState } from 'react'
import type { ApprovalCard } from '@shared/morganLive'

export interface MorganApprovalCardProps {
  card: ApprovalCard
  onAnswer(answer: { allow: boolean; note?: string }): Promise<void>
  onNoLongerWaiting(): void
}

export function MorganApprovalCard({ card, onAnswer, onNoLongerWaiting }: MorganApprovalCardProps) {
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  let input: Record<string, unknown> = {}
  try { const parsed: unknown = JSON.parse(card.input); if (parsed && typeof parsed === 'object') input = parsed as Record<string, unknown> } catch { /* show original complete input */ }
  const text = (field: string) => typeof input[field] === 'string' ? input[field] as string : null
  const path = text('file_path') ?? text('path')
  async function answer(allow: boolean) {
    if (pending) return
    setPending(true); setError(null)
    try { await onAnswer({ allow, ...(!allow && note.trim() ? { note: note.trim() } : {}) }) }
    catch (e) {
      const message = e instanceof Error ? e.message : 'Could not answer Morgan.'
      if ((e as { status?: number })?.status === 404 || /no longer waiting/i.test(message)) { onNoLongerWaiting(); return }
      setPending(false); setError(message)
    }
  }
  const wrap: React.CSSProperties = { overflowWrap: 'anywhere', wordBreak: 'break-word' }
  const block: React.CSSProperties = { ...wrap, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 11, margin: '4px 0', maxHeight: 180, overflowY: 'auto' }
  const button: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.5 : 1, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 8px' }
  return <section aria-label="Morgan approval" style={{ ...wrap, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', fontSize: 13, marginBottom: 8 }}>
    <div style={wrap}>{card.summary}</div>
    {path && <pre style={block}>{path}</pre>}
    {text('old_string') !== null && <><div>Before</div><pre style={block}>{text('old_string')}</pre></>}
    {text('new_string') !== null && <><div>After</div><pre style={block}>{text('new_string')}</pre></>}
    {text('content') !== null && <pre style={block}>{text('content')}</pre>}
    {text('command') !== null && <pre style={block}>{text('command')}</pre>}
    <details><summary>Details</summary><pre style={block}>{Object.keys(input).length ? JSON.stringify(input, null, 2) : card.input}</pre></details>
    <label style={{ display: 'block', marginTop: 8 }}>Tell Morgan why (optional)
      <textarea aria-label="Tell Morgan why (optional)" value={note} disabled={pending} onChange={e => setNote(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', color: 'var(--fg)', background: 'var(--surface)', border: '1px solid var(--border)' }} />
    </label>
    {error && <p role="alert">{error}</p>}
    <button style={button} disabled={pending} onClick={() => void answer(true)}>Allow</button>{' '}
    <button style={button} disabled={pending} onClick={() => void answer(false)}>Don't allow</button>
  </section>
}
