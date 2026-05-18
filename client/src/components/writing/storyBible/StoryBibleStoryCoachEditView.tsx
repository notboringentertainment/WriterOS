import React, { useEffect, useRef, useState } from 'react'
import type { StoryBibleDocumentContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'
import type { StoryBibleSection } from '../../../lib/shellState'
import { getDeckForFormat, type StoryBiblePromptDef } from '../../../lib/storyBibleDeck'
import { StoryBibleQuestionCard } from './StoryBibleQuestionCard'
import { StoryBibleReadinessReview } from './StoryBibleReadinessReview'

export interface StoryBibleStoryCoachEditViewProps {
  format: ProjectFormat
  content: StoryBibleDocumentContent
  onContentPatch: (patch: Partial<StoryBibleDocumentContent>) => void
  onSectionChange?: (section: StoryBibleSection) => void
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

function chunkByGroup(deck: readonly StoryBiblePromptDef[]) {
  const out: { group: string; prompts: StoryBiblePromptDef[] }[] = []
  for (const prompt of deck) {
    const last = out[out.length - 1]
    if (last && last.group === prompt.groupLabel) {
      last.prompts.push(prompt)
    } else {
      out.push({ group: prompt.groupLabel, prompts: [prompt] })
    }
  }
  return out
}

function sectionForGroup(group: string): StoryBibleSection {
  switch (group) {
    case 'The people':
      return 'characters'
    case 'The tone':
      return 'tone'
    case 'The world':
      return 'world'
    case 'The shape':
    case 'The engine':
    case 'The pilot':
    case 'The season':
    case 'The future':
    case 'The reach':
      return 'rules'
    case 'The pitch':
    case 'The cover':
    default:
      return 'themes'
  }
}

export function StoryBibleStoryCoachEditView({
  format,
  content,
  onContentPatch,
  onSectionChange,
  onClear,
}: StoryBibleStoryCoachEditViewProps) {
  const groups = chunkByGroup(getDeckForFormat(format))
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
      return
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setClearArmed(false)
    onClear()
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column' }}
      data-testid="story-bible-story-coach-edit-view"
      data-active-format={format}
    >
      {groups.map((group) => {
        const section = sectionForGroup(group.group)
        return (
          <section
            key={group.group}
            onFocusCapture={() => onSectionChange?.(section)}
            data-testid={`story-bible-group-${section}`}
          >
            <h3
              style={groupHeadingStyle}
              onClick={() => onSectionChange?.(section)}
            >
              {group.group}
            </h3>
            {group.prompts.map((prompt) => (
              <StoryBibleQuestionCard
                key={prompt.id}
                prompt={prompt}
                content={content}
                onPatch={onContentPatch}
              />
            ))}
          </section>
        )
      })}

      <StoryBibleReadinessReview format={format} content={content} />

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
          {clearArmed ? 'Click again to confirm' : 'Clear story bible'}
        </button>
      </div>
    </div>
  )
}
