import type { ProjectStorageAdapter } from './projectStorage'
import type { StoredProject } from './projectLibrary'

// Slice 4: coordinator that walks a list of localStorage-resident projects
// and writes each unmigrated project into a folder-backed adapter. Pure
// async function — no React, DOM, or globals. Adapter is injected so the
// caller controls the storage backend and tests can supply a fake.
//
// Contract:
// - Projects whose `migratedToFolder` marker is already set are SKIPPED
//   entirely and produce no result entry.
// - Archived projects are also SKIPPED in V1; otherwise archive entries would
//   be written as active root-level `.writeros` packages.
// - Per-project failures are captured as `{ ok: false, error }` and do NOT
//   abort the loop; remaining projects still get a chance to migrate.
// - Result order preserves the input order, modulo skipped entries.
// - `migratedAt` is stamped per successful project using `options.now()`
//   (defaults to a fresh `new Date().toISOString()` per call).

export type MigrationResult =
  | {
      projectId: string
      ok: true
      packageName: string
      folderLabel: string
      migratedAt: string
    }
  | {
      projectId: string
      ok: false
      error: string
    }

export interface MigrationOptions {
  folderLabel: string
  now?: () => string
}

export async function migrateLocalStorageToFolder(
  adapter: ProjectStorageAdapter,
  projects: StoredProject[],
  options: MigrationOptions,
): Promise<MigrationResult[]> {
  const now = options.now ?? (() => new Date().toISOString())
  const results: MigrationResult[] = []

  for (const project of projects) {
    if (project.migratedToFolder || project.archivedAt) continue
    try {
      const ref = await adapter.writeProject(project)
      results.push({
        projectId: project.id,
        ok: true,
        packageName: ref.packageName,
        folderLabel: options.folderLabel,
        migratedAt: now(),
      })
    } catch (error) {
      results.push({
        projectId: project.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
