import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename as renamePath,
  rm as removePath,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
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
import { acquirePackageWriteLock, type PackageWriteLockTestHooks } from './packageLock'

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
  resolveProjectPackagePath(projectId: string): Promise<string>
  readProject(projectId: string): Promise<ProjectPackageReadResult>
  writeProject(project: StoredProject): Promise<ServerProjectRef>
}

export interface ProjectLibraryFileOperations {
  rename(from: string, to: string): Promise<void>
  rm(target: string, options: { recursive: true; force: true }): Promise<void>
  beforePreservedFileOpen?(sourcePath: string): Promise<void>
  afterPackageSnapshot?(originalPath: string, snapshotPath: string): Promise<void>
}

export interface ProjectLibraryStoreOptions {
  fileOperations?: Partial<ProjectLibraryFileOperations>
  /** @internal Deterministic lock failure injection for regression tests. */
  packageLockTestHooks?: PackageWriteLockTestHooks
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

function isNoFollowError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error.code === 'ELOOP' || error.code === 'EMLINK'),
  )
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

function unsafePackagePath(): ProjectLibraryStoreError {
  return new ProjectLibraryStoreError('Symbolic links are not allowed in project packages.', 400, 'unsafe-path')
}

async function readSafeRegularFile(
  rootPath: string,
  candidatePath: string,
  beforeOpen?: (sourcePath: string) => Promise<void>,
): Promise<Buffer> {
  await assertSafeExistingPath(rootPath, candidatePath)
  await beforeOpen?.(candidatePath)
  let handle
  try {
    handle = await open(candidatePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (isNoFollowError(error)) throw unsafePackagePath()
    throw error
  }

  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw unsafePackagePath()
    await assertSafeExistingPath(rootPath, candidatePath)
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

async function readPackageFiles(rootPath: string, packagePath: string): Promise<Record<string, string | undefined>> {
  await assertSafeExistingPath(rootPath, packagePath)
  const files: Record<string, string | undefined> = {}

  await Promise.all(PACKAGE_TEXT_PATHS.map(async relativePath => {
    const filePath = path.join(packagePath, relativePath)
    try {
      files[relativePath] = (await readSafeRegularFile(rootPath, filePath)).toString('utf8')
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

async function copyExistingPackageTree(
  rootPath: string,
  sourcePath: string,
  destinationPath: string,
  fileOperations: ProjectLibraryFileOperations,
): Promise<void> {
  let directoryHandle
  try {
    directoryHandle = await open(
      sourcePath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
  } catch (error) {
    if (isNoFollowError(error)) throw unsafePackagePath()
    throw error
  }
  let entries: string[]
  try {
    const openedDirectory = await directoryHandle.stat()
    if (!openedDirectory.isDirectory()) throw unsafePackagePath()
    entries = await readdir(sourcePath)
    const assertSameDirectory = async () => {
      const currentDirectory = await lstat(sourcePath)
      if (
        currentDirectory.isSymbolicLink()
        || currentDirectory.dev !== openedDirectory.dev
        || currentDirectory.ino !== openedDirectory.ino
      ) {
        throw unsafePackagePath()
      }
    }
    await assertSameDirectory()
  } finally {
    await directoryHandle.close()
  }

  for (const entry of entries) {
    const source = path.join(sourcePath, entry)
    const destination = path.join(destinationPath, entry)
    const stats = await lstat(source)
    if (stats.isSymbolicLink()) {
      throw new ProjectLibraryStoreError('Symbolic links are not allowed in project packages.', 400, 'unsafe-path')
    }
    await assertSafeExistingPath(rootPath, source)
    if (stats.isDirectory()) {
      await mkdir(destination, { recursive: true })
      await copyExistingPackageTree(rootPath, source, destination, fileOperations)
    } else if (stats.isFile()) {
      const contents = await readSafeRegularFile(
        rootPath,
        source,
        fileOperations.beforePreservedFileOpen,
      )
      await writeFile(destination, contents)
    } else {
      throw new ProjectLibraryStoreError('Project packages may only contain regular files and directories.', 400, 'unsafe-path')
    }
  }
}

async function preserveManifestSources(
  stagingPath: string,
  serializedFiles: Record<string, string>,
): Promise<void> {
  const existingManifest = JSON.parse(
    await readFile(path.join(stagingPath, WRITEROS_PROJECT_MANIFEST_PATH), 'utf8'),
  ) as Record<string, unknown>
  const sources = existingManifest.sources
  if (
    !sources
    || typeof sources !== 'object'
    || Array.isArray(sources)
    || Object.entries(sources).some(([key, value]) => key.length === 0 || typeof value !== 'string' || value.length === 0)
  ) {
    return
  }

  const serializedManifest = JSON.parse(
    serializedFiles[WRITEROS_PROJECT_MANIFEST_PATH],
  ) as Record<string, unknown>
  serializedManifest.sources = sources
  serializedFiles[WRITEROS_PROJECT_MANIFEST_PATH] = `${JSON.stringify(serializedManifest, null, 2)}\n`
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
    beforePreservedFileOpen: options.fileOperations?.beforePreservedFileOpen,
    afterPackageSnapshot: options.fileOperations?.afterPackageSnapshot,
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
    async resolveProjectPackagePath(projectId) {
      const existing = await findProject(projectId)
      return assertSafeExistingPath(rootPath, existing.packagePath)
    },
    async readProject(projectId) {
      const existing = await findProject(projectId)
      return readWriterOSProjectPackage(await readPackageFiles(rootPath, existing.packagePath))
    },
    async writeProject(project) {
      if (!WRITEROS_PROJECT_ID_PATTERN.test(project.id)) {
        throw new ProjectLibraryStoreError('Cannot save a WriterOS project without a project id.', 400, 'invalid-project')
      }

      const packageWriteLock = await acquirePackageWriteLock({
        workspaceRoot: rootPath,
        projectId: project.id,
        testHooks: options.packageLockTestHooks,
      })
      let writeFailed = false
      try {
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
          if (originalPath && backupPath) {
            // Once the package lock is held, move the live package to a random
            // sibling snapshot. Cooperating package writers cannot mutate this
            // source tree while WriterOS copies it into staging.
            await safeRename(originalPath, backupPath)
            backupCreated = true
            await fileOperations.afterPackageSnapshot?.(originalPath, backupPath)
            await copyExistingPackageTree(rootPath, backupPath, stagingPath, fileOperations)
            await preserveManifestSources(stagingPath, serialized.files)
          }
          await writeStagedPackage(stagingPath, serialized.files)
          await validateStagedPackage(rootPath, stagingPath)

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
      } catch (error) {
        writeFailed = true
        throw error
      } finally {
        try {
          await packageWriteLock.release()
        } catch (releaseError) {
          if (!writeFailed) throw releaseError
        }
      }
    },
  }
}
