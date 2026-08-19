import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { annotationStore, annotationIdFor, recordLanguageFingerprint, questionVersionFor, derivePendingQuestions, AnnotationStoreError } from '../../server/projectMemory/annotationStore'
import { AnnotationReplayError, applyAnnotationEvent, type AnnotationEvent, type AnnotationLogState, type AnnotationState } from '../../shared/projectMemoryAnnotations'
import { composeWhatsStanding } from '../../server/compose'
import { renderComposedMarkdown } from '../../server/compose/renderComposedMarkdown'
import { runProjectMemoryCli } from '../../server/projectMemory/cli'

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

async function publishRecord(
  projectPath: string,
  dedupeKey: string,
  claim: string,
  options: { supersedes?: string[]; kind?: 'canon' | 'development' } = {},
): Promise<void> {
  await projectMemoryStore.publish(projectPath, {
    projectId: PROJECT_ID,
    dedupeKey,
    kind: options.kind ?? 'canon',
    requestedStatus: 'active',
    claim,
    ...(options.supersedes !== undefined ? { supersedes: options.supersedes } : {}),
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

async function expectLogUnchanged(projectPath: string, run: () => Promise<unknown>) {
  const file = path.join(projectPath, 'memory', 'annotations.jsonl')
  const before = await readFile(file, 'utf8').catch(() => '')
  await expect(run()).rejects.toBeInstanceOf(AnnotationStoreError)
  expect(await readFile(file, 'utf8').catch(() => '')).toBe(before)
}

/**
 * Proposes and approves the 'superseded-by' question against the beat-sequence record — the
 * shared starting fixture for invalidation tests. File-scoped (not inside a describe) so
 * later slices (Task 6) can reuse it without duplicating the setup.
 */
async function approveOne(projectPath: string) {
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
  const q = questions.find(x => x.locator.cue === 'superseded-by')
  const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
  if (!q || !beats) throw new Error('fixture missing')
  await annotationStore.answerQuestion(projectPath, {
    annotationId: q.annotationId, questionVersion: questionVersionFor(snapshot, q),
    answer: { kind: 'referents', recordIds: [beats.id] }, runId: 'run-1',
  })
  return { snapshot, annotationId: q.annotationId }
}

/** Tampers the first annotation-approved event's support[0] hash, staling the annotation. */
async function tamperApprovedSupport(projectPath: string) {
  const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
  const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
  const approved = lines.find(l => l.type === 'annotation-approved')
  approved.support[0].contentHash = 'b'.repeat(64)
  await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
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
    // The referent citation must be valid, not dangling. The struck cue on the same record
    // is still unanswered, so the report is INCOMPLETE — but only for that reason.
    const kinds = result.composed.fidelity.warnings.map(w => w.kind)
    expect(kinds).not.toContain('dangling_source_id')
    expect(kinds.every(k => k === 'unresolved_reference')).toBe(true)
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

  it('refuses — without poisoning the log — a referent that exists but was never offered', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')

    // The referencing record itself: present in memory, deliberately excluded from the
    // candidate list. Before the preflight this was appended durably and then rejected on
    // replay, which made the whole log unreadable.
    await expect(
      annotationStore.approve(projectPath, snapshot, q.annotationId, [q.locator.recordId], 'run-1'),
    ).rejects.toThrow(/not among the proposal's candidates/)

    // The log is still replayable and the question still answerable.
    const state = await annotationStore.state(projectPath)
    expect(state.revision).toBe(1)
    expect(state.annotations.get(q.annotationId)?.status).toBe('proposed')
    const approved = await annotationStore.approve(
      projectPath, snapshot, q.annotationId, [q.candidateRecordIds[0]], 'run-1')
    expect(approved.status).toBe('approved')
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

describe('run consistency', () => {
  it('an unrelated publish between question and answer does not block the answer', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!q || !beats) throw new Error('fixture missing')

    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    // Memory moves for a reason unrelated to this question. The stale snapshot's premise
    // still holds — language fingerprints, not the global revision, decide.
    await publishRecord(projectPath, 'test:unrelated', 'A new unrelated decision.')
    const state = await annotationStore.approve(projectPath, snapshot, q.annotationId, [beats.id], 'run-1')
    expect(state.status).toBe('approved')
  })

  it('a status-only change to the referent does not block the answer either', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!q || !beats) throw new Error('fixture missing')

    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await publishRecord(projectPath, 'test:beats-v2', 'Beat sequence v2: 16 beats.', { supersedes: [beats.id] })
    const state = await annotationStore.approve(projectPath, snapshot, q.annotationId, [beats.id], 'run-1')
    expect(state.status).toBe('approved')
  })

  it('refuses an answer when the questioned wording has moved', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!q || !beats) throw new Error('fixture missing')
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')

    // Records are immutable today, so simulate the future edit path the check defends
    // against: a proposal whose captured fingerprint no longer matches the record.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n')
    const event = JSON.parse(lines[0]) as { support: { contentHash: string }[] }
    event.support[0].contentHash = 'b'.repeat(64)
    await writeFile(filePath, `${JSON.stringify(event)}\n`)

    await expect(
      annotationStore.approve(projectPath, snapshot, q.annotationId, [beats.id], 'run-1'),
    ).rejects.toThrow(/wording .* has changed/)
    await expect(
      annotationStore.decline(projectPath, snapshot, q.annotationId, 'cant-say', 'run-1'),
    ).rejects.toThrow(/wording .* has changed/)
  })

  it('refuses to propose from a stale snapshot when the question no longer exists', async () => {
    const { projectPath } = await seeded()
    const stale = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, stale)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const struck = stale.records.find(r => r.claim.startsWith('STRUCK'))
    if (!q || !struck) throw new Error('fixture missing')

    // The referencing record leaves the displayed set; its questions die with it.
    await publishRecord(projectPath, 'test:replacement', 'The replacement engine.', { supersedes: [struck.id] })
    await expect(
      annotationStore.propose(projectPath, stale, q.annotationId, 'run-1'),
    ).rejects.toThrow(/questions command again/)
  })
})

