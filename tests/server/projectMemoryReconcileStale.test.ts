import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { runProjectMemoryCli } from '../../server/projectMemory/cli'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createProject(projectId: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-reconcile-'))
  temporaryRoots.push(root)
  const library = await createProjectLibraryStore(root)
  await library.writeProject({
    id: projectId,
    createdAt: Date.parse('2026-09-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-09-02T12:00:00.000Z'),
    state: defaultProjectState(),
  })
  const sourceRoot = await mkdtemp(path.join(root, 'wayfinder-source-'))
  return { root, projectPath: await library.resolveProjectPackagePath(projectId), sourceRoot }
}

function ticket(projectId: string, sourceId: string, hash: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    dedupeKey: `import:story-wayfinder:${sourceId}:${hash}`,
    kind: 'canon',
    requestedStatus: 'active',
    claim: `${sourceId} version ${hash}.`,
    detail: `Full answer for ${sourceId} at ${hash}.`,
    tags: ['ticket'],
    source: {
      workflow: 'story-wayfinder',
      sourceId,
      sourceUri: `story-wayfinder:${sourceId}`,
      sourceHash: hash,
      capturedAt: '2026-09-01T00:00:00.000Z',
      approval: 'explicit',
      authority: { ticketType: 'grill', mode: 'hitl' },
    },
    ...overrides,
  }
}

function preview(projectId: string, records: Record<string, unknown>[]) {
  return {
    source: 'story-wayfinder',
    projectId,
    records,
    warnings: [],
    duplicates: 0,
    counts: {
      activeCanon: records.filter(record => record.kind === 'canon' && record.requestedStatus === 'active').length,
      candidates: records.filter(record => record.requestedStatus === 'candidate').length,
      development: records.filter(record => record.kind === 'development').length,
      openQuestions: records.filter(record => record.kind === 'open_question').length,
      conflicts: 0,
      duplicates: 0,
      flagged: 0,
    },
  }
}

