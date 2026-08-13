import { useCallback, useEffect, useRef, useState } from 'react'
import { getUnmigratedProjects, summarizeProjects, type StoredProject } from './projectLibrary'
import { migrateLocalStorageToFolder, type MigrationResult } from './migrateLocalStorageToFolder'
import {
  type ArchiveProjectResult,
  type DuplicateProjectResult,
  type ProjectStorageCapabilities,
  type ProjectStorageListEntry,
  type ProjectStorageProjectRef,
  type RemoveProjectResult,
  type ShowProjectInFolderResult,
} from './projectStorage'
import {
  bootstrapServerProjectStorage,
  type ServerProjectStorageRef,
} from './serverProjectStorage'
import {
  useWriterOSProjectsFolder,
  type WriterOSCorruptFolderProject,
  type WriterOSFolderProject,
  type WriterOSFolderProjectOpenResult,
  type WriterOSProjectsFolderStatus,
} from './useWriterOSProjectsFolder'

type ReadyServerProjectEntry = Extract<
  ProjectStorageListEntry<ServerProjectStorageRef>,
  { status: 'ready' }
>

type ServerAdapter = NonNullable<Awaited<ReturnType<typeof bootstrapServerProjectStorage>>>
type BootstrapPhase = 'loading' | 'disabled' | 'ready' | 'failed'

const NO_CAPABILITIES: ProjectStorageCapabilities = {
  removeProject: false,
  archiveProject: false,
  restoreProject: false,
  showProjectInFolder: false,
  duplicateProject: false,
}

const FOLDER_FALLBACK_CAPABILITIES: ProjectStorageCapabilities = {
  removeProject: true,
  archiveProject: true,
  restoreProject: true,
  showProjectInFolder: false,
  duplicateProject: true,
}

function projectFromEntry(entry: ReadyServerProjectEntry): WriterOSFolderProject {
  return {
    id: entry.ref.id,
    packageName: entry.ref.packageName,
    summary: entry.ref.summary,
    warnings: entry.warnings,
  }
}

function corruptProjectFromEntry(
  entry: Extract<ProjectStorageListEntry<ServerProjectStorageRef>, { status: 'corrupt' }>,
): WriterOSCorruptFolderProject {
  return {
    packageName: entry.packageName,
    code: entry.error.code,
    path: entry.error.path,
    message: entry.error.message,
    warnings: entry.warnings,
  }
}

