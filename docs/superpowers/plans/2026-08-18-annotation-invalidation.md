# Annotation Invalidation (Lean Producer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect stale annotation resolutions read-only, surface them in the report, durably invalidate them on writer paths and via a CLI command, and gate declined re-proposals on actual wording movement.

**Architecture:** A shared pure `annotationStaleness` comparator drives three consumers: readiness/renderer (read-only surfacing), the store's `invalidateStale` producer (events on writer paths + CLI), and the store's declined-re-propose gate. The source hash gains a canonical annotation digest so support tampering cannot hide behind an unchanged hash.

**Tech Stack:** TypeScript, zod, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-annotation-invalidation-design.md` — read it first; it carries the read-only-report constraint, the approved-only sweep rule, and both pinned guardrails.

## Global Constraints

- The report GET / CLI `report` / CLI `questions` write nothing — existing byte-compare tests must pass unmodified.
- Every failure path of every store writer leaves `memory/annotations.jsonl` byte-identical (preflight-before-append, already the house rule).
- Status, `supersedes`, and safety flips NEVER trigger staleness — only `claim`/`detail` hashes and record absence.
- One `annotation-invalidated` event per stale annotation (first divergent support wins); only `approved` annotations are swept.
- `npm run check` green before every commit; run the named vitest files per task.
- Commit convention: imperative subject, body ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch: `feat/annotation-invalidation` (exists; spec committed on it).

---

### Task 1: Shared staleness comparator

**Files:**
- Modify: `shared/projectMemoryAnnotations.ts`
- Modify: `server/projectMemory/annotationStore.ts` (remove the moved function, re-export)
- Test: `tests/shared/annotationStaleness.test.ts` (new)

**Interfaces:**
- Produces (exact exports from `shared/projectMemoryAnnotations.ts`):

```ts
export function recordLanguageFingerprint(record: ProjectMemoryRecord): RecordLanguageFingerprint
// moved verbatim from server/projectMemory/annotationStore.ts (hash of {claim, detail: detail ?? null})

export type AnnotationStaleness =
  | { stale: false }
  | { stale: true; cause: 'language-changed' | 'record-removed'
      changedRecordId: string; previousContentHash?: string; currentContentHash?: string }

export function annotationStaleness(
  support: RecordLanguageFingerprint[],
  snapshot: Pick<ProjectMemorySnapshot, 'records'>,
): AnnotationStaleness
```

- The store re-exports `recordLanguageFingerprint` so `tests/server/annotationStore.test.ts` and `whatsStandingReport.ts` imports keep working unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/shared/annotationStaleness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  annotationStaleness,
  recordLanguageFingerprint,
} from '../../shared/projectMemoryAnnotations'
import type { ProjectMemoryRecord } from '../../shared/projectMemory'

function record(id: string, claim: string, overrides: Partial<ProjectMemoryRecord> = {}): ProjectMemoryRecord {
  return {
    id, projectId: 'p1', kind: 'canon', status: 'active', claim,
    tags: [], entities: [], evidence: [], safety: 'clear', spoiler: false, supersedes: [],
    source: {
      workflow: 'story-wayfinder', sourceId: 's', sourceUri: 'u', sourceHash: 'h',
      capturedAt: '2026-08-18T00:00:00.000Z', approval: 'explicit',
    },
    createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  } as ProjectMemoryRecord
}

describe('annotationStaleness', () => {
  const a = record('mem-a', 'First decision.')
  const b = record('mem-b', 'Second decision.')

  it('is fresh when every support matches the snapshot', () => {
    const support = [recordLanguageFingerprint(a), recordLanguageFingerprint(b)]
    expect(annotationStaleness(support, { records: [a, b] })).toEqual({ stale: false })
  })

  it('reports language-changed with both hashes when a claim moved', () => {
    const support = [recordLanguageFingerprint(a)]
    const edited = record('mem-a', 'First decision, reworded.')
    const result = annotationStaleness(support, { records: [edited] })
    expect(result).toEqual({
      stale: true, cause: 'language-changed', changedRecordId: 'mem-a',
      previousContentHash: support[0].contentHash,
      currentContentHash: recordLanguageFingerprint(edited).contentHash,
    })
  })

  it('reports record-removed with only the previous hash when the id is absent', () => {
    const support = [recordLanguageFingerprint(a)]
    const result = annotationStaleness(support, { records: [b] })
    expect(result).toEqual({
      stale: true, cause: 'record-removed', changedRecordId: 'mem-a',
      previousContentHash: support[0].contentHash,
    })
  })

  it('first divergence wins when two supports moved', () => {
    const support = [recordLanguageFingerprint(a), recordLanguageFingerprint(b)]
    const result = annotationStaleness(support, { records: [] })
    if (!result.stale) throw new Error('expected stale')
    expect(result.changedRecordId).toBe('mem-a')
  })

  it('ignores status and supersedes flips entirely', () => {
    const support = [recordLanguageFingerprint(a)]
    const flipped = record('mem-a', 'First decision.', {
      status: 'superseded' as ProjectMemoryRecord['status'], supersedes: ['mem-x'],
    })
    expect(annotationStaleness(support, { records: [flipped] })).toEqual({ stale: false })
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/shared/annotationStaleness.test.ts` — FAIL (exports missing).

