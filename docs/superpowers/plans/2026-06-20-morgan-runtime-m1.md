# Morgan Runtime M1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Morgan off the single-shot `prompt → JSON.parse → hollow fallback` path onto a Claude-native tool-loop runtime, so she answers reliably with an honest reach contract and never collapses into "I'm here to help!" — and so M2 (`askSpecialist`) plugs in with no surgery.

**Architecture:** A new isolated module `server/ai/morganRuntime/*` holds a Claude-native tool loop. The loop lets Morgan optionally call read tools, then **must** close by calling a terminal `respond_to_writer` tool whose input schema *is* the structured response (resolves the tool-loop-vs-strict-JSON conflict in one runtime). `generatePersonaResponse` gains a Morgan branch that delegates to the runtime; every other persona keeps the existing single-shot path byte-for-byte. `/api/wp-chat` stays a thin adapter. Anthropic block shapes stay boxed inside the runtime module.

**Tech Stack:** Node + Express, TypeScript, `@anthropic-ai/sdk` ^0.95.0 (tool use), Vitest, `tsc` for typecheck.

## Global Constraints

- **`/api/wp-chat` stays canonical and thin** (`server/routes.ts:903`). No runtime logic in the route. (CLAUDE.md rule.)
- **Claude-native.** Morgan runs on Anthropic. If `ANTHROPIC_API_KEY` is absent, **fail honestly** with a clear message. **Never silently fall back to the OpenAI single-shot path for Morgan** — that resurrects the dumb behavior. (The OpenAI `createModelProvider()` path remains untouched for specialists.)
- **Provider details boxed.** Anthropic message/content-block shapes (`tool_use`, `tool_result`) appear only inside `server/ai/morganRuntime/*`. The rest of the app sees a clean interface.
- **Loop + terminal tool.** Read tools may run during the loop; the model **must** close by calling `respond_to_writer({ message, suggestions, receipts, limits })`. Single structured response path.
- **Substrate now, tools later.** M1 ships the loop runner + dispatcher + exactly one read tool (`readProjectContext`). **No `askSpecialist` (M2). No web lookup. No draft editing.**
- **Reach contract is derived, not hardcoded.** "What I can see / cannot see / can do now / cannot do yet" is computed from the real `StoryMemory`, not a prose string. (Guards the repo's recurring "agent claims to see what it can't" failure mode.)
- **No hollow fallback for Morgan.** On malformed output: retry/repair **once**, then return an **honest error** — never "I'm here to help!".
- **Transcript isolation preserved.** Morgan writes only `agents.writingPartner.transcript`. Client-owned state untouched; server stays a stateless adapter.
- **Existing behavior green.** Specialist prompts/responses and Voice Profile behavior unchanged. `createPersonaSystemPrompt` default output byte-identical for non-Morgan and for Morgan in legacy `json` mode.
- **Env note:** running Morgan now requires `ANTHROPIC_API_KEY` set (and is independent of `AI_PROVIDER`). Document in PR.
- **Commits:** one commit per task. No `Co-Authored-By` trailer. Verify `npm run test:run` · `npm run check` · `npm run build` before "done".

---

## File Structure

- `server/ai/morganRuntime/types.ts` — shared runtime types (result, reach inventory, tool specs, loop primitives). One responsibility: type contracts.
- `server/ai/morganRuntime/reachContract.ts` — pure derivation of the reach inventory from `StoryMemory` + its render-to-prompt string.
- `server/ai/morganRuntime/tools.ts` — tool specs (`readProjectContext`, `respond_to_writer`), the dispatcher, and terminal-input validation. Pure, no network.
- `server/ai/morganRuntime/anthropicToolClient.ts` — the **only** place `@anthropic-ai/sdk` and Anthropic block shapes live. One round-trip `sendToolTurn` + message-builder helpers.
- `server/ai/morganRuntime/runMorgan.ts` — provider-agnostic loop runner: not-configured guard → loop/dispatch → terminal capture → retry-once → honest error.
- `server/ai/morganRuntime/index.ts` — re-export `runMorgan` + public types.
- `server/ai/openaiService.ts` — MODIFY: `createPersonaSystemPrompt` gains optional `responseMode`; `generatePersonaResponse` gains the Morgan delegation branch.
- Tests under `tests/server/morganRuntime/`.

## Interfaces (locked types — used across tasks)

```ts
// server/ai/morganRuntime/types.ts
export interface ReachInventory {
  canSee: string[];        // derived from populated StoryMemory fields
  cannotSee: string[];     // fixed truths (pixels, unlisted fields, other apps, live web)
  canDoNow: string[];      // M1 capabilities
  cannotDoYet: string[];   // M2+ capabilities, named honestly
}

export interface MorganRuntimeResult {
  message: string;
  suggestions: string[];
  receipts: string[];      // M1: always [] (no specialist/web yet)
  limits: string[];        // honest "cannot do yet" surfaced when relevant
  ok: boolean;             // false on honest-error paths
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>; // JSON Schema
}

export interface ToolUse { id: string; name: string; input: unknown }

// outcome of dispatching one tool_use
export type DispatchOutcome =
  | { kind: 'continue'; toolUseId: string; content: string } // read tool → feed result back
  | { kind: 'final'; result: MorganRuntimeResult }           // respond_to_writer → stop
  | { kind: 'error'; toolUseId: string; content: string };   // bad tool input → feed error back

// one model turn, provider-agnostic shape returned by the client
export interface ToolTurn {
  stopReason: string;
  toolUses: ToolUse[];
  text: string;
  assistantContent: unknown; // opaque Anthropic content array, passed back verbatim next turn
}

export interface RunMorganInput {
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  inventory: ReachInventory;
}
```

---

## Task 1: Reach inventory (pure derivation)

**Files:**
- Create: `server/ai/morganRuntime/types.ts` (the interfaces above)
- Create: `server/ai/morganRuntime/reachContract.ts`
- Test: `tests/server/morganRuntime/reachContract.test.ts`

**Interfaces:**
- Produces: `buildReachInventory(memory: StoryMemory): ReachInventory`; `renderReachContract(inv: ReachInventory): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { buildReachInventory, renderReachContract } from '../../../server/ai/morganRuntime/reachContract'
import type { StoryMemory } from '../../../shared/schema'

const base = (over: Partial<StoryMemory> = {}): StoryMemory => ({
  project: { title: 'Lifeline', genre: 'Thriller', format: 'feature', logline: 'A dispatcher hears a dead caller.' },
  characters: {}, outline: { acts: 3, beats: [], scenes: [] },
  worldRules: { setting: '', toneAnchors: '', rules: '' }, dialogue: { voiceNotes: '' },
  userProfile: { entryState: 'idea_only', existingWork: [], immediateNeed: '', feedbackStyle: 'direct', writerName: 'Writer' },
  decisions: [], ...over,
})

describe('reach inventory', () => {
  it('lists populated project surfaces in canSee, derived from real state', () => {
    const inv = buildReachInventory(base({ characters: { a: { id: 'a', name: 'Mara', role: 'Dispatcher' } } }))
    expect(inv.canSee.join(' ')).toMatch(/logline/i)
    expect(inv.canSee.join(' ')).toMatch(/character/i)
  })
  it('omits unpopulated surfaces from canSee (no false claims)', () => {
    const inv = buildReachInventory(base({ project: { title: '', genre: '', format: '', logline: '' } }))
    expect(inv.canSee.join(' ')).not.toMatch(/logline/i)
  })
  it('always states fixed honest limits and cannotDoYet', () => {
    const inv = buildReachInventory(base())
    expect(inv.cannotSee.join(' ')).toMatch(/pixel|screen|live web/i)
    expect(inv.cannotDoYet.join(' ')).toMatch(/specialist|edit|web/i)
  })
  it('renders a prompt block with all four sections', () => {
    const text = renderReachContract(buildReachInventory(base()))
    expect(text).toMatch(/can see/i); expect(text).toMatch(/cannot see/i)
    expect(text).toMatch(/can do now/i); expect(text).toMatch(/cannot.*yet/i)
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run tests/server/morganRuntime/reachContract.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `types.ts` (interfaces above) and `reachContract.ts`:
  - `buildReachInventory` pushes to `canSee` only when the corresponding field is non-empty: logline/synopsis/treatment/themes (project), characters (count>0), outline beats (length>0), script excerpt, surface, location.
  - `cannotSee` constant: `['the literal pixels/layout on screen', 'fields not in this context packet', 'other apps or your files', 'live web / anything after my knowledge cutoff']`.
  - `canDoNow`: read & synthesize the project context; answer film/reference/general questions from knowledge; give a showrunner read; recommend which specialist to visit.
  - `cannotDoYet`: `['call specialists directly to get their read (coming soon)', 'edit or rewrite your draft', 'look things up on the live web']`.
  - `renderReachContract`: a labeled block `MORGAN REACH (derived from current context — state this honestly if asked):` + four bulleted sections.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(morgan-runtime): derive honest reach inventory from story state`

## Task 2: Tool specs + dispatcher + terminal validation (pure)

**Files:**
- Create: `server/ai/morganRuntime/tools.ts`
- Test: `tests/server/morganRuntime/tools.test.ts`

**Interfaces:**
- Consumes: `ReachInventory`, `MorganRuntimeResult`, `ToolUse`, `DispatchOutcome` (Task 1 types)
- Produces: `MORGAN_TOOLS: ToolSpec[]`; `dispatchTool(use: ToolUse, ctx: { inventory: ReachInventory }): DispatchOutcome`; `RESPOND_TOOL_NAME`, `READ_CONTEXT_TOOL_NAME` constants

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { MORGAN_TOOLS, dispatchTool, RESPOND_TOOL_NAME, READ_CONTEXT_TOOL_NAME } from '../../../server/ai/morganRuntime/tools'

const inventory = { canSee: ['logline'], cannotSee: ['pixels'], canDoNow: ['read'], cannotDoYet: ['edit'] }

describe('morgan tools', () => {
  it('exposes exactly the read tool and the terminal respond tool', () => {
    const names = MORGAN_TOOLS.map(t => t.name).sort()
    expect(names).toEqual([READ_CONTEXT_TOOL_NAME, RESPOND_TOOL_NAME].sort())
    for (const t of MORGAN_TOOLS) expect(t.input_schema).toHaveProperty('type', 'object')
  })
  it('dispatches readProjectContext to a continue outcome carrying the inventory', () => {
    const out = dispatchTool({ id: 't1', name: READ_CONTEXT_TOOL_NAME, input: {} }, { inventory })
    expect(out.kind).toBe('continue')
    if (out.kind === 'continue') { expect(out.toolUseId).toBe('t1'); expect(out.content).toMatch(/logline/) }
  })
  it('dispatches a valid respond_to_writer to a final result', () => {
    const out = dispatchTool({ id: 't2', name: RESPOND_TOOL_NAME, input: { message: 'Here is the read.', suggestions: ['next'] } }, { inventory })
    expect(out.kind).toBe('final')
    if (out.kind === 'final') { expect(out.result.message).toBe('Here is the read.'); expect(out.result.suggestions).toEqual(['next']); expect(out.result.ok).toBe(true); expect(out.result.receipts).toEqual([]) }
  })
  it('rejects respond_to_writer with no/blank message as an error outcome (not a hollow pass-through)', () => {
    const out = dispatchTool({ id: 't3', name: RESPOND_TOOL_NAME, input: { message: '' } }, { inventory })
    expect(out.kind).toBe('error')
  })
  it('returns an error outcome for an unknown tool', () => {
    const out = dispatchTool({ id: 't4', name: 'askSpecialist', input: {} }, { inventory })
    expect(out.kind).toBe('error')
  })
})
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `tools.ts`:
  - Constants `READ_CONTEXT_TOOL_NAME='readProjectContext'`, `RESPOND_TOOL_NAME='respond_to_writer'`.
  - `MORGAN_TOOLS`: read tool (no required input; `{type:'object',properties:{},additionalProperties:false}`), respond tool (`message` required string; `suggestions`/`receipts`/`limits` optional string arrays).
  - `dispatchTool`: read tool → `{kind:'continue', toolUseId, content: JSON.stringify(inventory)}`; respond tool → validate `input.message` is a non-blank string → `{kind:'final', result:{message, suggestions: input.suggestions ?? [], receipts: [], limits: input.limits ?? [], ok:true}}`, else `{kind:'error', toolUseId, content:'respond_to_writer requires a non-empty message string'}`; unknown → `{kind:'error', toolUseId, content:'unknown tool: '+name}`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(morgan-runtime): tool specs, dispatcher, terminal validation`

## Task 3: Anthropic tool client (boxed provider)

**Files:**
- Create: `server/ai/morganRuntime/anthropicToolClient.ts`
- Test: `tests/server/morganRuntime/anthropicToolClient.test.ts`

**Interfaces:**
- Produces: `isAnthropicConfigured(): boolean`; helpers `userTurn(text)`, `assistantTurn(content)`, `toolResultTurn(toolUseId, content)` (return opaque Anthropic message objects); `sendToolTurn(input: { system: string; messages: unknown[]; tools: ToolSpec[]; maxTokens?: number }): Promise<ToolTurn>`

- [ ] **Step 1: Write failing tests** (mock `@anthropic-ai/sdk`, mirror `modelProvider.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const ctorCalls: Array<Record<string, unknown>> = []
const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic { messages: { create: typeof createMock }
    constructor(o: Record<string, unknown>) { ctorCalls.push(o); this.messages = { create: createMock } } }
  return { default: MockAnthropic }
})
import { sendToolTurn, isAnthropicConfigured, userTurn } from '../../../server/ai/morganRuntime/anthropicToolClient'
const savedEnv = { ...process.env }
beforeEach(() => { ctorCalls.length = 0; createMock.mockReset(); process.env.ANTHROPIC_API_KEY = 'k' })
afterEach(() => { process.env = { ...savedEnv } })

