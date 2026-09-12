# Plan v2: an answer closes its open question

Status: REVISED after Codex review (2026-09-11). Awaiting Ben's go before any code.
v1 findings and my verification of each are at the end.
Follow-on to `import-supersession-plan.md` (its F1).

## The problem (unchanged)

A Wayfinder ticket lives at `tickets/<name>.md` while open and moves to
`resolved/<name>.md` when the writer resolves it. The importer publishes the
open ticket as an `open_question` record (sourceId `tickets/<name>.md`) and
the resolved ticket as a `canon` or `development` record (sourceId
`resolved/<name>.md`). Nothing links the two, so the question stays `active`
after its answer is published.

Bloodless at revision 110, confirmed independently by Codex:

| Active open-question records under `tickets/` | 37 |
| --- | --- |
| Ticket still open on disk | 21 |
| Ticket resolved, active answer record exists | 15 records, 11 tickets |
| Ticket file gone, no resolved file, no answer | 1 (season-one climax) |

Open questions do not count toward the canon cap. They do pollute per-message
retrieval, the What's Standing report, and the count of what is still open.

## Why this needs a store change

The store forbids cross-kind supersession (`validateSupersessionTargets`:
target must be active and the same kind as the winner). A question is closed
by an answer, which is a different kind. The only same-kind way to retire a
question is a stub that stays active, which we refused for versions. So the
rule admits one new case.

## Decisions

- D1. Store rule, narrow: a publication or promotion may name an active
  `open_question` record in its explicit `supersedes` when the incoming
  record's kind is `canon` or `development` and both share
  `source.workflow`. Every other pairing keeps today's rule, including the
  document-fact anchor rule. No flag, no automatic lookup in the store.
  Supersession still applies only when the incoming record lands active, so a
  candidate answer closes nothing. `validateSupersessionTargets` is used by
  publication, promotion derivation and both replay branches, so one edit
  covers all four paths (Codex confirmed).
- D2. Linkage is computed by the CLI import, Wayfinder only, and requires
  real absence of the open ticket, not absence from the preview (v1 finding
  1). The adapter reports every markdown filename it saw under `tickets/` and
  `resolved/` in a new optional preview field `ticketFiles`, whether or not
  the file imported (a file without an H1 is listed but not imported). The
  CLI closes `tickets/<name>.md` questions from a `resolved/<name>.md` answer
  only when `tickets/<name>.md` is not in `ticketFiles`. If both paths exist
  the closure is skipped and reported as ambiguous. Renames and splits stay
  manual: an unmatched question is reported, never guessed.
- D3. The caller-supplied question ids are pinned to the snapshot they were
  chosen from (v1 finding 2). `PublishMemoryInput` gains an optional
  `expectedRevision`; the store, under its lock, throws the existing
  `revision-conflict` error when the ledger has moved. The CLI sets it only
  on publications that carry question ids, re-reads and recomputes on a
  conflict, and gives up after three attempts with the existing partial-
  import error shape. The import loop advances its snapshot from each
  publish result and enriches each record just before its own publish.
  `supersedesPriorVersions` is unchanged and still resolved in the store.
- D4. Canon-explicit-only is untouched: nothing becomes canon here, and a
  question is closed only by an answer the writer resolved through the
  skill's close cycle. Closing a question does not resolve any open conflict
  that references it; that stays for review (stated and tested).
