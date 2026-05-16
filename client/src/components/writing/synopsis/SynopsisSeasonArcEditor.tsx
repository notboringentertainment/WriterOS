import React from 'react'
import { GuidedSection } from '../../shared/GuidedSection'

export interface SynopsisSeasonArcEditorProps {
  value: string
  onChange: (next: string) => void
}

export function SynopsisSeasonArcEditor({ value, onChange }: SynopsisSeasonArcEditorProps) {
  return (
    <GuidedSection
      label="Season One Arc"
      guidance="Where does the central tension start, escalate, and land at the end of the season?"
      value={value}
      onChange={onChange}
    />
  )
}
