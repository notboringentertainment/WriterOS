# Project Meeting Revisions + Pitch Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add revision-aware Project Meeting rounds and a writer-reviewed, persisted Pitch Packet export without changing immutable Meeting history or mixing in OpenSwarm retirement work.

**Architecture:** Keep `interview_sessions.answers` and `bank_snapshot` immutable. Add an append-only `meeting_decisions` ledger; derive active direction through one pure fold and atomically persist new decisions beside existing bank writes through a wrapper RPC. Build Pitch Packets as a deterministic join of client-supplied structured documents and server-owned Meeting direction, persist draft/approved/exported rows, then render deterministic Markdown and JSON downloads client-side.

**Tech Stack:** TypeScript, React, Express, Zod, Supabase/Postgres migrations and RPCs, Vitest, React Testing Library.

## Global Constraints

- Source contracts: `docs/product/project-meeting-revisions-pitch-packet-export-prd.md` and `docs/product/2026-07-14-prd-dependency-sequence-note.md`.
- Branch: `codex/project-meeting-pitch-packet`, based on `origin/main` at `44ea520`.
- OpenSwarm retirement is out of scope. Do not modify `server/persona-capability/runPersonaTask.ts`, OpenSwarm packages, or `codex/openswarm-phase3-native-research`.
- Preserve `interview_sessions.seed_text`, `answers`, and `bank_snapshot` as immutable history.
- Store writer revisions only as append-only `meeting_decisions` rows.
- Store redirects only in typed `cursor.redirects`; redirects affect current session question reconstruction, never later audits.
- Audit verdicts are exactly `SUFFICIENT | SUFFICIENT_FROM_PRIOR | THIN`.
- Preserve same-session bank idempotency. Do not add cross-session concurrent-bank tests; partial unique index makes that state unreachable.
- Preview and commit use same pure projection input and must remain byte-identical. CAS failures include `projection_conflict`, `locks_conflict`, and `direction_conflict`, with at most three attempts.
- Pitch Packet source precedence, approval rules, filenames, Markdown structure, and JSON schema follow PRD exactly.
- `pitch_packets.session_id` is required and references `interview_sessions(id)`.
- Read paths never write ledger rows or perform backfill.
- All migrations are additive. Migration files and migration-content tests may be committed; never apply migrations to dev or production without separate user authorization.
- After every task run focused tests, `npm run check`, and `npm run test:run`. One commit per task. Run `npm run build` at final gate.
- Never stage or modify `AGENTS.md`, `supabase/.temp/`, or the stashed OpenSwarm PRD edit.

## File Map

- `server/room/interview/meetingDecisions.ts`: ledger contracts, normalization, deterministic fold, recap and direction-diff helpers.
- `server/room/interview/meetingDecisionsStore.ts`: ledger-only Supabase reads; no read-time writes.
- `server/room/interview/auditContext.ts`: active-decision and legacy-snapshot coverage builder.
- `server/room/interview/types.ts`: verdict, redirect, decision-operation, recap, and preview response types.
- `server/room/interview/audit.ts`, `questionBank.ts`, `stateMachine.ts`, `runtime.ts`, `banking.ts`: context-aware audit, redirect queue, recap actions, preview parity, atomic bank.
- `server/room/lockSections.ts`: render Meeting-owned lock section from active fold while preserving surface-owned section.
- `shared/pitchPacket.ts`: single Zod schema, composer, validation, precedence, Markdown/JSON renderers, filenames.
- `server/room/interview/pitchPacketStore.ts`: packet row persistence and exported-row reads.
- `server/room/interview/pitchPacketRuntime.ts`: draft/approve/export lifecycle and AI proposal orchestration.
- `server/room/roomRoutes.ts`: guarded Meeting operation and packet lifecycle routes.
- `client/src/lib/roomApi.ts`, `useInterviewSession.ts`: typed transport and state/actions.
- `client/src/components/ritual/ProjectMeetingPage.tsx`: recap and exact direction diff.
- `client/src/components/ritual/PitchPacketReview.tsx`: field review, provenance, conflict resolution, approval, export, re-download.
- `client/src/App.tsx`: pass current `project.state.documents` into Meeting flow.
- `supabase/migrations/20260714000001_meeting_revisions_pitch_packets.sql`: additive tables, indexes, immutable guards, wrapper bank/export RPCs, explicit backfill RPC.
- `scripts/backfill-meeting-decisions.mjs`: manually invoked backfill client; never runs from reads or startup.

---

### Task 1: Shared decision-ledger contracts and deterministic fold

**Files:**
- Create: `server/room/interview/meetingDecisions.ts`
- Modify: `server/room/interview/types.ts`
- Create: `tests/server/room/meetingDecisionsFold.test.ts`

**Interfaces:**
- Produces `MeetingDecisionOp = 'assert' | 'revise' | 'retract' | 'supersede' | 'redirect'`.
- Produces `MeetingDecisionRow`, `MeetingDecisionContent`, `ActiveMeetingDirection`, `DirectionDiffEntry`, and `foldMeetingDecisions(rows, onInvalid?)`.
- Fold ordering is `created_at`, then `id`; redirect/retract never become active content.
- Invalid entries are excluded and reported; valid targets on a partially malformed entry still deactivate.

- [ ] **Step 1: Write failing fold tests**

