import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PublishMemoryInputSchema, type MemorySource, type PublishMemoryInput } from '../../shared/projectMemory'
import { createProjectMemoryStore, publicationRecordId } from '../../server/projectMemory/store'

const capturedAt = '2026-09-11T20:00:00.000Z'
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function makeProject(projectId = 'project-1') {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'writeros-memory-spv-'))
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

function ticketSource(hash: string, overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    workflow: 'story-wayfinder',
    sourceId: 'resolved/the-solo-rule.md',
    sourceUri: 'story-wayfinder:resolved/the-solo-rule.md',
    sourceHash: hash,
    capturedAt,
    approval: 'explicit',
    authority: { ticketType: 'grill', mode: 'hitl' },
    ...overrides,
  } as MemorySource
}

function ticketVersion(hash: string, overrides: Partial<PublishMemoryInput> = {}): PublishMemoryInput {
  return {
    projectId: 'project-1',
    dedupeKey: `import:story-wayfinder:${hash}`,
    kind: 'canon',
    requestedStatus: 'active',
    claim: `Solo rule version ${hash}.`,
    source: ticketSource(hash),
    supersedesPriorVersions: true,
    ...overrides,
  }
}

describe('publish with supersedesPriorVersions', () => {
  it('defaults the flag off and keeps the input schema strict', () => {
    const parsed = PublishMemoryInputSchema.parse(ticketVersion('v1', { supersedesPriorVersions: undefined }))
    expect(parsed.supersedesPriorVersions).toBe(false)
    expect(PublishMemoryInputSchema.safeParse({ ...ticketVersion('v1'), unknownField: true }).success).toBe(false)
  })

  it('retires the one active prior version of the same source', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const first = await store.publish(projectPath, ticketVersion('v1'))
    const second = await store.publish(projectPath, ticketVersion('v2'))

    expect(first.record.status).toBe('active')
    expect(second.published).toBe(true)
    expect(second.record).toMatchObject({ status: 'active', supersedes: [first.record.id] })
    expect(second.snapshot.records.find(record => record.id === first.record.id)?.status).toBe('superseded')
    expect(second.snapshot.records.filter(record => record.status === 'active')).toHaveLength(1)
  })

  it('retires every active prior version, not just the newest', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    // Three versions published the old way (flag off) all stay active.
    const v1 = await store.publish(projectPath, ticketVersion('v1', { supersedesPriorVersions: false }))
    const v2 = await store.publish(projectPath, ticketVersion('v2', { supersedesPriorVersions: false }))
    const v3 = await store.publish(projectPath, ticketVersion('v3', { supersedesPriorVersions: false }))
    expect(v3.snapshot.records.filter(record => record.status === 'active')).toHaveLength(3)

    const v4 = await store.publish(projectPath, ticketVersion('v4'))
    expect(new Set(v4.record.supersedes)).toEqual(new Set([v1.record.id, v2.record.id, v3.record.id]))
    const active = v4.snapshot.records.filter(record => record.status === 'active')
    expect(active.map(record => record.id)).toEqual([v4.record.id])
  })

  it('unions computed priors with an explicit supersedes list', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const prior = await store.publish(projectPath, ticketVersion('v1', { supersedesPriorVersions: false }))
    const other = await store.publish(projectPath, ticketVersion('other', {
      supersedesPriorVersions: false,
      source: ticketSource('other', { sourceId: 'resolved/other.md', sourceUri: 'story-wayfinder:resolved/other.md' }),
    }))
    const next = await store.publish(projectPath, ticketVersion('v2', { supersedes: [other.record.id] }))
    expect(new Set(next.record.supersedes)).toEqual(new Set([prior.record.id, other.record.id]))
  })

  it('leaves priors active when the incoming record lands as a candidate', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const prior = await store.publish(projectPath, ticketVersion('v1'))

    const flagged = await store.publish(projectPath, ticketVersion('v2', {
      requestedStatus: 'candidate',
      safety: 'flagged',
    }))
    expect(flagged.record).toMatchObject({ status: 'candidate', supersedes: [] })
    expect(flagged.snapshot.records.find(record => record.id === prior.record.id)?.status).toBe('active')

    const requested = await store.publish(projectPath, ticketVersion('v3', { requestedStatus: 'candidate' }))
    expect(requested.record).toMatchObject({ status: 'candidate', supersedes: [] })
    expect(requested.snapshot.records.find(record => record.id === prior.record.id)?.status).toBe('active')
  })

  it('leaves priors active when an unresolved conflict keeps the incoming canon a candidate', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const prior = await store.publish(projectPath, ticketVersion('v1'))
    const unrelated = await store.publish(projectPath, ticketVersion('unrelated', {
      supersedesPriorVersions: false,
      source: ticketSource('unrelated', { sourceId: 'resolved/unrelated.md', sourceUri: 'story-wayfinder:resolved/unrelated.md' }),
    }))

    const conflicted = await store.publish(projectPath, ticketVersion('v2', { conflictsWith: [unrelated.record.id] }))
    expect(conflicted.record).toMatchObject({ status: 'candidate', supersedes: [] })
    expect(conflicted.snapshot.conflicts).toHaveLength(1)
    expect(conflicted.snapshot.records.find(record => record.id === prior.record.id)?.status).toBe('active')
  })

  it('ignores a prior of a different kind or a different workflow at the same source id', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const question = await store.publish(projectPath, ticketVersion('q1', {
      kind: 'open_question',
      supersedesPriorVersions: false,
      source: ticketSource('q1', { approval: 'none', authority: undefined }),
    }))
    const foreign = await store.publish(projectPath, ticketVersion('f1', {
      supersedesPriorVersions: false,
      source: { ...ticketSource('f1'), workflow: 'buzz', authority: undefined } as MemorySource,
    }))
    expect(question.record.status).toBe('active')
    expect(foreign.record.status).toBe('active')

    const canon = await store.publish(projectPath, ticketVersion('v1'))
    expect(canon.record).toMatchObject({ status: 'active', supersedes: [] })
    expect(canon.snapshot.records.filter(record => record.status === 'active')).toHaveLength(3)
  })

  it('treats a retry of an already-published version as idempotent', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const first = await store.publish(projectPath, ticketVersion('v1'))
    const second = await store.publish(projectPath, ticketVersion('v2'))
    const retry = await store.publish(projectPath, ticketVersion('v1'))

    expect(retry.published).toBe(false)
    expect(retry.record.id).toBe(first.record.id)
    expect(retry.snapshot.revision).toBe(second.snapshot.revision)
    expect(retry.snapshot.records.find(record => record.id === second.record.id)?.status).toBe('active')
    expect(publicationRecordId('project-1', ticketVersion('v1').dedupeKey, 'v1')).toBe(first.record.id)
  })

  it('rejects a replayed publication that retires records while landing as a candidate', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const prior = await store.publish(projectPath, ticketVersion('v1'))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')

    await appendLedgerLine(projectPath, {
      schemaVersion: 1,
      id: 'event-forged-2',
      projectId: 'project-1',
      revision: 2,
      occurredAt: capturedAt,
      type: 'published',
      dedupeKey: 'import:story-wayfinder:forged',
      record: {
        id: 'mem-forged',
        projectId: 'project-1',
        kind: 'canon',
        status: 'candidate',
        claim: 'Forged candidate that pretends to retire canon.',
        tags: [],
        entities: [],
        source: ticketSource('forged'),
        evidence: [],
        safety: 'clear',
        spoiler: false,
        supersedes: [prior.record.id],
        createdAt: capturedAt,
        updatedAt: capturedAt,
      },
      conflicts: [],
      supersededRecordIds: [prior.record.id],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 2,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })
})
