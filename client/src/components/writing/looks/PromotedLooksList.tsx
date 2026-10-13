import React from 'react'
import { useLookSessions } from '../../../lib/lookSessionsContext'

// The home of the project's canon looks: every promoted look, one row each.
// Opening a row starts a draft filled with the promoted answers, so a look can
// be changed (or renamed) and promoted again as often as the writer likes.

function promotedDate(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PromotedLooksList() {
  const looks = useLookSessions()
  if (!looks) return null
  const sorted = [...looks.promotedLooks].sort((a, b) => (
    a.entityKind === b.entityKind ? a.entityName.localeCompare(b.entityName) : a.entityKind === 'character' ? -1 : 1
  ))

  return (
    <section style={styles.root} aria-labelledby="promoted-looks-heading" data-testid="story-bible-looks">
      <h3 id="promoted-looks-heading" style={styles.heading}>Looks</h3>
      <p style={styles.lede}>
        Canon looks for this project. Open one to change any detail, including its name, then promote it again.
      </p>
      {sorted.length === 0 ? (
        <p style={styles.empty}>No looks promoted yet. Start one from a character card or a beat's Lookbook.</p>
      ) : (
        <ul style={styles.list}>
          {sorted.map(look => {
            const date = promotedDate(look.promotedAt)
            return (
              <li key={look.recordId} style={styles.row}>
                <div style={styles.text}>
                  <span style={styles.name}>{look.entityName}</span>
                  <span style={styles.meta}>
                    {look.entityKind === 'character' ? 'Character' : 'Location'}
                    {date ? ` · promoted ${date}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  style={styles.button}
                  aria-label={`Open ${look.entityName}`}
                  onClick={() => looks.openLook(
                    { entityKind: look.entityKind, entityId: look.entityId, entityName: look.entityName },
                    { fromPromoted: true },
                  )}
                >
                  Open
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 },
  // Matches the Story Bible's group headings.
  heading: {
    fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: 'var(--fg-subtle)', marginTop: 28, marginBottom: 4,
  },
  lede: { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-muted)', margin: 0, maxWidth: '72ch' },
  empty: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', fontStyle: 'italic', margin: 0 },
  list: { listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1, var(--surface-2))',
  },
  text: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  name: { fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' },
  meta: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-muted)' },
  button: {
    border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--fg)',
    fontFamily: 'var(--font-body)', fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer', flexShrink: 0,
  },
}
