import {
  WRITEROS_DOCUMENT_PATHS,
  WRITEROS_PACKAGE_EXTENSION,
  WRITEROS_PROJECT_MANIFEST_PATH,
  WRITEROS_SCRIPT_HTML_PATH,
  WRITEROS_TRANSCRIPT_PATHS,
  getWriterOSProjectPackageDirectoryName,
  readWriterOSProjectPackage,
  serializeWriterOSProjectPackage,
  type ProjectPackageReadError,
  type ProjectPackageReadResult,
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
  entries?: () => AsyncIterableIterator<[string, WriterOSFileSystemHandle]>
  values?: () => AsyncIterableIterator<WriterOSFileSystemHandle>
}

export type WriterOSFileSystemHandle =
  | WriterOSFileSystemFileHandle
  | WriterOSFileSystemDirectoryHandle

export interface ProjectStorageProjectRef {
  id: string
  packageName: string
  summary: ProjectSummary
}

export interface FileSystemAccessProjectRef extends ProjectStorageProjectRef {
  handle: WriterOSFileSystemDirectoryHandle
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

export interface ProjectStorageAdapter<TRef extends ProjectStorageProjectRef = ProjectStorageProjectRef> {
  kind: 'file-system-access'
  label: string
  defaultFolderLabel: string
  listProjects(): Promise<Array<ProjectStorageListEntry<TRef>>>
  readProject(ref: TRef): Promise<ProjectPackageReadResult>
  writeProject(project: StoredProject): Promise<TRef>
}

type ShowDirectoryPicker = (options?: {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
}) => Promise<WriterOSFileSystemDirectoryHandle>

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

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')
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

function refFromProject(packageName: string, handle: WriterOSFileSystemDirectoryHandle, project: StoredProject): FileSystemAccessProjectRef {
  return {
    id: project.id,
    packageName,
    handle,
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
            ref: refFromProject(packageName, handle, result.project),
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
    async writeProject(project) {
      const packageName = getWriterOSProjectPackageDirectoryName(project.state.meta.title, project.id)
      const packageHandle = await rootHandle.getDirectoryHandle(packageName, { create: true })
      await writeProjectPackageFiles(packageHandle, serializeWriterOSProjectPackage(project).files)
      return refFromProject(packageName, packageHandle, project)
    },
  }
}