```ts
const decision = (input: Partial<MeetingDecisionRow> & Pick<MeetingDecisionRow, 'id' | 'op'>): MeetingDecisionRow => ({
  id: input.id,
  project_id: 'p1',
  session_id: 's1',
  area: input.area ?? 'locks',
  field_path: input.field_path ?? 'story_locks',
  op: input.op,
  content: input.content ?? { statement: input.id, mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' },
  targets: input.targets ?? [],
  created_at: input.created_at ?? '2026-07-14T00:00:00.000Z',
})

it('leaves only C active for A -> B -> C revise chain', () => {
  const active = foldMeetingDecisions([
    decision({ id: 'a', op: 'assert' }),
    decision({ id: 'b', op: 'revise', targets: ['a'], created_at: '2026-07-14T00:01:00.000Z' }),
    decision({ id: 'c', op: 'revise', targets: ['b'], created_at: '2026-07-14T00:02:00.000Z' }),
  ])
  expect(active.entries.map(row => row.id)).toEqual(['c'])
})

it.each(['retract', 'redirect'] as const)('%s never becomes active content', op => {
  expect(foldMeetingDecisions([decision({ id: 'x', op })]).entries).toEqual([])
})
```

Add cases for deterministic tie-breaking, multi-target supersede, duplicate targeting, later/missing/non-content targets, partial malformed targets, and empty ledger.

- [ ] **Step 2: Run test and verify failure**

Run: `npm run test:run -- tests/server/room/meetingDecisionsFold.test.ts`

Expected: FAIL because `meetingDecisions.ts` does not exist.

- [ ] **Step 3: Add exact ledger types and fold**

```ts
export type MeetingDecisionOp = 'assert' | 'revise' | 'retract' | 'supersede' | 'redirect'

export interface MeetingDecisionContent {
  statement: string
  mutability: MeetingMutability
  originMarker: '[SEED]' | '[EXTRAPOLATED]' | '[INVENTED]'
  disposition: AnswerDisposition
}

export interface MeetingDecisionRow {
  id: string
  project_id: string
  session_id: string
  area: string
  field_path: string
  op: MeetingDecisionOp
  content: MeetingDecisionContent | Record<string, never>
  targets: string[]
  created_at: string
}

export function foldMeetingDecisions(
  rows: readonly MeetingDecisionRow[],
  onInvalid: (event: MeetingDecisionInvariantEvent) => void = defaultInvariantReporter,
): ActiveMeetingDirection
```

Use one sorted copy, one `contentById` map, and one `deactivated` set. Validate every target against earlier content-bearing entries. In tests/development, reporter throws; production reporter logs `[meeting.direction] invalid ledger entry` and fold excludes malformed source entry.

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/server/room/meetingDecisionsFold.test.ts && npm run check && npm run test:run`

Expected: focused test PASS; typecheck PASS; full suite PASS.

- [ ] **Step 5: Commit task**

```bash
git add server/room/interview/meetingDecisions.ts server/room/interview/types.ts tests/server/room/meetingDecisionsFold.test.ts
git commit -m "feat: add meeting decision fold"
```

---

### Task 2: Additive Meeting/Pitch Packet migration and content tests

**Files:**
- Create: `supabase/migrations/20260714000001_meeting_revisions_pitch_packets.sql`
- Create: `tests/server/room/meetingRevisionsMigration.test.ts`
- Create: `scripts/backfill-meeting-decisions.mjs`

**Interfaces:**
- Adds tables exactly matching PRD: `meeting_decisions` and `pitch_packets`.
- Adds `bank_meeting_round(...) returns text` without changing existing `bank_meeting_memory(...)` signature.
- Adds `export_pitch_packet(p_project_id text, p_session_id uuid, p_packet_id uuid) returns pitch_packets`.
- Adds `backfill_meeting_decisions(p_project_id text default null) returns bigint`; service-role only, idempotent by stable snapshot-derived key checks.

- [ ] **Step 1: Write migration-content tests before SQL**

```ts
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260714000001_meeting_revisions_pitch_packets.sql'),
  'utf8',
)

it('adds append-only decision ledger with required indexes', () => {
  expect(migration).toMatch(/create table if not exists meeting_decisions/i)
  expect(migration).toMatch(/project_id text not null/i)
  expect(migration).toMatch(/session_id uuid not null references interview_sessions\(id\)/i)
  expect(migration).toMatch(/targets uuid\[\] not null default '\{\}'/i)
  expect(migration).toMatch(/using gin \(targets\)/i)
})

