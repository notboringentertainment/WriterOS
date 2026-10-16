import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AuthoredDocumentState,
  DocumentViewPreferences,
  OutlineDocumentContent,
  OutlineEpisode,
} from '@shared/documents'
import type { ComposeIdentity, ComposedDocument } from '@shared/compose/types'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import { ProjectFormatSelector } from '../shared/ProjectFormatSelector'
import type { BeatSheetSyncStatusResponse } from '@shared/projectLibraryApi'
import { BeatSheetView } from './outline/BeatSheetView'
import { BeatSheetStatusLine } from './outline/BeatSheetStatusLine'
import type { LookbookDocument } from '@shared/lookbook'
import { applyLookbookAsk, dismissLookbookQuestion, removeLookbookBeat, setLookbookAnswer } from '../../lib/lookbookEdits'
import { useBoundProjectScopeKey } from '../../lib/useProjectRequestGeneration'

interface OutlineTabProps {
  projectId?: string
  projectScopeKey?: string
  document: AuthoredDocumentState<OutlineDocumentContent>
  projectFormat?: ProjectFormat
  identity: ComposeIdentity
  onProjectFormatChange?: (next: ProjectFormat) => void
  onContentChange: (updater: (content: OutlineDocumentContent) => OutlineDocumentContent) => void
  onViewPreferencesPatch: (patch: Partial<DocumentViewPreferences>) => void
  onComposed: (composed: ComposedDocument) => void
  /** Story-drive sync status; null/undefined for projects without a server link. */
  beatSheetStatus?: BeatSheetSyncStatusResponse | null
  onRefreshBeatSheet?: () => Promise<void>
  onCheckBeatSheetStatus?: () => Promise<BeatSheetSyncStatusResponse>
  lookbook?: LookbookDocument
  onLookbookChange?: (updater: (doc: LookbookDocument) => LookbookDocument) => void
  /** Asks Zoe about one beat; only present for server-linked projects. Resolves null when the result is stale (project switched) and must be ignored. */
  onRequestLookbookQuestions?: (beatKey: string) => Promise<{ questions: Array<{ prompt: string }>; nothingToSee: boolean } | null>
}

export function OutlineTab({
  projectId,
  projectScopeKey,
  document,
  projectFormat = 'feature',
  identity,
  onProjectFormatChange,
  onContentChange,
  onViewPreferencesPatch,
  onComposed,
  beatSheetStatus = null,
  onRefreshBeatSheet,
  onCheckBeatSheetStatus,
  lookbook,
  onLookbookChange,
  onRequestLookbookQuestions,
}: OutlineTabProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [changedSince, setChangedSince] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const effectiveProjectScopeKey = useBoundProjectScopeKey(projectId, projectScopeKey)
  const activeFormat = normalizeProjectFormat(projectFormat)

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

  const handleAskQuestions = useCallback(async (beatKey: string) => {
    if (!onRequestLookbookQuestions) throw new Error('Zoe is not available for this project.')
    const unit = document.content.units.find(candidate => candidate.id === beatKey)
    if (!unit) throw new Error('That beat is no longer in the Beat Sheet.')
    const result = await onRequestLookbookQuestions(beatKey)
    if (!result) return undefined
    const prompts = result.questions.map(question => question.prompt).filter(prompt => prompt.trim().length > 0)
    const now = new Date().toISOString()
    onLookbookChange?.(doc => applyLookbookAsk(doc, beatKey, unit.title, prompts, now))
    return { nothingToSee: prompts.length === 0 }
  }, [document.content.units, onLookbookChange, onRequestLookbookQuestions])

  // Beats come from Story-drive; the hand-written outline and its foundation answers
  // stay on disk untouched but are no longer shown or edited here.
  function handleFormatChange(next: ProjectFormat) {
    if (next === activeFormat) return
    onProjectFormatChange?.(next)
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
          </div>
        </div>
      </div>

      {(
        document.content.beatSheetSource ? (
          <BeatSheetView
            content={document.content}
            status={beatSheetStatus}
            changedSince={changedSince}
            refreshError={refreshError}
            lookbook={lookbook}
            onRefresh={handleRefreshBeatSheet}
            onAskQuestions={handleAskQuestions}
            onAnswer={(beatKey, questionId, answer) =>
              onLookbookChange?.(doc => setLookbookAnswer(doc, beatKey, questionId, answer))}
            onDismiss={(beatKey, questionId) =>
              onLookbookChange?.(doc => dismissLookbookQuestion(doc, beatKey, questionId, new Date().toISOString()))}
            onRemoveOrphan={beatKey => onLookbookChange?.(doc => removeLookbookBeat(doc, beatKey))}
            refreshing={refreshing}
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
            <p style={styles.empty}>
              {isLinked
                ? 'No beat sheet yet. Beats appear here once the beat sheet is ratified in Story-drive.'
                : "No beat sheet yet. Beats come from this project's Story-drive beat sheet once the project is linked."}
            </p>
          </>
        )
      )}


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
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    margin: '4px 0 0',
  },
  empty: {
    fontFamily: 'var(--font-body)',
    fontSize: 17,
    lineHeight: 1.6,
    color: 'var(--fg-muted)',
    margin: 0,
    maxWidth: 560,
  },
}
