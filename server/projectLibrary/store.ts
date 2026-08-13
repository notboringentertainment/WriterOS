import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename as renamePath,
  rm as removePath,
  writeFile,
} from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import {
  getWriterOSProjectPackageDirectoryName,
  readWriterOSProjectPackage,
  serializeWriterOSProjectPackage,
  WRITEROS_DOCUMENT_PATHS,
  WRITEROS_IMPORTED_FDX_SOURCE_PATH,
  WRITEROS_PACKAGE_EXTENSION,
  WRITEROS_PROJECT_MANIFEST_PATH,
  WRITEROS_SCRIPT_FACTS_PATH,
  WRITEROS_SCRIPT_HTML_PATH,
  WRITEROS_TITLE_PAGE_PATH,
  WRITEROS_TRANSCRIPT_PATHS,
  type ProjectPackageReadError,
  type ProjectPackageReadResult,
} from '../../client/src/lib/projectPackage'
import { summarizeProjects, type StoredProject } from '../../client/src/lib/projectLibrary'
import type {
  ProjectStorageListEntry,
  ProjectStorageProjectRef,
} from '../../client/src/lib/projectStorage'
import { WRITEROS_PROJECT_ID_PATTERN } from '../../shared/projectLibraryApi'

const PACKAGE_TEXT_PATHS = [
  WRITEROS_PROJECT_MANIFEST_PATH,
  WRITEROS_SCRIPT_HTML_PATH,
  WRITEROS_SCRIPT_FACTS_PATH,
  WRITEROS_IMPORTED_FDX_SOURCE_PATH,
  WRITEROS_TITLE_PAGE_PATH,
  ...Object.values(WRITEROS_DOCUMENT_PATHS),
  ...Object.values(WRITEROS_TRANSCRIPT_PATHS),
]

export interface ServerProjectRef extends ProjectStorageProjectRef {
  kind: 'server'
}

export interface ProjectLibraryStore {
  label: string
  listProjects(): Promise<Array<ProjectStorageListEntry<ServerProjectRef>>>
  readProject(projectId: string): Promise<ProjectPackageReadResult>
  writeProject(project: StoredProject): Promise<ServerProjectRef>
}

export interface ProjectLibraryFileOperations {
  rename(from: string, to: string): Promise<void>
  rm(target: string, options: { recursive: true; force: true }): Promise<void>
}

export interface ProjectLibraryStoreOptions {
  fileOperations?: Partial<ProjectLibraryFileOperations>
}

export class ProjectLibraryStoreError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ProjectLibraryStoreError'
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function isContained(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function unsafePathError(relativePath: string): ProjectPackageReadError {
  return {
    code: 'unsafe-path',
    path: relativePath,
    message: `${relativePath} uses a symbolic link or escapes the configured project root.`,
  }
}

async function assertSafeExistingPath(rootPath: string, candidatePath: string): Promise<string> {
  const canonicalPath = await realpath(candidatePath)
  if (!isContained(rootPath, canonicalPath)) {
    throw new ProjectLibraryStoreError('Project path escapes the configured root.', 400, 'unsafe-path')
  }

  const relative = path.relative(rootPath, candidatePath)
  let cursor = rootPath
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    const stats = await lstat(cursor)
    if (stats.isSymbolicLink()) {
      throw new ProjectLibraryStoreError('Symbolic links are not allowed in project packages.', 400, 'unsafe-path')
    }
  }
  return canonicalPath
}

async function readPackageFiles(rootPath: string, packagePath: string): Promise<Record<string, string | undefined>> {
  await assertSafeExistingPath(rootPath, packagePath)
  const files: Record<string, string | undefined> = {}

  await Promise.all(PACKAGE_TEXT_PATHS.map(async relativePath => {
    const filePath = path.join(packagePath, relativePath)
    try {
      await assertSafeExistingPath(rootPath, filePath)
      files[relativePath] = await readFile(filePath, 'utf8')
    } catch (error) {
      if (isNotFoundError(error)) {
        files[relativePath] = undefined
        return
      }
      throw error
    }
  }))

  return files
}

function serverRef(packageName: string, project: StoredProject): ServerProjectRef {
  const summary = summarizeProjects([project])[0]
  return {
    kind: 'server',
    id: project.id,
    packageName,
    summary,
  }
}

function validateRelativePackagePath(relativePath: string): void {
  if (
    relativePath.length === 0
    || path.isAbsolute(relativePath)
    || relativePath.split(/[\\/]/).includes('..')
  ) {
    throw new ProjectLibraryStoreError('Serialized project contains an unsafe path.', 400, 'unsafe-path')
  }
}

async function writeStagedPackage(
  stagingPath: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([relativePath, contents]) => {
    validateRelativePackagePath(relativePath)
    const destination = path.join(stagingPath, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, contents, 'utf8')
  }))
}

async function validateStagedPackage(rootPath: string, stagingPath: string): Promise<void> {
  const result = readWriterOSProjectPackage(await readPackageFiles(rootPath, stagingPath))
  if (!result.ok) {
    throw new ProjectLibraryStoreError(result.error.message, 400, result.error.code)
  }
}

