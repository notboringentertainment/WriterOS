import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PublishMemoryInputSchema, type MemorySource, type PublishMemoryInput } from '../../shared/projectMemory'
import { createProjectMemoryStore } from '../../server/projectMemory/store'

const capturedAt = '2026-09-11T20:00:00.000Z'
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function makeProject(projectId = 'project-1') {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'writeros-memory-closeq-'))
  temporaryRoots.push(workspaceRoot)
  const projectPath = path.join(workspaceRoot, 'The Salt Line.writeros')
  await mkdir(projectPath)
  await writeFile(path.join(projectPath, 'project.json'), `${JSON.stringify({
    schemaVersion: 1,
    projectId,
    title: 'The Salt Line',
    format: 'feature',
    createdAt: capturedAt,
    updatedAt: capturedAt,
    openedAt: capturedAt,
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2)}\n`, 'utf8')
  return { projectPath, projectId }
}

async function appendLedgerLine(projectPath: string, event: unknown): Promise<void> {
  const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
  const existing = await readFile(ledgerPath, 'utf8')
  await writeFile(ledgerPath, `${existing}${JSON.stringify(event)}\n`, 'utf8')
}

function questionSource(name: string, hash: string, overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    workflow: 'story-wayfinder',
    sourceId: `tickets/${name}.md`,
    sourceUri: `story-wayfinder:tickets/${name}.md`,
    sourceHash: hash,
    capturedAt,
    approval: 'none',
    ...overrides,
  } as MemorySource
}

function answerSource(name: string, hash: string, overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    workflow: 'story-wayfinder',
    sourceId: `resolved/${name}.md`,
    sourceUri: `story-wayfinder:resolved/${name}.md`,
    sourceHash: hash,
    capturedAt,
    approval: 'explicit',
    authority: { ticketType: 'grill', mode: 'hitl' },
    ...overrides,
  } as MemorySource
}

function question(name: string, hash: string, overrides: Partial<PublishMemoryInput> = {}): PublishMemoryInput {
  return {
    projectId: 'project-1',
    dedupeKey: `import:story-wayfinder:tickets/${name}:${hash}`,
    kind: 'open_question',
    requestedStatus: 'active',
    claim: `What is the ${name}?`,
    source: questionSource(name, hash),
    ...overrides,
  }
}

function answer(name: string, hash: string, overrides: Partial<PublishMemoryInput> = {}): PublishMemoryInput {
  return {
    projectId: 'project-1',
    dedupeKey: `import:story-wayfinder:resolved/${name}:${hash}`,
    kind: 'canon',
    requestedStatus: 'active',
    claim: `The ${name} is settled.`,
    source: answerSource(name, hash),
    ...overrides,
  }
}