describe('anthropic tool client', () => {
  it('isAnthropicConfigured reflects the API key', () => {
    expect(isAnthropicConfigured()).toBe(true)
    delete process.env.ANTHROPIC_API_KEY
    expect(isAnthropicConfigured()).toBe(false)
  })
  it('sends system + messages + tools and parses tool_use blocks into ToolTurn', async () => {
    createMock.mockResolvedValue({ stop_reason: 'tool_use',
      content: [ { type: 'text', text: 'thinking' }, { type: 'tool_use', id: 'u1', name: 'respond_to_writer', input: { message: 'hi' } } ] })
    const turn = await sendToolTurn({ system: 'SYS', messages: [userTurn('hi')], tools: [{ name: 'respond_to_writer', description: 'd', input_schema: { type: 'object' } }] })
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ system: 'SYS', tools: expect.any(Array) }))
    expect(turn.stopReason).toBe('tool_use')
    expect(turn.toolUses).toEqual([{ id: 'u1', name: 'respond_to_writer', input: { message: 'hi' } }])
    expect(turn.text).toMatch(/thinking/)
  })
  it('constructs the client with an explicit timeout + retries', async () => {
    createMock.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }] })
    await sendToolTurn({ system: 's', messages: [userTurn('hi')], tools: [] })
    expect(ctorCalls[0]).toMatchObject({ timeout: expect.any(Number), maxRetries: expect.any(Number) })
  })
})
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `anthropicToolClient.ts`:
  - `isAnthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY)`.
  - Message helpers return plain Anthropic shapes: `userTurn(t) => ({role:'user', content: t})`, `assistantTurn(content) => ({role:'assistant', content})`, `toolResultTurn(id, c) => ({role:'user', content:[{type:'tool_result', tool_use_id:id, content:c}]})`.
  - `sendToolTurn`: construct `new Anthropic({ apiKey, timeout: 10*60*1000, maxRetries: 2 })`; `await client.messages.create({ model: process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-6', max_tokens: input.maxTokens ?? 1600, system: input.system, messages: input.messages, tools: input.tools, tool_choice: { type: 'auto' } })`; map `response.content`: collect `tool_use` blocks → `toolUses`, join `text` blocks → `text`; return `{ stopReason: response.stop_reason, toolUses, text, assistantContent: response.content }`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(morgan-runtime): boxed Anthropic tool client`

## Task 4: The loop runner

**Files:**
- Create: `server/ai/morganRuntime/runMorgan.ts`, `server/ai/morganRuntime/index.ts`
- Test: `tests/server/morganRuntime/runMorgan.test.ts`

**Interfaces:**
- Consumes: Task 1–3 exports
- Produces: `runMorgan(input: RunMorganInput): Promise<MorganRuntimeResult>` (re-exported from `index.ts`)

**Loop spec:** guard `isAnthropicConfigured()` → if false, return honest-error result (`ok:false`, message names the missing Claude backend, NOT "I'm here to help"). Else: seed `messages = [...history mapped, userTurn(userMessage)]`. Loop up to `MAX_ITERS = 4`: `turn = await sendToolTurn({system, messages, tools: MORGAN_TOOLS})`; if no `toolUses` (model answered in plain text without the terminal tool) → treat as malformed; for each toolUse dispatch — `final` → return result; `continue`/`error` → append `assistantTurn(turn.assistantContent)` then `toolResultTurn(id, content)` and continue loop. On malformed or exhausted iterations: **retry once** with a repair nudge appended (`userTurn('You must finish by calling the respond_to_writer tool with your answer.')`); if still no terminal → honest-error result (`ok:false`, names the malformed-output failure, not hollow filler). Wrap the whole thing in try/catch → honest-error on thrown API errors.

- [ ] **Step 1: Write failing tests** (mock the client module)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const sendToolTurn = vi.fn()
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', async (orig) => ({
  ...(await orig()), sendToolTurn, isAnthropicConfigured: () => process.env.ANTHROPIC_API_KEY ? true : false,
}))
import { runMorgan } from '../../../server/ai/morganRuntime/runMorgan'
const inv = { canSee: ['logline'], cannotSee: ['pixels'], canDoNow: ['read'], cannotDoYet: ['edit'] }
const inputBase = { systemPrompt: 'SYS', userMessage: 'hi', history: [], inventory: inv }
beforeEach(() => { sendToolTurn.mockReset(); process.env.ANTHROPIC_API_KEY = 'k' })

describe('runMorgan loop', () => {
  it('runs read tool then terminal respond, returning its message/suggestions', async () => {
    sendToolTurn
      .mockResolvedValueOnce({ stopReason: 'tool_use', text: '', assistantContent: [], toolUses: [{ id: 'a', name: 'readProjectContext', input: {} }] })
      .mockResolvedValueOnce({ stopReason: 'tool_use', text: '', assistantContent: [], toolUses: [{ id: 'b', name: 'respond_to_writer', input: { message: 'Showrunner read.', suggestions: ['s'] } }] })
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(true); expect(r.message).toBe('Showrunner read.'); expect(r.suggestions).toEqual(['s'])
    expect(sendToolTurn).toHaveBeenCalledTimes(2)
  })
  it('returns an honest error (not hollow filler) when Anthropic is unconfigured', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(false); expect(r.message).not.toMatch(/here to help/i); expect(r.message).toMatch(/configured|backend|Claude/i)
  })
  it('retries once on a no-terminal turn, then errors honestly if still no terminal', async () => {
    sendToolTurn.mockResolvedValue({ stopReason: 'end_turn', text: 'just text', assistantContent: [], toolUses: [] })
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(false); expect(r.message).not.toMatch(/here to help/i)
    expect(sendToolTurn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `runMorgan.ts` per the loop spec; prepend `renderReachContract(inventory)` to the system prompt is done by the caller (Task 5) — here the runner uses `input.systemPrompt` as-is. `index.ts` re-exports `runMorgan` + types.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(morgan-runtime): Claude tool-loop runner with retry + honest error`

