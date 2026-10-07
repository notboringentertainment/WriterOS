# Plan Review Log: Morgan Hosted — Stage 1
Started 2026-10-06. MAX_ROUNDS=5. Codex model gpt-6.1-sol, reasoning effort high, read-only.
Plan: docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md

## Round 1 — Codex

The plan has material safety and lifecycle defects. D1–D7 can remain fixed; the implementation needs revision.

I checked WriterOS against `origin/main` (`5f9a4b1`), Story-drive’s source and spike results, and installed Claude Code **2.1.292**. I also exercised extracted plan functions in memory. No files were modified and no Claude sessions were started.

References below are to [the plan](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md).

1. **Critical — the guard does not inspect actual tool calls.** Task 4, L592 calls `guardTool(e.name, e.input)`. Story-drive’s hook receives `e.tool` and flattened arguments such as `e.file_path`. With an actual `{ tool: 'Read', file_path: '/a/b.png' }` event, the plan returns `{ allow: true }`. Its isolated helper tests miss this.  
   **Fix:** Call `guardTool(e.tool, e)` and add hook-level tests proving refused calls never reach `next`.

2. **Critical — the guard fails open.** Copying Story-drive’s `.catch(($, e, next) => next(e))` makes a guard exception permit execution. Claude Code also skips failed handlers unless their error handler blocks them. The documented refusal is `{ deny: reason }`. [Mod handler behavior](https://code.claude.com/docs/en/plugins/mods/events).  
   **Fix:** Return `{ deny: verdict.reason }` and use a fail-closed catch before execution.

3. **Critical — the shell allowlist is not a read-only boundary.** Task 2 preapproves arbitrary arguments to `rg` and Git inspection commands. Examples requiring explicit rejection include `rg --pre <executable>` and `git diff --output=<file>`. Disallowing `Edit` and `Write` does not generally prevent subprocess writes. Conversely, `find -exec` is already specially restricted by this CLI, so that should not be claimed as a proven bypass.  
   **Fix:** Remove broad Bash prefix approvals and expose only the small, validated read operations Stage 1 needs.

4. **High — production permissions do not match the outside-folder test.** Task 0 Step 5 tests directory restrictions, but production additionally grants bare `Read`, `Grep`, and `Glob`. `--add-dir` is an access extension, not an exhaustive filesystem allowlist. [Permission rules](https://code.claude.com/docs/en/permissions).  
   **Fix:** Test the complete production argv and enforce resolved directory boundaries, including `permissions.blockReadsOutsideWorkingDirectories`.

5. **High — `context` violates D3.** The supposedly read-only wrapper permits `context`, but `origin/main:server/projectMemory/cli.ts:163` calls `readSnapshot()`. That method can initialize the ledger, append migration events, and repair projections. `report` and `questions` deliberately use read-only paths. The dry-run wrapper tests cannot detect this.  
   **Fix:** Implement hosted context retrieval outside the protected module using `readSnapshotReadOnly()`, and verify package contents remain unchanged.

6. **High — image protection covers only one filename-based entry point.** Task 4 checks extensions on `Read`; it does not cover prompt file mentions, aliases/symlinks, or image-bearing documents. The installed CLI has a separate `prompt.mention` event, so guarding `tool.call` alone is insufficient. [Mod reference](https://code.claude.com/docs/en/plugins/mods/reference).  
   **Fix:** Enforce text-only access at resolved-content and prompt-attachment boundaries, with tests for mentions and aliased images.

7. **High — configuration and billing isolation are incomplete.** Task 2 retains project settings and almost the entire parent environment. Project hooks execute outside tool permission approvals; settings can provide `apiKeyHelper` or environment overrides. Removing only `ANTHROPIC_API_KEY` leaves variables such as `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and custom headers. Preflight also runs under a different environment/configuration from the child.  
   **Fix:** Launch and preflight under the same vetted settings and environment, then verify the effective provider and authentication method.

8. **High — the mod rename misses functional identifiers.** Task 4 directs the token-header rename in `register.ts`, but it is defined as `TOKEN_HEADER` in `protocol.ts`. The state atom and `types/index.d.ts` also retain the `story-drive-live` namespace. L158–163 is the `registerMark` helper, whose invocation must also be removed.  
   **Fix:** Rename protocol constants and state namespaces consistently, remove the complete mark registration path, and test the renamed mod against the channel.

9. **High — Restart can reuse the process being stopped.** `end()` signals the child but leaves it in `live` until `onExit`. DELETE returns immediately; the following start can return that same session with `existing: true`. I reproduced this from the plan code.  
   **Fix:** Make termination awaitable and serialize restart behind confirmed termination and channel cleanup.

10. **High — shutdown misses pending starts.** `endAll()` visits only `live`; a start awaiting channel creation or `launchFor()` can spawn afterward. DELETE during startup similarly does nothing.  
    **Fix:** Cancel pending starts and make shutdown await their settlement before completing.

11. **High — failed starts leak sockets and timers.** Task 6 creates the channel before resolving the project and spawning the process, without cleanup if either operation throws. Even an unknown project can leave a channel running.  
    **Fix:** Close the channel on every failed launch path and start the hello deadline when the child actually launches.

12. **High — shutdown does not establish “no orphaned processes.”** Task 7’s fallback sends SIGHUP and immediately calls `process.exit(0)`. It neither waits nor escalates, and `node-pty`’s Unix `kill()` signals the child PID, not an entire descendant tree. `RegisterRoutesOptions` has no `onShutdown`, and `registerRoutes()` currently returns only the HTTP server.  
    **Fix:** Add explicit shutdown wiring that cancels starts, terminates owned processes with a bounded escalation, awaits cleanup, and tests actual PID death.

13. **High — dev startup can break production sessions.** Both instances use `~/.writeros/run`. The copied sweep blindly removes matching sockets, relying on Story-drive’s single-instance assumption. Task 9 explicitly permits concurrent dev/prod servers on different ports.  
    **Fix:** Give each server instance a private run directory and sweep only demonstrably stale owned resources.

14. **High — the production PTY adapter is wrong.** Task 7 uses `require('node-pty')` in a repository and production bundle configured as ESM. Native `onExit` receives `{ exitCode, signal }`, while `PtyLike` expects a number; the fake hides that discrepancy.  
    **Fix:** Import `node-pty` through valid ESM interop and adapt its exit event to the session manager’s contract.

15. **High — preflight failure crashes startup instead of producing the promised 503.** Task 7 calls `createMorganSessions()` during route registration and says it throws on failure; the session route’s catch cannot catch that. Also, `projectLibraryStore` and `config.rootPath` are nullable, and `readStoryDriveLinks()` is asynchronous.  
    **Fix:** Gate on an available server library and retain a deferred preflight failure for the session route to report.

16. **High — route tests fail before reaching their assertions.** Task 7’s fixture omits `allowedOrigins`, invents a `port` configuration field, and hides the mismatch with `as never`. The actual guard throws on `config.allowedOrigins.has`; I reproduced that.  
    **Fix:** Use a typed `ProjectLibraryConfig` with an allowed-origin set matching the bound test address.

17. **High — lifecycle tests do not prove their stated properties.** The “two tabs” test starts sequentially and only asserts a positive cumulative spawn count. The cleanup test immediately expects `has('p2') === false` after asynchronous termination, which fails as written; neither assertion proves PID death. The suggested immediate-map-deletion workaround could leave an unclosed channel.  
    **Fix:** Test concurrent starts with exactly one spawn, pending-start cancellation, delayed exit, immediate restart, and confirmed process/socket cleanup.

18. **Medium — protocol fixtures contain real mismatches.** The fake sends `Ping.seq`; the channel requires `enqueuedThrough` and returns 400. Row fixtures lack `uuid`, `door`, and `type`, and use `origin: 'main'` instead of an object. Waiting fixtures use `id` instead of `requestId`, `reason`, and `detail`. `waiting-for-input` is an event kind, not a channel-loss reason.  
    **Fix:** Use protocol-typed fixture builders and make the fake reject non-success HTTP responses.

19. **High — the browser port has unimplemented integration contracts.** The copied reducer recognizes `session-ended`, while the server emits `ended`; its user-row attribution recognizes plugin `story-drive-live`, so Morgan’s submitted messages can disappear. The existing bootstrap token is enclosed inside `serverProjectStorage.ts`, and `App` cannot simply pass it through. Browser-local projects also lack a server package to launch against.  
    **Fix:** Align reducer events and attribution, expose hosted-session operations through the storage integration, and gate Morgan on server-backed projects.

20. **Medium — replay eventually removes the initialization event.** Task 6 trims the oldest 5,000 envelopes, including `hello`; frequent delta batches can reach that limit during ordinary use. A late subscriber then lacks the initialization required by the copied reducer, contradicting “everything so far.”  
    **Fix:** Preserve an initialization snapshot and explicitly represent any truncated conversation history.

Additional factual corrections:

- **Task 8’s Markdown renderer does not exist in `LeftRail`.** It renders `{msg.content}` directly at `origin/main:client/src/components/shell/LeftRail.tsx:108`.  
  **Fix:** Identify an actual reusable renderer or explicitly scope a safe rendering implementation.
- **Existing bootstrap tests will change.** `tests/server/projectLibraryRoutes.test.ts:126` asserts the complete enabled response; adding `morganHost` breaks the claim that existing tests remain unchanged.  
  **Fix:** Update the response assertions and add flag-off/flag-on integration coverage.
- **Copied test imports need actual destination paths.** For example, the channel test imports `../src/main/live`, and reducer tests import Story-drive’s old model and preflight helpers.  
  **Fix:** Specify corrected imports and remove obsolete Story-drive-only dependencies.
- **Task 0’s “scratch copy” command targets the real checkout.** Installing there and running `git checkout package-lock.json` can overwrite existing work; it also commits before Task 1 creates the intended branch.  
  **Fix:** Create the branch first and perform dependency experiments in an actual disposable checkout.

My answers to the five questions:

1. **Stream-json versus PTY:** D1 is implementable. The concrete costs are a native dependency and hidden interactive startup prompts. Installed `node-pty@1.1.0` includes macOS prebuilds; Linux falls back to `node-gyp`. Story-drive handles trust prompts through Raw view, which this plan removes. An untrusted folder can therefore remain blocked through repeated restarts. **Add an explicit startup/setup failure path; this does not require reopening D1.**

2. **SSE query token:** Acceptable for this bounded loopback deployment if URLs containing it are never logged or forwarded. It grants the wider WriterOS session authority, however. **The simpler improvement is fetch-based SSE with the existing authentication header, avoiding both query credentials and a ticket subsystem.**

3. **User `CLAUDE.md`:** **Full system-prompt replacement is not the appropriate isolation fix.** Memory discovery is separate; use tested configuration exclusions such as `claudeMdExcludes`. `--bare` is unsuitable here because installed help explicitly says it bypasses OAuth/keychain authentication. [Memory configuration](https://code.claude.com/docs/en/memory).

4. **Guard reliability:** **A correctly wired mod guard is sufficient as the second layer**, using documented `{ deny }`, a fail-closed catch, and hook-level tests. `isError` labels a result; skipping `next` prevents execution. A separate `PreToolUse` hook is optional, not necessary additional machinery. [Mod refusal behavior](https://code.claude.com/docs/en/plugins/mods/events).

5. **Billing:** **Cannot confirm the plan’s claim.** Its sanitizer leaves alternative authentication/routing inputs, and enabled settings can supply credentials. Preflight’s `loggedIn` check does not establish subscription billing for the launched child. Verify authentication under the exact child environment and settings without printing credentials.

The specified variadic argv layout has no evident ordering defect: recognized flags delimit variadic values. `--plugin-dir` is repeatable with one path per occurrence, and the installed CLI contains the hidden `--append-system-prompt-file` option. However, `flagValues()` tests only the plan’s own parser, and Task 0 Step 1 does not exercise the complete production argv.

VERDICT: REVISE
### Claude's response

Verified against code before acting: guard field names (`e.tool`, flattened args, register.ts:292-298), `TOKEN_HEADER` in protocol.ts:55, `Ping.enqueuedThrough` (protocol.ts:46), `requestId` on waits (protocol.ts:36), reducer `session-ended` (model.ts:385), atom/types namespace, `runContext` → `readSnapshot()` (origin/main cli.ts:163), `allowedOrigins`/nullable `rootPath` in config.ts, ESM package, `LeftRail` renders `{msg.content}` with no Markdown, server build uses `--packages=external`. All confirmed.

Accepted (plan revision 1):
1–2. Guard uses `e.tool` + flattened args, returns `{ deny }`, fail-closed catch; hook-level tests added (Task 4).
3. Broad Bash allowlist removed; Bash allowed only for the memory script's `report`/`questions`.
4. Permissions now an explicit `--settings` JSON with path-scoped `Read(//dir/**)` rules; Task 0 Step 3 tests the full production set including reads outside the folders.
5. `context` removed from the memory script; test copies a fixture package and proves it is byte-for-byte unchanged after `report` and `questions`.
6. Image/PDF block extended to resolved symlink targets, PDFs, and a `prompt.mention` handler.
7. Environment is now an allowlist; preflight runs with the same env and isolation args; login-type check added (Task 0 Step 6, Task 1).
8. Full rename list (TOKEN_HEADER, atom, types namespace, registerMark + its call) with a grep that must return nothing.
9–12. Session manager rewritten: awaited `end()`, restart waits for exit, single-flight start, pending-start cancellation in `shutdown()`, channel closed on failed launch (project resolved before the channel opens), process-group SIGTERM→SIGKILL in a new `ptyProcess.ts`, explicit 8 s hard stop in server/index.ts.
13. Per-instance run dir `~/.writeros/run/<port>/`; sweep removes only sockets that refuse a connection.
14. ESM `node-pty` import (form chosen in Task 0 Step 7); adapter maps `{ exitCode }`.
15. Preflight deferred to first start, failure reported as 503; registration gated on store + rootPath; `readStoryDriveLinks` awaited.
16. Typed config with `allowedOrigins` matching the bound test origin.
17. Lifecycle tests rewritten: concurrent start = exactly one spawn, immediate restart = new process, PID death checked, silent child → start-failed, shutdown mid-start.
18. Typed fixture builders; fake exits on any non-2xx reply.
19. Reducer maps `ended`/`truncated`, attribution plugin name changed; Morgan API lives inside serverProjectStorage (token stays there); gated to server-backed projects.
20. Replay keeps `hello` separately and emits `truncated`.
Extras: plain-text rendering (no Markdown renderer exists); bootstrap test update listed; copied test imports specified; Task 0 now branches first and runs `node-pty` in a disposable clone.
Q1: added a "could not start" path with the one-time Terminal command (10 s start deadline), since there is no raw view.
Q2: adopted fetch-based streaming with the normal session header; no token in URLs.
Q3: adopted `claudeMdExcludes` route in Task 0 Step 2; `--bare` ruled out.
Also tightened beyond the critique: web tools and `Agent` denied in Stage 1, each with what it protects.

Rejected: none.

## Round 2 — Codex

Revision 1 still has material problems. I checked against `origin/main` (`5f9a4b1`), Story-drive, and installed CLI 2.1.292. I also reproduced the cache and lifecycle races using the plan’s code in memory. No files were modified or Claude sessions started.

Line references below refer to the [revised plan](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md).

1. **High — directory permissions remain incomplete (L136, L417–427).** Bare `Grep` and `Glob` allow outside searches; scoped Read allows do not establish an exclusive boundary. Task 0’s suggested deny-everything-plus-allow-exceptions cannot work because deny takes precedence. [Permission rules](https://code.claude.com/docs/en/permissions).  
   **Fix:** Set `permissions.blockReadsOutsideWorkingDirectories: true`, which exists in installed 2.1.292, and test outside paths and symlinks using the exact production configuration.

2. **High — the Bash allowlist is not exclusive (L424–425, L712–720).** `dontAsk` still permits built-in read-only commands, including `ls` and `cat`; the guard currently allows every Bash call. The wrapper also accepts arbitrary `--project` paths, bypassing the intended project boundary. Task 0’s expected refusal of `ls` therefore does not follow from these settings. [Bash behavior](https://code.claude.com/docs/en/permissions#read-only-commands).  
   **Fix:** Default-deny Bash in the guard except validated wrapper invocations bound to the resolved project package, and run the permission smoke test with that guard loaded.

3. **High — project configuration is still inherited (L131–135, L1558).** Both isolation candidates retain `--setting-sources project`. Project allow rules merge with WriterOS’s rules, and project hooks/settings can still execute or alter routing. Testing an empty directory does not establish isolation in the eventual project directory. [Settings merging](https://code.claude.com/docs/en/settings#lists-merge-instead-of-overriding).  
   **Fix:** Exclude inherited project/local settings and verify isolation in both linked-folder and package-folder launches.

4. **High — the guard’s production implementation cannot load as written (L729, L753).** Installed 2.1.292 explicitly restricts hook imports to relative plugin files and `claude-code`; `node:fs` is unsupported. The host already provides asynchronous `$.fs.stat(path, { resolve: true })`. The extension-only fallback and `catch { return false }` weaken the promised boundary. [Host filesystem API](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts).  
   **Fix:** Use `$.fs.stat(..., { resolve: true })` and deny unresolved paths; remove the extension-only fallback.

5. **High — the minimum version contradicts the new protection (L166, L746).** `prompt.mention` requires 2.1.290, but preflight accepts 2.1.288. [Mod reference](https://code.claude.com/docs/en/plugins/mods/reference).  
   **Fix:** Raise the minimum to 2.1.290 and update its messages and tests.

6. **High — image-bearing documents remain permitted (L695).** An `.ipynb` file passes the extension guard, but Read returns notebook outputs, including visualizations. Blocking `NotebookEdit` does not prevent this read path. [Read behavior](https://code.claude.com/docs/en/tools-reference#read-tool-behavior).  
   **Fix:** Refuse image-bearing containers and enforce text-only results at Read and mention boundaries, with an embedded-image fixture.

7. **High — descendants survive when the leader exits first (L941–945).** `terminate()` resolves on the leader’s exit, and its timer skips SIGKILL once `exited` becomes true. A descendant ignoring SIGTERM survives. I reproduced the missing escalation; the proposed test keeps the leader alive and misses this case.  
   **Fix:** Complete group cleanup independently of leader exit and test a leader that exits while its descendant ignores SIGTERM.

8. **High — shutdown can abandon existing sessions (L1342–1343, L1704–1705).** It waits for pending starts before terminating running sessions. A stalled resolver prevents termination until the hard stop exits the server, leaving those children alive. Copied synchronous preflight also blocks signal handlers and timers for up to 15 seconds per subprocess.  
   **Fix:** Terminate live sessions immediately, cancel pending work concurrently, use cancellable asynchronous preflight, and kill owned groups before any forced exit.

9. **High — DELETE still does nothing during startup (L1329–1333).** `end()` ignores `starting`. I reproduced DELETE returning successfully while a delayed start subsequently spawned a child.  
   **Fix:** Cancel or serialize against the project’s pending start before completing `end()`.

10. **High — channel cleanup is still not awaited (L1282, L1302–1304).** `LiveChannel.close()` returns a promise, but the manager resolves `s.exited` immediately. I reproduced shutdown completing before close finished. The port’s `ptyExited()` settlement is also never called, leaving outstanding composer outcomes unsettled.  
    **Fix:** Call `ptyExited()`, await channel closure on every exit/failure path, and resolve session completion only after cleanup.

11. **Medium — failed preflight never actually retries (L1651–1659).** The synchronous async-function body sets `checked = null` before `??=` assigns its rejected promise back. Two Start attempts produced only one preflight invocation in reproduction.  
    **Fix:** Clear the cached promise in a rejection handler that runs after assignment.

12. **High — client integration is missing required plumbing (L1765, L1996).** `bootstrapServerProjectStorage()` explicitly returns `ProjectStorageAdapter`, which has no `morgan` member. `App` gets capabilities through `useWriterOSProjectLibrary`, which does not expose it, and `Shell` renders `LeftRail` through its own `RailProps`. There is no `storage.morgan` available in App as described.  
    **Fix:** Add and forward `MorganApi` through `projectStorage.ts`, `useWriterOSProjectLibrary.ts`, `Shell.tsx`, and App’s rail props, gated by `activeFolderProjectId`.

13. **Medium — the truncation test fails as written (L1165–1169).** Story-drive’s `submit()` only enqueues; it emits no synchronous composer event. The late subscription occurs before acknowledgements can arrive, so history has not reached the cap. Changing the cap to 10 does not fix that timing.  
    **Fix:** Drive real report/ack events and await the required history growth before subscribing.

14. **Medium — terminal events can disappear before the browser connects (L1301–1303, L1593).** A fast exit deletes the session before the stream GET; the browser receives 404 instead of the retained `ended` event. Existing streams also remain open with keep-alive timers after ending.  
    **Fix:** Retain a bounded terminal snapshot for late subscribers and close streams after delivering `ended`.

15. **Medium — project switching is unspecified (L1985–1996).** The panel is not keyed by project, and the instructions do not reset reducer state or reject delayed callbacks from the previous project. Unmount cleanup alone does not cover an in-place prop change.  
    **Fix:** Key/reset the panel by project and guard asynchronous start/stream callbacks against obsolete project generations.

The three round-2 answers:

1. **No.** The absolute `Read(//path/**)` syntax is correct, but the permission shape lacks the outside-working-directory fence; the proposed deny-all exception scheme is invalid. The Bash wrapper needs its own boundary too.
2. **Yes, under the documented engine contract.** A registered `.catch` returning `{ deny }` substitutes a refusal rather than skipping the failed handler. It cannot protect a module that fails to load. Test it through engine dispatch by injecting a failing host operation. [Error-handler contract](https://code.claude.com/docs/en/plugins/mods/events#handle-a-hook-that-fails).
3. **Yes.** Leader-first exit, blocked pending starts, and the hard-stop path can leave children alive. SIGKILL or a server crash bypasses these handlers entirely; the unconditional no-survivor guarantee requires a parent-liveness supervisor.

A simpler configuration worth testing is 2.1.292’s `--restricted` plus an explicit `--tools` list: it ignores inherited settings and fences file tools while preserving the chosen embedded-CLI architecture. Bash still needs the narrow guard.

VERDICT: REVISE
### Claude's response

Verified: `--restricted` and `--tools` exist in 2.1.292 with the described behaviour (`claude --help`); Story-drive `LiveChannel.close()` is async and `ptyExited()` exists (live.ts:86-88); `bootstrapServerProjectStorage` returns `ProjectStorageAdapter`, and capabilities reach App through `useWriterOSProjectLibrary` (l.115-116, 336) and `Shell`'s `RailProps`.

Accepted (plan revision 2):
1, 3. Isolation switched to `--restricted --strict-mcp-config` + explicit `--tools Read,Grep,Glob,Bash,TodoWrite` + `--add-dir` per folder + `blockReadsOutsideWorkingDirectories: true`. Dropped the invalid deny-all-plus-exceptions idea. Task 0 Step 2 now also proves a project `.claude/settings.json` hook and allow rule have no effect; Step 3 tests the exact production launch with outside paths, a symlink, Grep and Glob.
2. Guard is now default-deny; Bash allowed only for `<memory script> report|questions` with plain arguments (no quotes, operators or substitutions). The script supplies `--project` itself from `WRITEROS_MORGAN_PACKAGE` and refuses a `--project` argument (simpler than matching a quoted package path, which can contain spaces, in a prefix rule).
4. Guard uses `$.fs.stat(path, { resolve: true })` passed in as `resolve`; unresolvable paths are refused; extension-only fallback removed; no `node:fs` import.
5. Minimum version raised to 2.1.290.
6. `.ipynb` added to blocked content.
7. `terminate()` signals the group, SIGKILLs the group after the grace even if the leader exited, resolves when the group is gone; exit handling also cleans descendants of a leader that exited on its own. Tests cover leader-first exit.
8. `shutdown()` ends running and starting sessions concurrently; a stuck start no longer delays killing running ones (test added). Preflight made asynchronous with a timeout.
9. `end()` cancels a pending start (checked at every await before spawn) and then ends whatever started; test added.
10. Exit path calls `ptyExited()`, awaits group cleanup and `channel.close()`, then resolves `done`; `end()` awaits `done`.
11. Preflight cache fixed: failure clears the cache in a rejection handler after assignment.
12. `morgan` capability added to `ProjectStorageAdapter`, surfaced through `useWriterOSProjectLibrary`, threaded through `Shell` `RailProps` and `LeftRailProps`, gated by `activeFolderProjectId`.
13. Truncation test now uses a `chatty` fake that reports real rows, `maxHistory: 3`, and waits for the last row before the late subscribe.
14. A finished session's replay (ending in `ended`) is kept for late subscribers; the stream route closes after delivering `ended`.
15. Panel keyed by project id plus a generation guard on async callbacks; test added.
Q3 (hard kill of the server): added `<runDir>/children.json`; the forced-stop path SIGKILLs recorded groups, and the next boot kills leftover groups whose command line names the WriterOS mod. A parent-liveness supervisor is noted as out of scope for Stage 1.

Rejected: none.

## Round 3 — Codex

Revision 2 addresses most earlier findings, but material lifecycle and test problems remain. I checked against `origin/main` and installed Claude Code 2.1.292. No files changed; no Claude sessions started.

1. **High — immediate cancellation still misses a start.** [L1359](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1359): `start()` awaits `ending.get()` before publishing its pending entry—even when that returns `undefined`. An immediate `end()` therefore sees nothing and returns; the start subsequently spawns. I reproduced this from the sketch. The cancellation test at L1229 fails. The shutdown test at L1271 also never reaches its supposedly stuck resolver.
   
   **Fix:** Publish the pending reservation before the first await, and make the shutdown test wait for a resolver-entered barrier.

2. **High — preflight subprocesses escape normal-stop ownership.** [L1825](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1825): the proposed `AbortSignal` is never wired through `claudePath` or shutdown. A hung preflight subprocess has a 15-second timeout, but the server exits forcibly after eight seconds, destroying the timer before it can kill the subprocess. The PTY registry does not contain it.
   
   **Fix:** Give preflight an owned abort controller and terminate/await its subprocesses within the server’s shutdown deadline.

3. **High — registry failure leaks an already-spawned child.** [L1421](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1421): `registry.add()` runs outside the setup catch, before the live entry and exit handler exist. Injecting a write failure produced one spawn, zero terminations, and no tracked session. Likewise, a rejection during exit cleanup prevents `markDone()` and can become an unhandled rejection.
   
   **Fix:** Establish in-memory ownership immediately after spawn, unwind every subsequent setup failure, and settle exit cleanup through explicit catch/finally handling.

4. **High — killing Claude’s process group does not kill its Bash tools.** [L1010](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1010): “every descendant” is incorrect. Installed 2.1.292’s Bash provider specifies `detached: true`, and the Bash runner passes that to process spawning. Consequently, an allowed memory command runs in another process group. If Claude needs SIGKILL during normal end/stop, that helper can survive; the existing inherited-group shell test misses this.
   
   **Fix:** Explicitly track and terminate the allowed helper’s detached group, and test that it dies when the Claude leader is forcibly killed.

5. **Medium — `ended` precedes outcomes and cleanup.** [L1440](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1440): `ptyExited()` emits pending composer outcomes after `ended`, contradicting the stream’s terminal-event contract. Natural exit also leaves the session in `live` without an `ending` reservation while cleanup awaits. I reproduced both `["ended", "composer"]` ordering and an immediate Start returning the dead session with `existing: true`.
   
   **Fix:** Reserve natural-exit cleanup, settle composer outcomes, complete the terminal transition, and emit `ended` last; make restart await that cleanup.

6. **Medium — the resolved-path field is wrong.** [L800](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:800): installed 2.1.292 returns `realPath` from `$.fs.stat(..., { resolve: true })`, not `path`. The sketch therefore returns `null` and refuses ordinary text reads and mentions.
   
   **Fix:** Use typed `info.realPath ?? null` and make the host stub return that actual shape.

7. **Medium — guard-hook tests use nonexistent testing APIs.** [L696](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:696): the installed `claude-code/testing` exports `mock.clock`, `mock.store`, and `mock.env`; it has no `mock.fn` or `toHaveBeenCalled*` matchers. These tests fail before exercising the guard.
   
   **Fix:** Use the real `test(async ($, on) => …)` engine-dispatch setup and counted terminal handlers, following Story-drive’s registration tests.

8. **Medium — termination can report success while the group remains alive.** [L1053](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1053): after the post-SIGKILL deadline, `terminate()` resolves regardless of `groupAlive()`. Exit cleanup can consequently remove the registry entry and permit restart while survivors remain.
   
   **Fix:** Report termination failure and retain ownership when the deadline expires with a live group.

9. **Low — the version-error UI test still expects 2.1.288.** [L2171](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:2171): the injected error says 2.1.290, so this test necessarily fails.
   
   **Fix:** Change the expected text to 2.1.290.

Answers to the three round-3 questions:

1. **Restricted-mode flag compatibility:** Yes—the installed help and implementation support explicit `--plugin-dir`, `--append-system-prompt-file`, and `--settings` under `--restricted`. Restricted mode ignores user/project/local settings; explicit settings still apply. `permissions.blockReadsOutsideWorkingDirectories` applies to Read/Grep/Glob/LSP. Keep Task 0’s live hook and permission checks as implementation gates; this review did not execute sessions.

2. **Bash rule:** Yes, for the current fixed script path. The hook receives the command string, and the plain-token rule rejects quoting, substitutions, operators, redirections, and additional commands. The wrapper’s project binding closes the argument override. Paths containing spaces will fail closed and need a different representation if supported later.

3. **Remaining survivors:** Yes—unowned preflight children, children lost on registry failure, and detached Bash helpers during forced CLI termination. These affect normal end/stop paths and do not require reopening the explicitly deferred crash-supervisor decision.

The necessary next revision is localized: fix these contracts and tests, then perform the planned CLI smoke checks. Additional lifecycle infrastructure is not justified.

VERDICT: REVISE
### Claude's response

Verified what is checkable locally: Story-drive's mod tests use `test(async ($, on) => …)` and `mock.clock(on)` (no `mock.fn`), matching finding 7. The mod type definitions are bundled in the Claude Code binary, so `realPath` (finding 6) and Bash's `detached: true` (finding 4) are taken from Codex's reading of installed 2.1.292; the plan tells the implementer to confirm `realPath` against the installed types in Task 4, and Task 6's helper test proves the detached-helper cleanup end to end.

Accepted (plan revision 3):
1. `start()` reserves the pending entry synchronously before any await; the shutdown test waits on a resolver-entered barrier.
2. Preflight takes an `AbortSignal` owned by `MorganSessions`; `shutdown()` aborts it; per-call timeout cut to 5 s, inside the 8 s hard stop. Test added.
3. In-memory ownership and the exit handler are set up immediately after spawn; `registry.add` and the start timer come after and unwind through `end()` on failure; exit cleanup runs in try/catch/finally so `done` always resolves.
4. The memory script records its own process group in a per-session helpers folder (`WRITEROS_MORGAN_HELPERS_DIR`) and limits itself to 120 s; session cleanup kills recorded helper groups (TERM, then KILL after 1 s). Test with a fake that ignores SIGTERM and spawns a detached helper.
5. Exit cleanup order: `ptyExited()` → group terminate → helper groups → channel close → `ended` (last) → replay stored → `done`. Sessions mark `exiting`; `start()` waits for `done` after a natural exit. Tests for both.
6. `info.realPath`.
7. Guard-hook tests rewritten in the engine-dispatch style with counted terminal handlers.
8. `terminate()` returns false if the group survives; ownership is kept (registry entry stays for the forced-stop and boot sweeps) and the project is marked stuck with a plain message until WriterOS restarts.
9. Version test expects 2.1.290.

Rejected: none.

## Round 4 — Codex

Revision 3 fixes ordinary start cancellation, `realPath`, and the previous spy/version-test errors. Material failures remain in the revised lifecycle code. Verified against `origin/main` (`5f9a4b1`) and installed CLI 2.1.292; no files changed or Claude sessions started.

1. **High — registry failure now deadlocks cleanup.** [L1604](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1604): `spawn()` awaits `end()`, which awaits `pending.promise`, whose completion depends on that same `spawn()`. Injecting `registry.add()` failure reproduced an unsettled start with **zero termination attempts**. The child is also absent from the disk registry.
   
   **Fix:** Unwind the owned live session directly on setup failure, without entering the public cancellation path that awaits its pending start.

2. **High — the watchdog leaves an orphan and stalls the script tests.** [L602](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:602): killing `$watchdog` kills the subshell, leaving its `sleep 120` child alive. The script removes its group record on exit, losing that survivor. Because the sleeper inherits output pipes, `spawnSync()` can wait until it exits. A two-second reproduction took two seconds despite the main shell finishing immediately; the proposed tests have a 60-second timeout.
   
   **Fix:** Explicitly terminate and reap the watchdog’s sleeper on every exit, and give timeout termination a TERM-to-KILL escalation.

3. **High — helper registration can miss the cleanup sweep.** [L598](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:598), [L1465](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1465): cleanup reads the folder once. A detached helper scheduled afterward can register after that snapshot—or find the folder deleted, skip registration, and still launch npm. Its 120-second timeout does not satisfy “nothing survives session end.” The fake waits for registration before ending, so it cannot detect this race.
   
   **Fix:** Fence helper launches during cleanup, require successful registration before execution, and add a deterministic delayed-registration test.

4. **High — helper cleanup discards ownership before confirming death.** [L1469](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1469): `killHelperGroups()` sends SIGKILL and immediately deletes the records without waiting for group disappearance. `end()` can return before the helper dies, making the immediate `groupAlive()` assertion race. Helpers are also absent from `killAllNow()`’s fallback.
   
   **Fix:** Await confirmed helper-group disappearance, retain records on failure, and include those groups in forced-stop cleanup.

5. **Medium — cleanup exceptions still produce false success.** [L1573](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1573): `groupGone` starts as `true`; an exception before termination skips subsequent cleanup but removes the registry entry and permits restart. I reproduced that result with a failing `ptyExited()`. Additionally, a throwing listener during the final `emit()` prevents `markDone()` despite the “always resolves” comment.
   
   **Fix:** Attempt each cleanup independently, treat unverified termination as failure, isolate listener errors, and settle `done` in an unconditional finalizer.

6. **Medium — the “stuck” handling misses a surviving leader.** [L1646](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1646): `end()` ignores `terminate()` returning `false` and waits for `done`, which only exit handling resolves. If the leader remains alive, no exit callback runs and the project is never marked stuck. I reproduced an indefinitely pending end with `stuck === false`.
   
   **Fix:** Handle unsuccessful termination through shared cleanup directly, retaining ownership and reporting stuck status without requiring an exit callback.

7. **Medium — the preflight-abort test necessarily fails.** [L1383](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1383): shutdown happens before `start()` reaches `claudePath()`. The start correctly cancels at its initial check, so the fake’s abort listener is never registered and `aborted` remains `false`; I reproduced this exact ordering.
   
   **Fix:** Wait for a preflight-entered barrier before invoking shutdown.

Answers to the round-4 questions:

1. **Does `MorganSessions` close the earlier findings without new races?** No. Synchronous reservation fixes the original cancellation race, and the normal terminal ordering is improved, but registry unwind deadlocks and failure handling still loses or strands ownership.

2. **Are helper records plus the 120-second self-limit sufficient?** No. Registration races, premature record deletion, the orphaned watchdog sleeper, and incomplete forced-stop coverage remain. Installed 2.1.292 still launches Bash tools detached.

The simpler alternative for the two memory commands is host-owned execution requested through the mod channel. That preserves D1 while removing shell self-registration and watchdog ownership problems. Either approach needs the focused tests above, not another recovery layer.

VERDICT: REVISE
### Claude's response

Accepted, with Codex's simpler alternative for the helper findings (plan revision 4):
2, 3, 4. Morgan no longer has a shell. Bash is out of `--tools`, denied in settings and refused by the guard. Project memory is read through a mod tool (`mcp__writeros-morgan__memory`, kinds `report`/`questions`, registered like Story-drive's proven `mark` tool) that the mod forwards to WriterOS over a new `/memory` channel route. WriterOS runs `npm run memory -- <kind> --project <session's package>` as its own detached child (Task 3: owned process group, 60 s timeout, 512 KB cap, aborted by session cleanup, tracked in the child registry). The memory script, helpers folder and watchdog are gone. This keeps D1 and leaves `server/projectMemory/` unchanged (D3). Task 0 Step 3 now checks that a mod tool is callable under `--restricted` + `dontAsk`.
1. Setup failure after spawn unwinds through a private `stopSession()`, not the public `end()` that waits on the start; test added (registry write throws → start rejects, child dead, no hang).
5. One idempotent `finish()` path: each cleanup step in its own try/catch, termination counts as failed unless `terminate()` returned true, listener errors isolated, `done` settled in `finally`.
6. `stopSession()` calls `finish(…, groupGone=false)` directly when `terminate()` returns false, so a leader that never exits still ends the session and marks the project stuck; test added with a child that cannot be killed.
7. Preflight-abort test waits for a preflight-entered barrier.

Rejected: none.

## Round 5 — Codex (final round)

Two material issues remain, both in the new memory runner. The earlier Claude-session cleanup findings are resolved. Checked against `origin/main` (`5f9a4b1`) and CLI 2.1.292; no files changed or sessions started.

1. **High — session shutdown does not await memory-process termination.** [L1658](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:1658): `finish()` aborts memory reads but never awaits their promises. Task 5 explicitly lets channel closure finish while a read is pending. Consequently, shutdown can reach `process.exit(0)` before the memory runner’s one-second SIGKILL escalation fires, leaving a detached child alive. I reproduced session end completing before the aborted read settled. The current test checks only that abort was delivered.
   
   **Fix:** Track active reads per session, abort and await their confirmed group termination before settling `done`, and test delayed termination.

2. **High — memory-runner failures can crash WriterOS or lose a child.** [L591](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:591): there is no child `error` handler, so a spawn failure can become an uncaught server error. `onChild(pid, true)` runs before cleanup listeners are installed; a registry write failure rejects the promise while leaving the child without abort or timeout handling. I reproduced zero termination attempts after that failure. Conversely, `onChild(pid, false)` throwing inside the async `close` handler creates an unhandled rejection and leaves the outer promise unsettled.
   
   **Fix:** Install lifecycle handlers before registry callbacks, unwind registration failures by terminating the group, and catch every callback/error path while settling the promise.

Minor notes:

- [L610](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md:610): the “512 KB” limit counts UTF-16 characters and checks before appending, so multibyte output and the final chunk can exceed it. **Fix:** Count bytes and enforce truncation on each received chunk.
- Task 0’s custom-tool permission check remains a necessary implementation gate; the previous `mark` result alone does not prove the new tool works under this exact restricted launch.

Answers to the two round-5 questions:

1. **Does host-owned memory close the helper findings?** It removes the shell-registration races and orphaned watchdog entirely, but the two ownership failures above prevent a complete yes.

2. **Does the idempotent `finish()` close findings 1, 5 and 6?** Yes, for the Claude child. Focused reproductions confirmed registry failure unwinds without deadlock, a surviving leader marks the project stuck, and a throwing listener does not prevent completion. Memory termination must now join that same completion contract.

These require localized corrections, not another lifecycle architecture.

VERDICT: REVISE
### Claude's response

Accepted (plan revision 5), not re-reviewed by Codex because MAX_ROUNDS=5 was reached:
1. Each session tracks its in-flight memory reads; `finish()` aborts them and awaits them before closing the channel and settling `done`. `runMemoryRead` settles only after the read's process group is confirmed gone (SIGTERM → SIGKILL after 1 s → 1 s wait), or rejects "did not stop" and leaves the pid in the registry. Hard stop raised to 10 s. Test: a read whose process takes 1.5 s to die after abort; `end()` resolves only after it settles.
2. `runMemoryRead` installs `error`/`exit`/stdout handlers before any registry callback; a registry failure on start stops the child and rejects; a registry failure on finish is logged and the promise still settles; spawn failure rejects without an uncaught error. Tests for all three.
Note: the output limit now counts bytes and cuts each chunk exactly.
Note: Task 0 Step 3 (k) remains the gate for the mod tool under `--restricted`.

Rejected: none.

## Outcome

Five rounds, no APPROVED verdict. Codex's last round found two localized problems in the memory runner, and stated that the Claude-session lifecycle and all earlier findings are resolved. Both problems are fixed in revision 5 but have not had a Codex pass. Remaining gates before trusting the design are hands-on: Task 0 (CLI behaviour under `--restricted`, the mod tool under `dontAsk`, startup prompts, login type) and Task 9 (Ben's real run).

## Rescope with Ben (after round 5) → revision 6

Ben, 2026-10-06: the read-only Stage 1 did not match his goal ("I need an agent who can proactively do what I need within Writer OS so I don't have to run a separate terminal… So, I don't know what you're building here."). Two rulings:
- D8 WriterOS is above canon: the page wins; Morgan is a pen-and-paper writing partner first; she updates canon to match the page with his yes so Story-drive → WriterOS → OpenMontage stay consistent.
- D9 Parity, not a read-only first stage: Stage 1 gives Morgan what Claude Code did for him (A1–A7), with asking-before-changing as the safety.

Revision 6 changes: full Claude Code tool set; approval cards (the mod answers `classic.PermissionRequest` with Ben's in-page answer); page proposals (a mod tool; structured pages reuse WriterOS's existing patch preview, script proposals are new); broad read roots incl. past sessions and images, with the casting firewall kept; resume across restarts; Bash tools stopped via an environment-marker sweep instead of the earlier child registry; the host-run memory reader from rev 4–5 removed (Morgan runs memory commands herself, changes with his yes). Carried over from rev 5 unchanged in substance: preflight, process adapter, channel core, session lifecycle (`finish()` path), routes core, browser plumbing.

## Round 6 — Codex (focused review of rev 6 new parts)

Revision 6 still has concrete paths to lost writing, casting access, and termination of unrelated processes. These justify REVISE without changing D8 or D9.

I checked the new sections against WriterOS `origin/main` (`5f9a4b1`), Story-drive, and installed CLI 2.1.292. No files were changed or Claude sessions started.

The following findings refer to the [revision 6 plan](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md).

1. **Script proposals can overwrite newer writing or replace the wrong repeated scene** (L2858–2885). The check establishes only that a heading exists; neither changed scene contents nor shifted heading occurrences make the proposal stale. An in-memory ProseMirror reproduction replaced Ben’s newer text successfully.
   **Fix:** Capture the script revision and target identity/content hash when proposing, verify them before Keep, and reject ambiguous headings.

2. **A script proposal can survive a project switch and modify another project** (L2912–2916). The new App-level `morganScriptProposal` has no project/session ownership or specified reset. The panel’s key protects incoming events but does not clear an already displayed proposal; another project with the same heading can accept it before the answer POST returns 404.
   **Fix:** Bind proposals to project/session identity, clear them on identity changes, and verify ownership before applying.

3. **The casting firewall and page-proposal boundary do not cover Bash** (L459–468, L657–677). `guardTool` allows Bash unconditionally: shell commands can read casting images or overwrite package page files despite the Read/Edit/Write denies. Broad Grep content searches can also return casting descriptions because the guard checks arguments, not the files searched; symlinked Grep roots bypass that check.
   **Fix:** Enforce filesystem read/write boundaries for Bash and its descendants while retaining mutation cards, and exclude canonical casting paths from Grep and other file-access paths, including subagents.

4. **The marker sweep can kill unrelated process groups** (L1135–1157, L2340–2347). `ps` combines arguments and environment in `command`; substring matching cannot distinguish them. I reproduced a match against a process with **no marker environment variable**, only marker text in its arguments. The subsequent negative-PGID signal targets its whole group.
   **Fix:** Verify marker ownership from actual per-process environment/identity, restrict matches to the current user, and signal a group only after verifying its ownership.

5. **The marker is insufficient to guarantee descendant cleanup** (L1222–1225, L1832). The test covers inherited environments only. A detached child launched through `env -i`, or a helper that scrubs its environment, loses the marker and survives the sweep.
   **Fix:** Track descendant/job ownership independently of inherited environment variables; use the marker as supporting evidence.

6. **Approval details silently hide part of the action being approved** (L733, L752, L2772). The model supplies the Bash description, while the actual input is truncated to 4,096 characters. A command or edit can place consequential changes beyond the visible portion; truncation can also produce invalid JSON for the promised pretty-printer.
   **Fix:** Show the actual command or edit and preserve complete bounded input; reject oversized requests rather than approving truncated payloads.

7. **The permission handler uses the wrong response shape for the installed mod API** (L739–742). CLI 2.1.292’s classic mod bridge reads a top-level `decision`; `Gmt`/`L6n` do not unwrap `hookSpecificOutput`. That wrapper belongs to external command hooks. As written, Allow/Don’t allow cannot reliably suppress the hidden terminal dialog. Task 0 acknowledges adjustment, but the current implementation example is wrong.
   **Fix:** Return `{ decision: { behavior: 'allow' } }` or the corresponding flat deny object, and test its interpretation through the permission bridge.

Minor notes:

- **Boot cleanup races new starts** (L2365): its later port-wide scan can kill a newly launched Morgan. **Fix:** Await boot cleanup before permitting starts.
- **Session-store writes race** (L1593–1605, L1732): concurrent projects perform unsynchronized read-modify-write operations using the same temporary filename, losing IDs or producing rename failures. **Fix:** Serialize store mutations and finish pending persistence before completing session shutdown.
- **One transaction does not guarantee one isolated Undo step** (L2881–2884): ProseMirror history can merge the proposal with recent typing; the isolated proposal test misses this. **Fix:** Put explicit history boundaries around proposal application and test after recent typing.
- **The extension export needs more than the suggested one-line extraction**: origin/main’s screenplay extensions include a pagination callback closing over a component ref. **Fix:** Export shared base extensions or an extension factory while configuring the callback per editor.
- **Held requests need cancellation cleanup**: session finish settles them, but turn Stop and HTTP disconnect cleanup are unspecified. **Fix:** Remove and settle corresponding pending entries when their originating request/turn is cancelled.

Answers to the five questions:

1. **Approval cards:** Yes—the incorrect response shape leaves a path to the native dialog. Automatically permitted tools execute without a card, as expected. Story-drive’s `$.http.fetch` has no timeout and suspends the hook budget while waiting; the five-minute native permission test remains an implementation gate, not something verified by these helper tests.

2. **Page proposals:** Structured proposals retain the existing revision protection. Script proposals do not protect newer contents, repeated-heading identity, or project ownership. Finish/close settle held calls; cancellation needs the cleanup noted above.

3. **Marker sweep:** `ps -E` can expose same-user environments on macOS, but this combined-output matcher is unsafe. The argument-only false positive is reproduced, and environment-scrubbing descendants are missed.

4. **Casting firewall:** Direct Read and guarded mentions are covered for resolved paths. Bash, broad Grep content searches, and symlinked search roots remain open; enabling Agent does not repair those underlying gaps.

5. **Resume:** Within one `MorganSessions` instance, the synchronous start reservation and waits for ending sessions prevent two tabs from creating duplicate processes. Failed resume clears the ID normally. Persistence races can remember an older ID or lose another project’s ID; a failed clear leaves the stale ID available for repeated attempts.

VERDICT: REVISE
### Claude's response (revision 7)

All seven findings accepted; none narrows Morgan's abilities (D8/D9 held).
1. Script proposals carry `expectedText` (the whole target scene as Morgan read it) for replace/insert-after and optional `expectedEnding` for append; the page applies only to the single scene whose heading and text both match; otherwise stale or ambiguous, nothing changes.
2. Script proposals carry `projectId`; cleared on project switch with the existing patch-proposal reset; Keep checks ownership first.
3. Guard refuses Bash commands naming a casting folder and Grep/Glob roots that resolve into one; settings deny covers Grep/Glob via Read rules; subagent read attempt added to Task 0. Residual stated: a shell command can read casting bytes without naming the folder, but cannot show Morgan the picture, and writes still ask.
4. Marker sweep rewritten: marker matched only in the environment part of `ps -E` (full line minus the plain argument line), current user only, exact markers only (no port-prefix matching; boot sweep uses `markers.json`), and a group is signalled only when its leader is itself verified. Test with the reproduced argument-only decoy.
5. Cleanup also stops descendants found by parent links, snapshotted before the leader is stopped (covers children that dropped the marker), plus the marker sweep for Bash tools.
6. Approval cards show the real command / before-after edit; Morgan's description is shown second; the mod refuses inputs over 64 KB instead of truncating.
7. Permission decision uses the flat `{ decision: … }` shape the 2.1.292 mod bridge reads; Task 0 Step 4 still verifies through the real bridge.
Minor notes, all accepted: boot sweep is awaited (`ready`) before any start; session store and marker file serialize their writes; script proposals close history before and after (own undo step, tested after typing); screenplay extensions exported as a factory; Stop answers open cards/proposals; a disconnected held request is abandoned and cleared from the page.

Rejected: none. Not re-reviewed yet.

## Round 7 — Codex (confirmation of round-6 fixes)

Revision 7 does not fully close the earlier findings. Checked against `origin/main` (`5f9a4b1`), Story-drive, and installed CLI 2.1.292; no files changed or Claude sessions started.

For the [revised plan](/Users/ben/Projects/WriterOS/docs/superpowers/plans/2026-10-06-morgan-hosted-stage1.md):

| Round-6 finding | Confirmation |
|---|---|
| 1. Stale/wrong-scene proposals | Partially fixed: changed text and ambiguous matches are rejected, but screenplay element changes are ignored. |
| 2. Wrong-project proposals | Project reset and ownership checks address the failure; the declared types need adjustment below. |
| 3. Casting/page boundaries | Not fixed for Bash. Native Grep’s Read-deny filtering and the resolved-root check address the search portion. |
| 4. Unsafe marker matching | Argument-only matching is addressed, but environment-value false positives remain. |
| 5. Unmarked descendants | Not fixed: normal termination precedes the new snapshot. |
| 6. Hidden approval input | Fixed: complete input, actual command/edit display, oversized requests denied. |
| 7. Permission response shape | Fixed: the flat `decision` matches the installed bridge. The native smoke-test gate remains appropriate. |

Remaining material problems:

1. **Finding 1: scene comparison ignores screenplay structure** (L2999–3020). Changing an action paragraph into dialogue without changing its words still passes `expectedText`; Keep overwrites Ben’s newer element choices. I reproduced acceptance of that change.
   **Fix:** Compare an exact scene snapshot including paragraph boundaries and element types, rather than normalized text alone.

2. **Finding 3: Bash still bypasses both boundaries** (L678–694). A command can copy a casting image through an innocently named symlink into an allowed location; subsequent Read renders the copy. Bash can also overwrite package page files directly. An approval card does not enforce the promised page-proposal route.
   **Fix:** Enforce casting read restrictions and protected-page write restrictions at the filesystem boundary for Bash/descendants, while retaining full tools, canon operations, and mutation cards.

3. **Finding 4: the environment substring is still not an environment-variable check** (L1191–1204, L2465–2466). An unrelated variable containing ` WRITEROS_MORGAN_SESSION=<marker> ` matches even when the actual marker variable is absent. I reproduced this against the revised matcher; it can still kill an unrelated process.
   **Fix:** Read and parse environment entries with unambiguous boundaries, then compare the actual marker key/value in both cleanup paths.

4. **Finding 5: the snapshot runs too late** (L1914–1938). `stopSession()` calls `terminate()` first; the exit callback then enters `finish()` and discovers descendants after reparenting. Natural exit has the same problem. I reproduced an unmarked detached child surviving its parent’s exit and disappearing from parent-based discovery.
   **Fix:** Capture and retain descendant ownership while the leader is alive, before termination, and use that retained ownership for exit cleanup.

5. **The new marker registry can discard ownership** (L1823, L2485). Marker persistence failure is logged but launch continues; boot cleanup ignores survivor results and unconditionally resets the marker file. Either path loses the information needed for later cleanup.
   **Fix:** Require successful marker persistence before spawning, retain markers for survivors, and prevent starts when boot cleanup cannot establish termination.

6. **The new unmarked-leader test fails despite correct signalling** (L1145–1152). Its shell exits naturally when the marked child dies because `wait` completes; `expect(alive(leader.pid!)).toBe(true)` therefore fails. I reproduced this while signalling only the child.
   **Fix:** Use an unmarked leader that remains running independently after its child exits, with unconditional test cleanup.

Minor notes:

- **Boot/start race:** correctly fixed by awaiting `ready`; the survivor-handling defect above is separate.
- **Session persistence:** mutations are serialized, but L1832 still launches `store.set()` without awaiting it during shutdown. **Fix:** Retain pending persistence promises and await them before settling session completion.
- **Undo boundary:** calling `closeHistory` twice on the same transaction sets the same metadata twice; it does not close the group afterward. I reproduced subsequent typing merging with the proposal and disappearing on one Undo. **Fix:** Dispatch a separate history-closing transaction after applying, and test typing both before and after Keep.
- **Extension factory:** correctly addresses the component-ref closure.
- **Cancellation cleanup:** Stop settlement and `onAbandon` address the previous missing cleanup.
- **Ownership types:** L3068’s declared script prop lacks the `projectId` it instructs ScriptTab to check; the structured state example also omits it. **Fix:** Include captured project ownership in both declared proposal-state contracts.
- **Argument-decoy test:** L1129 executes `sleep`, which drops the marker argument, so this regression test could pass with the old matcher. **Fix:** Use a long-running process that retains the marker text in its arguments.

VERDICT: REVISE
### Claude's response (revision 8, not re-reviewed: Ben asked for one confirmation round)

Confirmed fixed by Codex: 6 (approval input), 7 (decision shape), 2 (project ownership, apart from the type note now applied), boot/start race, extension factory, cancellation cleanup.
Applied:
1. Scene matching compares an exact snapshot (`expectedScene` / `expectedEnding`: every paragraph's element type and text), so an element change without word changes is stale. Test added.
2. Bash runs in Claude Code's sandbox, which applies the same Read/Edit deny rules to commands and their children; unsandboxed commands always need a card. Page-file denies narrowed to `documents/` and `script/` so canon imports can still write memory files. Task 0 Step 12 verifies the sandbox keys and that imports work.
3. Marker matching additionally requires the process to have started after the session; the marker value is a random 128-bit id, so a text match can only come from Morgan's own processes. Test added.
4. Descendant ownership is retained: refreshed every 2 s while the leader is alive and again before any stop; exit cleanup uses the retained set. Test with an unmarked child that outlives its parent.
5. Recording the marker is required before spawning (start refuses otherwise); boot cleanup keeps markers whose processes survive instead of resetting the file.
6. Leader test now uses a leader that keeps running; decoy test keeps the marker text in a live process's arguments.
Notes: session-id persistence is awaited before `done`; undo isolation uses a separate closing transaction, tested with typing before and after Keep; `projectId` added to both proposal-state contracts.

## Act 3 — Build

### Task 0 (Claude, 2026-10-06)
Results in `2026-10-06-morgan-hosted-stage1-checks.md`. Findings folded into the plan as amendments A1–A4 (approval via polled `tool.check`; process-tree ownership instead of an environment marker, which macOS 15 hides; folder-trust question as a card; node-pty postinstall; settings values).

### Batch A — Codex build (Tasks 1–3), thread 01a11436-938a-7443-bad1-000268458196
Codex report: `docs/superpowers/reports/2026-10-06-morgan-hosted-tasks-1-3.md`. Deviations accepted: optional `expectedEnding` in the tool schema (the plan's type needed it); fixed preflight failure message (never echoes subprocess output); generated plugin type cache not copied.

### Claude's verdict
Read the diff; reran `npx vitest run tests/server/morganHost/` (27 pass), `npm run test:mod` (validate + 49 pass), `npm run check` (clean).
- Fix round 1 (Codex): proposal tool used one long request, which the ~30 s fetch limit would cut off → now polls like approvals (amendment A1b). Verified with tests (pending twice then kept; transport failure).
- Task 0 Step 5 run live against the real mod: reads, image, casting firewall (direct + symlink), page-file write refusal, Edit to the approval path, proposal tool all behaved. Found: sandboxed `touch` ran without a card (sandbox auto-approval default). Fixed by Claude directly: `SANDBOX_SETTINGS = { enabled: true, autoAllowBashIfSandboxed: false }` + test; confirmed `ls` stays automatic and `touch` asks.
Batch A accepted, pending Ben's commit OK.

### Batch B — Codex build (Tasks 4–6), thread 01a11456-e553-7561-8b04-4dc80a2c6b8d
Codex report: `docs/superpowers/reports/2026-10-06-morgan-hosted-tasks-4-6.md`. Deviations accepted (all corrections to the plan's sample code, each with a regression test): start/end cancellation without a circular wait; natural-exit restart resumes the remembered conversation; project lookup before preflight; async socket sweep; 32 (not 48) ported channel tests + 11 new; idempotent close/exit replay; End settles open cards before async cleanup; ownership refresh recovers after a failed write.

### Claude's verdict
Reran Morgan tests (129), full suite (3010 pass), mod (49), check, build; no leftover fake processes. Read the live-server diff (gated by the flag). Fix round 1 (Codex): (1) **real bug** — folder-trust detection matched spaces, but Claude Code lays words out with column codes (`\x1b[<n>G`); captured the real screen as `tests/fixtures/morgan/claude-trust-screen.raw.txt`, detector now normalizes those codes and has a whitespace-insensitive fallback, tested on the real bytes in chunks; (2) Down and Enter sent as two writes 300 ms apart, as verified in Task 0; (3) SIGTERM/SIGINT handlers installed only when Morgan is on. After fix: 135 Morgan tests, 3016 suite tests, check, build pass; I confirmed the detector on the real capture myself. Batch B accepted, pending Ben's commit OK.
