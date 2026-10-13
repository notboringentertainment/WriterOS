import React, { createContext, useContext } from 'react'
import type { LookTarget, PromotedLook } from './lookDraftEdits'

// Entry points into the Look panel (look sessions plan, Task 6): the Lookbook
// on each beat and the Story Bible character card. Without a provider the
// entry points render nothing, so surfaces outside a project are unchanged.

export interface OpenLookOptions {
  /** Opened from a promoted look (the Looks list or the picker): start the draft filled with its answers. */
  fromPromoted?: boolean
}

export interface LookSessionsContextValue {
  openLook: (target: LookTarget, options?: OpenLookOptions) => void
  /** Story Bible character names, for the beat entry's picker. */
  characterNames: string[]
  promotedLooks: PromotedLook[]
}

const LookSessionsContext = createContext<LookSessionsContextValue | null>(null)

export function LookSessionsProvider({ value, children }: { value: LookSessionsContextValue; children: React.ReactNode }) {
  return <LookSessionsContext.Provider value={value}>{children}</LookSessionsContext.Provider>
}

export function useLookSessions(): LookSessionsContextValue | null {
  return useContext(LookSessionsContext)
}