it('preserves old bank RPC and wraps ledger writes in one transaction', () => {
  expect(migration).toMatch(/create or replace function bank_meeting_round\(/i)
  expect(migration).toContain("bank_meeting_memory(")
  expect(migration).toContain("direction_conflict")
  expect(migration).toMatch(/insert into meeting_decisions/i)
})
```

Add assertions for packet fields/indexes, one unexported packet per session, immutable exported packets, `approved -> exported` transaction, service-role grants, read-free backfill, and no destructive `drop table`, `drop column`, or document schema changes.

- [ ] **Step 2: Run test and verify failure**

Run: `npm run test:run -- tests/server/room/meetingRevisionsMigration.test.ts`

Expected: FAIL because migration does not exist.

- [ ] **Step 3: Write additive SQL**

```sql
create table if not exists meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  session_id uuid not null references interview_sessions(id),
  area text not null,
  field_path text not null,
  op text not null check (op in ('assert','revise','retract','supersede','redirect')),
  content jsonb not null default '{}'::jsonb,
  targets uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists pitch_packets (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  session_id uuid not null references interview_sessions(id),
  packet jsonb not null,
  packet_version int not null,
  status text not null check (status in ('draft','approved','exported')),
  direction_revision bigint not null,
  created_at timestamptz not null default now(),
  exported_at timestamptz
);
```

Add indexes on decision `project_id`, `session_id`, GIN `targets`; packet `(project_id, created_at)`, `session_id`; partial unique index for one `draft`/`approved` packet per session. Add immutable triggers for ledger rows and exported packet rows. `bank_meeting_round` first locks/checks current `concept_seed.revision` against `p_direction_revision`, calls existing `bank_meeting_memory`, returns immediately on `already_banked`, then inserts `p_decisions` with `jsonb_to_recordset`. `export_pitch_packet` locks packet/session, requires approved packet and banked session, updates both, returns exported row.

Backfill derives only `assert` rows from terminal sessions with `bank_snapshot`; deterministic existence predicate is `(session_id, area, field_path, op, content)` so reruns insert zero duplicates. Script calls RPC only when operator supplies `--project-id` or `--all`.

- [ ] **Step 4: Verify migration content only**

Run: `npm run test:run -- tests/server/room/meetingRevisionsMigration.test.ts && npm run check && npm run test:run`

Expected: focused test PASS; typecheck PASS; full suite PASS. No Supabase command runs.

- [ ] **Step 5: Commit task**

```bash
git add supabase/migrations/20260714000001_meeting_revisions_pitch_packets.sql tests/server/room/meetingRevisionsMigration.test.ts scripts/backfill-meeting-decisions.mjs
git commit -m "feat: add meeting revision persistence"
```

**DEV-SUPABASE MIGRATION GATE:** Stop before `supabase db reset`, `supabase migration up`, `supabase db push`, direct SQL execution, or backfill. Request separate authorization. If authorization is withheld, continue unit/store/route/UI work against fakes; keep real-DB integration tests skipped and report them unrun.

---

### Task 3: Ledger store and read-only legacy audit context

**Files:**
- Create: `server/room/interview/meetingDecisionsStore.ts`
- Create: `server/room/interview/auditContext.ts`
- Create: `tests/server/room/meetingDecisionsStore.test.ts`
- Modify: `tests/server/room/interviewStore.test.ts`

**Interfaces:**
- `listMeetingDecisions(projectId): Promise<MeetingDecisionRow[]>` ordered `created_at`, then `id`.
- `getActiveMeetingDirection(projectId): Promise<ActiveMeetingDirection>`.
- `buildAuditContext({ projectId, sessions, storyLocks, openQuestions }): Promise<InterviewAuditContext>`.
- When a terminal session has no ledger rows, fallback derives in-memory coverage from `bank_snapshot.applied_classifications` and matching adopted proposal/answer metadata. No insert/update/RPC from any read helper.

- [ ] **Step 1: Write failing fake-Supabase tests**

```ts
it('orders ledger reads deterministically and never writes', async () => {
  const rows = await listMeetingDecisions('p1')
  expect(rows.map(row => row.id)).toEqual(['a', 'b'])
  expect(fake.from).toHaveBeenCalledWith('meeting_decisions')
  expect(fake.insert).not.toHaveBeenCalled()
  expect(fake.update).not.toHaveBeenCalled()
})

it('derives prior coverage in memory when legacy session has no ledger rows', async () => {
  const context = await buildAuditContext(legacyFixture)
  expect(context.coveredAreas).toContain('locks')
  expect(fake.insert).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm run test:run -- tests/server/room/meetingDecisionsStore.test.ts tests/server/room/interviewStore.test.ts`

Expected: FAIL because new modules do not exist.

- [ ] **Step 3: Implement read helpers**

Use `getRoomDb()` and `__setRoomDbForTests` fake pattern already used by `server/room/interview/store.ts`. Reuse `resolveCanonicalFieldPath` by exporting it from `banking.ts`; do not duplicate mapping logic. Build fallback objects with synthetic in-memory IDs prefixed `legacy:<session_id>:`; never pass them to persistence.

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/server/room/meetingDecisionsStore.test.ts tests/server/room/interviewStore.test.ts && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add server/room/interview/meetingDecisionsStore.ts server/room/interview/auditContext.ts server/room/interview/banking.ts tests/server/room/meetingDecisionsStore.test.ts tests/server/room/interviewStore.test.ts
git commit -m "feat: read meeting direction context"
```

---

### Task 4: Context-aware audit, recap, and session-local redirects

**Files:**
- Modify: `server/room/interview/types.ts`
- Modify: `server/room/interview/audit.ts`
- Modify: `server/room/interview/questionBank.ts`
- Modify: `server/room/interview/stateMachine.ts`
- Modify: `server/room/interview/store.ts`
- Modify: `server/room/interview/runtime.ts`
- Modify: `tests/server/room/interviewAudit.test.ts`
- Modify: `tests/server/room/interviewQuestionBank.test.ts`
- Modify: `tests/server/room/interviewStateMachine.test.ts`
- Modify: `tests/server/room/interviewStore.test.ts`
- Modify: `tests/server/room/interviewRuntime.test.ts`

**Interfaces:**
- `AuditVerdict = 'SUFFICIENT' | 'SUFFICIENT_FROM_PRIOR' | 'THIN'`.
- `InterviewCursor.redirects: InterviewRedirect[]`; row mapper/defaulting treats missing field as `[]`.
- `InterviewStatus.recap: MeetingRecapItem[]`.
- `redirectInterviewArea({ projectId, sessionId, area, questionId })` appends one unanswered redirect per area.
- Question reconstruction is base thin questions followed by unanswered redirected questions, deduped by question id.

- [ ] **Step 1: Write failing audit and redirect tests**

```ts
it('uses new seed before prior direction coverage', () => {
  expect(auditSeed('The ending is locked.', { speculative: false, context }).verdicts.ending).toBe('SUFFICIENT')
})

it('marks active prior coverage without re-asking', () => {
  const result = auditSeed('', { speculative: false, context: contextWithArea('ending') })
  expect(result.verdicts.ending).toBe('SUFFICIENT_FROM_PRIOR')
  expect(selectQuestionsForAudit({ audit: result.verdicts, mode: 'full', speculative: false }).map(q => q.trigger)).not.toContain('ending')
})

it('dedupes unanswered redirects and stamps answered_at after answer', async () => {
  await redirectInterviewArea({ projectId: 'p1', sessionId: 's2', area: 'ending', questionId: 'morgan-ending' })
  await redirectInterviewArea({ projectId: 'p1', sessionId: 's2', area: 'ending', questionId: 'morgan-ending' })
  expect(saved.cursor.redirects).toHaveLength(1)
  await answerInterviewQuestion(answerInput)
  expect(saved.cursor.redirects[0].answered_at).toMatch(/^2026-/)
})
```

Add absent-field normalization, redirected order after base questions, skip stamping, pause/resume preservation, speculative `world_rules`, and redirects excluded from audit context.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- tests/server/room/interviewAudit.test.ts tests/server/room/interviewQuestionBank.test.ts tests/server/room/interviewStateMachine.test.ts tests/server/room/interviewRuntime.test.ts`

Expected: FAIL on missing verdict, recap, and redirect contracts.

- [ ] **Step 3: Implement audit and redirect flow**

```ts
export interface InterviewRedirect {
  area: string
  question_id: string
  at: string
  answered_at: string | null
}

export interface InterviewCursor {
  lane: string | null
  question_id: string | null
  budgets_spent: Record<string, number>
  redirects: InterviewRedirect[]
}
```

Normalize cursor at store boundary. `auditSeed` checks regex first, then `context.coveredAreas`. `startInterview` loads sessions, ledger, `story_locks`, and `open_questions` before audit; returns recap items from active direction. `reconstructInterviewQuestions(session)` unions base questions with unanswered redirects. Replace two-step answer/cursor writes with `appendInterviewAnswerAndUpdateCursor(sessionId, entry, patch)`: one read-modify-write updates `answers`, `cursor`, and next `state` on one session row. No redirect ledger insert occurs yet.

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/server/room/interviewAudit.test.ts tests/server/room/interviewQuestionBank.test.ts tests/server/room/interviewStateMachine.test.ts tests/server/room/interviewStore.test.ts tests/server/room/interviewRuntime.test.ts && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add server/room/interview/types.ts server/room/interview/audit.ts server/room/interview/questionBank.ts server/room/interview/stateMachine.ts server/room/interview/store.ts server/room/interview/runtime.ts tests/server/room/interviewAudit.test.ts tests/server/room/interviewQuestionBank.test.ts tests/server/room/interviewStateMachine.test.ts tests/server/room/interviewStore.test.ts tests/server/room/interviewRuntime.test.ts
git commit -m "feat: add meeting recap and redirects"
```

---

### Task 5: Revision operations, exact preview, and atomic bank parity

**Files:**
- Modify: `server/room/interview/meetingDecisions.ts`
- Modify: `server/room/interview/banking.ts`
- Modify: `server/room/interview/runtime.ts`
- Modify: `server/room/lockSections.ts`
- Modify: `tests/server/room/interviewBanking.test.ts`
- Modify: `tests/server/room/bankMeetingMemory.test.ts`
- Modify: `tests/server/room/lockSections.test.ts`
- Modify: `tests/server/room/interviewRuntime.test.ts`

**Interfaces:**
- `MeetingRevisionInput` accepts only `keep | revise | retract | supersede`; redirect remains separate immediate action.
- `buildPendingMeetingDecisions(...)` creates new assertions, revision operations, and one audit-only redirect row per cursor element.
- `previewBankFinal` returns `directionDiff`, `directionRevision`, `preview`, and exact `finalValues`.
- `bankInterview` sends exact preview decisions and direction revision to `bank_meeting_round` and retries named CAS conflicts three times.

- [ ] **Step 1: Write failing parity and projection tests**

```ts
it('renders Meeting locks from active fold and preserves surface section', () => {
  const rendered = renderMeetingLocksFromDirection(currentLocks, activeWithoutRetractedLock)
  expect(rendered).toContain('## Surface-declared locks\nNever change this surface lock.')
  expect(rendered).not.toContain('Retracted Meeting lock')
})

it('uses byte-identical preview values and RPC payload', async () => {
  const result = await previewBankFinal(input)
  await bankInterview(input)
  expect(rpcArgs.p_concept_seed).toBe(result.finalValues.concept_seed)
  expect(rpcArgs.p_locks_next).toBe(result.finalValues.story_locks)
  expect(rpcArgs.p_open_questions).toBe(result.finalValues.open_questions)
  expect(rpcArgs.p_decisions).toEqual(result.pendingDecisions)
})

it('retries direction_conflict exactly three times', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'direction_conflict' } })
  await expect(bankInterview(input)).rejects.toThrow('contention persisted across 3 attempts')
  expect(rpc).toHaveBeenCalledTimes(3)
})
```

Add revise/retract/supersede diff cases, keep/no-entry, redirect conversion, same-session `already_banked` no-op, malformed targets, and immutable prior snapshots.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- tests/server/room/interviewBanking.test.ts tests/server/room/bankMeetingMemory.test.ts tests/server/room/lockSections.test.ts tests/server/room/interviewRuntime.test.ts`

Expected: FAIL on missing direction diff/RPC behavior.

- [ ] **Step 3: Implement one projection pipeline**

Create `computeBankPlan()` returning:

```ts
{
  preview: BankPreview,
  directionDiff: DirectionDiffEntry[],
  directionRevision: number,
  pendingDecisions: PendingMeetingDecision[],
  finalValues: { concept_seed: string; story_locks: string; open_questions: string },
  bankSnapshot: MeetingBankSnapshot,
  locksExpected: string,
}
```

Both preview and bank call this function. Bank recomputes on each CAS retry, never commits cached stale values. Replace `mergeMeetingLocks(currentLocks, preview.locks)` with `renderMeetingLocksFromDirection(currentLocks, foldedDirection)`; preserve `renderLockSections` surface ownership. `already_banked` returns stored session/preview and never creates duplicate ledger rows.

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/server/room/interviewBanking.test.ts tests/server/room/bankMeetingMemory.test.ts tests/server/room/lockSections.test.ts tests/server/room/interviewRuntime.test.ts && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add server/room/interview/meetingDecisions.ts server/room/interview/banking.ts server/room/interview/runtime.ts server/room/lockSections.ts tests/server/room/interviewBanking.test.ts tests/server/room/bankMeetingMemory.test.ts tests/server/room/lockSections.test.ts tests/server/room/interviewRuntime.test.ts
git commit -m "feat: bank revisioned meeting direction"
```

---

### Task 6: Meeting revision routes, client transport, recap UI, and direction diff

**Files:**
- Modify: `server/room/roomRoutes.ts`
- Modify: `client/src/lib/roomApi.ts`
- Modify: `client/src/lib/useInterviewSession.ts`
- Modify: `client/src/components/ritual/ProjectMeetingPage.tsx`
- Modify: `tests/server/room/roomRoutesInterview.test.ts`
- Modify: `tests/server/room/roomRoutesMemoryGuard.test.ts`
- Modify: `tests/lib/roomApi.test.ts`
- Modify: `tests/lib/useInterviewSession.test.tsx`
- Modify: `tests/components/ProjectMeetingPage.test.tsx`

**Interfaces:**
- `POST /api/room/:projectId/interview/:sessionId/redirect` body `{area, questionId}`.
- Existing `bank-preview` and `bank` bodies gain `operations: MeetingRevisionInput[]`. Revision operations remain client in-flight until atomic bank; no server draft state or new session column is introduced.
- Existing status/start/preview responses gain typed `recap`, `directionDiff`, and `directionRevision` fields.
- Every new route uses `requireRoom`, `ensureMemoryOr503`, `handleInterviewError`, and `assertSessionProject` patterns.

- [ ] **Step 1: Write failing route/hook/component tests**

```tsx
expect(await screen.findByText("What's standing from earlier rounds")).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'Ask me again' }))
expect(apiMock.redirectInterviewArea).toHaveBeenCalledWith('p1', 's2', 'ending', 'morgan-ending')

fireEvent.click(screen.getByRole('button', { name: 'Retract' }))
expect(await screen.findByText(/Your Round 1 answer stays in the record/)).toBeInTheDocument()
expect(screen.getByText('Exactly what this round changes')).toBeInTheDocument()
```

Route tests assert sanitized bodies, project/session binding, 503 guard, and no internal words (`assert`, `ledger`, `fold`, `projection`) in UI payload copy.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesMemoryGuard.test.ts tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx tests/components/ProjectMeetingPage.test.tsx`

Expected: FAIL because transport/UI contracts are missing.

- [ ] **Step 3: Implement transport and UI**

Extend `InterviewSession.cursor` type with redirects and `InterviewStatus` with recap. Hook owns revision-operation draft state and posts it in both existing preview and bank requests, preserving latest-preview sequence guard. Render recap before questioning. Exact controls/copy:

```text
What's standing from earlier rounds
Keep · Revise · Retract · Ask me again
Answered in Round {n}. We won't re-ask unless you reopen it.
Retracting removes this from your project's active direction. Your Round {n} answer stays in the record.
Exactly what this round changes
```

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesMemoryGuard.test.ts tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx tests/components/ProjectMeetingPage.test.tsx && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add server/room/roomRoutes.ts client/src/lib/roomApi.ts client/src/lib/useInterviewSession.ts client/src/components/ritual/ProjectMeetingPage.tsx tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesMemoryGuard.test.ts tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx tests/components/ProjectMeetingPage.test.tsx
git commit -m "feat: add meeting revision controls"
```

---

### Task 7: Shared Pitch Packet schema, composer, and renderers

**Files:**
- Create: `shared/pitchPacket.ts`
- Create: `tests/shared/pitchPacket.test.ts`
- Create: `tests/shared/pitchPacketMarkdown.test.ts`
- Modify: `shared/seedMarkdown.ts` only if a reusable escaping/slug helper must be exported; do not duplicate prefaces.

**Interfaces:**
- Exports `PITCH_PACKET_VERSION = 1`, `PitchPacketFieldSchema`, `PitchPacketSchema`, `PitchPacket`, `composePitchPacket`, `validatePitchPacketForApproval`, `renderPitchPacketMarkdown`, `renderPitchPacketJson`, and `pitchPacketFileNames`.
- Imports `LOCKS_PREFACE` and `OPEN_QUESTIONS_PREFACE` from `shared/seedMarkdown.ts`.
- Composer inputs are `ProjectDocuments`, project metadata, active Meeting direction, shared block values, session id, direction revision, and prior writer/approved proposal overrides.

- [ ] **Step 1: Write failing schema/precedence/renderer tests**

```ts
expect(PitchPacketSchema.parse(validPacket).packetVersion).toBe(1)

it('uses deterministic title chain and exposes scalar conflicts', () => {
  const packet = composePitchPacket(fixtureWithDifferentSynopsisAndTreatmentTitles)
  expect(packet.title.value).toBe('Synopsis title')
  expect(packet.title.conflict).toBe(true)
  expect(packet.title.candidates.map(c => c.value)).toEqual(['Synopsis title', 'Treatment title'])
})

it('unions locks/open questions with exact-text dedupe', () => {
  const packet = composePitchPacket(listFixture)
  expect(packet.locks.value.map(v => v.statement)).toEqual(['Never become a spoof.', 'No time travel.'])
})

it('renders contracted frontmatter and sections', () => {
  const markdown = renderPitchPacketMarkdown(validPacket)
  expect(markdown).toContain('packet_version: 1')
  expect(markdown).toContain('## Story Engine')
  expect(markdown).toContain(LOCKS_PREFACE)
  expect(markdown).toContain(OPEN_QUESTIONS_PREFACE)
})
```

Test every PRD source chain, writer > approved proposal > default precedence, conflicts blocking approval, core-character mapping, optional comps/device, ISO timestamp, JSON pretty-print, and filename `<slug>-pitch-packet-v1-r<revision>`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- tests/shared/pitchPacket.test.ts tests/shared/pitchPacketMarkdown.test.ts`

Expected: FAIL because shared contract is missing.

- [ ] **Step 3: Implement exact Zod contract and pure functions**

```ts
export const PITCH_PACKET_VERSION = 1 as const
export const PitchPacketOriginSchema = z.enum(['document', 'meeting', 'writer', 'ai_proposed'])
export const PitchPacketFieldSchema = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  origin: PitchPacketOriginSchema,
  approved: z.boolean(),
  sourceRef: z.string().optional(),
  conflict: z.boolean().optional(),
  candidates: z.array(z.object({ value, origin: PitchPacketOriginSchema, sourceRef: z.string() })).optional(),
})
```

Implement required fields and list item schemas exactly from PRD. Composer never mutates documents or Meeting memory. Scalar conflicts remain unapproved until writer selects/edits. Lists union exact text while preserving per-entry source provenance.

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/shared/pitchPacket.test.ts tests/shared/pitchPacketMarkdown.test.ts && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add shared/pitchPacket.ts shared/seedMarkdown.ts tests/shared/pitchPacket.test.ts tests/shared/pitchPacketMarkdown.test.ts
git commit -m "feat: add pitch packet contract"
```

---

### Task 8: Packet persistence, native AI proposals, and approve/export lifecycle

**Files:**
- Create: `server/room/interview/pitchPacketStore.ts`
- Create: `server/room/interview/pitchPacketRuntime.ts`
- Create: `server/room/interview/pitchPacketProposals.ts`
- Modify: `server/room/roomRoutes.ts`
- Create: `tests/server/room/pitchPacketStore.test.ts`
- Create: `tests/server/room/pitchPacketRuntime.test.ts`
- Modify: `tests/server/room/roomRoutesInterview.test.ts`
- Modify: `tests/server/room/roomRoutesMemoryGuard.test.ts`

**Interfaces:**
- `POST /api/room/:projectId/interview/:sessionId/pitch-packet/draft` body `{documents, projectMeta}`.
- `PATCH /api/room/:projectId/interview/:sessionId/pitch-packet/:packetId` body `{packet}` persists review edits to draft.
- `POST /api/room/:projectId/interview/:sessionId/pitch-packet/:packetId/approve` validates every required field and conflict resolution, then writes `approved`.
- `POST /api/room/:projectId/interview/:sessionId/pitch-packet/:packetId/export` calls transaction RPC and returns persisted exported packet.
- `GET /api/room/:projectId/interview/:sessionId/pitch-packet/exported` returns latest exported row for deterministic re-download.
- AI proposal generation uses existing `createModelProvider()` from `server/ai/modelProvider.ts`; no OpenSwarm code or capability runtime changes.

- [ ] **Step 1: Write failing store/runtime/route tests**

```ts
it('replaces only an unexported packet for same session', async () => {
  const before = structuredClone(exportedFixture)
  await createPitchPacketDraft(input)
  await createPitchPacketDraft(input)
  expect(fake.deletedRows.every(row => row.status !== 'exported')).toBe(true)
  expect(exportedFixture).toEqual(before)
})

it('keeps AI gaps unapproved and grounded in supplied project context', async () => {
  provider.generateResponse.mockResolvedValue(JSON.stringify({ logline: 'A chef returns home to solve her sister’s disappearance.' }))
  const draft = await createPitchPacketDraft(input)
  expect(provider.generateResponse).toHaveBeenCalledWith(expect.objectContaining({
    messages: [{ role: 'user', content: expect.stringContaining('sister') }],
  }))
  expect(draft.packet.logline).toMatchObject({ origin: 'ai_proposed', approved: false })
})

it('exports packet and session through one RPC before returning', async () => {
  const exported = await exportPitchPacket(input)
  expect(fake.rpc).toHaveBeenCalledWith('export_pitch_packet', expect.any(Object))
  expect(exported.status).toBe('exported')
})
```

Add proposal-provider failure (`proposalUnavailable` metadata, editable blank), schema rejection, unapproved/conflicted required fields, packet/session/project binding, direction revision freshness, immutable prior exported rows, and 503 on every new route.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- tests/server/room/pitchPacketStore.test.ts tests/server/room/pitchPacketRuntime.test.ts tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesMemoryGuard.test.ts`

Expected: FAIL because packet services/routes are missing.

- [ ] **Step 3: Implement lifecycle**

Validate `documents` with existing `ProjectDocumentsSchema`. Draft runtime reads current decision fold plus `story_locks`, `open_questions`, and banked answers; calls `composePitchPacket`. For empty required scalar fields only, call:

```ts
const provider = createModelProvider()
const raw = await provider.generateResponse({
  systemPrompt: PITCH_PACKET_PROPOSAL_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: JSON.stringify(groundedProjectContext) }],
  temperature: 0.2,
  maxTokens: 900,
})
const proposals = PitchPacketProposalSchema.parse(extractJsonObject(raw))
```

AI failure leaves fields empty/unapproved with `proposalUnavailable: true`; route still returns draft. Approval parses `PitchPacketSchema`, calls `validatePitchPacketForApproval`, and reports per-field errors. Export refuses stale `directionRevision`, calls `export_pitch_packet`, then returns persisted row. No route generates files.

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/server/room/pitchPacketStore.test.ts tests/server/room/pitchPacketRuntime.test.ts tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesMemoryGuard.test.ts && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add server/room/interview/pitchPacketStore.ts server/room/interview/pitchPacketRuntime.ts server/room/interview/pitchPacketProposals.ts server/room/roomRoutes.ts tests/server/room/pitchPacketStore.test.ts tests/server/room/pitchPacketRuntime.test.ts tests/server/room/roomRoutesInterview.test.ts tests/server/room/roomRoutesMemoryGuard.test.ts
git commit -m "feat: add pitch packet lifecycle"
```

