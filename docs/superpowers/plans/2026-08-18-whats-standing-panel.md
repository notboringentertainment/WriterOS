# What's Standing Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "What's Standing" tab in the WriterOS app where the writer reads the report and answers its reference questions in place.

**Architecture:** Two new endpoints under the hardened project-memory mount serve a composed report plus enriched questions and accept answers through a single atomic store transaction. The client adds one tab, one view that renders report blocks with question cards anchored beneath their cue sentences, and two api methods. No report persistence.

**Tech Stack:** Express, zod, React (inline-style convention), vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-whats-standing-panel-design.md` — read it first; it carries the contracts (questionVersion, atomicity, race guard, banner/card split) this plan implements.

## Global Constraints

- No free-text answer input anywhere. Answers are candidate ids, cant-say, or decline.
- Every non-200 answer response leaves `memory/annotations.jsonl` byte-identical.
- Report reads write nothing to the package (`readSnapshotReadOnly` / `annotationStore.state` only).
- CLI `report` and `questions` output and exit codes are unchanged.
- New client code follows the suite's inline-style convention (`var(--font-display)`, `var(--fg)`, etc. — copy styles from `SynopsisDocumentView.tsx` / `MemoryConflictCard.tsx`).
- Verification for every task: `npm run check` must pass; run the named vitest files.
- Commit after every task (the repo convention: imperative subject, body explains why, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- Branch: `feat/whats-standing-panel` (exists; spec committed on it).

---

### Task 1: Block anchor — `annotationId` on cue blocks

**Files:**
- Modify: `shared/compose/types.ts` (ComposedBlock union, ~line 58)
- Modify: `shared/compose/schemas.ts` (ComposedBlockSchema, ~line 12)
- Modify: `server/compose/whatsStandingRenderer.ts` (recordBlocks, ~line 60)
- Test: `tests/server/whatsStandingReport.test.ts`

**Interfaces:**
- Produces: `leadInParagraph` blocks may carry `annotationId?: string`. The renderer sets it on every cue block, computed by the existing `annotationIdFor(...)` call already made in `recordBlocks`.

- [ ] **Step 1: Write the failing test** (append to the `composition` describe in `tests/server/whatsStandingReport.test.ts`):

```ts
it('anchors each cue block with its annotation id', () => {
  const referencing = record({ id: 'mem-ref', claim: 'Second decision. Superseded by beats 9-11.' })
  const blocks = renderWhatsStandingBlocks(snapshot([referencing]))
  const cueBlock = blocks.find(b => b.type === 'leadInParagraph') as
    Extract<ComposedBlock, { type: 'leadInParagraph' }> | undefined
  expect(cueBlock?.annotationId).toMatch(/^ann_[0-9a-f]{32}$/)
  // Schema accepts the new field and documents without it stay valid.
  const result = composeWhatsStanding({ snapshot: snapshot([referencing]), runId: 'run-1' })
  if (!result.ok) throw new Error('compose failed')
  expect(ComposedDocumentSchema.safeParse(result.composed).success).toBe(true)
})
```

Add `import type { ComposedBlock } from '../../shared/compose/types'` if not present.

- [ ] **Step 2: Run** `npx vitest run tests/server/whatsStandingReport.test.ts` — expect FAIL (`annotationId` undefined).

- [ ] **Step 3: Implement.**

In `shared/compose/types.ts`, extend the union member:

```ts
| { type: 'leadInParagraph'; lead: string; text: string; sourceFieldIds: string[]; annotationId?: string }
```

In `shared/compose/schemas.ts`:

```ts
z.object({ type: z.literal('leadInParagraph'), lead: z.string(), text: z.string(), sourceFieldIds, annotationId: z.string().optional() }),
```

In `server/compose/whatsStandingRenderer.ts`, `recordBlocks` already computes the id — hoist it and attach:

```ts
const annotationId = annotationIdFor({
  recordId: entry.record.id,
  field: cue.field,
  sentence: cue.sentence,
  phrase: cue.phrase,
  occurrence: cue.occurrence,
  cue: cue.cue,
})
const annotation = annotations?.annotations.get(annotationId)
// ... existing resolved/sourceFieldIds logic unchanged ...
blocks.push({
  type: 'leadInParagraph',
  lead: 'This record points elsewhere:',
  text: /* unchanged */,
  sourceFieldIds,
  annotationId,
})
```

- [ ] **Step 4: Run** `npx vitest run tests/server/whatsStandingReport.test.ts` and `npm run check` — expect PASS.
- [ ] **Step 5: Commit** (`feat(compose): anchor cue blocks with their annotation id`).

---

### Task 2: `questionVersion` + atomic `answerQuestion` store transaction

**Files:**
- Modify: `server/projectMemory/annotationStore.ts`
- Test: `tests/server/annotationStore.test.ts`

**Interfaces:**
- Produces (exact exports from `annotationStore.ts`):

```ts
export function questionVersionFor(snapshot: ProjectMemorySnapshot, question: PendingQuestion): string

export type WhatsStandingAnswer =
  | { kind: 'referents'; recordIds: string[] }
  | { kind: 'cant-say' }
  | { kind: 'decline' }