function splitEntries(entries: Array<ProjectStorageListEntry<ServerProjectStorageRef>>) {
  const ready = entries.filter((entry): entry is ReadyServerProjectEntry => entry.status === 'ready')
  return {
    projects: ready.filter(entry => !entry.archived).map(projectFromEntry),
    archivedProjects: ready.filter(entry => entry.archived).map(projectFromEntry),
    corruptProjects: entries
      .filter((entry): entry is Extract<ProjectStorageListEntry<ServerProjectStorageRef>, { status: 'corrupt' }> => entry.status === 'corrupt')
      .map(corruptProjectFromEntry),
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to access the WriterOS project library.'
}

function migrationFailureMessage(results: MigrationResult[], projects: StoredProject[]): string | null {
  const failures = results.filter((result): result is Extract<MigrationResult, { ok: false }> => !result.ok)
  if (failures.length === 0) return null
  const titles = new Map(summarizeProjects(projects).map(project => [project.id, project.title]))
  const details = failures.slice(0, 3).map(failure =>
    `${titles.get(failure.projectId) || failure.projectId}: ${failure.error}`,
  )
  return `${failures.length} browser project${failures.length === 1 ? '' : 's'} failed to migrate: ${details.join('; ')}`
}

export interface WriterOSProjectLibraryState {
  source: 'server' | 'folder'
  capabilities: ProjectStorageCapabilities
  status: WriterOSProjectsFolderStatus
  label: string | null
  defaultFolderLabel: string
  fileSystemAccessSupported: boolean
  folderPersistenceSupported: boolean
  projects: WriterOSFolderProject[]
  archivedProjects: WriterOSFolderProject[]
  corruptProjects: WriterOSCorruptFolderProject[]
  errorMessage: string | null
  chooseFolder: () => Promise<boolean>
  refreshFolder: () => Promise<void>
  forgetFolder: () => Promise<void>
  openProject: (projectId: string) => Promise<WriterOSFolderProjectOpenResult>
  writeProject: (project: StoredProject) => Promise<WriterOSFolderProject>
  deleteProject: (projectId: string) => Promise<RemoveProjectResult>
  archiveProject: (projectId: string) => Promise<ArchiveProjectResult<ProjectStorageProjectRef>>
  restoreProject: (projectId: string) => Promise<ArchiveProjectResult<ProjectStorageProjectRef>>
  showProjectInFolder: (projectId: string) => Promise<ShowProjectInFolderResult>
  duplicateProject: (projectId: string) => Promise<DuplicateProjectResult<ProjectStorageProjectRef>>
  runMigration: (projects: StoredProject[]) => Promise<MigrationResult[]>
}

export function useWriterOSProjectLibrary(): WriterOSProjectLibraryState {
  const folderState = useWriterOSProjectsFolder()
  const [phase, setPhase] = useState<BootstrapPhase>('loading')
  const [adapter, setAdapter] = useState<ServerAdapter | null>(null)
  const [status, setStatus] = useState<WriterOSProjectsFolderStatus>('loading')
  const [projects, setProjects] = useState<WriterOSFolderProject[]>([])
  const [archivedProjects, setArchivedProjects] = useState<WriterOSFolderProject[]>([])
  const [corruptProjects, setCorruptProjects] = useState<WriterOSCorruptFolderProject[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const refs = useRef(new Map<string, ReadyServerProjectEntry>())

  const applyEntries = useCallback((entries: Array<ProjectStorageListEntry<ServerProjectStorageRef>>) => {
    refs.current = new Map(
      entries
        .filter((entry): entry is ReadyServerProjectEntry => entry.status === 'ready')
        .map(entry => [entry.ref.id, entry]),
    )
    const split = splitEntries(entries)
    setProjects(split.projects)
    setArchivedProjects(split.archivedProjects)
    setCorruptProjects(split.corruptProjects)
  }, [])

  const scanServer = useCallback(async (serverAdapter: ServerAdapter) => {
    setStatus('loading')
    setErrorMessage(null)
    const entries = await serverAdapter.listProjects()
    applyEntries(entries)
    setStatus('ready')
  }, [applyEntries])

  useEffect(() => {
    let cancelled = false
    void bootstrapServerProjectStorage()
      .then(async nextAdapter => {
        if (cancelled) return
        if (!nextAdapter) {
          setPhase('disabled')
          return
        }
        setAdapter(nextAdapter)
        setPhase('ready')
        try {
          await scanServer(nextAdapter)
        } catch (error) {
          if (cancelled) return
          setStatus('error')
          setErrorMessage(messageFrom(error))
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('failed')
      })
    return () => {
      cancelled = true
    }
  }, [scanServer])

  const requireAdapter = useCallback(() => {
    if (!adapter) throw new Error('Server project library is not available.')
    return adapter
  }, [adapter])

  const refreshFolder = useCallback(async () => {
    try {
      await scanServer(requireAdapter())
    } catch (error) {
      setStatus('error')
      setErrorMessage(messageFrom(error))
    }
  }, [requireAdapter, scanServer])

  const findEntry = useCallback(async (projectId: string) => {
    let entry = refs.current.get(projectId)
    if (!entry) {
      const serverAdapter = requireAdapter()
      const entries = await serverAdapter.listProjects()
      applyEntries(entries)
      entry = refs.current.get(projectId)
    }
    return entry
  }, [applyEntries, requireAdapter])

  const openProject = useCallback(async (projectId: string): Promise<WriterOSFolderProjectOpenResult> => {
    const entry = await findEntry(projectId)
    if (!entry) throw new Error('That WriterOS project package is no longer available in the project library.')
    const result = await requireAdapter().readProject(entry.ref)
    if (!result.ok) throw new Error(result.error.message)
    setErrorMessage(null)
    return { project: result.project, packageName: entry.ref.packageName, warnings: result.warnings }
  }, [findEntry, requireAdapter])

  const writeProject = useCallback(async (project: StoredProject): Promise<WriterOSFolderProject> => {
    const serverAdapter = requireAdapter()
    const previous = refs.current.get(project.id)
    const ref = await serverAdapter.writeProject(project, previous?.ref)
    const entry: ReadyServerProjectEntry = { status: 'ready', ref, warnings: [] }
    refs.current.set(project.id, entry)
    const nextProject = projectFromEntry(entry)
    setProjects(current => [nextProject, ...current.filter(item => item.id !== project.id)])
    setStatus('ready')
    setErrorMessage(null)
    return nextProject
  }, [requireAdapter])

  const deleteProject = useCallback(async (projectId: string): Promise<RemoveProjectResult> => {
    const entry = await findEntry(projectId)
    if (!entry) return { ok: true, folderAlreadyMissing: true }
    const result = await requireAdapter().removeProject(entry.ref)
    if (result.ok) {
      refs.current.delete(projectId)
      setProjects(current => current.filter(project => project.id !== projectId))
      setArchivedProjects(current => current.filter(project => project.id !== projectId))
    } else setErrorMessage(result.message)
    return result
  }, [findEntry, requireAdapter])

  const archiveProject = useCallback(async (projectId: string): Promise<ArchiveProjectResult<ServerProjectStorageRef>> => {
    const entry = await findEntry(projectId)
    if (!entry) return { ok: false, reason: 'failed', message: 'Project package is not currently tracked.' }
    const result = await requireAdapter().archiveProject(entry.ref)
    if (!result.ok) setErrorMessage(result.message)
    return result
  }, [findEntry, requireAdapter])

  const restoreProject = useCallback(async (projectId: string): Promise<ArchiveProjectResult<ServerProjectStorageRef>> => {
    const entry = await findEntry(projectId)
    if (!entry) return { ok: false, reason: 'failed', message: 'Project package is not currently tracked.' }
    const result = await requireAdapter().restoreProject(entry.ref)
    if (!result.ok) setErrorMessage(result.message)
    return result
  }, [findEntry, requireAdapter])

  const showProjectInFolder = useCallback(async (projectId: string): Promise<ShowProjectInFolderResult> => {
    const entry = await findEntry(projectId)
    if (!entry) return { ok: false, reason: 'failed', message: 'Project package is not currently tracked.' }
    const result = await requireAdapter().showProjectInFolder(entry.ref)
    if (!result.ok) setErrorMessage(result.message)
    return result
  }, [findEntry, requireAdapter])

  const duplicateProject = useCallback(async (projectId: string): Promise<DuplicateProjectResult<ServerProjectStorageRef>> => {
    const entry = await findEntry(projectId)
    if (!entry) return { ok: false, reason: 'failed', message: 'Project package is not currently tracked.' }
    const result = await requireAdapter().duplicateProject(entry.ref)
    if (!result.ok) setErrorMessage(result.message)
    return result
  }, [findEntry, requireAdapter])

  const runMigration = useCallback(async (localProjects: StoredProject[]): Promise<MigrationResult[]> => {
    const serverAdapter = requireAdapter()
    let results: MigrationResult[]
    try {
      results = await migrateLocalStorageToFolder(serverAdapter, localProjects, { folderLabel: serverAdapter.label })
    } catch (error) {
      const message = messageFrom(error)
      setStatus('error')
      setErrorMessage(message)
      return getUnmigratedProjects(localProjects).map(project => ({ projectId: project.id, ok: false, error: message }))
    }
    const migrationError = migrationFailureMessage(results, localProjects)
    try {
      await scanServer(serverAdapter)
      setErrorMessage(migrationError)
    } catch (error) {
      setStatus('error')
      setErrorMessage([migrationError, messageFrom(error)].filter(Boolean).join('. '))
    }
    return results
  }, [requireAdapter, scanServer])

  if (phase === 'disabled' || phase === 'failed') {
    return {
      ...folderState,
      source: 'folder',
      capabilities: folderState.capabilities ?? FOLDER_FALLBACK_CAPABILITIES,
    }
  }

  if (phase === 'loading' || !adapter) {
    return {
      ...folderState,
      source: 'server',
      capabilities: NO_CAPABILITIES,
      status: 'loading',
      label: null,
      projects: [],
      archivedProjects: [],
      corruptProjects: [],
      errorMessage: null,
    }
  }

  return {
    source: 'server',
    capabilities: adapter.capabilities,
    status,
    label: adapter.label,
    defaultFolderLabel: adapter.defaultFolderLabel,
    fileSystemAccessSupported: folderState.fileSystemAccessSupported,
    folderPersistenceSupported: false,
    projects,
    archivedProjects,
    corruptProjects,
    errorMessage,
    chooseFolder: async () => false,
    refreshFolder,
    forgetFolder: async () => undefined,
    openProject,
    writeProject,
    deleteProject,
    archiveProject,
    restoreProject,
    showProjectInFolder,
    duplicateProject,
    runMigration,
  }
}
