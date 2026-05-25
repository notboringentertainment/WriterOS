import {
  WRITEROS_DOCUMENT_PATHS,
  WRITEROS_IMPORTED_FDX_SOURCE_PATH,
  WRITEROS_PACKAGE_EXTENSION,
  WRITEROS_PROJECT_MANIFEST_PATH,
  WRITEROS_SCRIPT_HTML_PATH,
  WRITEROS_TRANSCRIPT_PATHS,
  getWriterOSProjectPackageDirectoryName,
  readWriterOSProjectPackage,
  serializeWriterOSProjectPackage,
  type ProjectPackageReadError,
  type ProjectPackageReadResult,
  type WriterOSProjectManifest,
} from './projectPackage'
import type { ProjectSummary, StoredProject } from './projectLibrary'
import { summarizeProjects } from './projectLibrary'

export const DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL = '~/WriterOS Projects'
export const FILE_SYSTEM_ACCESS_PICKER_ID = 'writeros-projects'

export interface WriterOSFileSystemWritable {
  write(data: string): Promise<void>
  close(): Promise<void>
}

export interface WriterOSFileSystemFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WriterOSFileSystemWritable>
}

export interface WriterOSFileSystemDirectoryHandle {
  kind: 'directory'
  name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WriterOSFileSystemFileHandle>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WriterOSFileSystemDirectoryHandle>
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>
  queryPermission?: (descriptor?: WriterOSFileSystemPermissionDescriptor) => Promise<WriterOSFileSystemPermissionState>
  requestPermission?: (descriptor?: WriterOSFileSystemPermissionDescriptor) => Promise<WriterOSFileSystemPermissionState>
  entries?: () => AsyncIterableIterator<[string, WriterOSFileSystemHandle]>
  values?: () => AsyncIterableIterator<WriterOSFileSystemHandle>
}

export type WriterOSFileSystemHandle =
  | WriterOSFileSystemFileHandle
  | WriterOSFileSystemDirectoryHandle

export type WriterOSFileSystemPermissionState = 'granted' | 'denied' | 'prompt'
export interface WriterOSFileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

export interface ProjectStorageProjectRef {
  id: string
  packageName: string
  summary: ProjectSummary
}

export interface FileSystemAccessProjectRef extends ProjectStorageProjectRef {
  handle: WriterOSFileSystemDirectoryHandle
  manifest: WriterOSProjectManifest
}

export type ProjectStorageListEntry<TRef extends ProjectStorageProjectRef = ProjectStorageProjectRef> =
  | {
      status: 'ready'
      ref: TRef
      warnings: string[]
    }
  | {
      status: 'corrupt'
      packageName: string
      error: ProjectPackageReadError
      warnings: string[]
    }

export type RemoveProjectResult =
  | { ok: true; folderAlreadyMissing: boolean }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'failed'; message: string }

export interface ProjectStorageAdapter<TRef extends ProjectStorageProjectRef = ProjectStorageProjectRef> {
  kind: 'file-system-access'
  label: string
  defaultFolderLabel: string
  listProjects(): Promise<Array<ProjectStorageListEntry<TRef>>>
  readProject(ref: TRef): Promise<ProjectPackageReadResult>
  writeProject(project: StoredProject, previousRef?: TRef): Promise<TRef>
  removeProject(ref: TRef): Promise<RemoveProjectResult>
}

type ShowDirectoryPicker = (options?: {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
}) => Promise<WriterOSFileSystemDirectoryHandle>

const WRITEROS_PROJECTS_FOLDER_HANDLE_DB_NAME = 'writeros-project-folder'
const WRITEROS_PROJECTS_FOLDER_HANDLE_STORE_NAME = 'handles'
const WRITEROS_PROJECTS_FOLDER_HANDLE_KEY = 'projects-folder'

function getShowDirectoryPicker(): ShowDirectoryPicker | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    showDirectoryPicker?: ShowDirectoryPicker
  }
  return typeof maybeGlobal.showDirectoryPicker === 'function'
    ? maybeGlobal.showDirectoryPicker.bind(globalThis)
    : undefined
}

export function isFileSystemAccessSupported(): boolean {
  return getShowDirectoryPicker() !== undefined
}

function getIndexedDB(): IDBFactory | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    indexedDB?: IDBFactory
  }
  return maybeGlobal.indexedDB
}

