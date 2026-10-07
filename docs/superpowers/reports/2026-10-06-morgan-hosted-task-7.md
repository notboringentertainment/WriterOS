# Morgan Hosted Task 7

Status: complete. All four required proof commands pass on the final implementation. Scope: Task 7 only; no commits, server changes, Task 8 run, or visual browser check.

## Decisions and progress

- Working on the existing clean `feat/morgan-hosted` branch, as requested.
- Reducer/panel and storage implementations delegated under the subagent development skill; proposal integration owned by the primary agent.
- Storage red/green: 8 failures before implementation; 21 tests across three files passed after implementation.
- Rail red: hosted branch absent before wiring; flag-off/browser-only DOM comparison passed.
- App red: three proposal integration tests failed before hosted props were threaded.
- Ruling: exact script snapshots include trailing spaces. The user's exact-text requirement overrides the plan's `trimEnd` example.
- Ruling: stale and ambiguous script banners remain until Dismiss, with one `stale` answer. This follows Step 7c's explicit visible explanation requirement despite its later instruction to clear state on every outcome.
- Ruling: stale structured previews retain their existing error message after the server removes the open proposal; an already answered proposal is not answered again on Dismiss.
- Ruling: injected storage fetch, CRLF parsing, cancellation, and HTTP status errors faithfully extend the example to match existing testability and expired-card behavior.
- User-directed exclusions: no commit; no visual browser check; no Task 8 real run.
- BWAM count: two review/fix rounds; four distinct corrective findings, all addressed (reset leakage, button styles, overwritten test helper, immediate script persistence). Last decision: fix the accepted-change persistence path and finish the bounded Task 7 deliverable; no additional architecture or review cycles.
- Final review found accepted script changes could be lost if the editor unmounted before its 500 ms save. A failing regression now proves Keep persists synchronously before answering Morgan, including after immediate unmount.
- Batch C follow-up: cumulative three review/fix rounds and nine distinct findings (four prior, V1–V4 from Claude's real-app check, and the allowed-write regression's missing report acknowledgement fixture). BWAM reassessed the whole approach: the observed failures need bounded fixes and regression proof; defer extra review cycles, UI redesign, and new session machinery. The fixture was corrected without changing queue code. No real Claude session or commit is authorized for this batch. See [the Batch C report](2026-10-06-morgan-hosted-task-7-batch-c.md) for final proof.

## Files changed

- `client/src/lib/morganLive/model.ts` — Ports the live reducer, replacing marks/Raw state with waits, approvals, proposals, resume notices, and explicit reset.
- `client/src/lib/projectStorage.ts` — Defines the optional authenticated `morgan` capability and `MorganApi` interface.
- `client/src/lib/serverProjectStorage.ts` — Provides gated Morgan routes and fetch-based event streaming, keeping the session token private.
- `client/src/lib/useWriterOSProjectLibrary.ts` — Exposes the adapter's Morgan capability alongside the existing capabilities.
- `client/src/lib/scriptProposal.ts` — Locates exact scene snapshots, rejects stale/ambiguous targets, and applies changes as an isolated undo step.
- `client/src/lib/morganProposal.ts` — Converts structured proposals to the existing memory-grounded patch shape with top-level changed fields.
- `client/src/components/shell/MorganLivePanel.tsx` — Renders the plain-text feed, composer, folded tools, approvals, proposals, resume notices, restart, and New conversation with generation guards.
- `client/src/components/shell/MorganApprovalCard.tsx` — Shows complete edit/write/command details and sends permission answers, handling pending and expired requests.
- `client/src/components/shell/LeftRail.tsx` — Selects the hosted panel only with both Morgan capability and server project; preserves the original rail branch.
- `client/src/components/shell/Shell.tsx` — Threads hosted capability, project ownership, and proposal callbacks to the rail.
- `client/src/components/writing/ScriptTab.tsx` — Presents script proposals, checks project ownership, applies Keep, persists immediately, and reports outcomes.
- `client/src/components/writing/screenplay/ScreenplayEditor.tsx` — Exports and uses the shared screenplay extension factory for editor and proposal tests.
- `client/src/components/writing/screenplay/ScriptProposalPreview.tsx` — Displays screenplay-formatted plain-text proposal blocks with Keep/Dismiss and stale/ambiguous explanations.
- `client/src/App.tsx` — Routes proposals to the appropriate page, reuses revision-checked structured Apply, sends outcomes, and clears proposals on project switches.
- `tests/lib/morganLive/model.test.ts` — Ports retained reducer cases and adds approval, proposal, resume, stuck, attribution, and reset coverage.
- `tests/lib/serverProjectStorageMorgan.test.ts` — Tests capability gating, real route bodies, session authentication, empty responses, streaming, errors, and cancellation.
- `tests/lib/useWriterOSProjectLibrary.test.tsx` — Tests exposure of the optional Morgan capability from the library hook.
- `tests/lib/scriptProposal.test.ts` — Tests exact text/types, repeated headings, ending snapshots, stale refusal, and undo isolation with real editors.
- `tests/lib/morganProposal.test.ts` — Tests changed fields and compatibility with the real patch schema.
- `tests/components/MorganLivePanel.test.tsx` — Tests feed safety, submit, approvals, proposals, session lifecycle, reconnect, IME, and late-project callbacks.
- `tests/components/MorganApprovalCard.test.tsx` — Tests complete plain-text details, pending state, denial notes, retryable errors, and expired requests.
- `tests/components/ScriptTabMorgan.test.tsx` — Tests real-editor Keep/Dismiss, stale/ambiguous explanations, ownership, and immediate persistence before unmount.
- `tests/components/LeftRailMorgan.test.tsx` — Proves hosted gating and exact legacy DOM equality with the flag off or browser-only project.
- `tests/components/AppMorganProposals.test.tsx` — Tests structured and script outcomes, retained suggestions/errors, project switching, and obsolete callbacks.
- `docs/superpowers/reports/2026-10-06-morgan-hosted-task-7.md` — Records implementation, proof, review decisions, and deviations.

