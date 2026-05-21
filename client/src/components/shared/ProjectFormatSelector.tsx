import React, { useState } from 'react'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'

export interface ProjectFormatSelectorProps {
  value: unknown
  onChange: (next: ProjectFormat) => void
  ariaLabel?: string
  variant?: 'standalone' | 'inline'
  style?: React.CSSProperties
}

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  padding: '7px 10px',
  borderRadius: 6,
  outline: 'none',
  minWidth: 120,
}

const selectFocusStyle: React.CSSProperties = {
  ...selectStyle,
  borderColor: 'var(--fg-muted)',
}

const inlineSelectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  color: 'var(--fg)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid transparent',
  outline: 'none',
  fontSize: '0.9rem',
  padding: '4px 0',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  transition: 'border-color 0.15s',
}

const inlineSelectFocusStyle: React.CSSProperties = {
  ...inlineSelectStyle,
  borderBottomColor: 'var(--border)',
}

export function ProjectFormatSelector({
  value,
  onChange,
  ariaLabel = 'Format',
  variant = 'standalone',
  style,
}: ProjectFormatSelectorProps) {
  const [focused, setFocused] = useState(false)
  const normalizedValue = normalizeProjectFormat(value)
  const baseStyle = variant === 'inline'
    ? (focused ? inlineSelectFocusStyle : inlineSelectStyle)
    : (focused ? selectFocusStyle : selectStyle)

  return (
    <select
      aria-label={ariaLabel}
      value={normalizedValue}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange(normalizeProjectFormat(event.target.value))}
      style={{
        ...baseStyle,
        ...style,
      }}
    >
      <option value="feature">Feature</option>
      <option value="series">Series</option>
    </select>
  )
}