// On AnnotationQueries:
answerQuestion(projectPath: string, input: {
  annotationId: string
  questionVersion: string
  answer: WhatsStandingAnswer
  runId: string
}): Promise<AnnotationState>
```

- Errors are `AnnotationStoreError` with reasons: `not-found` (no such open question), `conflict` (questionVersion mismatch, or premise moved), `invalid-input` (referent outside candidates, empty referent list).

- [ ] **Step 1: Refactor for reuse (no behavior change).** `pendingQuestions` re-reads state from disk; the transaction needs the same derivation against an in-lock state. Extract a pure function in `annotationStore.ts`:

```ts
function derivePendingQuestions(state: AnnotationLogState, snapshot: ProjectMemorySnapshot): PendingQuestion[]
```

Move the body of `pendingQuestions` into it (the loop over `cueQuestions(snapshot)` with the `existing === undefined || existing.status === 'invalidated'` branch and the `proposed` branch); `pendingQuestions` becomes:

```ts
async pendingQuestions(projectPath, snapshot) {
  return derivePendingQuestions(await this.state(projectPath), snapshot)
},
```

Run `npx vitest run tests/server/annotationStore.test.ts` — all existing tests still pass before continuing.

- [ ] **Step 2: Write the failing tests** (new describe in `tests/server/annotationStore.test.ts`; `seeded()`, `PROJECT_ID`, imports already exist — add `questionVersionFor` to the annotationStore import):

```ts
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

  it('refuses a stale questionVersion and leaves the log byte-identical', async () => {
    const { projectPath } = await seeded()
    const { q } = await openQuestion(projectPath)
    const before = await readFile(path.join(projectPath, 'memory', 'annotations.jsonl'), 'utf8')
      .catch(() => '')
    await expect(annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: 'f'.repeat(64),
      answer: { kind: 'decline' }, runId: 'run-1',
    })).rejects.toMatchObject({ reason: 'conflict' })
    const after = await readFile(path.join(projectPath, 'memory', 'annotations.jsonl'), 'utf8')
      .catch(() => '')
    expect(after).toBe(before)
  })

  it('refuses a referent outside candidates atomically — no orphaned proposal', async () => {
    const { projectPath } = await seeded()
    const { q, version } = await openQuestion(projectPath)
    await expect(annotationStore.answerQuestion(projectPath, {
      annotationId: q.annotationId, questionVersion: version,
      answer: { kind: 'referents', recordIds: [q.locator.recordId] }, runId: 'run-1',
    })).rejects.toMatchObject({ reason: 'invalid-input' })
    // The failing answer must not have persisted the proposal it derived.
    expect((await annotationStore.state(projectPath)).revision).toBe(0)
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
})
```

- [ ] **Step 3: Run** `npx vitest run tests/server/annotationStore.test.ts` — new tests FAIL (`questionVersionFor` / `answerQuestion` not defined).

- [ ] **Step 4: Implement in `annotationStore.ts`.**

```ts
/**
 * Opaque hash of a question's premise as shown to the writer: the referencing record's
 * language, the exact sentence quoted, and the offered candidates with their language.
 * The annotation id deliberately excludes the sentence, so it alone cannot prove the
 * writer answered the question they were looking at; this can.
 */
export function questionVersionFor(snapshot: ProjectMemorySnapshot, question: PendingQuestion): string {
  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  const referencing = byId.get(question.locator.recordId)
  return sha256Hex(JSON.stringify({
    referencing: referencing ? recordLanguageFingerprint(referencing).contentHash : null,
    sentence: question.locator.sentence,
    candidates: question.candidateRecordIds.map(id => {
      const record = byId.get(id)
      return { id, hash: record ? recordLanguageFingerprint(record).contentHash : null }
    }),
  }))
}

export type WhatsStandingAnswer =
  | { kind: 'referents'; recordIds: string[] }
  | { kind: 'cant-say' }
  | { kind: 'decline' }
