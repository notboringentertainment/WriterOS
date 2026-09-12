# Plan v2: imported records supersede their earlier versions

Status: APPROVED by Ben 2026-09-11 with two corrections (dry-run idempotency check; read-only snapshot in the import dry-run branch). Building.
v1 findings and my verification of each are at the end.

## The problem (unchanged)

`npm run memory -- context` fails for Bloodless with `canon_context_too_large`
(69,023 rendered characters against `MAX_ACTIVE_CANON_CHARACTERS = 64_000` in
`server/projectMemory/retrieval.ts`).

Root cause, verified against the Bloodless snapshot (revision 92, 92 records,
all `active`, none with a non-empty `supersedes`): every import adapter keys a
record by source file plus content hash, so an amended ticket imports as a new
record and nothing retires the earlier version. 42 active canon records from
31 source files; 21 anchors (canon and open_question) carry two to four active
versions.

The store already validates and applies explicit `supersedes` on publish, only
when the new record lands `active`. Imports never set it.

## Measured headroom after the fix

| Measure | As-is | Collapsed to one per file |
| --- | --- | --- |
| Active canon records | 42 | 31 |
| JSON characters (binding today) | 69,023 | 50,931 |
| Markdown, spoilers excluded | threw | 23,646 |
| Markdown, spoilers included | threw | 28,486 |

The context projection omits `detail`, so per-record growth is smaller than
claim + detail suggests, but the cap is still close. Step 4 asks for that
decision now.

## Decisions

- D1. Replacement intent is expressed by the caller, computed by the store
  under its lock. A new optional publish-input field
  `supersedesPriorVersions: boolean` (default false; name open) tells the store
  to find every active record with the same (kind, workflow, sourceId) as the
  incoming record and union those ids into `supersedes` before validation. The
  ledger event is unchanged: it records the resolved ids as today. This keeps
  the store's default contract (explicit supersedes only, document facts
  automatic) and closes the race Codex found (v1 finding 3): two importers
  can no longer both compute "no predecessor" outside the lock.
- D2. Scope: the CLI sets the flag for `--source wayfinder` only. Buzz paths
  are stable but not needed now. PitchStudio is excluded: its sourceId is
  `<path>#<type>-<index>`, an ordinal, so deleting or reordering an item would
  attach supersession history to the wrong record (v1 finding 4). PitchStudio
  needs its own identity rule before it gets this.
- D3. Canon-explicit-only. An amended ticket file inherits `type: grill` /
  `mode: hitl` from its headers, and the adapter derives `approval: 'explicit'`
  from those headers, so a changed hash proves changed bytes, not the writer's
  approval of them (v1 finding 1, verified at `wayfinder.ts` around line 260).
  Today that amended version already publishes as active canon beside the old
  one; this change adds retirement of the old one. The prerequisite is
  procedural, not infrastructural: a ratified ticket may only be amended
  through the skill's resolve, contradiction check, read-back, close cycle,
  and the publish step runs only after close. The skill text gets one sentence
  saying an amended ticket replaces its earlier published version at the next
  publish, and that the writer's read-back at close is the approval of that
  replacement. Reopenings are unaffected (the ticket moves to `tickets/`, a
  different sourceId).
- D4. One-time cleanup uses ordinary publication, no new ledger action
  (v1 finding 2, verified: the idempotency check runs before target validation
  at `store.ts` around line 1088, and a new dedupe key yields a new record id,
  so the old winner can be a target). For each duplicate group, publish the
  winner's full content again under a deterministic maintenance dedupe key
  with `supersedes` naming every active member of the group, including the
  old winner. One active record replaces the group; the losers and the old
  winner stay in history. Cost: the winner's record id changes and 21
  historical copies are added. Annotations pin record ids and would go stale
  on an id change; Bloodless has no annotations file, so no cost today. A
  dedicated action is only justified if stable winner ids become a
  requirement.
- D5. Replay must enforce what publish enforces. The `published` replay branch
  does not require the incoming record to be `active` when
  `supersededRecordIds` is non-empty (v1 finding 6, verified at `store.ts`
  lines 343 to 380). A forged ledger line could retire canon with a candidate.
  Add the check and a replay test in the same change.

## Steps

### Step 1. Store: `supersedesPriorVersions` (shared schema + store, test-first)

1. `shared/projectMemory.ts`: add `supersedesPriorVersions: z.boolean().default(false)`
   to `PublishMemoryInputSchema` (strict object, so the field must be declared).
   Not part of any event schema.
