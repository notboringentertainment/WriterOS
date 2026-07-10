// Keyed stage wrapper: remounts on stage change so the entrance animation plays
// once per stage transition, keeping the ritual conversational instead of formy.

import React from 'react'

export interface RitualStageProps {
  stageKey: string
  children: React.ReactNode
}

export function RitualStage({ stageKey, children }: RitualStageProps) {
  return (
    <div key={stageKey} className="ritual-stage" data-testid={`ritual-stage-${stageKey}`}>
      {children}
    </div>
  )
}
