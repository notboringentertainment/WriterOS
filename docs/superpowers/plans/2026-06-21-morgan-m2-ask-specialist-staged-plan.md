# Morgan M2 — Ask Specialist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: PLANNED ONLY.** No M2 code has started. No branch, no commits yet. Revises Codex draft `2026-06-21-morgan-m2-ask-specialist.md` after repo inspection. Do not implement until Ben says proceed.

**Goal:** Let Morgan call exactly one existing WriterOS specialist (Sam, Casey, Oliver, Maya, Zoe, Alex) per tool call through the existing persona service, then synthesize that specialist's read back to the writer — without raw pass-through.

**Architecture:** Add an `askSpecialist` tool to the M1 Morgan tool loop. The tool needs to call another model, so `dispatchTool` becomes async and `runMorgan` accepts an injected, provider-agnostic `callSpecialist` dependency. The dependency is a closure built in `OpenAIService.generatePersonaResponse` that reuses the existing single-shot specialist path — `runMorgan` never imports `PERSONAS` or learns app persona types. The reach contract flips the one "coming soon" specialist line into a live capability, atomically with the tool.

**Tech Stack:** TypeScript, Node/Express server, `@anthropic-ai/sdk` (boxed in `anthropicToolClient.ts`), Vitest.

## Global Constraints

- **Naming:** "Morgan M2 — Ask Specialist" is the **milestone**. "Ask Specialist Tool" (Task 4) is **one task** inside it. Track tasks by these section names.
- **One specialist per tool call.** No parallel multi-specialist orchestration. Enforced at two layers: the tool schema takes a single `specialistId`, AND the loop's **parallel guard** (Task 4b) errors every `askSpecialist` when a turn contains more than one — two specialist calls never run concurrently.
- **No premature final.** If a turn contains both `askSpecialist` and `respond_to_writer`, the final is rejected and re-required after the specialist read is fed back (Task 4b premature-final guard).
- **Allowed specialist IDs (exact, lowercase):** `sam`, `casey`, `oliver`, `maya`, `zoe`, `alex`.
- **Morgan must not call herself** — `writingPartner` is never callable.
- **Unknown specialist IDs must error** (error outcome fed back to the model, never a fake answer).
- **Synthesis, not pass-through:** the specialist's reply is fed back as a `tool_result`; only `respond_to_writer.message` reaches the writer. Specialist `suggestions` never forward — Morgan owns the final 0-3 suggestions.
- **Out of scope (do NOT touch):** UI redesign, draft editing, live web lookup, receipt UI, `/swarm` reconciliation, streaming changes.
- **`/swarm` and streaming — inspection verdict:** NOT forced. `askSpecialist` reuses `generatePersonaResponse` directly; the two callers of that method (`server/routes.ts:861` `/swarm`, `:976` `/api/wp-chat`) are untouched. Specialists run through `createModelProvider()`, which already carries the PR #31 streaming/timeout fix; Morgan's own loop turns stay short (~1600 tokens). If any task surfaces a forced change to either, STOP and escalate before proceeding.
- **No hollow fallback.** Every failure path returns an honest error outcome, consistent with M1 policy in `runMorgan.ts`.
- **Verification gate (Task 8):** `npm run check`, `npm run test:run`, `npm run build` all green.

---

## 1. Baseline

**Plain purpose:** Confirm the starting point is exactly what the plan assumes, so later tasks build on known ground.

**Files likely touched:** none (read-only verification).

**Tests to write or update first:** none. This is a state check, not a code change.

**Exact done criteria:**
- `git status` clean on `main`; `git log` shows PR #44 (M1), #45 (cleanup), #46 (docs) merged.
- `npm run check && npm run test:run && npm run build` all green on untouched `main` (establishes the "behavior-unchanged" reference).
- Confirmed present: `server/ai/morganRuntime/{types,tools,runMorgan,anthropicToolClient,reachContract,index}.ts`; `MORGAN_TOOLS` lists exactly `readProjectContext` + `respond_to_writer`; `dispatchTool` is synchronous; reach contract `cannotDoYet` still contains the "call the specialists directly … (coming soon)" line (`reachContract.ts:54`).
- Branch created for M2 work **only after Ben says proceed** (not part of planning).

**What must NOT change:** nothing — read-only.

---

## 2. Specialist Registry

**Plain purpose:** One shared source of truth for the six callable specialist IDs, consumed by both the tool enum (Task 4) and the reach contract (Task 7). Prevents drift where the tool advertises one set and the contract promises another.