2. `createPublicationEvent`: when set, compute
   `priors = snapshot.records.filter(r => r.status === 'active' && r.kind === input.kind && r.source.workflow === input.source.workflow && r.source.sourceId === input.source.sourceId && r.id !== recordId)`,
   union into the explicit targets before `validateSupersessionTargets`.
   Existing status logic then decides whether supersession applies (only if
   the new record lands active).
3. Replay: in the `published` branch, throw `corruptLedger` when
   `supersededRecordIds.length > 0 && record.status !== 'active'`.

Tests (`tests/server/projectMemoryStore.test.ts`):

- Flag on, one active prior: prior superseded, new active, event carries the
  prior id.
- Flag on, three active priors: all superseded.
- Flag on, incoming lands candidate (safety flagged, and separately an
  unresolved `conflictsWith`): priors stay active, `supersedes` empty.
- Flag on, prior of a different kind at the same sourceId: not touched, no
  throw.
- Flag on, different workflow, same sourceId: not touched.
- Flag on, idempotent retry of an already-published version: `published:
  false`, nothing changes.
- Flag off: behaviour identical to today (existing tests stay green).
- Replay: a schema-valid `published` event with a candidate record and
  non-empty `supersededRecordIds` is rejected as corrupt; a mixed fixture
  of old and new events replays.

### Step 2. CLI import sets the flag for wayfinder (cli.ts, test-first)

1. In `runImport`, after preview validation, set
   `supersedesPriorVersions: true` on each record when `source === 'wayfinder'`.
   Pass the same enriched record to `reconcilePublication` on the failure
   path.
2. Output: add a top-level `supersessions` count (effective retirements
   only: sum of `result.record.supersedes.length` over records with
   `published: true`). Dry-run reports `supersessionsExpected`, computed by
   reading the snapshot with `readSnapshotReadOnly` and, for each record,
   first checking publication idempotency (a publication with the same
   dedupeKey and sourceHash already exists means no-op, count 0) and only then
   applying the prior-version predicate. Without the idempotency check, a
   re-import after cleanup would wrongly count the replacement record as a
   predecessor of the original version.
   The import dry-run branch itself switches from `readSnapshot` to
   `readSnapshotReadOnly` so the preview is genuinely read-only.
3. Keep the wayfinder authority check as is.

Tests (`tests/server/projectMemoryCli.test.ts`, existing fake-preview
injection):

- Amended file: first import publishes A; second import with a changed hash
  publishes B, A superseded, one active record for the source, context
  renders once.
- Candidate amendment: A stays active, B candidate, count 0.
- Two same-anchor versions in one fake preview (`finalizePreview` dedupes by
  hash, not anchor, so this is possible with a fake): second supersedes the
  first because the store, not the CLI, resolves priors.
- Projection failure after a superseding publish: reconcile reports the
  durable event, retry appends nothing, statuses correct.
- Non-wayfinder source: flag absent, no supersession.
- Counts: idempotent retries and candidates do not inflate `supersessions`.

### Step 3. CLI `reconcile-stale` (cli.ts, test-first)

`npm run memory -- reconcile-stale --project <pkg> --source wayfinder --from <root> --dry-run|--apply`

1. Preview via the adapter with the same path guards as `import`.
2. Snapshot via `readSnapshotReadOnly` for dry-run (v1 finding 5:
   `readSnapshot` can append migration events and rewrite projections). Apply
   may use `readSnapshot` first, then recompute groups.
3. Group active records by (kind, workflow, sourceId). For groups with more
   than one member: winner = the single active record whose `sourceHash`
   equals the current file hash from the preview. Zero or more than one match:
   skip and report with a reason. Never choose by date.
4. Apply: for each group, `publish` the winner's full content (claim, detail,
   tags, entities, source, evidence, safety, spoiler) with
   `dedupeKey: maintenance:collapse:<workflow>:<sha256(sourceId)>`,
   `requestedStatus: 'active'`, `supersedes: <all active group ids>`,
   `supersedesPriorVersions: false` (explicit list, so the report is exact).
   Re-verify manifest identity before each publish; on a publish failure use
   `reconcilePublication` and stop with the existing partial-import error
   shape.
5. Output: groups, winners, losers, skipped with reasons, and after apply the
   revision. Also list any open conflict whose endpoints are now all stale;
   do not resolve it.