---

### Task 9: Pitch Packet review UI and real Markdown/JSON downloads

**Files:**
- Create: `client/src/components/ritual/PitchPacketReview.tsx`
- Modify: `client/src/components/ritual/ProjectMeetingPage.tsx`
- Modify: `client/src/lib/roomApi.ts`
- Modify: `client/src/lib/useInterviewSession.ts`
- Modify: `client/src/App.tsx`
- Create: `tests/components/PitchPacketReview.test.tsx`
- Modify: `tests/components/ProjectMeetingPage.test.tsx`
- Modify: `tests/lib/roomApi.test.ts`
- Modify: `tests/lib/useInterviewSession.test.tsx`

**Interfaces:**
- `ProjectMeetingPage` gains `documents: ProjectDocuments` and passes them only in draft request.
- Review component receives persisted packet row plus save/approve/export/re-download callbacks.
- Export sequence is server export transaction first, then two calls to existing `downloadTextFile` with deterministic content and MIME types.

- [ ] **Step 1: Write failing UI/download tests**

```tsx
expect(await screen.findByRole('heading', { name: 'Pitch Packet review' })).toBeInTheDocument()
expect(screen.getByText('From your documents')).toBeInTheDocument()
expect(screen.getByText('Suggested — needs your approval')).toBeInTheDocument()
expect(screen.getByText('Approve every required field to export.')).toBeInTheDocument()

fireEvent.click(screen.getByRole('button', { name: 'Export Pitch Packet' }))
await waitFor(() => expect(apiMock.exportPitchPacket).toHaveBeenCalledBefore(downloadMock))
expect(downloadMock).toHaveBeenNthCalledWith(1, expect.stringContaining('## Premise'), expect.stringMatching(/\.md$/), 'text/markdown')
expect(downloadMock).toHaveBeenNthCalledWith(2, expect.stringContaining('"packetVersion": 1'), expect.stringMatching(/\.json$/), 'application/json')
```

