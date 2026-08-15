import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useShellState } from './lib/shellState'
import { useProjectState } from './lib/useProjectState'
import { useWriterOSProjectLibrary } from './lib/useWriterOSProjectLibrary'
import { FdxImportError, importFdxFile } from './lib/fdxImport'
import {
  parseMention,
  parseOpenSwarmCommand,
  buildProjectContext,
  formatWritingPartnerSpeaker,
  countRelevantMemoryConflicts,
} from './lib/wpRouting'
import { useProjectMemory } from './lib/useProjectMemory'
import { MemorySurface } from './components/memory/MemorySurface'
import { MemoryConflictBanner } from './components/memory/MemoryConflictCard'
import { MemoryPatchPreview } from './components/memory/MemoryPatchPreview'
import {
  applyMemoryGroundedPatch,
  parsePatchProposal,
  shouldRequestDocumentPatch,
  surfaceForActiveTab,
} from './lib/memoryPatch'
import type { MemoryGroundedPatchProposal } from '@shared/memoryPatches'
import { buildSurfaceAwareness } from './lib/surfaceAwareness'
import { buildWorkspaceLocation } from './lib/workspaceLocation'
import { selectSurfaceStructure, selectConsoleState } from './lib/leftZone'
import { loadCompletedVoiceProfile, loadCompletedVoiceProfileSliced, loadVoiceProfileState } from './lib/voiceProfile'
import { classifyPersonaCapability } from './lib/personaCapabilityRouting'
import { isAbortError, postPersonaCapability } from './lib/postPersonaCapability'
import { Shell } from './components/shell/Shell'
import { ProjectMeetingPage } from './components/ritual/ProjectMeetingPage'
import { VoiceProfileRitualPage } from './components/ritual/VoiceProfileRitualPage'
import { getDisplayProjectTitle } from './lib/projectIdentity'
import { ScriptTab } from './components/writing/ScriptTab'
import { SynopsisTab } from './components/writing/SynopsisTab'
import { OutlineTab } from './components/writing/OutlineTab'
import { TreatmentTab } from './components/writing/TreatmentTab'
import { StoryBibleTab } from './components/writing/StoryBibleTab'
import { WritersRoom } from './components/writing/WritersRoom'
import {
  HomeSurface,
  type HomeArchiveTarget,
  type HomeDeleteTarget,
  type HomePackageActionTarget,
} from './components/home/HomeSurface'
import { PERSONAS } from '@shared/personas'
import { pickIdentity } from '@shared/compose/identity'
import { composeSeedMarkdown, resolveSeedTitle, seedFileName } from '@shared/seedMarkdown'
import { downloadTextFile } from './lib/downloadTextFile'
import type { TranscriptMessage, AgentId, ScriptScene } from './lib/projectState'
import type { ScriptFocusState } from './lib/scriptIndex'
import type { StoredProject } from './lib/projectLibrary'
import { getUnmigratedProjects, loadActiveProjectLibrary, markProjectsMigrated, summarizeProjects } from './lib/projectLibrary'
import type { VoiceProfileDocument } from '@shared/voiceProfile'
import type { CapabilityReceipt } from '@shared/personaCapability'
import type { MemoryReceipt } from '@shared/schema'
import { parseMemoryReceipt } from './lib/memoryReceipt'
import { computePostDeleteStorageEffect } from './lib/homeDelete'
import { fetchProjectMeetingStandings, type ProjectMeetingStanding } from './lib/projectMeetingStatus'
import { roomFieldEmitter } from './lib/roomFieldEmitter'
import { applyProposalToStoryBible, renderStoryLocksBlock } from './lib/roomProposals'
import type { RoomProposal } from './lib/roomApi'

type ScriptSnapshot = {
  rawHtml: string
  scenes: ScriptScene[]
  focus?: ScriptFocusState
}

type ActiveProjectStorage =
  | { kind: 'browser' }
  | { kind: 'folder'; projectId: string; packageName: string }

function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  speaker: string,
  // `id` lets a caller know a message's id before it lands in the transcript
  // (Task 10: so a patch proposal arriving with this response can be tied to
  // this exact message for the "kept as suggestion" chip).
  options: { capabilityReceipt?: CapabilityReceipt; memoryReceipt?: MemoryReceipt; id?: string } = {}
): TranscriptMessage {
  const { id, ...rest } = options
  return { id: id ?? crypto.randomUUID(), role, content, speaker, ts: Date.now(), ...rest }
}

function historyFromTranscript(transcript: TranscriptMessage[]) {
  return transcript.slice(-6).map(m => ({ role: m.role, content: m.content }))
}

function formatFdxImportError(error: unknown) {
  if (error instanceof FdxImportError) return error.message
  return error instanceof Error ? error.message : 'Unable to import the Final Draft file.'
}

