# Morgan Hosted Stage 1 — Tasks 1–3 implementation report

Implemented on `feat/morgan-hosted`, without commits. Tasks 4–8 and Task 0 Step 5 remain untouched. No interactive Claude Code sessions were started. Story-drive was read only. No changes to routes, server entrypoint, client, project memory, room, or `/api/wp-chat`.

All required proof commands passed. Independent final review found no actionable findings.

## Files changed

- `package.json` — pins node-pty 1.1.0; adds the required postinstall chmod and mod validation/test script.
- `package-lock.json` — records node-pty and its node-addon-api dependency.
- `vitest.config.ts` — excludes mod tests while preserving Vitest's default exclusions.
- `server/morganHost/claudeCli.ts` — ports discovery/version checks; adds async, cancellable, five-second subprocess execution and isolated Claude-account preflight.
- `server/morganHost/shellPath.ts` — ports login-shell PATH merging and fallback behavior.
- `server/morganHost/launchArgs.ts` — builds settings, argv, allowlisted environment, read roots, resume/new launches, and authoritative isolation/mode/sandbox constants.
- `server/morganHost/persona.md` — installs the specified Morgan writing-partner prompt, page precedence, proposals, canon workflow, and casting firewall.
- `tests/server/morganHost/claudeCli.test.ts` — covers discovery, minimum version, login method, errors, isolated environment, and real subprocess cancellation.
- `tests/server/morganHost/shellPath.test.ts` — ports PATH ordering, shell invocation, deduplication, and fallback tests; removes the source project's story-specific comment.
- `tests/server/morganHost/launchArgs.test.ts` — covers the specified launch/settings/root/model behavior with no environment marker.
- `mod/writeros-morgan/.claude-plugin/plugin.json` — renames the copied plugin and sets the specified description.
- `mod/writeros-morgan/tsconfig.json` — ports the plugin tooling's generated-type configuration.
- `mod/writeros-morgan/types/index.d.ts` — declares the renamed plugin's persistent opened state.
- `mod/writeros-morgan/hooks/hooks.json` — loads the ported register module.
- `mod/writeros-morgan/hooks/register.ts` — preserves reporter/history/inbox behavior; removes mark; adds fail-closed guards, mentions, polling tool.check approvals, and page proposals.
- `mod/writeros-morgan/hooks/protocol.ts` — renames the token header, removes mark events, and adds approval polling and page-proposal types.
- `mod/writeros-morgan/hooks/queue.ts` — ports ordered reporting, retries, and overflow handling.
- `mod/writeros-morgan/hooks/waits.ts` — ports waiting-input tracking and completion behavior.
- `mod/writeros-morgan/hooks/guard.ts` — implements casting/link checks, open-page write protection, missing-package fail-closed behavior, and proposable-page limits.
- `mod/writeros-morgan/hooks/permission.ts` — describes actual actions for cards; omits the obsolete toDecision helper.
- `mod/writeros-morgan/hooks/proposeTool.ts` — defines the five-page proposal tool schema, instructions, and writer-outcome text.
- `mod/writeros-morgan/tests/register.test.ts` — ports reporter/history/inbox tests; removes mark tests and adapts proposal registration.
- `mod/writeros-morgan/tests/queue.test.ts` — ports reporting queue tests.
- `mod/writeros-morgan/tests/waits.test.ts` — ports waiting-input lifecycle tests.
- `mod/writeros-morgan/tests/guard.test.ts` — covers casting, symlinks, unresolved reads, page writes, memory writes, and Look limits.
- `mod/writeros-morgan/tests/permission.test.ts` — verifies that card summaries expose actual actions.
- `mod/writeros-morgan/tests/proposeTool.test.ts` — verifies the five surfaces and plain outcome messages.
- `mod/writeros-morgan/tests/hooks.test.ts` — engine-dispatch coverage for polling, allow/deny passthrough, transport failures, input limits, proposal payloads, tool visibility, and fail-closed guards.
- `shared/morganLive.ts` — re-exports protocol types, including PermissionPoll, and defines browser-stream/card types.
- `docs/superpowers/reports/2026-10-06-morgan-hosted-tasks-1-3.md` — records this implementation, evidence, and deviations.

Ignored execution notes are retained at `.superpowers/sdd/2026-10-06-morgan-hosted-stage1/progress.md`; generated Claude plugin API type caches are ignored.

## Required proof output

### npm install — exit 0, complete output tail

```text
> writer-os@0.2.0 postinstall
> chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true


added 2 packages, and audited 262 packages in 1s

56 packages are looking for funding
  run `npm fund` for details

21 vulnerabilities (1 low, 12 moderate, 7 high, 1 critical)

To address all issues, run:
  npm audit fix

Run `npm audit` for details.
```