```

Add `answerQuestion` to the `AnnotationQueries` interface (signature from the Interfaces block) and implement it in `createAnnotationStore()`:

```ts
async answerQuestion(projectPath, input) {
  return withLock(projectPath, async projectId => {
    const state = await replayAnnotations(projectPath, projectId)
    const current = await projectMemoryStore.readSnapshotReadOnlyInHeldLock(projectPath, projectId)
    const question = derivePendingQuestions(state, current)
      .find(q => q.annotationId === input.annotationId)
    if (question === undefined) {
      throw new AnnotationStoreError('No such open question. Refresh the report.', 'not-found')
    }
    if (questionVersionFor(current, question) !== input.questionVersion) {
      throw new AnnotationStoreError(
        'This question changed since it was shown. Refresh the report and answer the current version.',
        'conflict')
    }

    const referencing = current.records.find(r => r.id === question.locator.recordId)
    if (referencing === undefined) {
      throw new AnnotationStoreError('The record this question quotes is no longer in memory.', 'conflict')
    }

    const at = new Date().toISOString()
    const events: AnnotationEvent[] = []
    let revision = state.revision
    if (question.status === 'new') {
      events.push({
        type: 'annotation-proposed',
        projectId,
        annotationId: input.annotationId,
        annotationRevision: ++revision,
        at,
        questionType: 'resolve-reference',
        locator: question.locator,
        candidateRecordIds: question.candidateRecordIds,
        support: [recordLanguageFingerprint(referencing)],
        runId: input.runId,
      })
    }

    if (input.answer.kind === 'referents') {
      const chosen = input.answer.recordIds
      if (chosen.length === 0) {
        throw new AnnotationStoreError('An answer needs at least one referent.', 'invalid-input')
      }
      const candidates = new Set(question.candidateRecordIds)
      const support: RecordLanguageFingerprint[] = [recordLanguageFingerprint(referencing)]
      for (const id of chosen) {
        if (!candidates.has(id)) {
          throw new AnnotationStoreError(`${id} is not among this question's candidates.`, 'invalid-input')
        }
        const referent = current.records.find(r => r.id === id)
        if (referent === undefined) {
          throw new AnnotationStoreError(`Chosen referent ${id} is not in the snapshot.`, 'invalid-input')
        }
        support.push(recordLanguageFingerprint(referent))
      }
      events.push({
        type: 'annotation-approved',
        projectId,
        annotationId: input.annotationId,
        annotationRevision: ++revision,
        at,
        referentRecordIds: chosen,
        support,
        actor: 'writer',
        runId: input.runId,
      })
    } else {
      events.push({
        type: 'annotation-declined',
        projectId,
        annotationId: input.annotationId,
        annotationRevision: ++revision,
        at,
        reason: input.answer.kind === 'cant-say' ? 'cant-say' : 'declined',
        support: [recordLanguageFingerprint(referencing)],
        actor: 'writer',
        runId: input.runId,
      })
    }

    // Preflight EVERY event against the replayed state before ANY append. An error
    // response must never leave the log changed; an illegal line appended durably
    // would brick every future replay.
    let next = state
    for (const event of events) next = preflightAnnotationEvent(next, event)
    for (const event of events) await appendAnnotationEvent(projectPath, event)
    return next.annotations.get(input.annotationId) as AnnotationState
  })
},
```

- [ ] **Step 5: Run** `npx vitest run tests/server/annotationStore.test.ts` and `npm run check` — expect PASS (all, including pre-existing).
- [ ] **Step 6: Commit** (`feat(memory): questionVersion and atomic answerQuestion transaction`).

---

### Task 3: Shared payload schemas + read helper + CLI re-point

**Files:**
- Create: `shared/whatsStandingPanel.ts`
- Create: `server/projectMemory/whatsStandingReport.ts`
- Modify: `server/projectMemory/cli.ts` (runReport ~line 573, runQuestions ~line 625)
- Test: `tests/server/whatsStandingReadHelper.test.ts` (new)

**Interfaces:**
- Consumes: `questionVersionFor`, `annotationStore`, `projectMemoryStore.readSnapshotReadOnly`, `composeWhatsStanding`.
- Produces:

```ts
// shared/whatsStandingPanel.ts
export const WhatsStandingAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('referents'), recordIds: z.array(z.string().min(1)).min(1).max(50) }).strict(),
  z.object({ kind: z.literal('cant-say') }).strict(),
  z.object({ kind: z.literal('decline') }).strict(),
])
export const WhatsStandingAnswerRequestSchema = z.object({
  annotationId: z.string().min(1).max(200),
  questionVersion: z.string().regex(/^[0-9a-f]{64}$/),
  answer: WhatsStandingAnswerSchema,
}).strict()
export const EnrichedQuestionSchema = z.object({
  annotationId: z.string(),
  status: z.enum(['new', 'proposed']),
  questionText: z.string(),
  recordId: z.string(),
  candidates: z.array(z.object({ id: z.string(), headline: z.string() })),
  questionVersion: z.string(),
}).strict()
export const WhatsStandingPayloadSchema = z.object({
  composed: ComposedDocumentSchema,
  questions: z.array(EnrichedQuestionSchema),
}).strict()
export type EnrichedQuestion = z.infer<typeof EnrichedQuestionSchema>
export type WhatsStandingPayload = z.infer<typeof WhatsStandingPayloadSchema>

// server/projectMemory/whatsStandingReport.ts
export async function readWhatsStandingReport(projectPath: string): Promise<
  { ok: true; payload: WhatsStandingPayload } | { ok: false; reason: string }>
```

- [ ] **Step 1: Write the failing tests** in `tests/server/whatsStandingReadHelper.test.ts`. Copy the `makePackage`/`publishRecord`/`seeded` fixtures from `tests/server/annotationStore.test.ts` verbatim (they are file-local there). Tests:

```ts
it('returns a composed report and enriched questions with versions', async () => {
  const { projectPath } = await seeded()
  const result = await readWhatsStandingReport(projectPath)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(WhatsStandingPayloadSchema.safeParse(result.payload).success).toBe(true)
  expect(result.payload.questions.length).toBe(2)
  for (const q of result.payload.questions) {
    expect(q.questionVersion).toMatch(/^[0-9a-f]{64}$/)
    expect(q.candidates.length).toBe(2)
    expect(q.candidates[0].headline.length).toBeGreaterThan(0)
  }
})

it('writes nothing to the package', async () => {
  const { projectPath } = await seeded()
  await projectMemoryStore.readSnapshot(projectPath) // settle projections first
  const dir = path.join(projectPath, 'memory')
  const before = new Map<string, string>()
  for (const f of (await readdir(dir)).sort()) before.set(f, await readFile(path.join(dir, f), 'utf8'))
  await readWhatsStandingReport(projectPath)
  for (const [f, bytes] of before) expect(await readFile(path.join(dir, f), 'utf8')).toBe(bytes)
})
```

- [ ] **Step 2: Run** `npx vitest run tests/server/whatsStandingReadHelper.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement.** `shared/whatsStandingPanel.ts` exactly as the Interfaces block (import `ComposedDocumentSchema` from `./compose/schemas`, `z` from `zod`). `server/projectMemory/whatsStandingReport.ts` — move the consistent-pair loop out of `runReport` in `cli.ts`:

