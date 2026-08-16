import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MemoryApprovalSchema,
  MemoryKindSchema,
  MemorySafetySchema,
  MemorySourceSchema,
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
  type ProjectMemorySnapshot,
  type PublishMemoryInput,
} from '../../shared/projectMemory'
import { acquirePackageWriteLock } from '../../server/projectLibrary/packageLock'
import {
  ProjectMemoryStoreError,
  createProjectMemoryStore,
} from '../../server/projectMemory/store'
import {
  renderCanonProjection,
  renderReviewProjection,
} from '../../server/projectMemory/projections'

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

async function appendLedgerLine(projectPath: string, event: unknown): Promise<void> {
  const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
  const existing = await readFile(ledgerPath, 'utf8')
  await writeFile(ledgerPath, `${existing}${JSON.stringify(event)}\n`, 'utf8')
}

function forgedEventBase(revision: number, type: string) {
  return {
    schemaVersion: 1,
    id: `event-forged-${revision}`,
    projectId: 'project-1',
    revision,
    occurredAt: capturedAt,
    type,
  }
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

function wayfinderSource(
  ticketType: 'grill' | 'sketch' | 'homework',
  mode: 'hitl' | 'afk',
  overrides: Partial<MemorySource> = {},
): MemorySource {
  return {
    ...source({
      workflow: 'story-wayfinder',
      approval: 'explicit',
      ...overrides,
    }),
    authority: { ticketType, mode },
  } as MemorySource
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

function legacyWayfinderLedgerEvents(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0')
    return {
      ...forgedEventBase(index + 1, 'published'),
      id: `event-legacy-wayfinder-${suffix}`,
      dedupeKey: `wayfinder:legacy:${suffix}`,
      record: memoryRecord({
        id: `mem-legacy-wayfinder-${suffix}`,
        status: 'active',
        claim: `Legacy Wayfinder claim ${suffix}.`,
        source: source({
          workflow: 'story-wayfinder',
          sourceId: `resolved:legacy-${suffix}`,
          sourceHash: `sha256:legacy-wayfinder-${suffix}`,
          approval: 'explicit',
        }),
      }),
      conflicts: [],
      supersededRecordIds: [],
    }
  })
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

  it.each([
    ['grill', 'hitl'],
    ['grill', 'afk'],
    ['sketch', 'hitl'],
    ['sketch', 'afk'],
    ['homework', 'hitl'],
    ['homework', 'afk'],
  ] as const)('accepts typed Wayfinder authority metadata for %s/%s', (ticketType, mode) => {
    expect(MemorySourceSchema.safeParse(wayfinderSource(ticketType, mode)).success).toBe(true)
  })

  it('rejects product names and unknown values in Wayfinder authority metadata', () => {
    const invalidTicket = {
      ...wayfinderSource('grill', 'hitl'),
      authority: { ticketType: 'Bloodless', mode: 'hitl' },
    }
    const invalidMode = {
      ...wayfinderSource('grill', 'hitl'),
      authority: { ticketType: 'grill', mode: 'auto-win' },
    }

    expect(MemorySourceSchema.safeParse(invalidTicket).success).toBe(false)
    expect(MemorySourceSchema.safeParse(invalidMode).success).toBe(false)
  })
})