export function isWriterOSProjectsFolderPersistenceSupported(): boolean {
  return getIndexedDB() !== undefined
}

export async function pickWriterOSProjectsFolder(): Promise<WriterOSFileSystemDirectoryHandle> {
  const showDirectoryPicker = getShowDirectoryPicker()
  if (!showDirectoryPicker) {
    throw new Error('File System Access API is not available in this browser.')
  }

  return showDirectoryPicker({
    id: FILE_SYSTEM_ACCESS_PICKER_ID,
    mode: 'readwrite',
    startIn: 'documents',
  })
}

function openProjectsFolderHandleDatabase(): Promise<IDBDatabase> {
  const indexedDB = getIndexedDB()
  if (!indexedDB) {
    throw new Error('Folder persistence is not available in this browser.')
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WRITEROS_PROJECTS_FOLDER_HANDLE_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(WRITEROS_PROJECTS_FOLDER_HANDLE_STORE_NAME)) {
        database.createObjectStore(WRITEROS_PROJECTS_FOLDER_HANDLE_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open WriterOS folder storage.'))
  })
}

async function withProjectsFolderHandleStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openProjectsFolderHandleDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WRITEROS_PROJECTS_FOLDER_HANDLE_STORE_NAME, mode)
    const store = transaction.objectStore(WRITEROS_PROJECTS_FOLDER_HANDLE_STORE_NAME)
    const request = operation(store)
    let result: T

    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('Unable to use WriterOS folder storage.'))
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Unable to complete WriterOS folder storage transaction.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('WriterOS folder storage transaction was aborted.'))
    }
  })
}

export async function persistWriterOSProjectsFolderHandle(
  handle: WriterOSFileSystemDirectoryHandle,
): Promise<void> {
  await withProjectsFolderHandleStore('readwrite', store =>
    store.put(handle, WRITEROS_PROJECTS_FOLDER_HANDLE_KEY),
  )
}

export async function loadPersistedWriterOSProjectsFolderHandle(): Promise<WriterOSFileSystemDirectoryHandle | null> {
  const handle = await withProjectsFolderHandleStore<WriterOSFileSystemDirectoryHandle | undefined>(
    'readonly',
    store => store.get(WRITEROS_PROJECTS_FOLDER_HANDLE_KEY),
  )

  return handle?.kind === 'directory' ? handle : null
}

export async function clearPersistedWriterOSProjectsFolderHandle(): Promise<void> {
  await withProjectsFolderHandleStore('readwrite', store =>
    store.delete(WRITEROS_PROJECTS_FOLDER_HANDLE_KEY),
  )
}

export async function getWriterOSProjectsFolderPermission(
  handle: WriterOSFileSystemDirectoryHandle,
): Promise<WriterOSFileSystemPermissionState> {
  if (!handle.queryPermission) return 'granted'
  return handle.queryPermission({ mode: 'readwrite' })
}

export async function requestWriterOSProjectsFolderPermission(
  handle: WriterOSFileSystemDirectoryHandle,
): Promise<WriterOSFileSystemPermissionState> {
  const currentPermission = await getWriterOSProjectsFolderPermission(handle)
  if (currentPermission === 'granted') return currentPermission
  if (!handle.requestPermission) return currentPermission
  return handle.requestPermission({ mode: 'readwrite' })
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('name' in error)) return false
  return error.name === 'NotAllowedError' || error.name === 'SecurityError'
}

async function readTextFile(rootHandle: WriterOSFileSystemDirectoryHandle, path: string): Promise<string | undefined> {
  const parts = path.split('/').filter(Boolean)
  let directory = rootHandle

  try {
    for (const part of parts.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(part)
    }
    const fileHandle = await directory.getFileHandle(parts[parts.length - 1])
    const file = await fileHandle.getFile()
    return file.text()
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

async function writeTextFile(rootHandle: WriterOSFileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  let directory = rootHandle

  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create: true })
  }

  const fileHandle = await directory.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(text)
  await writable.close()
}

