import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { annotationStore, annotationIdFor, recordLanguageFingerprint } from '../../server/projectMemory/annotationStore'
import { AnnotationReplayError, applyAnnotationEvent, type AnnotationEvent, type AnnotationLogState } from '../../shared/projectMemoryAnnotations'
import { composeWhatsStanding } from '../../server/compose'
import { renderComposedMarkdown } from '../../server/compose/renderComposedMarkdown'

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

async function makePackage(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-ann-'))
  const projectPath = path.join(root, 'proj.writeros')
  await mkdir(projectPath, { recursive: true })
  await writeFile(path.join(projectPath, 'project.json'), JSON.stringify({
    schemaVersion: 1,
    projectId: PROJECT_ID,
    title: 'Annotation Fixture',
    format: 'feature',
    createdAt: '2026-08-13T20:00:00.000Z',
    updatedAt: '2026-08-13T20:00:00.000Z',
    openedAt: '2026-08-13T20:00:00.000Z',
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2))
  return projectPath
}

async function publishRecord(projectPath: string, dedupeKey: string, claim: string): Promise<void> {
  await projectMemoryStore.publish(projectPath, {
    projectId: PROJECT_ID,
    dedupeKey,
    kind: 'canon',
    requestedStatus: 'active',
    claim,
    source: {
      workflow: 'writeros',
      sourceId: dedupeKey,
      sourceUri: `writeros:${dedupeKey}`,
      sourceHash: 'a'.repeat(64),
      capturedAt: '2026-08-13T20:00:00.000Z',
      approval: 'explicit',
    },
  } as Parameters<typeof projectMemoryStore.publish>[1])
}

async function seeded(): Promise<{ projectPath: string }> {
  const projectPath = await makePackage()
  await publishRecord(projectPath, 'test:struck', 'STRUCK version of the engine. Superseded by beats 9-11.')
  await publishRecord(projectPath, 'test:beats', 'Beat sequence: 15 beats across three acts.')
  await publishRecord(projectPath, 'test:clean', 'The crime boss is Vincent Marcelli.')
  return { projectPath }
}

describe('question derivation', () => {
  it('derives a question per cue and none for clean records', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)

    // The struck record carries two cues (struck, superseded-by); the clean records none.
    expect(questions.length).toBe(2)
    for (const q of questions) {
      expect(q.status).toBe('new')
      expect(q.candidateRecordIds.length).toBe(2) // everyone but the referencing record
      expect(q.questionText).toContain(q.locator.phrase)
    }
  })

  it('derives the same annotation id for the same phrase across runs', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const first = await annotationStore.pendingQuestions(projectPath, snapshot)
    const second = await annotationStore.pendingQuestions(projectPath, snapshot)
    expect(first.map(q => q.annotationId)).toEqual(second.map(q => q.annotationId))
  })
})

describe('answering', () => {
  it('approve resolves the reference and the report shows it', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    expect(q).toBeDefined()
    if (!q) return
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) return

    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.approve(projectPath, snapshot, q.annotationId, [beats.id], 'run-1')

    const annotations = await annotationStore.state(projectPath)
    expect(annotations.revision).toBe(2)
    expect(annotations.annotations.get(q.annotationId)?.status).toBe('approved')

    const result = composeWhatsStanding({ snapshot, runId: 'run-1', annotations })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const markdown = renderComposedMarkdown(result.composed)
    expect(markdown).toContain('You resolved this: it refers to')
    expect(markdown).toContain('Beat sequence: 15 beats across three acts.')
    expect(result.composed.run?.annotationRevision).toBe(2)
    // The referent citation must be valid, not dangling.
    expect(result.composed.fidelity.status).toBe('clean')
  })

  it('rejects a referent outside the proposal candidates', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await expect(
      annotationStore.approve(projectPath, snapshot, q.annotationId, ['mem_not_a_candidate'], 'run-1'),
    ).rejects.toThrow()
  })

  it('a decline is durable: the question is not re-asked', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const before = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = before[0]
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')

    const after = await annotationStore.pendingQuestions(projectPath, snapshot)
    expect(after.map(x => x.annotationId)).not.toContain(q.annotationId)
    expect(after.length).toBe(before.length - 1)
  })

  it("cant-say also suppresses re-asking but keeps nothing resolved", async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'cant-say', 'run-1')

    const annotations = await annotationStore.state(projectPath)
    const state = annotations.annotations.get(q.annotationId)
    expect(state?.status).toBe('declined')
    expect(state?.declineReason).toBe('cant-say')
    expect(state?.referentRecordIds).toBeUndefined()
  })

  it('never touches the memory ledger or projections', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    // Settle projections first so the comparison is against a stable baseline.
    await projectMemoryStore.readSnapshot(projectPath)
    const ledgerBefore = await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')
    const canonBefore = await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8')

    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')

    expect(await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')).toBe(ledgerBefore)
    expect(await readFile(path.join(projectPath, 'memory', 'canon.md'), 'utf8')).toBe(canonBefore)
  })
})

