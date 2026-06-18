import React, { useEffect, useState } from 'react'

interface ThreeZoneShellProps {
  /** Structure Spine — documents + structure tree. Top region of the left zone; owns primary scroll. */
  spine: React.ReactNode
  /** Context Console — lean, pinned, height-bounded state. Bottom region of the left zone. */
  console: React.ReactNode
  /** Paper — the writing surface. Primary zone. */
  paper: React.ReactNode
  /** Teleprompter — Morgan's voice surface (right zone). */
  teleprompter: React.ReactNode
  /**
   * Full-bleed paper with all chrome hidden (left zone, teleprompter, summon).
   * Used by modes like Writer's Room. The zones stay mounted but hidden via CSS so the
   * paper subtree is never remounted across the transition.
   */
  chromeless?: boolean
}

type SummonTarget = 'spine' | 'state' | 'morgan'

const SUMMON_LABEL: Record<SummonTarget, string> = {
  spine: 'Spine',
  state: 'State',
  morgan: 'Morgan',
}

/**
 * Three-zone working surface: [ Left Zone | Paper | Teleprompter ].
 *
 * The LEFT ZONE is ONE column with two stacked regions and independent scroll:
 *   · Structure Spine (top, primary scroll — absorbs project growth)
 *   · Context Console (bottom, pinned, bounded — compacts via @media, overflows internally, never clips)
 *
 * Responsive FORMS are driven by true CSS @media queries in index.css:
 *   ≥1440 panel · 1100–1439 strip · <1100 overlay (paper-primary + accessible summon).
 * This component owns only the structure and the summon-overlay state; the forms are CSS.
 *
 * Content is supplied entirely via slots — no project-specific labels, logic, or layout live here.
 */
export function ThreeZoneShell({ spine, console, paper, teleprompter, chromeless = false }: ThreeZoneShellProps) {
  const [summoned, setSummoned] = useState<SummonTarget | null>(null)

  useEffect(() => {
    if (chromeless) setSummoned(null)
  }, [chromeless])

  const overlayContent =
    summoned === 'spine' ? spine : summoned === 'state' ? console : summoned === 'morgan' ? teleprompter : null

  return (
    <div className={chromeless ? 'three-zone three-zone--chromeless' : 'three-zone'}>
      <div className="zone-left" aria-label="Structure and state">
        <div className="zone-spine" aria-label="Structure Spine">{spine}</div>
        <div className="zone-console" aria-label="Context Console">{console}</div>
      </div>

      <main className="zone-paper">{paper}</main>

      <aside className="zone-tele" aria-label="Morgan">{teleprompter}</aside>

      {/* Summon bar — only visible in the <1100 overlay form (CSS). Real buttons, not hover. */}
      <nav className="zone-summon" aria-label="Summon">
        {(Object.keys(SUMMON_LABEL) as SummonTarget[]).map(target => (
          <button
            key={target}
            type="button"
            className="zone-summon-btn"
            onClick={() => setSummoned(target)}
          >
            {SUMMON_LABEL[target]}
          </button>
        ))}
      </nav>

      {!chromeless && summoned && (
        <div
          className="zone-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={SUMMON_LABEL[summoned]}
        >
          <div className="zone-overlay-bar">
            <span className="zone-overlay-title">{SUMMON_LABEL[summoned]}</span>
            <button
              type="button"
              className="zone-overlay-close"
              onClick={() => setSummoned(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="zone-overlay-body">{overlayContent}</div>
        </div>
      )}
    </div>
  )
}
