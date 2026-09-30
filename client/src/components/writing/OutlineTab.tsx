import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import type { BeatSheetSyncStatusResponse } from '@shared/projectLibraryApi'
import { OutlineEditView } from './outline/OutlineEditView'
import { BeatSheetView } from './outline/BeatSheetView'
import { BeatSheetStatusLine } from './outline/BeatSheetStatusLine'
import { OutlineDocumentView } from './outline/OutlineDocumentView'
import { ClearOutlineDialog } from './outline/ClearOutlineDialog'
import type { MemoryReceipt } from '@shared/schema'
import { MemoryReceiptDisclosure } from '../shared/MemoryReceiptDisclosure'
import { useBoundProjectScopeKey, useProjectRequestGeneration } from '../../lib/useProjectRequestGeneration'

type EpisodeTextField = Exclude<keyof OutlineEpisode, 'id' | 'number'>

interface OutlineTabProps {
  projectId?: string
  projectScopeKey?: string
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
  /** Story-drive sync status; null/undefined for projects without a server link. */
  beatSheetStatus?: BeatSheetSyncStatusResponse | null
  onRefreshBeatSheet?: () => Promise<void>
  onCheckBeatSheetStatus?: () => Promise<BeatSheetSyncStatusResponse>
}

export function OutlineTab({
  projectId,
  projectScopeKey,
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
  beatSheetStatus = null,
  onRefreshBeatSheet,
  onCheckBeatSheetStatus,
}: OutlineTabProps) {
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [memoryReceipt, setMemoryReceipt] = useState<MemoryReceipt | undefined>()
  const [refreshing, setRefreshing] = useState(false)
  const [changedSince, setChangedSince] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const isComposingRef = useRef(false)
  const effectiveProjectScopeKey = useBoundProjectScopeKey(projectId, projectScopeKey)
  const beginComposeRequest = useProjectRequestGeneration(effectiveProjectScopeKey)
  const activeFormat = normalizeProjectFormat(projectFormat)
  const activeView = document.viewPreferences?.activeView ?? 'edit'
  const hasContent = hasOutlineAnswers(document.content)

  const isLinked = beatSheetStatus !== null && beatSheetStatus.kind !== 'not-linked'

  const handleRefreshBeatSheet = useCallback(async () => {
    if (!onRefreshBeatSheet) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await onRefreshBeatSheet()
      setChangedSince(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      setRefreshError(`Refresh failed: ${message}. Showing the last synced beats.`)
    } finally {
      setRefreshing(false)
    }
  }, [onRefreshBeatSheet])

  // One background check per opened project: has Story-drive moved since the last sync?
  const checkStatusRef = useRef(onCheckBeatSheetStatus)
  checkStatusRef.current = onCheckBeatSheetStatus
  useEffect(() => {
    setChangedSince(false)
    setRefreshError(null)
    if (!isLinked || !checkStatusRef.current) return
    let cancelled = false
    checkStatusRef.current()
      .then(next => { if (!cancelled && next.kind === 'updated') setChangedSince(true) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [effectiveProjectScopeKey, isLinked])

  const handleCompose = useCallback(async () => {
    if (isComposingRef.current) return
    const requestIsCurrent = beginComposeRequest()
    isComposingRef.current = true
    setIsComposing(true)
    setComposeError(null)
    try {
      const result = await requestOutlineCompose({
        projectId,
        content: document.content,
        format: activeFormat,
        identity,
      })
      if (!requestIsCurrent()) return
      setMemoryReceipt(result.memoryReceipt)
      if (result.ok) {
        onComposed(result.composed)
      } else {
        setComposeError('WriterOS could not compose this document right now.')
      }
    } catch {
      if (!requestIsCurrent()) return
      setComposeError('WriterOS could not compose this document right now.')
    } finally {
      if (requestIsCurrent()) {
        isComposingRef.current = false
        setIsComposing(false)
      }
    }
  }, [beginComposeRequest, projectId, document.content, activeFormat, identity, onComposed])

  useEffect(() => {
    isComposingRef.current = false
    setIsComposing(false)
    setComposeError(null)
    setMemoryReceipt(undefined)
  }, [effectiveProjectScopeKey])

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
        `Switching to ${next} will hide your ${activeFormat} answers. They'll be kept and restored if you switch back.`,
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
            <h2 style={styles.title}>Beat Sheet</h2>
            <p style={styles.subtitle}>
              What Story-drive ratified, and what the camera sees.
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
            {onClear && activeView === 'edit' && (
              <button
                type="button"
                style={{
                  ...styles.clearButton,
                  ...(!hasContent ? styles.clearButtonDisabled : {}),
                }}
                onClick={() => setClearDialogOpen(true)}
                disabled={!hasContent}
                title="Clear answers"
              >
                Clear answers
              </button>
            )}
          </div>
        </div>
      </div>

      {activeView === 'edit' ? (
        document.content.beatSheetSource ? (
          <BeatSheetView
            content={document.content}
            status={beatSheetStatus}
            changedSince={changedSince}
            refreshError={refreshError}
            lookbook={undefined}
            onRefresh={handleRefreshBeatSheet}
            onAskQuestions={async () => undefined}
            onAnswer={() => undefined}
            onDismiss={() => undefined}
            onRemoveOrphan={() => undefined}
            refreshing={refreshing}
            onContentChange={onContentChange}
          />
        ) : (
          <>
            {beatSheetStatus && beatSheetStatus.kind !== 'not-linked' && (
              <BeatSheetStatusLine
                status={beatSheetStatus}
                changedSince={changedSince}
                errorMessage={refreshError}
                refreshing={refreshing}
                onRefresh={handleRefreshBeatSheet}
              />
            )}
            <OutlineEditView
              format={activeFormat}
              content={document.content}
              onContentChange={onContentChange}
              onAddEpisode={onAddEpisode}
              onEpisodeFieldChange={onEpisodeFieldChange}
            />
          </>
        )
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

      <MemoryReceiptDisclosure receipt={memoryReceipt} />

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