describe('an answer closes its open question', () => {
  it('lets active canon supersede an active open question of the same workflow', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q = await store.publish(projectPath, question('solo-rule', 'q1'))
    const a = await store.publish(projectPath, answer('solo-rule', 'a1', { supersedes: [q.record.id] }))

    expect(a.record).toMatchObject({ status: 'active', kind: 'canon', supersedes: [q.record.id] })
    expect(a.snapshot.records.find(record => record.id === q.record.id)?.status).toBe('superseded')
    const replayed = await store.readSnapshot(projectPath)
    expect(replayed.records.find(record => record.id === q.record.id)?.status).toBe('superseded')
  })

  it('lets active development close a question and mixes version and question targets', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q1 = await store.publish(projectPath, question('homework', 'q1'))
    const q2 = await store.publish(projectPath, question('homework', 'q2'))
    const old = await store.publish(projectPath, answer('homework', 'a1', {
      kind: 'development',
      source: answerSource('homework', 'a1', { approval: 'none', authority: { ticketType: 'homework', mode: 'hitl' } }),
    }))
    const next = await store.publish(projectPath, answer('homework', 'a2', {
      kind: 'development',
      source: answerSource('homework', 'a2', { approval: 'none', authority: { ticketType: 'homework', mode: 'hitl' } }),
      supersedes: [old.record.id, q1.record.id, q2.record.id],
    }))
    expect(next.record.status).toBe('active')
    const statuses = Object.fromEntries(next.snapshot.records.map(record => [record.id, record.status]))
    expect(statuses[old.record.id]).toBe('superseded')
    expect(statuses[q1.record.id]).toBe('superseded')
    expect(statuses[q2.record.id]).toBe('superseded')
    expect(next.snapshot.records.filter(record => record.status === 'active')).toHaveLength(1)
  })

  it('leaves the question active when the answer lands as a candidate', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q = await store.publish(projectPath, question('flagged', 'q1'))
    const flagged = await store.publish(projectPath, answer('flagged', 'a1', {
      requestedStatus: 'candidate',
      safety: 'flagged',
      supersedes: [q.record.id],
    }))
    expect(flagged.record).toMatchObject({ status: 'candidate', supersedes: [] })
    expect(flagged.snapshot.records.find(record => record.id === q.record.id)?.status).toBe('active')

    const unrelated = await store.publish(projectPath, answer('unrelated', 'u1'))
    const conflicted = await store.publish(projectPath, answer('flagged', 'a2', {
      conflictsWith: [unrelated.record.id],
      supersedes: [q.record.id],
    }))
    expect(conflicted.record).toMatchObject({ status: 'candidate', supersedes: [] })
    expect(conflicted.snapshot.records.find(record => record.id === q.record.id)?.status).toBe('active')
    expect(conflicted.snapshot.conflicts).toHaveLength(1)
  })

  it('rejects closing a question from a different workflow, and keeps every other cross-kind pairing forbidden', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q = await store.publish(projectPath, question('foreign', 'q1'))
    const foreignAnswer = answer('foreign', 'a1', {
      source: { ...answerSource('foreign', 'a1'), workflow: 'writeros', authority: undefined } as MemorySource,
      supersedes: [q.record.id],
    })
    await expect(store.publish(projectPath, foreignAnswer)).rejects.toMatchObject({ code: 'invalid-action' })

    const canon = await store.publish(projectPath, answer('other', 'a1'))
    await expect(store.publish(projectPath, question('other', 'q9', { supersedes: [canon.record.id] })))
      .rejects.toMatchObject({ code: 'invalid-action' })
    await expect(store.publish(projectPath, answer('other', 'd1', {
      kind: 'development',
      source: answerSource('other', 'd1', { approval: 'none', authority: { ticketType: 'homework', mode: 'hitl' } }),
      supersedes: [canon.record.id],
    }))).rejects.toMatchObject({ code: 'invalid-action' })

    // Same-kind question supersession still works.
    const q2 = await store.publish(projectPath, question('foreign', 'q2', { supersedes: [q.record.id] }))
    expect(q2.record.supersedes).toEqual([q.record.id])
  })

  it('lets a promotion close a question, and replay rejects a forged candidate closure', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q = await store.publish(projectPath, question('promoted', 'q1'))
    const candidate = await store.publish(projectPath, answer('promoted', 'a1', { requestedStatus: 'candidate' }))
    expect(candidate.record.status).toBe('candidate')
    const promoted = await store.applyAction(projectPath, {
      type: 'promote',
      recordId: candidate.record.id,
      supersedes: [q.record.id],
      expectedRevision: candidate.snapshot.revision,
    })
    expect(promoted.records.find(record => record.id === candidate.record.id)).toMatchObject({
      status: 'active',
      supersedes: [q.record.id],
    })
    expect(promoted.records.find(record => record.id === q.record.id)?.status).toBe('superseded')

    const q2 = await store.publish(projectPath, question('forged', 'q1'))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const before = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      schemaVersion: 1,
      id: 'event-forged',
      projectId: 'project-1',
      revision: q2.snapshot.revision + 1,
      occurredAt: capturedAt,
      type: 'published',
      dedupeKey: 'forged',
      record: {
        id: 'mem-forged',
        projectId: 'project-1',
        kind: 'canon',
        status: 'candidate',
        claim: 'Forged.',
        tags: [],
        entities: [],
        source: answerSource('forged', 'f1'),
        evidence: [],
        safety: 'clear',
        spoiler: false,
        supersedes: [q2.record.id],
        createdAt: capturedAt,
        updatedAt: capturedAt,
      },
      conflicts: [],
      supersededRecordIds: [q2.record.id],
    })
    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({ code: 'corrupt-ledger' })
    expect(await readFile(snapshotPath, 'utf8')).toBe(before)
  })

  it('keeps an open conflict that references the closed question', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q = await store.publish(projectPath, question('conflicted', 'q1'))
    const rival = await store.publish(projectPath, question('conflicted', 'r1', {
      source: questionSource('rival', 'r1'),
      conflictsWith: [q.record.id],
    }))
    expect(rival.snapshot.conflicts).toHaveLength(1)
    const a = await store.publish(projectPath, answer('conflicted', 'a1', { supersedes: [q.record.id] }))
    expect(a.snapshot.records.find(record => record.id === q.record.id)?.status).toBe('superseded')
    expect(a.snapshot.conflicts[0]).toMatchObject({ status: 'open', leftRecordId: q.record.id })
  })

  it('pins a publication to an expected revision', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const q = await store.publish(projectPath, question('pinned', 'q1'))
    expect(PublishMemoryInputSchema.parse(answer('pinned', 'a1')).expectedRevision).toBeUndefined()

    await expect(store.publish(projectPath, answer('pinned', 'a1', {
      supersedes: [q.record.id],
      expectedRevision: q.snapshot.revision + 5,
    }))).rejects.toMatchObject({ code: 'revision-conflict' })
    expect((await store.readSnapshot(projectPath)).revision).toBe(q.snapshot.revision)

    const ok = await store.publish(projectPath, answer('pinned', 'a1', {
      supersedes: [q.record.id],
      expectedRevision: q.snapshot.revision,
    }))
    expect(ok.published).toBe(true)

    // An idempotent retry with a stale pin is still a no-op, not an error.
    const retry = await store.publish(projectPath, answer('pinned', 'a1', {
      supersedes: [q.record.id],
      expectedRevision: q.snapshot.revision,
    }))
    expect(retry.published).toBe(false)
    expect(retry.record.id).toBe(ok.record.id)
  })
})
