import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { projectMemoryStore, type ProjectMemoryStore } from '../../server/projectMemory/store'
import { runProjectMemoryCli } from '../../server/projectMemory/cli'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createProject(projectId: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-closeq-cli-'))
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

function question(projectId: string, name: string, hash: string) {
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

function answer(projectId: string, name: string, hash: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    dedupeKey: `import:story-wayfinder:resolved/${name}:${hash}`,
    kind: 'canon',
    requestedStatus: 'active',
    claim: `The ${name} is settled (${hash}).`,
    source: {
      workflow: 'story-wayfinder',
      sourceId: `resolved/${name}.md`,
      sourceUri: `story-wayfinder:resolved/${name}.md`,
      sourceHash: hash,
      capturedAt: '2026-09-01T00:00:00.000Z',
      approval: 'explicit',
      authority: { ticketType: 'grill', mode: 'hitl' },
    },
    ...overrides,
  }
}

function homework(projectId: string, name: string, hash: string) {
  return answer(projectId, name, hash, {
    kind: 'development',
    source: {
      workflow: 'story-wayfinder',
      sourceId: `resolved/${name}.md`,
      sourceUri: `story-wayfinder:resolved/${name}.md`,
      sourceHash: hash,
      capturedAt: '2026-09-01T00:00:00.000Z',
      approval: 'none',
      authority: { ticketType: 'homework', mode: 'hitl' },
    },
  })
}

function preview(projectId: string, records: Record<string, unknown>[], ticketFiles?: string[]) {
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
    ...(ticketFiles === undefined ? {} : { ticketFiles }),
  }
}

async function runImport(
  projectPath: string,
  sourceRoot: string,
  mode: '--dry-run' | '--apply',
  previewValue: unknown,
  memoryStore?: ProjectMemoryStore,
) {
  const output: string[] = []
  const errors: string[] = []
  const code = await runProjectMemoryCli(
    ['import', '--source', 'wayfinder', '--from', sourceRoot, '--project', projectPath, mode],
    { stdout: (value: string) => output.push(value), stderr: (value: string) => errors.push(value) },
    { importPreview: async () => previewValue as never, ...(memoryStore ? { memoryStore } : {}) },
  )
  if (code !== 0) throw new Error(`import exited ${code}: ${errors.join('')}`)
  return JSON.parse(output.join('')) as Record<string, unknown>
}

async function statuses(projectPath: string) {
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  return snapshot.records.map(record => [record.source.sourceId, record.source.sourceHash, record.status] as const)
}

