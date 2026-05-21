import React from 'react'
import type { StoryBibleCharacter } from '@shared/documents'
import { StoryBibleCharacterCard } from './StoryBibleCharacterCard'

export interface StoryBibleCharactersEditorProps {
  value: readonly StoryBibleCharacter[]
  onChange: (next: StoryBibleCharacter[]) => void
}

const emptyCharacter = (): StoryBibleCharacter => ({
  id: crypto.randomUUID(),
  name: '',
  role: '',
  want: '',
  need: '',
  flaw: '',
  secret: '',
  contradiction: '',
  arc: '',
  relationshipPressure: '',
  behavioralAnchors: '',
  speechPatterns: '',
  neverWriteThemAs: '',
  continuityFacts: '',
})

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const buttonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.86rem',
  padding: '6px 10px',
  cursor: 'pointer',
}

const emptyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.86rem',
  color: 'var(--fg-muted)',
  margin: 0,
  lineHeight: 1.5,
}

export function StoryBibleCharactersEditor({
  value,
  onChange,
}: StoryBibleCharactersEditorProps) {
  function updateCharacter(id: string, nextCharacter: StoryBibleCharacter) {
    onChange(value.map((character) => (character.id === id ? nextCharacter : character)))
  }

  function removeCharacter(id: string) {
    onChange(value.filter((character) => character.id !== id))
  }

  function addCharacter() {
    onChange([...value, emptyCharacter()])
  }

  return (
    <div style={containerStyle}>
      {value.length === 0 && (
        <p style={emptyStyle}>No major characters yet.</p>
      )}
      {value.map((character) => (
        <StoryBibleCharacterCard
          key={character.id}
          character={character}
          onChange={(nextCharacter) => updateCharacter(character.id, nextCharacter)}
          onRemove={() => removeCharacter(character.id)}
        />
      ))}
      <button type="button" style={buttonStyle} onClick={addCharacter}>
        Add a character
      </button>
    </div>
  )
}