```ts
import { annotationStore, questionVersionFor } from './annotationStore'
import { projectMemoryStore } from './store'
import { composeWhatsStanding } from '../compose'
import type { WhatsStandingPayload, EnrichedQuestion } from '../../shared/whatsStandingPanel'

function headline(claim: string): string {
  const first = claim.split('\n')[0]
  return first.length > 70 ? `${first.slice(0, 69)}…` : first
}

export async function readWhatsStandingReport(projectPath: string): Promise<
  { ok: true; payload: WhatsStandingPayload } | { ok: false; reason: string }> {
  // Optimistic consistent pair — same contract the CLI report command documented:
  // annotation revision identical before and after the snapshot read means no writer
  // ran in between, so the pair is one moment's state.
  let annotations = await annotationStore.state(projectPath)
  let snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  for (let attempt = 0; ; attempt += 1) {
    const after = await annotationStore.state(projectPath)
    if (after.revision === annotations.revision) break
    if (attempt >= 3) {
      return { ok: false, reason: 'Memory kept changing while the report was being read. Try again when the project is quiet.' }
    }
    annotations = after
    snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  }

  const result = composeWhatsStanding({
    snapshot,
    runId: `whats-standing-r${snapshot.revision}-a${annotations.revision}`,
    annotations,
  })
  if (!result.ok) return { ok: false, reason: result.reason }

  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  const questions: EnrichedQuestion[] = (await annotationStore.pendingQuestions(projectPath, snapshot))
    .map(q => ({
      annotationId: q.annotationId,
      status: q.status,
      questionText: q.questionText,
      recordId: q.locator.recordId,
      candidates: q.candidateRecordIds.map(id => ({ id, headline: headline(byId.get(id)?.claim ?? '') })),
      questionVersion: questionVersionFor(snapshot, q),
    }))
  return { ok: true, payload: { composed: result.composed, questions } }
}
```

Re-point `runReport` in `cli.ts`: replace its read-pair loop and compose call with `readWhatsStandingReport(project.path)`; on `ok: false` print the reason to stderr and return 1; output formatting (json vs markdown of `payload.composed`) unchanged. `runQuestions` stays on `pendingQuestions` directly (its output has no versions) — it only moves if zero output change is provable; otherwise leave it untouched and note that in the commit message.

- [ ] **Step 4: Run** `npx vitest run tests/server/whatsStandingReadHelper.test.ts tests/server/annotationStore.test.ts tests/server/whatsStandingReport.test.ts` — PASS. The `report command` describe in `annotationStore.test.ts` is the CLI regression gate (INCOMPLETE present/absent); it must pass unmodified.
- [ ] **Step 5: Commit** (`feat(memory): shared What's Standing read helper and panel schemas`).

---

### Task 4: Routes

**Files:**
- Modify: `server/projectMemory/routes.ts`
- Test: `tests/server/whatsStandingRoutes.test.ts` (new; model it on `tests/server/projectMemoryRoutes.test.ts` — copy that file's express-app + library-store setup helper)

**Interfaces:**
- Consumes: `readWhatsStandingReport`, `annotationStore.answerQuestion`, `WhatsStandingAnswerRequestSchema`, `AnnotationStoreError`.
- Produces: `GET /api/projects/:projectId/memory/whats-standing` → `200 { composed, questions }`; `POST .../memory/whats-standing/answer` → `200 { composed, questions }` | `400 | 404 | 409`.

- [ ] **Step 1: Write the failing tests.** Using the copied setup (seeded package registered in the library store, session token, same-origin headers):

```ts
it('serves the report with questions', async () => {
  const res = await request(app).get(`/api/projects/${projectId}/memory/whats-standing`)
    .set(authHeaders)
  expect(res.status).toBe(200)
  expect(WhatsStandingPayloadSchema.safeParse(res.body).success).toBe(true)
})

it('answers a question and returns the regenerated report', async () => {
  const before = await request(app).get(`/api/projects/${projectId}/memory/whats-standing`).set(authHeaders)
  const q = before.body.questions[0]
  const res = await request(app).post(`/api/projects/${projectId}/memory/whats-standing/answer`)
    .set(authHeaders)
    .send({ annotationId: q.annotationId, questionVersion: q.questionVersion, answer: { kind: 'decline' } })
  expect(res.status).toBe(200)
  expect(res.body.questions.map((x: { annotationId: string }) => x.annotationId)).not.toContain(q.annotationId)
})

it('rejects a stale questionVersion with 409 and leaves the log unchanged', async () => {
  const before = await request(app).get(`/api/projects/${projectId}/memory/whats-standing`).set(authHeaders)
  const q = before.body.questions[0]
  const res = await request(app).post(`/api/projects/${projectId}/memory/whats-standing/answer`)
    .set(authHeaders)
    .send({ annotationId: q.annotationId, questionVersion: 'f'.repeat(64), answer: { kind: 'decline' } })
  expect(res.status).toBe(409)
  const again = await request(app).get(`/api/projects/${projectId}/memory/whats-standing`).set(authHeaders)
  expect(again.body.questions.length).toBe(before.body.questions.length)
})

it('rejects an unknown question with 404, a bad body with 400, and no session with the boundary error', async () => {
  const bad = await request(app).post(`/api/projects/${projectId}/memory/whats-standing/answer`)
    .set(authHeaders)
    .send({ annotationId: 'ann_missing', questionVersion: 'a'.repeat(64), answer: { kind: 'decline' } })
  expect(bad.status).toBe(404)
  const invalid = await request(app).post(`/api/projects/${projectId}/memory/whats-standing/answer`)
    .set(authHeaders)
    .send({ nonsense: true })
  expect(invalid.status).toBe(400)
  const unauthed = await request(app).get(`/api/projects/${projectId}/memory/whats-standing`)
  expect(unauthed.status).toBeGreaterThanOrEqual(400)
})
```

- [ ] **Step 2: Run** `npx vitest run tests/server/whatsStandingRoutes.test.ts` — FAIL (404 from classifier).

- [ ] **Step 3: Implement in `routes.ts`.**

Path constants beside `ANALYSIS_QUEUE_ROUTE_PATHS`:

```ts
const WHATS_STANDING_ROUTE_PATHS = PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/whats-standing`)
const WHATS_STANDING_ANSWER_ROUTE_PATHS = PROJECT_MEMORY_PREFIXES.map(prefix => `${prefix}/whats-standing/answer`)
```

Classifier: in `classifyProjectMemoryPath`, additive branches exactly like the analysis-queue precedent — single-segment `endpoint === 'whats-standing'` → `'GET'`; two-segment path where `endpointSegments[0] === 'whats-standing'` and `endpointSegments[1] === 'answer'` (allowing the trailing-slash variant like `isAnalysisRetryPath` does) → `'POST'`.

Handlers, following the snapshot route's exact shape (validatedProjectId → resolveProjectPackagePath → work → routeError):

```ts
app.get(WHATS_STANDING_ROUTE_PATHS, requireSameOrigin, requireSession, async (req, res) => {
  try {
    const projectId = validatedProjectId(req.params.projectId)
    const projectPath = await libraryStore(config, projectLibraryStore).resolveProjectPackagePath(projectId)
    const result = await readWhatsStandingReport(projectPath)
    if (!result.ok) return res.status(503).json({ error: 'report-unavailable', message: result.reason })
    return res.json(result.payload)
  } catch (error) {
    return routeError(res, error)
  }
})

