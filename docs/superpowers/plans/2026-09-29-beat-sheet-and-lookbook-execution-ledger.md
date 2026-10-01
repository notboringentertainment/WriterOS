# SDD ledger — plan: docs/superpowers/plans/2026-09-29-beat-sheet-and-lookbook.md
Spec: docs/superpowers/specs/2026-09-29-beat-sheet-and-lookbook-spec.md (reachable). Branch feat/beat-sheet-lookbook in /Users/ben/Projects/WriterOS (dev checkout, not main). Start HEAD d529294.

## Preflight scan (2026-09-29)
| Pair / task | Produces vs consumes | Found |
|---|---|---|
| T1↔T3 | parseBeatSheetDecision, isBeatSheetDeclared, beatKey(title) 1-arg | consistent |
| T2↔T3 | BeatSheetSourceSchema; AuthoredDocumentStateSchema(OutlineDocumentContentSchema) factory | consistent |
| T2↔T5 | WRITEROS_LOOKBOOK_PATH; serializer omits file when empty, store rm's stale file | consistent |
| T2↔T7/T8 | LookbookDocument, documents.lookbook? | consistent |
| T3↔T4 | syncBeatSheet needs projectId (CLI reads manifest); writeStoryDriveLink(projectsRoot, projectId, link) | consistent |
| T3↔T5 | BeatSheetSyncResult {status, outline?}; refresh returns outline ?? null | consistent |
| T5↔T7 | ProjectLibraryReadResponseSchema.beatSheet; BeatSheetRefreshResponseSchema | consistent |
| T7↔T8 | BeatSheetView lookbook callbacks; LookbookBeat props | consistent |
| T8↔T9 | postLookbookQuestions({beatKey, clientRequestId}); response {questions, nothingToSee, memoryReceipt} | consistent |
| T6→T7 | both edit OutlineTab.tsx; sequential | ok |
| T1 self | tests vs code: fixture has 3 distinct titles; duplicate test derives from fixture | consistent |
| T2 self | names saveProjectState/loadProjectState unverified; brief says adjust to real names | note for implementer |
| T3 self | readStoryDriveLinks runs before the lock, steps 4–9 inside; test seams readFile/readdir | consistent |
| T5 self | refreshBeatSheetOnOpen(config, store, id) uses config.rootPath — field name unverified | note for implementer: use the config's projects-root field whatever it is called |
| T6 self | grep-guard test asserts on source text; asserts something real | ok |
| rubric | no asserts-nothing tests, no mandated duplication found | clean |
Ruling: none needed at preflight.
Task 1: dispatched (base d529294, implementer haiku)
Task 1: review clean (sonnet). ⚠️ resolved by controller: step-6 keys in task-1-report.md match controller's own run (14 keys); `npm run check` run by controller → clean.
Task 1: minor (deferred): indented numbered lines would start a new beat (no test pinning it); combining-mark regex written as literal chars; duplicate check compares slugs, message says "title"; thin tests (beatKey asserts twice, no CRLF/indented-bold/label-null cases, "stops at ###" checks count only).
Task 1: complete (commits d529294..5e50416, review clean)
Task 2: dispatched (base 5e50416, implementer sonnet)
Task 2: review clean (sonnet). Deviations accepted: one-line type narrowing in client/src/lib/documentMarkdown.ts (tsc required it); ProjectDocuments lives in shared/documents.ts (brief was wrong about the file). ⚠️ byte-identical resolved by controller: read+serialize round trip of real packages → Grave Affairs 9/9 files identical; Bloodless and Yes Chef differ in synopsis/treatment/story-bible but identically so with the pre-Task-2 code (existing migrate normalisation, e.g. synopsis format feature→series), so not this task.
Ruling: Task 10's byte-identical check must take its "before" snapshot after one open-and-close of every package on the CURRENT live build (or list the three known normalised documents for Bloodless/Yes Chef as expected) — otherwise pre-existing normalisation will look like a regression. Cost if wrong: a false alarm at go-live, no data risk.
Task 2: minor (deferred): migrateState sets explicit lookbook: undefined while saveProjectState uses conditional spread; corrupt lookbook in localStorage dropped silently (as specified); invalid-file test covers schema failure only, not malformed JSON; "not written" test doesn't cover present-but-empty lookbook; round-trip test leaves localStorage state behind.
Task 2: complete (commits 5e50416..60220b1, review clean)
Task 3: dispatched (base 60220b1, implementer sonnet)
Task 3: Ruling: plan D1/Task 3 step 5 contradict ("pointer set → do not scan" vs "pointer and a declared file differ → ambiguous"). Decided: a registry pointer is Ben's explicit choice and wins; no scan when a pointer is set; `ambiguous` applies only to more than one declared file found during a scan. Why: the spec wants nothing picked up by accident and the open-time budget is 1.5 s. Cost if wrong: a show with both a pointer and a differently declared decision follows the pointer silently.
Task 3: review (opus) → Needs fixes: (I1) symlinked entries under resolved/ or the pointer file are followed out of the root; (I2 plan-mandated) planBeatUnits resets conflict/turn/consequence/whyNext on every re-sync.
Task 3: Ruling: planBeatUnits carries EVERY WriterOS-side unit field (location, characters, conflict, turn, consequence, whyNext, linkedSceneIds, draftNotes, aiProduction); only id, number, actOrSequence, title, whatHappens come from Story-drive. Why: the spec says the beat text is read-only, not that writer notes on a beat are disposable. Cost if wrong: stale writer notes survive a beat rewrite (visible, harmless).
Task 3: ⚠️ resolved by controller: WRITEROS_PROJECT_ID_PATTERN (^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$) accepts proj-1; parseBeatSheetDecision returns no-beats on zero beats (Task 1 line 90), never ok with an empty list.
Task 3: minor (deferred): decision-read timeout test doesn't isolate step 6; pointer case reads the file twice; malformed registry / invalid outline.json throw out of syncBeatSheet (route must catch, noted for Task 5); packagePath not cross-checked against projectId; hash-equal check ignores ticket path change; a directory named *.md in resolved/ → unavailable rather than skipped; scan reads whole files then slices 64 lines.
Task 3: fix round 1/5 (2 addressed + ruling test, 0 open — symlink refusal via lstat under deadline; nine carried fields; pointer-wins test; commits 8652f99..db424c7)
Task 3: complete (commits 60220b1..db424c7, review clean)
Task 4: dispatched (base db424c7, implementer sonnet)
Task 4: implementer DONE_WITH_CONCERNS (13b94f8). Ruling: `import --dry-run --relink` is a CliInputError ("--relink requires --apply"); a dry run never writes anything. Ruling: `--relink` replaces only `root` and keeps the existing `beatSheet` pointer. Why: dry-run means read-only everywhere else in this CLI; the pointer is Ben's explicit choice and unrelated to where the folder moved. Cost if wrong: an operator wanting to clear a pointer must re-run link-source (documented). Pre-review fix dispatched to the implementer.
Task 4: review clean (sonnet).
Task 4: minor (deferred): relink registry write happens before the publish loop (not atomic with a successful import); syncBeats() throw after canon apply exits non-zero without printing the canon result; no test for --relink with a non-wayfinder source; pre-existing duplicate "6." heading in the runbook.
Task 4: complete (commits db424c7..af48d21, review clean)
Task 5: dispatched (base af48d21, implementer sonnet)
Task 5: review clean (opus). ⚠️ resolved by controller: the 1.5 s deadline covers Story-drive fs calls only, the package-lock wait (5 s default) is outside it — acceptable, noted for final review; serializer omits lookbook.json for an empty lookbook (Task 2 tests: hasLookbookContent(emptyLookbook()) is false); fixture title "The Salt Line" is synthetic.
Task 5: minor (deferred): unlogged non-not-found failure of resolveProjectPackagePath on open; lookbook rm bypasses fileOperations.rm test hook; merged branch keeps the stale incoming updatedAt and prior's revision when a spine edit rides with stale beats (plan-mandated D9 — final review to decide whether updatedAt should be max); import style in server/routes.ts:1; no 503 test for refresh/status.
Task 5: complete (commits af48d21..e1fdf21, review clean)
Task 6: dispatched (base e1fdf21, implementer haiku)
Task 6: controller amended 83420af to drop PLAN.md/PLAN-REVIEW-LOG.md (review-loop scratch the implementer swept in); now e845b97; both files added to .git/info/exclude
Task 6: review (sonnet) → Needs fixes: (I1) OutlineTab.tsx confirm text still says "outline answers"; (I2) grep-guard is case-sensitive and covers 6 of 10 files.
Task 6: Ruling: `Outline beat ${n}` in client/src/lib/wpRouting.ts:282 is AI-context text sent to the model, not screen text — left as is (plan: server/AI text keeps "outline"). Cost if wrong: none visible to Ben.
Task 6: minor (deferred): OutlineTab.test.tsx test titles still say "clear outline".
Task 6: fix round 1/5 (2 addressed, 0 open — confirm text; case-insensitive guard with allowlist over all 10 files; commits e845b97..8a281b6)
Task 6: complete (commits e1fdf21..8a281b6, review clean)
Task 7: dispatched (base 8a281b6, implementer sonnet)
Task 7: implementer DONE_WITH_CONCERNS (e6001a5); 3 pre-existing tests/lib failures traced to Task 6 (leftZone x2, surfaceAwareness x1) → Task 6 fix round 2 dispatched in parallel with the Task 7 review
Task 7: review (opus) → Needs fixes: (I1) failed Refresh shows nothing, unhandled rejection; (I2) refresh landing after a project switch writes A's outline into B; (I3) OutlineTab wiring untested (refreshing flag, suffix clear, mount check once/guarded, status line in no-beatSheetSource branch); (I4) "Clear answers" still wipes synced beats client-side.
Task 7: Ruling: when `content.beatSheetSource` exists, `clearOutline` (any `keep` option) preserves `units` and `beatSheetSource`; only answers (spine, seriesEngine, seasonArc, episodes) are cleared. Why: spec says the beat list is read-only in WriterOS; relying on the server merge alone would show beats vanishing until the next open. Cost if wrong: none (beats are re-derived from Story-drive anyway).
Task 7: minor (deferred): synced date uses toLocaleString not the brief's `d MMM yyyy HH:mm`; `ambiguous`/`no-beat-sheet` copy untested; dead `not-linked` branch in statusText; weak textarea check in first test; status line rendered from two places.
Task 6: fix round 2/5 (1 addressed, 0 open — three tests/lib assertions; commits e6001a5..323e53f); Task 6 now fully complete.
Task 7: fix round 1 dispatched (4 findings) on top of 323e53f
Task 7: fix round 1/5 (4 addressed, 0 open; commits 323e53f..9216786)
Task 7: minor (deferred): late refresh result/rejection for project A can touch OutlineTab state if the tab is not remounted on switch; mount-check test doesn't assert the count stays 1.
Task 7: complete (commits 8a281b6..9216786, review clean)
Task 8: dispatched (base 9216786, implementer sonnet)
Task 8: review (sonnet) → Needs fixes: (I1) ask resolving after a project switch writes into the wrong project's lookbook. ⚠️ resolved by controller: removing the last orphan empties the lookbook → serializer omits the file → Task 5's writeProject rm removes the stale documents/lookbook.json from staging.
Task 8: minor (deferred): Ask button renders (and errors on click) for projects with no server adapter; no direct tests for lookbookEdits helpers / "Ask Zoe for more" transition; orphan view hides dismissed questions; clientRequestId is fresh per ask (not an idempotency key).
Task 8: fix round 1/5 (1 addressed, 0 open; commits c15bc5e..f820944)
Task 8: complete (commits 9216786..f820944, review clean)
Task 9: dispatched (base f820944, implementer sonnet)
Task 9: implementer DONE_WITH_CONCERNS (6557e60). Out-of-brief fix accepted pending review: server/projectLibrary/store.ts PACKAGE_TEXT_PATHS lacked documents/lookbook.json, so server readProject dropped a saved Lookbook; combined with Task 5's staging rm this would have deleted answers on the first autosave after an open (data-loss path Task 2's review missed). Reviewer asked to verify a server round-trip test exists.
Task 9: review (opus) → Needs fixes: (I1) no server round-trip regression test for the lookbook read (PUT→GET→PUT keeps documents/lookbook.json); (I2) prompts skip finalizeAgentMemoryText, so citation tokens could leak into Lookbook prompts and the receipt never lists citations. PACKAGE_TEXT_PATHS fix verified correct and complete (single use in readPackageFiles feeding scan/read/validate).
Task 9: minor (deferred): body validated before the enabled check (400 vs 503); provider errors mapped to 422 with raw upstream message; corrupt package read → 422; clientRequestId unused.
Task 9: fix round 1/5 (2 addressed, 0 open; commits 6557e60..dcc1b2b). Re-reviewer note: RED runs described in prose, not pasted; controller's own full-suite run covers the GREEN side.
Task 9: complete (commits f820944..dcc1b2b, review clean)
Tasks 1–9 complete. Task 10 (go-live) is Ben-run; final whole-branch review next.
Controller verification at dcc1b2b: npx vitest run → 251 files / 2704 tests passed (2 files, 10 tests skipped, pre-existing); npm run check clean; npm run build ok. Final whole-branch review dispatched (opus) over d529294..dcc1b2b.
Final review (opus, d529294..dcc1b2b): Ready with fixes. Important: (F1) browser-side outline writers (memory patch apply; replaceOutlineDocument wholesale swap) can rewrite ratified beats on screen / lose a just-typed Foundations answer; (F2) a save from a client whose state lacks a lookbook deletes documents/lookbook.json (second device, stale bundle, invalid lookbook dropped by migrateState); (F3) "reopened" only detected for pointer-mode decisions, not header-declared ones.
Final: Ruling (supersedes D5/Task 2/Task 5 rules): absent ≠ emptied. The serializer writes documents/lookbook.json whenever `documents.lookbook` is defined (even with zero questions); a save whose payload has no lookbook key keeps the on-disk file (the staging rm in writeProject is removed); a present-but-invalid lookbook in a PUT is rejected with 400 rather than dropped; migrateState keeps an invalid value out of state but the PUT guard is what protects disk. Why: spec says answers are never silently deleted; multi-device use is real (Air + Studio). Cost if wrong: the file appears on first Lookbook use rather than first answer (harmless), and an emptied Lookbook leaves a small file behind.
Final: Ruling: browser mirrors D9 — `setOutlineDocument` forces current `units`/`beatSheetSource` whenever the current content has `beatSheetSource`; `replaceOutlineDocument` merges only `units`/`beatSheetSource` into the current outline. Why: "nothing in WriterOS edits a ratified beat" must hold on screen, not just on disk. Cost if wrong: a memory patch that legitimately wanted to change beats is ignored (by design).
Final: fix wave dispatched (one implementer, sonnet) for F1, F2, F3 + runbook pointer-clearing note + plain-sentence mapping for unavailable errors + serverProjectStorage treats missing beatSheet as null (rollback safety).
Final fix wave landed: cacb4d0 (full suite 251 files / 2713 tests, tsc, build green per implementer). Scoped re-review (opus) dispatched over dcc1b2b..cacb4d0.
Task 10 dry run (controller, on a copy under the scratchpad, 2026-09-29 ~22:40): "before" = every package opened+re-saved on the LIVE build edce83d; new build cacb4d0 opened+re-saved all 10 → byte-identical (115 files, excluding project.json/analysis-queue). Then link-source (wayfinder, pointer) + sync-beats --dry-run (updated, 14 added/14 removed) + --apply on the COPY of Grave Affairs → only documents/outline.json (14 beat.* units, revision 10, beatSheetSource set) and the new .writeros-story-drive-links.json changed; reopen → kind unchanged, autosave kept the beats; Story-drive decision file hash unchanged (4925bca9). Real ~/WriterOS Projects untouched.
Final fix wave re-review (opus): all 6 addressed, no new Critical/Important.
Final: parked — route-level `unavailable()` fallback in beatSheetRoutes.ts:10-12 still echoes raw error text (a missing outline.json on refresh/status could show a path) — Ruling: real but rare (such a package cannot be opened at all), deferred to a follow-up; cost if wrong: one ugly message on a broken package.
Final: parked — dead `lock-timeout` branch in plainMessage — Ruling: harmless, leave.
Final: parked — D9 `revision = max` without a bump can store changed content under an unchanged revision when a client edit and a sync both land at r+1 — Ruling: accepted consequence of D9; a memory patch's baseVersion check is the only consumer and a stale patch is refused anyway; revisit if a revision-ordered consumer appears.
Branch complete at cacb4d0. Not merged, not pushed, not deployed (Ben's calls).
