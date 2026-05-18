import React, { useEffect } from 'react'
import type {
  AuthoredDocumentState,
  DocumentViewPreferences,
  StoryBibleDocumentContent,
} from '@shared/documents'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import { StoryBibleStoryCoachEditView } from './storyBible/StoryBibleStoryCoachEditView'
import type { StoryBibleSection } from '../../lib/shellState'

export interface StoryBibleTabProps {
  document: AuthoredDocumentState<StoryBibleDocumentContent>
  projectFormat?: ProjectFormat
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentPatch: (patch: Partial<StoryBibleDocumentContent>) => void
  onViewPreferencesPatch?: (patch: Partial<DocumentViewPreferences>) => void
  onMigrateLegacyStoryBible?: () => void
  onSectionChange?: (section: StoryBibleSection) => void
  onClear: () => void
}

export function StoryBibleTab({
  document,
  projectFormat = 'feature',
  onProjectFormatChange,
  onContentPatch,
  onMigrateLegacyStoryBible,
  onSectionChange,
  onClear,
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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
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
                fontWeight: 600,
                fontSize: 24,
                color: 'var(--fg)',
                margin: 0,
              }}
            >
              Story Bible
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--fg-muted)',
                fontStyle: 'italic',
                margin: '4px 0 0',
              }}
            >
              Identity, continuity, and the rules the world cannot break.
            </p>
          </div>
          <ProjectFormatSelector
            value={activeFormat}
            onChange={handleFormatChange}
            variant="standalone"
          />
        </div>
      </div>

      <StoryBibleStoryCoachEditView
        format={activeFormat}
        content={document.content}
        onContentPatch={onContentPatch}
        onSectionChange={onSectionChange}
        onClear={onClear}
      />
    </div>
  )
}