Tests: dry-run on an uninitialized package, on damaged projections, and on a
legacy ledger writes nothing to `memory/` or the manifest; apply collapses a
three-version group; a group with no current-hash match is skipped; a group
whose current file matches two records (impossible for real imports, forced
with a fake) is skipped; manifest change mid-run stops; re-running apply is a
no-op.

### Step 4. Decide the cap now (separate change, Ben's call)

- D6a. Raise `MAX_ACTIVE_CANON_CHARACTERS` when the real set crosses it.
- D6b. Measure the markdown only. Codex found no consumer that needs the JSON
  under 64k; the JSON is transport for the CLI and routes, and
  `agentContext.ts` inserts markdown. The cap was widened to
  `max(json, markdown)` in commit `94f233b` for citation rendering, not for a
  transport limit. If chosen, decide whether the limit is the agent-visible
  prompt (spoilers excluded, 23.6k today) or all canon (spoilers included,
  28.5k), and test both.

Decision (Ben, 2026-09-11): D6b, measured with spoilers included, as a
separate change. Rationale: agent prompts today exclude spoilers, so the
inclusive measurement (28,486 characters) conservatively budgets all canon
and leaves 35,514 under the existing 64,000 cap.

### Step 5. Run on Bloodless and verify

1. Full vitest suite green.
2. `reconcile-stale --dry-run` against
   `/Users/ben/WriterOS Projects/Bloodless (83a0724e).writeros` with
   `--from <story root>/wayfinder`. Expect 21 groups, 0 skipped. Ben reads the
   winner and loser list and explicitly accepts the replacement before apply.
   Acceptance, not merely reading, is the approval.
3. `--apply`: expect 21 events, revision 113, 31 active canon.
4. `memory -- context` succeeds; JSON about 50.9k.
5. `import --dry-run` afterwards: zero new records, zero expected
   supersessions.
6. Skill edit (`~/.claude/skills/story-wayfinder/SKILL.md`): one sentence at
   the publish step, one at the reopening rule, as in D3. Last, after Ben
   confirms.

## Out of scope (flagged, not done)

- F1. Open questions never retire when a ticket resolves (`tickets/05-...`
  active open_question beside `resolved/05-...` active canon). Same class,
  separate fix, no cap impact.
- F2. Wayfinder split-root limitation unchanged.
- F3. Ticket ids (`wf-xxxxxxxx`) are not yet the anchor; a renamed file breaks
  version linkage. Acceptable.
- F4. PitchStudio supersession (D2).
- F5. (Resolved in Step 2: the import dry-run branch now uses
  `readSnapshotReadOnly`.) The `context` and `export` commands still use
  `readSnapshot`; unchanged here.

## Files touched

- `shared/projectMemory.ts`, `server/projectMemory/store.ts` (Step 1)
- `server/projectMemory/cli.ts` (Steps 2, 3)
- `tests/server/projectMemoryStore.test.ts`, `tests/server/projectMemoryCli.test.ts`
- `~/.claude/skills/story-wayfinder/SKILL.md` (Step 5, last)

## v1 review findings and verification

| # | Codex finding | Verified? | Outcome |
| --- | --- | --- | --- |
| 1 | Inherited HITL headers do not prove approval of an amendment | Yes: `activeCanon` is derived from directory + headers + presence of an Answer section | Accepted as should-fix, not blocking: the amended version already activates today; the change retires the old one. Procedural prerequisite in D3, tests in Step 1 |
| 2 | Cleanup can use ordinary publish with a maintenance dedupe key | Yes: idempotency check precedes target validation; new dedupe key gives a new id | Accepted; Step 2 (new action) dropped, D4 |
| 3 | CLI-side prior lookup is not atomic with publish | Yes: `runImport` reads the snapshot outside the store lock | Accepted; resolved by D1 (store computes under lock via an opt-in flag) |
| 4 | PitchStudio ordinal source ids are not stable identities | Yes: `pitchStudio.ts:135` | Accepted; PitchStudio excluded (D2) |
| 5 | `readSnapshot` writes during dry-run | Yes: it replays with migrations and repairs projections; `readSnapshotReadOnly` exists | Accepted for the new command; existing import dry-run flagged as F5 |
| 6 | Replay does not require an active record for non-empty supersession | Yes: no such check in the `published` branch | Accepted; D5, Step 1.3 |
| - | `finalizePreview` dedupes by hash, not anchor | Yes: `importer.ts:141` | Plan text corrected; fake-preview loop test kept |
| - | D4b is safe, decide spoiler visibility | Not independently re-derived; consumer list matches what I found | Carried into Step 4 with a recommendation |
