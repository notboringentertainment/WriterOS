# Plan Review Log: WriterOS Beat Sheet and Lookbook
Started 2026-09-29 (evening, local). MAX_ROUNDS=5. Codex model: gpt-6-sol (reasoning high), read-only every round.

## Round 1 — Codex (gpt-5.5)

I would not approve this plan yet. Material problems:

- `PLAN.md:52` claims old builds ignore unknown `sources`, but current `ProjectSourcesSchema` is `.strict()` with only `buzzChannelId` ([projectPackage.ts](/Users/ben/Projects/WriterOS/client/src/lib/projectPackage.ts:54)). Adding `wayfinderRoot` makes rollback builds reject `project.json`.
  Fix: make `sources` forward-compatible with `catchall(z.string())`/passthrough before any package is linked, or store the link outside `project.json`.

- Refresh-on-open can still be clobbered by autosave. The client schedules a full package save 600 ms after state changes ([App.tsx](/Users/ben/Projects/WriterOS/client/src/App.tsx:391)), and PUT rewrites from the client payload ([routes.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/routes.ts:109), [store.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/store.ts:471)). A stale tab can overwrite the freshly synced outline.
  Fix: add server-side CAS/merge in `writeProject`: preserve/reject when disk `outline.revision` or `beatSheetSource.sourceHash` is newer than the client payload.

- The “memory observer sees no document change” claim is only true for a fresh client. The observer snapshots disk before save, then diffs the client’s serialized payload ([routes.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/routes.ts:100), [routes.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/routes.ts:119)); a stale autosave after sync queues an analysis for a rollback.
  Fix: make stale-outline PUT impossible via CAS, and add an observer test for stale tab after refresh.

- `POST refresh` is not atomic with the read it returns. Task 5 syncs, releases the lock, then calls `readProject` ([PLAN.md:747](/Users/ben/Projects/WriterOS/PLAN.md:747)); an autosave can land between those operations.
  Fix: return the exact outline written by `syncBeatSheet`, or hold one package lock across sync+read plus CAS on subsequent saves.

- `writeOutline` re-reads inside the lock but the plan computes `planBeatUnits` before the lock ([PLAN.md:572](/Users/ben/Projects/WriterOS/PLAN.md:572), [PLAN.md:663](/Users/ben/Projects/WriterOS/PLAN.md:663)). Concurrent WriterOS-side fields like `linkedSceneIds` or `draftNotes` can be lost.
  Fix: re-read outline, re-check hash, recompute `planBeatUnits`, and write inside the same lock.

- Beat identity is not stable for duplicate titles. The suffix rule (`beat.the-dinner`, `beat.the-dinner-2`) is order-derived ([PLAN.md:202](/Users/ben/Projects/WriterOS/PLAN.md:202)), so reordering or inserting a duplicate swaps identities, violating the spec’s identity-not-position rule.
  Fix: require explicit stable keys for duplicates, or reject duplicate bold titles until the ledger supplies keys.

- The plan contradicts itself on duplicate titles: A2 says an undisambiguatable title collision is malformed ([PLAN.md:37](/Users/ben/Projects/WriterOS/PLAN.md:37)); D2 says collisions get `-2`, `-3` ([PLAN.md:70](/Users/ben/Projects/WriterOS/PLAN.md:70)).
  Fix: choose one behavior and test the real Grave Affairs duplicate/collision case.

- `wayfinderRoot` is a persisted arbitrary absolute path. The CLI guards it once, but the sync route later trusts manifest text; `ticketRoot` only checks a `wayfinder` child symlink, not every root component ([wayfinder.ts](/Users/ben/Projects/WriterOS/server/projectMemory/adapters/wayfinder.ts:127)).
  Fix: run `guardExistingPath(root, 'directory')` and `verify()` inside every sync, use the canonical path, and reject unsafe edited manifests.

- The Lookbook question route trusts client-supplied `beatKey`, `beatTitle`, and `beatBody` ([PLAN.md:941](/Users/ben/Projects/WriterOS/PLAN.md:941)). A stale or malicious client can ask Zoe about non-current or injected beat text.
  Fix: accept only `beatKey`; load the current package server-side and build the prompt from the live outline unit.

- Lookbook persistence is under-specified and likely drops data. `migrateState` reconstructs `documents` from only four surfaces ([projectState.ts](/Users/ben/Projects/WriterOS/client/src/lib/projectState.ts:401)), and `saveProjectState` writes only those four ([projectState.ts](/Users/ben/Projects/WriterOS/client/src/lib/projectState.ts:461)). The plan incorrectly says unknown optional fields pass through ([PLAN.md:522](/Users/ben/Projects/WriterOS/PLAN.md:522)).
  Fix: extend `ProjectDocuments`, defaults, migration, browser save, and package round-trip tests to preserve `documents.lookbook`.