Add conflict choice/edit, approval gating, proposal unavailable, save draft, exported success copy, download failure with unchanged exported state, and re-download using same persisted packet.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- tests/components/PitchPacketReview.test.tsx tests/components/ProjectMeetingPage.test.tsx tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx`

Expected: FAIL because review UI/API is missing.

- [ ] **Step 3: Implement review and downloads**

Pass `project.state.documents` from `App.tsx` at current `ProjectMeetingPage` call site. Replace old `exportMarkdown`/`<pre>` state with packet review state. Use badges exactly:

```text
From your documents
From the Meeting
You wrote this
Suggested — needs your approval
```

Writer edits set `origin:'writer'`, clear conflict, and require explicit approval. Export handler awaits persisted exported packet, renders with `renderPitchPacketMarkdown` and `renderPitchPacketJson`, then calls `downloadTextFile` twice. Catch download errors after state update and keep re-download enabled. Success: `Pitch Packet exported. Two files downloaded: Markdown and JSON.`

- [ ] **Step 4: Verify task**

Run: `npm run test:run -- tests/components/PitchPacketReview.test.tsx tests/components/ProjectMeetingPage.test.tsx tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx && npm run check && npm run test:run`

Expected: all PASS.

- [ ] **Step 5: Commit task**

```bash
git add client/src/components/ritual/PitchPacketReview.tsx client/src/components/ritual/ProjectMeetingPage.tsx client/src/lib/roomApi.ts client/src/lib/useInterviewSession.ts client/src/App.tsx tests/components/PitchPacketReview.test.tsx tests/components/ProjectMeetingPage.test.tsx tests/lib/roomApi.test.ts tests/lib/useInterviewSession.test.tsx
git commit -m "feat: add pitch packet review export"
```

---

### Task 10: Authorized real-DB integration, manual runbook, and final verification

**Files:**
- Create: `tests/integration/meetingRevisions.integration.test.ts`
- Modify: `docs/writers-room-phase1-runbook.md`

**Interfaces:**
- Integration suite remains env-gated using existing throwaway `itest-` project pattern and cleanup.
- Covers real transaction behavior only after dev migration authorization/application.
- No production migration, push, or PR action occurs.

- [ ] **Step 1: Add env-gated integration tests**

```ts
describe.runIf(hasIntegrationEnv)('meeting revisions and pitch packets', () => {
  it('banks ledger + blocks + snapshot atomically and no-ops same-session rebank', async () => {
    const first = await bankMeetingRoundFixture(db, projectId)
    const second = await bankMeetingRoundFixture(db, projectId)
    expect(first.session.state).toBe('banked')
    expect(second.rpcResult).toBe('already_banked')
    expect(await countDecisionRows(db, first.session.id)).toBe(first.decisionCount)
  })

  it('suppresses legacy coverage without writes on read', async () => {
    await seedLegacyBankedSession(db, projectId)
    const before = await countDecisionRows(db, projectId)
    const status = await getInterviewStatus(projectId)
    expect(status.recap.map(item => item.area)).toContain('locks')
    expect(await countDecisionRows(db, projectId)).toBe(before)
  })

  it('exports packet and session atomically', async () => {
    const row = await seedApprovedPacket(db, projectId)
    const exported = await exportPitchPacket({ projectId, sessionId: row.session_id, packetId: row.id })
    expect(exported.status).toBe('exported')
    expect((await loadSession(db, row.session_id)).state).toBe('exported')
  })
})
```

Do not add cross-session concurrent-bank scenario. Add focused unit coverage already in Task 5 for `direction_conflict`.

- [ ] **Step 2: Request/check migration authorization**

If authorization is absent: do not apply migration; run integration command and record suite as skipped.

If authorization is explicit: apply migration to dev Supabase only using repository-standard command confirmed at execution time, then run integration suite. Never target production.

- [ ] **Step 3: Extend manual runbook**

Document exact smoke:

1. Bank Round 1.
2. Start Round 2; verify recap and no repeated covered questions.
3. Revise one decision, retract one lock, redirect one area, answer redirect.
4. Preview; compare direction diff and exact blocks.
5. Bank; reload; verify Round 1 history unchanged and active direction updated.
6. Open Pitch Packet review; resolve one conflict; approve one AI proposal.
7. Export; verify `.md` and `.json`; re-download exported row.

- [ ] **Step 4: Run final verification**

Run:

```bash
npm run test:run
npm run check
npm run build
npm run dev
```

With authorized migrated dev Supabase, also run: `npm run test:run -- tests/integration/meetingRevisions.integration.test.ts`.

Expected: full Vitest PASS; TypeScript PASS; production build PASS; dev server starts. Visually verify recap controls, diff, review approval, both browser downloads, and re-download.

- [ ] **Step 5: Commit task**

```bash
git add tests/integration/meetingRevisions.integration.test.ts docs/writers-room-phase1-runbook.md
git commit -m "test: verify meeting packet workflow"
```

---

## Final Scope Audit

- Meeting history remains immutable; only ledger rows append.
- Redirects live in cursor, dedupe, stamp `answered_at`, become audit-only rows at bank, and never influence later audits.
- `SUFFICIENT_FROM_PRIOR` suppresses covered questions; new seed has precedence.
- Same-session re-bank is idempotent; no impossible cross-session test exists.
- Preview/commit share `computeBankPlan`; CAS retries include `direction_conflict`.
- Packet schema/persistence includes required `session_id`, status lifecycle, current direction revision, immutable exported rows, and deterministic field precedence.
- Export transaction finishes before browser downloads; failed download is re-downloadable without state mutation.
- Legacy read fallback performs zero writes. Backfill is explicit/manual/idempotent.
- No OpenSwarm runtime file, branch, package, or retirement behavior is touched.
- No migration applies until separately authorized. No push, PR, or production action is part of this plan.