- [ ] **Step 3: Implement.** In `shared/projectMemoryAnnotations.ts` (after `RecordLanguageFingerprintSchema`; `sha256Hex` is already imported there; add the `ProjectMemoryRecord`/`ProjectMemorySnapshot` type imports from `./projectMemory`):

```ts
/** Hash of a record's language — claim and detail, never status or supersedes. */
export function recordLanguageFingerprint(record: ProjectMemoryRecord): RecordLanguageFingerprint {
  return {
    recordId: record.id,
    contentHash: sha256Hex(JSON.stringify({ claim: record.claim, detail: record.detail ?? null })),
  }
}

export type AnnotationStaleness =
  | { stale: false }
  | { stale: true
      cause: 'language-changed' | 'record-removed'
      changedRecordId: string
      previousContentHash?: string
      currentContentHash?: string }

/**
 * Does an annotation's premise still hold? Compares its stored support fingerprints
 * against the current snapshot, in support order; the FIRST divergence wins, matching
 * the invalidated event's single changedRecordId. Only language (claim/detail) and
 * record presence are visible here — status, supersedes, and safety flips can never
 * make an annotation stale, which is the design's guardrail against over-firing.
 */
export function annotationStaleness(
  support: RecordLanguageFingerprint[],
  snapshot: Pick<ProjectMemorySnapshot, 'records'>,
): AnnotationStaleness {
  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  for (const fingerprint of support) {
    const current = byId.get(fingerprint.recordId)
    if (current === undefined) {
      return {
        stale: true, cause: 'record-removed', changedRecordId: fingerprint.recordId,
        previousContentHash: fingerprint.contentHash,
      }
    }
    const currentHash = recordLanguageFingerprint(current).contentHash
    if (currentHash !== fingerprint.contentHash) {
      return {
        stale: true, cause: 'language-changed', changedRecordId: fingerprint.recordId,
        previousContentHash: fingerprint.contentHash, currentContentHash: currentHash,
      }
    }
  }
  return { stale: false }
}
```

In `server/projectMemory/annotationStore.ts`: delete its local `recordLanguageFingerprint`, add `recordLanguageFingerprint` and `annotationStaleness` to the existing import from `'../../shared/projectMemoryAnnotations'`, and add `recordLanguageFingerprint` to the existing `export { annotationIdFor }` line so current importers keep working.

- [ ] **Step 4: Run** `npx vitest run tests/shared/annotationStaleness.test.ts tests/server/annotationStore.test.ts` and `npm run check` — PASS (store suite proves the re-export path).
- [ ] **Step 5: Commit** (`feat(memory): shared annotation staleness comparator`).

---

### Task 2: Read-side surfacing — readiness 'stale' state and renderer suppression

**Files:**
- Modify: `shared/compose/whatsStandingReadiness.ts`
- Modify: `server/compose/whatsStandingRenderer.ts`
- Test: `tests/server/whatsStandingReport.test.ts`

**Interfaces:**
- Consumes: `annotationStaleness` from Task 1.
- Produces: `UnresolvedReferenceState` gains `'stale'`; `unresolvedReferences` emits it for approved annotations whose staleness fires; the renderer's `resolutionText` returns undefined for a stale approved annotation and its referent ids stay out of `sourceFieldIds`.

- [ ] **Step 1: Write the failing tests.** In `tests/server/whatsStandingReport.test.ts`, the `logWith` helper builds an `AnnotationLogState` with support `[{ recordId, contentHash: 'a'.repeat(64) }]` — a hash that never matches a real record, which makes existing approved-annotation fixtures stale the moment staleness is wired in. FIRST update `logWith` to compute the real fingerprint by default:

```ts
// in logWith, replace the support line:
support: [recordLanguageFingerprint(referencing)],
// adding to imports: recordLanguageFingerprint from '../../shared/projectMemoryAnnotations'
```

Run the suite after this change alone — it must still pass (the fixtures become honestly fresh; nothing else reads the hash yet). Then add to the `readiness` describe:

```ts
it('an approved resolution whose support no longer matches is stale and INCOMPLETE', () => {
  const { annotations, annotationId } = logWith(referencing, {
    status: 'approved', referentRecordIds: ['mem-target'],
  })
  const state = annotations.annotations.get(annotationId)!
  state.support = [{ recordId: referencing.id, contentHash: 'b'.repeat(64) }]
  const result = composeWhatsStanding({ snapshot: snapshot([referencing, referent]), runId: 'run-1', annotations })
  if (!result.ok) throw new Error('compose failed')
  expect(result.composed.fidelity.status).toBe('flagged')
  expect(result.composed.fidelity.warnings.some(w =>
    w.kind === 'unresolved_reference' && w.message.includes('stale'))).toBe(true)
})
```

And to the `status-only referent change` describe (guardrail — must still pass untouched, since Task 1's comparator ignores status): re-run it, no edits.

And a renderer test in the same file:

```ts
it('a stale approved resolution renders as unresolved, not "You resolved this"', () => {
  const { annotations, annotationId } = logWith(referencing, {
    status: 'approved', referentRecordIds: ['mem-target'],
  })
  annotations.annotations.get(annotationId)!.support =
    [{ recordId: referencing.id, contentHash: 'b'.repeat(64) }]
  const blocks = renderWhatsStandingBlocks(snapshot([referencing, referent]), annotations)
  const cue = blocks.find(b => b.type === 'leadInParagraph') as
    Extract<ComposedBlock, { type: 'leadInParagraph' }>
  expect(cue.text).toContain('does not resolve')
  expect(cue.text).not.toContain('You resolved this')
  expect(cue.sourceFieldIds).toEqual([referencing.id])
})
```

- [ ] **Step 2: Run** `npx vitest run tests/server/whatsStandingReport.test.ts` — new tests FAIL.

- [ ] **Step 3: Implement.**

`shared/compose/whatsStandingReadiness.ts`: extend the state union and the derivation —

```ts
export type UnresolvedReferenceState = 'unasked' | 'proposed' | 'cant-say' | 'invalidated' | 'stale'
```

In the loop, replace the approved comment branch:

```ts
else if (existing.status === 'approved') {
  // A resolution only stands while its premise does: a support fingerprint that no
  // longer matches memory means the writer resolved different wording than what now
  // exists, and showing that resolution as settled would be the original near-miss.
  state = annotationStaleness(existing.support, snapshot).stale ? 'stale' : undefined
}
```

(import `annotationStaleness` from `'../projectMemoryAnnotations'`).

`server/compose/whatsStandingRenderer.ts`, `resolutionText`: after the approved check, add

```ts
if (annotationStaleness(annotation.support, snapshot).stale) return undefined
```

(import from the shared module). The existing `sourceFieldIds` logic already keys off `resolved !== undefined`, so a stale annotation's referents drop out with no further change.

The compose-side warning message already interpolates the state name (`(${item.state})`), so `stale` reaches the banner and the panel's existing warning rendering with no client change.

- [ ] **Step 4: Run** `npx vitest run tests/server/whatsStandingReport.test.ts tests/server/whatsStandingReadHelper.test.ts tests/lib/whatsStandingPanel.test.tsx` and `npm run check` — PASS (read-helper byte-compare tests prove the read path still writes nothing).
- [ ] **Step 5: Commit** (`feat(compose): surface stale annotation resolutions as unresolved`).

---

### Task 3: Source hash annotation digest

**Files:**
- Modify: `shared/compose/whatsStandingSourceHash.ts`
- Test: `tests/server/whatsStandingReport.test.ts` (the `source hash` describe)

**Interfaces:**
- Consumes: `AnnotationLogState` (already a parameter).
- Produces: the hash object gains `annotationDigest`, present only when annotations were passed, built as: annotations sorted by annotationId, each contributing `{ annotationId, status, declineReason: declineReason ?? null, locator, referentRecordIds: referentRecordIds ?? null, support }`.

- [ ] **Step 1: Write the failing tests** (append to the `source hash` describe):

```ts
it('changes when a stored support fingerprint is tampered, same snapshot and revisions', () => {
  const referencing = record({ id: 'mem-ref', claim: 'Second decision. Superseded by beats 9-11.' })
  const referent = record({ id: 'mem-target', claim: 'Beat sequence: 15 beats across three acts.' })
  const snap = snapshot([referencing, referent])
  const fresh = logWith(referencing, { status: 'approved', referentRecordIds: ['mem-target'] })
  const tampered = logWith(referencing, { status: 'approved', referentRecordIds: ['mem-target'] })
  tampered.annotations.annotations.get(tampered.annotationId)!.support =
    [{ recordId: 'mem-ref', contentHash: 'b'.repeat(64) }]
  expect(computeWhatsStandingSourceHash(snap, fresh.annotations))
    .not.toBe(computeWhatsStandingSourceHash(snap, tampered.annotations))
})

it('changes between declined and cant-say with every other digest field equal', () => {
  const referencing = record({ id: 'mem-ref', claim: 'Second decision. Superseded by beats 9-11.' })
  const snap = snapshot([referencing])
  const declined = logWith(referencing, { status: 'declined', declineReason: 'declined' })
  const cantSay = logWith(referencing, { status: 'declined', declineReason: 'cant-say' })
  expect(computeWhatsStandingSourceHash(snap, declined.annotations))
    .not.toBe(computeWhatsStandingSourceHash(snap, cantSay.annotations))
})
```

Add `computeWhatsStandingSourceHash` to the test file's imports from `'../../shared/compose/whatsStandingSourceHash'`.

- [ ] **Step 2: Run** — both FAIL (hash currently ignores support and declineReason).

- [ ] **Step 3: Implement** in `computeWhatsStandingSourceHash`:

```ts
const annotationDigest = annotations === undefined ? undefined
  : [...annotations.annotations.values()]
      .sort((a, b) => (a.annotationId < b.annotationId ? -1 : 1))
      .map(a => ({
        annotationId: a.annotationId,
        status: a.status,
        declineReason: a.declineReason ?? null,
        locator: a.locator,
        referentRecordIds: a.referentRecordIds ?? null,
        support: a.support,
      }))
return stableHash({
  factSheet: buildWhatsStandingFactSheet(snapshot, annotations),
  revision: snapshot.revision,
  annotationRevision: annotations?.revision,
  annotationDigest,
  projectId: snapshot.projectId,
})
```

`undefined` values drop out of JSON, so annotation-free calls keep today's hash — the existing determinism and annotation-change tests must pass unmodified.

- [ ] **Step 4: Run** `npx vitest run tests/server/whatsStandingReport.test.ts` and `npm run check` — PASS.
- [ ] **Step 5: Commit** (`feat(compose): annotation digest in the report source hash`).

---

### Task 4: Store — declined re-propose gate

**Files:**
- Modify: `server/projectMemory/annotationStore.ts` (`propose`)
- Test: `tests/server/annotationStore.test.ts`

**Interfaces:**
- Consumes: `annotationStaleness` (Task 1).
- Produces: `propose` throws `AnnotationStoreError('…','conflict')` when re-proposing a `declined` annotation whose support is fresh; succeeds when stale. `invalidated` re-proposals are untouched.

- [ ] **Step 1: Write the failing tests** (extend the `question scope and shape` or a new describe; the file's `seeded`, `expectLogUnchanged` helpers exist):

```ts
it('refuses to re-propose a declined question whose wording has not moved', async () => {
  const { projectPath } = await seeded()
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  const [q] = await annotationStore.pendingQuestions(projectPath, snapshot)
  await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-1')
  await annotationStore.decline(projectPath, snapshot, q.annotationId, 'declined', 'run-1')
  await expectLogUnchanged(projectPath, () =>
    annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-2'))
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
  decline.support[0].contentHash = 'b'.repeat(64)
  await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  const state = await annotationStore.propose(projectPath, snapshot, q.annotationId, 'run-2')
  expect(state.status).toBe('proposed')
})
```

Note: `expectLogUnchanged` asserts the rejection is an `AnnotationStoreError`; also assert `reason: 'conflict'` by catching if the helper doesn't already.

- [ ] **Step 2: Run** — first test FAILS (propose currently accepts any declined annotation).

- [ ] **Step 3: Implement** in `propose`, where the existing check reads
`if (existing !== undefined && existing.status !== 'declined' && existing.status !== 'invalidated')`:
keep that check, and immediately after it add:

```ts
if (existing !== undefined && existing.status === 'declined'
  && !annotationStaleness(existing.support, current).stale) {
  throw new AnnotationStoreError(
    'This question was declined and the wording it was judged against has not changed.',
    'conflict')
}
```

(`current` is the in-lock snapshot already read a few lines above.)

- [ ] **Step 4: Run** `npx vitest run tests/server/annotationStore.test.ts` and `npm run check` — PASS, including the pre-existing "a decline is durable" test (it never re-proposes) and "invalidation aftermath" (re-propose from invalidated must remain ungated).
- [ ] **Step 5: Commit** (`feat(memory): store-enforced declined re-propose gate`).

---

### Task 5: Store — `invalidateStale` producer and writer-path sweeps

**Files:**
- Modify: `server/projectMemory/annotationStore.ts`
- Test: `tests/server/annotationStore.test.ts`

**Interfaces:**
- Produces (on `AnnotationQueries`):

```ts
invalidateStale(projectPath: string): Promise<
  { annotationId: string; cause: 'language-changed' | 'record-removed'; changedRecordId: string }[]>
```

- `propose` and `answerQuestion` prepend the same sweep's events to their own batches. Sequence inside each locked section: replay → in-lock snapshot → build sweep events (approved + stale only) → build the method's own events on the state threaded through the sweep preflights → preflight everything → append everything.

- [ ] **Step 1: Extract the shared batch core.** Refactor first, no behavior change: a private helper

```ts
function buildInvalidationEvents(
  state: AnnotationLogState,
  snapshot: ProjectMemorySnapshot,
  projectId: string,
  at: string,
): AnnotationEvent[]
```

that walks `state.annotations` in annotationId-sorted order (determinism), and for each `status === 'approved'` annotation whose `annotationStaleness(a.support, snapshot)` is stale, emits one `annotation-invalidated` event: `{ type, projectId, annotationId, annotationRevision: <threaded ++>, at, cause, changedRecordId, previousContentHash?, currentContentHash? }` — hashes included exactly as the staleness result carries them (both for language-changed, previous-only for record-removed). Run the existing suite — still green (nothing calls it yet).

- [ ] **Step 2: Write the failing tests:**

```ts
describe('invalidation producer', () => {
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

  async function tamperApprovedSupport(projectPath: string) {
    const filePath = path.join(projectPath, 'memory', 'annotations.jsonl')
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    const approved = lines.find(l => l.type === 'annotation-approved')
    approved.support[0].contentHash = 'b'.repeat(64)
    await writeFile(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  }

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
})
```

- [ ] **Step 3: Run** — FAIL (`invalidateStale` missing; sweep absent).

- [ ] **Step 4: Implement.**

`invalidateStale` on the store object:

```ts
async invalidateStale(projectPath) {
  return withLock(projectPath, async projectId => {
    const state = await replayAnnotations(projectPath, projectId)
    const current = await projectMemoryStore.readSnapshotReadOnlyInHeldLock(projectPath, projectId)
    const events = buildInvalidationEvents(state, current, projectId, new Date().toISOString())
    if (events.length === 0) return []
    let next = state
    for (const event of events) next = preflightAnnotationEvent(next, event)
    for (const event of events) await appendAnnotationEvent(projectPath, event)
    return events.map(e => ({
      annotationId: e.annotationId,
      cause: (e as { cause: 'language-changed' | 'record-removed' }).cause,
      changedRecordId: (e as { changedRecordId: string }).changedRecordId,
    }))
  })
},
```

Sweeps: in `propose` and `answerQuestion`, immediately after the in-lock snapshot read, call `buildInvalidationEvents(state, current, projectId, at)`, thread the preflights (`let next = state; for (const e of sweep) next = preflightAnnotationEvent(next, e)`), and build the method's own events against `next`'s revision. Preflight the method's events on `next`, then append sweep events followed by the method's events. In `propose`, note the interplay the sweep enables: an approved-stale annotation being re-proposed is invalidated by the sweep first, making the re-propose legal — the CLI path becomes self-healing. In `answerQuestion`, the `questionVersion` check runs after the sweep (against `current`, unchanged semantics).

- [ ] **Step 5: Run** `npx vitest run tests/server/annotationStore.test.ts tests/server/whatsStandingRoutes.test.ts` and `npm run check` — PASS (route suite proves the answer endpoint still behaves; its seeded fixtures are never stale, so sweeps are no-ops there).
- [ ] **Step 6: Commit** (`feat(memory): invalidation producer with writer-path sweeps`).

---

### Task 6: CLI `invalidate` command

**Files:**
- Modify: `server/projectMemory/cli.ts`
- Test: `tests/server/annotationStore.test.ts` (beside the existing `report command` describe)

**Interfaces:**
- Consumes: `annotationStore.invalidateStale`.
- Produces: `npm run memory -- invalidate --project <path>` → per-invalidation line `Invalidated <annotationId>: <cause> (<changedRecordId>)`, or `Nothing to invalidate — all resolutions still hold.`; exit 0 both ways; `AnnotationStoreError` maps through the existing handler (2/3/1).

- [ ] **Step 1: Write the failing test:**

```ts
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
    // approve then tamper (reuse the producer describe's helpers or inline equivalents)
    // ... approveOne(projectPath); tamperApprovedSupport(projectPath) — hoist those two
    // helpers to file scope in Task 5 so this test can share them.
    const stale = await run()
    expect(stale.code).toBe(0)
    expect(stale.text).toContain('Invalidated ann_')
    expect(stale.text).toContain('language-changed')
  })
})
```

(Task 5 hoists `approveOne`/`tamperApprovedSupport` to file scope; this task uses them.)

- [ ] **Step 2: Run** — FAIL (unknown command).

- [ ] **Step 3: Implement** in `cli.ts`, following `runReport`'s shape:

```ts
/**
 * `invalidate` — sweep for annotation resolutions whose premise no longer holds and
 * durably reopen them. The recovery tool for a restored or hand-edited package; writer
 * paths run the same sweep automatically.
 */
async function runInvalidate(args: ParsedArguments, io: ProjectMemoryCliIo): Promise<number> {
  assertAllowedOptions(args, ['project'], [])
  const project = await safeProjectPath(args)
  await project.verify()
  const invalidated = await annotationStore.invalidateStale(project.path)
  if (invalidated.length === 0) {
    io.stdout('Nothing to invalidate — all resolutions still hold.\n')
    return 0
  }
  for (const item of invalidated) {
    io.stdout(`Invalidated ${item.annotationId}: ${item.cause} (${item.changedRecordId})\n`)
  }
  return 0
}
```

Register `if (args.command === 'invalidate') return await runInvalidate(args, io)` in `runProjectMemoryCli`.

- [ ] **Step 4: Run** `npx vitest run tests/server/annotationStore.test.ts` and `npm run check` — PASS.
- [ ] **Step 5: Commit** (`feat(memory): CLI invalidate command`).

---

### Task 7: Full verification and live tamper check

**Files:** none new.

- [ ] **Step 1:** `npm run check && npm run test:run && npm run build` — all green, zero regressions (the read-only byte-compare suites and the panel suites prove the contracts held).
- [ ] **Step 2:** `writeros-backup` — REQUIRED before touching any real package.
- [ ] **Step 3:** Live tamper check on a SCRATCH COPY, never the real package: `cp -R "$HOME/WriterOS Projects/Stool Pigeon (785623e6).writeros" /tmp-scratch-path`, tamper one approved annotation's support hash in the copy's `memory/annotations.jsonl`, run `npm run memory -- report --project <copy>` (expect INCOMPLETE with a `(stale)` item, no write), then `npm run memory -- invalidate --project <copy>` (expect the invalidation line), then `questions` (expect the question re-asked). Delete the scratch copy afterwards.
- [ ] **Step 4:** Confirm the REAL package is untouched: `npm run memory -- report --project <real>` output unchanged from before the exercise.
- [ ] **Step 5: Commit** anything outstanding; report with evidence.

---

## Self-review notes

- Spec coverage: comparator (T1), readiness+renderer surfacing (T2), source-hash digest with declineReason (T3), decline gate (T4), producer + sweeps + atomicity (T5), CLI (T6), guardrails re-asserted (T5 tests + T2's untouched status-only test), read-only contracts (T2/T5 run the byte-compare suites), live check with backup and scratch-copy discipline (T7).
- Type consistency: `AnnotationStaleness` defined once (T1) and consumed by readiness (T2), renderer (T2), gate (T4), producer (T5). `buildInvalidationEvents` private to the store; `invalidateStale`'s return type inlined at both definition and CLI consumption.
- T2's `logWith` fixture change is deliberately its own first step with a green-suite checkpoint, because every later task's stale-simulation depends on fixtures being honestly fresh by default.