- The GET response shape change is incomplete. `ProjectLibraryReadResponse` is currently `{ result }` ([projectLibraryApi.ts](/Users/ben/Projects/WriterOS/shared/projectLibraryApi.ts:33)), while `ProjectStorageAdapter.readProject` returns `ProjectPackageReadResult` ([projectStorage.ts](/Users/ben/Projects/WriterOS/client/src/lib/projectStorage.ts:118)); Task 5 adds `{ result, beatSheet }` but Task 7 only hand-waves client plumbing.
  Fix: introduce a distinct server-read response type and update adapter/hook call sites with tests.

- Import can mix canon from one folder and beats from another: Task 4 says if `--from` differs from `sources.wayfinderRoot`, warn and use `--from` for canon but the link for beats ([PLAN.md:686](/Users/ben/Projects/WriterOS/PLAN.md:686)).
  Fix: fail on mismatch unless an explicit `--relink` is supplied, then use one canonical guarded source for both canon and beats.

VERDICT: REVISE

### Claude's response to Round 1

Accepted (11 of 12), with the change made in PLAN.md:
1. Strict `sources` schema breaks rollback → link moved OUT of `project.json` into `<projectsRoot>/.writeros-story-drive-links.json` (D8). `project.json` is never written by this build; the old build ignores the registry.
2. Stale-tab autosave clobbers a sync → D9: `writeProject` keeps on-disk `units` + `beatSheetSource` whenever the package has a `beatSheetSource` (merge, not reject: rejecting would lose Ben's other edits in the same save). Test in Task 5.
3. Observer queues analysis after a stale save → same fix; explicit test asserts the analysis queue has no outline item after a stale PUT.
4. `POST refresh` not atomic with the read → the sync now returns the outline it wrote; the client replaces its outline from that, no second read.
5. `planBeatUnits` computed outside the lock → the whole read-hash-parse-plan-write runs inside one package lock (Task 3 behaviour spec), plus a test that a concurrent lock waits.
6/7. Duplicate titles order-derived, A2 vs D2 contradiction → duplicates are now malformed (`duplicate-title`, names the title), no suffixing; `beatKey(title)` is pure. Grave Affairs' 14 titles are distinct (verified). Tests in Tasks 1 and 3.
8. Registry root trusted → every sync re-runs `guardExistingPath(root,'directory')` + `verify()` and reads the canonical path; failure → `unavailable`. Test for symlink/missing root.
9. Lookbook route trusts client beat text → request is `{ beatKey, clientRequestId }` only; server builds the prompt from the on-disk unit; 404 for unknown key. Test asserts the stubbed provider saw disk text.
10. `migrateState`/browser save drop `documents.lookbook` → Task 2 now extends `ProjectDocuments`, defaults, `migrateState`, and the localStorage save/load, with `tests/lib/projectStateLookbook.test.ts`.
11. GET response shape change unplumbed → `ProjectLibraryReadResponseSchema` gains `beatSheet`; `ProjectStorageAdapter.readProject` returns `{ result, beatSheet }` (folder adapter: null); hook and App updated; adapter tests in Task 7.
12. Import mixing folders → fail on mismatch unless `--relink`; one canonical guarded source for canon and beats.

Rejected: none outright. Modified: #2/#3 use merge-on-save rather than CAS reject, reason above.

## Round 2 — Codex (gpt-5.5)

Findings:

- D9 does not actually protect the memory observer. The plan adds `keepServerOwnedBeatFields` inside `writeProject` ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:824)), but the route still computes `currentFiles` from the original client `project` after `writeProject` returns ([routes.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/routes.ts:119)), so a stale PUT can still queue an outline analysis.
  Fix: have `writeProject` return the effective saved files/project, or perform the merge in the PUT route before both save and observer diff.

- Even if the observer used merged files, D9 preserves only `content.units` and `content.beatSheetSource` ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:787)); stale `revision`/`updatedAt` from the client still differ, and `detectDocumentChanges` hashes the whole parsed document ([writerOSObserver.ts](/Users/ben/Projects/WriterOS/server/projectMemory/writerOSObserver.ts:123)).
  Fix: when only server-owned beat fields differ, preserve the entire on-disk outline wrapper or normalize revision/updatedAt before observer hashing.