describe('question scope and shape', () => {
  it('asks nothing about records the report never displays', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const base = snapshot.records[0]
    const hidden = { ...base, id: 'mem-hidden', kind: 'development' as typeof base.kind, claim: 'Superseded by beats 9-11.' }
    const withHidden = { ...snapshot, records: [...snapshot.records, hidden] }
    const questions = await annotationStore.pendingQuestions(projectPath, withHidden)
    expect(questions.some(x => x.locator.recordId === 'mem-hidden')).toBe(false)
  })

  it('a question with no candidates can still be answered cant-say', async () => {
    const projectPath = await makePackage()
    await publishRecord(projectPath, 'test:only', 'The only decision. Superseded by beats 9-11.')
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    expect(questions).toHaveLength(1)
    const [q] = questions
    expect(q.candidateRecordIds).toEqual([])
    expect(q.questionText).toContain('cant-say')

    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    const state = await annotationStore.decline(projectPath, snapshot, q.annotationId, 'cant-say', 'run-1')
    expect(state.status).toBe('declined')
    expect(state.declineReason).toBe('cant-say')
  })

  it('persists a phraseHash on new proposals and replays old events without one', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')

    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const written = JSON.parse((await readFile(filePath, 'utf8')).trim()) as { locator: { phraseHash?: string } }
    expect(written.locator.phraseHash).toMatch(/^[0-9a-f]{64}$/)

    // A log written before phraseHash existed must still replay.
    const legacy = JSON.parse(JSON.stringify(written)) as { locator: { phraseHash?: string } }
    delete legacy.locator.phraseHash
    await writeFile(filePath, `${JSON.stringify(legacy)}\n`)
    const state = await annotationStore.state(projectPath)
    expect(state.annotations.get(q.annotationId)?.status).toBe('proposed')
  })
})

describe('declined re-propose gate', () => {
  it('refuses to re-propose a declined question whose wording has not moved', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')

    const file = path.join(projectPath, 'memory', 'annotations.jsonl')
    const before = await readFile(file, 'utf8')

    await expect(
      annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-2')
    ).rejects.toMatchObject({ reason: 'conflict' })

    // Verify log is unchanged
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('re-proposes a declined question once its stored support no longer matches', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')

    // Simulate drift: rewrite the decline event's support hash (the log is data;
    // records themselves are immutable through the API).
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const decline = lines.find(l => l.type === 'annotation-declined')
    if (!decline) throw new Error('decline event not found')
    decline.support[0].contentHash = 'b'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const state = await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-2')
    expect(state.status).toBe('proposed')
  })
})

