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
import { createProjectId, summarizeProjects } from './projectLibrary'
import { getDisplayProjectTitle } from './projectIdentity'

export const DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL = 'Selected folder'
export const FILE_SYSTEM_ACCESS_PICKER_ID = 'writeros-projects'
// Visible subfolder under the chosen folder that holds
// archived `.writeros` packages. The writer can see and back this up.
export const WRITEROS_ARCHIVE_SUBFOLDER_NAME = 'Archive'

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
      // True when the package was discovered inside the Archive/ subfolder.
      archived?: boolean
    }
  | {
      status: 'corrupt'
      packageName: string
      error: ProjectPackageReadError
      warnings: string[]
      archived?: boolean
    }

export type RemoveProjectResult =
  | { ok: true; folderAlreadyMissing: boolean }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'failed'; message: string }

export type ArchiveProjectResult<TRef extends ProjectStorageProjectRef> =
  | { ok: true; ref: TRef }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'failed'; message: string }

export type RevealProjectResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'failed'; message: string }

export type DuplicateProjectResult<TRef extends ProjectStorageProjectRef> =
  | { ok: true; ref: TRef; project: StoredProject; warnings: string[] }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'failed'; message: string }

export interface ProjectStorageAdapter<TRef extends ProjectStorageProjectRef = ProjectStorageProjectRef> {
  kind: 'file-system-access'
  label: string
  defaultFolderLabel: string
  listProjects(): Promise<Array<ProjectStorageListEntry<TRef>>>
  readProject(ref: TRef): Promise<ProjectPackageReadResult>
  writeProject(project: StoredProject, previousRef?: TRef): Promise<TRef>
  removeProject(ref: TRef): Promise<RemoveProjectResult>
  archiveProject(ref: TRef): Promise<ArchiveProjectResult<TRef>>
  restoreProject(ref: TRef): Promise<ArchiveProjectResult<TRef>>
  revealProject(ref: TRef): Promise<RevealProjectResult>
  duplicateProject(ref: TRef): Promise<DuplicateProjectResult<TRef>>
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

async function removeEntryIfPresent(parent: WriterOSFileSystemDirectoryHandle, name: string): Promise<void> {
  if (typeof parent.removeEntry !== 'function') return
  try {
    await parent.removeEntry(name, { recursive: true })
  } catch {
    // Best-effort cleanup after a failed move.
  }
}

async function getExistingDirectoryHandle(
  parent: WriterOSFileSystemDirectoryHandle,
  name: string,
): Promise<WriterOSFileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name)
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error
  }
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

async function copyDirectoryRecursive(
  source: WriterOSFileSystemDirectoryHandle,
  destination: WriterOSFileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of iterateProjectFolder(source)) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      const content = await file.text()
      const destFile = await destination.getFileHandle(name, { create: true })
      const writable = await destFile.createWritable()
      try {
        await writable.write(content)
      } finally {
        await writable.close()
      }
    } else {
      const destSub = await destination.getDirectoryHandle(name, { create: true })
      await copyDirectoryRecursive(handle, destSub)
    }
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

function cloneStoredProjectState(project: StoredProject): StoredProject['state'] {
  if (typeof structuredClone === 'function') return structuredClone(project.state)
  return JSON.parse(JSON.stringify(project.state)) as StoredProject['state']
}

function createDuplicateStoredProject(project: StoredProject): StoredProject {
  const now = Date.now()
  const state = cloneStoredProjectState(project)
  state.meta.title = `${getDisplayProjectTitle(project.state.meta.title)} Copy`

  return {
    id: createProjectId(),
    createdAt: now,
    updatedAt: now,
    state,
  }
}