app.post(WHATS_STANDING_ANSWER_ROUTE_PATHS, requireSameOrigin, requireSession, async (req, res) => {
  try {
    const projectId = validatedProjectId(req.params.projectId)
    const request = WhatsStandingAnswerRequestSchema.parse(req.body)
    const projectPath = await libraryStore(config, projectLibraryStore).resolveProjectPackagePath(projectId)
    await annotationStore.answerQuestion(projectPath, {
      annotationId: request.annotationId,
      questionVersion: request.questionVersion,
      answer: request.answer,
      runId: `panel-answer`,
    })
    const result = await readWhatsStandingReport(projectPath)
    if (!result.ok) return res.status(503).json({ error: 'report-unavailable', message: result.reason })
    return res.json(result.payload)
  } catch (error) {
    if (error instanceof AnnotationStoreError) {
      const status = error.reason === 'not-found' ? 404
        : error.reason === 'conflict' ? 409
        : error.reason === 'invalid-input' ? 400
        : 500
      return res.status(status).json({ error: `annotation-${error.reason}`, message: error.message })
    }
    return routeError(res, error)
  }
})
```

The runId stays the constant `'panel-answer'`: clock-derived ids would break the determinism convention, and the event schema does not require runId uniqueness — it is provenance text.

Imports to add: `readWhatsStandingReport`, `annotationStore`, `AnnotationStoreError`, `WhatsStandingAnswerRequestSchema`.

- [ ] **Step 4: Run** `npx vitest run tests/server/whatsStandingRoutes.test.ts tests/server/projectMemoryRoutes.test.ts` and `npm run check` — PASS (the existing routes suite guards the classifier change).
- [ ] **Step 5: Commit** (`feat(memory): What's Standing panel routes`).

---

### Task 5: Client api methods

**Files:**
- Modify: `client/src/lib/projectMemoryApi.ts`
- Test: `tests/lib/projectMemoryApi.whatsStanding.test.ts` (new; look at any existing `tests/lib/*Api*.test.ts` or `tests/lib/composeClient.test.ts` for the fetch-stub convention)

**Interfaces:**
- Consumes: `WhatsStandingPayloadSchema`, `WhatsStandingPayload`, and the request `answer` type from `shared/whatsStandingPanel.ts`.
- Produces, on the object returned by `createProjectMemoryApi`:

```ts
whatsStanding(projectId: string): Promise<WhatsStandingPayload>
answerWhatsStanding(
  projectId: string,
  annotationId: string,
  questionVersion: string,
  answer: { kind: 'referents'; recordIds: string[] } | { kind: 'cant-say' } | { kind: 'decline' },
): Promise<WhatsStandingPayload>
```

Both throw `ProjectMemoryApiError` on failure (status code preserved — the tab uses `statusCode === 409`).

- [ ] **Step 1: Write the failing tests** with a stubbed fetch:

```ts
it('GETs the panel payload and validates it', async () => {
  const fetchStub = vi.fn(async () => new Response(JSON.stringify(validPayload), { status: 200 }))
  const api = createProjectMemoryApi('token', fetchStub)
  const payload = await api.whatsStanding('proj-1')
  expect(fetchStub.mock.calls[0][0]).toBe('/api/projects/proj-1/memory/whats-standing')
  expect(payload.questions).toEqual(validPayload.questions)
})

it('POSTs an answer with the questionVersion echoed', async () => {
  const fetchStub = vi.fn(async () => new Response(JSON.stringify(validPayload), { status: 200 }))
  const api = createProjectMemoryApi('token', fetchStub)
  await api.answerWhatsStanding('proj-1', 'ann_x', 'a'.repeat(64), { kind: 'cant-say' })
  const [url, init] = fetchStub.mock.calls[0]
  expect(url).toBe('/api/projects/proj-1/memory/whats-standing/answer')
  expect(JSON.parse(init.body).questionVersion).toBe('a'.repeat(64))
})

it('surfaces a 409 with its status code and rejects invalid payloads', async () => {
  const conflict = vi.fn(async () => new Response(JSON.stringify({ error: 'annotation-conflict', message: 'moved' }), { status: 409 }))
  await expect(createProjectMemoryApi('t', conflict).whatsStanding('p'))
    .rejects.toMatchObject({ statusCode: 409 })
  const garbage = vi.fn(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }))
  await expect(createProjectMemoryApi('t', garbage).whatsStanding('p'))
    .rejects.toMatchObject({ code: 'invalid-response' })
})
```

`validPayload`: build a minimal object that passes `WhatsStandingPayloadSchema` (a real `ComposedDocument` skeleton: schemaVersion 1, generatedAt ISO string, model null, recipeVersion/composerVersion 1, sourceHash 'a'.repeat(64), format 'feature', empty blocks, fidelity clean, plus one question with all fields).

- [ ] **Step 2: Run** — FAIL (methods missing).

- [ ] **Step 3: Implement** on the returned object in `projectMemoryApi.ts`, using the existing `requestJson` + `headers` + a new path helper:

```ts
const whatsStandingPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/memory/whats-standing`

async whatsStanding(projectId: string): Promise<WhatsStandingPayload> {
  const body = await requestJson<unknown>(fetchProjectMemory, whatsStandingPath(projectId), { headers })
  const parsed = WhatsStandingPayloadSchema.safeParse(body)
  if (!parsed.success) {
    throw new ProjectMemoryApiError('WriterOS project memory returned an invalid response.', 200, 'invalid-response')
  }
  return parsed.data
},
async answerWhatsStanding(projectId, annotationId, questionVersion, answer) {
  const body = await requestJson<unknown>(fetchProjectMemory,
    `${whatsStandingPath(projectId)}/answer`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotationId, questionVersion, answer }),
    })
  const parsed = WhatsStandingPayloadSchema.safeParse(body)
  if (!parsed.success) {
    throw new ProjectMemoryApiError('WriterOS project memory returned an invalid response.', 200, 'invalid-response')
  }
  return parsed.data
},
```

- [ ] **Step 4: Run** the new test file and `npm run check` — PASS.
- [ ] **Step 5: Commit** (`feat(client): What's Standing api methods`).

---

### Task 6: Tab wiring

**Files:**
- Modify: `client/src/lib/shellState.ts:3` and the `panelByTab` initializer (~line 15)
- Modify: `client/src/components/shell/TopBar.tsx:8-16`
- Modify: `client/src/lib/wpRouting.ts` (the `ActiveTab` type — find with `grep -n "ActiveTab" client/src/lib/wpRouting.ts`)
- Modify: `client/src/App.tsx` (`renderActiveSurface` switch, ~line 931)
- Check only: `client/src/lib/surfaceAwareness.ts` — its `default: return { kind: 'none' }` already covers the new tab; add a one-line comment on the default noting `whats-standing` lands here deliberately (a report has no intake).

**Interfaces:**
- Consumes: `WhatsStandingTab` from Task 7 — to keep this task independently compilable, wire the case to the component AFTER Task 7, or (preferred) do Task 7 first if executing out of order. In the plan's order, this task creates a minimal placeholder module that Task 7 fills in:

```tsx
// client/src/components/writing/whatsStanding/WhatsStandingTab.tsx
export interface WhatsStandingTabProps { projectId?: string; projectScopeKey?: string }
export function WhatsStandingTab(_props: WhatsStandingTabProps) { return null }
```

- [ ] **Step 1:** Grep every declaration of the tab union: `grep -rn "'synopsis'" client/src/lib client/src/components/shell | grep -i "tab\|writing"`. Add `'whats-standing'` to each union found (`shellState.ts`, `TopBar.tsx`, `wpRouting.ts` `ActiveTab` if it lists tabs literally).
- [ ] **Step 2:** `shellState.ts` — add `'whats-standing': false` to the `panelByTab` initializer. `TopBar.tsx` — append `{ id: 'whats-standing', label: "What's Standing" }` to `WRITING_TABS`.
- [ ] **Step 3:** Create the placeholder `WhatsStandingTab.tsx` (above) and add the `App.tsx` case:

```tsx
case 'whats-standing':
  return (
    <WhatsStandingTab
      projectId={activeFolderProjectId ?? undefined}
      projectScopeKey={activeAgentProjectKey}
    />
  )
```

- [ ] **Step 4:** Run `npm run check` and `npx vitest run tests/lib` — expect PASS (type unions verified by tsc; existing shell tests catch missed spots).
- [ ] **Step 5: Commit** (`feat(client): What's Standing tab wiring`).

---

### Task 7: Panel components

