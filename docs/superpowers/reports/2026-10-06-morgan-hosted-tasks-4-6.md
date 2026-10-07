# Morgan Hosted Stage 1 — Tasks 4–6

Completed on branch `feat/morgan-hosted`. All requested checks passed. No commits were made. Tasks 1–3, the mod, client/, /api/wp-chat behavior, server/projectMemory/, server/room/ and ~/Projects/story-drive were left unchanged. No real Claude Code sessions were started; `test:mod` used the plugin validation/test harness.

The authoritative amendments were implemented: approval/proposal polling, verified PID ownership without an environment marker, folder-trust cards with Down + Enter, and imports of the existing launch constants. Flag off registers no Morgan handlers and bootstrap reports `morganHost:false`.

## Files changed

- `server/morganHost/liveChannel.ts` — Ported the Unix-socket channel; added idempotent 20-second permission/proposal polls, 60-second abandonment, held-request settlement and live-socket-safe sweeping.
- `server/morganHost/ptyProcess.ts` — Added the node-pty adapter, output/write forwarding, exit replay and bounded process-group termination.
- `server/morganHost/ownership.ts` — Added parent-link discovery, PID/start-time verification, serialized atomic owned.json registry and synchronous verified forced cleanup.
- `server/morganHost/sessionStore.ts` — Added atomic, mode-0600 session-ID persistence for resume.
- `server/morganHost/morganSession.ts` — Added single-flight start/resume, cancellable dependency waits, replay, approval/proposal lifecycle, folder trust and verified process cleanup.
- `server/morganHost/proposals.ts` — Validated structured pages against the existing document schemas and scripts against the protocol's element types.
- `server/morganHost/morganRoutes.ts` — Added guarded HTTP/SSE routes, context decoration, lazy cached preflight, production launch wiring and boot/forced cleanup.
- `server/morganHost/repoRoot.ts` — Resolved the repository from both source and bundled server locations.
- `server/routes.ts` — Registered Morgan only behind the exact flag and an enabled project library; returned { server, morganHost }.
- `server/index.ts` — Awaited Morgan shutdown on SIGINT/SIGTERM with a 10-second verified forced-stop fallback.
- `server/projectLibrary/routes.ts` — Reported the Morgan capability in enabled and disabled bootstrap responses.
- `shared/projectLibraryApi.ts` — Added the morganHost boolean to the shared bootstrap response type.
- `tests/helpers/morganProtocol.ts` — Added typed row, waiting, hello and ping builders using the actual shared protocol.
- `tests/fakes/fake-claude-morgan.mjs` — Added a real-socket fake CLI with chat, polling, resume, failure, detached-child and trust modes.
- `tests/server/morganHost/liveChannel.test.ts` — Ported upstream channel tests and added polling, abandonment, close, stall and live-socket cases.
- `tests/server/morganHost/ptyProcess.test.ts` — Verified exit codes and cleanup of stubborn process groups; afterEach terminates all children.
- `tests/server/morganHost/ownership.test.ts` — Verified live, reused and unrecorded PIDs, unverified leaders, registry serialization and forced cleanup.
- `tests/server/morganHost/morganSession.test.ts` — Verified lifecycle, resume, replay, cards/proposals, trust, detached children, cancellation, shutdown races and registry recovery.
- `tests/server/morganHost/sessionStore.test.ts` — Verified persistence, concurrent writes, project-specific clear and file permissions.
- `tests/server/morganHost/proposals.test.ts` — Verified script targets/blocks and real structured-document schema validation.
- `tests/server/morganHost/morganRoutes.test.ts` — Verified origin/auth guards, HTTP contracts, SSE, errors, answers and the exact flag.
- `tests/server/morganHost/morganWiring.test.ts` — Verified flag-off/on registration, bootstrap, boot sweep, forced cleanup and source/bundle root resolution.
- `tests/server/projectLibraryRoutes.test.ts` — Updated full bootstrap assertions for morganHost:false.
- `tests/server/wpChatRoute.test.ts` — Adapted the caller to the new registerRoutes return shape; wp-chat behavior unchanged.
- `tests/server/projectMemoryRoutes.test.ts` — Adapted only the registerRoutes return-value destructuring.
- `tests/server/personaCapabilityRoute.test.ts` — Adapted only the registerRoutes return-value destructuring.
- `tests/server/lookContract.test.ts` — Adapted only the registerRoutes return-value destructuring.
- `tests/server/structuredDocumentPatch.test.ts` — Adapted only the registerRoutes return-value destructuring.
- `tests/server/projectMemoryAgentContext.test.ts` — Adapted only the registerRoutes return-value destructuring.
- `tests/integration/unifiedProjectMemory.test.ts` — Adapted both registerRoutes callers to destructure server.
- `docs/superpowers/reports/2026-10-06-morgan-hosted-tasks-4-6.md` — Recorded changes, proof, rulings, review fixes and proportionality checkpoints.