export async function createProjectLibraryStore(
  configuredRootPath: string,
  options: ProjectLibraryStoreOptions = {},
): Promise<ProjectLibraryStore> {
  const rootStats = await lstat(configuredRootPath)
  if (!rootStats.isDirectory()) {
    throw new Error('Project library root must be a directory.')
  }
  const rootPath = await realpath(configuredRootPath)
  const fileOperations: ProjectLibraryFileOperations = {
    rename: options.fileOperations?.rename ?? renamePath,
    rm: options.fileOperations?.rm ?? removePath,
  }
  const projectPaths = new Map<string, { packageName: string; packagePath: string }>()

  async function safeRename(from: string, to: string): Promise<void> {
    const resolvedFrom = path.resolve(from)
    const resolvedTo = path.resolve(to)
    if (!isContained(rootPath, resolvedFrom) || !isContained(rootPath, resolvedTo)) {
      throw new ProjectLibraryStoreError('Project rename escapes the configured root.', 400, 'unsafe-path')
    }
    await assertSafeExistingPath(rootPath, resolvedFrom)
    const destinationExists = await lstat(resolvedTo).then(() => true, error => {
      if (isNotFoundError(error)) return false
      throw error
    })
    if (destinationExists) await assertSafeExistingPath(rootPath, resolvedTo)
    await fileOperations.rename(resolvedFrom, resolvedTo)
  }

  async function scanProjects(): Promise<Array<ProjectStorageListEntry<ServerProjectRef>>> {
    projectPaths.clear()
    const entries: Array<ProjectStorageListEntry<ServerProjectRef>> = []
    const children = await readdir(rootPath, { withFileTypes: true })

    for (const child of children) {
      if (!child.name.endsWith(WRITEROS_PACKAGE_EXTENSION)) continue
      const packagePath = path.join(rootPath, child.name)

      try {
        const stats = await lstat(packagePath)
        if (stats.isSymbolicLink()) {
          entries.push({
            status: 'corrupt',
            packageName: child.name,
            error: unsafePathError(child.name),
            warnings: [],
          })
          continue
        }
        if (!stats.isDirectory()) continue

        const result = readWriterOSProjectPackage(await readPackageFiles(rootPath, packagePath))
        if (!result.ok) {
          entries.push({
            status: 'corrupt',
            packageName: child.name,
            error: result.error,
            warnings: result.warnings,
          })
          continue
        }

        projectPaths.set(result.project.id, { packageName: child.name, packagePath })
        entries.push({
          status: 'ready',
          ref: serverRef(child.name, result.project),
          warnings: result.warnings,
        })
      } catch (error) {
        if (error instanceof ProjectLibraryStoreError && error.code === 'unsafe-path') {
          entries.push({
            status: 'corrupt',
            packageName: child.name,
            error: unsafePathError(child.name),
            warnings: [],
          })
          continue
        }
        throw error
      }
    }

    return entries
  }

  async function findProject(projectId: string) {
    let existing = projectPaths.get(projectId)
    if (!existing) {
      await scanProjects()
      existing = projectPaths.get(projectId)
    }
    if (!existing) {
      throw new ProjectLibraryStoreError('WriterOS project was not found.', 404, 'not-found')
    }
    return existing
  }

  return {
    label: path.basename(rootPath),
    listProjects: scanProjects,
    async readProject(projectId) {
      const existing = await findProject(projectId)
      return readWriterOSProjectPackage(await readPackageFiles(rootPath, existing.packagePath))
    },
    async writeProject(project) {
      if (!WRITEROS_PROJECT_ID_PATTERN.test(project.id)) {
        throw new ProjectLibraryStoreError('Cannot save a WriterOS project without a project id.', 400, 'invalid-project')
      }

      await scanProjects()
      const existing = projectPaths.get(project.id)
      const packageName = getWriterOSProjectPackageDirectoryName(project.state.meta.title, project.id)
      const destinationPath = path.join(rootPath, packageName)
      const destinationStats = await lstat(destinationPath).catch(error => {
        if (isNotFoundError(error)) return null
        throw error
      })
      if (destinationStats && (!existing || existing.packagePath !== destinationPath)) {
        throw new ProjectLibraryStoreError('A WriterOS project package with this name already exists.', 409, 'name-collision')
      }
      if (destinationStats?.isSymbolicLink()) {
        throw new ProjectLibraryStoreError('Symbolic links are not allowed in project packages.', 400, 'unsafe-path')
      }

      const serialized = serializeWriterOSProjectPackage(project)
      const stagingPath = await mkdtemp(path.join(rootPath, '.writeros-stage-'))
      const originalPath = existing?.packagePath ?? null
      const backupPath = originalPath
        ? path.join(rootPath, `.writeros-backup-${randomBytes(16).toString('hex')}`)
        : null
      let backupCreated = false
      let committed = false

      try {
        await writeStagedPackage(stagingPath, serialized.files)
        await validateStagedPackage(rootPath, stagingPath)

        if (originalPath && backupPath) {
          await safeRename(originalPath, backupPath)
          backupCreated = true
        }
        try {
          await safeRename(stagingPath, destinationPath)
          committed = true
        } catch (error) {
          if (backupCreated && originalPath && backupPath) {
            await safeRename(backupPath, originalPath)
            backupCreated = false
          }
          throw error
        }

        if (backupCreated && backupPath) {
          try {
            await fileOperations.rm(backupPath, { recursive: true, force: true })
          } catch {
            // Swap already committed. Leave hidden backup for manual recovery;
            // cleanup failure must not roll the old package back beside the new one.
          }
          backupCreated = false
        }
      } finally {
        await fileOperations.rm(stagingPath, { recursive: true, force: true })
        if (!committed && backupCreated && backupPath && originalPath) {
          const originalExists = await lstat(originalPath).then(() => true, () => false)
          if (!originalExists) await safeRename(backupPath, originalPath)
        }
      }

      projectPaths.delete(project.id)
      projectPaths.set(project.id, { packageName, packagePath: destinationPath })
      return serverRef(packageName, project)
    },
  }
}