### npx vitest run tests/server/morganHost/ — exit 0, complete output tail

```text
 RUN  v4.1.5 /Users/ben/Projects/WriterOS


 Test Files  3 passed (3)
      Tests  27 passed (27)
   Start at  19:37:06
   Duration  452ms (transform 88ms, setup 180ms, import 65ms, tests 34ms, environment 841ms)
```

### npm run test:mod — exit 0, full validation and test output tail

```text
> writer-os@0.2.0 test:mod
> claude plugin validate mod/writeros-morgan && claude plugin test mod/writeros-morgan

Validating plugin manifest: /Users/ben/Projects/WriterOS/mod/writeros-morgan/.claude-plugin/plugin.json

  ❯ types ./types/index.d.ts declares on $: nothing (no EngineInterface member)
  ❯ types ./types/index.d.ts declares state: writeros-morgan.opened

Validating hooks: /Users/ben/Projects/WriterOS/mod/writeros-morgan/hooks/hooks.json

  ❯ ./register.ts hooks: session.start, classic.SessionStart, session.end, tool.describe{tool=?}, tool.check, prompt.mention, session.append, turn.step, turn.start, turn.complete, tool.call, classic.PermissionRequest, classic.Elicitation, classic.ElicitationResult, classic.Notification
  ❯ ./register.ts gating hook with .catch: classic.SessionStart
  ❯ ./register.ts gating hook with .catch: tool.check
  ❯ ./register.ts gating hook with .catch: prompt.mention
  ❯ ./register.ts gating hook with .catch: session.append
  ❯ ./register.ts gating hook with .catch: tool.call
  ❯ ./register.ts gating hook with .catch: classic.PermissionRequest
  ❯ ./register.ts gating hook with .catch: classic.Elicitation
  ❯ ./register.ts gating hook with .catch: classic.ElicitationResult
  ❯ ./register.ts gating hook with .catch: classic.Notification
  ❯ ./register.ts calls: $.clock.after (via openEpoch, schedulePoll, snapshotTick), $.clock.every, $.clock.sleep (via openEpoch), $.env.get, $.fs.stat (via guardContext), $.http.fetch (via call), $.prompt.submit (via startSubmit), $.session.cwd (via sendHello), $.session.id (via sendHello, snapshotTick), $.session.messages (via snapshotTick), $.session.version (via sendHello), $.state.get, $.state.set, $.tool.register (via registerProposal), $.turn.abort (via act)
  ❯ ./register.ts env writes: nothing
  ❯ ./register.ts env reads: WRITEROS_MORGAN_PACKAGE, WRITEROS_MORGAN_SOCKET, WRITEROS_MORGAN_TOKEN
  ❯ ./register.ts state writes: writeros-morgan.opened
  ❯ ./register.ts state reads: writeros-morgan.opened

✔ Validation passed

tests/guard.test.ts:
(pass) refuses casting-inspiration reads, including through a link [1.40ms]
(pass) allows ordinary images and text [0.41ms]
(pass) refuses a read it cannot resolve [0.15ms]
(pass) refuses writes inside the WriterOS package and points to page proposals [0.33ms]
(pass) lets Edit and Write elsewhere through to Claude Code's own approval card [0.15ms]
(pass) refuses a page proposal for the Look panel [0.12ms]
(pass) a command or a linked search root that reaches a casting folder is refused [0.14ms]
(pass) everything else passes to Claude Code's permissions [0.28ms]

tests/hooks.test.ts:
(pass) approval polls the same card until denied with the writer note [48.06ms]
(pass) Allow answers a tool.check approval [18.89ms]
(pass) settings allow and deny decisions pass through without an approval fetch [20.36ms]
(pass) settings deny passes through unchanged [18.92ms]
(pass) an unavailable approval channel denies the change [17.26ms]
(pass) oversized approval input is denied without fetching [16.00ms]
(pass) a proposal reaches the channel with all proposal fields and returns the outcome [15.57ms]
(pass) proposal transport failure returns a clear error [23.33ms]
(pass) the Look panel is denied before fetching a proposal [21.28ms]
(pass) safety checks fail closed for tool calls and mentions [16.39ms]
(pass) casting mentions are refused [17.03ms]
(pass) an empty package path refuses every write [14.45ms]
(pass) the page proposal tool is described upfront [15.76ms]

tests/permission.test.ts:
(pass) summaries show the real action, not only the model's description of it [1.99ms]

tests/proposeTool.test.ts:
(pass) schema names exactly the five pages [1.24ms]
(pass) outcomes read plainly to Morgan [0.40ms]

tests/queue.test.ts:
(pass) stamps contiguous seq and posts one batch at a time in order [2.07ms]
(pass) splits batches by byte size [0.23ms]
(pass) retries the same batch twice, then fails and reports channel-error [0.33ms]
(pass) overflow drops the queue and reports queue-overflow [0.20ms]

tests/register.test.ts:
(pass) inert without the env vars: no requests, no tool registered [33.97ms]
(pass) a fresh launch opens an epoch with empty history, never reads messages, and sends the token header [21.57ms]
(pass) /clear opens a new epoch with empty history and never reads messages [19.20ms]
(pass) a second session.start in the same session (hot reload) opens an epoch without history [22.04ms]
(pass) /resume waits for the engine to switch sessions, then sends the snapshot; no report goes before that hello [22.85ms]
(pass) /branch gives up after 5 s when the session never switches: historyUnavailable, no history [56.92ms]
(pass) a --resume launch whose first main turn starts before the switch sends historyUnavailable at once [35.23ms]
(pass) ordinary tool calls report start and end and pass through [16.68ms]
(pass) permission request reports a wait and passes through unchanged [19.26ms]
(pass) two queued submits are sent in order, each once, and a redelivery is not resubmitted [24.16ms]
(pass) a submit held by a working Claude is acked queued at once, and submitted only when it resolves (I1) [239.76ms]
(pass) Stop works while a typed reply is held: abort is called with the running turn and acked (I2) [112.11ms]
(pass) a dropped submit is acknowledged as rejected with the reason [16.33ms]
(pass) a stale Stop is rejected and stops nothing [14.95ms]
(pass) hooks never wait for /hello: session.start, classic.SessionStart and turn.start resolve while it hangs [386.99ms]
(pass) an inbox action that arrives after the epoch changed is rejected, not submitted [199.51ms]
(pass) a failing proposal-tool registration still opens the epoch (M10) [14.25ms]

tests/waits.test.ts:
(pass) an opaque wait clears only when every tool running at open has ended [1.31ms]
(pass) two concurrent permission waits do not clear each other [0.21ms]
(pass) a wait with no running tools clears on turn complete [0.18ms]
(pass) an explicit elicitation id clears by id [0.23ms]

 49 pass
 0 fail
Ran 49 tests across 7 files. [1.41s]
```