describe('invalidation aftermath', () => {
  it('an invalidated question is asked again and can be re-proposed', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!q || !beats) throw new Error('fixture missing')
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.approve(projectPath, snapshot, q.annotationId, [beats.id], 'run-1')

    // No producer writes invalidation yet — that is the next slice — so append the event
    // by hand: the replay rules and the re-ask path must already cope with it.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    await appendFile(filePath, `${JSON.stringify({
      type: 'annotation-invalidated',
      projectId: PROJECT_ID,
      annotationId: q.annotationId,
      annotationRevision: 3,
      at: '2026-08-18T20:00:00.000Z',
      cause: 'language-changed',
      changedRecordId: q.locator.recordId,
    })}\n`)

    const state = await annotationStore.state(projectPath)
    expect(state.annotations.get(q.annotationId)?.status).toBe('invalidated')

    const reasked = await annotationStore.pendingQuestions(projectPath, snapshot)
    const again = reasked.find(x => x.annotationId === q.annotationId)
    expect(again?.status).toBe('new')

    const reproposed = await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-2')
    expect(reproposed.status).toBe('proposed')
    expect((await annotationStore.state(projectPath)).revision).toBe(4)
  })
})

describe('invalidation producer', () => {
  it('invalidates a stale approved annotation with cause and both hashes', async () => {
    const { projectPath } = await seeded()
    const { annotationId } = await approveOne(projectPath)
    await tamperApprovedSupport(projectPath)
    const result = await annotationStore.invalidateStale(projectPath)
    expect(result).toEqual([{ annotationId, cause: 'language-changed', changedRecordId: expect.any(String) }])
    const state = await annotationStore.state(projectPath)
    expect(state.annotations.get(annotationId)?.status).toBe('invalidated')
    // consumer-path integration: the question is open again
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const reasked = await annotationStore.pendingQuestions(projectPath, snapshot)
    expect(reasked.some(x => x.annotationId === annotationId && x.status === 'new')).toBe(true)
  })

  it('two stale approved annotations invalidate together, sequential revisions in annotationId-sorted order', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    // The struck record carries two cues (struck, superseded-by) — both have candidates here.
    expect(questions.length).toBe(2)
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) throw new Error('fixture missing')

    for (const q of questions) {
      await annotationStore.answerQuestion(projectPath, {
        annotationId: q.annotationId, questionVersion: questionVersionFor(snapshot, q),
        answer: { kind: 'referents', recordIds: [beats.id] }, runId: 'run-1',
      })
    }

    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const approvedEvents = lines.filter(l => l.type === 'annotation-approved')
    expect(approvedEvents.length).toBe(2)
    for (const e of approvedEvents) e.support[0].contentHash = 'b'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const stateBefore = await annotationStore.state(projectPath)
    const result = await annotationStore.invalidateStale(projectPath)
    expect(result.length).toBe(2)

    const sortedIds = questions.map(q => q.annotationId).sort()
    const after = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const tail = after.slice(-2)
    expect(tail.every((e: { type: string }) => e.type === 'annotation-invalidated')).toBe(true)
    expect(tail.map((e: { annotationId: string }) => e.annotationId)).toEqual(sortedIds)
    expect(tail[0].annotationRevision).toBe(stateBefore.revision + 1)
    expect(tail[1].annotationRevision).toBe(stateBefore.revision + 2)
    expect(result.map(r => r.annotationId)).toEqual(sortedIds)
  })

  it('declined and proposed annotations are untouched by the sweep even when their support is tampered', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    expect(questions.length).toBe(2)
    const [first, second] = questions
    await annotationStore.propose(projectPath, snapshot, first.annotationId, 'run-1')
    await annotationStore.propose(projectPath, snapshot, second.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, second.annotationId, 'declined', 'run-1')
    // first stays 'proposed', second is 'declined' — neither is 'approved'.

    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    for (const l of lines) {
      if (l.type === 'annotation-proposed' || l.type === 'annotation-declined') {
        l.support[0].contentHash = 'b'.repeat(64)
      }
    }
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const before = await readFile(filePath, 'utf8')
    expect(await annotationStore.invalidateStale(projectPath)).toEqual([])
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })

  it('is a no-op on a clean log: returns [], log byte-identical', async () => {
    const { projectPath } = await seeded()
    await approveOne(projectPath)
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const before = await readFile(filePath, 'utf8')
    expect(await annotationStore.invalidateStale(projectPath)).toEqual([])
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })

  it('sweeps automatically when a different question is answered, in one batch', async () => {
    const { projectPath } = await seeded()
    const { annotationId } = await approveOne(projectPath)          // superseded-by question
    await tamperApprovedSupport(projectPath)
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const others = await annotationStore.pendingQuestions(projectPath, snapshot)
    const other = others.find(x => x.annotationId !== annotationId)  // the struck question
    if (!other) throw new Error('fixture missing')
    await annotationStore.answerQuestion(projectPath, {
      annotationId: other.annotationId, questionVersion: questionVersionFor(snapshot, other),
      answer: { kind: 'decline' }, runId: 'run-2',
    })
    const state = await annotationStore.state(projectPath)
    expect(state.annotations.get(annotationId)?.status).toBe('invalidated')
    expect(state.annotations.get(other.annotationId)?.status).toBe('declined')
  })

  it('a failed answer aborts the whole batch — no invalidation events either', async () => {
    const { projectPath } = await seeded()
    const { annotationId } = await approveOne(projectPath)
    await tamperApprovedSupport(projectPath)
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const others = await annotationStore.pendingQuestions(projectPath, snapshot)
    const other = others.find(x => x.annotationId !== annotationId)
    if (!other) throw new Error('fixture missing')
    await expectLogUnchanged(projectPath, () => annotationStore.answerQuestion(projectPath, {
      annotationId: other.annotationId, questionVersion: 'f'.repeat(64),
      answer: { kind: 'decline' }, runId: 'run-2',
    }))
    expect((await annotationStore.state(projectPath)).annotations.get(annotationId)?.status).toBe('approved')
  })

  it('never invalidates on a status flip or unrelated publish', async () => {
    const { projectPath } = await seeded()
    const { snapshot, annotationId } = await approveOne(projectPath)
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) throw new Error('fixture missing')
    await publishRecord(projectPath, 'test:beats-v2', 'Beat sequence v2.', { supersedes: [beats.id] })
    await publishRecord(projectPath, 'test:unrelated', 'A new unrelated decision.')
    expect(await annotationStore.invalidateStale(projectPath)).toEqual([])
    expect((await annotationStore.state(projectPath)).annotations.get(annotationId)?.status).toBe('approved')
  })

  it('invalidates via a stale referent fingerprint (support[1]), not just the referencing record', async () => {
    const { projectPath } = await seeded()
    const { snapshot, annotationId } = await approveOne(projectPath)
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) throw new Error('fixture missing')

    // Tamper the REFERENT's fingerprint (support[1]), leaving the referencing record's
    // fingerprint (support[0]) untouched — proves staleness detection isn't hardcoded to
    // support[0], and that changedRecordId correctly names the referent, not the referencer.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const approved = lines.find(l => l.type === 'annotation-approved')
    const referentIndex = approved.support.findIndex((s: { recordId: string }) => s.recordId === beats.id)
    if (referentIndex < 0) throw new Error('referent fingerprint not found in support')
    approved.support[referentIndex].contentHash = 'c'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const result = await annotationStore.invalidateStale(projectPath)
    expect(result).toEqual([{ annotationId, cause: 'language-changed', changedRecordId: beats.id }])
  })

  it('invalidates an approved annotation via log-walking even when no current cue would derive its id', async () => {
    const { projectPath } = await seeded()
    const { annotationId } = await approveOne(projectPath)
    await tamperApprovedSupport(projectPath)

    // Rewrite the proposal event's locator so no cue the current memory produces would ever
    // derive this annotationId again — proves invalidateStale walks state.annotations
    // directly rather than re-deriving cues (cueQuestions/findCues) to decide what to sweep.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const proposal = lines.find(l => l.type === 'annotation-proposed')
    if (!proposal) throw new Error('proposal event not found')
    proposal.locator.phrase = 'a phrase absent from every record in this memory'
    proposal.locator.sentence = 'a sentence absent from every record in this memory too.'
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const result = await annotationStore.invalidateStale(projectPath)
    expect(result).toEqual([{ annotationId, cause: 'language-changed', changedRecordId: expect.any(String) }])
    const state = await annotationStore.state(projectPath)
    expect(state.annotations.get(annotationId)?.status).toBe('invalidated')
  })

  it("propose self-heals an approved-stale annotation via its own sweep: invalidate then re-propose, one call", async () => {
    const { projectPath } = await seeded()
    const { snapshot, annotationId } = await approveOne(projectPath)
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) throw new Error('fixture missing')

    // Tamper the REFERENT's fingerprint (support[1]) only — the referencing record (STRUCK)
    // is untouched, so its cue still derives this same annotationId in `current`.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const approved = lines.find(l => l.type === 'annotation-approved')
    const referentIndex = approved.support.findIndex((s: { recordId: string }) => s.recordId === beats.id)
    if (referentIndex < 0) throw new Error('referent fingerprint not found in support')
    approved.support[referentIndex].contentHash = 'd'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const result = await annotationStore.propose(projectPath, snapshot, annotationId, 'run-2')
    expect(result.status).toBe('proposed')

    const after = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const tail = after.slice(-2)
    expect(tail[0].type).toBe('annotation-invalidated')
    expect(tail[0].annotationId).toBe(annotationId)
    expect(tail[1].type).toBe('annotation-proposed')
    expect(tail[1].annotationId).toBe(annotationId)
    expect(tail[1].annotationRevision).toBe(tail[0].annotationRevision + 1)
  })

  it("propose's idempotent early return still appends a sweep for a DIFFERENT stale annotation", async () => {
    const { projectPath } = await seeded()
    const { annotationId: approvedId } = await approveOne(projectPath) // 'superseded-by', approved

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const others = await annotationStore.pendingQuestions(projectPath, snapshot)
    const other = others.find(x => x.annotationId !== approvedId) // the still-open 'struck' question
    if (!other) throw new Error('fixture missing')

    // Get `other` into 'proposed' status BEFORE staling the approved annotation, so this
    // first propose call's own sweep has nothing to do yet.
    await annotationStore.propose(projectPath, snapshot, other.annotationId, 'run-1')
    await tamperApprovedSupport(projectPath)

    // Re-proposing an ALREADY-proposed question hits the idempotent early return. Before the
    // fix this silently dropped the sweep it had already preflighted.
    const result = await annotationStore.propose(projectPath, snapshot, other.annotationId, 'run-2')
    expect(result.status).toBe('proposed')

    const state = await annotationStore.state(projectPath)
    expect(state.annotations.get(approvedId)?.status).toBe('invalidated')

    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const last = lines[lines.length - 1]
    expect(last.type).toBe('annotation-invalidated')
    expect(last.annotationId).toBe(approvedId)
  })

  it('answerQuestion self-heals an approved-stale annotation via its own sweep, in the same call', async () => {
    const { projectPath } = await seeded()
    const { snapshot, annotationId } = await approveOne(projectPath)
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) throw new Error('fixture missing')

    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const approved = lines.find(l => l.type === 'annotation-approved')
    const referentIndex = approved.support.findIndex((s: { recordId: string }) => s.recordId === beats.id)
    if (referentIndex < 0) throw new Error('referent fingerprint not found in support')
    approved.support[referentIndex].contentHash = 'e'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    // Compute the questionVersion the way the store's own sweep will re-derive it: simulate
    // the approved -> invalidated flip on a local copy of state, then run the SAME exported
    // derivePendingQuestions the store uses internally, against the SAME current snapshot.
    const current = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const state = await annotationStore.state(projectPath)
    const existing = state.annotations.get(annotationId) as AnnotationState
    const swept: AnnotationLogState = {
      ...state,
      annotations: new Map(state.annotations).set(annotationId, { ...existing, status: 'invalidated' }),
    }
    const question = derivePendingQuestions(swept, current).find(q => q.annotationId === annotationId)
    if (!question) throw new Error('question was not re-derived from the simulated sweep')
    const version = questionVersionFor(current, question)

    const result = await annotationStore.answerQuestion(projectPath, {
      annotationId, questionVersion: version,
      answer: { kind: 'decline' }, runId: 'run-2',
    })
    expect(result.status).toBe('declined')

    // The full chain landed in one call: invalidate -> propose -> decline, appended together.
    const tail = (await readFile(filePath, 'utf8')).trim().split('\n').slice(-3).map(l => JSON.parse(l))
    expect(tail.map((e: { type: string }) => e.type))
      .toEqual(['annotation-invalidated', 'annotation-proposed', 'annotation-declined'])
    expect(tail.every((e: { annotationId: string }) => e.annotationId === annotationId)).toBe(true)
  })

  it('writes a sweep + proposal + settlement multi-event batch in one answerQuestion call, matching the sequential-append log', async () => {
    const { projectPath } = await seeded()
    const { annotationId } = await approveOne(projectPath) // 'superseded-by' — proposed + approved
    await tamperApprovedSupport(projectPath) // corrupts support[0] (the referencing record's own
    // captured fingerprint), staling THIS annotation while the record's actual current text —
    // and so the cue that derives its annotationId — is untouched.

    const current = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const state = await annotationStore.state(projectPath)
    const existing = state.annotations.get(annotationId) as AnnotationState
    // Simulate the sweep's flip locally to re-derive the same 'new' question the store's own
    // sweep will produce, exactly as the existing self-heal test above does.
    const swept: AnnotationLogState = {
      ...state,
      annotations: new Map(state.annotations).set(annotationId, { ...existing, status: 'invalidated' }),
    }
    const question = derivePendingQuestions(swept, current).find(q => q.annotationId === annotationId)
    if (!question) throw new Error('question was not re-derived from the simulated sweep')
    const version = questionVersionFor(current, question)
    const beats = current.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!beats) throw new Error('fixture missing')

    const result = await annotationStore.answerQuestion(projectPath, {
      annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: [beats.id] }, runId: 'run-2',
    })
    expect(result.status).toBe('approved')

    // One batch write landed three events — sweep's invalidation, then this call's own
    // proposal and settlement — on top of approveOne's earlier propose + approve. The parsed
    // lines and revisions are exactly what appending each event separately would have
    // produced; byte-format equivalence (one JSON line per event, newline-terminated) is
    // covered by the untouched replay tests passing against this same batched writer.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    expect(lines.length).toBe(5)
    const tail = lines.slice(-3)
    expect(tail.map((e: { type: string }) => e.type))
      .toEqual(['annotation-invalidated', 'annotation-proposed', 'annotation-approved'])
    expect(tail.every((e: { annotationId: string }) => e.annotationId === annotationId)).toBe(true)
    expect(tail.map((e: { annotationRevision: number }) => e.annotationRevision)).toEqual([3, 4, 5])

    const finalState = await annotationStore.state(projectPath)
    expect(finalState.revision).toBe(5)
    expect(finalState.annotations.get(annotationId)?.status).toBe('approved')
    expect(finalState.annotations.get(annotationId)?.referentRecordIds).toEqual([beats.id])
  })
})

describe('declined re-ask', () => {
  it('a stale declined question re-derives as new, with fresh candidates', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')

    // Tamper the decline event's support hash in the log — simulates the language it was
    // judged against having moved since.
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const decline = lines.find(l => l.type === 'annotation-declined')
    if (!decline) throw new Error('decline event not found')
    decline.support[0].contentHash = 'b'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    const reasked = await annotationStore.pendingQuestions(projectPath, snapshot)
    const again = reasked.find(x => x.annotationId === q.annotationId)
    expect(again?.status).toBe('new')
    expect(again?.candidateRecordIds).toEqual(q.candidateRecordIds)
    expect(again?.questionText).toBe(q.questionText)
  })

  it('a stale declined question can be settled end-to-end through answerQuestion', async () => {
    const { projectPath } = await seeded()
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
    await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
    await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')

    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const decline = lines.find(l => l.type === 'annotation-declined')
    if (!decline) throw new Error('decline event not found')
    decline.support[0].contentHash = 'b'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')

    // The end-to-end path this amendment enables: pendingQuestions re-asks it as 'new', and
    // answerQuestion's gate — which allows stale declines through — settles it.
    const currentSnapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const reasked = await annotationStore.pendingQuestions(projectPath, currentSnapshot)
    const again = reasked.find(x => x.annotationId === q.annotationId)
    if (!again) throw new Error('question was not re-asked')
    expect(again.status).toBe('new')

    const version = questionVersionFor(currentSnapshot, again)
    const state = await annotationStore.answerQuestion(projectPath, {
      annotationId: again.annotationId, questionVersion: version,
      answer: { kind: 'decline' }, runId: 'run-2',
    })
    expect(state.status).toBe('declined')
    expect(state.declineReason).toBe('declined')
  })
})

describe('report command', () => {
  it('prints INCOMPLETE while questions are open and drops it once they are settled', async () => {
    const { projectPath } = await seeded()
    const run = async (): Promise<string> => {
      const out: string[] = []
      const code = await runProjectMemoryCli(
        ['report', '--project', projectPath],
        { stdout: (v: string) => out.push(v), stderr: (v: string) => out.push(v) },
      )
      expect(code).toBe(0)
      return out.join('')
    }

    expect(await run()).toContain('INCOMPLETE')

    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    for (const q of await annotationStore.pendingQuestions(projectPath, snapshot)) {
      await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
      await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')
    }
    expect(await run()).not.toContain('INCOMPLETE')
  })
})

describe('invalidate command', () => {
  it('reports and writes invalidations when stale, and says so when clean', async () => {
    const { projectPath } = await seeded()
    const run = async () => {
      const out: string[] = []
      const code = await runProjectMemoryCli(
        ['invalidate', '--project', projectPath],
        { stdout: (v: string) => out.push(v), stderr: (v: string) => out.push(v) },
      )
      return { code, text: out.join('') }
    }
    const clean = await run()
    expect(clean.code).toBe(0)
    expect(clean.text).toContain('Nothing to invalidate')
    // approve then tamper (reuse the producer describe's helpers)
    await approveOne(projectPath)
    await tamperApprovedSupport(projectPath)
    const stale = await run()
    expect(stale.code).toBe(0)
    expect(stale.text).toContain('Invalidated ann_')
    expect(stale.text).toContain('language-changed')
  })

  it('says "Nothing to invalidate" and leaves the log byte-identical when the approved annotation is fresh', async () => {
    const { projectPath } = await seeded()
    await approveOne(projectPath) // approved, not tampered — nothing stale to sweep
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const before = await readFile(filePath, 'utf8')

    const out: string[] = []
    const code = await runProjectMemoryCli(
      ['invalidate', '--project', projectPath],
      { stdout: (v: string) => out.push(v), stderr: (v: string) => out.push(v) },
    )
    expect(code).toBe(0)
    expect(out.join('')).toContain('Nothing to invalidate')
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })
})

describe('answerQuestion transaction', () => {
  async function openQuestion(projectPath: string) {
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!q || !beats) throw new Error('fixture missing')
    return { snapshot, q, beats, version: questionVersionFor(snapshot, q) }
  }

  it('settles a new question with referents in one call: propose + approve appended together', async () => {
    const { projectPath } = await seeded()
    const { q, beats, version } = await openQuestion(projectPath)
    const state = await annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: [beats.id] }, runId: 'run-1',
    })
    expect(state.status).toBe('approved')
    expect((await annotationStore.state(projectPath)).revision).toBe(2) // proposal + approval
  })

  it('records cant-say and decline through the same transaction', async () => {
    const { projectPath } = await seeded()
    const { q, version } = await openQuestion(projectPath)
    const state = await annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'cant-say' }, runId: 'run-1',
    })
    expect(state.status).toBe('declined')
    expect(state.declineReason).toBe('cant-say')
  })

  it("records { kind: 'decline' } with declineReason 'declined'", async () => {
    const { projectPath } = await seeded()
    const { q, version } = await openQuestion(projectPath)
    const state = await annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'decline' }, runId: 'run-1',
    })
    expect(state.status).toBe('declined')
    expect(state.declineReason).toBe('declined')
  })

  it('refuses a stale questionVersion and leaves the log byte-identical', async () => {
    const { projectPath } = await seeded()
    const { q } = await openQuestion(projectPath)
    await expectLogUnchanged(projectPath, () => annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: 'f'.repeat(64),
      answer: { kind: 'decline' }, runId: 'run-1',
    }))
  })

  it('refuses an unknown annotationId and leaves the log byte-identical', async () => {
    const { projectPath } = await seeded()
    await expectLogUnchanged(projectPath, () => annotationStore.answerQuestion(projectPath, {
      annotationId: 'ann_does_not_exist', questionVersion: 'f'.repeat(64),
      answer: { kind: 'decline' }, runId: 'run-1',
    }))
  })

  it('refuses an empty referent list and leaves the log byte-identical', async () => {
    const { projectPath } = await seeded()
    const { q, version } = await openQuestion(projectPath)
    await expectLogUnchanged(projectPath, () => annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: [] }, runId: 'run-1',
    }))
  })

  it('refuses a referent outside candidates atomically — no orphaned proposal', async () => {
    const { projectPath } = await seeded()
    const { q, version } = await openQuestion(projectPath)
    await expectLogUnchanged(projectPath, () => annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: [q.locator.recordId] }, runId: 'run-1',
    }))
    // The failing answer must not have persisted the proposal it derived.
    expect((await annotationStore.state(projectPath)).revision).toBe(0)
  })

  it('deduplicates referent ids order-preservingly: 51 copies of one candidate succeeds', async () => {
    const { projectPath } = await seeded()
    const { q, beats, version } = await openQuestion(projectPath)
    const state = await annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: Array(51).fill(beats.id) }, runId: 'run-1',
    })
    expect(state.status).toBe('approved')
    expect(state.referentRecordIds).toEqual([beats.id])
  })

  it('resumes an already-proposed question: single settlement event appended', async () => {
    const { projectPath } = await seeded()
    const { q, beats } = await openQuestion(projectPath)
    await annotationStore.propose(projectPath, await projectMemoryStore.readSnapshotReadOnly(projectPath), q.annotationId, 'run-1')
    expect((await annotationStore.state(projectPath)).revision).toBe(1)

    const currentSnapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const currentQuestions = await annotationStore.pendingQuestions(projectPath, currentSnapshot)
    const proposedQ = currentQuestions.find(x => x.annotationId === q.annotationId)
    if (!proposedQ) throw new Error('question missing after propose')
    expect(proposedQ.status).toBe('proposed')
    const version = questionVersionFor(currentSnapshot, proposedQ)

    const state = await annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: [beats.id] }, runId: 'run-2',
    })
    expect(state.status).toBe('approved')
    expect((await annotationStore.state(projectPath)).revision).toBe(2)
  })

  it('questionVersion changes when the referencing wording changes', async () => {
    const { projectPath } = await seeded()
    const { snapshot, q } = await openQuestion(projectPath)
    const edited = {
      ...snapshot,
      records: snapshot.records.map(r => r.id === q.locator.recordId
        ? { ...r, claim: `${r.claim} And one extra clause.` } : r),
    }
    expect(questionVersionFor(snapshot, q)).not.toBe(questionVersionFor(edited, q))
  })

  it('questionVersion changes when a candidate record’s wording changes', async () => {
    const { projectPath } = await seeded()
    const { snapshot, q } = await openQuestion(projectPath)
    const candidateId = q.candidateRecordIds[0]
    if (!candidateId) throw new Error('fixture missing a candidate')
    const edited = {
      ...snapshot,
      records: snapshot.records.map(r => r.id === candidateId
        ? { ...r, claim: `${r.claim} And one extra clause.` } : r),
    }
    expect(questionVersionFor(snapshot, q)).not.toBe(questionVersionFor(edited, q))
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
