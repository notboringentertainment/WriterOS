import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL,
  clearPersistedWriterOSProjectsFolderHandle,
  createFileSystemAccessProjectStorageAdapter,
  isFileSystemAccessSupported,
  isWriterOSProjectsFolderPersistenceSupported,
  loadPersistedWriterOSProjectsFolderHandle,
  persistWriterOSProjectsFolderHandle,
  pickWriterOSProjectsFolder,
  requestWriterOSProjectsFolderPermission,
  getWriterOSProjectsFolderPermission,
  type ArchiveProjectResult,
  type FileSystemAccessProjectRef,
  type ProjectStorageListEntry,
  type RemoveProjectResult,
  type WriterOSFileSystemDirectoryHandle,
} from './projectStorage'
import type { ProjectSummary, StoredProject } from './projectLibrary'

export type WriterOSProjectsFolderStatus =
  | 'unsupported'
  | 'disconnected'
  | 'loading'
  | 'permission-needed'
  | 'ready'
  | 'error'

export interface WriterOSFolderProject {
  id: string
  packageName: string
  summary: ProjectSummary
  warnings: string[]
}

export interface WriterOSCorruptFolderProject {
  packageName: string
  code: string
  path: string
  message: string
  warnings: string[]
}

export interface WriterOSProjectsFolderState {
  status: WriterOSProjectsFolderStatus
  label: string | null
  defaultFolderLabel: string
  fileSystemAccessSupported: boolean
  folderPersistenceSupported: boolean
  projects: WriterOSFolderProject[]
  corruptProjects: WriterOSCorruptFolderProject[]
  errorMessage: string | null
  chooseFolder: () => Promise<boolean>
  refreshFolder: () => Promise<void>
  forgetFolder: () => Promise<void>
  archivedProjects: WriterOSFolderProject[]
  openProject: (projectId: string) => Promise<WriterOSFolderProjectOpenResult>
  writeProject: (project: StoredProject) => Promise<WriterOSFolderProject>
  deleteProject: (projectId: string) => Promise<RemoveProjectResult>
  archiveProject: (projectId: string) => Promise<ArchiveProjectResult<FileSystemAccessProjectRef>>
  restoreProject: (projectId: string) => Promise<ArchiveProjectResult<FileSystemAccessProjectRef>>
}

export interface WriterOSFolderProjectOpenResult {
  project: StoredProject
  packageName: string
  warnings: string[]
}

type ReadyFileSystemProjectEntry = Extract<ProjectStorageListEntry<FileSystemAccessProjectRef>, { status: 'ready' }>

function folderProjectFromListEntry(entry: ReadyFileSystemProjectEntry): WriterOSFolderProject {
  return {
    id: entry.ref.id,
    packageName: entry.ref.packageName,
    summary: entry.ref.summary,
    warnings: entry.warnings,
  }
}

function corruptProjectFromListEntry(entry: Extract<ProjectStorageListEntry<FileSystemAccessProjectRef>, { status: 'corrupt' }>): WriterOSCorruptFolderProject {
  return {
    packageName: entry.packageName,
    code: entry.error.code,
    path: entry.error.path,
    message: entry.error.message,
    warnings: entry.warnings,
  }
}

function projectEntriesFromList(entries: Array<ProjectStorageListEntry<FileSystemAccessProjectRef>>) {
  const ready = entries.filter((entry): entry is ReadyFileSystemProjectEntry => entry.status === 'ready')
  return {
    projects: ready.filter(entry => !entry.archived).map(folderProjectFromListEntry),
    archivedProjects: ready.filter(entry => entry.archived).map(folderProjectFromListEntry),
    corruptProjects: entries
      .filter((entry): entry is Extract<ProjectStorageListEntry<FileSystemAccessProjectRef>, { status: 'corrupt' }> => entry.status === 'corrupt')
      .map(corruptProjectFromListEntry),
  }
}

function errorMessageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to read the selected WriterOS Projects folder.'
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

