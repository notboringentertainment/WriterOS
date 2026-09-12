# Plan: an answer closes its open question

Status: DRAFT, awaiting Codex review (2026-09-11). No code changed.
Follow-on to `import-supersession-plan.md` (its F1).

## The problem

A Wayfinder ticket lives at `tickets/<name>.md` while open and moves to
`resolved/<name>.md` when the writer resolves it. The importer publishes the
open ticket as an `open_question` record (sourceId `tickets/<name>.md`) and
the resolved ticket as a `canon` or `development` record (sourceId
`resolved/<name>.md`). Nothing links the two, so the question stays `active`
after its answer is published.

Bloodless today (revision 110):

| Active open-question records under `tickets/` | 37 |
| --- | --- |
| Ticket still open on disk | 21 |
| Ticket resolved, active answer record exists | 15 records, 11 tickets |
| Ticket file gone, no resolved file, no answer | 1 (season-one climax) |

Three of the resolved tickets carry two or three question versions each; the
version-collapse repair skipped them because the ticket file had left
`tickets/`.

Open questions do not count toward the canon cap. They do pollute the
"relevant" retrieval that agents get per message, the review projection, and
the What's Standing report, and they misstate what is still open.

## Why this needs a store change

The store forbids cross-kind supersession (`validateSupersessionTargets`:
target must be active and the same kind as the winner). A question is closed
by an answer, and the answer is by definition a different kind. The only
same-kind way to retire a question is a stub open-question record that stays
active, which is what we refused for versions. So the rule has to admit one
new case.

## Decisions

- D1. Store rule, narrow: a publication (or promotion) may name an active
  `open_question` record in its explicit `supersedes` when the incoming
  record's kind is `canon` or `development` and both share
  `source.workflow`. Every other pairing keeps the same-kind rule. No flag,
  no automatic lookup inside the store: closing a question is always an
  explicit target list from the caller. Supersession still applies only when
  the incoming record lands active, so a candidate answer (flagged, missing
  answer, unresolved conflict) closes nothing. `validateSupersessionTargets`
  is shared by publish, promotion and replay, so one edit covers all three.
- D2. Linkage is computed by the CLI import, which knows the files. For each
  preview record from `resolved/<name>.md` with kind `canon` or
  `development`, add every active `open_question` record whose sourceId is
  `tickets/<name>.md` (same workflow) to `supersedes`, unioned with the
  version-replacement targets from `supersedesPriorVersions`. Identity is the
  file basename. The adapter does not read `id:` headers today and 42 of 55
  Bloodless tickets have none, so basename stays the anchor (F3 unchanged).
- D3. Canon-explicit-only is untouched: nothing becomes canon here, and a
  question is closed only by an answer the writer resolved through the
  skill's close cycle. Reopening still works: the reopened file returns to
  `tickets/`, publishes as a fresh open question, and the old canon stays
  active until a fresh close republishes over it.
- D4. Scoped-out tickets (`## Answer — scoped out`) import as candidate
  open questions, so under D1 they close nothing and the original question
  stays active. Left as is in this plan; flagged as Q1 below.
- D5. One-time cleanup extends `reconcile-stale` with an orphaned-questions
  pass (Step 3). Orphans with no answer record are skipped and reported,
  never guessed.

## Steps

### Step 1. Store: answers may close questions (store.ts, test-first)

In `validateSupersessionTargets(winnerKind, winnerSource, targets)`:

```
for each target:
  if target.status !== 'active' -> throw (unchanged)
  if target.kind === winnerKind -> ok (document_fact keeps its anchor rule)
  else if target.kind === 'open_question'
       && (winnerKind === 'canon' || winnerKind === 'development')
       && target.source.workflow === winnerSource.workflow -> ok
  else -> throw 'Supersession requires an active record of the same memory kind, or an open question closed by an answer from the same workflow.'
```

Tests (`tests/server/projectMemoryStore.test.ts` or a new file):

- Active canon with explicit `supersedes: [question.id]`: question becomes
  `superseded`, canon carries the link, event replays.
- Active development closes a question the same way.
- Candidate canon (safety flagged; separately an unresolved conflict) naming
  a question: question stays active, `supersedes` empty.
- Different workflow: throws.
- An open_question naming another open_question still works (same kind).
- An open_question naming canon: throws. Canon naming development: throws.
- Promotion of a canon candidate with `supersedes: [question.id]` closes the
  question.
- Replay rejects a forged `published` event whose record is a candidate with
  a question target (covered by the existing guard; add the cross-kind case).
