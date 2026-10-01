import React, { useState } from 'react'
import { promotedLooksNamedIn, slugifyEntityName } from '../../../lib/lookDraftEdits'
import { useLookSessions } from '../../../lib/lookSessionsContext'

const LOCATION_CHOICE = '__location__'

/** On a beat's Lookbook: pick a Story Bible character or name a location, then open its Look panel. */
export function LookEntryButton({ beatTitle }: { beatTitle: string }) {
  const looks = useLookSessions()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const [locationName, setLocationName] = useState('')
  if (!looks) return null

  const isLocation = choice === LOCATION_CHOICE
  const name = isLocation ? locationName.trim() : choice
  const start = () => {
    if (!name) return
    looks.openLook({ entityKind: isLocation ? 'location' : 'character', entityId: slugifyEntityName(name), entityName: name })
    setOpen(false)
    setChoice('')
    setLocationName('')
  }

  if (!open) {
    return (
      <button type="button" style={styles.trigger} onClick={() => setOpen(true)}>
        Start a look
      </button>
    )
  }
  return (
    <div style={styles.picker} role="group" aria-label={`Start a look from ${beatTitle}`}>
      <select aria-label="Who or where is this look for?" style={styles.input} value={choice} onChange={event => setChoice(event.target.value)}>
        <option value="">Who or where?</option>
        {looks.characterNames.map(character => <option key={character} value={character}>{character}</option>)}
        <option value={LOCATION_CHOICE}>A location…</option>
      </select>
      {isLocation && (
        <input aria-label="Location name" placeholder="Location name" style={styles.input} value={locationName}
          onChange={event => setLocationName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') start() }} />
      )}
      <button type="button" style={styles.trigger} disabled={!name} onClick={start}>Open look</button>
      <button type="button" style={styles.link} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  )
}

/** Read-only: the promoted looks this beat names (by entity name). */
export function PromotedLooksLine({ text }: { text: string }) {
  const looks = useLookSessions()
  if (!looks) return null
  const named = promotedLooksNamedIn(looks.promotedLooks, text)
  if (named.length === 0) return null
  return (
    <p style={styles.promoted}>
      Look promoted: {named.map(look => look.entityName).join(', ')}
    </p>
  )
}

/** On a Story Bible character card. */
export function CharacterLookButton({ name }: { name: string }) {
  const looks = useLookSessions()
  const trimmed = name.trim()
  if (!looks || !trimmed) return null
  const promoted = looks.promotedLooks.some(look => look.entityKind === 'character' && look.entityName === trimmed)
  return (
    <button type="button" style={styles.cardButton}
      onClick={() => looks.openLook({ entityKind: 'character', entityId: slugifyEntityName(trimmed), entityName: trimmed })}>
      {promoted ? 'Look · promoted' : 'Look'}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--fg)',
    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, padding: '7px 10px', cursor: 'pointer',
  },
  promoted: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 },
  picker: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: {
    fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg)', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px',
  },
  link: {
    background: 'none', border: 'none', padding: 0, color: 'var(--fg-muted)', fontFamily: 'var(--font-body)',
    fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
  },
  // Matches the character card's own buttons.
  cardButton: {
    border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)', fontSize: '0.8rem', padding: '4px 8px', cursor: 'pointer', flexShrink: 0,
  },
}