**Files likely touched:**
- Modify: `shared/personas.ts` (add registry exports near `PERSONAS`)
- Test: `tests/shared/personas.registry.test.ts` (create)

**Tests to write or update first:**

```ts
// tests/shared/personas.registry.test.ts
import { describe, it, expect } from 'vitest'
import { CALLABLE_SPECIALIST_IDS, isCallableSpecialist } from '../../shared/personas'
import { PERSONAS } from '../../shared/personas'

describe('callable specialist registry', () => {
  it('is exactly the six room specialists, lowercase', () => {
    expect([...CALLABLE_SPECIALIST_IDS].sort()).toEqual(['alex', 'casey', 'maya', 'oliver', 'sam', 'zoe'])
  })
  it('never includes writingPartner', () => {
    expect((CALLABLE_SPECIALIST_IDS as readonly string[])).not.toContain('writingPartner')
  })
  it('every callable id resolves to a real persona', () => {
    for (const id of CALLABLE_SPECIALIST_IDS) expect(PERSONAS[id]).toBeTruthy()
  })
  it('isCallableSpecialist accepts the six and rejects writingPartner + unknown', () => {
    expect(isCallableSpecialist('zoe')).toBe(true)
    expect(isCallableSpecialist('writingPartner')).toBe(false)
    expect(isCallableSpecialist('nobody')).toBe(false)
  })
})
```

**Implementation:**

```ts
// shared/personas.ts — add near PERSONAS
export const CALLABLE_SPECIALIST_IDS = ['sam', 'casey', 'oliver', 'maya', 'zoe', 'alex'] as const;
export type SpecialistId = (typeof CALLABLE_SPECIALIST_IDS)[number];
export function isCallableSpecialist(id: string): id is SpecialistId {
  return (CALLABLE_SPECIALIST_IDS as readonly string[]).includes(id);
}
```

**Interfaces produced (later tasks rely on these exact names):**
- `CALLABLE_SPECIALIST_IDS: readonly SpecialistId[]`
- `type SpecialistId = 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'`
- `isCallableSpecialist(id: string): id is SpecialistId`

**Exact done criteria:** registry test fails first (symbols undefined), then passes; `npm run check` clean. Commit: `feat(morgan-m2): callable specialist registry (single source of truth)`.

**What must NOT change:** the `PERSONAS` record itself (entries, ids, shapes); `writingPartner` stays in `PERSONAS` but out of `CALLABLE_SPECIALIST_IDS`.

---

## 3. Async DI

**Plain purpose:** Make the dispatcher async and give `runMorgan` an injected, provider-agnostic dependency slot — the prerequisite the `askSpecialist` tool needs. Task 3 proves only async dispatch, dependency-slot threading, `Promise.all` ordering, and no behavior change. The full injected-specialist loop proof belongs to Task 4 (it needs a real async tool to be honest).

**Files likely touched:**
- Modify: `server/ai/morganRuntime/types.ts` (add `SpecialistAnswer`, `RuntimeDeps`; extend `RunMorganInput`; `DispatchOutcome` unchanged)
- Modify: `server/ai/morganRuntime/tools.ts` (`DispatchContext` gains `deps?`; `dispatchTool` → `async`)
- Modify: `server/ai/morganRuntime/runMorgan.ts` (`await Promise.all(...)`; thread `input.deps` into context)
- Modify: `tests/server/morganRuntime/tools.test.ts` (existing `dispatchTool` calls become `await`)
- Test: `tests/server/morganRuntime/runMorgan.test.ts` (read-tool-only ordering/batching guard + behavior-unchanged)

**Interfaces produced:**
- `interface SpecialistAnswer { message: string }`
- `interface RuntimeDeps { callSpecialist(input: { specialistId: SpecialistId; question: string }): Promise<SpecialistAnswer> }`
- `dispatchTool(use: ToolUse, ctx: { inventory: ReachInventory; deps?: RuntimeDeps }): Promise<DispatchOutcome>`
- `RunMorganInput` gains optional `deps?: RuntimeDeps`

**Tests to write or update first:** Task 3 proves only what is provable *before* `askSpecialist` exists — async signature, `Promise.all` ordering, and no behavior change. The full-loop proof that the loop AWAITS a real injected async tool moves to **Task 4** (it needs an actual async tool to be honest).