## Proof — final output tails

All commands exited 0.

`npx vitest run tests/server/morganHost/`

```text
Test Files  11 passed (11)
     Tests  129 passed (129)
  Start at  20:20:45
  Duration  20.42s (transform 1.11s, setup 620ms, import 1.54s, tests 31.13s, environment 1.29s)
```

`npm run test:run`

```text
Test Files  276 passed | 2 skipped (278)
      Tests  3010 passed | 10 skipped (3020)
   Start at  20:21:14
   Duration  50.37s (transform 10.99s, setup 14.14s, import 34.66s, tests 219.66s, environment 149.79s)
```

`npm run test:mod`

```text
✔ Validation passed
49 pass
0 fail
Ran 49 tests across 7 files. [2.87s]
```

`npm run check`

```text
> writer-os@0.2.0 check
> tsc

(exit 0; no diagnostics)
```

`npm run build`

```text
✓ built in 235ms

  dist/index.js  792.5kb

⚡ Done in 24ms
```

Vite reported the existing client chunk-size warning (the client bundle remains 1,044.21 kB). The server bundle keeps node-pty external through the existing `--packages=external` build setting.

`pgrep -fl fake-claude-morgan || echo none` after the tests:

```text
none
```

Additional verification: `git diff --check` exited 0. The repo-required `npm run dev` smoke check used isolated port 51995, Morgan disabled, and an unavailable OpenSwarm directory to avoid starting that service:

```text
GET /: 200
bootstrap: 200 {"enabled":false,"morganHost":false}
Morgan route: 200
dev port closed
```

The development request to the absent Morgan handler returned the existing Vite HTML fallback (server/vite.ts catches all unmatched paths with HTML/200). Bare-Express wiring tests prove the handler is absent with the flag off (404), and present and guarded with it on (403). The smoke server was stopped, its port was confirmed closed, and the fake-process check again printed `none`.

## Deviations and rulings

The frozen requirements are fulfilled; the following corrections to sample steps/code were necessary:

1. **Start/end cancellation:** the sample reads the current end promise after reserving a start, producing a circular wait when End immediately follows Start. Capture the prior end promise and abort dependency waits. Shutdown also settles a start whose project resolver never returns. This preserves the specified cancellable, single-flight lifecycle.
2. **Restart assertion:** the sample natural-exit test demanded a different conversation ID, conflicting with the specified automatic resume. It now verifies a new process with the remembered session ID.
3. **Project lookup order:** resolve project existence before CLI preflight, so an unknown project reliably returns the specified 404 even when Claude is unavailable. Boot cleanup still completes before any start.
4. **Socket sweep:** connection probing is asynchronous, so callers await it. A matching stale path that returns ENOTSOCK is removed too, preserving the upstream stale-file fixture; active sockets survive.
5. **Reference test count:** the actual Story-drive live.server.test.ts has 32 tests, rather than the plan's stated 48. All 32 were ported, with 11 additional amended-channel tests, for 43 channel tests. No mark cases existed in that source. Story-drive's fake CLI patterns were read only; the WriterOS fake uses the plan's real-socket protocol.
6. **Exit callbacks and repeated close:** the adapter replays an already-observed exit to late subscribers, and channel close is idempotent, so fast exits and unconditional afterEach cleanup settle reliably.
7. **End/approval race:** the sample permits approval answers and new cards until termination completes. End now marks the session as ending and settles open cards/proposals before asynchronous cleanup; ending sessions reject new work. A gated-termination regression failed before the correction and passed afterwards.
8. **Ownership recovery:** the sample refresh promise chain remains rejected after a failed registry write. The next refresh now recovers the chain, preserving later descendant sampling and cleanup. A one-write-failure regression failed before the correction and passed afterwards.

