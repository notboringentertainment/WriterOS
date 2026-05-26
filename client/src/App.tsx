import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useShellState } from './lib/shellState'
import { useProjectState } from './lib/useProjectState'
import { useWriterOSProjectsFolder } from './lib/useWriterOSProjectsFolder'
import { FdxImportError, importFdxFile } from './lib/fdxImport'
import { parseMention, parseOpenSwarmCommand, getDefaultPersona, buildProjectContext, formatWritingPartnerSpeaker } from './lib/wpRouting'
import { loadCompletedVoiceProfile, loadCompletedVoiceProfileSliced } from './lib/voiceProfile'
import { classifyPersonaCapability } from './lib/personaCapabilityRouting'
import { isAbortError, postPersonaCapability } from './lib/postPersonaCapability'
import { Shell } from './components/shell/Shell'
import { ScriptTab } from './components/writing/ScriptTab'
import { SynopsisTab } from './components/writing/SynopsisTab'
import { OutlineTab } from './components/writing/OutlineTab'
import { TreatmentTab } from './components/writing/TreatmentTab'
import { StoryBibleTab } from './components/writing/StoryBibleTab'
import { WritersRoom } from './components/writing/WritersRoom'
import { HomeSurface } from './components/home/HomeSurface'
import { PERSONAS } from '@shared/personas'
import type { TranscriptMessage, AgentId, ScriptScene } from './lib/projectState'
import type { ScriptFocusState } from './lib/scriptIndex'
import type { StoredProject } from './lib/projectLibrary'
import { getUnmigratedProjects, markProjectsMigrated, summarizeProjects } from './lib/projectLibrary'
import type { VoiceProfileDocument } from '@shared/voiceProfile'
import type { CapabilityReceipt } from '@shared/personaCapability'
import { computePostDeleteStorageEffect } from './lib/homeDelete'

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
  options: { capabilityReceipt?: CapabilityReceipt } = {}
): TranscriptMessage {
  return { id: crypto.randomUUID(), role, content, speaker, ts: Date.now(), ...options }
}

function historyFromTranscript(transcript: TranscriptMessage[]) {
  return transcript.slice(-6).map(m => ({ role: m.role, content: m.content }))
}

function formatFdxImportError(error: unknown) {
  if (error instanceof FdxImportError) return error.message
  return error instanceof Error ? error.message : 'Unable to import the Final Draft file.'
}

