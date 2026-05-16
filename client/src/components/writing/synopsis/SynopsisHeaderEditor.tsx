import React, { useState } from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'

type Header = SynopsisDocumentContent['header']

interface SynopsisHeaderEditorProps {
  value: Header
  onChange: (patch: Partial<Header>) => void
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.7rem',
  color: 'var(--fg-subtle)',
  minWidth: '96px',
  paddingRight: '16px',
  paddingTop: '6px',
  userSelect: 'none',
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  color: 'var(--fg)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid transparent',
  outline: 'none',
  fontSize: '0.9rem',
  padding: '4px 0',
  width: '100%',
  transition: 'border-color 0.15s',
}

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderBottomColor: 'var(--border)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '4px 0',
}

function InlineInput({
  value,
  onChange,
  onBlur,
  onFocus,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  'aria-label': string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      style={focused ? inputFocusStyle : inputStyle}
      onFocus={e => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={e => {
        setFocused(false)
        onBlur?.(e)
      }}
    />
  )
}

export function SynopsisHeaderEditor({ value, onChange }: SynopsisHeaderEditorProps) {
  const [compsInput, setCompsInput] = useState<string | null>(null)
  const [compsFocused, setCompsFocused] = useState(false)

  const compsDisplayValue = compsFocused
    ? (compsInput ?? value.comps.join(', '))
    : value.comps.join(', ')

  function handleCompsFocus() {
    setCompsFocused(true)
    setCompsInput(value.comps.join(', '))
  }

  function handleCompsBlur() {
    const raw = compsInput ?? ''
    const parsed = raw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    onChange({ comps: parsed })
    setCompsFocused(false)
    setCompsInput(null)
  }

  return (
    <div>
      <div style={rowStyle}>
        <span style={labelStyle}>Title</span>
        <InlineInput
          aria-label="title"
          value={value.title}
          onChange={e => onChange({ title: e.target.value })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Writer</span>
        <InlineInput
          aria-label="writer"
          value={value.writer}
          onChange={e => onChange({ writer: e.target.value })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Format</span>
        <InlineInput
          aria-label="format"
          value={value.format}
          onChange={e => onChange({ format: e.target.value })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Genre</span>
        <InlineInput
          aria-label="genre"
          value={value.genre}
          onChange={e => onChange({ genre: e.target.value })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Runtime</span>
        <InlineInput
          aria-label="targetRuntime"
          value={value.targetRuntime}
          onChange={e => onChange({ targetRuntime: e.target.value })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Comps</span>
        <input
          type="text"
          aria-label="comps"
          value={compsDisplayValue}
          style={compsFocused ? inputFocusStyle : inputStyle}
          onFocus={handleCompsFocus}
          onBlur={handleCompsBlur}
          onChange={e => setCompsInput(e.target.value)}
        />
      </div>
    </div>
  )
}