- Projections: `review.md` no longer lists the closed question as open.

### Step 2. CLI import links answers to their questions (cli.ts, test-first)

In `runImport`, after the wayfinder flag is set:

1. For each record whose `source.sourceId` starts with `resolved/` and whose
   kind is `canon` or `development`, compute
   `questionIds = snapshot.records.filter(active && kind open_question && workflow same && sourceId === 'tickets/' + basename)`.
   Union into `record.supersedes`.
2. The snapshot used is the one already read (read-only for dry-run). On
   apply the loop advances with `result.snapshot`, so a question published
   earlier in the same run is seen by a later answer (a ticket resolved and
   imported in one pass never happens, but the loop should still be right).
3. Dry-run `supersessionsExpected` includes question closures under the
   same idempotency and candidate rules already in place. Add
   `questionsClosedExpected` (dry-run) and `questionsClosed` (apply) as
   separate counts so the output distinguishes version replacement from
   question closure.

Tests (`tests/server/projectMemoryImportSupersession.test.ts`):

- Import `tickets/x.md` (open question), then import `resolved/x.md` as
  active canon: question superseded, canon active with the link, counts 1.
- Same with a homework ticket (development).
- Resolved answer that imports as a candidate: question stays active, count 0.
- Resolved file with no matching question: nothing linked, count 0.
- Question and answer in the same preview: the answer closes the question.
- Reopen: `tickets/x.md` reappears with a new hash: new open question
  active, the earlier canon untouched, the earlier (closed) question stays
  superseded.
- Re-import of an already-published answer: no-op, count 0.

### Step 3. Cleanup: `reconcile-stale` orphaned-questions pass (cli.ts, test-first)

After the version groups, plan `orphanedQuestions`:

1. For each active `open_question` with sourceId `tickets/<name>` whose file
   is absent from the preview (no preview record with that sourceId):
   find the active answer record for `resolved/<name>` in the snapshot
   (kind canon or development) whose hash matches the preview's current
   `resolved/<name>` record.
2. Found: plan one maintenance publication of that answer's full content
   under `maintenance:close-question:<workflow>:<resolved sourceId>` with
   `supersedes = [answer.id, ...orphan question ids]`. The answer gets a new
   id (same trade-off as the version repair; Bloodless has no annotations).
   If the answer is itself a candidate, skip: a candidate cannot close.
3. Not found (no resolved file, no active answer, or hash mismatch): skip
   with a reason. Season-one climax lands here; the writer decides.
4. Dry-run prints `orphanedQuestions` and `skippedQuestions` beside the
   existing `groups`/`skipped`. Apply runs the version groups first, then
   the question closures against the advanced snapshot, so a question whose
   answer was just collapsed links to the collapsed answer.

Tests (`tests/server/projectMemoryReconcileStale.test.ts`): closes one
orphan; closes a three-version orphan group in one publication; skips an
orphan with no answer; skips when the answer is a candidate; is a no-op on
re-run; dry-run writes nothing; version collapse then closure in one apply
links to the collapsed answer.

### Step 4. Run on Bloodless and verify

1. Full suite, check, build.
2. `reconcile-stale --dry-run`: expect 11 closures covering 15 records and 1
   skipped (season-one climax). Ben reads and accepts the list.
3. `--apply`; then `context` succeeds, active open questions under
   `tickets/` equal the 21 files on disk, active canon still 31.
4. `import --dry-run`: zero new records, zero expected closures.
5. Skill note: one sentence at the publish step saying a resolved ticket
   closes its open-question record at the next publish.

## Open points

- Q1. Should a scoped-out resolution close the question? It imports as a
  candidate open question today, so it cannot under D1. Options: leave open
  (this plan), or let the adapter emit scoped-out tickets as `development`
  ("scoped out: ...") so they can close. Ben's call; not built here.
- Q2. Promotion inherits the rule (D1), so promoting a canon candidate can
  name a question. That is an explicit act by Ben in review; say if it should
  be CLI-only instead.

## Files touched

- `server/projectMemory/store.ts` (Step 1)
- `server/projectMemory/cli.ts` (Steps 2, 3)
- `tests/server/projectMemoryStore.test.ts` (or a new store test file),
  `tests/server/projectMemoryImportSupersession.test.ts`,
  `tests/server/projectMemoryReconcileStale.test.ts`
- `docs/runbooks/unified-project-memory.md` §6 (one paragraph)
- `~/.claude/skills/story-wayfinder/SKILL.md` (Step 4.5, last)
