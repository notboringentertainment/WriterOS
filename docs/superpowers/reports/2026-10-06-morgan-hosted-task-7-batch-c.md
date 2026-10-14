# Task 7 — Batch C, fix round 1

Status: V1–V4 fixed with regression tests; all five requested proof commands pass. No commit or real Claude session started.

## Scope and regressions

- V1: a late hello clears only the obsolete connection notice, preserves resume notices, and resets stuck state. A folder-trust wait suppresses the channel's `no-hello` screen event. The session regression uses the existing `trust` fake, waits 8.1 seconds past the real deadline, checks both initial and late subscribers, then allows and verifies hello plus the normal reply.
- V2: user bubbles remove only the specified leading routing line. The route and stored event remain unchanged; nonleading quoted routing text and assistant text remain visible.
- V3: approval summaries, details, and feed text wrap long unbroken paths. Cards and panel use bounded width/min-width sizing. Style regressions check the summary, card sizing, and feed row.
- V4: the guard resolver returns `null` if stat rejects. Existing guard decisions then allow new outside-page writes through to the next handler, deny new document writes with the page-proposal reason, and refuse missing reads with the could-not-check reason. Engine-dispatch tests cover all three paths. The existing generic fail-closed test now exercises an unavailable package environment so that unexpected guard setup failures remain covered.

Red: five focused browser/session regressions failed; all three new engine-dispatch regressions failed. Green: 70 browser/session tests passed; 52 mod tests passed. The first green mod run hung because this fixture had never acknowledged tool reports (previous guarded calls were denied before emitting them); it was stopped, its report response corrected to match the existing hook fixture, and rerun successfully. No queue production code was changed.

## Files changed in this batch

- `client/src/lib/morganLive/model.ts` — Clears the obsolete could-not-connect notice on hello while preserving other notices.
- `server/morganHost/morganSession.ts` — Suppresses `lost/no-hello` only while the folder-trust approval is open.
- `client/src/components/shell/MorganLivePanel.tsx` — Hides user routing metadata at render time and wraps feed text within the rail.
- `client/src/components/shell/MorganApprovalCard.tsx` — Adds explicit summary/detail wrapping and width constraints.
- `mod/writeros-morgan/hooks/register.ts` — Converts rejected path resolution to the guard's existing nullable result.
- `tests/lib/morganLive/model.test.ts` — Tests late-hello cleanup and preservation of resume notices.
- `tests/server/morganHost/morganSession.test.ts` — Tests a delayed folder-trust Allow against the real channel hello deadline and subscriber replay.
- `tests/components/MorganLivePanel.test.tsx` — Tests leading-only user prefix stripping, preserved assistant text, and feed wrapping.
- `tests/components/MorganApprovalCard.test.tsx` — Tests long summary wrapping and card width constraints.
- `mod/writeros-morgan/tests/hooks.test.ts` — Adds the three missing-path engine regressions, preserves generic fail-closed coverage, and correctly acknowledges reports emitted by the now-allowed write.
- `docs/superpowers/reports/2026-10-06-morgan-hosted-task-7.md` — Records cumulative BWAM count and the bounded follow-up decision.
- `docs/superpowers/reports/2026-10-06-morgan-hosted-task-7-batch-c.md` — Records this batch's changes, regression evidence, proof, and deviations.

## Proof

All commands below run against the fixed production implementation. All five exit with status 0.

```text
$ npx vitest run tests/lib tests/components tests/server/morganHost
 RUN  v4.1.5 /Users/ben/Projects/WriterOS
 Test Files  146 passed (146)
      Tests  1601 passed (1601)
   Start at  22:15:23
   Duration  31.88s (transform 5.33s, setup 7.44s, import 17.68s, tests 77.50s, environment 68.72s)
```

`npm run test:mod` validated the plugin successfully, then its test tail was:

```text
$ npm run test:mod
(pass) an inbox action that arrives after the epoch changed is rejected, not submitted [238.65ms]
(pass) a failing proposal-tool registration still opens the epoch (M10) [22.12ms]

tests/waits.test.ts:
(pass) an opaque wait clears only when every tool running at open has ended [1.26ms]
(pass) two concurrent permission waits do not clear each other [0.22ms]
(pass) a wait with no running tools clears on turn complete [0.19ms]
(pass) an explicit elicitation id clears by id [0.24ms]

 52 pass
 0 fail
Ran 52 tests across 7 files. [1.53s]
```

```text
$ npm run test:run
> writer-os@0.2.0 test:run
> vitest run
 RUN  v4.1.5 /Users/ben/Projects/WriterOS
 Test Files  287 passed | 2 skipped (289)
      Tests  3089 passed | 10 skipped (3099)
   Start at  22:16:30
   Duration  59.51s (transform 9.73s, setup 17.32s, import 38.35s, tests 242.79s, environment 197.81s)
```

The two skipped files are the existing opt-in database integration tests; no new regression is skipped. The whole-suite run excludes the mod's engine tests, which are separately proven by `test:mod`; its later fixture-only correction does not affect the Vitest suite.

```text
$ npm run check
> writer-os@0.2.0 check
> tsc
```

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
dist/public/assets/index-B5iOxIsg.js   1,065.78 kB │ gzip: 301.91 kB
✓ built in 140ms
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
  dist/index.js  793.0kb
⚡ Done in 15ms
```

The build succeeds with the existing bundle-size warning. `git diff --check` passed.

## Deviations

None in scope or behavior. The delayed trust regression uses the actual 8-second timer and existing fake, rather than starting a real Claude session. The generic safety-failure regression switches its failure source from `stat` to package environment lookup because a rejected `stat` now intentionally produces the specific guard decision. The engine fixture now returns the real `/report` acknowledgement shape so the new allowed-write test can settle its tool reports. Only the requested V1 session-forwarding and V4 guard code are changed server/mod-side. There were no commits, real Claude sessions, new dependencies, or additional review cycles.