The extra existing-test edits outside the key-path list are the caller updates explicitly required by Task 6's changed registerRoutes return contract. No product behavior in those areas was changed. No mod protocol mismatch was found and no mod change was needed.

## Review and proportionality record

One fresh, read-only review was performed using the executing-plans/requesting-code-review skills. Both important findings (the End race and rejected ownership-refresh chain) were reproduced RED→GREEN and corrected in one final fix pass. The review's trust-denial wording finding was also corrected to A3's exact message, tool name and summary. No findings remain deferred.

BWAM: eleven distinct corrective findings across two correction passes: stale-socket fixture handling, ownership fixture parent exit, immediate start/end deadlock, restart/resume assertion, trust default selection, one remaining registerRoutes caller, stuck-resolver cancellation, cached-answer stall suppression, End/approval race, rejected ownership-refresh chain and trust-denial wording. Checkpoints at the five-finding thresholds concluded that completing the existing channel/lifecycle/routes implementation and required proof was proportionate; no platform work, additional approval gate, additional review cycle or Task 7/8 work was added.

## Fix Round 1 — Batch B

All three requested corrections are implemented. No commits, real Claude sessions, mod changes or unrelated changes were made in this round. The output tails below supersede the initial proof counts.

### Files changed in this round

- `server/morganHost/morganSession.ts` — exported the pure normalizer/detector; replaced cursor-column/forward escapes with spaces before stripping other escapes; added whitespace-insensitive matching; retained raw output across chunks; sent Down and Enter in separate writes 300 ms apart using the existing tracked timer.
- `server/index.ts` — registered SIGTERM/SIGINT handlers only when `morganHost` exists, preserving flag-off signal behavior.
- `tests/fakes/fake-claude-morgan.mjs` — accumulated trust input until Down + Enter arrives, accepting combined or separated writes.
- `tests/server/morganHost/trustScreen.test.ts` — added captured-fixture detection in 64-byte chunks, cursor normalization, compact-text matching and an ordinary-output negative case.
- `tests/server/morganHost/morganSession.test.ts` — verified the two actual PTY writes and their delay.
- `tests/server/morganHost/morganSignals.test.ts` — verified signal registration through the actual server entrypoint with both null and non-null hosts.
- `docs/superpowers/reports/2026-10-06-morgan-hosted-tasks-4-6.md` — appended this fix-round report and fresh proof.

The supplied `tests/fixtures/morgan/claude-trust-screen.raw.txt` was consumed unchanged. Analysis of its 1,353 captured bytes confirmed that the previous detector returned false and the whitespace-insensitive form returned true. Keeping the accumulated buffer raw ensures escape sequences split across chunks can be normalized once complete.

### Proof output tails

All commands exited 0.

`npx vitest run tests/server/morganHost/`

```text
Test Files  13 passed (13)
      Tests  135 passed (135)
   Start at  20:29:25
   Duration  20.78s (transform 1.25s, setup 746ms, import 1.81s, tests 31.84s, environment 1.67s)
```

`npm run test:run`

```text
Test Files  278 passed | 2 skipped (280)
      Tests  3016 passed | 10 skipped (3026)
   Start at  20:29:53
   Duration  50.17s (transform 10.87s, setup 14.36s, import 34.80s, tests 215.25s, environment 151.23s)
```

`npm run check`

```text
> writer-os@0.2.0 check
> tsc

(exit 0; no diagnostics)
```

`npm run build`

```text
✓ built in 242ms

  dist/index.js  792.9kb

⚡ Done in 30ms
```

The existing Vite client chunk-size warning remains; the unchanged client bundle is 1,044.21 kB.

`pgrep -fl fake-claude-morgan || echo none` after the tests:

```text
none
```

`git diff --check` also exited 0. Regression checks were observed failing for the missing detector exports, the combined trust write and the flag-off signal handlers before the fixes, then passed.

### Deviations and proportionality

No deviations from this fix-round request. The detector and normalizer are small pure exports in the existing session module. The existing start timer tracks the 300 ms delay, so session cleanup cancels it and an ending session cannot receive the delayed Enter.

BWAM cumulative count: fourteen distinct corrective findings across three correction passes. Before this third pass, the assessment concluded that the three demonstrated or explicitly required fixes plus their tests and requested proof were proportionate. No extra review cycle or broader scope was added.
