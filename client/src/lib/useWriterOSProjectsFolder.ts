import { useCallback, useEffect, useState } from 'react'
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
  type ProjectStorageListEntry,
  type WriterOSFileSystemDirectoryHandle,
} from './projectStorage'
import type { ProjectSummary } from './projectLibrary'

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
  chooseFolder: () => Promise<void>
  refreshFolder: () => Promise<void>
  forgetFolder: () => Promise<void>
}

function folderProjectFromListEntry(entry: Extract<ProjectStorageListEntry, { status: 'ready' }>): WriterOSFolderProject {
  return {
    id: entry.ref.id,
    packageName: entry.ref.packageName,
    summary: entry.ref.summary,
    warnings: entry.warnings,
  }
}

function corruptProjectFromListEntry(entry: Extract<ProjectStorageListEntry, { status: 'corrupt' }>): WriterOSCorruptFolderProject {
  return {
    packageName: entry.packageName,
    code: entry.error.code,
    path: entry.error.path,
    message: entry.error.message,
    warnings: entry.warnings,
  }
}

function projectEntriesFromList(entries: ProjectStorageListEntry[]) {
  return {
    projects: entries
      .filter((entry): entry is Extract<ProjectStorageListEntry, { status: 'ready' }> => entry.status === 'ready')
      .map(folderProjectFromListEntry),
    corruptProjects: entries
      .filter((entry): entry is Extract<ProjectStorageListEntry, { status: 'corrupt' }> => entry.status === 'corrupt')
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
  const [corruptProjects, setCorruptProjects] = useState<WriterOSCorruptFolderProject[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const scanFolder = useCallback(async (
    folderHandle: WriterOSFileSystemDirectoryHandle,
    options: { requestPermission?: boolean } = {},
  ) => {
    setStatus('loading')
    setErrorMessage(null)
    setLabel(folderHandle.name || DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL)

    const permission = options.requestPermission
      ? await requestWriterOSProjectsFolderPermission(folderHandle)
      : await getWriterOSProjectsFolderPermission(folderHandle)

    if (permission !== 'granted') {
      setHandle(folderHandle)
      setProjects([])
      setCorruptProjects([])
      setStatus('permission-needed')
      setErrorMessage('WriterOS needs permission to read this project folder again.')
      return
    }

    const adapter = createFileSystemAccessProjectStorageAdapter(folderHandle)
    const nextEntries = await adapter.listProjects()
    const nextProjects = projectEntriesFromList(nextEntries)

    setHandle(folderHandle)
    setLabel(adapter.label)
    setProjects(nextProjects.projects)
    setCorruptProjects(nextProjects.corruptProjects)
    setStatus('ready')
  }, [])

  const chooseFolder = useCallback(async () => {
    if (!fileSystemAccessSupported) {
      setStatus('unsupported')
      setErrorMessage('File System Access API is not available in this browser.')
      return
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
    } catch (error) {
      if (isAbortError(error)) return
      setStatus('error')
      setErrorMessage(errorMessageFromUnknown(error))
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
      setCorruptProjects([])
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

        await scanFolder(folderHandle)
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
  }
}
