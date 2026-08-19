# Runbook: Unified Project Memory V1

Operational recovery procedures for the shared `.writeros` project memory system
(`docs/product/unified-project-memory-prd.md`). Audience: whoever is operating a
WriterOS instance (today, that's Ben) when something in the memory ledger, an
external-workflow import, or a hand-edited integration contract goes wrong.

Every procedure below only touches files inside one project's `.writeros`
package (`memory/ledger.jsonl`, `memory/snapshot.json`, `memory/canon.md`,
`memory/review.md`, `memory/analysis-queue.json`) or an external workflow's own
files. None of them touch `project.json`'s authored documents, and none of
them require deleting or resetting a whole project.

## 1. Rebuild a corrupted snapshot projection

**Symptom:** `memory/snapshot.json`, `memory/canon.md`, or `memory/review.md`
looks wrong, truncated, or fails to parse, but the Memory surface or CLI
context command still works (or fails with a message that does **not**
mention `ledger.jsonl`).

**Why this is safe:** `memory/snapshot.json` (and the two rendered `.md`
projections) are **not** the source of truth. Every read replays
`memory/ledger.jsonl` from scratch and only rewrites the projections when they
don't already match the replayed result
(`server/projectMemory/store.ts`, `readSnapshot`/`projectionsMatch`). A
corrupted snapshot file cannot corrupt the ledger, and reading it back
correctly is just a matter of forcing a fresh write.

**Recovery:**

```bash
npm run memory -- context --project "<absolute path to the .writeros package>" --query "" --format json
```

Any `context` (or `import`, `publish`, `link-source`) CLI call already forces
this repair as a side effect, because every command reads the snapshot via
`readSnapshot`, which rewrites `snapshot.json`/`canon.md`/`review.md`
whenever they don't match the ledger. If you want to force the rewrite
without otherwise touching anything, the same `context` call above with an
empty `--query ""` is the lowest-impact way to do it. There is no separate
`rebuild` CLI subcommand in V1 — `readSnapshot`'s automatic repair is the
supported path; `ProjectMemoryStore.rebuild()` (same effect, unconditional)
exists for other server code paths but is not currently exposed as its own
CLI verb.

**Verify:** `memory/snapshot.json` is valid JSON again and its `revision`
field matches what the CLI's `context` output reports.

## 2. Inspect a ledger line failure

**Symptom:** Any project-memory operation — the Memory surface, `npm run
memory -- context`, or any agent turn — fails with a `corrupt-ledger` error,
or the CLI exits with code `3`. An agent turn on any writing surface returns
HTTP 503 with `{"error":"project-memory-unavailable","message":"Project
memory is unavailable and needs repair."}` (this exact failure mode is
proven end-to-end by the `corruption drills` tests in
`tests/integration/unifiedProjectMemory.test.ts`; this section is the
operator's manual mirror-image of that automated proof — "how do I find and
fix it").

**Why this needs care:** unlike the snapshot projections, `memory/ledger.jsonl`
**is** the source of truth. Every event line replays in order (append-only);
a malformed or out-of-sequence line makes every project-memory read fail
closed rather than silently skip the bad line.

**Diagnose:**

1. Open `memory/ledger.jsonl` in a text editor. Each line is one JSON object.
   `ProjectMemoryStoreError`'s message names the exact line number and the
   validation reason (e.g. `memory/ledger.jsonl line 42 is malformed:
   expected revision 43, received 44.`).
2. Common causes, in order of likelihood:
   - A line was hand-edited or partially overwritten (broken JSON, or a
     `revision` that skips or repeats a number).
   - Two processes appended concurrently outside the package lock (should not
     happen through any WriterOS-owned code path — `acquirePackageWriteLock`
     serializes every ledger writer — but a foreign process editing the file
     directly could still do this).
   - The file was truncated mid-write by a crash or a full disk. A crash-safe
     framed journal (`server/projectLibrary/packageLock.ts`) protects the
     package **lock's own** journal from a torn write; the memory ledger
     itself is plain JSON-Lines and is not similarly self-healing against a
     torn final line.
3. Confirm whether the bad line is the **last** line in the file (a torn
   write) or an interior line (a real corruption/hand-edit).

**Recover:**

- **Torn last line:** delete just that last, incomplete line. Every earlier
  line still replays correctly and its `revision` sequence is unbroken.
  Re-run `npm run memory -- context --project <path> --query ""` to confirm
  it now reads cleanly and rewrites the projections (§1).
- **Interior corruption:** this is a real data-integrity incident, not a
  routine recovery. Do not hand-repair interior lines by guessing at their
  intended content — that risks fabricating memory that never happened.
  Restore `memory/ledger.jsonl` from the most recent known-good backup instead
  (Time Machine, a manual copy, or your normal filesystem backup for the
  `.writeros` package's parent folder), or, if no backup exists and the
  corruption is truly unrecoverable, treat every record after the last known
  line as lost and accept the loss explicitly — re-import from the original
  external workflow sources (§3) to recover as much as those sources can
  still reconstruct. There is no destructive auto-repair path in V1 by
  design: `applyEvent`'s validation exists specifically to fail loud rather
  than silently drop or reinterpret a bad line.

**Verify:** after any hand-edit to `ledger.jsonl`, always re-run the CLI
`context` command before trusting the project again — it is both your
verification step and your projection-repair step (§1) in one.

## 3. Retry a pending source import

**Symptom:** `npm run memory -- import --source <wayfinder|pitchstudio|buzz>
--from <path> --apply` exits with code `3` and prints a
`CliImportPartialError`-shaped message reporting `durability: "reconciled"`
(with an `appliedCount`/`lastRevision`) or `durability: "unknown"` (with a
`lastKnownAppliedCount`/`lastKnownRevision`). This means the import stopped
partway through its record list — some records are durably published,
possibly one more was in flight, and the rest were never attempted.

**Why it's safe to just re-run:** every import record carries a stable,
content-derived `dedupeKey` plus a `source.sourceHash`. Publishing the exact
same record twice is a documented no-op (`ProjectMemoryStore.publish` returns
`published: false` for an idempotent retry) — see
`server/projectMemory/store.ts`. Re-running the identical import command from
the beginning is always safe; it will not double-publish anything already
durable, and will pick up exactly where the interruption left off.

**Recover:**

```bash
npm run memory -- import --project "<absolute .writeros path>" \
  --source <wayfinder|pitchstudio|buzz> --from "<source folder>" --apply
```

If the source folder or the project's linked source (Buzz's `buzzChannelId`,
set via `npm run memory -- link-source`) changed between the first attempt
and the retry, the CLI will refuse with "The project source linkage changed
during import." — re-check `project.json.sources` and the source folder
before retrying rather than forcing past that check.

**Verify:** the retried command's final JSON output reports the two counts
separately, per `server/projectMemory/cli.ts:540-546` — every record that
was already durable from the interrupted first attempt is counted in
`duplicates` (idempotent, not re-applied), while any record the interrupted
run never durably published is now counted in `applied`. Cross-check with
`npm run memory -- context --project <path> --query "" --format json` for
the expected record count.

## 4. Revert a hand-reviewed external workflow edit

**Symptom:** an edit proposed by one of the `integrations/*/memory-contract.md`
documents (Story Wayfinder, PitchStudio, or Buzz) was applied to the external
tool's own files and needs to be undone — the edit misbehaved, or Ben wants to
stop wiring that workflow into shared project memory.

**Why this exists:** V1 "has no integration installer" — every external
workflow contract is a hand-reviewed, hand-applied Markdown edit to a file
WriterOS does not own and never writes to automatically. Reverting is
therefore also a hand action, and each contract documents its own exact
rollback text so the revert is unambiguous rather than reconstructed from
memory.

**Recover:** open the relevant contract and follow its `## 3. Rollback`
section verbatim — do not improvise a revert from general knowledge of what
the edit "probably" did:

- **Story Wayfinder** — `integrations/story-wayfinder/memory-contract.md`,
  section 3: reverse edits D, C, B, then A (each replaces that edit's NEW
  block with its OLD block; order matters only in that A must go last, since
  undoing A deletes the whole "Shared project memory" section). After all
  four, the target file
  (`~/.claude/skills/story-wayfinder/SKILL.md`) is byte-identical to the
  version read on 2026-08-15, modulo any unrelated edits made independently.
  Per the contract's §4, do not treat the reverted (or the originally
  applied) skill as live without first running the skill's own
  `tests/HARNESS.md` manual gate to three consecutive zero-FAIL runs.
- **PitchStudio** — `integrations/pitchstudio/memory-contract.md`, section 3:
  reverse edits C, B, then A the same way (target file is PitchStudio's own
  `PATTERN.md`).
- **Buzz** — `integrations/buzz/memory-contract.md`, section 3: this
  contract is one contiguous addendum rather than several discrete edits —
  delete everything from the `---` line immediately before "## 12. WriterOS
  shared project memory bridge (addendum, 2026-08-15)" through the end of the
  file; the section gives the exact closing lines the file should end with
  once that's done.

**Verify:** diff the reverted file against a copy taken before the original
edit (or against the byte count/line count each contract's rollback section
states) to confirm the revert is exact, not approximate.

## 5. Disable shared memory for a browser-only project

**Symptom:** a project should not participate in shared project memory at
all — either temporarily (debugging) or as a permanent choice for that
project — and should fall back to the existing browser-only (localStorage)
behavior with a visible, honest limitation rather than a silent one.

**This is supported, not a failure state.** `client/src/lib/useProjectMemory.ts`
reports `browserOnly: true` and the fixed message `"Shared project memory
requires project folder storage."` for any project id that is not a
folder-backed `.writeros` project id — there is nothing to "turn off"
beyond simply not having (or removing) that folder backing. On the agent
side, `buildAgentMemoryContext` returns a `disabled` context (empty prompt,
`receipt.status: 'disabled'`) whenever no project memory provider is wired or
the given project id doesn't resolve to a folder-backed package — every
writing surface's agent call already handles this without erroring the
request.

**Recover / apply:**

- **Whole-instance disable:** unset (or never set) `WRITEROS_PROJECTS_ROOT`.
  `loadProjectLibraryConfig` returns `enabled: false`, `registerRoutes` never
  constructs a project memory provider, and every project on that instance
  runs browser-only. This is also the automatic fallback `registerRoutes`
  takes if `WRITEROS_PROJECTS_ROOT` is set but invalid (see
  `server/routes.ts`'s `registerRoutes` — it retries with
  `WRITEROS_PROJECTS_ROOT: undefined` on any config load failure rather than
  crashing the server).
- **Single-project disable, instance otherwise unchanged:** move that
  project's `.writeros` package out of the configured `WRITEROS_PROJECTS_ROOT`
  directory (e.g. into an adjacent `_disabled-memory/` folder outside the
  root). The project library store's scan will simply not find it; opening
  that project falls back to loading it as a plain browser/local project
  (assuming it also has a browser-local copy — moving the *only* copy of a
  folder-backed project is a data-relocation action, not a memory toggle,
  so keep a copy if you are not sure). Move the package back into the root
  to re-enable; nothing about the ledger itself needs to change either way,
  because it was never read while the package was outside the scanned root.

**Verify:** the Memory surface for that project shows the browser-only
message instead of a snapshot; an agent turn on that project still completes
normally with `memoryReceipt.status === 'disabled'` and no citations.

## 6. Generate a What's Standing report

**Symptom / Use:** you need a deterministic, readable snapshot of unresolved
references and open questions in a project's memory — what questions are still
waiting for answers, which answers need re-examination, or what the memory
currently "thinks is standing."

**Why this is safe:** this command is read-only. It queries `memory/ledger.jsonl`
and `memory/annotations.jsonl`, replays all annotations to resolve each reference
claim, and renders the current state as either a Markdown report or JSON — it
never writes to the project.

**Command:**

```bash
npm run memory -- report --project "<absolute .writeros path>" --format markdown|json
```

The `report` command reads the full memory ledger and every recorded answer
(`memory/annotations.jsonl`) and builds a deterministic "What's Standing"
output. If any reference claims remain unresolved (no `answer` recorded yet), the
report opens with an `INCOMPLETE` banner, listing which question IDs are still
waiting.

**Verify:** `--format json` renders the same data as JSON; both formats are
idempotent — running `report` twice produces identical output. Exit code is 0 on
success, 2 if the `--project` path is invalid, or 3 if the ledger or annotation
log is corrupt and cannot be replayed.

## 7. List open reference questions

**Symptom / Use:** you want to see which reference questions are still unanswered
and what candidate resolutions are available for each one.

**Why this is safe:** this is also read-only. It scans the unresolved references
and reports the candidates (e.g., which external sources have potential matches)
without modifying anything.

**Command:**

```bash
npm run memory -- questions --project "<absolute .writeros path>"
```

The `questions` command lists every reference claim in the ledger that does not
yet have an `answer` recorded in `memory/annotations.jsonl`. For each, it prints
the question ID, the context from the original claim, and any candidate matches
the memory system found (e.g., names or titles from external sources that might
match the question).

**Verify:** exit code 0 on success, 2 for invalid path, 3 for corrupt state. The
list is derived fresh from the ledger and annotations; there is no separate
state to synchronize.

## 8. Record an answer to a reference question

**Symptom / Use:** you have examined an unresolved reference and decided either
that it resolves to specific records, that you cannot answer it right now, or
that it is not really a reference at all — and you want to record that decision
durably in the project's memory.

**Why this writes durably:** unlike `report` and `questions`, this command
appends a new entry to `memory/annotations.jsonl` (never modifying the ledger
itself). Each answer is immutable once recorded and becomes part of the future
resolution logic for this question ID.

**Command:**

```bash
npm run memory -- answer --project "<absolute .writeros path>" \
  --question <id> \
  (--referents <id,id> | --cant-say | --decline)
```

Pass exactly one of the three outcomes:

- **`--referents id,id`** — the question resolves to these specific record IDs.
  The report will mark this question resolved, and future references to those
  records will cite the answer.
- **`--cant-say`** — you cannot answer this question right now, but you might be
  able to later. The report will remain incomplete, but the system stops
  re-asking the same question repeatedly.
- **`--decline`** — this is not really a reference to an external record. The
  question was a false alarm or a linguistic match that does not map to shared
  memory. The report will skip this question entirely.

**Verify:** exit code 0 on success. The answer is durably appended to
`memory/annotations.jsonl`. Re-run `report` to confirm the question's state has
changed according to which outcome you recorded.

## 9. Sweep and re-open resolutions after backup restore

**Symptom / Use:** you have restored a backup of a project's `.writeros` package
from an earlier moment, but the restoration may have left `memory/ledger.jsonl`
and `memory/annotations.jsonl` in a time-mismatch state — the ledger could have
events the old annotation log never saw, or vice versa. You want to durably
re-examine which resolutions still make sense given the current ledger state.

**Why this is safe and necessary:** `invalidate` is the recovery tool for a
specific backup-restore scenario. It scans every recorded answer in
`memory/annotations.jsonl`, checks whether the premise of each answer still
matches the current ledger (e.g., do the referent IDs it cited still exist in
the records?), and durably reopens any answer whose premise is no longer valid.
Only the answers that no longer apply are touched; valid answers remain resolved.

**Recovery flow after restoring a backup:**

1. **Run invalidate** to sweep for stale resolutions:
   ```bash
   npm run memory -- invalidate --project "<absolute .writeros path>"
   ```
   This checks every answer against the current ledger. If a referent no longer
   exists or an answered question's context has changed, the answer is marked
   invalid and the question is reopened. Exit code 0 on success.

2. **Check the report** to see what re-opened:
   ```bash
   npm run memory -- report --project "<absolute .writeros path>" --format markdown
   ```
   The report will show an `INCOMPLETE` banner if any questions are now
   unanswered again. Review the list of newly reopened questions.

3. **Answer the reopened questions** using the `answer` command (§8):
   ```bash
   npm run memory -- answer --project "<absolute .writeros path>" \
     --question <id> \
     (--referents <id,id> | --cant-say | --decline)
   ```

**Why it writes to `memory/annotations.jsonl`:** `invalidate` appends new
`invalid` entries to the annotation log, marking stale answers durably without
erasing them. This creates an audit trail of what changed and when.

**Verify:** exit code 0 on success, 2 for invalid path, 3 for corrupt state. The
annotation log is never truncated or rewritten — only appended — so the full
history of answers and invalidations remains in the file.

## Known deferred minors: analysis-queue truncation and growth

Two Task 8 behaviors are intentional, documented, low-severity V1 trade-offs,
not bugs — but they're worth knowing how to detect and, if they ever bother
you, how to safely clear:

- **Silent truncation.** `memory/analysis-queue.json` stores each pending
  WriterOS document-analysis item's prior/current text bounded at 20,000
  characters (`MAX_STORED_TEXT_LENGTH` in
  `server/projectMemory/writerOSObserver.ts`) with no warning surfaced
  anywhere if a document's change is larger than that. This only affects the
  *input* to the background analyzer for one document-change event — it
  never truncates a published memory record's `claim` (600 chars) or
  `detail` (8,000 chars), which are validated separately at publish time.
- **Unbounded growth.** The queue file keeps every item it has ever created,
  including ones already `done` or `failed`, forever — there is no
  compaction or rotation. On a long-lived, actively-edited project this file
  will grow indefinitely.

**Detect:** `ls -la <project>.writeros/memory/analysis-queue.json` — if it's
surprisingly large (multiple MB) for a project's actual activity level,
that's the growth behavior, not a bug you need to chase.

**Manually recover:** deleting `memory/analysis-queue.json` entirely is
**safe**. It is a work-queue / status-tracking file only — every record it
ever successfully published is already durable in `memory/ledger.jsonl`
(the actual source of truth), and `readAnalysisQueue` simply returns an empty
list for a missing file (`server/projectMemory/writerOSObserver.ts`,
`readQueueFile`'s catch-all). Deleting the file also discards any items that
were still `pending` or `failed` at the moment you delete it — those changes
will **not** be re-analyzed; only the next document change queues fresh
analysis. The next WriterOS save re-derives fresh queue entries for whatever
changes next. **Do not** apply this same "just delete it" recovery to
`memory/ledger.jsonl` — the ledger is not re-derivable from anything else;
see §2 above instead.

## Note: script-selection patching is V1.1, not V1

The plan's stale-script-patch item (extending the memory-grounded structured
patch flow — request/preview/apply — to script text selections, not just
Synopsis/Outline/Treatment/Story Bible) is out of scope for V1 by ruling.
`shared/memoryPatches.ts`'s `STRUCTURED_DOCUMENT_SURFACES` intentionally does
not include `script`, and there's no separate script-patch failure mode to
document here because the feature doesn't exist yet. If it's built later, it
needs its own runbook entry once it has its own recovery/failure surface.
