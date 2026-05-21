import React from 'react'

interface Character {
  id: string
  name: string
  role: string
  wound: string
  want: string
  need: string
  arc: string
}

interface CharacterCardProps {
  character: Character
  onUpdate: (id: string, patch: Partial<Character>) => void
}

export function CharacterCard({ character, onUpdate }: CharacterCardProps) {
  const field = (key: keyof Omit<Character, 'id' | 'name'>, label: string, placeholder: string) => (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      <input
        value={character[key]}
        onChange={e => onUpdate(character.id, { [key]: e.target.value })}
        placeholder={placeholder}
        style={styles.fieldInput}
      />
    </div>
  )

  return (
    <div style={styles.card}>
      <input
        value={character.name}
        onChange={e => onUpdate(character.id, { name: e.target.value })}
        style={styles.nameInput}
        placeholder="Character name"
      />
      <div style={styles.grid}>
        {field('role',  'Role',  'Protagonist, Antagonist, Ally…')}
        {field('wound', 'Wound', 'What broke them in the past?')}
        {field('want',  'Want',  'What do they think they need?')}
        {field('need',  'Need',  'What do they actually need?')}
        {field('arc',   'Arc',   'How do they change?')}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
  },
  nameInput: {
    width: '100%',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 16,
    padding: '0 0 10px 0',
    marginBottom: 16,
    outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  fieldInput: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
  },
}