describe('append-only project memory store', () => {
  it('renders record-controlled projection text as escaped single-line Markdown', () => {
    const active = {
      ...memoryRecord({
        id: 'mem-1\n# Forged ID',
        status: 'active',
        claim: 'Trusted canon\n# Forged Heading\n- forged bullet',
        detail: '1. Forged ordered item\n~~~\nDetail\n## Forged Detail\n> forged quote',
        source: source({
          approval: 'explicit',
          sourceUri: 'documents/story.md\n# Forged Source\n- forged source bullet',
        }),
      }),
    }
    const candidate = {
      ...active,
      id: 'candidate-1',
      status: 'candidate',
      claim: 'Candidate\n# Forged Candidate',
    }
    const snapshot = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: 7,
      records: [active, candidate],
      conflicts: [{
        id: 'conflict-1\n# Forged Conflict ID',
        leftRecordId: active.id,
        rightRecordId: candidate.id,
        reason: 'Mismatch\n# Forged Conflict\n- forged conflict bullet',
        status: 'open',
      }],
    } as ProjectMemorySnapshot

    expect(renderCanonProjection(snapshot)).toBe([
      '# Project Canon',
      '',
      'Revision: 7',
      '',
      '## Trusted canon \\# Forged Heading \\- forged bullet',
      '',
      '- Memory ID: mem\\-1 \\# Forged ID',
      '- Source: writeros · documents/story.md \\# Forged Source \\- forged source bullet',
      `- Updated: ${capturedAt}`,
      '',
      '1\\. Forged ordered item \\~\\~\\~ Detail \\#\\# Forged Detail \\> forged quote',
      '',
    ].join('\n'))
    expect(renderReviewProjection(snapshot)).toBe([
      '# Project Memory Review',
      '',
      'Revision: 7',
      '',
      '# Candidates',
      '',
      '## Candidate \\# Forged Candidate',
      '',
      '- Memory ID: candidate\\-1',
      '- Source: writeros · documents/story.md \\# Forged Source \\- forged source bullet',
      `- Updated: ${capturedAt}`,
      '',
      '1\\. Forged ordered item \\~\\~\\~ Detail \\#\\# Forged Detail \\> forged quote',
      '',
      '# Open Conflicts',
      '',
      '## conflict\\-1 \\# Forged Conflict ID',
      '',
      '- Left: mem\\-1 \\# Forged ID',
      '- Right: candidate\\-1',
      '- Reason: Mismatch \\# Forged Conflict \\- forged conflict bullet',
      '',
    ].join('\n'))
  })

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

  it('reconciles only the exact publication identity and not an unrelated event', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const unrelatedInput = publishInput({
      dedupeKey: 'writeros:unrelated',
      kind: 'development',
      claim: 'An unrelated publication advances the ledger.',
      source: source({ sourceId: 'unrelated', sourceHash: 'sha256:unrelated' }),
    })
    const unrelated = await store.publish(projectPath, unrelatedInput)

    const missing = await store.reconcilePublication(projectPath, publishInput({ kind: 'development' }))
    const exact = await store.reconcilePublication(projectPath, unrelatedInput)

    expect(missing).toMatchObject({ snapshot: { revision: 1 } })
    expect(missing.publication).toBeUndefined()
    expect(exact).toMatchObject({
      snapshot: { revision: 1 },
      publication: {
        eventRevision: 1,
        record: { id: unrelated.record.id, claim: 'An unrelated publication advances the ledger.' },
      },
    })
    expect(exact.publication?.eventId).toMatch(/^event_/)
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
      source: wayfinderSource('grill', 'hitl', {
        sourceId: 'resolved:ending',
        sourceHash: 'sha256:approved',
      }),
    }))

    expect(unapproved.record.status).toBe('candidate')
    expect(approved.record.status).toBe('active')
  })

  it('keeps AFK, homework, and untyped Wayfinder canon inactive', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()

    const afk = await store.publish(projectPath, publishInput({
      dedupeKey: 'wayfinder:afk:ending',
      requestedStatus: 'active',
      source: wayfinderSource('grill', 'afk', { sourceHash: 'sha256:afk' }),
    }))
    const homework = await store.publish(projectPath, publishInput({
      dedupeKey: 'wayfinder:homework:ending',
      requestedStatus: 'active',
      source: wayfinderSource('homework', 'hitl', { sourceHash: 'sha256:homework' }),
    }))
    const untyped = await store.publish(projectPath, publishInput({
      dedupeKey: 'wayfinder:untyped:ending',
      requestedStatus: 'active',
      source: source({
        workflow: 'story-wayfinder',
        approval: 'explicit',
        sourceHash: 'sha256:untyped',
      }),
    }))

    expect([afk.record.status, homework.record.status, untyped.record.status])
      .toEqual(['candidate', 'candidate', 'candidate'])
  })

  it('migrates legacy active Wayfinder canon to an explicitly unverified review candidate once', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    await store.readSnapshot(projectPath)
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const legacyRecord = memoryRecord({
      id: 'mem-legacy-wayfinder',
      status: 'active',
      source: source({
        workflow: 'story-wayfinder',
        sourceId: 'resolved:legacy-ending',
        sourceHash: 'sha256:legacy-wayfinder',
        approval: 'explicit',
      }),
    })
    await writeFile(ledgerPath, `${JSON.stringify({
      ...forgedEventBase(1, 'published'),
      id: 'event-legacy-wayfinder',
      dedupeKey: 'wayfinder:legacy:ending',
      record: legacyRecord,
      conflicts: [],
      supersededRecordIds: [],
    })}\n`, 'utf8')

    const migrated = await store.readSnapshot(projectPath)
    const firstLedger = await readFile(ledgerPath, 'utf8')
    const events = firstLedger.trim().split('\n').map(line => JSON.parse(line))

    expect(migrated.revision).toBe(2)
    expect(migrated.records[0]).toMatchObject({
      id: 'mem-legacy-wayfinder',
      status: 'candidate',
      source: {
        workflow: 'story-wayfinder',
        approval: 'explicit',
        authority: { verification: 'legacy-unverified' },
      },
    })
    expect(events[1]).toMatchObject({
      revision: 2,
      type: 'legacy-authority-downgraded',
      recordIds: ['mem-legacy-wayfinder'],
    })
    expect(await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8'))
      .not.toContain('Mara leaves the island alone.')
    expect(await readFile(path.join(projectPath, 'memory', 'review.md'), 'utf8'))
      .toContain('Authority: legacy / unverified')

    await expect(store.readSnapshot(projectPath)).resolves.toEqual(migrated)
    expect(await readFile(ledgerPath, 'utf8')).toBe(firstLedger)

    // Ben's 2026-08-16 ruling: an explicit promote in review re-ratifies a
    // legacy-downgraded candidate (was: rejected). The legacy marker is
    // replaced by the store's promotion stamp.
    const promoted = await store.applyAction(projectPath, {
      type: 'promote',
      recordId: 'mem-legacy-wayfinder',
      expectedRevision: 2,
      supersedes: [],
    })
    expect(promoted.records[0]).toMatchObject({
      id: 'mem-legacy-wayfinder',
      status: 'active',
      source: { authority: { verification: 'writeros-promotion' } },
    })
    expect(await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8'))
      .toContain('Mara leaves the island alone.')
    const ledgerAfterPromote = await readFile(ledgerPath, 'utf8')

    await expect(store.publish(projectPath, publishInput({
      dedupeKey: 'wayfinder:forged-legacy-marker',
      requestedStatus: 'active',
      source: {
        ...source({
          workflow: 'story-wayfinder',
          sourceId: 'resolved:forged',
          sourceHash: 'sha256:forged-legacy-marker',
          approval: 'explicit',
        }),
        authority: { verification: 'legacy-unverified' },
      } as MemorySource,
    }))).rejects.toMatchObject({ code: 'invalid-input' })
    // The rejected forgery must append nothing beyond the promote event above.
    expect(await readFile(ledgerPath, 'utf8')).toBe(ledgerAfterPromote)
  })

  it('migrates 101 active legacy Wayfinder records in deterministic bounded batches', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    await store.readSnapshot(projectPath)
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const legacyEvents = legacyWayfinderLedgerEvents(101)
    const recordIds = legacyEvents.map(event => event.record.id)
    await writeFile(ledgerPath, `${legacyEvents.map(event => JSON.stringify(event)).join('\n')}\n`, 'utf8')

    const migrated = await store.readSnapshot(projectPath)
    const firstLedger = await readFile(ledgerPath, 'utf8')
    const events = firstLedger.trim().split('\n').map(line => JSON.parse(line))
    const migrationEvents = events.filter(event => event.type === 'legacy-authority-downgraded')

    expect(migrated.revision).toBe(103)
    expect(migrated.records).toHaveLength(101)
    expect(migrated.records.every(record => (
      record.status === 'candidate'
      && record.source.authority !== undefined
      && 'verification' in record.source.authority
      && record.source.authority.verification === 'legacy-unverified'
    ))).toBe(true)
    expect(migrationEvents.map(event => event.recordIds)).toEqual([
      recordIds.slice(0, 100),
      recordIds.slice(100),
    ])
    expect(await readFile(path.join(projectPath, 'memory', 'review.md'), 'utf8'))
      .toContain('Legacy Wayfinder claim 100.')
    expect(await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8'))
      .not.toContain('Legacy Wayfinder claim 000.')

    await expect(store.readSnapshot(projectPath)).resolves.toEqual(migrated)
    expect(await readFile(ledgerPath, 'utf8')).toBe(firstLedger)
  })

  it('resumes after one persisted legacy migration batch without duplicating completed work', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    await store.readSnapshot(projectPath)
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const legacyEvents = legacyWayfinderLedgerEvents(101)
    const recordIds = legacyEvents.map(event => event.record.id)
    const firstBatch = {
      ...forgedEventBase(102, 'legacy-authority-downgraded'),
      id: 'event-legacy-authority-batch-1',
      recordIds: recordIds.slice(0, 100),
    }
    await writeFile(ledgerPath, `${[
      ...legacyEvents.map(event => JSON.stringify(event)),
      JSON.stringify(firstBatch),
    ].join('\n')}\n`, 'utf8')

    const resumed = await store.readSnapshot(projectPath)
    const resumedLedger = await readFile(ledgerPath, 'utf8')
    const events = resumedLedger.trim().split('\n').map(line => JSON.parse(line))
    const migrationEvents = events.filter(event => event.type === 'legacy-authority-downgraded')

    expect(resumed.revision).toBe(103)
    expect(resumed.records.every(record => record.status === 'candidate')).toBe(true)
    expect(migrationEvents.map(event => event.recordIds)).toEqual([
      recordIds.slice(0, 100),
      [recordIds[100]],
    ])

    await expect(store.rebuild(projectPath)).resolves.toEqual(resumed)
    expect(await readFile(ledgerPath, 'utf8')).toBe(resumedLedger)
  })

  it('skips legacy migration and projection repair under readSnapshot when a caller-supplied id disagrees with the locked manifest (stale index), but still performs it on a matching id', async () => {
    const { projectPath, projectId } = await makeProject()
    const store = createProjectMemoryStore()
    await store.readSnapshot(projectPath)
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const canonPath = path.join(projectPath, 'memory', 'canon.md')
    const reviewPath = path.join(projectPath, 'memory', 'review.md')
    const legacyRecord = memoryRecord({
      id: 'mem-legacy-wayfinder',
      status: 'active',
      source: source({
        workflow: 'story-wayfinder',
        sourceId: 'resolved:legacy-ending',
        sourceHash: 'sha256:legacy-wayfinder',
        approval: 'explicit',
      }),
    })
    await writeFile(ledgerPath, `${JSON.stringify({
      ...forgedEventBase(1, 'published'),
      id: 'event-legacy-wayfinder',
      dedupeKey: 'wayfinder:legacy:ending',
      record: legacyRecord,
      conflicts: [],
      supersededRecordIds: [],
    })}\n`, 'utf8')
    const beforeLedger = await readFile(ledgerPath, 'utf8')
    const beforeCanon = await readFile(canonPath, 'utf8')
    const beforeReview = await readFile(reviewPath, 'utf8')

    // A caller-supplied id that disagrees with project.json (e.g. a stale
    // library index) must not run the legacy migration or projection
    // repair under a lock keyed to the wrong id.
    const mismatched = await store.readSnapshot(projectPath, 'stale-index-project-id')

    expect(mismatched.projectId).toBe(projectId)
    expect(mismatched.records[0]).toMatchObject({ id: 'mem-legacy-wayfinder', status: 'active' })
    expect(await readFile(ledgerPath, 'utf8')).toBe(beforeLedger)
    expect(await readFile(canonPath, 'utf8')).toBe(beforeCanon)
    expect(await readFile(reviewPath, 'utf8')).toBe(beforeReview)

    // Regression: a matching id still performs migration and projection
    // repair exactly as before.
    const migrated = await store.readSnapshot(projectPath, projectId)
    expect(migrated.records[0]).toMatchObject({
      id: 'mem-legacy-wayfinder',
      status: 'candidate',
      source: { authority: { verification: 'legacy-unverified' } },
    })
    expect(await readFile(ledgerPath, 'utf8')).not.toBe(beforeLedger)
    expect(await readFile(reviewPath, 'utf8')).not.toBe(beforeReview)
  })

  it('promotes an eligible candidate through an explicit revision-checked action', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput({
      source: source({ approval: 'explicit' }),
    }))

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

  it('requires explicit source approval before promotion and appends no rejected action', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput())
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'promote',
      recordId: published.record.id,
      expectedRevision: 1,
      supersedes: [],
    })).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('promotes an explicitly approved Wayfinder candidate without verified authority, stamping promotion authority', async () => {
    // Ben's 2026-08-16 ruling: an explicit promote in review IS the
    // human-in-the-loop ratification. Import stays strict (no auto-canon
    // without verified hitl grill/sketch authority), but the review queue
    // must not be a dead end for explicitly approved wayfinder sources.
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput({
      source: source({
        workflow: 'story-wayfinder',
        approval: 'explicit',
        sourceHash: 'sha256:atom-like',
      }),
    }))
    expect(published.record.status).toBe('candidate')

    const snapshot = await store.applyAction(projectPath, {
      type: 'promote',
      recordId: published.record.id,
      expectedRevision: 1,
      supersedes: [],
    })

    expect(snapshot.records[0]).toMatchObject({
      id: published.record.id,
      status: 'active',
      source: {
        workflow: 'story-wayfinder',
        approval: 'explicit',
        authority: { verification: 'writeros-promotion' },
      },
    })
    expect(await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8'))
      .toContain('Mara leaves the island alone.')
    // Replay must reproduce the stamped record byte-for-byte.
    await expect(store.readSnapshot(projectPath)).resolves.toEqual(snapshot)
  })

  it('promotes AFK Wayfinder canon with explicit source approval, stamping promotion authority', async () => {
    // Flipped by Ben's 2026-08-16 ruling (was: reject). AFK ratification
    // alone still cannot activate canon at import time, but a human promote
    // in review supplies the missing in-the-loop step.
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const published = await store.publish(projectPath, publishInput({
      source: wayfinderSource('sketch', 'afk'),
    }))
    expect(published.record.status).toBe('candidate')

    const snapshot = await store.applyAction(projectPath, {
      type: 'promote',
      recordId: published.record.id,
      expectedRevision: 1,
      supersedes: [],
    })

    expect(snapshot.records[0]).toMatchObject({
      status: 'active',
      source: { authority: { verification: 'writeros-promotion' } },
    })
  })

  it('rejects publishing a source that forges promotion authority', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()

    await expect(store.publish(projectPath, publishInput({
      dedupeKey: 'wayfinder:forged-promotion-marker',
      requestedStatus: 'active',
      source: {
        ...source({ workflow: 'story-wayfinder', approval: 'explicit' }),
        authority: { verification: 'writeros-promotion' },
      } as MemorySource,
    }))).rejects.toThrow()
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

  it('does not let a document fact supersede active canon', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const canon = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:document:ending',
      kind: 'document_fact',
      source: source({ sourceId: 'document:ending', sourceHash: 'sha256:document' }),
      supersedes: [canon.record.id],
    }))).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('does not let canon supersede an active document fact', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const fact = await store.publish(projectPath, publishInput({
      kind: 'document_fact',
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:replacement',
      requestedStatus: 'active',
      source: source({ sourceId: 'canon:replacement', sourceHash: 'sha256:replacement', approval: 'explicit' }),
      supersedes: [fact.record.id],
    }))).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('does not promote canon by superseding an active document fact', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const fact = await store.publish(projectPath, publishInput({ kind: 'document_fact' }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'promote',
      recordId: candidate.record.id,
      expectedRevision: 2,
      supersedes: [fact.record.id],
    })).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('resolves canon versus document-fact conflicts without replacing either record class', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const canon = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const fact = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:document:ending',
      kind: 'document_fact',
      source: source({ sourceId: 'document:ending', sourceHash: 'sha256:document' }),
      conflictsWith: [canon.record.id],
    }))

    const resolved = await store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: fact.snapshot.conflicts[0].id,
      expectedRevision: 2,
      resolution: 'right',
    })

    expect(resolved.records.find(record => record.id === canon.record.id)?.status).toBe('active')
    expect(resolved.records.find(record => record.id === fact.record.id)?.status).toBe('active')
    expect(resolved.conflicts[0]).toMatchObject({ status: 'resolved', resolution: 'right' })
  })

  it.each([
    ['decision', 'left'],
    ['development', 'right'],
  ] as const)('resolves active %s conflicts by superseding the losing endpoint (%s wins)', async (kind, resolution) => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const left = await store.publish(projectPath, publishInput({
      dedupeKey: `writeros:${kind}:left`,
      kind,
      requestedStatus: 'active',
      source: source({ sourceId: `${kind}:left`, sourceHash: `sha256:${kind}-left` }),
    }))
    const right = await store.publish(projectPath, publishInput({
      dedupeKey: `writeros:${kind}:right`,
      kind,
      requestedStatus: 'active',
      source: source({ sourceId: `${kind}:right`, sourceHash: `sha256:${kind}-right` }),
      conflictsWith: [left.record.id],
    }))

    const resolved = await store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: right.snapshot.conflicts[0].id,
      expectedRevision: 2,
      resolution,
    })
    const winnerId = resolution === 'left' ? left.record.id : right.record.id
    const loserId = resolution === 'left' ? right.record.id : left.record.id

    expect(resolved.records.find(record => record.id === winnerId)).toMatchObject({
      status: 'active',
      supersedes: [loserId],
    })
    expect(resolved.records.find(record => record.id === loserId)?.status).toBe('superseded')
    expect(resolved.conflicts[0]).toMatchObject({ status: 'resolved', resolution })
    await expect(store.rebuild(projectPath)).resolves.toEqual(resolved)
  })

  it('rejects forged active-noncanon conflict arrays that do not match the selected endpoints', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const left = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:left',
      kind: 'decision',
      requestedStatus: 'active',
      source: source({ sourceId: 'decision:left', sourceHash: 'sha256:decision-left' }),
    }))
    const right = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:right',
      kind: 'decision',
      requestedStatus: 'active',
      source: source({ sourceId: 'decision:right', sourceHash: 'sha256:decision-right' }),
      conflictsWith: [left.record.id],
    }))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(3, 'conflict-resolved'),
      conflictId: right.snapshot.conflicts[0].id,
      resolution: 'left',
      activatedRecordIds: [left.record.id],
      supersededRecordIds: [right.record.id],
      rejectedRecordIds: [],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 3,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })

  it('blocks an active noncanon winner that still has another open conflict', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const winner = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:winner',
      kind: 'decision',
      requestedStatus: 'active',
      source: source({ sourceId: 'decision:winner', sourceHash: 'sha256:decision-winner' }),
    }))
    const first = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:first',
      kind: 'decision',
      requestedStatus: 'active',
      source: source({ sourceId: 'decision:first', sourceHash: 'sha256:decision-first' }),
      conflictsWith: [winner.record.id],
    }))
    await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:second',
      kind: 'decision',
      requestedStatus: 'active',
      source: source({ sourceId: 'decision:second', sourceHash: 'sha256:decision-second' }),
      conflictsWith: [winner.record.id],
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: first.snapshot.conflicts[0].id,
      expectedRevision: 3,
      resolution: 'left',
    })).rejects.toMatchObject({ code: 'unresolved-conflict' })
    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('rejects flagged noncanon conflict winners before appending an action', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const active = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:active',
      kind: 'decision',
      requestedStatus: 'active',
      source: source({ sourceId: 'decision:active', sourceHash: 'sha256:decision-active' }),
    }))
    const flagged = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:decision:flagged',
      kind: 'decision',
      safety: 'flagged',
      source: source({ sourceId: 'decision:flagged', sourceHash: 'sha256:decision-flagged' }),
      conflictsWith: [active.record.id],
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: flagged.snapshot.conflicts[0].id,
      expectedRevision: 2,
      resolution: 'right',
    })).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('blocks canon activation while the winner has another open conflict', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const left = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:left',
      requestedStatus: 'active',
      source: source({ sourceId: 'canon:left', sourceHash: 'sha256:left', approval: 'explicit' }),
    }))
    const other = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:other',
      requestedStatus: 'active',
      source: source({ sourceId: 'canon:other', sourceHash: 'sha256:other', approval: 'explicit' }),
    }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
      conflictsWith: [left.record.id, other.record.id],
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: candidate.snapshot.conflicts[0].id,
      expectedRevision: 3,
      resolution: 'right',
    })).rejects.toMatchObject({ code: 'unresolved-conflict' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('does not reactivate a rejected conflict endpoint', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const active = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
      conflictsWith: [active.record.id],
    }))
    await store.applyAction(projectPath, {
      type: 'reject',
      recordId: candidate.record.id,
      expectedRevision: 2,
    })
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: candidate.snapshot.conflicts[0].id,
      expectedRevision: 3,
      resolution: 'right',
    })).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
  })

  it('does not reactivate a superseded conflict endpoint', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const active = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:active',
      requestedStatus: 'active',
      source: source({ sourceId: 'canon:active', sourceHash: 'sha256:active', approval: 'explicit' }),
    }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
      conflictsWith: [active.record.id],
    }))
    await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:replacement',
      requestedStatus: 'active',
      source: source({ sourceId: 'canon:replacement', sourceHash: 'sha256:replacement', approval: 'explicit' }),
      supersedes: [active.record.id],
    }))
    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const before = await readFile(ledgerPath, 'utf8')

    await expect(store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: candidate.snapshot.conflicts[0].id,
      expectedRevision: 3,
      resolution: 'left',
    })).rejects.toMatchObject({ code: 'invalid-action' })

    expect(await readFile(ledgerPath, 'utf8')).toBe(before)
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

  it('rejects a forged replay promotion of a noncanon record', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const decision = await store.publish(projectPath, publishInput({
      kind: 'decision',
    }))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(2, 'promoted'),
      recordId: decision.record.id,
      supersededRecordIds: [],
      resolvedConflictIds: [],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 2,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })

  it('rejects a forged replay rejection of active canon', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const canon = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(2, 'rejected'),
      recordId: canon.record.id,
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 2,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })

  it('rejects forged replay promotion that names an arbitrary conflict', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const candidate = await store.publish(projectPath, publishInput({
      source: source({ approval: 'explicit' }),
    }))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(2, 'promoted'),
      recordId: candidate.record.id,
      supersededRecordIds: [],
      resolvedConflictIds: ['conflict-unrelated'],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 2,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })

  it('rejects forged replay promotion with a noncanonical duplicate mutation array', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const active = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
      conflictsWith: [active.record.id],
    }))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(3, 'promoted'),
      recordId: candidate.record.id,
      supersededRecordIds: [active.record.id, active.record.id],
      resolvedConflictIds: [candidate.snapshot.conflicts[0].id],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 3,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })

  it.each(['active', 'rejected', 'superseded'] as const)(
    'rejects forged replay reactivation of a %s canon record',
    async priorStatus => {
      const { projectPath } = await makeProject()
      const store = createProjectMemoryStore()
      let targetId: string
      let nextRevision: number

      if (priorStatus === 'active') {
        const active = await store.publish(projectPath, publishInput({
          requestedStatus: 'active',
          source: source({ approval: 'explicit' }),
        }))
        targetId = active.record.id
        nextRevision = 2
      } else if (priorStatus === 'rejected') {
        const candidate = await store.publish(projectPath, publishInput({
          source: source({ approval: 'explicit' }),
        }))
        await store.applyAction(projectPath, {
          type: 'reject',
          recordId: candidate.record.id,
          expectedRevision: 1,
        })
        targetId = candidate.record.id
        nextRevision = 3
      } else {
        const active = await store.publish(projectPath, publishInput({
          requestedStatus: 'active',
          source: source({ approval: 'explicit' }),
        }))
        await store.publish(projectPath, publishInput({
          dedupeKey: 'writeros:canon:replacement',
          requestedStatus: 'active',
          source: source({ sourceId: 'canon:replacement', sourceHash: 'sha256:replacement', approval: 'explicit' }),
          supersedes: [active.record.id],
        }))
        targetId = active.record.id
        nextRevision = 3
      }

      const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
      const projectionBefore = await readFile(snapshotPath, 'utf8')
      await appendLedgerLine(projectPath, {
        ...forgedEventBase(nextRevision, 'promoted'),
        recordId: targetId,
        supersededRecordIds: [],
        resolvedConflictIds: [],
      })

      await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
        code: 'corrupt-ledger',
        lineNumber: nextRevision,
      })
      expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
    },
  )

  it('rejects forged replay conflict arrays that mutate an unrelated record', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const active = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
      conflictsWith: [active.record.id],
    }))
    const unrelated = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:development:unrelated',
      kind: 'development',
      source: source({ sourceId: 'development:unrelated', sourceHash: 'sha256:unrelated' }),
    }))
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(4, 'conflict-resolved'),
      conflictId: candidate.snapshot.conflicts[0].id,
      resolution: 'right',
      activatedRecordIds: [unrelated.record.id],
      supersededRecordIds: [active.record.id],
      rejectedRecordIds: [candidate.record.id],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 4,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
  })

  it('rejects forged replay resolution of an already closed conflict', async () => {
    const { projectPath } = await makeProject()
    const store = createProjectMemoryStore()
    const active = await store.publish(projectPath, publishInput({
      requestedStatus: 'active',
      source: source({ approval: 'explicit' }),
    }))
    const candidate = await store.publish(projectPath, publishInput({
      dedupeKey: 'writeros:canon:candidate',
      source: source({ sourceId: 'canon:candidate', sourceHash: 'sha256:candidate', approval: 'explicit' }),
      conflictsWith: [active.record.id],
    }))
    const conflictId = candidate.snapshot.conflicts[0].id
    await store.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId,
      expectedRevision: 2,
      resolution: 'right',
    })
    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    const projectionBefore = await readFile(snapshotPath, 'utf8')
    await appendLedgerLine(projectPath, {
      ...forgedEventBase(4, 'conflict-resolved'),
      conflictId,
      resolution: 'not-conflict',
      activatedRecordIds: [],
      supersededRecordIds: [],
      rejectedRecordIds: [],
    })

    await expect(store.readSnapshot(projectPath)).rejects.toMatchObject({
      code: 'corrupt-ledger',
      lineNumber: 4,
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(projectionBefore)
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

  it('continues descriptor writes until a short-written ledger line is complete', async () => {
    const { projectPath } = await makeProject()
    let writeCount = 0
    const store = createProjectMemoryStore({
      testHooks: {
        async writeLedgerChunk(handle: FileHandle, buffer: Buffer, offset: number) {
          const length = Math.min(7, buffer.length - offset)
          const result = await handle.write(buffer, offset, length)
          writeCount += 1
          return result.bytesWritten
        },
      },
    })

    const published = await store.publish(projectPath, publishInput({ kind: 'development' }))
    const ledger = await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')

    expect(writeCount).toBeGreaterThan(1)
    expect(ledger.endsWith('\n')).toBe(true)
    expect(ledger.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(ledger).record.id).toBe(published.record.id)
    await expect(store.readSnapshot(projectPath)).resolves.toEqual(published.snapshot)
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
