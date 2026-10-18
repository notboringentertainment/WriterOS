import React, { useEffect } from 'react'
import type {
  AuthoredDocumentState,
  StoryBibleDocumentContent,
} from '@shared/documents'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import type { ProjectMemorySnapshot } from '@shared/projectMemory'
import { StoryBibleSectionsView } from './storyBible/StoryBibleSectionsView'
import type { StoryBibleSection } from '../../lib/shellState'

export interface StoryBibleTabProps {
  document: AuthoredDocumentState<StoryBibleDocumentContent>
  projectFormat?: ProjectFormat
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentPatch: (patch: Partial<StoryBibleDocumentContent>) => void
  onMigrateLegacyStoryBible?: () => void
  onSectionChange?: (section: StoryBibleSection) => void
  onClear: () => void
  snapshot?: ProjectMemorySnapshot
  onAskMorgan?: (text: string) => Promise<void>
}

export function StoryBibleTab({
  document,
  projectFormat = 'feature',
  onProjectFormatChange,
  onContentPatch,
  onMigrateLegacyStoryBible,
  onSectionChange,
  onClear,
  snapshot,
  onAskMorgan,
}: StoryBibleTabProps) {
  const activeFormat = normalizeProjectFormat(projectFormat)
  const migratedFromLegacy = document.viewPreferences?.migratedFromLegacyStoryBible === true

  useEffect(() => {
    if (!migratedFromLegacy) {
      onMigrateLegacyStoryBible?.()
    }
  }, [migratedFromLegacy, onMigrateLegacyStoryBible])

  function handleFormatChange(next: ProjectFormat) {
    if (next === activeFormat) return
    if (onProjectFormatChange) {
      onProjectFormatChange(next)
      return
    }
    onContentPatch({
      cover: {
        ...document.content.cover,
        format: next,
      },
    })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 40px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 6,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 36,
                color: 'var(--fg)',
                margin: 0,
              }}
            >
              Story Facts
            </h2>
            <p
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 13,
                color: 'var(--fg-muted)',
                margin: '8px 0 0',
              }}
            >
              Your story's facts in your words.
            </p>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '8px 0 0' }}>
              This isn't a traditional story bible. That page lives in Pages.
            </p>
          </div>
          <ProjectFormatSelector
            value={activeFormat}
            onChange={handleFormatChange}
            variant="standalone"
          />
        </div>
      </div>

      <StoryBibleSectionsView
        format={activeFormat}
        content={document.content}
        snapshot={snapshot}
        onContentPatch={onContentPatch}
        onSectionChange={onSectionChange}
        onAskMorgan={onAskMorgan}
        onClear={onClear}
      />
    </div>
  )
}
