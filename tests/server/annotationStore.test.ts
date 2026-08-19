import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { annotationStore, annotationIdFor, recordLanguageFingerprint, questionVersionFor, AnnotationStoreError } from '../../server/projectMemory/annotationStore'
import { AnnotationReplayError, applyAnnotationEvent, type AnnotationEvent, type AnnotationLogState } from '../../shared/projectMemoryAnnotations'
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

describe('answerQuestion transaction', () => {
  async function openQuestion(projectPath: string) {
    const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
    const questions = await annotationStore.pendingQuestions(projectPath, snapshot)
    const q = questions.find(x => x.locator.cue === 'superseded-by')
    const beats = snapshot.records.find(r => r.claim.startsWith('Beat sequence'))
    if (!q || !beats) throw new Error('fixture missing')
    return { snapshot, q, beats, version: questionVersionFor(snapshot, q) }
  }

  async function expectLogUnchanged(projectPath: string, run: () => Promise<unknown>) {
    const file = path.join(projectPath, 'memory', 'annotations.jsonl')
    const before = await readFile(file, 'utf8').catch(() => '')
    await expect(run()).rejects.toBeInstanceOf(AnnotationStoreError)
    expect(await readFile(file, 'utf8').catch(() => '')).toBe(before)
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
