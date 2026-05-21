import React, { useEffect, useRef, useState } from 'react'
import type { SynopsisDocumentContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'
import { getDeckForFormat, type SynopsisPromptDef } from '../../../lib/synopsisDeck'
import { SynopsisQuestionCard } from './SynopsisQuestionCard'
import { SynopsisReadinessReview } from './SynopsisReadinessReview'

export interface SynopsisStoryCoachEditViewProps {
  format: ProjectFormat
  content: SynopsisDocumentContent
  onContentPatch: (patch: Partial<SynopsisDocumentContent>) => void
  onClear: () => void
}

const CLEAR_TIMEOUT_MS = 3000

const groupHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.85rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--fg-subtle)',
  marginTop: 28,
  marginBottom: 4,
}

function chunkByGroup(deck: readonly SynopsisPromptDef[]) {
  const out: { group: string; prompts: SynopsisPromptDef[] }[] = []
  for (const p of deck) {
    const last = out[out.length - 1]
    if (last && last.group === p.groupLabel) {
      last.prompts.push(p)
    } else {
      out.push({ group: p.groupLabel, prompts: [p] })
    }
  }
  return out
}

export function SynopsisStoryCoachEditView({
  format,
  content,
  onContentPatch,
  onClear,
}: SynopsisStoryCoachEditViewProps) {
  const deck = getDeckForFormat(format)
  const groups = chunkByGroup(deck)

  const [clearArmed, setClearArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  function handleClearClick() {
    if (!clearArmed) {
      setClearArmed(true)
      timerRef.current = setTimeout(() => {
        setClearArmed(false)
        timerRef.current = null
      }, CLEAR_TIMEOUT_MS)
    } else {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setClearArmed(false)
      onClear()
    }
  }

  function handleToggleFeatureCheck(
    key: keyof SynopsisDocumentContent['qa'],
    next: boolean,
  ) {
    onContentPatch({ qa: { ...content.qa, [key]: next } })
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column' }}
      data-testid="synopsis-story-coach-edit-view"
      data-active-format={format}
    >
      {groups.map((g) => (
        <React.Fragment key={g.group}>
          <h3 style={groupHeadingStyle}>{g.group}</h3>
          {g.prompts.map((p) => (
            <SynopsisQuestionCard
              key={p.id}
              prompt={p}
              content={content}
              onPatch={onContentPatch}
            />
          ))}
        </React.Fragment>
      ))}

      <SynopsisReadinessReview
        format={format}
        content={content}
        onToggleFeatureCheck={handleToggleFeatureCheck}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
        <button
          type="button"
          onClick={handleClearClick}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: clearArmed ? 'var(--fg)' : 'var(--fg-muted)',
            background: clearArmed ? 'var(--surface-2)' : 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {clearArmed ? 'Click again to confirm' : 'Clear synopsis'}
        </button>
      </div>
    </div>
  )
}