async function postWPChat(body: {
  projectId: string
  personaId: string
  message: string
  projectContext: ReturnType<typeof buildProjectContext>
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  voiceProfile?: VoiceProfileDocument
}): Promise<{ message: string; suggestions?: string[]; memoryReceipt?: MemoryReceipt; patchProposal?: MemoryGroundedPatchProposal }> {
  const res = await fetch('/api/wp-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`wp-chat ${res.status}`)
  const response = await res.json()
  return {
    ...response,
    memoryReceipt: parseMemoryReceipt(response?.memoryReceipt),
    // Task 10: a wp-chat response may carry an optional memory-grounded
    // document patch alongside its receipt. parsePatchProposal never throws
    // and drops anything malformed or whose content fails the surface's own
    // schema, so a bad/absent field here is indistinguishable from "no patch".
    patchProposal: parsePatchProposal(response?.patch),
  }
}

async function postOpenSwarmWritingPartner(body: {
  projectId?: string
  message: string
  projectContext: ReturnType<typeof buildProjectContext>
  voiceProfile?: VoiceProfileDocument
}): Promise<{ message: string; memoryReceipt?: MemoryReceipt }> {
  const res = await fetch('/api/openswarm/writing-partner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await res.json()
  if (!res.ok) {
    const memoryReceipt = parseMemoryReceipt(response?.memoryReceipt)
    if (typeof response?.message === 'string') return { message: response.message, memoryReceipt }
    throw new Error(`openswarm writing-partner ${res.status}`)
  }
  return { ...response, memoryReceipt: parseMemoryReceipt(response?.memoryReceipt) }
}

export default function App() {
  const shellState = useShellState()
  const project = useProjectState()
  const projectFolder = useWriterOSProjectLibrary()
  const [wpLoading, setWpLoading] = useState(false)
  const [activeProjectStorage, setActiveProjectStorage] = useState<ActiveProjectStorage>({ kind: 'browser' })
  const [openingFolderProjectId, setOpeningFolderProjectId] = useState<string | null>(null)
  const [folderProjectError, setFolderProjectError] = useState<string | null>(null)
  const [fdxImportError, setFdxImportError] = useState<string | null>(null)
  const [fdxImportWarnings, setFdxImportWarnings] = useState<string[]>([])
  const [importingFdx, setImportingFdx] = useState(false)
  const [scriptImportNonce, setScriptImportNonce] = useState(0)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [archivingProjectId, setArchivingProjectId] = useState<string | null>(null)
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null)
  const [showingProjectInFolderId, setShowingProjectInFolderId] = useState<string | null>(null)
  const [duplicatingProjectId, setDuplicatingProjectId] = useState<string | null>(null)
  const [migratingLocalStorage, setMigratingLocalStorage] = useState(false)
  const unmigratedProjects = useMemo(
    () => summarizeProjects(getUnmigratedProjects(project.storedProjects)).map(p => ({ id: p.id, title: p.title })),
    [project.storedProjects],
  )
  const folderSaveNonceRef = useRef(0)

  // Voice Profile first-run gate (writer-voice-profile-prd): offer the ritual once
  // when no profile state exists at all. A skip writes status:'skipped', so the
  // gate never re-prompts; the TopBar Voice button remains the standing entry.
  const { openRitual } = shellState
  useEffect(() => {
    if (!loadVoiceProfileState()) {
      openRitual('voiceProfile')
    }
  }, [openRitual])

  // Project Meeting standings for the Home cards. Best effort, only while Home is
  // visible; a down room API simply hides the chips. Keyed on a stable id string —
  // `project.projects` is rebuilt every render, so depending on the array identity
  // would refetch (and re-render) in an infinite loop.
  const [projectMeetingStandings, setProjectMeetingStandings] = useState<Record<string, ProjectMeetingStanding>>({})
  const meetingStandingIdsKey = Array.from(new Set([
    ...project.projects.map(p => p.id),
    ...projectFolder.projects.map(p => p.id),
  ])).sort().join(',')
  useEffect(() => {
    if (!shellState.homeActive || !meetingStandingIdsKey) return
    let cancelled = false
    void fetchProjectMeetingStandings(meetingStandingIdsKey.split(',')).then(standings => {
      if (!cancelled) setProjectMeetingStandings(standings)
    })
    return () => {
      cancelled = true
    }
  }, [shellState.homeActive, meetingStandingIdsKey])

  const writeProjectRef = useRef(projectFolder.writeProject)
  const markStoredProjectsMigratedRef = useRef(project.markStoredProjectsMigrated)
  writeProjectRef.current = projectFolder.writeProject
  markStoredProjectsMigratedRef.current = project.markStoredProjectsMigrated
  const activeFolderProjectId = activeProjectStorage.kind === 'folder'
    ? activeProjectStorage.projectId
    : null
  const activeAgentProjectKey = activeFolderProjectId
    ? `folder:${activeFolderProjectId}`
    : `browser:${project.activeProjectId ?? ''}`
  // Drives the Memory surface and inline conflict banners (Task 9). A
  // browser-only project (no activeFolderProjectId) has nowhere durable to
  // keep a shared memory ledger, so the hook reports browserOnly instead of
  // fetching.
  const projectMemory = useProjectMemory(activeFolderProjectId ?? undefined, activeAgentProjectKey)
  const openMemorySurface = useCallback(() => shellState.openRitual('memory'), [shellState.openRitual])
  // The hook above is a single, app-lifetime instance (never a second one
  // inside MemorySurface) so that actions taken there update the exact same
  // state the banners below read — no separate refresh handshake needed for
  // that case. It only fetches on mount/scope change otherwise, so anything
  // WriterOS's background analysis publishes after that point (Task 8) would
  // sit unseen until the next project switch; refreshing on every Memory-open
  // picks that up whenever the writer actually looks.
  useEffect(() => {
    if (shellState.ritual === 'memory') void projectMemory.refresh()
  }, [shellState.ritual, projectMemory.refresh])
  const activeAgentProjectKeyRef = useRef(activeAgentProjectKey)
  const wpRequestGenerationRef = useRef(0)
  activeAgentProjectKeyRef.current = activeAgentProjectKey
  useEffect(() => {
    wpRequestGenerationRef.current += 1
    setWpLoading(false)
  }, [activeAgentProjectKey])

  // Task 10: the single memory-grounded document patch attached to the most
  // recent qualifying response, if any, and what the writer has done with it.
  // 'previewing' renders the full MemoryPatchPreview banner inline above the
  // surface it targets (like the MemoryConflictBanner above it), never a
  // modal. 'kept' collapses that banner to a small chip on the transcript
  // message that proposed it (messageId) — reachable for the rest of this
  // session, not durable across sessions or projects (no store; plan
  // ruling). Dismiss clears this state outright rather than moving to
  // 'kept'. Cleared on project switch so a suggestion from one project can
  // never surface — or get applied — against another.
  const [activePatchProposal, setActivePatchProposal] = useState<{
    proposal: MemoryGroundedPatchProposal
    messageId: string
    mode: 'previewing' | 'kept'
  } | null>(null)
  const [patchApplyError, setPatchApplyError] = useState<string | null>(null)
  const [applyingPatch, setApplyingPatch] = useState(false)
  useEffect(() => {
    setActivePatchProposal(null)
    setPatchApplyError(null)
    setApplyingPatch(false)
  }, [activeAgentProjectKey])

  const handleApplyPatch = useCallback(() => {
    if (!activePatchProposal) return
    setApplyingPatch(true)
    const result = applyMemoryGroundedPatch(activePatchProposal.proposal.patch, project.state.documents, {
      synopsis: project.setSynopsisDocument,
      outline: project.setOutlineDocument,
      treatment: project.setTreatmentDocument,
      storyBible: project.setStoryBibleDocument,
    })
    setApplyingPatch(false)
    if (!result.ok) {
      setPatchApplyError(result.message)
      return
    }
    setPatchApplyError(null)
    setActivePatchProposal(null)
  }, [activePatchProposal, project])

  // Keeps the same proposal but collapses it to a chip on its message (see
  // keptPatchMessageId / handleReopenPatchSuggestion below) instead of
  // discarding it — the behavioral difference from Dismiss. Neither ever
  // touches the document or project memory.
  const handleKeepPatchAsSuggestion = useCallback(() => {
    setActivePatchProposal(current => (current ? { ...current, mode: 'kept' } : current))
    setPatchApplyError(null)
  }, [])

  const handleDismissPatch = useCallback(() => {
    setActivePatchProposal(null)
    setPatchApplyError(null)
  }, [])

  const handleReopenPatchSuggestion = useCallback(() => {
    setActivePatchProposal(current => (current ? { ...current, mode: 'previewing' } : current))
    setPatchApplyError(null)
  }, [])
  const latestScriptSnapshotRef = useRef<ScriptSnapshot>({
    rawHtml: project.state.script.rawHtml,
    scenes: project.state.script.scenes,
  })

  useEffect(() => {
    latestScriptSnapshotRef.current = {
      rawHtml: project.state.script.rawHtml,
      scenes: project.state.script.scenes,
    }
  }, [project.activeProjectId, project.state.script.rawHtml, project.state.script.scenes])

  const buildFreshProjectContext = useCallback(
    (message: string) => buildProjectContext(project.state, message, {
      script: {
        ...latestScriptSnapshotRef.current,
        focus: shellState.activeTab === 'script'
          ? latestScriptSnapshotRef.current.focus
          : undefined,
      },
    }),
    [project.state, shellState.activeTab]
  )

  const handleScriptSnapshotChange = useCallback((snapshot: ScriptSnapshot) => {
    latestScriptSnapshotRef.current = snapshot
  }, [])

  const handleScriptChange = useCallback(
    (html: string, scenes: ScriptScene[]) => {
      latestScriptSnapshotRef.current = {
        ...latestScriptSnapshotRef.current,
        rawHtml: html,
        scenes,
      }
      project.updateScript(html, scenes)
    },
    [project]
  )

  const handleRebuildScriptFacts = useCallback((snapshot: { rawHtml: string; scenes: ScriptScene[] }) => {
    latestScriptSnapshotRef.current = {
      ...latestScriptSnapshotRef.current,
      ...snapshot,
    }
    project.rebuildScriptFactsFromSnapshot(snapshot.rawHtml, snapshot.scenes)
  }, [project])

  const formatFolderProjectError = useCallback((error: unknown) => {
    return error instanceof Error ? error.message : 'Unable to open or save the WriterOS project package.'
  }, [])

  const cancelPendingFolderSave = useCallback(() => {
    folderSaveNonceRef.current += 1
  }, [])

  const persistFolderProject = useCallback(async (
    storedProject: StoredProject | undefined,
    targetProjectId: string | null,
  ): Promise<boolean> => {
    if (!storedProject) return true
    if (!targetProjectId || storedProject.id !== targetProjectId) return true

    const nonce = ++folderSaveNonceRef.current
    try {
      const folderProject = await writeProjectRef.current(storedProject)
      if (folderSaveNonceRef.current !== nonce) return false
      const folderLabel = projectFolder.label ?? projectFolder.defaultFolderLabel
      const existingMarker = storedProject.migratedToFolder
      if (
        !existingMarker ||
        existingMarker.folderLabel !== folderLabel ||
        existingMarker.packageName !== folderProject.packageName
      ) {
        markStoredProjectsMigratedRef.current([{
          projectId: storedProject.id,
          folderLabel,
          packageName: folderProject.packageName,
          migratedAt: new Date().toISOString(),
        }])
      }
      setActiveProjectStorage(current => {
        if (current.kind !== 'folder' || current.projectId !== storedProject.id) return current
        if (current.packageName === folderProject.packageName) return current
        return { kind: 'folder', projectId: storedProject.id, packageName: folderProject.packageName }
      })
      setFolderProjectError(null)
      return true
    } catch (error) {
      if (folderSaveNonceRef.current !== nonce) return false
      setFolderProjectError(formatFolderProjectError(error))
      return false
    }
  }, [formatFolderProjectError, projectFolder.defaultFolderLabel, projectFolder.label])

  useEffect(() => {
    if (!activeFolderProjectId) return
    const storedProject = project.activeStoredProject
    if (!storedProject || storedProject.id !== activeFolderProjectId) return

    const scheduledSaveNonce = folderSaveNonceRef.current
    const timeout = window.setTimeout(() => {
      if (folderSaveNonceRef.current !== scheduledSaveNonce) return
      void persistFolderProject(storedProject, activeFolderProjectId)
    }, 600)

    return () => window.clearTimeout(timeout)
  }, [activeFolderProjectId, persistFolderProject, project.activeStoredProject])

  const handleOpenBrowserProject = useCallback((projectId: string) => {
    cancelPendingFolderSave()
    setActiveProjectStorage({ kind: 'browser' })
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    project.switchProject(projectId)
    shellState.openProjectWorkspace()
  }, [cancelPendingFolderSave, project, shellState])

  const handleOpenFolderProject = useCallback(async (projectId: string) => {
    cancelPendingFolderSave()
    setOpeningFolderProjectId(projectId)
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    try {
      const openedProject = await projectFolder.openProject(projectId)
      project.openStoredProject(openedProject.project)
      setActiveProjectStorage({
        kind: 'folder',
        projectId: openedProject.project.id,
        packageName: openedProject.packageName,
      })
      shellState.openProjectWorkspace()
      return true
    } catch (error) {
      setFolderProjectError(formatFolderProjectError(error))
      return false
    } finally {
      setOpeningFolderProjectId(null)
    }
  }, [cancelPendingFolderSave, formatFolderProjectError, project, projectFolder, shellState])

  const handleOpenProjectMeetingFromHome = useCallback(async (projectId: string, storageKind: 'browser' | 'folder') => {
    if (storageKind === 'browser') {
      handleOpenBrowserProject(projectId)
      openRitual('projectMeeting')
      return
    }
    if (await handleOpenFolderProject(projectId)) {
      openRitual('projectMeeting')
    }
  }, [handleOpenBrowserProject, handleOpenFolderProject, openRitual])

  const handleNewProject = useCallback(() => {
    cancelPendingFolderSave()
    const createdProject = project.createProject()
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])

    if (projectFolder.status === 'ready') {
      setActiveProjectStorage({
        kind: 'folder',
        projectId: createdProject.id,
        packageName: '',
      })
      void persistFolderProject(createdProject, createdProject.id)
    } else {
      setActiveProjectStorage({ kind: 'browser' })
    }

    // Project Meeting entry point (§A3): a new project lands on the meeting page in
    // its intake state — the page is the offer, and the interview never auto-starts.
    // "Skip for now" drops the writer into the workspace underneath.
    shellState.openProjectWorkspace()
    shellState.openRitual('projectMeeting')
  }, [cancelPendingFolderSave, persistFolderProject, project, projectFolder.status, shellState])

  const handleImportFdxAsNewProject = useCallback(async (file: File) => {
    cancelPendingFolderSave()
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    setImportingFdx(true)
    try {
      const imported = await importFdxFile(file)
      setFdxImportWarnings(imported.warnings)
      const createdProject = project.createProjectFromImportedScript(imported)
      latestScriptSnapshotRef.current = {
        rawHtml: imported.rawHtml,
        scenes: imported.scenes,
      }

      if (projectFolder.status === 'ready') {
        setActiveProjectStorage({
          kind: 'folder',
          projectId: createdProject.id,
          packageName: '',
        })
        void persistFolderProject(createdProject, createdProject.id)
      } else {
        setActiveProjectStorage({ kind: 'browser' })
      }

      setScriptImportNonce(nonce => nonce + 1)
      shellState.setActiveTab('script')
    } catch (error) {
      const message = formatFdxImportError(error)
      setFdxImportError(message)
      setFdxImportWarnings([])
    } finally {
      setImportingFdx(false)
    }
  }, [cancelPendingFolderSave, persistFolderProject, project, projectFolder.status, shellState])

  const handleReplaceScriptFromFdx = useCallback(async (file: File) => {
    cancelPendingFolderSave()
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    setImportingFdx(true)
    try {
      const imported = await importFdxFile(file)
      setFdxImportWarnings(imported.warnings)
      project.replaceScriptFromImport(imported)
      latestScriptSnapshotRef.current = {
        rawHtml: imported.rawHtml,
        scenes: imported.scenes,
      }
      setScriptImportNonce(nonce => nonce + 1)
    } catch (error) {
      setFdxImportError(formatFdxImportError(error))
      setFdxImportWarnings([])
    } finally {
      setImportingFdx(false)
    }
  }, [cancelPendingFolderSave, project])

  const handleChooseProjectFolder = useCallback(async () => {
    cancelPendingFolderSave()
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    const didConnectFolder = await projectFolder.chooseFolder()
    if (didConnectFolder) {
      cancelPendingFolderSave()
      setActiveProjectStorage({ kind: 'browser' })
    }
  }, [cancelPendingFolderSave, projectFolder])

  const handleForgetProjectFolder = useCallback(async () => {
    cancelPendingFolderSave()
    setActiveProjectStorage({ kind: 'browser' })
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    await projectFolder.forgetFolder()
  }, [cancelPendingFolderSave, projectFolder])

  const handleProjectChange = useCallback((projectId: string) => {
    cancelPendingFolderSave()
    setActiveProjectStorage({ kind: 'browser' })
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    project.switchProject(projectId)
  }, [cancelPendingFolderSave, project])

  const handleSaveProject = useCallback(() => {
    const savedProject = project.saveNow()
    void persistFolderProject(savedProject, activeFolderProjectId)
  }, [activeFolderProjectId, persistFolderProject, project])

  const handleExportSeed = useCallback(() => {
    const documents = project.state.documents
    const seedInput = {
      synopsis: documents.synopsis.content,
      storyBible: documents.storyBible.content,
      treatment: documents.treatment.content,
      projectTitle: project.state.meta.title,
    }
    const markdown = composeSeedMarkdown(seedInput)
    downloadTextFile(seedFileName(resolveSeedTitle(seedInput)), markdown, 'text/markdown')
  }, [project.state.documents, project.state.meta.title])

  const handleDeleteProject = useCallback(() => {
    cancelPendingFolderSave()
    setActiveProjectStorage({ kind: 'browser' })
    setFolderProjectError(null)
    setFdxImportError(null)
    setFdxImportWarnings([])
    const next = project.deleteProject()
    if (!next.activeProjectId) {
      shellState.openHome()
    }
  }, [cancelPendingFolderSave, project, shellState])

  const handleArchiveHomeProject = useCallback(async (target: HomeArchiveTarget) => {
    if (archivingProjectId) return
    setArchivingProjectId(target.projectId)
    setFolderProjectError(null)

    try {
      const wasActive = project.activeProjectId === target.projectId
      const isActiveFolderProject =
        wasActive &&
        activeProjectStorage.kind === 'folder' &&
        activeProjectStorage.projectId === target.projectId

      if (isActiveFolderProject) {
        cancelPendingFolderSave()
        const didFlush = await persistFolderProject(project.activeStoredProject, target.projectId)
        if (!didFlush) return
      }

      if (target.storageKind === 'folder') {
        const result = await projectFolder.archiveProject(target.projectId)
        if (!result.ok) {
          setFolderProjectError(result.message)
          return
        }
      }

      const next = project.archiveProjectById(target.projectId)

      if (wasActive) {
        cancelPendingFolderSave()
        setActiveProjectStorage({ kind: 'browser' })
      }
      if (!next.activeProjectId) {
        shellState.openHome()
      }
    } finally {
      setArchivingProjectId(null)
    }
  }, [activeProjectStorage, archivingProjectId, cancelPendingFolderSave, persistFolderProject, project, projectFolder, shellState])

  const handleRestoreHomeProject = useCallback(async (target: HomeArchiveTarget) => {
    if (restoringProjectId) return
    setRestoringProjectId(target.projectId)
    setFolderProjectError(null)

    try {
      if (target.storageKind === 'folder') {
        const result = await projectFolder.restoreProject(target.projectId)
        if (!result.ok) {
          setFolderProjectError(result.message)
          return
        }
      }

      project.restoreProjectById(target.projectId)
    } finally {
      setRestoringProjectId(null)
    }
  }, [project, projectFolder, restoringProjectId])

  const handleShowHomeProjectInFolder = useCallback(async (target: HomePackageActionTarget) => {
    if (showingProjectInFolderId) return
    setShowingProjectInFolderId(target.projectId)
    setFolderProjectError(null)

    try {
      const result = await projectFolder.showProjectInFolder(target.projectId)
      if (!result.ok) {
        setFolderProjectError(result.message)
      }
    } finally {
      setShowingProjectInFolderId(null)
    }
  }, [projectFolder, showingProjectInFolderId])

  const handleDuplicateHomeProject = useCallback(async (target: HomePackageActionTarget) => {
    if (duplicatingProjectId) return
    setDuplicatingProjectId(target.projectId)
    setFolderProjectError(null)

    try {
      const isActiveFolderProject =
        project.activeProjectId === target.projectId &&
        activeProjectStorage.kind === 'folder' &&
        activeProjectStorage.projectId === target.projectId

      if (isActiveFolderProject) {
        cancelPendingFolderSave()
        const didFlush = await persistFolderProject(project.activeStoredProject, target.projectId)
        if (!didFlush) {
          setFolderProjectError(
            'WriterOS could not finish saving this project before duplicating. Try again.',
          )
          return
        }
      }

      const result = await projectFolder.duplicateProject(target.projectId)
      if (!result.ok) {
        setFolderProjectError(result.message)
      }
    } finally {
      setDuplicatingProjectId(null)
    }
  }, [activeProjectStorage, cancelPendingFolderSave, duplicatingProjectId, persistFolderProject, project, projectFolder])

  const handleDeleteHomeProject = useCallback(async (target: HomeDeleteTarget) => {
    if (deletingProjectId) return
    setDeletingProjectId(target.projectId)
    setFolderProjectError(null)

    try {
      if (target.storageKind === 'folder') {
        const result = await projectFolder.deleteProject(target.projectId)
        if (!result.ok) {
          // Surface explicit failure. Do not pretend disk cleanup happened and
          // do not proceed to library cleanup — folder still on disk means the
          // project will reappear on next folder scan, which would confuse the
          // user about what "delete" did.
          setFolderProjectError(result.message)
          return
        }
      }

      const wasActive = project.activeProjectId === target.projectId
      const next = project.deleteProjectById(target.projectId)

      const effect = computePostDeleteStorageEffect(target, wasActive)
      if (effect.cancelPendingFolderSave) cancelPendingFolderSave()
      if (effect.resetToBrowser) setActiveProjectStorage({ kind: 'browser' })
      if (!next.activeProjectId) {
        shellState.openHome()
      }
    } finally {
      setDeletingProjectId(null)
    }
  }, [cancelPendingFolderSave, deletingProjectId, project, projectFolder, shellState])

  const handleMigrateLocalStorage = useCallback(async () => {
    const unmigrated = getUnmigratedProjects(project.storedProjects)
    if (unmigrated.length === 0) return
    setMigratingLocalStorage(true)
    setFolderProjectError(null)

    try {
      const results = await projectFolder.runMigration(unmigrated)
      const markers = results
        .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
        .map(r => ({
          projectId: r.projectId,
          folderLabel: r.folderLabel,
          packageName: r.packageName,
          migratedAt: r.migratedAt,
      }))

      if (markers.length > 0) {
        markProjectsMigrated(loadActiveProjectLibrary().projects, markers)
        const activeWasMigrated = markers.some(m => m.projectId === project.activeProjectId)
        // Reload the library so the new markers are reflected in active library
        // state and so a migrated-active project is dropped (per Decision 3).
        project.reloadLibrary()
        if (activeWasMigrated) {
          cancelPendingFolderSave()
          setActiveProjectStorage({ kind: 'browser' })
          shellState.openHome()
        }
      }
      // Per-project failures are surfaced by the runMigration hook via its
      // status / errorMessage; the storage-error notice on Home already
      // renders projectFolder.errorMessage.
    } finally {
      setMigratingLocalStorage(false)
    }
  }, [cancelPendingFolderSave, project, projectFolder, shellState])

  const handleWPSend = useCallback(async (text: string) => {
    const openSwarmMessage = parseOpenSwarmCommand(text)
    const requestProjectKey = activeAgentProjectKey
    const requestGeneration = ++wpRequestGenerationRef.current
    const requestIsCurrent = () => (
      wpRequestGenerationRef.current === requestGeneration
      && activeAgentProjectKeyRef.current === requestProjectKey
    )

    if (openSwarmMessage) {
      project.addMessage('writingPartner', makeMessage('user', text, 'Writer'))
      setWpLoading(true)
      try {
        const projectContext = buildFreshProjectContext(openSwarmMessage)
        const voiceProfile = loadCompletedVoiceProfile()
        const response = await postOpenSwarmWritingPartner({ projectId: activeFolderProjectId ?? undefined, message: openSwarmMessage, projectContext, voiceProfile })
        if (!requestIsCurrent()) return
        project.addMessage('writingPartner', makeMessage('assistant', response.message, 'Morgan (OpenSwarm)', { memoryReceipt: response.memoryReceipt }))
      } catch {
        if (!requestIsCurrent()) return
        project.addMessage(
          'writingPartner',
          makeMessage(
            'assistant',
            'OpenSwarm connection error — start the OpenSwarm server on port 8080 and try again.',
            'Morgan (OpenSwarm)'
          )
        )
      } finally {
        if (requestIsCurrent()) setWpLoading(false)
      }
      return
    }

    // Step 1: snapshot prior history before appending current message
    const conversationHistory = historyFromTranscript(project.state.agents.writingPartner.transcript)

    // Step 2: parse @mention
    const mentionResult = parseMention(text)
    const personaId = mentionResult ? mentionResult.personaId : 'writingPartner'
    const messageToSend = mentionResult ? mentionResult.strippedText : text
    const capabilityKind = classifyPersonaCapability({ personaId, message: messageToSend })

    // Step 3: append user message (original text with @mention intact)
    project.addMessage('writingPartner', makeMessage('user', text, 'Writer'))

    // Step 4–8: API call
    setWpLoading(true)
    try {
      const projectContext = buildFreshProjectContext(messageToSend)
      const speakerName = formatWritingPartnerSpeaker(personaId)

      if (capabilityKind === 'research_world_context' && personaId === 'zoe') {
        const response = await postPersonaCapability({
          projectId: activeFolderProjectId ?? undefined,
          personaId: 'zoe',
          taskKind: 'research_world_context',
          message: messageToSend,
          projectContext,
          voiceProfile: loadCompletedVoiceProfileSliced('world_context'),
          sourceSurface: 'writingPartner',
          clientRequestId: crypto.randomUUID(),
        })
        if (!requestIsCurrent()) return

        if (response.status !== 'cancelled' && response.finalMessage.trim()) {
          project.addMessage(
            'writingPartner',
            makeMessage('assistant', response.finalMessage, speakerName, {
              capabilityReceipt: response.receipt,
            })
          )
        }
        return
      }

      // Surface/location state is attached only to the wp-chat payload (not OpenSwarm /
      // persona-capability above), so the agent can ground the current WriterOS context.
      const surface = buildSurfaceAwareness(shellState.activeTab, project.state)
      const location = buildWorkspaceLocation({
        activeTab: shellState.activeTab,
        scriptRawHtml: latestScriptSnapshotRef.current.rawHtml,
        scriptFocus: shellState.activeTab === 'script' ? latestScriptSnapshotRef.current.focus : undefined,
        storyBibleSection: shellState.storyBibleSection,
        surface,
      })
      const response = await postWPChat({ projectId: project.activeProjectId!, personaId, message: messageToSend, projectContext: { ...projectContext, surface, location }, conversationHistory, voiceProfile: loadCompletedVoiceProfile() })
      if (!requestIsCurrent()) return
      const assistantMessageId = crypto.randomUUID()
      project.addMessage('writingPartner', makeMessage('assistant', response.message, speakerName, { memoryReceipt: response.memoryReceipt, id: assistantMessageId }))
      // Plan ruling: never show a patch the writer did not, in effect, ask
      // for. Whatever the backend decided to send back, only surface it when
      // the message that produced it was itself a fill/rewrite/apply/revise
      // request AND the patch targets the surface the writer is looking at.
      if (
        response.patchProposal
        && shouldRequestDocumentPatch(messageToSend)
        && surfaceForActiveTab(shellState.activeTab) === response.patchProposal.patch.surface
      ) {
        setActivePatchProposal({ proposal: response.patchProposal, messageId: assistantMessageId, mode: 'previewing' })
        setPatchApplyError(null)
      }
    } catch (error) {
      if (isAbortError(error) || !requestIsCurrent()) return
      project.addMessage('writingPartner', makeMessage('assistant', 'Connection error — please try again.', 'Morgan'))
    } finally {
      if (requestIsCurrent()) setWpLoading(false)
    }
  }, [activeAgentProjectKey, activeFolderProjectId, buildFreshProjectContext, project, shellState.activeTab, shellState.storyBibleSection])

  // Room proposal adoption (D7): applies the field via the same document path
  // the writer uses. Deliberately NOT routed through onContentPatch — adopted
  // proposals must not re-emit doc_field_changed back into the room.
  const handleAdoptRoomProposal = useCallback((proposal: RoomProposal): boolean => {
    const next = applyProposalToStoryBible(
      project.state.documents.storyBible.content,
      proposal.field_path,
      proposal.resolved_value ?? proposal.proposed_value,
    )
    if (!next) return false
    project.setStoryBibleDocument(() => next)
    return true
  }, [project])

  const handleSpecialistSend = useCallback(async (specialistId: AgentId, text: string) => {
    // Snapshot BEFORE appending
    const conversationHistory = historyFromTranscript(project.state.agents[specialistId].transcript)

    project.addMessage(specialistId, makeMessage('user', text, 'Writer'))

    try {
      const projectContext = buildFreshProjectContext(text)
      const surface = buildSurfaceAwareness(shellState.activeTab, project.state)
      const location = buildWorkspaceLocation({
        activeTab: shellState.activeTab,
        scriptRawHtml: latestScriptSnapshotRef.current.rawHtml,
        scriptFocus: shellState.activeTab === 'script' ? latestScriptSnapshotRef.current.focus : undefined,
        storyBibleSection: shellState.storyBibleSection,
        surface,
      })
      const response = await postWPChat({ projectId: project.activeProjectId!, personaId: specialistId, message: text, projectContext: { ...projectContext, surface, location }, conversationHistory, voiceProfile: loadCompletedVoiceProfile() })
      const speakerName = PERSONAS[specialistId]?.name ?? specialistId
      project.addMessage(specialistId, makeMessage('assistant', response.message, speakerName, { memoryReceipt: response.memoryReceipt }))
    } catch (error) {
      if (isAbortError(error)) return
      project.addMessage(specialistId, makeMessage('assistant', 'Connection error — please try again.', PERSONAS[specialistId]?.name ?? specialistId))
    }
  }, [buildFreshProjectContext, project, shellState.activeTab, shellState.storyBibleSection])

  const renderActiveSurface = () => {
    switch (shellState.activeTab) {
      case 'script':
        return (
          <ScriptTab
            key={`${project.activeProjectId}:${scriptImportNonce}`}
            focusMode={shellState.focusMode}
            onToggleFocusMode={shellState.toggleFocusMode}
            initialScript={project.state.script.rawHtml || undefined}
            projectTitle={project.state.meta.title}
            projectFormat={project.state.meta.format}
            titlePage={project.state.meta.titlePage}
            onProjectTitleChange={title => project.setMeta({ title })}
            onTitlePageChange={project.setTitlePageMetadata}
            onScriptChange={handleScriptChange}
            onScriptSnapshotChange={handleScriptSnapshotChange}
            scriptFacts={project.state.script.facts}
            onRebuildScriptFacts={handleRebuildScriptFacts}
            onImportFdx={handleImportFdxAsNewProject}
            onReplaceFdx={handleReplaceScriptFromFdx}
            importingFdx={importingFdx}
            importError={fdxImportError}
            importWarnings={fdxImportWarnings}
          />
        )
      case 'synopsis':
        return (
          <SynopsisTab
            projectId={activeFolderProjectId ?? undefined}
            projectScopeKey={activeAgentProjectKey}
            document={project.state.documents.synopsis}
            projectFormat={project.state.meta.format}
            identity={pickIdentity(project.state.meta)}
            onProjectFormatChange={project.setProjectFormat}
            onContentPatch={(patch) =>
              project.setSynopsisDocument((content) => ({ ...content, ...patch }))
            }
            onViewPreferencesPatch={(patch) => project.setSynopsisViewPreferences(patch)}
            onComposed={(composed) => project.setComposedDocument('synopsis', composed)}
            onClear={project.clearSynopsis}
          />
        )
      case 'outline':
        return (
          <OutlineTab
            projectId={activeFolderProjectId ?? undefined}
            projectScopeKey={activeAgentProjectKey}
            document={project.state.documents.outline}
            projectFormat={project.state.meta.format}
            identity={pickIdentity(project.state.meta)}
            onProjectFormatChange={project.setProjectFormat}
            onContentChange={project.setOutlineDocument}
            onAddEpisode={project.addEpisode}
            onEpisodeFieldChange={project.setEpisodeField}
            onViewPreferencesPatch={(patch) => project.setOutlineViewPreferences(patch)}
            onComposed={(composed) => project.setComposedDocument('outline', composed)}
            onClear={project.clearOutline}
          />
        )
      case 'treatment':
        return (
          <TreatmentTab
            projectId={activeFolderProjectId ?? undefined}
            projectScopeKey={activeAgentProjectKey}
            document={project.state.documents.treatment}
            projectFormat={project.state.meta.format}
            identity={pickIdentity(project.state.meta)}
            onProjectFormatChange={project.setProjectFormat}
            onContentChange={project.setTreatmentDocument}
            onViewPreferencesPatch={(patch) => project.setTreatmentViewPreferences(patch)}
            onComposed={(composed) => project.setComposedDocument('treatment', composed)}
            onClear={project.clearTreatment}
          />
        )
      case 'story-bible':
        return (
          <StoryBibleTab
            document={project.state.documents.storyBible}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onContentPatch={(patch) =>
              project.setStoryBibleDocument((content) => {
                const next = { ...content, ...patch }
                // Room event source (§6.1): diff character psychology fields
                // and emit doc_field_changed with a leading-edge 90s debounce.
                // Idempotent per identical (prev, next) pair, so StrictMode's
                // double-invoke of this updater cannot double-fire.
                if (project.activeProjectId) {
                  roomFieldEmitter.observe(project.activeProjectId, content, next)
                }
                return next
              })
            }
            onMigrateLegacyStoryBible={project.migrateStoryBibleLegacyToDocument}
            onSectionChange={shellState.setStoryBibleSection}
            onClear={project.clearStoryBible}
          />
        )
      default:
        return null
    }
  }

  const renderCenter = () => {
    // Ritual takeovers render before Home so closing one restores whatever was underneath.
    if (shellState.ritual === 'voiceProfile') {
      return <VoiceProfileRitualPage onExit={shellState.closeRitual} />
    }

    if (shellState.ritual === 'projectMeeting' && project.activeProjectId) {
      return (
        <div style={styles.centerColumn}>
          <MemoryConflictBanner
            conflictCount={countRelevantMemoryConflicts(projectMemory.snapshot, 'project-meeting')}
            onOpenMemory={openMemorySurface}
          />
          <div style={styles.flexFill}>
            <ProjectMeetingPage
              projectId={project.activeProjectId}
              projectScopeKey={activeAgentProjectKey}
              projectTitle={getDisplayProjectTitle(project.state.meta.title)}
              documents={project.state.documents}
              onExit={shellState.closeRitual}
            />
          </div>
        </div>
      )
    }

    if (shellState.ritual === 'memory') {
      return (
        <MemorySurface
          memory={projectMemory}
          onExit={shellState.closeRitual}
        />
      )
    }

    if (shellState.homeActive) {
      return (
        <HomeSurface
          activeProjectId={project.activeProjectId}
          projects={project.projects}
          folderProjects={projectFolder.projects}
          corruptFolderProjects={projectFolder.corruptProjects}
          storageStatus={{
            source: projectFolder.source,
            status: projectFolder.status,
            label: projectFolder.label,
            defaultFolderLabel: projectFolder.defaultFolderLabel,
            fileSystemAccessSupported: projectFolder.fileSystemAccessSupported,
            folderPersistenceSupported: projectFolder.folderPersistenceSupported,
            capabilities: projectFolder.capabilities,
            errorMessage: folderProjectError ?? projectFolder.errorMessage,
          }}
          activeStorageKind={activeProjectStorage.kind}
          openingFolderProjectId={openingFolderProjectId}
          deletingProjectId={deletingProjectId}
          archivingProjectId={archivingProjectId}
          restoringProjectId={restoringProjectId}
          showingProjectInFolderId={showingProjectInFolderId}
          duplicatingProjectId={duplicatingProjectId}
          archivedFolderProjects={projectFolder.archivedProjects}
          onOpenProject={handleOpenBrowserProject}
          onOpenFolderProject={handleOpenFolderProject}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteHomeProject}
          onArchiveProject={handleArchiveHomeProject}
          onRestoreProject={handleRestoreHomeProject}
          onShowProjectInFolder={handleShowHomeProjectInFolder}
          onDuplicateProject={handleDuplicateHomeProject}
          onImportFdx={handleImportFdxAsNewProject}
          importingFdx={importingFdx}
          importError={fdxImportError}
          onChooseProjectFolder={handleChooseProjectFolder}
          onRefreshProjectFolder={projectFolder.refreshFolder}
          onForgetProjectFolder={handleForgetProjectFolder}
          unmigratedProjects={unmigratedProjects}
          folderLabel={projectFolder.label}
          onMigrateLocalStorage={handleMigrateLocalStorage}
          migratingLocalStorage={migratingLocalStorage}
          projectMeetingStandings={projectMeetingStandings}
          onOpenProjectMeeting={(projectId, storageKind) => void handleOpenProjectMeetingFromHome(projectId, storageKind)}
        />
      )
    }

    const activeSurface = renderActiveSurface()
    // Independent, mutually-exclusive workflow families (writeros document
    // surfaces vs. writeros-room), so summing their relevant-conflict counts
    // cannot double-count a single conflict.
    const workspaceConflictCount = countRelevantMemoryConflicts(projectMemory.snapshot, shellState.activeTab)
      + (shellState.writersRoomActive ? countRelevantMemoryConflicts(projectMemory.snapshot, 'writers-room') : 0)

    const patchProposalForActiveTab = activePatchProposal?.mode === 'previewing'
      && surfaceForActiveTab(shellState.activeTab) === activePatchProposal.proposal.patch.surface
      ? activePatchProposal.proposal
      : null

    return (
      <div style={styles.centerColumn}>
        <MemoryConflictBanner conflictCount={workspaceConflictCount} onOpenMemory={openMemorySurface} />
        {patchProposalForActiveTab && (
          <MemoryPatchPreview
            patch={patchProposalForActiveTab.patch}
            rationale={patchProposalForActiveTab.rationale}
            canonConflicts={patchProposalForActiveTab.canonConflicts}
            citations={patchProposalForActiveTab.citations}
            applying={applyingPatch}
            applyError={patchApplyError}
            onApply={handleApplyPatch}
            onKeepAsSuggestion={handleKeepPatchAsSuggestion}
            onDismiss={handleDismissPatch}
          />
        )}
        <div style={styles.surfaceWithWritersRoom}>
          <div style={styles.activeSurfacePane}>
            {activeSurface}
          </div>
          {shellState.writersRoomActive && (
            <WritersRoom
              mode="dock"
              projectState={project.state}
              onSendToSpecialist={handleSpecialistSend}
              onClearTranscript={project.clearTranscript}
              roomProps={
                project.activeProjectId
                  ? {
                      projectId: project.activeProjectId,
                      projectScopeKey: activeAgentProjectKey,
                      characterNames: project.state.documents.storyBible.content.characters
                        .map((c) => c.name)
                        .filter(Boolean),
                      characterBriefs: project.state.documents.storyBible.content.characters.map((c) => ({
                        id: c.id,
                        name: c.name,
                        want: c.want,
                        need: c.need,
                        flaw: c.flaw,
                        secret: c.secret,
                        arc: c.arc,
                      })),
                      surfaceAwareness: buildSurfaceAwareness(shellState.activeTab, project.state),
                      locksText: renderStoryLocksBlock(project.state.documents.storyBible.content),
                      onAdoptProposal: handleAdoptRoomProposal,
                      onOpenProjectMeeting: () => shellState.openRitual('projectMeeting'),
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    )
  }

  const railProps = {
    transcript: project.state.agents.writingPartner.transcript,
    loading: wpLoading,
    onSend: handleWPSend,
    onClearTranscript: () => project.clearTranscript('writingPartner'),
    keptPatchMessageId: activePatchProposal?.mode === 'kept' ? activePatchProposal.messageId : null,
    onReopenPatchSuggestion: handleReopenPatchSuggestion,
  }

  const leftZone = useMemo(
    () => ({
      structure: selectSurfaceStructure(shellState.activeTab, project.state),
      state: selectConsoleState(project.state, shellState.activeTab, shellState.storyBibleSection),
    }),
    [project.state, shellState.activeTab, shellState.storyBibleSection],
  )

  return (
    <Shell
      shellState={shellState}
      projectTitle={project.state.meta.title}
      leftZone={leftZone}
      activeProjectId={project.activeProjectId}
      projectSummaries={project.projects}
      onProjectTitleChange={title => project.setMeta({ title })}
      onProjectChange={handleProjectChange}
      onNewProject={handleNewProject}
      onSaveProject={handleSaveProject}
      onDeleteProject={handleDeleteProject}
      onExportSeed={handleExportSeed}
      railProps={railProps}
    >
      {renderCenter()}
    </Shell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  centerColumn: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  flexFill: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  surfaceWithWritersRoom: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    overflow: 'hidden',
  },
  activeSurfacePane: {
    flex: 1,
    minWidth: 0,
    overflow: 'auto',
  },
}
