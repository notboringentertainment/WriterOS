import React, { useCallback, useEffect, useState } from 'react'
import type {
  AuthoredDocumentState,
  DocumentViewPreferences,
  OutlineDocumentContent,
  OutlineEpisode,
} from '@shared/documents'
import type { ComposeIdentity, ComposedDocument } from '@shared/compose/types'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { DocumentViewToggle } from '../shared/DocumentViewToggle'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import {
  hasFeatureOutlineAnswers,
  hasOutlineAnswers,
  hasSeriesOutlineAnswers,
  seedEpisodes101To103,
} from '../../lib/outlineDeck'
import { requestOutlineCompose } from '../../lib/composeClient'
import { OutlineEditView } from './outline/OutlineEditView'
import { OutlineDocumentView } from './outline/OutlineDocumentView'
import { ClearOutlineDialog } from './outline/ClearOutlineDialog'

type EpisodeTextField = Exclude<keyof OutlineEpisode, 'id' | 'number'>

interface OutlineTabProps {
  document: AuthoredDocumentState<OutlineDocumentContent>
  projectFormat?: ProjectFormat
  identity: ComposeIdentity
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentChange: (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void
  onAddEpisode: () => void
  onEpisodeFieldChange: (episodeId: string, field: EpisodeTextField, value: string) => void
  onViewPreferencesPatch: (patch: Partial<DocumentViewPreferences>) => void
  onComposed: (composed: ComposedDocument) => void
  onClear?: (options?: { keep?: 'all' | 'foundations' }) => void
}

export function OutlineTab({
  document,
  projectFormat = 'feature',
  identity,
  onProjectFormatChange,
  onContentChange,
  onAddEpisode,
  onEpisodeFieldChange,
  onViewPreferencesPatch,
  onComposed,
  onClear,
}: OutlineTabProps) {
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const activeFormat = normalizeProjectFormat(projectFormat)
  const activeView = document.viewPreferences?.activeView ?? 'edit'
  const hasContent = hasOutlineAnswers(document.content)

  const handleCompose = useCallback(async () => {
    setIsComposing(true)
    setComposeError(null)
    try {
      const result = await requestOutlineCompose({
        content: document.content,
        format: activeFormat,
        identity,
      })
      if (result.ok) {
        onComposed(result.composed)
      } else {
        setComposeError('WriterOS could not compose this document right now.')
      }
    } catch {
      setComposeError('WriterOS could not compose this document right now.')
    } finally {
      setIsComposing(false)
    }
  }, [document.content, activeFormat, identity, onComposed])

  useEffect(() => {
    if (activeFormat === 'series' && document.content.episodes.length === 0) {
      onContentChange(seedEpisodes101To103)
    }
  }, [activeFormat, document.content.episodes.length, onContentChange])

  function handleFormatChange(next: ProjectFormat) {
    if (next === activeFormat) return

    const currentHasFormatAnswers = activeFormat === 'series'
      ? hasSeriesOutlineAnswers(document.content)
      : hasFeatureOutlineAnswers(document.content)

    if (currentHasFormatAnswers) {
      const confirmed = window.confirm(
        `Switching to ${next} will hide your ${activeFormat} outline answers. They'll be kept and restored if you switch back.`,
      )
      if (!confirmed) return
    }

    onProjectFormatChange?.(next)
  }

  function handleClearAll() {
    setClearDialogOpen(false)
    onClear?.({ keep: 'all' })
  }

  function handleKeepFoundations() {
    setClearDialogOpen(false)
    onClear?.({ keep: 'foundations' })
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <div>
            <h2 style={styles.title}>Outline</h2>
            <p style={styles.subtitle}>
              Shape the story before pages lock it in.
            </p>
          </div>
          <div style={styles.titleControls}>
            <ProjectFormatSelector
              value={activeFormat}
              onChange={handleFormatChange}
              variant="standalone"
            />
            <DocumentViewToggle
              value={activeView}
              onChange={(next) => onViewPreferencesPatch({ activeView: next })}
            />
            {onClear && (
              <button
                type="button"
                style={{
                  ...styles.clearButton,
                  ...(!hasContent ? styles.clearButtonDisabled : {}),
                }}
                onClick={() => setClearDialogOpen(true)}
                disabled={!hasContent}
                title="Clear outline"
              >
                Clear outline
              </button>
            )}
          </div>
        </div>
      </div>

      {activeView === 'edit' ? (
        <OutlineEditView
          format={activeFormat}
          content={document.content}
          onContentChange={onContentChange}
          onAddEpisode={onAddEpisode}
          onEpisodeFieldChange={onEpisodeFieldChange}
        />
      ) : (
        <OutlineDocumentView
          content={document.content}
          format={activeFormat}
          identity={identity}
          composed={document.composed}
          isComposing={isComposing}
          error={composeError}
          onCompose={handleCompose}
        />
      )}

      <ClearOutlineDialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        onClearAll={handleClearAll}
        onKeepFoundations={handleKeepFoundations}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '32px 24px 64px',
  },
  header: { marginBottom: 28 },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    margin: 0,
  },
  titleControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  clearButton: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  clearButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    margin: '4px 0 0',
  },
}