async function postWPChat(body: {
  personaId: string
  message: string
  projectContext: ReturnType<typeof buildProjectContext>
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
}): Promise<{ message: string; suggestions?: string[] }> {
  const res = await fetch('/api/wp-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`wp-chat ${res.status}`)
  return res.json()
}

async function postOpenSwarmWritingPartner(body: {
  message: string
  projectContext: ReturnType<typeof buildProjectContext>
  voiceProfile?: VoiceProfileDocument
}): Promise<{ message: string }> {
  const res = await fetch('/api/openswarm/writing-partner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`openswarm writing-partner ${res.status}`)
  return res.json()
}

export default function App() {
  const shellState = useShellState()
  const project = useProjectState()
  const projectFolder = useWriterOSProjectsFolder()
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
  const [migratingLocalStorage, setMigratingLocalStorage] = useState(false)
  const unmigratedProjects = useMemo(
    () => summarizeProjects(getUnmigratedProjects(project.storedProjects)).map(p => ({ id: p.id, title: p.title })),
    [project.storedProjects],
  )
  const folderSaveNonceRef = useRef(0)
  const writeProjectRef = useRef(projectFolder.writeProject)
  writeProjectRef.current = projectFolder.writeProject
  const activeFolderProjectId = activeProjectStorage.kind === 'folder'
    ? activeProjectStorage.projectId
    : null
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
  }, [formatFolderProjectError])

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
    } catch (error) {
      setFolderProjectError(formatFolderProjectError(error))
    } finally {
      setOpeningFolderProjectId(null)
    }
  }, [cancelPendingFolderSave, formatFolderProjectError, project, projectFolder, shellState])

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

    shellState.openProjectWorkspace()
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

  const handleArchiveHomeProject = useCallback(async (target: import('./components/home/HomeSurface').HomeArchiveTarget) => {
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

  const handleRestoreHomeProject = useCallback(async (target: import('./components/home/HomeSurface').HomeArchiveTarget) => {
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

  const handleDeleteHomeProject = useCallback(async (target: import('./components/home/HomeSurface').HomeDeleteTarget) => {
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
        markProjectsMigrated(project.storedProjects, markers)
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

    if (openSwarmMessage) {
      project.addMessage('writingPartner', makeMessage('user', text, 'Writer'))
      setWpLoading(true)
      try {
        const projectContext = buildFreshProjectContext(openSwarmMessage)
        const voiceProfile = loadCompletedVoiceProfile()
        const response = await postOpenSwarmWritingPartner({ message: openSwarmMessage, projectContext, voiceProfile })
        project.addMessage('writingPartner', makeMessage('assistant', response.message, 'Writing Partner (OpenSwarm)'))
      } catch {
        project.addMessage(
          'writingPartner',
          makeMessage(
            'assistant',
            'OpenSwarm connection error — start the OpenSwarm server on port 8080 and try again.',
            'Writing Partner (OpenSwarm)'
          )
        )
      } finally {
        setWpLoading(false)
      }
      return
    }

    // Step 1: snapshot prior history before appending current message
    const conversationHistory = historyFromTranscript(project.state.agents.writingPartner.transcript)

    // Step 2: parse @mention
    const mentionResult = parseMention(text)
    const personaId = mentionResult
      ? mentionResult.personaId
      : getDefaultPersona(shellState.activeTab, shellState.storyBibleSection, text)
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
          personaId: 'zoe',
          taskKind: 'research_world_context',
          message: messageToSend,
          projectContext,
          voiceProfile: loadCompletedVoiceProfileSliced('world_context'),
          sourceSurface: 'writingPartner',
          clientRequestId: crypto.randomUUID(),
        })

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

      const response = await postWPChat({ personaId, message: messageToSend, projectContext, conversationHistory })
      project.addMessage('writingPartner', makeMessage('assistant', response.message, speakerName))
    } catch (error) {
      if (isAbortError(error)) return
      project.addMessage('writingPartner', makeMessage('assistant', 'Connection error — please try again.', 'Writing Partner'))
    } finally {
      setWpLoading(false)
    }
  }, [buildFreshProjectContext, project, shellState.activeTab, shellState.storyBibleSection])

  const handleSpecialistSend = useCallback(async (specialistId: AgentId, text: string) => {
    // Snapshot BEFORE appending
    const conversationHistory = historyFromTranscript(project.state.agents[specialistId].transcript)

    project.addMessage(specialistId, makeMessage('user', text, 'Writer'))

    try {
      const projectContext = buildFreshProjectContext(text)
      const response = await postWPChat({ personaId: specialistId, message: text, projectContext, conversationHistory })
      const speakerName = PERSONAS[specialistId]?.name ?? specialistId
      project.addMessage(specialistId, makeMessage('assistant', response.message, speakerName))
    } catch (error) {
      if (isAbortError(error)) return
      project.addMessage(specialistId, makeMessage('assistant', 'Connection error — please try again.', PERSONAS[specialistId]?.name ?? specialistId))
    }
  }, [buildFreshProjectContext, project])

  const renderActiveSurface = () => {
    switch (shellState.activeTab) {
      case 'script':
        return (
          <ScriptTab
            key={`${project.activeProjectId}:${scriptImportNonce}`}
            focusMode={shellState.focusMode}
            onToggleFocusMode={shellState.toggleFocusMode}
            initialScript={project.state.script.rawHtml || undefined}
            onScriptChange={handleScriptChange}
            onScriptSnapshotChange={handleScriptSnapshotChange}
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
            document={project.state.documents.synopsis}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onContentPatch={(patch) =>
              project.setSynopsisDocument((content) => ({ ...content, ...patch }))
            }
            onViewPreferencesPatch={(patch) => project.setSynopsisViewPreferences(patch)}
            onClear={project.clearSynopsis}
          />
        )
      case 'outline':
        return (
          <OutlineTab
            document={project.state.documents.outline}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onContentChange={project.setOutlineDocument}
            onAddEpisode={project.addEpisode}
            onEpisodeFieldChange={project.setEpisodeField}
            onClear={project.clearOutline}
          />
        )
      case 'treatment':
        return (
          <TreatmentTab
            document={project.state.documents.treatment}
            projectFormat={project.state.meta.format}
            onProjectFormatChange={project.setProjectFormat}
            onContentChange={project.setTreatmentDocument}
            onViewPreferencesPatch={(patch) => project.setTreatmentViewPreferences(patch)}
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
              project.setStoryBibleDocument((content) => ({ ...content, ...patch }))
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
    if (shellState.homeActive) {
      return (
        <HomeSurface
          activeProjectId={project.activeProjectId}
          projects={project.projects}
          folderProjects={projectFolder.projects}
          corruptFolderProjects={projectFolder.corruptProjects}
          storageStatus={{
            status: projectFolder.status,
            label: projectFolder.label,
            defaultFolderLabel: projectFolder.defaultFolderLabel,
            fileSystemAccessSupported: projectFolder.fileSystemAccessSupported,
            folderPersistenceSupported: projectFolder.folderPersistenceSupported,
            errorMessage: folderProjectError ?? projectFolder.errorMessage,
          }}
          activeStorageKind={activeProjectStorage.kind}
          openingFolderProjectId={openingFolderProjectId}
          deletingProjectId={deletingProjectId}
          archivingProjectId={archivingProjectId}
          restoringProjectId={restoringProjectId}
          archivedFolderProjects={projectFolder.archivedProjects}
          onOpenProject={handleOpenBrowserProject}
          onOpenFolderProject={handleOpenFolderProject}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteHomeProject}
          onArchiveProject={handleArchiveHomeProject}
          onRestoreProject={handleRestoreHomeProject}
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
        />
      )
    }

    const activeSurface = renderActiveSurface()

    return (
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
          />
        )}
      </div>
    )
  }

  const railProps = {
    transcript: project.state.agents.writingPartner.transcript,
    loading: wpLoading,
    onSend: handleWPSend,
    onClearTranscript: () => project.clearTranscript('writingPartner'),
  }

  return (
    <Shell
      shellState={shellState}
      projectTitle={project.state.meta.title}
      activeProjectId={project.activeProjectId}
      projectSummaries={project.projects}
      onProjectTitleChange={title => project.setMeta({ title })}
      onProjectChange={handleProjectChange}
      onNewProject={handleNewProject}
      onSaveProject={handleSaveProject}
      onDeleteProject={handleDeleteProject}
      railProps={railProps}
    >
      {renderCenter()}
    </Shell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  surfaceWithWritersRoom: {
    height: '100%',
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