async function run(
  command: 'import' | 'reconcile-stale',
  projectPath: string,
  sourceRoot: string,
  mode: '--dry-run' | '--apply',
  previewValue: unknown,
) {
  const output: string[] = []
  const errors: string[] = []
  const code = await runProjectMemoryCli(
    [command, '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath, mode],
    { stdout: (value: string) => output.push(value), stderr: (value: string) => errors.push(value) },
    { importPreview: async () => previewValue as never },
  )
  return { code, output: output.length ? JSON.parse(output.join('')) as Record<string, unknown> : undefined, errors }
}

/** Publish versions the pre-fix way (no supersession) so they pile up as active. */
async function seedVersions(projectPath: string, projectId: string, sourceId: string, hashes: string[]) {
  for (const hash of hashes) {
    await projectMemoryStore.publish(projectPath, ticket(projectId, sourceId, hash) as never)
  }
}

describe('reconcile-stale', () => {
  it('collapses a three-version group to the version that matches the current file', async () => {
    const projectId = 'reconcile-three'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedVersions(projectPath, projectId, 'resolved/solo-rule.md', ['v1', 'v2', 'v3'])
    const before = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(before.records.filter(record => record.status === 'active')).toHaveLength(3)
    const current = preview(projectId, [ticket(projectId, 'resolved/solo-rule.md', 'v3')])

    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    expect(dry.code).toBe(0)
    expect(dry.output).toMatchObject({ revision: 3, skipped: [] })
    const [group] = dry.output?.groups as Array<Record<string, unknown>>
    expect(group).toMatchObject({ sourceId: 'resolved/solo-rule.md', winnerSourceHash: 'v3' })
    expect((group.retireRecordIds as string[]).sort()).toEqual(before.records.map(record => record.id).sort())

    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.code).toBe(0)
    expect(applied.output).toMatchObject({ applied: 1, idempotent: 0, revision: 4, staleConflicts: [] })

    const after = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const active = after.records.filter(record => record.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      claim: 'resolved/solo-rule.md version v3.',
      detail: 'Full answer for resolved/solo-rule.md at v3.',
      tags: ['ticket'],
      source: { sourceHash: 'v3', authority: { ticketType: 'grill', mode: 'hitl' } },
    })
    expect(active[0].id).not.toBe(group.winnerRecordId)
    expect(new Set(active[0].supersedes)).toEqual(new Set(before.records.map(record => record.id)))
    expect(after.records.filter(record => record.status === 'superseded')).toHaveLength(3)

    // Re-import of the current version is a no-op and retires nothing.
    const reimport = await run('import', projectPath, sourceRoot, '--dry-run', current)
    expect(reimport.output).toMatchObject({ supersessionsExpected: 0 })
    const reapply = await run('import', projectPath, sourceRoot, '--apply', current)
    expect(reapply.output).toMatchObject({ applied: 0, supersessions: 0, revision: 4 })
  })

  it('is a no-op when run again', async () => {
    const projectId = 'reconcile-again'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedVersions(projectPath, projectId, 'resolved/a.md', ['v1', 'v2'])
    const current = preview(projectId, [ticket(projectId, 'resolved/a.md', 'v2')])
    await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    const again = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(again.output).toMatchObject({ applied: 0, idempotent: 0, groups: [], skipped: [], revision: 3 })
  })

  it('skips a group when the current file version was never published or is missing from the preview', async () => {
    const projectId = 'reconcile-skip'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedVersions(projectPath, projectId, 'resolved/changed.md', ['v1', 'v2'])
    await seedVersions(projectPath, projectId, 'resolved/deleted.md', ['d1', 'd2'])
    const current = preview(projectId, [ticket(projectId, 'resolved/changed.md', 'v3')])

    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    expect(dry.output).toMatchObject({ groups: [] })
    expect(dry.output?.skipped).toEqual([
      expect.objectContaining({ sourceId: 'resolved/changed.md', reason: 'The current file version has not been published.' }),
      expect.objectContaining({ sourceId: 'resolved/deleted.md', reason: 'The source file is not in the current preview.' }),
    ])
    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.output).toMatchObject({ applied: 0, revision: 4 })
    const after = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(after.records.filter(record => record.status === 'active')).toHaveLength(4)
  })

  it('never collapses different kinds at the same path together', async () => {
    const projectId = 'reconcile-kinds'
    const { projectPath, sourceRoot } = await createProject(projectId)
    const questionSource = { approval: 'none', authority: undefined }
    await projectMemoryStore.publish(projectPath, ticket(projectId, 'tickets/q.md', 'q1', {
      kind: 'open_question',
      source: { ...ticket(projectId, 'tickets/q.md', 'q1').source, ...questionSource },
    }) as never)
    await projectMemoryStore.publish(projectPath, ticket(projectId, 'tickets/q.md', 'q2', {
      kind: 'open_question',
      source: { ...ticket(projectId, 'tickets/q.md', 'q2').source, ...questionSource },
    }) as never)
    await projectMemoryStore.publish(projectPath, ticket(projectId, 'tickets/q.md', 'c1') as never)
    const current = preview(projectId, [
      ticket(projectId, 'tickets/q.md', 'q2', { kind: 'open_question', source: { ...ticket(projectId, 'tickets/q.md', 'q2').source, ...questionSource } }),
    ])

    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    expect(dry.output?.groups).toEqual([
      expect.objectContaining({ kind: 'open_question', sourceId: 'tickets/q.md', winnerSourceHash: 'q2' }),
    ])
    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.output).toMatchObject({ applied: 1 })
    const after = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const active = after.records.filter(record => record.status === 'active')
    expect(active.map(record => [record.kind, record.source.sourceHash]).sort()).toEqual([
      ['canon', 'c1'],
      ['open_question', 'q2'],
    ])
  })

  it('keeps dry-run read-only on an uninitialized package and rejects other sources', async () => {
    const projectId = 'reconcile-readonly'
    const { projectPath, sourceRoot } = await createProject(projectId)
    const current = preview(projectId, [ticket(projectId, 'resolved/a.md', 'v1')])
    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    expect(dry.code).toBe(0)
    expect(dry.output).toMatchObject({ revision: 0, groups: [], skipped: [] })
    await expect(access(path.join(projectPath, 'memory'))).rejects.toMatchObject({ code: 'ENOENT' })

    const manifestBefore = await readFile(path.join(projectPath, 'project.json'), 'utf8')
    const other = await runProjectMemoryCli(
      ['reconcile-stale', '--source', 'pitchstudio', '--from', sourceRoot, '--project', projectPath, '--dry-run'],
      { stdout: () => undefined, stderr: () => undefined },
      { importPreview: async () => current as never },
    )
    expect(other).toBe(2)
    const bothModes = await runProjectMemoryCli(
      ['reconcile-stale', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath],
      { stdout: () => undefined, stderr: () => undefined },
      { importPreview: async () => current as never },
    )
    expect(bothModes).toBe(2)
    expect(await readFile(path.join(projectPath, 'project.json'), 'utf8')).toBe(manifestBefore)
  })

  it('stops when the project identity changes between preview and publish', async () => {
    const projectId = 'reconcile-identity'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedVersions(projectPath, projectId, 'resolved/a.md', ['v1', 'v2'])
    const current = preview(projectId, [ticket(projectId, 'resolved/a.md', 'v2')])
    const manifestPath = path.join(projectPath, 'project.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const errors: string[] = []
    const code = await runProjectMemoryCli(
      ['reconcile-stale', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath, '--apply'],
      { stdout: () => undefined, stderr: (value: string) => errors.push(value) },
      {
        importPreview: async () => {
          await writeFile(manifestPath, JSON.stringify({ ...manifest, projectId: 'someone-else' }), 'utf8')
          return current as never
        },
      },
    )
    expect(code).toBe(2)
    expect(errors.join('')).toContain('Invalid memory command input.')
  })
})
