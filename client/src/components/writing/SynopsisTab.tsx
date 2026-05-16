import React from 'react'
import type { AuthoredDocumentState, SynopsisDocumentContent } from '@shared/documents'
import { createEmptySeriesContent } from '@shared/documents'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { SynopsisEditView } from './synopsis/SynopsisEditView'
import { SynopsisSeriesEditView } from './synopsis/SynopsisSeriesEditView'
import { SynopsisDocumentView } from './synopsis/SynopsisDocumentView'
import { SynopsisViewToggle } from './synopsis/SynopsisViewToggle'

export interface SynopsisTabProps {
  document: AuthoredDocumentState<SynopsisDocumentContent>
  projectFormat?: ProjectFormat
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentPatch: (patch: Partial<SynopsisDocumentContent>) => void
  onViewPreferencesPatch: (patch: {
    activeView?: 'edit' | 'document'
    synopsisComposeMode?: 'prose' | 'paragraphs'
  }) => void
  onClear: () => void
}

function deriveComposeMode(
  document: AuthoredDocumentState<SynopsisDocumentContent>,
): 'prose' | 'paragraphs' {
  // Stored preference always wins
  const stored = document.viewPreferences?.synopsisComposeMode
  if (stored != null) return stored

  // Default-mode heuristic per plan §2:
  // If prose.opening is non-empty AND escalation/middle/climax/resolution are ALL empty → 'prose'
  // Otherwise → 'paragraphs'
  const { opening, escalation, middle, climax, resolution } = document.content.prose
  if (
    opening.trim() !== '' &&
    escalation.trim() === '' &&
    middle.trim() === '' &&
    climax.trim() === '' &&
    resolution.trim() === ''
  ) {
    return 'prose'
  }
  return 'paragraphs'
}

export function SynopsisTab({
  document,
  projectFormat = 'feature',
  onProjectFormatChange,
  onContentPatch,
  onViewPreferencesPatch,
  onClear,
}: SynopsisTabProps) {
  const activeView = document.viewPreferences?.activeView ?? 'edit'
  const composeMode = deriveComposeMode(document)

  const activeFormat = normalizeProjectFormat(projectFormat)

  function handleContentPatch(patch: Partial<SynopsisDocumentContent>) {
    const nextFormat = patch.header?.format !== undefined
      ? normalizeProjectFormat(patch.header.format)
      : undefined

    if (nextFormat !== undefined && nextFormat !== activeFormat && onProjectFormatChange) {
      onProjectFormatChange(nextFormat)
      return
    }

    const normalizedPatch = nextFormat === undefined
      ? patch
      : { ...patch, header: { ...patch.header!, format: nextFormat } }

    if (nextFormat === 'series' && document.content.series === undefined) {
      onContentPatch({ ...normalizedPatch, series: createEmptySeriesContent() })
    } else {
      onContentPatch(normalizedPatch)
    }
  }

  return (
    <div
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '32px 24px 64px',
      }}
    >
      {/* Header row */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
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
              Synopsis
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
              Reader-facing story spine.
            </p>
          </div>
          <SynopsisViewToggle
            value={activeView}
            onChange={(next) => onViewPreferencesPatch({ activeView: next })}
          />
        </div>
      </div>

      {/* Content */}
      {activeView === 'edit' && activeFormat === 'feature' ? (
        <SynopsisEditView
          content={document.content}
          composeMode={composeMode}
          onContentPatch={handleContentPatch}
          onComposeModeChange={(next) => onViewPreferencesPatch({ synopsisComposeMode: next })}
          onClear={onClear}
        />
      ) : activeView === 'edit' && activeFormat === 'series' ? (
        <SynopsisSeriesEditView
          content={document.content}
          onContentPatch={handleContentPatch}
          onClear={onClear}
        />
      ) : (
        <SynopsisDocumentView
          content={document.content}
          updatedAt={document.updatedAt}
        />
      )}
    </div>
  )
}
