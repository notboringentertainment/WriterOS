# Plan Review Log: WriterOS pare-down
Started 2026-10-15. MAX_ROUNDS=5. Plan: docs/plans/2026-10-15-writeros-pare-down.md. Codex model gpt-6.1-sol (config default), effort low.

## Round 1 — Codex

The plan has material problems with migration, canon preservation, and removal boundaries.

1. **The migration drops authored content from the working pages.** `synopsisToMarkdown()` omits the entire series branch, including pilot prose, season arcs and character bios; it also omits production notes and header fields. Archiving JSON does not make those facts available to Morgan or downstream readers.  
   **Fix:** Convert every populated authored field, including series content, and preserve existing composed prose explicitly.

2. **The new storage shape has no defined round-trip migration.** `ProjectDocumentsSchema`, `projectState.ts`, `useProjectState.ts`, `documentsToLegacy()` and package parsing all assume structured content. The server also reads a fixed `PACKAGE_TEXT_PATHS` list, so merely writing `outline-page.json` will not load it.  
   **Fix:** Specify the schema discriminator, backward-compatible loader, serializer and normalization changes, with an idempotent archive-before-replacement migration under the existing package lock.

3. **Phase ordering temporarily breaks readers.** Phase 2 replaces Synopsis and Treatment content; Phase 3 repoints their consumers. Those independently merged PRs leave existing readers dereferencing removed fields.  
   **Fix:** Move reader updates into the storage-change PR, or retain compatibility until every consumer has moved.

4. **The reader inventory is incomplete.** Missing consumers include `surfaceAwareness.ts`, `documentMigration.ts`, project normalization and format mirrors, App’s seed-export assembly, and the structured memory-patch path. Repointing project facts also does not replace consumers that need actual synopsis or treatment prose.  
   **Fix:** Inventory field reads and writes, and assign each to page prose, Story Bible facts or removal before changing storage.

5. **Migration and approval metadata trigger the frozen observer.** `detectDocumentChanges()` hashes the entire parsed document, not just prose. Migration, approval timestamps and approval revisions therefore enqueue analysis; the audit already found revision-number noise. Archiving originals does not prevent new records, supersession or conflicts.  
   **Fix:** Keep approval metadata outside observed documents and explicitly preserve analysis semantics during migration.

6. **Q3 violates the binding freeze.** Watching `outline-page.json` adds a new analysis source and new publication anchors; it does not “change nothing else.” Existing `outline.json` remains watched too.  
   **Fix:** Leave the new page outside observation in this plan; any expansion requires a separately authorized canon-behaviour change.

7. **Adding `outlinePage` to the protocol alone cannot work.** The plugin tool enum and guard, server live-channel validation, proposal schemas, client adapter, patch schemas, setters and active-surface routing all constrain supported targets. Existing Synopsis and Treatment proposals also require structured content.  
   **Fix:** Specify the complete proposal path for prose pages, preserving revision checks and the synced-beat prohibition on the existing outline target.

8. **The compose deletion removes code still required by What’s Standing.** `whatsStandingReport.ts` calls `composeWhatsStanding()` from `server/compose/index.ts`; that depends on deterministic composition, rendering, inventory and fidelity helpers. The memory CLI imports `renderComposedMarkdown` there too. Keeping only a fact sheet is insufficient.  
   **Fix:** Remove only the three model-composition branches and retain What’s Standing’s transitive dependencies.

9. **The “canon view” is actually a Story Bible field view.** The audit explicitly found fields empty despite canon containing the answers. Displaying those fields as canon—and emptiness as a canon gap—preserves that defect and mislabels authority. Inline field editing also does not automatically edit an active ledger record.  
   **Fix:** Distinguish Story Bible text from ledger canon and derive “Still open” from the declared source of truth.

10. **Ledger revision is not canon revision.** Snapshot revision advances for non-canon publications and other memory events. A page’s own save can generate analysis after approval and immediately make it appear outdated without any canon change.  
    **Fix:** Compare relevant active-canon changes since approval, excluding unrelated memory events.

