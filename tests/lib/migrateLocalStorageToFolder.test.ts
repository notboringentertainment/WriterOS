import { describe, expect, it, vi } from 'vitest'
import {
  migrateLocalStorageToFolder,
  type MigrationResult,
} from '../../client/src/lib/migrateLocalStorageToFolder'
import type {
  ProjectStorageAdapter,
  ProjectStorageProjectRef,
} from '../../client/src/lib/projectStorage'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import { defaultProjectState } from '../../client/src/lib/projectState'

function makeStoredProject(overrides: Partial<StoredProject> & { id: string }): StoredProject {
  return {
    id: overrides.id,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    state: overrides.state ?? defaultProjectState(),
    ...(overrides.archivedAt ? { archivedAt: overrides.archivedAt } : {}),
    ...(overrides.migratedToFolder ? { migratedToFolder: overrides.migratedToFolder } : {}),
  }
}

function makeAdapter(overrides: Partial<ProjectStorageAdapter> = {}): ProjectStorageAdapter {
  const ref = (id: string): ProjectStorageProjectRef => ({
    id,
    packageName: `${id}.writeros`,
    summary: { id, title: id, createdAt: 0, updatedAt: 0 },
  })
  return {
    kind: 'file-system-access',
    label: 'Fake',
    defaultFolderLabel: 'Fake',
    listProjects: async () => [],
    readProject: async () => ({ ok: true, project: {} as never, manifest: {} as never, warnings: [] }) as never,
    writeProject: async (project) => ref(project.id),
    removeProject: async () => ({ ok: true, folderAlreadyMissing: false }),
    archiveProject: async (r) => ({ ok: true, ref: r }),
    restoreProject: async (r) => ({ ok: true, ref: r }),
    ...overrides,
  } as ProjectStorageAdapter
}

describe('migrateLocalStorageToFolder', () => {
  it('writes each unmigrated project and returns a success result per project', async () => {
    const projects: StoredProject[] = [
      makeStoredProject({ id: 'p1' }),
      makeStoredProject({ id: 'p2' }),
    ]
    const adapter = makeAdapter()
    const results: MigrationResult[] = await migrateLocalStorageToFolder(
      adapter,
      projects,
      { folderLabel: 'MyDocs' },
    )
    expect(results.map(r => ({ id: r.projectId, ok: r.ok }))).toEqual([
      { id: 'p1', ok: true },
      { id: 'p2', ok: true },
    ])
    expect(results[0]).toMatchObject({ ok: true, packageName: 'p1.writeros', folderLabel: 'MyDocs' })
  })

  it('skips projects that already have a migratedToFolder marker', async () => {
    const projects: StoredProject[] = [
      makeStoredProject({
        id: 'p1',
        migratedToFolder: { folderLabel: 'F', packageName: 'p1.writeros', migratedAt: 'now' },
      }),
      makeStoredProject({ id: 'p2' }),
    ]
    const writeProject = vi.fn(async (p: StoredProject) => ({
      id: p.id,
      packageName: `${p.id}.writeros`,
      summary: { id: p.id, title: p.id, createdAt: 0, updatedAt: 0 },
    }))
    const adapter = makeAdapter({ writeProject } as Partial<ProjectStorageAdapter>)

    const results = await migrateLocalStorageToFolder(adapter, projects, { folderLabel: 'MyDocs' })
    expect(writeProject).toHaveBeenCalledTimes(1)
    expect(writeProject.mock.calls[0][0].id).toBe('p2')
    expect(results.map(r => r.projectId)).toEqual(['p2'])
  })

  it('isolates per-project failures and continues with the rest', async () => {
    const projects: StoredProject[] = [
      makeStoredProject({ id: 'p1' }),
      makeStoredProject({ id: 'p2' }),
    ]
    const writeProject = vi.fn()
      .mockImplementationOnce(async () => {
        throw new Error('disk full')
      })
      .mockImplementationOnce(async (p: StoredProject) => ({
        id: p.id,
        packageName: `${p.id}.writeros`,
        summary: { id: p.id, title: p.id, createdAt: 0, updatedAt: 0 },
      }))
    const adapter = makeAdapter({ writeProject } as Partial<ProjectStorageAdapter>)

    const results = await migrateLocalStorageToFolder(adapter, projects, { folderLabel: 'F' })
    expect(results).toEqual([
      { projectId: 'p1', ok: false, error: 'disk full' },
      expect.objectContaining({ projectId: 'p2', ok: true }),
    ])
  })

  it('uses options.now for deterministic migratedAt timestamps', async () => {
    const projects: StoredProject[] = [makeStoredProject({ id: 'p1' })]
    const adapter = makeAdapter()
    const results = await migrateLocalStorageToFolder(adapter, projects, {
      folderLabel: 'MyDocs',
      now: () => '2026-05-25T12:00:00.000Z',
    })
    expect(results[0]).toMatchObject({
      ok: true,
      projectId: 'p1',
      migratedAt: '2026-05-25T12:00:00.000Z',
    })
  })
})
