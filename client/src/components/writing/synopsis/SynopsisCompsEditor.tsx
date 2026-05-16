import React from 'react'
import { GuidedSection } from '../../shared/GuidedSection'

export interface SynopsisCompsEditorProps {
  value: string
  onChange: (next: string) => void
}

export function SynopsisCompsEditor({ value, onChange }: SynopsisCompsEditorProps) {
  return (
    <GuidedSection
      label="Comps & Why This Show Now"
      guidance="Optional. Two or three comps, plus one sentence on why this story right now."
      value={value}
      onChange={onChange}
    />
  )
}