- D5. Cleanup is one publication per answer (Codex's recommendation): the
  winner's full content republished once with targets = every active
  same-anchor answer version plus every verified orphaned question version.
  The maintenance key carries a digest of the sorted target ids (v1 finding
  3) so a later, different closure against the same answer bytes is a new
  publication while a retry of the same closure stays idempotent.
- D6. Scoped-out resolutions (Q1) are a product choice, built only if Ben
  says so: the adapter would emit a safe, well-formed scoped-out ticket as
  `development`, requested `active`, claim "Scoped out: <title>", reason in
  detail, `approval: 'none'`. Then it closes its question like any answer.
  Bloodless has no scoped-out candidates today, so nothing needs migrating.

## Steps

### Step 1. Store: answers may close questions; pinned publications (test-first)

1. `validateSupersessionTargets(winnerKind, winnerSource, targets)`:

   ```
   for each target:
     if target.status !== 'active' -> throw (unchanged)
     if target.kind === winnerKind -> existing checks (document_fact anchor rule unchanged)
     else if target.kind === 'open_question'
          && (winnerKind === 'canon' || winnerKind === 'development')
          && target.source.workflow === winnerSource.workflow -> ok
     else -> throw 'Supersession requires an active record of the same memory kind, or an open question closed by an answer from the same workflow.'
   ```

2. `PublishMemoryInputSchema`: add `expectedRevision: z.number().int().nonnegative().optional()`.
   In `publish`, after the idempotency check (a no-op retry must not
   conflict), throw `ProjectMemoryStoreError(..., 'revision-conflict')` when
   set and not equal to the replayed revision. Not persisted.

Tests (`tests/server/projectMemoryStore.test.ts` or a new file):

- Active canon with `supersedes: [question.id]`: question superseded, link
  on the canon, replays.
- Active development closes a question.
- Mixed targets in one publication: old canon versions plus questions.
- Candidate canon (safety flagged; separately an unrelated unresolved
  conflict): question stays active, `supersedes` empty.
- Different workflow: throws on publish, promotion and replay.
- open_question naming open_question: still fine. open_question naming
  canon: throws. development naming canon: throws. document_fact: unchanged.
- Promotion of a canon candidate with a question target closes it.
- Forged replay: candidate record with a question target rejected.
- An open conflict referencing the closed question stays open.
- `expectedRevision` matching: publishes; stale: `revision-conflict`,
  nothing written; idempotent retry with a stale value: `published: false`,
  no error.

### Step 2. Adapter: `ticketFiles` (wayfinder.ts, test-first)

Add `ticketFiles: string[]` to the wayfinder preview: every `.md` filename
under `tickets/` and `resolved/` as `tickets/<name>` / `resolved/<name>`,
listed before the H1 check. `ImportPreview` and the CLI's
`ImportPreviewSchema` take it as optional; other adapters omit it. Retrieval
of ticket ids from `id:` headers is not part of this change (F3 stays).

Tests (`tests/server/projectMemoryAdapters.test.ts`): a file without an H1
appears in `ticketFiles` and not in `records`; both directories listed;
`assets/` and atoms excluded.

### Step 3. CLI import links answers to their questions (cli.ts, test-first)

In `runImport`, inside the publish loop (per record, against the advancing
snapshot):

1. If `source === 'wayfinder'`, the record's sourceId is `resolved/<name>`,
   its kind is `canon` or `development`, and `tickets/<name>` is absent from
   `preview.ticketFiles`: `questionIds = latest.records.filter(active && kind open_question && workflow story-wayfinder && sourceId === 'tickets/<name>')`.
   If `tickets/<name>` is present in `ticketFiles` and such questions exist,
   record an `ambiguous` entry (both paths exist) and close nothing.
2. When `questionIds` is non-empty: `supersedes = unique([...record.supersedes, ...questionIds])`,
   `expectedRevision = latest.revision`. On `revision-conflict`: re-read with
   `readSnapshot`, recompute, retry (max 3), then fail with the partial-import
   error.
3. Counts: `questionsClosedExpected` (dry-run, same idempotency and
   candidate rules as `supersessionsExpected`, computed from the read-only
   snapshot) and `questionsClosed` (apply, effective). `supersessions` keeps
   counting all retirements. Add `ambiguous: [...]` to both outputs.

Tests (`tests/server/projectMemoryImportSupersession.test.ts`, fake previews
that carry `ticketFiles`):

- Question published; later preview has the answer and no `tickets/x.md` in
  `ticketFiles`: question superseded, answer links it, counts 1.
- Homework answer (development) closes the same way.
- Answer imports as candidate: question stays active, counts 0.
- Both `tickets/x.md` and `resolved/x.md` present: nothing closed, reported
  ambiguous.
- Preview omits `ticketFiles` entirely (old fake): nothing closed.
- Reopen: `tickets/x.md` reappears (new hash) and `resolved/x.md` is still
  present: new question active, old canon untouched, old question stays
  superseded; then a fresh close (new `resolved/x.md` hash, ticket file gone)
  supersedes the old canon via `supersedesPriorVersions` and closes the new
  question.
- Intervening write: a second question version published between the CLI's
  lookup and its publish (injected through the `memoryStore` dependency):
  first attempt conflicts, retry closes both versions. Variant: no question
  at lookup, one appears before publish: retry closes it.
- Re-import of a published answer: no-op, counts 0.
- Real-adapter ordering test in the adapters or CLI suite: resolved is
  processed before tickets; a stale copied `resolved/x.md` beside a live
  `tickets/x.md` closes nothing.

### Step 4. Cleanup: one publication per answer (cli.ts, test-first)

Rework `planStaleVersionGroups` into an answer-repair plan:

1. For each `resolved/<name>` anchor with kind canon or development: versions
   = active same-anchor records; questions = active `tickets/<name>`
   open_question records where `tickets/<name>` is absent from
   `ticketFiles`. Skip anchors needing neither (versions ≤ 1 and no
   questions).
2. Winner = the single active version whose hash equals the current preview
   hash; otherwise skip with a reason (absent, changed, ambiguous,
   store-derived authority). A candidate winner cannot close: skip.
3. One publication of the winner's full content with
   `supersedes = [...versions, ...questions]`. Key: when there are no
   question targets, `maintenance:collapse:<workflow>:<sourceId>` (unchanged,
   so already-repaired anchors stay idempotent); otherwise
   `maintenance:close:<workflow>:<sourceId>:<sha256 of sorted target ids>`.
   Winner is reselected from the current snapshot at apply time.
4. Orphaned questions with no eligible answer (no resolved file, no active
   answer, hash mismatch) are listed under `skippedQuestions` and left
   active. Season-one climax lands there.
5. Open-question version groups under `tickets/` whose file still exists keep
   the existing version collapse.
6. Lifecycle, stated in the runbook: ordinary re-import of an old answer
   file is a no-op by design; a newly approved closure against those bytes
   goes through this command and gets a new key.

Tests (`tests/server/projectMemoryReconcileStale.test.ts`): closes one
orphan; three answer versions plus two question versions retire in one
event; skip with no answer; skip when the answer is a candidate; ambiguous
(both files present) skipped; re-run is a no-op; a later reopen and restore
of old answer bytes gets a distinct key and closes the new question;
projection failure after the closure publication reconciles and retries
without a second event; dry-run writes nothing; stale conflicts preserved
and reported.

### Step 5. Run on Bloodless and verify

1. Full suite, check, build.
2. `reconcile-stale --dry-run`: expect 11 answer repairs covering 15 question
   records, 1 skipped question (season-one climax), 0 ambiguous. Ben reads
   and explicitly accepts the list.
3. `--apply`: expect 11 events, revision 121, active canon 31, active
   open questions 22 (21 with live files plus the one reported unmatched).
4. `context` succeeds; `import --dry-run` reports zero new records, zero
   expected closures.
5. Skill note: one sentence at the publish step saying a resolved ticket
   closes its open-question record at the next publish, and that a ticket
   present in both folders closes nothing until one copy is removed.

## Decisions Ben owns

- Q1. Build D6 (scoped-out tickets become active development records that
  close their question)? Not needed for Bloodless today.
- Q2. Promotion inherits D1. Codex agrees no CLI-only boundary is needed; the
  review UI gains no question picker, so this only matters to API callers.

## Files touched

- `shared/projectMemory.ts` (`expectedRevision`), `server/projectMemory/store.ts` (Step 1)
- `server/projectMemory/adapters/wayfinder.ts`, `server/projectMemory/importer.ts` (Step 2)
- `server/projectMemory/cli.ts` (Steps 3, 4)
- Tests: store, adapters, importSupersession, reconcileStale suites
- `docs/runbooks/unified-project-memory.md` §6 (lifecycle paragraph)
- `~/.claude/skills/story-wayfinder/SKILL.md` (Step 5.5, last)

## v1 review findings and verification

| # | Codex finding | Verified? | Outcome |
| --- | --- | --- | --- |
| 1 | Basename closure without checking the open ticket still exists; preview absence is not file absence; adapter order is assets, resolved, tickets; a file without an H1 is dropped from the preview | Yes: `wayfinder.ts` lines 185 to 204 | D2: adapter reports `ticketFiles`; closure requires real absence; both-present is reported ambiguous |
| 2 | Caller-supplied question ids race other writers; the import loop advances `revision`, not `snapshot` | Yes: `cli.ts:580` only updates `revision` | D3: `expectedRevision` on publish, `revision-conflict` under lock, CLI retry; loop advances the snapshot |
| 3 | Maintenance key `(dedupeKey, sourceHash)` cannot express a later closure against the same answer bytes | Yes: idempotency is dedupeKey plus sourceHash at `store.ts` publish | D5: key carries a digest of the sorted target ids; lifecycle stated |
| 4 | Remaining active questions after cleanup is 22, not 21 | Yes: 37 minus 15 | Step 5 corrected: 22, 11 events, revision 121 |
| 5 | `review.md` never lists active open questions, so the proposed projection test proves nothing | Yes: `renderReviewProjection` lists candidates and open conflicts only | Test moved to relevant retrieval and the What's Standing open-question group; conflict retention tested separately |
| - | One publication per answer instead of collapse then close | Agreed | D5, Step 4 |
| - | Scoped-out: emit development, active, "Scoped out:" claim | Plausible; adapter's `requestedStatus` expression confirmed to force candidate for scoped today | D6, Ben's call (Q1) |