### npm run check — exit 0, complete output

```text
> writer-os@0.2.0 check
> tsc
```

## Additional verification

`npm run test:run` — exit 0:

```text
 Test Files  268 passed | 2 skipped (270)
      Tests  2908 passed | 10 skipped (2918)
   Start at  19:40:14
   Duration  50.51s (transform 10.15s, setup 14.53s, import 33.17s, tests 208.50s, environment 162.62s)
```

`npm run build` — exit 0; Vite built 227 modules, esbuild emitted the server bundle. The build reported its chunk-size warning for the 1,044.21 kB client bundle.

`git diff --check` — exit 0, no output. No obsolete Story-drive plugin identifiers, mark tool, toDecision, or session environment marker remain in the mod.

## Deviations and reasons

1. Added optional `expectedEnding` to the proposal tool's input schema. The frozen schema literal omitted it, while the tool description and PageProposal type explicitly require this field for append snapshots. Exposing it is the closest faithful implementation and preserves stale-change protection for later tasks.
2. Used a fixed failed-start preflight message rather than interpolating the copied helper's subprocess exception. Exceptions can contain subprocess output; the spec requires that preflight never print credentials. Successful/version/auth behavior matches the required interface.
3. Did not copy Story-drive's ignored generated Claude API declaration cache. Plugin tooling generates declarations for this plugin; the source/runtime files, plugin state types, and tsconfig were ported. Validation and plugin tests succeeded.
4. Did not commit or run real sessions, including Task 0 Step 5. The batch explicitly excludes these plan steps. Existing branch isolation was retained.

Implementation choices where the plan did not prescribe a separate location: authoritative `ISOLATION_ARGS`, `PERMISSION_MODE`, `SANDBOX_SETTINGS`, and expanded `CLAUDE_MEM_DIR` are exported from `launchArgs.ts`; approval IDs use the copied reporter's existing `rand()` helper and epochs use its existing current epoch. No new architecture was introduced.

The required A1/A2/A4 changes override the stale task literals: `tool.check` polling replaces PermissionRequest answering, fetch bodies use `text`, the environment marker is removed, the postinstall chmod is present, authMethod must be `claude.ai`, and sandbox settings are exactly `{ enabled: true }`.

No deferred review findings. No other spec deviations.