## Task 5: Prompt tool-mode + Morgan delegation branch

**Files:**
- Modify: `server/ai/openaiService.ts` (`createPersonaSystemPrompt` ~813; `generatePersonaResponse` ~1003)
- Test: `tests/server/morganRuntime/morganDelegation.test.ts`

**Interfaces:**
- `createPersonaSystemPrompt(persona, userProfile, storyMemory, userMessage, voiceProfile?, responseMode?: 'json' | 'tool')` — default `'json'` keeps every existing call byte-identical. In `'tool'` mode the `writingPartner` branch replaces the trailing `IMPORTANT: Respond with JSON…` block with: `IMPORTANT: When you have what you need, you MUST finish by calling the respond_to_writer tool with { message, suggestions }. Do not answer in plain text.`
- `generatePersonaResponse`: at the top, `if (persona.id === 'writingPartner')` → build inventory + tool-mode prompt (prepend `renderReachContract`), call `runMorgan`, map `MorganRuntimeResult` → `PersonaResponse` (`{ message, suggestions }`), return. Else: existing path unchanged.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const runMorgan = vi.fn()
vi.mock('../../../server/ai/morganRuntime', () => ({ runMorgan }))
const providerCalls: string[] = []
vi.mock('../../../server/ai/modelProvider', () => ({
  createModelProvider: () => ({ name: 't', model: 't', isConfigured: () => true,
    generateResponse: vi.fn(async (i: { systemPrompt: string }) => { providerCalls.push(i.systemPrompt); return JSON.stringify({ message: 'specialist', suggestions: [] }) }) }),
}))
import { OpenAIService, createPersonaSystemPrompt } from '../../../server/ai/openaiService'
import { PERSONAS } from '../../../shared/personas'
// reuse userProfile()/storyMemory() helpers (copy from morganShowrunnerPrompt.test.ts)

