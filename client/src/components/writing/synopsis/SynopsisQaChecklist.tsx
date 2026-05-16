import React from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'

type Qa = SynopsisDocumentContent['qa']

export interface SynopsisQaChecklistProps {
  value: Qa
  onToggle: (key: keyof Qa, next: boolean) => void
}

const QA_ITEMS: { key: keyof Qa; label: string }[] = [
  { key: 'protagonistNamedEarly', label: 'Protagonist named early' },
  { key: 'goalClear', label: 'Goal clear' },
  { key: 'obstacleClear', label: 'Obstacle clear' },
  { key: 'stakesClear', label: 'Stakes clear' },
  { key: 'endingRevealed', label: 'Ending revealed' },
  { key: 'paragraphsConnectCausally', label: 'Paragraphs connect causally' },
  { key: 'toneMatchesProject', label: 'Tone matches intended project' },
  { key: 'noUnnecessarySubplot', label: 'No unnecessary subplot' },
]

export function SynopsisQaChecklist({ value, onToggle }: SynopsisQaChecklistProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-muted)',
          margin: 0,
        }}
      >
        Review
      </h3>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 24px',
        }}
      >
        {QA_ITEMS.map(item => (
          <label
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexBasis: 'calc(50% - 12px)',
              minWidth: 180,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--fg)',
            }}
          >
            <input
              type="checkbox"
              checked={value[item.key]}
              onChange={e => onToggle(item.key, e.target.checked)}
              style={{ accentColor: 'var(--fg)', cursor: 'pointer' }}
            />
            {item.label}
          </label>
        ))}
      </div>
    </div>
  )
}
