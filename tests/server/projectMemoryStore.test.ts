import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MemoryApprovalSchema,
  MemoryKindSchema,
  MemorySafetySchema,
  MemoryStatusSchema,
  MemoryWorkflowSchema,
  ProjectMemoryActionSchema,
  ProjectMemoryConflictResolutionSchema,
  ProjectMemoryConflictStatusSchema,
  ProjectMemoryEventSchema,
  ProjectMemoryRecordSchema,
  PublishMemoryInputSchema,
  RequestedMemoryStatusSchema,
  type MemorySource,
  type PublishMemoryInput,
} from '../../shared/projectMemory'
import { acquirePackageWriteLock } from '../../server/projectLibrary/packageLock'
import {
  ProjectMemoryStoreError,
  createProjectMemoryStore,
} from '../../server/projectMemory/store'

const capturedAt = '2026-08-13T20:00:00.000Z'
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function makeProject(projectId = 'project-1') {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'writeros-memory-'))
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
  return { workspaceRoot, projectPath, projectId }
}

function source(overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    workflow: 'writeros',
    sourceId: 'story-lock:ending',
    sourceUri: 'documents/story-bible.json#ending',
    sourceHash: 'sha256:one',
    capturedAt,
    approval: 'none',
    ...overrides,
  }
}

function publishInput(overrides: Partial<PublishMemoryInput> = {}): PublishMemoryInput {
  return {
    projectId: 'project-1',
    dedupeKey: 'writeros:story-lock:ending',
    kind: 'canon',
    requestedStatus: 'candidate',
    claim: 'Mara leaves the island alone.',
    source: source(),
    ...overrides,
  }
}

function memoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    projectId: 'project-1',
    kind: 'canon',
    status: 'candidate',
    claim: 'Mara leaves the island alone.',
    tags: [],
    entities: [],
    source: publishInput().source,
    evidence: [],
    safety: 'clear',
    spoiler: false,
    supersedes: [],
    createdAt: capturedAt,
    updatedAt: capturedAt,
    ...overrides,
  }
}