async function readProjectPackageFiles(handle: WriterOSFileSystemDirectoryHandle): Promise<Record<string, string | undefined>> {
  const paths = [
    WRITEROS_PROJECT_MANIFEST_PATH,
    WRITEROS_SCRIPT_HTML_PATH,
    WRITEROS_IMPORTED_FDX_SOURCE_PATH,
    WRITEROS_DOCUMENT_PATHS.synopsis,
    WRITEROS_DOCUMENT_PATHS.outline,
    WRITEROS_DOCUMENT_PATHS.treatment,
    WRITEROS_DOCUMENT_PATHS.storyBible,
    WRITEROS_TRANSCRIPT_PATHS.writingPartner,
    WRITEROS_TRANSCRIPT_PATHS.specialists,
  ]
  const entries = await Promise.all(paths.map(async path => [path, await readTextFile(handle, path)] as const))
  return Object.fromEntries(entries)
}

async function writeProjectPackageFiles(
  handle: WriterOSFileSystemDirectoryHandle,
  files: Record<string, string>,
): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await writeTextFile(handle, path, text)
  }
}

async function* iterateProjectFolder(rootHandle: WriterOSFileSystemDirectoryHandle): AsyncIterableIterator<[string, WriterOSFileSystemHandle]> {
  if (rootHandle.entries) {
    yield* rootHandle.entries()
    return
  }

  if (rootHandle.values) {
    for await (const handle of rootHandle.values()) {
      yield [handle.name, handle]
    }
    return
  }

  throw new Error('Selected project folder cannot be listed by this browser.')
}

function refFromProject(
  packageName: string,
  handle: WriterOSFileSystemDirectoryHandle,
  project: StoredProject,
  manifest: WriterOSProjectManifest,
): FileSystemAccessProjectRef {
  return {
    id: project.id,
    packageName,
    handle,
    manifest,
    summary: summarizeProjects([project])[0],
  }
}

export function createFileSystemAccessProjectStorageAdapter(
  rootHandle: WriterOSFileSystemDirectoryHandle,
): ProjectStorageAdapter<FileSystemAccessProjectRef> {
  return {
    kind: 'file-system-access',
    label: rootHandle.name || DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL,
    defaultFolderLabel: DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL,
    async listProjects() {
      const entries: Array<ProjectStorageListEntry<FileSystemAccessProjectRef>> = []

      for await (const [packageName, handle] of iterateProjectFolder(rootHandle)) {
        if (handle.kind !== 'directory' || !packageName.endsWith(WRITEROS_PACKAGE_EXTENSION)) continue

        const result = readWriterOSProjectPackage(await readProjectPackageFiles(handle))
        if (result.ok) {
          entries.push({
            status: 'ready',
            ref: refFromProject(packageName, handle, result.project, result.manifest),
            warnings: result.warnings,
          })
        } else {
          entries.push({
            status: 'corrupt',
            packageName,
            error: result.error,
            warnings: result.warnings,
          })
        }
      }

      return entries
    },
    async readProject(ref) {
      return readWriterOSProjectPackage(await readProjectPackageFiles(ref.handle))
    },
    async writeProject(project, previousRef) {
      const packageName = getWriterOSProjectPackageDirectoryName(project.state.meta.title, project.id)
      const packageHandle = previousRef?.handle ?? await rootHandle.getDirectoryHandle(packageName, { create: true })
      const nextPackage = serializeWriterOSProjectPackage(project, {
        sourceImport: project.state.meta.sourceImport ?? previousRef?.manifest.sourceImport,
      })
      await writeProjectPackageFiles(packageHandle, nextPackage.files)
      return refFromProject(previousRef?.packageName ?? packageName, packageHandle, project, nextPackage.manifest)
    },
    async removeProject(ref) {
      if (typeof rootHandle.removeEntry !== 'function') {
        return {
          ok: false,
          reason: 'unsupported',
          message: 'This browser cannot delete project folders. Remove the folder from disk manually.',
        }
      }
      try {
        await rootHandle.removeEntry(ref.packageName, { recursive: true })
        return { ok: true, folderAlreadyMissing: false }
      } catch (error) {
        if (isNotFoundError(error)) {
          return { ok: true, folderAlreadyMissing: true }
        }
        if (isPermissionDeniedError(error)) {
          return {
            ok: false,
            reason: 'permission-denied',
            message: 'WriterOS could not delete the project folder because permission was denied.',
          }
        }
        return {
          ok: false,
          reason: 'failed',
          message: error instanceof Error ? error.message : 'Unable to delete the project folder.',
        }
      }
    },
  }
}