describe('replay integrity', () => {
  function baseState(): AnnotationLogState {
    return { projectId: PROJECT_ID, revision: 0, annotations: new Map() }
  }
  const locator = {
    recordId: 'mem-1',
    field: 'claim' as const,
    sentence: 'Superseded by beats 9-11.',
    phrase: 'Superseded by beats 9-11',
    occurrence: 0,
    cue: 'superseded-by',
  }
  const fingerprint = { recordId: 'mem-1', contentHash: 'a'.repeat(64) }
  const proposed: AnnotationEvent = {
    type: 'annotation-proposed',
    projectId: PROJECT_ID,
    annotationId: annotationIdFor(locator),
    annotationRevision: 1,
    at: '2026-08-13T20:00:00.000Z',
    questionType: 'resolve-reference',
    locator,
    candidateRecordIds: ['mem-2'],
    support: [fingerprint],
    runId: 'run-1',
  }

  it('rejects approval of an unknown annotation', () => {
    const approve: AnnotationEvent = {
      type: 'annotation-approved',
      projectId: PROJECT_ID,
      annotationId: 'ann_unknown',
      annotationRevision: 1,
      at: '2026-08-13T20:00:00.000Z',
      referentRecordIds: ['mem-2'],
      support: [fingerprint],
      actor: 'writer',
      runId: 'run-1',
    }
    expect(() => applyAnnotationEvent(baseState(), approve, 1)).toThrow(AnnotationReplayError)
  })

  it('rejects a revision gap', () => {
    const gapped = { ...proposed, annotationRevision: 2 }
    expect(() => applyAnnotationEvent(baseState(), gapped, 1)).toThrow(/revision 2 does not follow 0/)
  })

  it('rejects double approval', () => {
    let state = applyAnnotationEvent(baseState(), proposed, 1)
    const approve: AnnotationEvent = {
      type: 'annotation-approved',
      projectId: PROJECT_ID,
      annotationId: proposed.annotationId,
      annotationRevision: 2,
      at: '2026-08-13T20:00:01.000Z',
      referentRecordIds: ['mem-2'],
      support: [fingerprint],
      actor: 'writer',
      runId: 'run-1',
    }
    state = applyAnnotationEvent(state, approve, 2)
    const again = { ...approve, annotationRevision: 3 }
    expect(() => applyAnnotationEvent(state, again, 3)).toThrow(/not legal from status "approved"/)
  })

  it('halts replay at a corrupt line with its line number', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const good = await readFile(filePath, 'utf8')
    await writeFile(filePath, `${good}{not json\n`)
    await expect(annotationStore.state(projectPath)).rejects.toThrow(/annotations\.jsonl:2/)
  })

  it('fingerprints cover language only, never standing', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const record = snapshot.records[0]
    const base = recordLanguageFingerprint(record)
    const statusFlipped = recordLanguageFingerprint({ ...record, status: 'superseded' as typeof record.status, supersedes: ['mem-x'] })
    const claimEdited = recordLanguageFingerprint({ ...record, claim: `${record.claim} edited` })
    expect(statusFlipped.contentHash).toBe(base.contentHash)
    expect(claimEdited.contentHash).not.toBe(base.contentHash)
  })
})