export function useWriterOSProjectsFolder(): WriterOSProjectsFolderState {
  const fileSystemAccessSupported = isFileSystemAccessSupported()
  const folderPersistenceSupported = isWriterOSProjectsFolderPersistenceSupported()
  const [handle, setHandle] = useState<WriterOSFileSystemDirectoryHandle | null>(null)
  const [status, setStatus] = useState<WriterOSProjectsFolderStatus>(
    fileSystemAccessSupported ? 'disconnected' : 'unsupported',
  )
  const [label, setLabel] = useState<string | null>(null)
  const [projects, setProjects] = useState<WriterOSFolderProject[]>([])
  const [archivedProjects, setArchivedProjects] = useState<WriterOSFolderProject[]>([])
  const [corruptProjects, setCorruptProjects] = useState<WriterOSCorruptFolderProject[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const projectRefsRef = useRef(new Map<string, ReadyFileSystemProjectEntry>())

  const updateProjectRefs = useCallback((entries: Array<ProjectStorageListEntry<FileSystemAccessProjectRef>>) => {
    // Both active and archived ready entries get tracked so we can resolve
    // their handles for archive / restore / delete from anywhere on Home.
    projectRefsRef.current = new Map(
      entries
        .filter((entry): entry is ReadyFileSystemProjectEntry => entry.status === 'ready')
        .map(entry => [entry.ref.id, entry]),
    )
  }, [])

  const scanFolder = useCallback(async (
    folderHandle: WriterOSFileSystemDirectoryHandle,
    options: { requestPermission?: boolean; isCancelled?: () => boolean } = {},
  ) => {
    setStatus('loading')
    setErrorMessage(null)
    setLabel(folderHandle.name || DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL)

    const permission = options.requestPermission
      ? await requestWriterOSProjectsFolderPermission(folderHandle)
      : await getWriterOSProjectsFolderPermission(folderHandle)

    if (options.isCancelled?.()) return

    if (permission !== 'granted') {
      setHandle(folderHandle)
      setProjects([])
      setArchivedProjects([])
      setCorruptProjects([])
      projectRefsRef.current = new Map()
      setStatus('permission-needed')
      setErrorMessage('WriterOS needs permission to read this project folder again.')
      return
    }

    setHandle(folderHandle)
    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    const nextEntries = await adapter.listProjects()
    if (options.isCancelled?.()) return

    updateProjectRefs(nextEntries)
    const nextProjects = projectEntriesFromList(nextEntries)

    setLabel(adapter.label)
    setProjects(nextProjects.projects)
    setArchivedProjects(nextProjects.archivedProjects)
    setCorruptProjects(nextProjects.corruptProjects)
    setStatus('ready')
  }, [updateProjectRefs])

  const requireFolderPermission = useCallback(async () => {
    if (!handle) {
      throw new Error('Choose a WriterOS Projects folder before opening file-backed projects.')
    }

    const permission = await requestWriterOSProjectsFolderPermission(handle)
    if (permission !== 'granted') {
      setStatus('permission-needed')
      setErrorMessage('WriterOS needs permission to read this project folder again.')
      throw new Error('WriterOS needs permission to read this project folder again.')
    }

    return handle
  }, [handle])

  const openProject = useCallback(async (projectId: string): Promise<WriterOSFolderProjectOpenResult> => {
    const folderHandle = await requireFolderPermission()
    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    let entry = projectRefsRef.current.get(projectId)

    if (!entry) {
      const nextEntries = await adapter.listProjects()
      updateProjectRefs(nextEntries)
      const nextProjects = projectEntriesFromList(nextEntries)
      setLabel(adapter.label)
      setProjects(nextProjects.projects)
      setArchivedProjects(nextProjects.archivedProjects)
      setCorruptProjects(nextProjects.corruptProjects)
      setStatus('ready')
      entry = projectRefsRef.current.get(projectId)
    }

    if (!entry) {
      const message = 'That WriterOS project package is no longer available in the selected folder.'
      setStatus('error')
      setErrorMessage(message)
      throw new Error(message)
    }

    const result = await adapter.readProject(entry.ref)
    if (!result.ok) {
      setStatus('error')
      setErrorMessage(result.error.message)
      throw new Error(result.error.message)
    }

    setErrorMessage(null)
    return {
      project: result.project,
      packageName: entry.ref.packageName,
      warnings: result.warnings,
    }
  }, [requireFolderPermission, updateProjectRefs])

  const writeProject = useCallback(async (project: StoredProject): Promise<WriterOSFolderProject> => {
    const folderHandle = await requireFolderPermission()
    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    const previousEntry = projectRefsRef.current.get(project.id)
    const ref = await adapter.writeProject(project, previousEntry?.ref)
    const nextEntry: ReadyFileSystemProjectEntry = {
      status: 'ready',
      ref,
      warnings: [],
    }
    projectRefsRef.current.set(project.id, nextEntry)
    const nextProject = folderProjectFromListEntry(nextEntry)

    setLabel(adapter.label)
    setProjects(currentProjects => [
      nextProject,
      ...currentProjects.filter(currentProject => currentProject.id !== nextProject.id),
    ])
    setStatus('ready')
    setErrorMessage(null)

    return nextProject
  }, [requireFolderPermission])

  const deleteProject = useCallback(async (projectId: string): Promise<RemoveProjectResult> => {
    const entry = projectRefsRef.current.get(projectId)
    if (!entry) {
      // Folder not tracked here — treat as success so the library cleanup can
      // proceed without surfacing a false failure.
      return { ok: true, folderAlreadyMissing: true }
    }

    let folderHandle: WriterOSFileSystemDirectoryHandle
    try {
      folderHandle = await requireFolderPermission()
    } catch (error) {
      return {
        ok: false,
        reason: 'permission-denied',
        message: errorMessageFromUnknown(error),
      }
    }

    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    const result = await adapter.removeProject(entry.ref)

    if (result.ok) {
      projectRefsRef.current.delete(projectId)
      setProjects(currentProjects => currentProjects.filter(project => project.id !== projectId))
      setArchivedProjects(currentProjects => currentProjects.filter(project => project.id !== projectId))
      setErrorMessage(null)
    } else {
      setErrorMessage(result.message)
    }

    return result
  }, [requireFolderPermission])

  const archiveProject = useCallback(async (projectId: string): Promise<ArchiveProjectResult<FileSystemAccessProjectRef>> => {
    const entry = projectRefsRef.current.get(projectId)
    if (!entry) {
      return { ok: false, reason: 'failed', message: 'Project folder is not currently tracked.' }
    }

    let folderHandle: WriterOSFileSystemDirectoryHandle
    try {
      folderHandle = await requireFolderPermission()
    } catch (error) {
      return { ok: false, reason: 'permission-denied', message: errorMessageFromUnknown(error) }
    }

    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    const result = await adapter.archiveProject(entry.ref)

    if (result.ok) {
      const movedEntry: ReadyFileSystemProjectEntry = { ...entry, ref: result.ref }
      projectRefsRef.current.set(projectId, movedEntry)
      setProjects(currentProjects => currentProjects.filter(project => project.id !== projectId))
      setArchivedProjects(currentProjects => [
        folderProjectFromListEntry(movedEntry),
        ...currentProjects.filter(project => project.id !== projectId),
      ])
      setErrorMessage(null)
    } else {
      setErrorMessage(result.message)
    }

    return result
  }, [requireFolderPermission])

  const restoreProject = useCallback(async (projectId: string): Promise<ArchiveProjectResult<FileSystemAccessProjectRef>> => {
    const entry = projectRefsRef.current.get(projectId)
    if (!entry) {
      return { ok: false, reason: 'failed', message: 'Project folder is not currently tracked.' }
    }

    let folderHandle: WriterOSFileSystemDirectoryHandle
    try {
      folderHandle = await requireFolderPermission()
    } catch (error) {
      return { ok: false, reason: 'permission-denied', message: errorMessageFromUnknown(error) }
    }

    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    const result = await adapter.restoreProject(entry.ref)

    if (result.ok) {
      const movedEntry: ReadyFileSystemProjectEntry = { ...entry, ref: result.ref }
      projectRefsRef.current.set(projectId, movedEntry)
      setArchivedProjects(currentProjects => currentProjects.filter(project => project.id !== projectId))
      setProjects(currentProjects => [
        folderProjectFromListEntry(movedEntry),
        ...currentProjects.filter(project => project.id !== projectId),
      ])
      setErrorMessage(null)
    } else {
      setErrorMessage(result.message)
    }

    return result
  }, [requireFolderPermission])

  const chooseFolder = useCallback(async () => {
    if (!fileSystemAccessSupported) {
      setStatus('unsupported')
      setErrorMessage('File System Access API is not available in this browser.')
      return false
    }

    try {
      const folderHandle = await pickWriterOSProjectsFolder()
      await scanFolder(folderHandle, { requestPermission: true })

      if (folderPersistenceSupported) {
        try {
          await persistWriterOSProjectsFolderHandle(folderHandle)
        } catch {
          setErrorMessage('Project folder is connected for this session, but this browser could not remember it.')
        }
      }
      return true
    } catch (error) {
      if (isAbortError(error)) return false
      setStatus('error')
      setErrorMessage(errorMessageFromUnknown(error))
      return false
    }
  }, [fileSystemAccessSupported, folderPersistenceSupported, scanFolder])

  const refreshFolder = useCallback(async () => {
    if (!handle) {
      await chooseFolder()
      return
    }

    try {
      await scanFolder(handle, { requestPermission: true })
    } catch (error) {
      setStatus('error')
      setErrorMessage(errorMessageFromUnknown(error))
    }
  }, [chooseFolder, handle, scanFolder])

  const forgetFolder = useCallback(async () => {
    try {
      if (folderPersistenceSupported) {
        await clearPersistedWriterOSProjectsFolderHandle()
      }
    } finally {
      setHandle(null)
      setLabel(null)
      setProjects([])
      setArchivedProjects([])
      setCorruptProjects([])
      projectRefsRef.current = new Map()
      setErrorMessage(null)
      setStatus(fileSystemAccessSupported ? 'disconnected' : 'unsupported')
    }
  }, [fileSystemAccessSupported, folderPersistenceSupported])

  useEffect(() => {
    let cancelled = false

    async function loadPersistedFolder() {
      if (!fileSystemAccessSupported) return
      if (!folderPersistenceSupported) {
        setStatus('disconnected')
        return
      }

      setStatus('loading')
      try {
        const folderHandle = await loadPersistedWriterOSProjectsFolderHandle()
        if (cancelled) return

        if (!folderHandle) {
          setStatus('disconnected')
          return
        }

        await scanFolder(folderHandle, { isCancelled: () => cancelled })
        if (cancelled) return
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(errorMessageFromUnknown(error))
      }
    }

    void loadPersistedFolder()

    return () => {
      cancelled = true
    }
  }, [fileSystemAccessSupported, folderPersistenceSupported, scanFolder])

  return {
    status,
    label,
    defaultFolderLabel: DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL,
    fileSystemAccessSupported,
    folderPersistenceSupported,
    projects,
    corruptProjects,
    errorMessage,
    chooseFolder,
    refreshFolder,
    forgetFolder,
    archivedProjects,
    openProject,
    writeProject,
    deleteProject,
    archiveProject,
    restoreProject,
  }
}