export function createFileSystemAccessProjectStorageAdapter(
  rootHandle: WriterOSFileSystemDirectoryHandle,
): ProjectStorageAdapter<FileSystemAccessProjectRef> {
  const folderLabel = rootHandle.name || DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL

  return {
    kind: 'file-system-access',
    label: folderLabel,
    defaultFolderLabel: DEFAULT_WRITEROS_PROJECTS_FOLDER_LABEL,
    async listProjects() {
      const entries: Array<ProjectStorageListEntry<FileSystemAccessProjectRef>> = []
      let archiveHandle: WriterOSFileSystemDirectoryHandle | undefined

      for await (const [packageName, handle] of iterateProjectFolder(rootHandle)) {
        if (handle.kind !== 'directory') continue
        if (packageName === WRITEROS_ARCHIVE_SUBFOLDER_NAME) {
          archiveHandle = handle
          continue
        }
        if (!packageName.endsWith(WRITEROS_PACKAGE_EXTENSION)) continue

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

      if (archiveHandle) {
        for await (const [packageName, handle] of iterateProjectFolder(archiveHandle)) {
          if (handle.kind !== 'directory' || !packageName.endsWith(WRITEROS_PACKAGE_EXTENSION)) continue
          const result = readWriterOSProjectPackage(await readProjectPackageFiles(handle))
          if (result.ok) {
            // Stamp archivedAt on the StoredProject so the UI can render the
            // archived view consistently. The package on disk does not store
            // archivedAt independently in V1 — its location under Archive/ is
            // the source of truth.
            const archivedAt = result.project.archivedAt || new Date(result.project.updatedAt).toISOString()
            const stampedProject: StoredProject = { ...result.project, archivedAt }
            entries.push({
              status: 'ready',
              ref: refFromProject(packageName, handle, stampedProject, result.manifest),
              warnings: result.warnings,
              archived: true,
            })
          } else {
            entries.push({
              status: 'corrupt',
              packageName,
              error: result.error,
              warnings: result.warnings,
              archived: true,
            })
          }
        }
      }

      return entries
    },
    async readProject(ref) {
      return readWriterOSProjectPackage(await readProjectPackageFiles(ref.handle))
    },
    async writeProject(project, previousRef) {
      if (project.id.trim().length === 0) {
        throw new Error('Cannot save a WriterOS project package without a project id.')
      }

      const packageName = getWriterOSProjectPackageDirectoryName(project.state.meta.title, project.id)
      const nextPackage = serializeWriterOSProjectPackage(project, {
        sourceImport: project.state.meta.sourceImport ?? previousRef?.manifest.sourceImport,
      })
      let packageHandle: WriterOSFileSystemDirectoryHandle
      let nextPackageName = packageName

      if (previousRef && previousRef.packageName !== packageName) {
        const parent = await getPackageParentHandle(rootHandle, previousRef.handle)
        if (typeof parent.removeEntry === 'function') {
          if (await getExistingDirectoryHandle(parent, packageName)) {
            throw new Error('A WriterOS project package with this name already exists.')
          }

          const renamedHandle = await parent.getDirectoryHandle(packageName, { create: true })
          try {
            await copyDirectoryRecursive(previousRef.handle, renamedHandle)
            await writeProjectPackageFiles(renamedHandle, nextPackage.files)
            await parent.removeEntry(previousRef.packageName, { recursive: true })
            packageHandle = renamedHandle
          } catch (error) {
            await removeEntryIfPresent(parent, packageName)
            throw error
          }
        } else {
          packageHandle = previousRef.handle
          nextPackageName = previousRef.packageName
          await writeProjectPackageFiles(packageHandle, nextPackage.files)
        }
      } else {
        packageHandle = previousRef?.handle ?? await rootHandle.getDirectoryHandle(packageName, { create: true })
        await writeProjectPackageFiles(packageHandle, nextPackage.files)
      }

      return refFromProject(nextPackageName, packageHandle, project, nextPackage.manifest)
    },
    async removeProject(ref) {
      if (typeof rootHandle.removeEntry !== 'function') {
        return {
          ok: false,
          reason: 'unsupported',
          message: 'This browser cannot delete project folders. Remove the folder from disk manually.',
        }
      }
      // ref.handle may live under Archive/ if the project was archived;
      // pick the correct parent to call removeEntry on.
      const parent = await getPackageParentHandle(rootHandle, ref.handle).catch(() => rootHandle)
      const remover: WriterOSFileSystemDirectoryHandle = parent
      try {
        if (typeof remover.removeEntry !== 'function') {
          return {
            ok: false,
            reason: 'unsupported',
            message: 'This browser cannot delete project folders. Remove the folder from disk manually.',
          }
        }
        await remover.removeEntry(ref.packageName, { recursive: true })
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
    async archiveProject(ref) {
      if (typeof rootHandle.removeEntry !== 'function') {
        return {
          ok: false,
          reason: 'unsupported',
          message: 'This browser cannot move project folders. Archive is unavailable.',
        }
      }
      let archiveRoot: WriterOSFileSystemDirectoryHandle | null = null
      let destinationCreated = false
      try {
        archiveRoot = await rootHandle.getDirectoryHandle(WRITEROS_ARCHIVE_SUBFOLDER_NAME, { create: true })
        if (await getExistingDirectoryHandle(archiveRoot, ref.packageName)) {
          return {
            ok: false,
            reason: 'failed',
            message: 'Archive already contains a project folder with this name.',
          }
        }
        const destHandle = await archiveRoot.getDirectoryHandle(ref.packageName, { create: true })
        destinationCreated = true
        await copyDirectoryRecursive(ref.handle, destHandle)
        await rootHandle.removeEntry(ref.packageName, { recursive: true })
        const nextRef: FileSystemAccessProjectRef = { ...ref, handle: destHandle }
        return { ok: true, ref: nextRef }
      } catch (error) {
        if (archiveRoot && destinationCreated) {
          await removeEntryIfPresent(archiveRoot, ref.packageName)
        }
        if (isPermissionDeniedError(error)) {
          return {
            ok: false,
            reason: 'permission-denied',
            message: 'WriterOS could not move the project to Archive because permission was denied.',
          }
        }
        return {
          ok: false,
          reason: 'failed',
          message: error instanceof Error ? error.message : 'Unable to archive the project folder.',
        }
      }
    },
    async restoreProject(ref) {
      let destinationCreated = false
      try {
        const archiveRoot = await rootHandle.getDirectoryHandle(WRITEROS_ARCHIVE_SUBFOLDER_NAME)
        if (typeof archiveRoot.removeEntry !== 'function') {
          return {
            ok: false,
            reason: 'unsupported',
            message: 'This browser cannot move project folders. Restore is unavailable.',
          }
        }
        if (await getExistingDirectoryHandle(rootHandle, ref.packageName)) {
          return {
            ok: false,
            reason: 'failed',
            message: 'Active projects already contain a folder with this name.',
          }
        }
        const destHandle = await rootHandle.getDirectoryHandle(ref.packageName, { create: true })
        destinationCreated = true
        await copyDirectoryRecursive(ref.handle, destHandle)
        await archiveRoot.removeEntry(ref.packageName, { recursive: true })
        const nextRef: FileSystemAccessProjectRef = { ...ref, handle: destHandle }
        return { ok: true, ref: nextRef }
      } catch (error) {
        if (destinationCreated) {
          await removeEntryIfPresent(rootHandle, ref.packageName)
        }
        if (isNotFoundError(error)) {
          return {
            ok: false,
            reason: 'failed',
            message: 'Archived project folder is missing from disk.',
          }
        }
        if (isPermissionDeniedError(error)) {
          return {
            ok: false,
            reason: 'permission-denied',
            message: 'WriterOS could not restore the project because permission was denied.',
          }
        }
        return {
          ok: false,
          reason: 'failed',
          message: error instanceof Error ? error.message : 'Unable to restore the project folder.',
        }
      }
    },
    async revealProject(ref) {
      return {
        ok: false,
        reason: 'unsupported',
        message: `This browser build cannot reveal project packages in Finder. Open ${folderLabel} in Finder and look for ${ref.packageName}.`,
      }
    },
    async duplicateProject(ref) {
      let destinationCreated = false
      let packageName = ''
      try {
        const readResult = readWriterOSProjectPackage(await readProjectPackageFiles(ref.handle))
        if (!readResult.ok) {
          return {
            ok: false,
            reason: 'failed',
            message: readResult.error.message,
          }
        }

        const duplicateProject = createDuplicateStoredProject(readResult.project)
        packageName = getWriterOSProjectPackageDirectoryName(
          duplicateProject.state.meta.title,
          duplicateProject.id,
        )
        if (await getExistingDirectoryHandle(rootHandle, packageName)) {
          return {
            ok: false,
            reason: 'failed',
            message: 'A WriterOS project package with this name already exists.',
          }
        }

        const destinationHandle = await rootHandle.getDirectoryHandle(packageName, { create: true })
        destinationCreated = true
        await copyDirectoryRecursive(ref.handle, destinationHandle)

        const nextPackage = serializeWriterOSProjectPackage(duplicateProject, {
          sourceImport: duplicateProject.state.meta.sourceImport,
        })
        await writeProjectPackageFiles(destinationHandle, nextPackage.files)

        return {
          ok: true,
          ref: refFromProject(packageName, destinationHandle, duplicateProject, nextPackage.manifest),
          project: duplicateProject,
          warnings: [],
        }
      } catch (error) {
        if (destinationCreated && packageName) {
          await removeEntryIfPresent(rootHandle, packageName)
        }
        if (isPermissionDeniedError(error)) {
          return {
            ok: false,
            reason: 'permission-denied',
            message: 'WriterOS could not duplicate the project package because permission was denied.',
          }
        }
        return {
          ok: false,
          reason: 'failed',
          message: error instanceof Error ? error.message : 'Unable to duplicate the project package.',
        }
      }
    },
  }
}

async function getPackageParentHandle(
  rootHandle: WriterOSFileSystemDirectoryHandle,
  packageHandle: WriterOSFileSystemDirectoryHandle,
): Promise<WriterOSFileSystemDirectoryHandle> {
  // The package was archived if it lives inside Archive/. Resolve the parent
  // by looking up the Archive subfolder and checking whether the package's
  // identity (by name) is present.
  try {
    const archiveRoot = await rootHandle.getDirectoryHandle(WRITEROS_ARCHIVE_SUBFOLDER_NAME)
    for await (const [name, handle] of iterateProjectFolder(archiveRoot)) {
      if (handle.kind === 'directory' && name === packageHandle.name) {
        return archiveRoot
      }
    }
  } catch {
    // Archive folder not present; fall through.
  }
  return rootHandle
}