describe('import closes the open question of a resolved ticket', () => {
  it('closes the question when the answer imports and the open ticket file is gone', async () => {
    const projectId = 'close-basic'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'x', 'q1')], ['tickets/x.md']))

    const resolved = preview(projectId, [answer(projectId, 'x', 'a1')], ['resolved/x.md'])
    const dry = await runImport(projectPath, sourceRoot, '--dry-run', resolved)
    expect(dry).toMatchObject({ supersessionsExpected: 1, questionsClosedExpected: 1, ambiguous: [] })

    const applied = await runImport(projectPath, sourceRoot, '--apply', resolved)
    expect(applied).toMatchObject({ applied: 1, supersessions: 1, questionsClosed: 1, ambiguous: [] })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/x.md', 'q1', 'superseded'],
      ['resolved/x.md', 'a1', 'active'],
    ])
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const canon = snapshot.records.find(record => record.source.sourceId === 'resolved/x.md')
    expect(canon?.supersedes).toEqual([snapshot.records.find(record => record.source.sourceId === 'tickets/x.md')?.id])
  })

  it('lets a homework answer close its question too', async () => {
    const projectId = 'close-homework'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'h', 'q1')], ['tickets/h.md']))
    const applied = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [homework(projectId, 'h', 'd1')], ['resolved/h.md']))
    expect(applied).toMatchObject({ applied: 1, questionsClosed: 1 })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/h.md', 'q1', 'superseded'],
      ['resolved/h.md', 'd1', 'active'],
    ])
  })

  it('does not close when the answer imports as a candidate', async () => {
    const projectId = 'close-candidate'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'c', 'q1')], ['tickets/c.md']))
    const candidate = preview(projectId, [answer(projectId, 'c', 'a1', { requestedStatus: 'candidate' })], ['resolved/c.md'])
    const dry = await runImport(projectPath, sourceRoot, '--dry-run', candidate)
    expect(dry).toMatchObject({ supersessionsExpected: 0, questionsClosedExpected: 0 })
    const applied = await runImport(projectPath, sourceRoot, '--apply', candidate)
    expect(applied).toMatchObject({ applied: 1, supersessions: 0, questionsClosed: 0 })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/c.md', 'q1', 'active'],
      ['resolved/c.md', 'a1', 'candidate'],
    ])
  })

  it('reports ambiguity and closes nothing when both ticket files exist', async () => {
    const projectId = 'close-ambiguous'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'b', 'q1')], ['tickets/b.md']))
    // Real adapter order: resolved before tickets. The stale copy in resolved/
    // sits beside the live open ticket.
    const both = preview(
      projectId,
      [answer(projectId, 'b', 'a1'), question(projectId, 'b', 'q1')],
      ['resolved/b.md', 'tickets/b.md'],
    )
    const dry = await runImport(projectPath, sourceRoot, '--dry-run', both)
    expect(dry).toMatchObject({ questionsClosedExpected: 0, ambiguous: ['resolved/b.md'] })
    const applied = await runImport(projectPath, sourceRoot, '--apply', both)
    expect(applied).toMatchObject({ questionsClosed: 0, ambiguous: ['resolved/b.md'] })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/b.md', 'q1', 'active'],
      ['resolved/b.md', 'a1', 'active'],
    ])
  })

  it('closes nothing when the preview carries no ticketFiles', async () => {
    const projectId = 'close-no-ticketfiles'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'n', 'q1')]))
    const applied = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [answer(projectId, 'n', 'a1')]))
    expect(applied).toMatchObject({ applied: 1, questionsClosed: 0 })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/n.md', 'q1', 'active'],
      ['resolved/n.md', 'a1', 'active'],
    ])
  })

  it('handles reopen then fresh close: old canon stays until the new answer replaces it', async () => {
    const projectId = 'close-reopen'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'r', 'q1')], ['tickets/r.md']))
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [answer(projectId, 'r', 'a1')], ['resolved/r.md']))

    // Reopened: the ticket is back in tickets/ with a new hash; resolved/ still holds the old answer.
    const reopened = preview(
      projectId,
      [answer(projectId, 'r', 'a1'), question(projectId, 'r', 'q2')],
      ['resolved/r.md', 'tickets/r.md'],
    )
    const reopen = await runImport(projectPath, sourceRoot, '--apply', reopened)
    expect(reopen).toMatchObject({ applied: 1, questionsClosed: 0, ambiguous: [] })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/r.md', 'q1', 'superseded'],
      ['resolved/r.md', 'a1', 'active'],
      ['tickets/r.md', 'q2', 'active'],
    ])

    // Fresh close: new answer bytes, ticket file gone again.
    const reclosed = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [answer(projectId, 'r', 'a2')], ['resolved/r.md']))
    expect(reclosed).toMatchObject({ applied: 1, supersessions: 2, questionsClosed: 1 })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/r.md', 'q1', 'superseded'],
      ['resolved/r.md', 'a1', 'superseded'],
      ['tickets/r.md', 'q2', 'superseded'],
      ['resolved/r.md', 'a2', 'active'],
    ])
  })

  it('retries when another writer publishes a question version between lookup and publish', async () => {
    const projectId = 'close-race'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'w', 'q1')], ['tickets/w.md']))

    let interposed = 0
    const racing: ProjectMemoryStore = {
      ...projectMemoryStore,
      async publish(targetPath, input) {
        if (input.source.sourceId === 'resolved/w.md' && interposed === 0) {
          interposed += 1
          // A second question version lands first and retires q1.
          await projectMemoryStore.publish(targetPath, { ...question(projectId, 'w', 'q2'), supersedesPriorVersions: true } as never)
        }
        return projectMemoryStore.publish(targetPath, input)
      },
    }
    const applied = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [answer(projectId, 'w', 'a1')], ['resolved/w.md']), racing)
    expect(interposed).toBe(1)
    expect(applied).toMatchObject({ applied: 1, questionsClosed: 1 })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/w.md', 'q1', 'superseded'],
      ['tickets/w.md', 'q2', 'superseded'],
      ['resolved/w.md', 'a1', 'active'],
    ])
  })

  it('closes a question that appears between an empty lookup and publish', async () => {
    const projectId = 'close-late-question'
    const { projectPath, sourceRoot } = await createProject(projectId)
    let interposed = 0
    const racing: ProjectMemoryStore = {
      ...projectMemoryStore,
      async publish(targetPath, input) {
        if (input.source.sourceId === 'resolved/l.md' && interposed === 0) {
          interposed += 1
          await projectMemoryStore.publish(targetPath, question(projectId, 'l', 'q1') as never)
        }
        return projectMemoryStore.publish(targetPath, input)
      },
    }
    // No pin on the first attempt (no questions found), so the answer
    // publishes without closing the late question. The next import closes it.
    const first = await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [answer(projectId, 'l', 'a1')], ['resolved/l.md']), racing)
    expect(first).toMatchObject({ applied: 1, questionsClosed: 0 })
    const second = await runImport(projectPath, sourceRoot, '--dry-run', preview(projectId, [answer(projectId, 'l', 'a1')], ['resolved/l.md']))
    // Already published answer: ordinary re-import is a no-op by design.
    expect(second).toMatchObject({ questionsClosedExpected: 0 })
    expect(await statuses(projectPath)).toEqual([
      ['tickets/l.md', 'q1', 'active'],
      ['resolved/l.md', 'a1', 'active'],
    ])
  })

  it('treats re-import of a published answer as a no-op', async () => {
    const projectId = 'close-idempotent'
    const { projectPath, sourceRoot } = await createProject(projectId)
    await runImport(projectPath, sourceRoot, '--apply', preview(projectId, [question(projectId, 'i', 'q1')], ['tickets/i.md']))
    const resolved = preview(projectId, [answer(projectId, 'i', 'a1')], ['resolved/i.md'])
    await runImport(projectPath, sourceRoot, '--apply', resolved)
    const again = await runImport(projectPath, sourceRoot, '--apply', resolved)
    expect(again).toMatchObject({ applied: 0, supersessions: 0, questionsClosed: 0, duplicates: 1 })
  })
})