```ts
// tests/server/morganRuntime/tools.test.ts — existing calls become await
const out = await dispatchTool({ id: 't1', name: READ_CONTEXT_TOOL_NAME, input: {} }, { inventory })

it('dispatchTool is async (returns a Promise that resolves to the outcome)', async () => {
  const p = dispatchTool({ id: 't', name: READ_CONTEXT_TOOL_NAME, input: {} }, { inventory })
  expect(p).toBeInstanceOf(Promise)
  expect((await p).kind).toBe('continue')
})
```

```ts
// tests/server/morganRuntime/runMorgan.test.ts — new cases (read tools only; no specialist yet)
// (Uses the existing module mock of anthropicToolClient in this file to script turns.)

it('a multi-read turn produces ONE assistant turn + ONE combined tool_results turn, ordered to match tool_uses', async () => {
  // script one turn with two readProjectContext tool_use blocks (ids r1, r2), then respond_to_writer;
  // assert exactly one assistantTurn push, one toolResultsTurn carrying both results,
  // and result order [r1, r2] matches turn.toolUses (guards P1 batching under Promise.all)
})

it('behavior unchanged: a scripted read -> respond run returns the same message/suggestions as M1', async () => {
  // identical assertion to the M1 acceptance proof for a single read+respond turn
})
```

**Implementation:**

```ts
// types.ts
import type { SpecialistId } from '../../../shared/personas';
export interface SpecialistAnswer { message: string }
export interface RuntimeDeps {
  callSpecialist(input: { specialistId: SpecialistId; question: string }): Promise<SpecialistAnswer>;
}
// RunMorganInput: add `deps?: RuntimeDeps;`
```

```ts
// tools.ts
interface DispatchContext { inventory: ReachInventory; deps?: RuntimeDeps }
export async function dispatchTool(use: ToolUse, ctx: DispatchContext): Promise<DispatchOutcome> {
  // existing read + respond branches unchanged in behavior (now inside an async fn)
}
```

```ts
// runMorgan.ts — inside the loop
const ctx = { inventory: input.inventory, deps: input.deps };
const outcomes = await Promise.all(turn.toolUses.map((use) => dispatchTool(use, ctx)));
// `Promise.all` preserves array order → assistantTurn + combined toolResultsTurn batching unchanged.
```

**Exact done criteria:** async-signature test + ordering test + behavior-unchanged test fail first (signature/await mismatch), then pass; full existing morganRuntime suite green with `await` added. Commit: `refactor(morgan-m2): async dispatch + injected runtime deps (no behavior change)`.

**What must NOT change:** `MORGAN_TOOLS` (no new tool yet); the two existing tools' behavior and schemas; the P1 history-batching contract; `MAX_ITERS`, retry-once nudge, honest-error policy; `/api/wp-chat` output for any scripted turn. With no `askSpecialist` tool offered, Morgan's behavior is byte-identical. **Do NOT add a stub async tool to production code to "prove" the seam** — that is the dead-production-tool anti-pattern; the seam is proven by the real tool in Task 4.

---

## 4. Ask Specialist Tool

