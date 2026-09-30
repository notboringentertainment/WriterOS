import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { LookLocksExportSchema, type LookLocksExport } from '../../shared/looks'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'
import { atomicReplace, type ProjectMemoryStore } from '../projectMemory/store'

// The look-locks export: every active promoted look in a project, written to
// <package>/memory/exports/look-locks-<revision>.json for OpenMontage's
// look_lock gate to read (look sessions plan L5, Task 3). WriterOS only ever
// writes it; OpenMontage only ever reads it and judges freshness per record
// against memory/snapshot.json.

const EXPORTS_DIRECTORY = path.join('memory', 'exports')
const EXPORT_FILE = /^look-locks-(\d+)\.json$/

export function lookExportRelativePath(revision: number): string {
  return path.posix.join('memory', 'exports', `look-locks-${revision}.json`)
}

export function buildLookLocksExport(snapshot: ProjectMemorySnapshot, writtenAt: string): LookLocksExport {
  const looks = snapshot.records
    .filter(record => record.kind === 'canon' && record.status === 'active' && record.payload?.kind === 'look_spec')
    .map(record => {
      const payload = record.payload!
      return {
        entity_kind: payload.spec.entity_kind,
        entity_id: payload.spec.entity_id,
        look_spec: payload.spec,
        look_hash: payload.lookHash,
        promotion_id: record.id,
        promoted_at: record.createdAt,
        reference: payload.reference,
      }
    })
    .sort((a, b) => `${a.entity_kind}:${a.entity_id}`.localeCompare(`${b.entity_kind}:${b.entity_id}`))
  return LookLocksExportSchema.parse({
    version: 1,
    project_id: snapshot.projectId,
    memory_revision: snapshot.revision,
    written_at: writtenAt,
    looks,
  })
}

async function exportsDirectory(projectPath: string, create: boolean): Promise<string | undefined> {
  const directory = path.join(projectPath, EXPORTS_DIRECTORY)
  try {
    const stats = await lstat(directory)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('memory/exports is not a plain directory.')
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (!create) return undefined
    await mkdir(directory)
  }
  return directory
}

async function exportFiles(directory: string): Promise<Array<{ name: string; revision: number }>> {
  return (await readdir(directory))
    .flatMap(name => {
      const match = EXPORT_FILE.exec(name)
      return match ? [{ name, revision: Number(match[1]) }] : []
    })
    .sort((a, b) => a.revision - b.revision)
}

/**
 * Write the export for `snapshot` and remove every older look-locks file.
 * Call only while holding the package lock (inside a publish's afterCommit,
 * or through withLockedSnapshot).
 */
export async function writeLookLocksExport(
  projectPath: string,
  snapshot: ProjectMemorySnapshot,
  writtenAt = new Date().toISOString(),
): Promise<string> {
  const directory = (await exportsDirectory(projectPath, true))!
  const contents = `${JSON.stringify(buildLookLocksExport(snapshot, writtenAt), null, 2)}\n`
  const fileName = `look-locks-${snapshot.revision}.json`
  await atomicReplace(path.join(directory, fileName), contents)
  for (const file of await exportFiles(directory)) {
    if (file.name !== fileName) await rm(path.join(directory, file.name), { force: true })
  }
  return lookExportRelativePath(snapshot.revision)
}

/** The newest export on disk, or undefined when there is none. */
export async function readLookLocksExport(projectPath: string): Promise<{ relativePath: string; export: LookLocksExport } | undefined> {
  const directory = await exportsDirectory(projectPath, false)
  if (!directory) return undefined
  const newest = (await exportFiles(directory)).at(-1)
  if (!newest) return undefined
  const parsed = LookLocksExportSchema.parse(JSON.parse(await readFile(path.join(directory, newest.name), 'utf8')))
  return { relativePath: lookExportRelativePath(newest.revision), export: parsed }
}

/**
 * The repairing read behind GET /api/looks/:projectId/export and Re-export:
 * under the package lock, regenerate the export when it is missing, unreadable,
 * or was written at a different memory revision.
 */
export async function ensureCurrentLookExport(
  memoryStore: ProjectMemoryStore,
  projectPath: string,
  projectId: string,
): Promise<{ relativePath: string | null; export: LookLocksExport; regenerated: boolean }> {
  return memoryStore.withLockedSnapshot(projectPath, projectId, async snapshot => {
    // A project with no memory ledger has nothing to export; do not create files for it.
    if (snapshot.revision === 0) {
      return { relativePath: null, export: buildLookLocksExport(snapshot, new Date().toISOString()), regenerated: false }
    }
    let current: Awaited<ReturnType<typeof readLookLocksExport>>
    try {
      current = await readLookLocksExport(projectPath)
    } catch {
      current = undefined
    }
    if (current && current.export.memory_revision === snapshot.revision) {
      return { ...current, regenerated: false }
    }
    const relativePath = await writeLookLocksExport(projectPath, snapshot)
    const written = await readLookLocksExport(projectPath)
    return { relativePath, export: written!.export, regenerated: true }
  })
}
