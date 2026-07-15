import React, { useEffect, useState } from 'react'
import { validatePitchPacketForApproval, type PitchPacket, type PitchPacketField, type PitchPacketOrigin } from '@shared/pitchPacket'
import type { PitchPacketRow } from '../../lib/roomApi'

interface PitchPacketReviewProps {
  row: PitchPacketRow
  proposalUnavailable: boolean
  message?: string | null
  downloadError?: string | null
  onSave: (packet: PitchPacket) => Promise<void>
  onApprove: (packet: PitchPacket) => Promise<void>
  onExport: () => Promise<void>
  onRedownload: () => Promise<void>
}

const REQUIRED_FIELDS = ['title', 'logline', 'format', 'genre', 'tone', 'premise', 'storyEngine', 'coreCharacters', 'locks', 'openQuestions'] as const
const LABELS: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  title: 'Title', logline: 'Logline', format: 'Format', genre: 'Genre', tone: 'Tone', premise: 'Premise', storyEngine: 'Story engine',
  coreCharacters: 'Core characters', locks: 'Locks', openQuestions: 'Open questions',
}

function originLabel(origin: PitchPacketOrigin): string {
  if (origin === 'document') return 'From your documents'
  if (origin === 'meeting') return 'From the Meeting'
  if (origin === 'writer') return 'You wrote this'
  return 'Suggested — needs your approval'
}

function writerField<T>(field: PitchPacketField<T>, value: T): PitchPacketField<T> {
  return { value, origin: 'writer', approved: false, sourceRef: field.sourceRef ?? 'writer:pitch-packet' }
}

export function PitchPacketReview({ row, proposalUnavailable, message, downloadError, onSave, onApprove, onExport, onRedownload }: PitchPacketReviewProps) {
  const [packet, setPacket] = useState(row.packet)
  const [busy, setBusy] = useState(false)

  useEffect(() => setPacket(row.packet), [row.id, row.packet])

  function updateField<K extends (typeof REQUIRED_FIELDS)[number]>(key: K, field: PitchPacket[K]) {
    setPacket(current => ({ ...current, [key]: field }))
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }

  const approval = validatePitchPacketForApproval(packet)
  const readonly = row.status !== 'draft'

  return (
    <section aria-label="Pitch Packet review" style={styles.review}>
      <h2 style={styles.title}>Pitch Packet review</h2>
      <p style={styles.guidance}>Approve every required field to export.</p>
      {proposalUnavailable && <p style={styles.warning}>Suggestions are unavailable right now. You can still write and approve every field yourself.</p>}
      {message && <p style={styles.success}>{message}</p>}
      {downloadError && <p style={styles.warning}>The Pitch Packet is exported, but download failed: {downloadError}</p>}

      {REQUIRED_FIELDS.map(key => {
        const field = packet[key]
        const scalar = typeof field.value === 'string'
        return (
          <article key={key} style={styles.field}>
            <div style={styles.fieldHeader}>
              <label htmlFor={`packet-${key}`} style={styles.label}>{LABELS[key]}</label>
              <span style={styles.badge}>{originLabel(field.origin)}</span>
            </div>
            {scalar ? (
              <textarea
                id={`packet-${key}`}
                aria-label={`${key} value`}
                value={field.value as string}
                disabled={readonly || busy}
                rows={key === 'premise' || key === 'storyEngine' ? 3 : 2}
                style={styles.input}
                onChange={event => updateField(key, writerField(field as PitchPacketField<string>, event.target.value) as PitchPacket[typeof key])}
              />
            ) : (
              <textarea
                id={`packet-${key}`}
                aria-label={`${key} value`}
                value={JSON.stringify(field.value, null, 2)}
                disabled={readonly || busy}
                rows={6}
                style={styles.input}
                onChange={event => {
                  try { updateField(key, writerField(field as PitchPacketField<unknown[]>, JSON.parse(event.target.value)) as PitchPacket[typeof key]) } catch { /* Keep the last structurally valid value. */ }
                }}
              />
            )}
            {field.conflict && field.candidates?.length ? (
              <div style={styles.candidates}>
                <strong>Choose one source</strong>
                {field.candidates.map((candidate, index) => (
                  <button key={`${candidate.sourceRef}-${index}`} type="button" style={styles.choice} disabled={readonly || busy} onClick={() => updateField(key, { value: candidate.value, origin: candidate.origin, approved: false, sourceRef: candidate.sourceRef } as PitchPacket[typeof key])}>
                    {typeof candidate.value === 'string' ? candidate.value : JSON.stringify(candidate.value)}
                  </button>
                ))}
              </div>
            ) : null}
            {!readonly && (
              <button
                type="button"
                disabled={busy || field.approved || field.conflict || (typeof field.value === 'string' && !field.value.trim()) || (key === 'coreCharacters' && Array.isArray(field.value) && field.value.length === 0)}
                style={styles.approve}
                onClick={() => updateField(key, { ...field, approved: true, conflict: undefined, candidates: undefined } as PitchPacket[typeof key])}
              >
                {field.approved ? `${LABELS[key]} approved` : `Approve ${key}`}
              </button>
            )}
          </article>
        )
      })}

      <div style={styles.actions}>
        {row.status === 'draft' && <button type="button" disabled={busy} style={styles.secondary} onClick={() => void run(() => onSave(packet))}>Save draft</button>}
        {row.status === 'draft' && <button type="button" disabled={busy || !approval.ok} style={styles.primary} onClick={() => void run(() => onApprove(packet))}>Approve packet</button>}
        {row.status === 'approved' && <button type="button" disabled={busy} style={styles.primary} onClick={() => void run(onExport)}>Export Pitch Packet</button>}
        {row.status === 'exported' && <button type="button" disabled={busy} style={styles.primary} onClick={() => void run(onRedownload)}>Download again</button>}
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  review: { display: 'flex', flexDirection: 'column', gap: 16 },
  title: { margin: 0, fontFamily: 'var(--font-display)', fontSize: 24 },
  guidance: { margin: 0, color: 'var(--fg-muted)' },
  field: { display: 'flex', flexDirection: 'column', gap: 8, padding: 14, border: '1px solid var(--border)', borderRadius: 8 },
  fieldHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontWeight: 700 },
  badge: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' },
  input: { width: '100%', boxSizing: 'border-box', padding: 10, color: 'var(--fg)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-body)' },
  candidates: { display: 'flex', flexDirection: 'column', gap: 6 },
  choice: { textAlign: 'left', padding: 8, border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', color: 'var(--fg)', cursor: 'pointer' },
  approve: { alignSelf: 'flex-start', padding: '7px 11px' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  primary: { padding: '10px 16px', border: 0, borderRadius: 6, background: 'var(--accent)', color: 'white', cursor: 'pointer' },
  secondary: { padding: '10px 16px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--fg)', cursor: 'pointer' },
  warning: { margin: 0, color: 'var(--warning, #b06b21)' },
  success: { margin: 0, color: 'var(--success, #347a51)' },
}
