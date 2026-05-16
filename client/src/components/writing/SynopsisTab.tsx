import React from 'react'
import type { AuthoredDocumentState, SynopsisDocumentContent } from '@shared/documents'
import { SynopsisEditView } from './synopsis/SynopsisEditView'
import { SynopsisDocumentView } from './synopsis/SynopsisDocumentView'
import { SynopsisViewToggle } from './synopsis/SynopsisViewToggle'

export interface SynopsisTabProps {
  document: AuthoredDocumentState<SynopsisDocumentContent>
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
  onContentPatch,
  onViewPreferencesPatch,
  onClear,
}: SynopsisTabProps) {
  const activeView = document.viewPreferences?.activeView ?? 'edit'
  const composeMode = deriveComposeMode(document)

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
      {activeView === 'edit' ? (
        <SynopsisEditView
          content={document.content}
          composeMode={composeMode}
          onContentPatch={onContentPatch}
          onComposeModeChange={(next) => onViewPreferencesPatch({ synopsisComposeMode: next })}
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
