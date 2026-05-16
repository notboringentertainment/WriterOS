import React, { useState } from 'react'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'

export interface ProjectFormatSelectorProps {
  value: unknown
  onChange: (next: ProjectFormat) => void
  ariaLabel?: string
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

export function ProjectFormatSelector({
  value,
  onChange,
  ariaLabel = 'Format',
  style,
}: ProjectFormatSelectorProps) {
  const [focused, setFocused] = useState(false)
  const normalizedValue = normalizeProjectFormat(value)

  return (
    <select
      aria-label={ariaLabel}
      value={normalizedValue}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange(normalizeProjectFormat(event.target.value))}
      style={{
        ...(focused ? selectFocusStyle : selectStyle),
        ...style,
      }}
    >
      <option value="feature">Feature</option>
      <option value="series">Series</option>
    </select>
  )
}