beforeEach(() => { runMorgan.mockReset(); providerCalls.length = 0 })

describe('Morgan delegation', () => {
  it('routes Morgan through the runtime, not the single-shot provider', async () => {
    runMorgan.mockResolvedValue({ ok: true, message: 'runtime read', suggestions: ['x'], receipts: [], limits: [] })
    const r = await new OpenAIService().generatePersonaResponse(PERSONAS.writingPartner, 'reach?', userProfile(), storyMemory(), [])
    expect(runMorgan).toHaveBeenCalledTimes(1)
    expect(r.message).toBe('runtime read')
    expect(providerCalls).toHaveLength(0) // single-shot path NOT used for Morgan
  })
  it('still routes specialists through the existing single-shot provider', async () => {
    await new OpenAIService().generatePersonaResponse(PERSONAS.sam, 'logline?', userProfile(), storyMemory(), [])
    expect(runMorgan).not.toHaveBeenCalled()
    expect(providerCalls).toHaveLength(1)
  })
  it('tool-mode Morgan prompt instructs the respond_to_writer tool and drops the JSON closer; json-mode unchanged', () => {
    const toolP = createPersonaSystemPrompt(PERSONAS.writingPartner, userProfile(), storyMemory(), 'hi', undefined, 'tool')
    expect(toolP).toMatch(/respond_to_writer/); expect(toolP).not.toMatch(/Respond with JSON/i)
    const jsonP = createPersonaSystemPrompt(PERSONAS.writingPartner, userProfile(), storyMemory(), 'hi')
    expect(jsonP).toMatch(/Respond with JSON/i)
  })
})
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the optional `responseMode` param + Morgan branch in `generatePersonaResponse` (delegating to `runMorgan` with `buildReachInventory(storyMemory)` and the tool-mode prompt). Keep the existing try/catch outer guard.
- [ ] **Step 4: Run, verify pass + run `tests/server/morganShowrunnerPrompt.test.ts`** to confirm legacy json-mode assertions still pass (the headroom test calls Morgan via the service — update its mock expectation: Morgan now goes through `runMorgan`, so either mock `runMorgan` there or assert the specialist-only `maxTokens` path; adjust that test to keep it green).
- [ ] **Step 5: Commit** — `feat(morgan-runtime): delegate Morgan to the runtime; tool-mode prompt`

