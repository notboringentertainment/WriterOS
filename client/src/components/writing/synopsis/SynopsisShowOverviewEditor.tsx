import React from 'react'
import { GuidedSection } from '../../shared/GuidedSection'

export interface SynopsisShowOverviewEditorProps {
  value: string
  onChange: (next: string) => void
}

export function SynopsisShowOverviewEditor({ value, onChange }: SynopsisShowOverviewEditorProps) {
  return (
    <GuidedSection
      label="Show Overview"
      guidance="What's the renewable conflict? What world? What tone?"
      value={value}
      onChange={onChange}
    />
  )
}