describe('project memory schemas', () => {
  it.each([
    ['kind', MemoryKindSchema, ['canon', 'document_fact', 'development', 'decision', 'open_question']],
    ['status', MemoryStatusSchema, ['candidate', 'active', 'superseded', 'rejected']],
    ['workflow', MemoryWorkflowSchema, ['writeros', 'writeros-room', 'story-wayfinder', 'pitchstudio', 'buzz']],
    ['approval', MemoryApprovalSchema, ['none', 'explicit']],
    ['safety', MemorySafetySchema, ['clear', 'flagged']],
    ['requested status', RequestedMemoryStatusSchema, ['candidate', 'active']],
    ['conflict status', ProjectMemoryConflictStatusSchema, ['open', 'resolved']],
    ['conflict resolution', ProjectMemoryConflictResolutionSchema, ['left', 'right', 'both-valid', 'not-conflict']],
  ])('accepts only the declared %s enum values', (_label, schema, valid) => {
    for (const value of valid) expect(schema.parse(value)).toBe(value)
    expect(schema.safeParse('Bloodless').success).toBe(false)
  })

  it('enforces claim and detail length bounds', () => {
    expect(PublishMemoryInputSchema.safeParse(publishInput({ claim: '' })).success).toBe(false)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ claim: 'x'.repeat(600) })).success).toBe(true)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ claim: 'x'.repeat(601) })).success).toBe(false)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ detail: 'x'.repeat(8_000) })).success).toBe(true)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ detail: 'x'.repeat(8_001) })).success).toBe(false)
  })

  it('enforces evidence, tag, and entity bounds', () => {
    const evidence = { excerpt: 'x'.repeat(1_500), locator: 'scene:12' }
    expect(PublishMemoryInputSchema.safeParse(publishInput({ evidence: [evidence, evidence, evidence] })).success).toBe(true)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ evidence: [evidence, evidence, evidence, evidence] })).success).toBe(false)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ evidence: [{ excerpt: 'x'.repeat(1_501) }] })).success).toBe(false)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ tags: Array.from({ length: 20 }, (_, i) => `tag-${i}`) })).success).toBe(true)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`) })).success).toBe(false)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ entities: Array.from({ length: 30 }, (_, i) => `entity-${i}`) })).success).toBe(true)
    expect(PublishMemoryInputSchema.safeParse(publishInput({ entities: Array.from({ length: 31 }, (_, i) => `entity-${i}`) })).success).toBe(false)
  })

  it('defaults optional arrays, safety, and spoiler without inventing canon authority', () => {
    const parsed = PublishMemoryInputSchema.parse(publishInput())

    expect(parsed).toMatchObject({
      tags: [],
      entities: [],
      evidence: [],
      safety: 'clear',
      spoiler: false,
      conflictsWith: [],
      supersedes: [],
      requestedStatus: 'candidate',
    })
  })

  it('rejects every safety-flagged active record in publish inputs and stored records', () => {
    expect(PublishMemoryInputSchema.safeParse(publishInput({
      requestedStatus: 'active',
      safety: 'flagged',
    })).success).toBe(false)
    expect(ProjectMemoryRecordSchema.safeParse(memoryRecord({
      status: 'active',
      safety: 'flagged',
    })).success).toBe(false)
    expect(PublishMemoryInputSchema.safeParse(publishInput({
      kind: 'decision',
      requestedStatus: 'active',
      safety: 'flagged',
    })).success).toBe(false)
    expect(ProjectMemoryRecordSchema.safeParse(memoryRecord({
      kind: 'decision',
      status: 'active',
      safety: 'flagged',
    })).success).toBe(false)
  })

  it('rejects malformed events and invalid action variants', () => {
    expect(ProjectMemoryEventSchema.safeParse({
      schemaVersion: 1,
      type: 'published',
      revision: 1,
      projectId: 'project-1',
    }).success).toBe(false)
    expect(ProjectMemoryActionSchema.safeParse({
      type: 'promote-and-auto-win',
      recordId: 'mem-1',
      expectedRevision: 1,
    }).success).toBe(false)
  })
})

describe('append-only project memory store', () => {
  it('lazily initializes an empty ledger and all derived projections', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()

    const snapshot = await store.readSnapshot(projectPath)

    expect(snapshot).toEqual({
      schemaVersion: 1,
      projectId: 'project-1',
      revision: 0,
      records: [],
      conflicts: [],
    })
    expect(await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')).toBe('')
    expect(JSON.parse(await readFile(path.join(projectPath, 'memory', 'snapshot.json'), 'utf8'))).toEqual(snapshot)
    expect(await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8')).toContain('No active canon')
    expect(await readFile(path.join(projectPath, 'memory', 'review.md'), 'utf8')).toContain('No items awaiting review')
  })

  it('appends sequential revisions without replacing prior ledger events', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()

    const first = await store.publish(projectPath, publishInput({ kind: 'development' }))
    const second = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:story-lock:opening',
      kind: 'development',
      claim: 'Mara arrives during the storm.',
      source: source({ sourceId: 'story-lock:opening', sourceHash: 'sha256:two' }),
    }))

    expect(first.snapshot.revision).toBe(1)
    expect(second.snapshot.revision).toBe(2)
    const events = (await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8'))
      .trim().split('\n').map(line => JSON.parse(line))
    expect(events.map(event => event.revision)).toEqual([1, 2])
    expect(events.map(event => event.record.claim)).toEqual([
      'Mara leaves the island alone.',
      'Mara arrives during the storm.',
    ])
  })

  it('returns an idempotent no-op for the same dedupe key and source hash', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const first = await store.publish(projectPath, publishInput())

    const retry = await store.publish(projectPath, publishInput({ claim: 'Retry payload is ignored.' }))

    expect(retry).toMatchObject({ published: false, record: first.record })
    expect(retry.snapshot.revision).toBe(1)
    expect((await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(1)
  })

  it('creates an immutable new record and revision when a source hash changes', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const first = await store.publish(projectPath, publishInput({ kind: 'development' }))

    const changed = await store.publish(projectPath, publishInput({
      kind: 'development',
      claim: 'Mara stays on the island.',
      source: source({ sourceHash: 'sha256:changed' }),
    }))

    expect(changed.published).toBe(true)
    expect(changed.snapshot.revision).toBe(2)
    expect(changed.record.id).not.toBe(first.record.id)
    expect(changed.snapshot.records.map(record => record.claim)).toEqual([
      'Mara leaves the island alone.',
      'Mara stays on the island.',
    ])
  })

  it('rejects input whose project ID does not match project.json without appending', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()

    await expect(store.publish(projectPath, publishInput({ projectId: 'project-2' })))
      .rejects.toMatchObject({ code: 'project-mismatch' })
    await expect(readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('activates only clear explicitly approved canon and never infers authority', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()

    const unapproved = await store.publish(projectPath, publishInput({ requestedStatus: 'active' }))
    const approved = await store.publish(projectPath, publishInput({
      dedupeKey: 'wayfinder:resolved:ending',
      requestedStatus: 'active',
      source: source({
        workflow: 'story-wayfinder',
        sourceId: 'resolved:ending',
        sourceHash: 'sha256:approved',
        approval: 'explicit',
      }),
    }))

    expect(unapproved.record.status).toBe('candidate')
    expect(approved.record.status).toBe('active')
  })

  it('promotes an eligible candidate through an explicit revision-checked action', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput())

    const snapshot = await store.applyAction(projectPath, {
      type: 'promote',
      recordId: published.record.id,
      expectedRevision: 1,
      supersedes: [],
    })

    expect(snapshot.revision).toBe(2)
    expect(snapshot.records[0].status).toBe('active')
    await expect(store.applyAction(projectPath, {
      type: 'reject',
      recordId: published.record.id,
      expectedRevision: 1,
    })).rejects.toMatchObject({ code: 'revision-conflict' })
  })

  it('rejects a candidate without erasing its history', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput())

    const snapshot = await store.applyAction(projectPath, {
      type: 'reject',
      recordId: published.record.id,
      expectedRevision: 1,
    })

    expect(snapshot.records[0]).toMatchObject({ id: published.record.id, status: 'rejected' })
    expect(snapshot.revision).toBe(2)
  })

  it('keeps conflicting Buzz canon candidate and opens conflict for human arbitration', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const existing = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:ending',
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))

    const buzz = await store.publish(projectPath, publishInput({
      dedupeKey: 'buzz:canon:ending',
      requestedStatus: 'active',
      claim: 'Mara stays on the island.',
      source: source({
        workflow: 'buzz',
        sourceId: 'atom:ending',
        sourceHash: 'sha256:buzz',
        approval: 'explicit',
      }),
      conflictsWith: [existing.record.id],
    }))

    expect(buzz.record.status).toBe('candidate')
    expect(buzz.snapshot.records.find(record => record.id === existing.record.id)?.status).toBe('active')
    expect(buzz.snapshot.conflicts).toEqual([
      expect.objectContaining({
        leftRecordId: existing.record.id,
        rightRecordId: buzz.record.id,
        status: 'open',
      }),
    ])
  })

  it('activates explicit supersession while preserving the prior canon record', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const existing = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))

    const replacement = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:revised-ending',
      requestedStatus: 'active',
      claim: 'Mara stays to rebuild the island.',
      source: source({ sourceId: 'story-lock:revised-ending', sourceHash: 'sha256:replacement', approval: 'explicit' }),
      conflictsWith: [existing.record.id],
      supersedes: [existing.record.id],
    }))

    expect(replacement.record).toMatchObject({ status: 'active', supersedes: [existing.record.id] })
    expect(replacement.snapshot.records.find(record => record.id === existing.record.id)?.status).toBe('superseded')
    expect(replacement.snapshot.conflicts).toEqual([])
  })

  it('resolves an open conflict only through the designated human action', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const existing = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const proposed = await store.publish(projectPath, publishInput({
      dedupeKey: 'buzz:canon:ending',
      requestedStatus: 'active',
      claim: 'Mara stays on the island.',
      source: source({ workflow: 'buzz', sourceId: 'atom:ending', sourceHash: 'sha256:buzz', approval: 'explicit' }),
      conflictsWith: [existing.record.id],
    }))
    const conflict = proposed.snapshot.conflicts[0]

    const resolved = await store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: conflict.id,
      expectedRevision: 2,
      resolution: 'right',
    })

    expect(resolved.conflicts[0]).toMatchObject({ status: 'resolved', resolution: 'right' })
    expect(resolved.records.find(record => record.id === existing.record.id)?.status).toBe('superseded')
    expect(resolved.records.find(record => record.id === proposed.record.id)?.status).toBe('active')
  })

  it('stores document facts as active nonbinding records and supersedes the same anchor automatically', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const first = await store.publish(projectPath, publishInput({
      kind: 'document_fact',
      requestedStatus: 'candidate',
      claim: 'Mara boards the ferry.',
    }))

    const changed = await store.publish(projectPath, publishInput({
      kind: 'document_fact',
      requestedStatus: 'candidate',
      claim: 'Mara misses the ferry.',
      source: source({ sourceHash: 'sha256:changed' }),
    }))

    expect(first.record.status).toBe('active')
    expect(changed.record).toMatchObject({ status: 'active', supersedes: [first.record.id] })
    expect(changed.snapshot.records.find(record => record.id === first.record.id)?.status).toBe('superseded')
  })

  it('keeps safety-flagged document facts reviewable but never active', async () => {
    const { projectPath } = await makeProject()

    const published = await createProjectMemoryStore().publish(projectPath, publishInput({
      kind: 'document_fact',
      requestedStatus: 'candidate',
      safety: 'flagged',
    }))

    expect(published.record).toMatchObject({ kind: 'document_fact', safety: 'flagged', status: 'candidate' })
  })

  it('keeps a clear document fact active while surfacing its contradiction with canon', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const canon = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))

    const fact = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:document:ending',
      kind: 'document_fact',
      requestedStatus: 'candidate',
      claim: 'The current synopsis says Mara stays.',
      source: source({ sourceId: 'synopsis:ending', sourceHash: 'sha256:synopsis' }),
      conflictsWith: [canon.record.id],
    }))

    expect(fact.record.status).toBe('active')
    expect(fact.snapshot.conflicts).toEqual([
      expect.objectContaining({
        leftRecordId: canon.record.id,
        rightRecordId: fact.record.id,
        status: 'open',
      }),
    ])
  })

  it('rebuilds an exact snapshot and projections from the canonical ledger', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const expected = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:development:storm',
      kind: 'development',
      claim: 'The storm arrives before dawn.',
      source: source({ sourceId: 'development:storm', sourceHash: 'sha256:storm' }),
    }))
    const memoryPath = path.join(projectPath, 'memory')
    await unlink(path.join(memoryPath, 'snapshot.json'))
    await writeFile(path.join(memoryPath, 'canon.md'), 'stale canon\n', 'utf8')
    await writeFile(path.join(memoryPath, 'review.md'), 'stale review\n', 'utf8')

    const rebuilt = await store.readSnapshot(projectPath)

    expect(rebuilt).toEqual(expected.snapshot)
    expect(JSON.parse(await readFile(path.join(memoryPath, 'snapshot.json'), 'utf8'))).toEqual(expected.snapshot)
    expect(await readFile(path.join(memoryPath, 'canon.md'), 'utf8')).toContain('Mara leaves the island alone.')
    expect(await readFile(path.join(memoryPath, 'review.md'), 'utf8')).toContain('The storm arrives before dawn.')
  })

  it('fails on the exact malformed ledger line without returning or writing partial context', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput({ kind: 'development' }))
    const memoryPath = path.join(projectPath, 'memory')
    const snapshotBefore = await readFile(path.join(memoryPath, 'snapshot.json'), 'utf8')
    const ledgerPath = path.join(memoryPath, 'ledger.jsonl')
    await writeFile(ledgerPath, `${await readFile(ledgerPath, 'utf8')}{not-json}\n`, 'utf8')

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 2,
    })
    await expect(store.rebuild(projectPath)).rejects.toThrow('ledger.jsonl line 2')
    expect(await readFile(path.join(memoryPath, 'snapshot.json'), 'utf8')).toBe(snapshotBefore)
    expect(JSON.parse(snapshotBefore).records[0].id).toBe(published.record.id)
  })

  it('rejects a schema-valid ledger event that forges canon authority', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    await store.publish(projectPath, publishInput())
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const event = JSON.parse((await readFile(ledgerPath, 'utf8')).trim())
    event.record.status = 'active'
    await writeFile(ledgerPath, `${JSON.stringify(event)}\n`, 'utf8')

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 1,
    })
  })

  it('appends the canonical event before attempting any derived projection replacement', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    await store.readSnapshot(projectPath)
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    await unlink(snapshotPath)
    await mkdir(snapshotPath)

    await expect(store.publish(projectPath, publishInput({ kind: 'development' }))).rejects.toBeInstanceOf(Error)
    const ledger = await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')
    expect(ledger.trim().split('\n')).toHaveLength(1)

    await rm(snapshotPath, { recursive: true })
    const recovered = await store.readSnapshot(projectPath)
    expect(recovered).toMatchObject({ revision: 1 })
    expect(recovered.records[0].claim).toBe('Mara leaves the island alone.')
  })

  it('holds the shared package lock across memory initialization and publication', async () => {
    const { workspaceRoot, projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    const held = await acquirePackageWriteLock({ workspaceRoot, projectId })
    let settled = false
    const publication = store.publish(projectPath, publishInput()).finally(() => {
      settled = true
    })

    try {
      await new Promise(resolve => setTimeout(resolve, 75))
      expect(settled).toBe(false)
      await expect(readdir(projectPath)).resolves.not.toContain('memory')
    } finally {
      await held.release()
      await publication
    }
    expect(await readdir(projectPath)).toContain('memory')
  })

  it('rejects a malformed project manifest before creating memory state', async () => {
    const { projectPath } = await makeProject()
    await writeFile(path.join(projectPath, 'project.json'), '{"projectId":42}\n', 'utf8')

    await expect(createProjectMemoryStore().readSnapshot(projectPath))
      .rejects.toBeInstanceOf(ProjectMemoryStoreError)
    await expect(readdir(projectPath)).resolves.not.toContain('memory')
  })

  it('leaves no temporary projection files after a successful transaction', async () => {
    const { projectPath } = await makeProject()
    await createProjectMemoryStore().publish(projectPath, publishInput({ kind: 'development' }))

    expect((await readdir(path.join(projectPath, 'memory'))).sort()).toEqual([
      'canon.md',
      'ledger.jsonl',
      'review.md',
      'snapshot.json',
    ])
  })
})
