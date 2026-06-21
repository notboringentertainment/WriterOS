# Morgan Runtime M1 — Session Handoff

> **For the next Claude Code context window.** Written 2026-06-20 after Ben confirmed the live key works. This is session/work state, not the durable product handoff (`docs/HANDOFF.md`).

## TL;DR

Morgan was a single-shot `prompt → JSON.parse → hollow fallback` chatbot. **M1 moved her onto a Claude-native tool loop.** Built TDD, two independent reviews passed (Codex + CodeRabbit), all findings fixed, gate green, **Ben confirmed it works live with a real `ANTHROPIC_API_KEY`.** Sitting on a **draft PR #44** awaiting his decision to mark ready / merge.

## Current state (verified this session)

- **Branch:** `feat/morgan-runtime-m1` (8 commits ahead of `main`), working tree clean.
- **PR:** #44, **draft**, OPEN, MERGEABLE. https://github.com/notboringentertainment/WriterOS/pull/44
- **Gate:** `npm run check` clean · `npm run test:run` **1373 passed (134 files)** · `npm run build` clean (pre-existing Vite chunk-size warning only).
- **Live:** Ben added `ANTHROPIC_API_KEY` and reports Morgan working. No automated live-API test in the suite (all mocked) — Ben's manual confirmation is the live signal.

## What shipped

New module `server/ai/morganRuntime/`:
- `types.ts` — `MorganRuntimeResult` (`{message, suggestions, ok}`), `ReachInventory`, `ToolSpec`, `ToolUse`, `DispatchOutcome`, `ToolTurn`, `RunMorganInput`.
- `reachContract.ts` — `buildReachInventory(StoryMemory)` (canSee derived ONLY from populated fields) + `renderReachContract`.
- `tools.ts` — `MORGAN_TOOLS` (`readProjectContext` read tool + `respond_to_writer` terminal tool), `dispatchTool`, suggestion normalization (trim/drop-blank/cap-3).
- `anthropicToolClient.ts` — the ONLY place `@anthropic-ai/sdk` + Anthropic block shapes live. `isAnthropicConfigured`, msg helpers (`userTurn`/`assistantTurn`/`toolResultsTurn`), `sendToolTurn` (one round-trip via `messages.create`, timeout 10min + maxRetries 2).
- `runMorgan.ts` — the loop: not-configured guard → loop (MAX_ITERS 4) → terminal capture → retry-once-with-nudge → honest error. `index.ts` re-exports.

Wiring: `server/ai/openaiService.ts` — `generatePersonaResponse` branches `if (persona.id === 'writingPartner')` → builds reach inventory + tool-mode prompt (prepends `renderReachContract`) → `runMorgan` → maps to `{message, suggestions}`. Every other persona path byte-identical. `createPersonaSystemPrompt` gained optional `responseMode: 'json' | 'tool'` (default `'json'`, byte-identical legacy). `/api/wp-chat` untouched (still thin).

## Locked decisions (do not relitigate — settled Ben ↔ Claude ↔ Codex)

1. **Claude-native; fail honestly if `ANTHROPIC_API_KEY` unset.** Morgan must NEVER silently fall back to the OpenAI single-shot path — that resurrects the dumb behavior. ⚠️ **Morgan now REQUIRES `ANTHROPIC_API_KEY`, independent of `AI_PROVIDER`.** (Specialists still use the OpenAI/Anthropic `createModelProvider` path per `AI_PROVIDER`.)
2. **Terminal `respond_to_writer` tool** is the single structured response path (resolves tool-loop-vs-strict-JSON). Read tools loop; terminal closes.
3. **Reach contract derived from real state**, never hardcoded prose (guards the recurring "agent claims to see what it can't" failure mode).
4. **No hollow fallback** for Morgan — retry once, then honest error.
5. **Anthropic block shapes boxed** in `anthropicToolClient.ts` only.

## Reviews — both addressed

- **Codex P1:** multi-tool turns built invalid Anthropic history (assistant message duplicated per tool). Fixed: accumulate all non-terminal results → one `assistantTurn` + one combined `toolResultsTurn`. Regression-tested (`runMorgan.test.ts`). **This is what M2's multi-tool turns depend on.**
- **Codex P2:** `receipts`/`limits` advertised but discarded. **Removed** from M1 schema/type (not half-wired) — they return in M2 with the receipt UI, end-to-end.
- **CodeRabbit (1, minor):** `suggestions` "0-3" unenforced. Fixed: schema `maxItems:3` + `items.minLength:1`; runtime trims/drops-blanks/caps-3.

## Standout findings / lurking issues for the next window

1. **THE THREE-MORGAN PROBLEM (biggest lurking issue).** There are still multiple Morgan paths: the new `/api/wp-chat` runtime, AND a separate `/swarm` synthesis path (Zoe/OpenSwarm bridge). M2's `askSpecialist` must live in the ONE canonical `/api/wp-chat` runtime; `/swarm` should become a tool-behind-Morgan or a retired bridge after parity — **never a second Morgan identity.** Decision made, not yet executed.
2. **Dead code Morgan no longer hits:** `maxTokensForPersona` still has a `writingPartner → 1600` branch that's now unreachable (Morgan returns before it; the runtime sets its own 1600 in `anthropicToolClient`). Also the old `storyUpdates` / `extractStoryUpdates` path in `openaiService.ts`/`routes.ts` is still dead (the *other* showrunner plan flagged removing it as a prerequisite to draft-editing). Neither is an error; both are cleanup candidates.
3. **Streaming vs `messages.create`:** the runtime uses non-streaming `messages.create`. Fine for M1's short turns (1600 tokens). But the repo already hit `APIConnectionTimeoutError` on long non-streaming Anthropic calls (see memory `reference_anthropic_streaming_timeout` / PR #31). **M2 multi-specialist synthesis could be long → revisit streaming inside the tool loop** before it bites.
4. **`readProjectContext` is partly redundant in M1** — Morgan already gets full context in the system prompt; the tool mainly exists to exercise the dispatcher so M2 is a drop-in. Reach inventory is BOTH injected in the prompt and available via the tool.

## What's next — M2 (the real "writing room" moment)

Add an `askSpecialist` tool to `MORGAN_TOOLS` + a `dispatchTool` case that programmatically calls a specialist persona (Sam/Casey/Oliver/Maya/Zoe/Alex), so Morgan consults them in ONE turn and synthesizes — "I asked Oliver for structure and Casey for character, here's the synthesis." Reintroduce `receipts` WITH a client render ("consulted specialists"). **Loop / client / prompt / route need zero surgery** — that's the whole point of the M1 substrate. Then retire/unify `/swarm`.

## Reference docs

- **M1 plan/contract:** `docs/superpowers/plans/2026-06-20-morgan-runtime-m1.md` (this milestone).
- **Bigger arc:** `docs/superpowers/plans/2026-06-19-morgan-showrunner-workspace.md` — lives on branch `docs/morgan-showrunner-workspace-plan` (NOT main). 8-slice showrunner plan incl. draft-patch flow with approve-before-edit safety. M1 here is the runtime foundation that the bigger plan assumed but didn't build. The two relate: M1 = the tool-loop the showrunner plan needs underneath.
- Memory: `project_morgan_runtime_m1.md` (auto-loads via MEMORY.md).

## Immediate next action for the new window

Ask Ben: flip PR #44 draft → ready (and merge), or hold? Nothing is blocking on the engineering side — it's his call plus whatever he found in the live 4-question check.