**Files:**
- Modify: `client/src/components/writing/whatsStanding/WhatsStandingTab.tsx` (replace placeholder)
- Create: `client/src/components/writing/whatsStanding/WhatsStandingView.tsx`
- Create: `client/src/components/writing/whatsStanding/QuestionCard.tsx`
- Test: `tests/lib/whatsStandingPanel.test.tsx` (model on `tests/lib/useProjectState.composed.test.tsx` for the @testing-library convention in use)

**Interfaces:**
- Consumes: `createProjectMemoryApi` methods from Task 5; `useBoundProjectScopeKey`, `useProjectRequestGeneration` from `client/src/lib/useProjectRequestGeneration.ts`; session bootstrap — copy how `client/src/lib/useProjectMemory.ts` obtains the token (`/api/project-library/bootstrap`, lines ~110-120) or reuse its exported helper if one exists (grep `bootstrap` in that file first).
- Produces:

```tsx
export interface WhatsStandingTabProps { projectId?: string; projectScopeKey?: string }
export function WhatsStandingTab(props: WhatsStandingTabProps): JSX.Element

export interface WhatsStandingViewProps {
  payload: WhatsStandingPayload
  answeringId: string | null
  notice: string | null
  onAnswer: (annotationId: string, questionVersion: string, answer:
    { kind: 'referents'; recordIds: string[] } | { kind: 'cant-say' } | { kind: 'decline' }) => void
}

export interface QuestionCardProps {
  question: EnrichedQuestion
  disabled: boolean
  onAnswer: WhatsStandingViewProps['onAnswer']
}
```

- [ ] **Step 1: Write the failing component tests** (render with @testing-library/react; no fetch — test View and Card as pure components):

```tsx
const question: EnrichedQuestion = {
  annotationId: 'ann_1', status: 'new', questionText: 'Which records does it refer to?',
  recordId: 'mem-ref', questionVersion: 'a'.repeat(64),
  candidates: [{ id: 'mem-a', headline: 'First decision' }, { id: 'mem-b', headline: 'Second decision' }],
}

it('QuestionCard: confirm disabled until a candidate is selected; multi-select posts all ids', async () => {
  const onAnswer = vi.fn()
  render(<QuestionCard question={question} disabled={false} onAnswer={onAnswer} />)
  const confirm = screen.getByRole('button', { name: /confirm/i })
  expect(confirm).toBeDisabled()
  await userEvent.click(screen.getByText('First decision'))
  await userEvent.click(screen.getByText('Second decision'))
  await userEvent.click(confirm)
  expect(onAnswer).toHaveBeenCalledWith('ann_1', 'a'.repeat(64),
    { kind: 'referents', recordIds: ['mem-a', 'mem-b'] })
})

it('QuestionCard: cant-say and decline; no text input exists; zero candidates hides confirm', async () => {
  const onAnswer = vi.fn()
  const { container, rerender } = render(<QuestionCard question={question} disabled={false} onAnswer={onAnswer} />)
  expect(container.querySelector('input[type=text], textarea')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: /can.t say/i }))
  expect(onAnswer).toHaveBeenCalledWith('ann_1', 'a'.repeat(64), { kind: 'cant-say' })
  rerender(<QuestionCard question={{ ...question, candidates: [] }} disabled={false} onAnswer={onAnswer} />)
  expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
})

it('WhatsStandingView: card renders beneath its anchor block; unanchored questions fall back to a bottom list; parked cant-say line present', () => {
  const payload: WhatsStandingPayload = {
    composed: {
      schemaVersion: 1, generatedAt: '2026-08-18T00:00:00.000Z', model: null,
      recipeVersion: 1, composerVersion: 1, sourceHash: 'a'.repeat(64), format: 'feature',
      blocks: [
        { type: 'heading', text: "What's Standing" },
        { type: 'leadInParagraph', lead: 'This record points elsewhere:', text: '“Superseded by beats 9-11”', sourceFieldIds: ['mem-ref'], annotationId: 'ann_1' },
      ],
      fidelity: { status: 'flagged', warnings: [
        { kind: 'unresolved_reference', message: 'Unresolved reference in mem-ref (unasked): “beats 9-11”.' },
        { kind: 'unresolved_reference', message: 'Unresolved reference in mem-x (cant-say): “the pilot ticket”.' },
      ] },
    },
    questions: [question, { ...question, annotationId: 'ann_orphan' }],
  }
  render(<WhatsStandingView payload={payload} answeringId={null} notice={null} onAnswer={() => {}} />)
  expect(screen.getByText(/2 references unresolved/i)).toBeInTheDocument()
  expect(screen.getByText(/parked/i)).toBeInTheDocument()          // cant-say banner line
  expect(screen.getAllByText(/can.t say/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/still needs an answer/i)).toBeInTheDocument() // fallback section for ann_orphan
})
```

- [ ] **Step 2: Run** `npx vitest run tests/lib/whatsStandingPanel.test.tsx` — FAIL.

- [ ] **Step 3: Implement.**

`QuestionCard.tsx` — visual language copied from `MemoryConflictCard.tsx` (bordered card, `var(--border)`, mono meta labels, discrete buttons). Local state `selected: Set<string>`; toggling candidate rows; buttons:

```tsx
<button type="button" disabled={disabled || selected.size === 0}
  onClick={() => onAnswer(question.annotationId, question.questionVersion,
    { kind: 'referents', recordIds: candidates order-preserving filter of selected })}>
  Confirm referents
</button>
<button type="button" disabled={disabled}
  onClick={() => onAnswer(question.annotationId, question.questionVersion, { kind: 'cant-say' })}>
  Can’t say — keeps the report incomplete
</button>
<button type="button" disabled={disabled}
  onClick={() => onAnswer(question.annotationId, question.questionVersion, { kind: 'decline' })}>
  Not a reference — don’t ask again
</button>
```

Zero candidates: render the question text (it already explains) and only the last two buttons.

`WhatsStandingView.tsx` — copy the style constants from `SynopsisDocumentView.tsx` (pageStyle, headingStyle, subheadingStyle, bodyStyle, metaStyle) and its private `Block` switch (fourth copy, per spec non-goal), extended only so `leadInParagraph` renders children after the paragraph. Structure:

1. Banner when `composed.fidelity.status !== 'clean'`: count `unresolved_reference` warnings → "N references unresolved". Warnings whose message contains `(cant-say)` render a line "Parked: you answered can’t say; this reopens if the wording changes." Other warning kinds render with the flagged copy used by the document views.
2. `notice` prop (409 refresh message) as a `metaStyle` line when non-null.
3. Blocks: map; after a `leadInParagraph` whose `annotationId` is in a `Map` of open questions, render `<QuestionCard question={...} disabled={answeringId !== null} onAnswer={onAnswer} />`.
4. Fallback: questions never matched to a block render at the bottom under a subheading "Still needs an answer", each with its `questionText` and card.

`WhatsStandingTab.tsx` — mirrors `SynopsisTab`'s state discipline plus the memory session bootstrap:

```tsx
const effectiveProjectScopeKey = useBoundProjectScopeKey(projectId, projectScopeKey)
const beginRequest = useProjectRequestGeneration(effectiveProjectScopeKey)
const [payload, setPayload] = useState<WhatsStandingPayload | null>(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [notice, setNotice] = useState<string | null>(null)
const [answeringId, setAnsweringId] = useState<string | null>(null)
```

- `useEffect` on `effectiveProjectScopeKey`: clear all state (payload null) then, when `projectId` is set, run `load()`.
- `load()`: `const isCurrent = beginRequest()`; bootstrap token, `api.whatsStanding(projectId)`; every `set*` guarded by `if (!isCurrent()) return`.
- `handleAnswer(annotationId, questionVersion, answer)`: guard `answeringId`, `const isCurrent = beginRequest()`, call `api.answerWhatsStanding`; on success `setPayload(result)`; on `ProjectMemoryApiError` with `statusCode === 409` → `setNotice(error.message)` then re-run the GET (same generation guard); other errors → `setError`.
- No folder project (`projectId` undefined): render the explanation ("What's Standing reads your project's memory package, which needs a folder-backed project.") in `bodyStyle`, no fetch.
- Page shell: same header pattern as `SynopsisTab` (`h2` "What's Standing", italic helper line "What's decided, what's contested, and what still points somewhere."), then loading / error-with-retry / `WhatsStandingView`.

- [ ] **Step 4: Run** `npx vitest run tests/lib/whatsStandingPanel.test.tsx` and `npm run check` — PASS.
- [ ] **Step 5: Commit** (`feat(client): What's Standing panel components`).

---

### Task 8: Full verification and live pass

**Files:** none new.

- [ ] **Step 1:** `npm run check && npm run test:run && npm run build` — all green, zero regressions.
- [ ] **Step 2:** `writeros-backup` — REQUIRED before the live pass; an in-app answer writes durable annotation events.
- [ ] **Step 3:** Live pass (use the `run` skill / browser tooling): start the app, open the Stool Pigeon project, open the What's Standing tab. Verify visually: report renders in suite styling; INCOMPLETE banner counts match the CLI report; the open struck-cue question shows its card beneath the quoted sentence; answering it (pick a real referent or decline — writer's call, ask Ben which before answering on live data) regenerates the report and shrinks the banner.
- [ ] **Step 4:** Run `npm run memory --silent -- report --project "$HOME/WriterOS Projects/Stool Pigeon (785623e6).writeros"` and confirm CLI output agrees with the panel state.
- [ ] **Step 5: Commit** anything outstanding; report results with the evidence (test counts, screenshots if captured).

---

## Self-review notes

- Spec coverage: questionVersion (Task 2), atomic transaction (Task 2), routes + classifier (Task 4), block anchor (Task 1), enriched questions + helper + CLI re-point (Task 3), api methods with version in signature (Task 5), tab wiring + surfaceAwareness no-op (Task 6), components with race guard, parked copy, fallback list, no free text (Task 7), backup + live pass (Task 8). CLI `questions` re-point is conditional (Task 3 Step 3) — the spec's regression requirement is honored either way because output must be provably unchanged before it moves.
- Type consistency: `EnrichedQuestion`/`WhatsStandingPayload` defined once in `shared/whatsStandingPanel.ts`; `WhatsStandingAnswer` defined in the store, mirrored structurally by `WhatsStandingAnswerSchema` — Task 3 must `z.infer` the request type and Task 2's `WhatsStandingAnswer` must stay assignment-compatible with it (same discriminants, same fields).
- The Task 4 GET handler contains a placeholder-looking empty `if` for the manifest check — delete it during implementation; the projectId integrity checks live in the stores and `resolveProjectPackagePath`, matching the helper's contract.