- `documents/lookbook.json` cannot be removed once created. `writeProject` copies the existing package tree, then writes only serialized files without deleting omitted managed files ([store.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/store.ts:490), [store.ts](/Users/ben/Projects/WriterOS/server/projectLibrary/store.ts:201)); Task 2 says absent/empty lookbook is “not written” ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:468)), but stale staging will preserve the old file.
  Fix: explicitly `rm` `documents/lookbook.json` from staging when `hasLookbookContent` is false, with a server-store deletion test.

- The safe-path plan says to read the canonical path, but the skeleton reads `root.path` after `guardExistingPath` ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:626), [PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:694)); the guard exposes `canonicalPath` separately ([safePaths.ts](/Users/ben/Projects/WriterOS/server/projectMemory/safePaths.ts:98)).
  Fix: use `root.canonicalPath` after `verify()` for all Story-drive reads.

- The 1.5s “Story-drive read budget” is incomplete. `locateDecision` scans/reads `resolved/*.md` before the timed `read` in the skeleton ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:695), [PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:697)), so iCloud stalls during scan can still hang open while the package lock is held.
  Fix: timebox all Story-drive filesystem operations in locate/scan, or skip open-time scanning unless a registry pointer is present.

- The registry is a shared root-level read-modify-write file with no lock ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:600)); two concurrent `link-source` commands for different projects can drop one link.
  Fix: add a registry-level lock or atomic compare/retry around `writeStoryDriveLink`.

- The plan still overstates “`project.json` is never written by this build” ([PLAN.md](/Users/ben/Projects/WriterOS/PLAN.md:86)); current saves always serialize the manifest with `openedAt` ([projectPackage.ts](/Users/ben/Projects/WriterOS/client/src/lib/projectPackage.ts:251)), and the go-live diff already expects that.
  Fix: reword to “the beat sync and link registry never write `project.json`.”

VERDICT: REVISE

### Claude's response to Round 2

Accepted all 7:
1. Observer still hashed the raw client payload → merge moved out of the store into the PUT route (`keepServerOwnedBeatFields(prior, incoming)` in beatSheetRoutes.ts), and both `writeProject` and the observer's `currentFiles` use the effective project.
2. Stale `revision`/`updatedAt` still differ → when the merged content deep-equals disk, the on-disk outline document is reused wholesale (revision, updatedAt included); otherwise merged content with `revision = max`. Two tests: stale-only (queue empty) and stale-plus-real-edit (one outline item, spine edit kept).
3. `lookbook.json` never removable → `writeProject` `rm`s it from staging when the payload has no lookbook content; store tests for remove and keep.
4. `root.path` vs canonical → all Story-drive reads under `root.canonicalPath` after `verify()`; test with a symlinked parent.
5. Budget did not cover locate/scan → one deadline for every Story-drive fs call (guard, stat, readdir, reads); pointer present → no scan; scan reads header blocks only; test with a stalled readdir.
6. Registry read-modify-write unlocked → `writeStoryDriveLink` runs under `acquirePackageWriteLock({ projectId: 'story-drive-links' })` (the helper hashes any id into its own lock file, verified in packageLock.ts:43); concurrency test added.
7. "project.json never written" overstated → reworded to "the beat sync and the link registry never write project.json; the app's own save still rewrites it with openedAt".

Rejected: none.

## Round 3 — Codex (gpt-5.5)

No material blockers found in Round 2.

The previous write-path problems are now addressed in the right place: the stale-save merge moved into the PUT route before both `writeProject` and `observeWriterOSSave`, and the observer now hashes the effective project rather than the raw stale client payload. The wrapper reuse when only beat fields differ also covers the `revision`/`updatedAt` false-positive queue issue.

The other Round 2 fixes line up with the repo:

- `documents/lookbook.json` removal is now explicitly handled after staging writes, which fits the current copy-existing-package-tree behavior.
- Story-drive reads now use `canonicalPath` from `guardExistingPath`, matching `safePaths.ts`.
- The timeout now covers locate/scan/read, not just the final Markdown read.
- Registry writes now have a concrete lock strategy using the existing package lock helper.
- The `project.json` claim is scoped correctly: sync/registry do not write it, normal saves still do.
- Beat identity remains conservative: title-derived keys, duplicate titles refused, retitle becomes orphan.

Residual watch item, not a blocker: `keepServerOwnedBeatFields` should be implemented exactly as specified, because small deviations there can reintroduce observer noise. The named tests in Task 5 are the right guardrail.

VERDICT: APPROVED

## Outcome

APPROVED after 3 rounds (2 REVISE, 1 APPROVED). No code written during the loop. Residual watch item: implement `keepServerOwnedBeatFields` exactly as specified; the Task 5 tests are the guardrail.