## Task 6: Acceptance proofs + full verification

**Files:**
- Test: `tests/server/morganRuntime/acceptance.test.ts`
- No source change unless a gap surfaces.

**Note:** LLM output is non-deterministic — acceptance tests prove *structure*, not literal strings (per the repo's testing discipline). The live "there she is" 4-question check is Ben's manual/browser pass at review.

- [ ] **Step 1: Write acceptance tests** (mock the client with scripted turns):
  - Reach question → the system prompt handed to `sendToolTurn` contains the derived reach block (`can see` / `cannot do yet`).
  - Malformed-output path → result `ok:false` and message is honest, never `/here to help/i`.
  - Runtime-used proof → Morgan path invokes `sendToolTurn`, not `createModelProvider().generateResponse`.
  - Specialist + Voice Profile suites remain green (run them).
- [ ] **Step 2: Run the full suite** — `npm run test:run` → all green.
- [ ] **Step 3: Typecheck** — `npm run check` → clean.
- [ ] **Step 4: Build** — `npm run build` → succeeds.
- [ ] **Step 5: Commit** — `test(morgan-runtime): acceptance proofs + M1 verification`
- [ ] **HOLD for Ben's review.** Do not open a PR or merge. Summarize what shipped, the new `ANTHROPIC_API_KEY` requirement, and the manual 4-question check to run live.

---

## Self-Review

- **Spec coverage:** thin adapter (untouched ✓), Claude-native + honest fail (Task 4 ✓), boxed provider (Task 3 ✓), loop+terminal tool (Tasks 2–4 ✓), substrate+one read tool, no specialist/web/edit (Tasks 2,6 ✓), derived reach (Task 1 ✓), no hollow fallback (Tasks 4,6 ✓), transcript/state untouched (no client changes ✓), existing green (Task 5 step 4 ✓).
- **Type consistency:** `MorganRuntimeResult`/`ReachInventory`/`DispatchOutcome`/`ToolTurn`/`RunMorganInput` defined in Task 1, consumed unchanged in 2–5.
- **Known follow-through:** Task 5 step 4 must adjust `morganShowrunnerPrompt.test.ts`'s headroom test, since Morgan no longer hits the single-shot provider. Flagged, not silent.
- **M2 preview:** add an `askSpecialist` read tool to `MORGAN_TOOLS` + a dispatcher case that calls the specialist persona; the loop, client, prompt, and route need no change. `/swarm` becomes a tool behind Morgan or a retired bridge — never a second identity.
```
