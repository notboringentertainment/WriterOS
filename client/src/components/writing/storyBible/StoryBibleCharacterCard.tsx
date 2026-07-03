import React, { useState } from 'react'
import type { StoryBibleCharacter } from '@shared/documents'

export interface StoryBibleCharacterCardProps {
  character: StoryBibleCharacter
  onChange: (next: StoryBibleCharacter) => void
  onRemove: () => void
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  padding: 14,
}

const summaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const titleStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}

const nameStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontSize: '0.98rem',
  color: 'var(--fg)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const roleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  color: 'var(--fg-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.8rem',
  padding: '4px 8px',
  cursor: 'pointer',
  flexShrink: 0,
}

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--danger, #b94a48)',
}

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
  paddingTop: 14,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  color: 'var(--fg-muted)',
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.92rem',
  color: 'var(--fg)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '8px 10px',
  width: '100%',
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 74,
  resize: 'vertical',
  lineHeight: 1.45,
}

function displayText(value: string, fallback: string): string {
  return value.trim() || fallback
}

export function StoryBibleCharacterCard({
  character,
  onChange,
  onRemove,
}: StoryBibleCharacterCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)

  function patch(patch: Partial<StoryBibleCharacter>) {
    onChange({ ...character, ...patch })
  }

  function textField(
    key: keyof StoryBibleCharacter,
    label: string,
    placeholder: string,
    multiline = false,
  ) {
    const Control = multiline ? 'textarea' : 'input'
    return (
      <label key={key} style={fieldStyle}>
        <span style={labelStyle}>{label}</span>
        <Control
          aria-label={label}
          value={String(character[key] ?? '')}
          placeholder={placeholder}
          style={multiline ? textareaStyle : inputStyle}
          onChange={(event) => patch({ [key]: event.target.value } as Partial<StoryBibleCharacter>)}
        />
      </label>
    )
  }

  function handleRemoveClick() {
    if (!removeArmed) {
      setRemoveArmed(true)
      return
    }
    onRemove()
  }

  return (
    <article style={cardStyle} data-testid="story-bible-character-card">
      <div style={summaryStyle}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            ...buttonStyle,
            flex: 1,
            textAlign: 'left',
            padding: 0,
            border: 'none',
            color: 'inherit',
          }}
          aria-expanded={expanded}
        >
          <span style={titleStyle}>
            <span style={nameStyle}>
              {displayText(character.name, 'Untitled character')}
            </span>
            <span style={roleStyle}>{displayText(character.role, 'Role not set')}</span>
          </span>
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Close' : 'Open'}
        </button>
        <button
          type="button"
          style={removeArmed ? dangerButtonStyle : buttonStyle}
          onClick={handleRemoveClick}
        >
          {removeArmed ? 'Confirm remove' : 'Remove'}
        </button>
      </div>

      {expanded && (
        <div style={fieldGridStyle}>
          {textField('name', 'What is their name as it should appear?', 'Elena')}
          {textField('role', 'What is their role in the story?', 'Lead, rival, ally')}
          {textField('want', 'What do they want?', 'The thing they chase on purpose', true)}
          {textField('need', 'What do they need?', 'The truth they resist', true)}
          {textField('flaw', 'What is their flaw or wound?', 'The pattern that hurts them', true)}
          {textField('secret', 'What are they hiding?', 'A secret, shame, lie, or withheld truth', true)}
          {textField('contradiction', 'What contradiction makes them feel real?', 'The tension inside them', true)}
          {textField('arc', 'How do they change across the story?', 'Their beginning and end state', true)}
          {textField('relationshipPressure', 'What pressure do their key relationships put on them?', 'Who tests them and how', true)}
          {textField('continuityFacts', 'What facts about them must never contradict later?', 'Dates, injuries, promises, rules', true)}
          <div style={{ gridColumn: '1 / -1' }}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
            >
              {advancedOpen ? 'Hide more about this character' : 'More about this character'}
            </button>
          </div>
          {advancedOpen && (
            <>
              {textField('behavioralAnchors', 'What small behaviors anchor how they read on the page?', 'Gestures, habits, physical tells', true)}
              {textField('speechPatterns', 'How do they speak that sounds only like them?', 'Rhythm, vocabulary, silence, deflection', true)}
              {textField('neverWriteThemAs', 'What should this character never be written as?', 'The version that would betray them', true)}
            </>
          )}
        </div>
      )}
    </article>
  )
}