**Plain purpose:** Add the `askSpecialist` tool schema and its dispatcher case — the model-facing surface and its validation. No caller wiring yet (that's Task 5); this task validates inputs and routes to `ctx.deps.callSpecialist`, erroring honestly when deps are absent.

**Files likely touched:**
- Modify: `server/ai/morganRuntime/tools.ts` (`ASK_SPECIALIST_TOOL_NAME`, spec, dispatcher case)
- Modify: `server/ai/morganRuntime/runMorgan.ts` (parallel guard, premature-final guard — both tie to `askSpecialist`, so they land here, not Task 3)
- Test: `tests/server/morganRuntime/tools.test.ts` (single-dispatch validation cases)
- Test: `tests/server/morganRuntime/runMorgan.test.ts` (full-loop injected-specialist proof + both guards)

**Interfaces produced:**
- `ASK_SPECIALIST_TOOL_NAME = 'askSpecialist'`
- `MORGAN_TOOLS` now lists three tools.

**Tests to write or update first:**

```ts
// tests/server/morganRuntime/tools.test.ts
import { CALLABLE_SPECIALIST_IDS } from '../../../shared/personas'

const depsOk = { callSpecialist: async ({ specialistId }: any) => ({ message: `read from ${specialistId}` }) }

it('exposes read, respond, and askSpecialist — and the askSpecialist enum equals the shared registry', () => {
  const names = MORGAN_TOOLS.map(t => t.name).sort()
  expect(names).toEqual([READ_CONTEXT_TOOL_NAME, RESPOND_TOOL_NAME, ASK_SPECIALIST_TOOL_NAME].sort())
  const ask = MORGAN_TOOLS.find(t => t.name === ASK_SPECIALIST_TOOL_NAME)!
  const enumVals = (ask.input_schema as any).properties.specialistId.enum.sort()
  expect(enumVals).toEqual([...CALLABLE_SPECIALIST_IDS].sort())
})

it('calls the injected dependency for a valid specialist + question and returns a continue outcome with the read', async () => {
  const out = await dispatchTool({ id: 'a1', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'zoe', question: 'world logic?' } }, { inventory, deps: depsOk })
  expect(out.kind).toBe('continue')
  if (out.kind === 'continue') expect(out.content).toMatch(/read from zoe/)
})

it('rejects writingPartner (Morgan cannot call herself)', async () => {
  const out = await dispatchTool({ id: 'a2', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'writingPartner', question: 'x' } }, { inventory, deps: depsOk })
  expect(out.kind).toBe('error')
})

it('rejects an unknown specialist id', async () => {
  const out = await dispatchTool({ id: 'a3', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'nobody', question: 'x' } }, { inventory, deps: depsOk })
  expect(out.kind).toBe('error')
})

it('rejects a blank question', async () => {
  const out = await dispatchTool({ id: 'a4', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: '   ' } }, { inventory, deps: depsOk })
  expect(out.kind).toBe('error')
})

it('errors honestly when the caller dependency is missing (no fake answer)', async () => {
  const out = await dispatchTool({ id: 'a5', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: 'ok' } }, { inventory })
  expect(out.kind).toBe('error')
})

it('errors honestly when the dependency throws', async () => {
  const depsThrow = { callSpecialist: async () => { throw new Error('provider down') } }
  const out = await dispatchTool({ id: 'a6', name: ASK_SPECIALIST_TOOL_NAME, input: { specialistId: 'sam', question: 'ok' } }, { inventory, deps: depsThrow })
  expect(out.kind).toBe('error')
})
```

**Implementation:**

```ts
// tools.ts
import { CALLABLE_SPECIALIST_IDS, isCallableSpecialist } from '../../../shared/personas';
export const ASK_SPECIALIST_TOOL_NAME = 'askSpecialist';

// spec appended to MORGAN_TOOLS:
{
  name: ASK_SPECIALIST_TOOL_NAME,
  description:
    'Consult ONE WriterOS room specialist to get their actual read, then synthesize it yourself. ' +
    'Use only when a specialist lane is clearly the better source. One specialist per call.',
  input_schema: {
    type: 'object',
    properties: {
      specialistId: { type: 'string', enum: [...CALLABLE_SPECIALIST_IDS], description: 'Which specialist to consult.' },
      question: { type: 'string', minLength: 1, description: 'The focused question for that specialist.' },
    },
    required: ['specialistId', 'question'],
    additionalProperties: false,
  },
}

// dispatcher case (inside dispatchTool):
if (use.name === ASK_SPECIALIST_TOOL_NAME) {
  const input = (use.input ?? {}) as Record<string, unknown>;
  const specialistId = typeof input.specialistId === 'string' ? input.specialistId : '';
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (!question) return { kind: 'error', toolUseId: use.id, content: 'askSpecialist requires a non-empty question.' };
  if (!isCallableSpecialist(specialistId)) return { kind: 'error', toolUseId: use.id, content: `askSpecialist: ${specialistId || '(none)'} is not a callable specialist.` };
  if (!ctx.deps?.callSpecialist) return { kind: 'error', toolUseId: use.id, content: 'askSpecialist is not wired in this context.' };
  try {
    const answer = await ctx.deps.callSpecialist({ specialistId, question });
    return { kind: 'continue', toolUseId: use.id, content: answer.message };
  } catch {
    return { kind: 'error', toolUseId: use.id, content: `askSpecialist: could not reach ${specialistId}.` };
  }
}
```

### Task 4b — Loop guards in `runMorgan` (parallel + premature-final)

Two turn-level rules that only the loop can enforce (it sees the whole turn's `toolUses`; `dispatchTool` sees one use). Both are about `askSpecialist`, so they live here.

**Guard A — Parallel (one specialist at a time):** if a single turn contains **more than one** `askSpecialist` tool_use, execute **none** of them; return an error outcome for each telling Morgan to consult one at a time. Other tools in the turn (e.g. `readProjectContext`) still dispatch. This means two specialist calls never run concurrently through `Promise.all`.

**Guard B — Premature final:** if a turn contains `askSpecialist` **and** `respond_to_writer`, Morgan answered before seeing the specialist's read. Do **not** accept that final. Dispatch the consult, and feed the `respond_to_writer` tool_use a nudge tool_result (so Anthropic history stays valid — every tool_use needs a tool_result) requiring a later `respond_to_writer`.

**Tests (in `runMorgan.test.ts`):**

```ts
it('FULL LOOP: askSpecialist routes through the injected dep and the read is fed back, then respond_to_writer ends', async () => {
  // turn 1: askSpecialist({ specialistId:'zoe', question:'?' }); stub dep resolves after a tick -> { message:'ZOE_READ' }
  // turn 2: respond_to_writer({ message:'SYNTH', suggestions:['x'] })
  // assert: the loop awaited the dep (ZOE_READ present as a tool_result before turn 2 ran); result.message === 'SYNTH'
})

it('PARALLEL GUARD: two askSpecialist calls in one turn execute neither and error both with one-at-a-time', async () => {
  // turn 1: [askSpecialist zoe, askSpecialist sam]; stub dep would throw if ever called
  // assert: dep never invoked; both tool_results are errors mentioning one at a time; loop continues (no final yet)
})

it('PARALLEL GUARD: one askSpecialist + one readProjectContext in a turn still runs both', async () => {
  // assert: read dispatched, single specialist dispatched, dep called exactly once
})

it('PREMATURE FINAL GUARD: askSpecialist + respond_to_writer in the same turn does not return the final', async () => {
  // turn 1: [askSpecialist zoe, respond_to_writer 'EARLY']; turn 2: respond_to_writer 'AFTER'
  // assert: result.message === 'AFTER' (not 'EARLY'); the specialist read was fed back; respond got a nudge tool_result in turn 1
})
```

**Implementation (`runMorgan.ts` loop, replacing the dispatch + final-detection block):**

```ts
import { MORGAN_TOOLS, dispatchTool, ASK_SPECIALIST_TOOL_NAME, RESPOND_TOOL_NAME } from './tools';

const ONE_AT_A_TIME = 'Consult one specialist at a time — re-issue a single askSpecialist call.';
const PREMATURE_FINAL =
  'You called respond_to_writer before seeing the specialist answer. Wait for the askSpecialist result, then call respond_to_writer with your synthesized answer.';

// inside the loop, after `turn` is fetched:
const ctx = { inventory: input.inventory, deps: input.deps };
const askCount = turn.toolUses.filter((u) => u.name === ASK_SPECIALIST_TOOL_NAME).length;

const outcomes = await Promise.all(
  turn.toolUses.map((use) => {
    if (askCount > 1 && use.name === ASK_SPECIALIST_TOOL_NAME) {
      return Promise.resolve<DispatchOutcome>({ kind: 'error', toolUseId: use.id, content: ONE_AT_A_TIME });
    }
    return dispatchTool(use, ctx);
  }),
);

const respondUse = turn.toolUses.find((u) => u.name === RESPOND_TOOL_NAME);
const final = outcomes.find((o): o is Extract<DispatchOutcome, { kind: 'final' }> => o.kind === 'final');
const consulted = turn.toolUses.some((u) => u.name === ASK_SPECIALIST_TOOL_NAME);

// Accept a final ONLY when no specialist was consulted in the same turn.
if (final && !consulted) {
  return final.result;
}

const results = outcomes
  .filter((o): o is Extract<DispatchOutcome, { kind: 'continue' | 'error' }> => o.kind !== 'final')
  .map((o) => ({ toolUseId: o.toolUseId, content: o.content }));
// Premature final: answer the respond_to_writer tool_use with a nudge so history stays valid.
if (final && consulted && respondUse) {
  results.push({ toolUseId: respondUse.id, content: PREMATURE_FINAL });
}
messages.push(assistantTurn(turn.assistantContent));
messages.push(toolResultsTurn(results));
```

> Note: the `final` `DispatchOutcome` variant carries no `toolUseId`; the nudge uses `respondUse.id` from `turn.toolUses`, so the M1 `DispatchOutcome` shape is unchanged.

**Exact done criteria:** all six single-dispatch tests + the four loop tests pass; existing tool/loop tests still pass; `npm run check` clean. Commits: `feat(morgan-m2): askSpecialist tool schema + dispatcher (validated, deps-routed)` then `feat(morgan-m2): loop guards — one specialist at a time + no premature final`.

**What must NOT change:** `readProjectContext`/`respond_to_writer` schemas and behavior; the unknown-tool fallthrough; the `writingPartner` guard relies on registry exclusion (defense-in-depth, asserted by test); the M1 `DispatchOutcome` `final` shape (nudge uses `respondUse.id`, not a new field); the normal (no-`askSpecialist`) final path stays exactly as M1 — a plain `respond_to_writer` turn still returns immediately.

---

## 5. Specialist Caller

**Plain purpose:** Build the injected `callSpecialist` closure in the Morgan branch of `OpenAIService.generatePersonaResponse`, reusing the existing single-shot specialist persona path. This is where the runtime dep meets the app's persona service.

**Files likely touched:**
- Modify: `server/ai/openaiService.ts` (Morgan branch ~`:994-1004`: build `deps`, pass to `runMorgan`; import `PERSONAS`, `RuntimeDeps`)
- Test: `tests/server/morganRuntime/morganDelegation.test.ts` (mirror existing spy pattern in this file)

**Interfaces consumed:** `runMorgan({ ..., deps })` from Task 3; `RuntimeDeps`, `SpecialistAnswer` from `types.ts`; `PERSONAS` from `shared/personas`.

**Tests to write or update first:**

```ts
// tests/server/morganRuntime/morganDelegation.test.ts — add
it('passes a callSpecialist dep into runMorgan that routes to the existing persona path', async () => {
  // spy on runMorgan; capture its input.deps
  // invoke deps.callSpecialist({ specialistId: 'casey', question: 'arc?' })
  // assert it calls generatePersonaResponse with PERSONAS['casey'], the SAME userProfile/storyMemory/voiceProfile,
  //   empty conversation history, and returns { message } extracted from the specialist PersonaResponse
})

it('the specialist call uses the single-shot path, not runMorgan (no recursion)', async () => {
  // assert runMorgan is invoked once for Morgan; the specialist call goes through createModelProvider, not runMorgan
})
```

**Implementation:**

```ts
// openaiService.ts — inside `if (persona.id === 'writingPartner')`, before runMorgan call
const deps: RuntimeDeps = {
  callSpecialist: async ({ specialistId, question }) => {
    const specialist = PERSONAS[specialistId];
    const res = await this.generatePersonaResponse(specialist, question, userProfile, storyMemory, [], voiceProfile);
    return { message: res.message };
  },
};
const result = await runMorgan({ systemPrompt, userMessage, history: conversationHistory, inventory, deps });
```

**Exact done criteria:** delegation tests pass; full suite green; live sanity (Ben, with real key) optional but recommended before merge. Commit: `feat(morgan-m2): wire specialist caller via existing persona service`.

**What must NOT change:** `runMorgan` must NOT import `PERSONAS` or app persona types (the closure owns that); `/api/wp-chat` stays a thin adapter; specialists keep running the single-shot path (recursion impossible because `specialistId` is never `writingPartner`); specialist conversation history is `[]` for this slice (no thread carryover).

---

## 6. Synthesis Contract

**Plain purpose:** Guarantee — and make *testable* — that Morgan synthesizes the specialist's read rather than forwarding it raw, and owns the final suggestions. Add the prompt instruction that tells her to consult, attribute, and synthesize.

**Files likely touched:**
- Modify: `server/ai/openaiService.ts` (tool-mode branch of the Morgan prompt, `:873-874`)
- Test: `tests/server/morganRuntime/runMorgan.test.ts` (structural synthesis proof)
- Test: `tests/server/morganShowrunnerPrompt.test.ts` (tool-mode prompt mentions the tool + attribution + synthesis)

**Tests to write or update first:**

```ts
// tests/server/morganRuntime/runMorgan.test.ts
it('never raw-passes the specialist read: only respond_to_writer reaches the writer', async () => {
  // turn 1: askSpecialist -> stub dep returns { message: 'RAW_SPECIALIST_TEXT' }
  // turn 2: respond_to_writer { message: 'SYNTH', suggestions: ['mine'] }
  const result = await runMorgan(/* scripted input with deps */)
  expect(result.message).toBe('SYNTH')
  expect(result.message).not.toContain('RAW_SPECIALIST_TEXT')
  expect(result.suggestions).toEqual(['mine']) // Morgan's, not the specialist's
})
```

```ts
// tests/server/morganShowrunnerPrompt.test.ts
it('tool-mode Morgan prompt instructs askSpecialist use, attribution, and synthesis', () => {
  const prompt = createPersonaSystemPrompt(PERSONAS.writingPartner, userProfile, storyMemory, 'hi', undefined, 'tool')
  expect(prompt).toMatch(/askSpecialist/)
  expect(prompt).toMatch(/attribut/i)
  expect(prompt).toMatch(/synthesi[sz]/i)
})
```

**Implementation (prompt addition to the `responseMode === 'tool'` branch):**

```ts
// openaiService.ts :873 tool branch — extend the IMPORTANT string with:
' You may call askSpecialist({ specialistId, question }) to get ONE specialist\'s actual read' +
' when their lane is clearly the better source — one specialist per call. When you do,' +
' synthesize their read into your own showrunner answer and attribute it plainly' +
' (e.g. "I asked Zoe — her read is …"). Never paste their reply verbatim, and never' +
' forward their suggestions; you own the final suggestions.'
```

**Exact done criteria:** synthesis test passes (structural guarantee: specialist output is a `tool_result`, only `respond_to_writer.message` is returned); suggestions normalization (0-3, non-empty) from M1 still holds. Commit: `feat(morgan-m2): synthesis + attribution contract for specialist consults`.

**What must NOT change:** the structural fact that `respond_to_writer` is the only path to the writer (this is what makes "no raw pass-through" true, not prompt wording alone); the M1 suggestions 0-3 contract; the JSON (`responseMode === 'json'`) branch.

---

## 7. Reach Contract Flip

**Plain purpose:** Move "call specialists directly" from `cannotDoYet` into `canDoNow`, atomically with the tool going live, so Morgan's stated reach is truthful — while explicitly keeping edit/web/parallel as honest limits.

**Files likely touched:**
- Modify: `server/ai/morganRuntime/reachContract.ts` (`canDoNow` / `cannotDoYet`; derive specialist names from registry to avoid drift)
- Test: `tests/server/morganRuntime/reachContract.test.ts`

**Tests to write or update first:**

```ts
// tests/server/morganRuntime/reachContract.test.ts
it('after M2, canDoNow includes consulting a specialist directly', () => {
  const inv = buildReachInventory(memory)
  expect(inv.canDoNow.some(s => /consult.*specialist/i.test(s))).toBe(true)
})
it('cannotDoYet no longer contains the specific specialist "call directly … coming soon" line', () => {
  const inv = buildReachInventory(memory)
  // target the exact retired line, not any/all "coming soon" phrasing
  expect(inv.cannotDoYet.some(s => /call the specialists directly/i.test(s))).toBe(false)
})
it('still honestly limits edits, live web, and parallel room orchestration', () => {
  const inv = buildReachInventory(memory)
  expect(inv.cannotDoYet.some(s => /edit|rewrite/i.test(s))).toBe(true)
  expect(inv.cannotDoYet.some(s => /web/i.test(s))).toBe(true)
  expect(inv.cannotDoYet.some(s => /parallel|more than one|at once/i.test(s))).toBe(true)
})
```

**Implementation:**

```ts
// reachContract.ts
import { CALLABLE_SPECIALIST_IDS, PERSONAS } from '../../../shared/personas';
const specialistNames = CALLABLE_SPECIALIST_IDS.map((id) => PERSONAS[id].name).join(', ');

// canDoNow — keep the existing "recommend which specialist" line AND add:
`consult one specialist at a time (${specialistNames}) to get their actual read, then synthesize it for you`,

// cannotDoYet — REMOVE the "call the specialists directly … (coming soon)" line; ADD:
`consult more than one specialist at once (no parallel room orchestration yet)`,
// keep: edit/rewrite drafts; look things up on the live web
```

**Exact done criteria:** flip tests pass; the existing reach-contract tests adjusted for the moved line pass; `npm run check` clean. Commit: `feat(morgan-m2): flip reach contract — specialist consults now live, limits kept honest`.

**What must NOT change:** the `canSee`/`cannotSee` derivation logic; the "recommend which specialist" line stays (still true); the edit + live-web limits stay verbatim in spirit.

---

## 8. Test Gates

**Plain purpose:** Prove the whole milestone holds together — focused behavior plus repo-wide gates — before review.

**Files likely touched:** none new; runs the full suite.

**Tests to write or update first:** none new — this task runs and confirms the suite assembled across Tasks 2-7, plus the M1 acceptance proofs (`tests/server/morganRuntime/acceptance.test.ts`) still green.

**Exact done criteria (all must pass, output observed):**
- `npm run check` — tsc clean.
- `npm run test:run` — full suite green, including: registry, async-loop + batching, six askSpecialist cases, delegation/caller wiring, synthesis structural proof, reach-contract flip, and unchanged M1 acceptance.
- `npm run build` — clean.
- Behavior-unchanged check: a scripted Morgan turn with NO `askSpecialist` use produces the same `message`/`suggestions` as M1.
- Recommended: Ben live-verifies one real specialist consult with a real `ANTHROPIC_API_KEY` (Morgan asks e.g. Zoe, attributes + synthesizes).

**What must NOT change:** no test is weakened or skipped to pass; if a gate fails, fix forward (no deferred debt).

---

## 9. CodeRabbit Hold

**Plain purpose:** Open the PR, let automated + human review run, and HOLD for findings before merge — mirroring the M1 flow (Codex + CodeRabbit, all findings fixed pre-merge).

**Files likely touched:** none (process). PR body + any fix commits as findings dictate.

**Tests to write or update first:** none initially; any review finding gets a failing test first, then the fix (TDD), same as M1's P1/P2/suggestions fixes.

**Exact done criteria:**
- PR opened against `main` (draft until gate green), titled for the milestone, body linking this plan and listing the nine tasks with done/▢ status.
- CodeRabbit review completes; every finding either fixed (with a regression test) or explicitly dispositioned in a reply.
- Codex review of this work addressed.
- **No merge until Ben explicitly says merge.**

**What must NOT change:** scope — review fixes stay inside M2's boundaries; out-of-scope findings (UI, `/swarm`, streaming, receipts) are logged as follow-ups, not absorbed into this PR.

---

## Self-Review (against scope + Codex draft)

- **Coverage:** every Codex-draft task (0-7 + Hold) maps to a section here (Baseline, Registry, Async DI, Ask Specialist Tool, Specialist Caller, Synthesis, Reach Flip, Test Gates, CodeRabbit Hold). ✅
- **Scope boundaries:** UI / draft-edit / web / receipts / `/swarm` / streaming all explicitly excluded; `/swarm` + streaming non-forcing verified against `routes.ts` callers and `createModelProvider`. ✅
- **Hard rules:** one-per-call enforced at **two layers** (single `specialistId` schema + loop parallel guard, Task 4b); no premature final (Task 4b guard); no self-call (registry excludes `writingPartner` + explicit test); unknown id errors; synthesis (structural proof, not prompt-only); suggestions owned by Morgan. ✅
- **Type consistency:** `SpecialistId`, `CALLABLE_SPECIALIST_IDS`, `isCallableSpecialist`, `RuntimeDeps.callSpecialist({ specialistId, question }): Promise<{ message }>`, `SpecialistAnswer`, `ASK_SPECIALIST_TOOL_NAME`, `RESPOND_TOOL_NAME` used identically across Tasks 2-7. ✅
- **Refinements over Codex draft:** (1) registry of **IDs** is the source of truth, contract **display names** derived from `PERSONAS[id].name` to kill drift; (2) synthesis made testable via the structural "only respond_to_writer reaches the writer" assertion rather than an unfalsifiable "she synthesizes"; (3) deps-missing and deps-throw honest-error paths added; (4) `Promise.all` ordering named as the P1-batching guard; (5) the tool-mode **prompt** change (`openaiService.ts:873`) listed as a touched file, which the draft implied but omitted.
- **Codex review round 2 (applied):** (R1) Task 3 no longer claims a full-loop injected-dep proof before the tool exists — it proves async signature + `Promise.all` ordering + no behavior change; the real injected-specialist loop proof moved to Task 4. (R2) parallel guard added (Task 4b) — multiple `askSpecialist` in one turn execute none and error one-at-a-time. (R3) premature-final guard added (Task 4b) — `askSpecialist` + `respond_to_writer` in one turn rejects the final and re-requires it. (R4) reach-contract test targets the specific retired line. (R5) tool-mode prompt test added (Task 6). ✅

---

## Open questions for Codex review

1. **Registry location:** `shared/personas.ts` vs. a runtime-local list. I put it in `shared` so tool enum + reach contract + caller share one truth; `morganRuntime` imports only the id list/type/guard (data, not the `PERSONAS` record or model logic). Acceptable, or keep the runtime decoupled from `shared` entirely?
2. **Specialist history:** `[]` for this slice. Confirm Morgan should not pass any conversation context into the specialist call yet (keeps the consult clean/stateless).
3. **Attribution wording:** prompt-guided ("I asked Zoe — …") and not enforced by code. Agree that attribution is a prompt concern, while *no-raw-passthrough* is the structural guarantee?