11. **Existing duplicate facts disappear from downstream context without reconciliation.** Repointing characters, logline and premise to Story Bible can hide populated Synopsis/Treatment facts where the Bible is empty or contradictory. The archive is not a replacement reader.  
    **Fix:** Preserve those facts in migrated page prose and surface discrepancies without automatically promoting or overwriting canon.

12. **The regression procedure cannot verify F18 and undercovers the frozen system.** Turning the Room database off prevents exercising `syncStoryLocksBlock()` and its server banking path. Beat change/look promote/memory promote checks also omit appeals, ratification, proposal rejection and stale-proposal handling. Exact ledger equality is unreliable with generated IDs and model output.  
    **Fix:** Add focused fixtures for those paths, use an isolated Room backend for F18, and compare semantic events and authority transitions.

The economical revision is to narrow the removal boundary and preserve existing contracts, rather than add compatibility or synchronization machinery after these failures appear.

VERDICT: REVISE

### Claude's response

Accepted all 12 in substance. Central change: legacy synopsis/treatment files are frozen in place (no migration, no rewrite); prose pages live in new files documents/pages/*.json that the observer does not watch (resolves #1 #2 #3 #5 #6 #11). Q3 withdrawn (#6). Full proposal path for a new `page` target listed; synopsis/treatment structured targets removed, outline/storyBible + synced-beat guard untouched (#7). Only the three model compose branches are removed; What's Standing and renderComposedMarkdown deps kept (#8). Story Bible labelled as its own text, not canon; Still open comes from ledger open_question records; mock updated to drop invented provenance (#9). Out-of-date compares active canon set (id+version) at approval, not ledger revision (#10). Phase 3 starts with a full reader/writer inventory table including the files Codex named (#4). Verification: canon test files must run unedited; F18 tested with a fake room backend; semantic event comparison; frozen-file byte-identity check (#12). Partially rejected: none. Cost noted: duplicate legacy fields stay in storage, frozen.

## Round 2 — Codex

The separate page files resolve the destructive migration and observer-metadata problems. What’s Standing’s dependencies, canon freshness, and the Story Bible authority labels are also addressed. Four material gaps remain:

1. **The promised byte-for-byte freeze is not implemented by the proposed storage design.** `serializeWriterOSProjectPackage()` still normalizes and reserializes both legacy documents on every package save. `withProjectFormat()` also changes their headers and timestamps. Adding a separate `pages` slice does not stop either path.  
   **Fix:** Preserve existing legacy files from the locked package snapshot instead of serializing replacements, and prevent format mirrors from modifying their in-memory fallback values.

2. **Legacy writers remain enabled after Phase 2 declares the documents frozen.** Morgan’s tool enum changes in Phase 2, but Room field-write and memory-patch targets remain until Phase 3. Existing pending proposals can also outlive removal from a tool enum.  
   **Fix:** Disable generation and application of Synopsis/Treatment writes in Phase 2, including pending proposals; leave reader repointing for Phase 3.

3. **The test freeze contradicts the planned target removal.** `tests/server/structuredDocumentPatch.test.ts` explicitly expects successful Synopsis patches from `/api/wp-chat`. Removing those targets cannot preserve those tests unchanged, yet the plan requires both.  
   **Fix:** Explicitly authorize narrowly updating tests for retired targets while retaining the unchanged canon-authority and surviving-target assertions.

4. **The package lock does not make the new page revision check atomic.** The proposal checks the browser’s revision, while `writeProject()` later serializes whole-project saves under a lock without checking persisted page revisions. Two tabs can each accept a proposal against revision N; the second save overwrites the first despite serialization. First-open seeding has the same race.  
   **Fix:** Check persisted page revisions and seed-if-absent inside the existing package lock, rejecting stale saves without replacing newer pages.

These need bounded corrections to the existing save and proposal paths, not another service.

VERDICT: REVISE

### Claude's response

Accepted all 4. #1: serializer copies the two legacy files from the locked on-disk snapshot; withProjectFormat skips them; byte-identity test. #2: all legacy write paths (Morgan enum, Room propose_field_write, wp-chat structured patch, memory-patch application, late pending proposals) closed in Phase 2. #3: one narrowly authorised test edit (retired-target success becomes refusal), canon-authority and surviving-target assertions unchanged, listed in the PR. #4: page writes moved to their own PUT endpoint with expectedRevision checked inside the package lock; whole-project save never writes pages; seed-if-absent under the lock.

## Round 3 — Codex

One material gap remains; the other round-two findings are resolved.

**Freezing disk bytes does not yet freeze the observer’s inputs.** In `server/projectLibrary/routes.ts`, both `priorFiles` and `currentFiles` come from serializing project state outside the package-write lock. Separately, `migrateState()` and `saveProjectState()` still call `syncSynopsisFormatMirror()` and `syncTreatmentFormatMirror()`—skipping only `withProjectFormat()` does not stop those changes. A format change can therefore produce different observer inputs for Synopsis/Treatment even though the actual files were preserved, triggering analysis of content that was never saved.

**Fix:** Preserve the frozen values through all normalization paths, and supply the observer’s two frozen-file entries from the actual preserved package snapshot; test that a format change followed by a save queues neither document.

VERDICT: REVISE

### Claude's response

Accepted. Format mirrors no longer touch the frozen documents (migrateState/saveProjectState stop calling the synopsis/treatment mirror syncs); the save route feeds the observer the frozen files' real bytes from the preserved snapshot; observer code unchanged; test asserts a format change + save queues neither document.

## Round 4 — Codex

The revision closes the remaining observer-input gap: normalization preserves frozen values, the observer receives actual preserved bytes, and a focused regression test covers format changes.

No remaining material plan defects found. The added storage and proposal code has named jobs, and the canon boundary is explicit.

VERDICT: APPROVED

Converged at round 4 of 5. Awaiting Ben (gate #2) plus Q1, Q2.

## Act 3 — Build

### Phase 0, Round 1 — Codex build
Thread 01a142cd-dc2d-7ba3-b662-4881f0d19063. 11 files changed (+152 / -35), 7 new test files (12 tests). Codex reported full proof green and a sandbox walkthrough. No canon test files touched; no new dependencies.

### Claude's verdict
Diff read in full. Proof rerun by Claude: tsc clean, build clean; full suite green on 3 of 4 runs (one unidentified flaky failure on the first run, outside the new tests; the 12 new tests passed 5/5 in isolation). Browser check by Claude on a sandbox copy (port 5277, Room off, no AI keys):
- F21: reload reopened Stool Pigeon, not a blank Untitled Project. PASS.
- F24: typed in the script, switched to Story Bible at once; text on disk within 2 s. PASS.
- F20: server restarted (new token), typed without reloading: PUT 401 → bootstrap → PUT 200; text on disk. PASS.
- F19: Save showed "Saved ✓" only after the save; with the server down Save showed "Could not open or save this project. Try again." and no Saved. PASS.
- F18: lock sync now runs on editor blur / save / leave, independent of the Room panel; server no-ops unchanged text (surfaceLockSync merged === current). Covered by tests with a fake Room backend (Room DB is shared with live, so not exercised in the browser).
- Trust card: auto-answers only when the prompt's folder resolves (realpath) to the project's own Story-drive folder or package; any other folder still shows the card. Covered by tests.
No Critical/Important findings, so no fix round. Minors logged, not fixed (per Ben's no-nitpick rule):
- The save error text squeezes the project title in the current top bar. Phase 1 replaces this top bar.
- The script now writes to the folder after every 500 ms typing pause, not only on the folder-save delay. That means more saves, with no correctness issue seen.
- One flaky test under full-suite load, not in the Phase 0 tests.
