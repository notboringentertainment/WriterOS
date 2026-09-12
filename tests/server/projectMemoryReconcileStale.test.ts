import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { createProjectMemoryStore, projectMemoryStore } from '../../server/projectMemory/store'
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

function preview(projectId: string, records: Record<string, unknown>[], ticketFiles?: string[]) {
  return {
    source: 'story-wayfinder',
    projectId,
    records,
    ...(ticketFiles === undefined ? {} : { ticketFiles }),
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

function openQuestion(projectId: string, name: string, hash: string) {
  return {
    projectId,
    dedupeKey: `import:story-wayfinder:tickets/${name}:${hash}`,
    kind: 'open_question',
    requestedStatus: 'active',
    claim: `What is the ${name}?`,
    source: {
      workflow: 'story-wayfinder',
      sourceId: `tickets/${name}.md`,
      sourceUri: `story-wayfinder:tickets/${name}.md`,
      sourceHash: hash,
      capturedAt: '2026-09-01T00:00:00.000Z',
      approval: 'none',
    },
  }
}

async function seedQuestions(projectPath: string, projectId: string, name: string, hashes: string[]) {
  for (const hash of hashes) {
    await projectMemoryStore.publish(projectPath, openQuestion(projectId, name, hash) as never)
  }
}

async function rows(projectPath: string) {
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  return snapshot.records.map(record => [record.source.sourceId, record.source.sourceHash, record.status] as const)
}

describe('reconcile-stale closes orphaned questions', () => {
  it('closes the question of a resolved ticket whose open file is gone', async () => {
    const projectId = 'reconcile-close-one'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'x', ['q1'])
    await seedVersions(projectPath, projectId, 'resolved/x.md', ['a1'])
    const current = preview(projectId, [ticket(projectId, 'resolved/x.md', 'a1')], ['resolved/x.md'])

    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    expect(dry.output).toMatchObject({ skipped: [], skippedQuestions: [] })
    const [group] = dry.output?.groups as Array<Record<string, unknown>>
    expect(group).toMatchObject({ sourceId: 'resolved/x.md', winnerSourceHash: 'a1' })
    expect(group.closeQuestionIds).toHaveLength(1)
    expect(group.retireRecordIds).toHaveLength(1)
    expect(String(group.dedupeKey)).toMatch(/^maintenance:close:story-wayfinder:resolved\/x\.md:[0-9a-f]{64}$/)

    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.output).toMatchObject({ applied: 1, questionsClosed: 1, revision: 3, staleConflicts: [] })
    expect(await rows(projectPath)).toEqual([
      ['tickets/x.md', 'q1', 'superseded'],
      ['resolved/x.md', 'a1', 'superseded'],
      ['resolved/x.md', 'a1', 'active'],
    ])
    const again = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(again.output).toMatchObject({ applied: 0, groups: [], skippedQuestions: [] })
  })

  it('retires three answer versions and two question versions in one event', async () => {
    const projectId = 'reconcile-close-many'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'm', ['q1', 'q2'])
    await seedVersions(projectPath, projectId, 'resolved/m.md', ['a1', 'a2', 'a3'])
    const current = preview(projectId, [ticket(projectId, 'resolved/m.md', 'a3')], ['resolved/m.md'])
    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    // The two question versions are closed by the answer repair, not
    // reported as a skipped version group of their own.
    expect(dry.output).toMatchObject({ skipped: [], skippedQuestions: [] })
    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.output).toMatchObject({ applied: 1, questionsClosed: 2, revision: 6 })
    const after = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const active = after.records.filter(record => record.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0].supersedes).toHaveLength(5)
    expect(active[0].claim).toBe('resolved/m.md version a3.')
  })

  it('skips an orphaned question with no answer and one whose open file still exists', async () => {
    const projectId = 'reconcile-close-skip'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'deleted', ['q1'])
    await seedQuestions(projectPath, projectId, 'unpublished', ['q1'])
    await seedQuestions(projectPath, projectId, 'both', ['q1'])
    await seedVersions(projectPath, projectId, 'resolved/both.md', ['a1'])
    await seedQuestions(projectPath, projectId, 'live', ['q1'])
    const current = preview(projectId, [
      ticket(projectId, 'resolved/unpublished.md', 'a9'),
      ticket(projectId, 'resolved/both.md', 'a1'),
      openQuestion(projectId, 'both', 'q1'),
      openQuestion(projectId, 'live', 'q1'),
    ], ['resolved/unpublished.md', 'resolved/both.md', 'tickets/both.md', 'tickets/live.md'])

    const dry = await run('reconcile-stale', projectPath, sourceRoot, '--dry-run', current)
    expect(dry.output).toMatchObject({ groups: [], skipped: [] })
    expect(dry.output?.skippedQuestions).toEqual([
      expect.objectContaining({ sourceId: 'tickets/both.md', reason: 'The open ticket file still exists beside the resolved one.' }),
      expect.objectContaining({ sourceId: 'tickets/deleted.md', reason: 'The ticket file is gone and no resolved file exists for it.' }),
      expect.objectContaining({ sourceId: 'tickets/unpublished.md', reason: 'No active answer record exists for the resolved file.' }),
    ])
    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.output).toMatchObject({ applied: 0, questionsClosed: 0 })
    expect((await rows(projectPath)).filter(([, , status]) => status === 'active')).toHaveLength(5)
  })

  it('closes a new question after a reopen even when the old answer bytes are restored', async () => {
    const projectId = 'reconcile-close-reopen'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'r', ['q1'])
    await seedVersions(projectPath, projectId, 'resolved/r.md', ['a1'])
    const current = preview(projectId, [ticket(projectId, 'resolved/r.md', 'a1')], ['resolved/r.md'])
    const first = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(first.output).toMatchObject({ applied: 1, questionsClosed: 1 })

    // Reopened with a new question version, later resolved back to the same bytes.
    await seedQuestions(projectPath, projectId, 'r', ['q2'])
    const reimport = await run('import', projectPath, sourceRoot, '--apply', current)
    expect(reimport.output).toMatchObject({ applied: 0, questionsClosed: 0 })
    const second = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(second.output).toMatchObject({ applied: 1, questionsClosed: 1 })
    const groups = second.output?.groups as Array<Record<string, unknown>>
    expect(groups[0].dedupeKey).not.toBe((first.output?.groups as Array<Record<string, unknown>>)[0].dedupeKey)
    expect((await rows(projectPath)).filter(([, , status]) => status === 'active')).toEqual([
      ['resolved/r.md', 'a1', 'active'],
    ])
  })

  it('leaves an open conflict on a closed question and reports it', async () => {
    const projectId = 'reconcile-close-conflict'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'k', ['q1'])
    const q1 = (await projectMemoryStore.readSnapshotReadOnly(projectPath)).records[0]
    await projectMemoryStore.publish(projectPath, {
      ...openQuestion(projectId, 'rival', 'v1'),
      conflictsWith: [q1.id],
    } as never)
    await seedVersions(projectPath, projectId, 'resolved/k.md', ['a1'])
    const current = preview(projectId, [ticket(projectId, 'resolved/k.md', 'a1'), openQuestion(projectId, 'rival', 'v1')], ['resolved/k.md', 'tickets/rival.md'])
    const applied = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(applied.output).toMatchObject({ applied: 1, questionsClosed: 1, staleConflicts: [] })
    const after = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    expect(after.conflicts[0]).toMatchObject({ status: 'open', leftRecordId: q1.id })
    expect(after.records.find(record => record.id === q1.id)?.status).toBe('superseded')
  })

  it('refuses to apply an accepted list over a ledger that moved', async () => {
    const projectId = 'reconcile-close-moved'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'z', ['q1'])
    await seedVersions(projectPath, projectId, 'resolved/z.md', ['a1'])
    const current = preview(projectId, [ticket(projectId, 'resolved/z.md', 'a1')], ['resolved/z.md'])
    let interposed = 0
    const moving = {
      ...projectMemoryStore,
      async publish(targetPath: string, input: never) {
        if (interposed === 0) {
          interposed += 1
          await projectMemoryStore.publish(targetPath, openQuestion(projectId, 'z', 'q2') as never)
        }
        return projectMemoryStore.publish(targetPath, input)
      },
    }
    const errors: string[] = []
    const code = await runProjectMemoryCli(
      ['reconcile-stale', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath, '--apply'],
      { stdout: () => undefined, stderr: (value: string) => errors.push(value) },
      { importPreview: async () => current as never, memoryStore: moving as never },
    )
    expect(code).toBe(3)
    expect((await rows(projectPath)).filter(([, , status]) => status === 'active')).toHaveLength(3)
  })
})

