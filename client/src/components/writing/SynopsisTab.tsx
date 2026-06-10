import React, { useCallback, useRef, useState } from 'react'
import type { AuthoredDocumentState, SynopsisDocumentContent } from '@shared/documents'
import { createEmptySeriesContent } from '@shared/documents'
import type { ComposeIdentity, ComposedDocument } from '@shared/compose/types'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { DocumentViewToggle } from '../shared/DocumentViewToggle'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import { requestSynopsisCompose } from '../../lib/synopsisComposeClient'
import { SynopsisStoryCoachEditView } from './synopsis/SynopsisStoryCoachEditView'
import { SynopsisDocumentView } from './synopsis/SynopsisDocumentView'

export interface SynopsisTabProps {
  document: AuthoredDocumentState<SynopsisDocumentContent>
  projectFormat?: ProjectFormat
  identity?: ComposeIdentity
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentPatch: (patch: Partial<SynopsisDocumentContent>) => void
  onViewPreferencesPatch: (patch: {
    activeView?: 'edit' | 'document'
  }) => void
  onComposed?: (composed: ComposedDocument) => void
  onClear: () => void
}

export function SynopsisTab({
  document,
  projectFormat = 'feature',
  identity = { title: '', genre: '' },
  onProjectFormatChange,
  onContentPatch,
  onViewPreferencesPatch,
  onComposed,
  onClear,
}: SynopsisTabProps) {
  const activeView = document.viewPreferences?.activeView ?? 'edit'
  const activeFormat = normalizeProjectFormat(projectFormat)

  const [isComposing, setIsComposing] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const isComposingRef = useRef(false)

  const handleCompose = useCallback(async () => {
    if (isComposingRef.current) return
    isComposingRef.current = true
    setIsComposing(true)
    setComposeError(null)
    try {
      const result = await requestSynopsisCompose({ content: document.content, format: activeFormat, identity })
      if (result.ok) {
        onComposed?.(result.composed)
      } else {
        setComposeError('WriterOS could not compose this document right now.')
      }
    } catch {
      setComposeError('WriterOS could not compose this document right now.')
    } finally {
      isComposingRef.current = false
      setIsComposing(false)
    }
  }, [document.content, activeFormat, identity, onComposed])

  function handleFormatChange(next: ProjectFormat) {
    if (next === activeFormat) return
    if (onProjectFormatChange) {
      onProjectFormatChange(next)
      return
    }
    // Fallback when no project-format callback is supplied: mirror to header
    // and lazy-init series content if the writer switched into series mode.
    const headerPatch: Partial<SynopsisDocumentContent> = {
      header: { ...document.content.header, format: next },
    }
    if (next === 'series' && document.content.series === undefined) {
      headerPatch.series = createEmptySeriesContent()
    }
    onContentPatch(headerPatch)
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
              Help an outside reader understand your story.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ProjectFormatSelector
              value={activeFormat}
              onChange={handleFormatChange}
              variant="standalone"
            />
            <DocumentViewToggle
              value={activeView}
              onChange={(next) => onViewPreferencesPatch({ activeView: next })}
            />
          </div>
        </div>
      </div>

      {activeView === 'edit' ? (
        <SynopsisStoryCoachEditView
          format={activeFormat}
          content={document.content}
          onContentPatch={onContentPatch}
          onClear={onClear}
        />
      ) : (
        <SynopsisDocumentView
          content={document.content}
          format={activeFormat}
          identity={identity}
          composed={document.composed}
          isComposing={isComposing}
          error={composeError}
          onCompose={handleCompose}
        />
      )}
    </div>
  )
}