`tests/helpers/morganProtocol.ts` was extended during the port, then restored exactly to its committed contents; it has no final diff. All existing server code remains unchanged. Hosted messages never write the Writing Partner or Writers' Room transcripts.

## Proof

Final focused command, exit 0:

```text
$ npx vitest run tests/lib tests/components
 RUN  v4.1.5 /Users/ben/Projects/WriterOS
 Test Files  133 passed (133)
      Tests  1460 passed (1460)
   Start at  22:01:16
   Duration  18.30s (transform 6.61s, setup 6.79s, import 20.32s, tests 43.37s, environment 76.47s)
```

Final whole-suite command, exit 0:

```text
$ npm run test:run
> writer-os@0.2.0 test:run
> vitest run
 RUN  v4.1.5 /Users/ben/Projects/WriterOS
 Test Files  287 passed | 2 skipped (289)
      Tests  3083 passed | 10 skipped (3093)
   Start at  22:01:54
   Duration  51.44s (transform 9.85s, setup 15.15s, import 34.43s, tests 219.02s, environment 156.60s)
```

The skipped files are existing opt-in integration tests: `tests/integration/sharedMemoryContract.integration.test.ts` requires Supabase credentials; `tests/integration/meetingRevisions.integration.test.ts` additionally requires `WRITEROS_MEETING_DB_INTEGRATION=1`. No Task 7 tests are skipped.

Final type-check command, exit 0:

```text
$ npm run check
> writer-os@0.2.0 check
> tsc
```

Final build command, exit 0:

```text
$ npm run build
> writer-os@0.2.0 build
> vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
vite v8.0.10 building client environment for production...
transforming...✓ 233 modules transformed.
rendering chunks...
computing gzip size...
dist/public/index.html                     0.83 kB │ gzip:   0.44 kB
dist/public/assets/index-b0zM9I3_.css      5.89 kB │ gzip:   2.19 kB
dist/public/assets/index-RED5-BmT.js   1,065.36 kB │ gzip: 301.82 kB
✓ built in 203ms
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
  dist/index.js  792.9kb
⚡ Done in 13ms
```

The build succeeds with a bundle-size warning; changing bundling is outside Task 7. `git diff --check` also passes. Final scoped review confirmed the immediate-persistence fix and found no new breakage.

Source truth: inspected read-only Story-drive reducer/tests and the actual routes/protocol/bootstrap/patch schemas. Upstream source inspected through opensrc: TipTap 3.22.5 `packages/pm/history/index.ts`, `packages/core/src/Extendable.ts`, `packages/extensions/src/undo-redo/undo-redo.ts`, and ProseMirror history 1.5.0 `src/history.ts:366`. The history implementation confirms the separate closing transaction resets subsequent undo grouping. No dependencies added.

## Deviations

1. **No commit or visual browser check.** Task 7 Steps 8–9 request these; the user's explicit constraints exclude them. Task 8 was not performed.
2. **Exact trailing whitespace.** The example comparator trims trailing spaces; the user requires an exact snapshot of types and text. Equality therefore preserves trailing spaces, covered by a regression.
3. **Stale previews remain visible until Dismiss.** Step 7c requires stale/ambiguous explanations to stay, then says App clears state on every outcome. App retains already-answered stale previews, including when the rail receives `proposal-answered` and reports no open proposal. It sends `stale` once and does not send a second outcome when that explanation is dismissed. Structured stale previews likewise retain the existing error until dismissal.
4. **Storage robustness beyond the sample.** Uses the adapter's injected fetch rather than global fetch, handles split UTF-8/CRLF/multiline SSE frames and reader cancellation, and preserves status-aware HTTP errors. These changes support existing test injection, real stream framing, and expired approval cards without altering the server API.
5. **Reducer adaptation.** The original composer case was a no-op; Morgan retains the outcome so the panel can restore rejected/uncertain text through reducer state. An internal `reset` action clears all session state on fresh starts/project changes, instead of manufacturing a server hello. Raw/reload-return gating is removed because Morgan has no Raw view; unavailable history shows the earlier-messages notice.
6. **Open-project prop and immediate script persistence.** `ScriptTab` receives optional `projectId` to enforce the required ownership check (the existing component had no such prop). A successful Keep publishes the new HTML/scenes immediately before reporting `kept`, instead of relying on a debounce that is canceled on unmount. A failing-then-passing real-editor regression proves this.
7. **Script preview component tests live in `ScriptTabMorgan.test.tsx`.** This tests the requested banner and actual apply/persistence path together rather than a display-only preview in isolation. No separate preview-only test file was required by the plan.

No server/API mismatch was found. The authoritative Task 0 approval/proposal polling amendments are already implemented server-side; the browser answers the real outcome routes and does not duplicate polling.