describe('reconcile-stale durability', () => {
  it('reconciles a closure appended before projection failure and retries without a second event', async () => {
    const projectId = 'reconcile-close-durable'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await seedQuestions(projectPath, projectId, 'd', ['q1'])
    await seedVersions(projectPath, projectId, 'resolved/d.md', ['a1'])
    const current = preview(projectId, [ticket(projectId, 'resolved/d.md', 'a1')], ['resolved/d.md'])
    let failures = 0
    const failingStore = createProjectMemoryStore({
      testHooks: {
        beforeProjectionWrite: async (_projectPath, snapshot) => {
          if (snapshot.revision === 3 && failures === 0) {
            failures += 1
            throw Object.assign(new Error('forced projection failure'), { code: 'EIO' })
          }
        },
      },
    })
    const errors: string[] = []
    const code = await runProjectMemoryCli(
      ['reconcile-stale', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath, '--apply'],
      { stdout: () => undefined, stderr: (value: string) => errors.push(value) },
      { importPreview: async () => current as never, memoryStore: failingStore },
    )
    expect(code).toBe(3)
    expect(JSON.parse(errors.join(''))).toMatchObject({ error: 'import-partial', durability: 'reconciled', appliedCount: 1, lastRevision: 3 })

    const retry = await run('reconcile-stale', projectPath, sourceRoot, '--apply', current)
    expect(retry.output).toMatchObject({ applied: 0, groups: [], revision: 3 })
    expect(await rows(projectPath)).toEqual([
      ['tickets/d.md', 'q1', 'superseded'],
      ['resolved/d.md', 'a1', 'superseded'],
      ['resolved/d.md', 'a1', 'active'],
    ])
  })
})
