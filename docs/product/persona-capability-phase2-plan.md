# Persona Capability Layer — Phase 2 Task Breakdown

**Date:** 2026-05-13
**Status:** Draft for implementation alignment — updated with 2026-05-15 routing decision
**Scope:** First production slice of `docs/product/persona-capability-layer-prd.md`
**Slice:** Zoe + research/world-context, one allowlisted capability
**Branch context:** `feature/screenplay-editor-core`

---

> **Routing update (2026-05-15).** The PRD's "Routing Architecture Decision"
> (`docs/product/persona-capability-layer-prd.md` §Routing Architecture Decision)
> is the source of truth for upstream-agent choices. Zoe + `research_world_context`
> routes directly to the OpenSwarm **Deep Research Agent**, not the OpenSwarm
> Writing Partner. This keeps Zoe as the visible WriterOS collaborator while
> using the fastest matching OpenSwarm capability behind the scenes.

---

## 1. Goal And Scope

Prove visible persona continuity end-to-end with one specialist persona and one bounded capability. WriterOS owns routing. OpenSwarm runs the bounded task. Zoe synthesizes. Transcript stores Zoe's final answer plus a compact receipt; no raw OpenSwarm output, no OpenSwarm thread state.

Success in plain language: a writer @mentions Zoe with a research-shaped question, sees "Zoe is researching…" briefly, gets Zoe's voice in the reply, can click a small chip to see what context was sent and which sources were used. Doesn't see "OpenSwarm" anywhere. Doesn't see a second Zoe.

### In Scope

- New endpoint `POST /api/persona-capability/run` with explicit `personaId` in body.
- Single allowlisted capability path: `{personaId: 'zoe', taskKind: 'research_world_context'}`.
- Client routing: detect research-intent in Zoe-targeted messages, invoke capability path, otherwise fall through to standard `/api/wp-chat`.
- Minimum task-receipt UI inline in transcript (chip + expandable inspector).
- Completed Voice Profile only; world-context slice; receipt shows presence chip, never raw content.
- Source/citation discipline for research-backed claims.
- Failure, cancel, and timeout handling with in-voice fallback.
- Keep `/api/openswarm/writing-partner` and `/swarm` command running as the lower-level bridge and debug path; do not deprecate yet.

### Out Of Scope (Phase 2)

- Writer's Room specialist transcripts (Zoe in Writer's Room ignores capability routing for now).
- Any other persona/capability pair (Sam, Casey, Oliver, Maya, Alex, Writing Partner non-research).
- Image, Video, Document export capabilities.
- Persona-to-persona handoff.
- Multiple capability calls per turn.
- Retry on capability failure.
- Draft Voice Profile injection.
- Receipt persistence beyond what fits in existing `projectState` ChatMessage metadata.
- Cost/budget enforcement (telemetry only).
- Asset registry, generated files, attachments.
- Renaming or removing the existing `/api/openswarm/writing-partner` bridge or the `/swarm` command.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ Writer types: @zoe research the construction period of Damascus Gate… │
└─────────────────────────────┬──────────────────────────────────────────┘
                              │
                              ▼
       client/src/lib/wpRouting.ts  (existing)
       client/src/lib/personaCapabilityRouting.ts  (new)
       ┌──────────────────────────────────────────────────────┐
       │ classify({personaId:'zoe', message, activeTab})       │
       │   → 'direct' | 'capability:research_world_context'    │
       └──────────────────────────────────────────────────────┘
              direct ▼                                  ▼ capability
        /api/wp-chat (existing)            /api/persona-capability/run (new)
                                                       │
                                                       ▼
                                 server/persona-capability/runPersonaTask.ts
                                  - build sliced packet
                                  - call OpenSwarm transport
                                  - return PersonaTaskResult
                                                       │
                                                       ▼
                                  server openaiService.synthesize(
                                    personaId, userRequest, taskResult)
                                                       │
                                                       ▼
                                  { finalMessage, receipt }
                                                       │
                                                       ▼
                client transcript: addMessage('writingPartner', {
                  role:'assistant', text:finalMessage, speaker:'Zoe',
                  capabilityReceipt: receipt
                })
```

Key invariants enforced in code:

- Server never returns the raw OpenSwarm task result body to the client.
- Server discards OpenSwarm thread/assistant ids after synthesis.
- Client never writes a transcript message whose `text` is the raw task result.
- Receipt never contains Voice Profile text — only the slice name + presence flag.

---

## 3. Data Shapes

All new types live in `shared/personaCapability.ts` so client and server share validation.

### 3.1 Capability registry

```ts
// shared/personaCapability.ts
export type PersonaCapabilityId = 'research_world_context'  // Phase 2: only this

export interface PersonaCapabilityAllowlistEntry {
  personaId: 'zoe'              // Phase 2: only Zoe
  taskKind: PersonaCapabilityId
  voiceProfileSlice: 'world_context' | 'none'
  upstreamRecipient: 'Deep Research Agent'
  softTimeoutMs: number          // Phase 2 runtime: 240_000
}

export const PHASE_2_ALLOWLIST: readonly PersonaCapabilityAllowlistEntry[] = [
  {
    personaId: 'zoe',
    taskKind: 'research_world_context',
    voiceProfileSlice: 'world_context',
    upstreamRecipient: 'Deep Research Agent',
    softTimeoutMs: 240_000,
  },
] as const
```

Routing note: the original Phase 2 draft routed this task through OpenSwarm
Writing Partner. The implementation now routes directly to Deep Research Agent
for better capability fit and lower latency. Do not revert this in cleanup passes.

### 3.2 Request

```ts
export interface PersonaCapabilityRequest {
  personaId: 'zoe'                              // explicit, not derived from URL
  taskKind: PersonaCapabilityId                 // 'research_world_context'
  message: string                               // user request, stripped
  projectContext: ProjectContext                // reuse existing buildProjectContext output
  voiceProfile?: VoiceProfileDocument           // completed only; client must filter
  sourceSurface: 'writingPartner'               // Phase 2 only — Writer's Room rejected
  clientRequestId: string                       // uuid for cancel/idempotency
}
```

Validation: server Zod schema rejects any `{personaId, taskKind}` pair not in `PHASE_2_ALLOWLIST`. `sourceSurface !== 'writingPartner'` returns 400.

### 3.3 Response

```ts
export interface PersonaCapabilityResponse {
  finalMessage: string                          // Zoe's in-voice synthesis
  receipt: CapabilityReceipt                    // see below
  status: 'ok' | 'soft_fail' | 'timeout' | 'cancelled'
  // intentionally NO raw task result, NO OpenSwarm thread id
}
```

### 3.4 Receipt

```ts
export interface CapabilityReceipt {
  schemaVersion: 1
  taskKind: PersonaCapabilityId
  personaId: 'zoe'
  startedAt: string                             // ISO
  completedAt: string                           // ISO
  durationMs: number
  status: 'ok' | 'soft_fail' | 'timeout' | 'cancelled'
  contextChips: Array<                          // what was in the packet
    | 'logline' | 'synopsis' | 'storyBible' | 'characters' | 'scriptExcerpt'
  >
  voiceProfile: {
    included: boolean
    slice: 'world_context' | 'none'
    // NO raw fields — chip-only
  }
  missingSurfaces: Array<'logline' | 'synopsis' | 'storyBible' | 'characters'>
  sources: Array<{                              // present only when capability returned sources
    label: string                               // short user-readable name
    url?: string                                // optional; researcher returns when available
    citedInFinal: boolean                       // synthesizer flagged
  }>
  failureReason?: 'timeout' | 'upstream_error' | 'invalid_upstream' | 'aborted'
}
```

### 3.5 Transcript metadata

`shared/schema.ts` (or wherever `ChatMessage` lives) extends optionally:

```ts
export interface ChatMessage {
  // …existing fields…
  capabilityReceipt?: CapabilityReceipt   // optional; absent for direct answers
}
```

Migration: existing localStorage messages without the field are valid as-is; load path tolerates missing key. No version bump required (additive, optional).

---

## 4. File-By-File Implementation Plan

### 4.1 Shared

- **`shared/personaCapability.ts`** *(new)*
  Types above. Capability allowlist. Zod schema exports for runtime validation. Slice spec for `world_context`.

- **`shared/voiceProfile.ts`** *(edit)*
  Add `sliceVoiceProfile(profile, 'world_context'): Partial<VoiceProfileDocument>` returning only the world-context-relevant fields: `displayName`, `archetype`, `coreStatement`, `storytellingDNA.recurringThemes`, `influences.notes`, `visualLanguage.instincts`, `visualLanguage.notes`. Excludes character, dialogue, process, growth, Alex coaching notes.

- **`shared/schema.ts`** *(edit)*
  Add optional `capabilityReceipt?: CapabilityReceipt` to `ChatMessage`. Update Zod parser to accept-and-passthrough.

### 4.2 Server

- **`server/persona-capability/runPersonaTask.ts`** *(new)*
  Pure orchestration function: validate, slice profile, build upstream prompt, call OpenSwarm with `AbortController`, normalize result, throw typed errors. No Express coupling. Exports `runPersonaTask(req, deps)` for testability.

- **`server/persona-capability/buildResearchPrompt.ts`** *(new)*
  Build the OpenSwarm payload tuned for `research_world_context` with `recipient_agent: 'Deep Research Agent'`. Reuses the labeled-line builder pattern from `buildOpenSwarmWritingPartnerPrompt`. Requires structured output:
  ```
  TASK: world-context research
  REQUEST: <user message>
  RETURN:
    - "findings": 3–7 grounded bullets, each with a short source label
    - "sources": list of {label, url?} pairs used
    - "missing": items the writer should clarify if more depth needed
    - "no_speculation": refuse claims you cannot ground; mark them "unverified"
  Format: plain text. No persona banter. No invented citations.
  ```

- **`server/persona-capability/synthesize.ts`** *(new)*
  Calls `openaiService` with Zoe persona prompt + user request + parsed task findings + sliced Voice Profile. Synthesis prompt rules:
  - Must answer in Zoe's voice (world-building architect tone).
  - Inline cite any factual claim drawn from `findings` using a short `[label]` pointing to receipt sources.
  - Any `findings` entry marked `unverified` must either be omitted or labeled "not yet verified" in Zoe's reply.
  - Never invent sources. Never re-cite Voice Profile content.
  - Output ≤ 350 words by default.

- **`server/routes.ts`** *(edit)*
  Add `app.post('/api/persona-capability/run', …)` near the existing OpenSwarm bridge. Validates `personaCapabilityRequestSchema`, calls `runPersonaTask`, returns `PersonaCapabilityResponse`. On abort/timeout returns `{status:'timeout'|'cancelled', finalMessage: <persona-voice fallback>, receipt: {…}}` with HTTP 200 — failure is part of the contract, not an HTTP error, so the persona stays in voice.
  HTTP error codes only for malformed requests (400) and disallowed pairs (400).
  Leave existing `/api/openswarm/writing-partner` untouched.

- **`server/ai/openaiService.ts`** *(edit)*
  Add `synthesizePersonaCapabilityResponse({personaId, userRequest, taskFindings, voiceProfileSlice, sources})` returning `{finalMessage, citedLabels: string[]}` so the route knows which sources were `citedInFinal`.

### 4.3 Client

- **`client/src/lib/personaCapabilityRouting.ts`** *(new)*
  ```ts
  classifyZoeIntent(message: string): 'direct' | 'research_world_context'
  ```
  Heuristic for Phase 2:
  - Trigger `research_world_context` when message includes any of: `research|history|historical|period|construction|real-world|actually|true|fact|when was|where is|how did|what year|background on`.
  - Otherwise `direct`.
  - Conservative on purpose; mis-routes default to direct, never the other way.

- **`client/src/lib/postPersonaCapability.ts`** *(new)*
  Wraps `fetch('/api/persona-capability/run')` with an `AbortController` exposed to the caller for cancel. Times out client-side at 270s (server budget + buffer).

- **`client/src/lib/voiceProfile.ts`** *(edit)*
  Add `loadCompletedVoiceProfileSliced('world_context'): Partial<VoiceProfileDocument> | undefined` so the App never hands the raw profile to a capability call.

- **`client/src/App.tsx`** *(edit)*
  In `handleWPSend`, after `parseOpenSwarmCommand` and `parseMention`, if `personaId === 'zoe'` and `classifyZoeIntent(...) === 'research_world_context'`:
  - Build sliced profile.
  - POST capability request.
  - Show pending "Zoe is researching…" indicator (reuse `wpLoading` or add a typed pending state if the chip needs richer copy).
  - On success: `project.addMessage('writingPartner', makeMessage('assistant', response.finalMessage, 'Zoe', {capabilityReceipt: response.receipt}))`.
  - On `status: 'timeout'|'soft_fail'`: still write the in-voice fallback message and receipt; do not show a raw error.
  - On `cancelled`: write nothing to transcript; clear loading.
  - Fall through to existing `/api/wp-chat` for `direct`.
  Direct Writing Partner flow and `/swarm` flow unchanged.

- **`client/src/components/transcript/CapabilityReceiptChip.tsx`** *(new)*
  Compact pill rendered under an assistant message when `capabilityReceipt` is present.
  Pill text: `Research · {sources.length} sources · {status}`.
  Click opens `CapabilityReceiptInspector`.

- **`client/src/components/transcript/CapabilityReceiptInspector.tsx`** *(new)*
  Popover or side panel showing:
  - Task kind (human label, e.g. "World-context research").
  - Context chips: `Logline ✓ Story Bible ✓ Voice Profile (world-context slice) ✓ Missing: Synopsis`.
  - Sources: numbered list with optional links and a "cited in reply" indicator.
  - Duration, status, failure reason if any.
  - Voice Profile section is presence-only ("included · world-context slice"). No raw fields.
  - Copy: nowhere shows the string "OpenSwarm". User-facing label is "research pass" / "world-context research".

- **`client/src/components/shell/WritingPartnerPanel.tsx`** *(edit, or wherever messages render)*
  Render `CapabilityReceiptChip` under assistant messages that carry a receipt.

- **`client/src/lib/projectState.ts`** *(edit)*
  Ensure `addMessage` passes through `capabilityReceipt`. Storage tolerates older messages without the field.

### 4.4 Tests (file paths under `tests/`)

- `tests/shared/personaCapability.test.ts` *(new)* — allowlist validation, schema rejection of disallowed pairs.
- `tests/shared/voiceProfileSlice.test.ts` *(new)* — `world_context` slice contains only allowed fields; never includes character/dialogue/Alex notes.
- `tests/server/personaCapabilityRoute.test.ts` *(new)* — route contract: valid request → 200 with receipt; disallowed `{personaId, taskKind}` → 400; missing `personaId` → 400; raw OpenSwarm response is NOT in HTTP body; timeout path returns 200 with `status:'timeout'` and persona-voice `finalMessage`; cancel returns 200 with `status:'cancelled'` and no body content beyond receipt scaffold.
- `tests/server/personaCapabilitySynthesize.test.ts` *(new)* — synthesis respects citation discipline; unverified findings labeled or dropped; never re-cites profile content.
- `tests/server/openSwarmBridge.test.ts` *(unchanged)* — existing bridge still green.
- `tests/lib/personaCapabilityRouting.test.ts` *(new)* — `classifyZoeIntent` triggers on research vocabulary, conservative defaults to direct.
- `tests/components/CapabilityReceiptChip.test.tsx` *(new)* — renders chip; opens inspector; shows presence chip for VP without revealing raw fields.
- `tests/components/AppZoeCapability.test.tsx` *(new)* — end-to-end: @zoe research-intent message routes to capability endpoint (mocked), final transcript message contains only `finalMessage` plus receipt, raw upstream payload absent from transcript text.
- `tests/components/AppOpenSwarm.test.tsx` *(unchanged)* — `/swarm` still works.
- `tests/lib/voiceProfile.test.ts` *(extend)* — `loadCompletedVoiceProfileSliced` returns undefined when status !== 'complete'; world-context slice never leaks excluded sections.

---

## 5. Voice Profile Slice (`world_context`)

Included:

- `displayName`, `archetype`, `coreStatement`
- `storytellingDNA.recurringThemes`
- `influences.notes`
- `visualLanguage.instincts`, `visualLanguage.notes`

Excluded (Phase 2):

- `characterInstincts.*`
- `dialogue.*`
- `process.*`
- `strengths`, `growthEdges`
- `collaborationPreferences.*`
- `alexCoachingNotes`
- `influences.writers/directors/films/scenes` (raw lists)

Rationale: world-context research benefits from theme/tone/visual instincts, not from character psychology or dialogue rules. Smaller slice = lower leakage surface across the OpenSwarm boundary.

Receipt UI rule: chip shows `Voice Profile (world-context slice)`. Inspector never renders slice content. Raw profile is reachable only from the Voice Profile editor.

---

## 6. Citation Discipline

Server-side, in `synthesize.ts`:

1. If parsed task result has zero `sources`, the synthesis prompt is told "no source-backed claims may be presented as fact." Zoe responds from project context + general craft knowledge only and the receipt's `sources` array stays empty.
2. If sources exist:
   - Synthesis includes `[label]` inline next to each factual claim drawn from the findings.
   - Any finding tagged `unverified` by the upstream task is either omitted or labeled "not yet verified" in Zoe's voice.
3. Synthesizer returns `citedLabels`; route stamps `citedInFinal: true` on matching `receipt.sources` entries.
4. Acceptance test: synthesis prompt eval where upstream returns 2 unverified + 1 sourced — final must cite only the sourced one; unverified must not appear as fact.

---

## 7. Failure, Cancel, Timeout

All three resolve as HTTP 200 with a populated `receipt.status` and a persona-voice `finalMessage`. The persona never tells the user "OpenSwarm failed".

| Condition | Trigger | Server behavior | Client behavior |
| --- | --- | --- | --- |
| Upstream error | OpenSwarm returns non-2xx or invalid body | Build receipt with `status:'soft_fail'`, `failureReason:'upstream_error'`. Synthesize a Zoe-voice fallback using project context + sliced profile; no source claims. | Write fallback message to transcript with receipt chip showing `soft_fail`. |
| Timeout | 240s soft timeout in `runPersonaTask` (AbortController) | Abort upstream fetch; same synthesis path with `status:'timeout'`. | Same as above; chip shows `timed out`. |
| Client cancel | User cancels via UI (Escape / cancel button) | Receive client abort signal; cleanup; return `status:'cancelled'` with empty `finalMessage`. | Do NOT write any transcript entry. Clear loading. Discard receipt. |
| Disallowed pair | `personaId/taskKind` not in allowlist | HTTP 400 (programmer error, not a normal-flow case). | Surface as console warning; do not write to transcript. |

Server logs failure details (upstream status, body excerpt) for debugging — not echoed in response.

---

## 8. Test Plan And Acceptance Criteria

### Acceptance criteria (gate Phase 2 merge)

1. `@zoe` + research-intent message routes to `/api/persona-capability/run`; non-research `@zoe` continues to use `/api/wp-chat`.
2. Final transcript message text equals the synthesized response only. Raw upstream task body appears nowhere in the transcript.
3. Receipt is attached to the assistant message; chip renders under it; inspector opens.
4. Inspector shows `Voice Profile (world-context slice)` as a presence chip; raw VP content is not present in inspector DOM.
5. Two consecutive `@zoe research…` calls produce two independent OpenSwarm requests with no thread id reuse (assert via mocked transport: each call constructs fresh `chat_history: []`, no thread id passed back into next call).
6. Capability call exceeding the 240s server budget returns `status:'timeout'`, persona-voice fallback present, transcript entry written, chip says `timed out`.
7. User cancels mid-flight: no transcript entry written, no orphan loading state.
8. Disallowed `{personaId:'sam', taskKind:'research_world_context'}` returns 400.
9. Disallowed `sourceSurface:'writersRoom'` returns 400.
10. The string `OpenSwarm` does not appear in any rendered user-facing component (grep test against component output in `tests/components/CapabilityReceiptChip.test.tsx` and `AppZoeCapability.test.tsx`).
11. Existing `/swarm` command flow remains green (`AppOpenSwarm.test.tsx`, `openSwarmBridge.test.ts` unchanged and passing).
12. With incomplete Voice Profile (status !== 'complete'), capability request body's `voiceProfile` is `undefined`; receipt's `voiceProfile.included` is `false`.
13. Synthesis with zero upstream sources never emits factual citation; receipt `sources` is `[]`.
14. Synthesis with mixed verified/unverified findings cites only verified; unverified either dropped or labeled in-voice.
15. `npm test` and `npm run build` green.

### Smoke-test script (manual QA)

1. Empty project + completed VP. `@zoe` "describe the gate" → direct `/api/wp-chat`. No receipt chip.
2. Empty project + completed VP. `@zoe` "research the construction period of Damascus Gate" → capability route. Receipt chip shows `Missing: Synopsis, Story Bible, Characters`.
3. Project with logline + Story Bible. Same research request → receipt chips include `Logline`, `Story Bible`. Final message in Zoe's voice with bracketed citations.
4. Mid-flight cancel by clicking cancel — no transcript line.
5. Disable OpenSwarm server (simulate upstream error) → fallback Zoe message + `soft_fail` chip.

---

## 9. Migration / Compatibility With Existing `/swarm` Bridge

Coexistence rules:

- `/api/openswarm/writing-partner` remains the lower-level transport for the `/swarm` debug command only. Phase 2's `runPersonaTask` calls the same OpenSwarm FastAPI endpoint (`/open-swarm/get_response`) directly with `recipient_agent: 'Deep Research Agent'` for `research_world_context`. No shared HTTP code between the two routes yet — extraction comes later when there are 2+ capabilities.
- `/swarm <text>` continues to work, continues to call `/api/openswarm/writing-partner`, continues to label messages "Writing Partner (OpenSwarm)". Treat that label as developer-only — do not change it in Phase 2 (changing it is a separate one-line copy edit; out of scope here).
- `parseOpenSwarmCommand` still wins over capability routing: a literal `/swarm research …` skips the new path. Documented as the developer escape hatch.
- No deprecation timer in Phase 2. Deprecation criteria are written in the PRD; they fire after Phase 3 (capability expansion).

Backwards compatibility:

- `ChatMessage.capabilityReceipt` is additive and optional. Old localStorage state loads unchanged.
- No existing test should require updates beyond adding new tests. Existing `AppOpenSwarm.test.tsx` and `openSwarmBridge.test.ts` must stay green; that is itself an acceptance criterion.

---

## 10. Telemetry (Lightweight, Phase 2)

Server-side console log on each capability call:

```
[persona-capability] personaId=zoe taskKind=research_world_context
  status=ok durationMs=12483 sources=3 contextChips=4 vpIncluded=true
```

No PII, no message text, no profile content. Used to inform Phase 3 budget decisions.

---

## 11. Risks Specific To Phase 2

- **Heuristic mis-routes.** A research-shaped message that doesn't need research adds latency. Mitigation: conservative trigger vocabulary; non-research `@zoe` is the default.
- **Synthesis voice drift.** Zoe synthesizer might sound generic after consuming a structured task report. Mitigation: synthesis prompt anchors on Zoe's persona block from `shared/personas.ts`; eval test asserts persona-tone markers.
- **Voice Profile slice still leaks.** Even sliced fields could feel personal. Mitigation: explicit allowlist constant in `shared/personaCapability.ts`; slice function is the only producer; test asserts slice excludes everything else.
- **Receipt clutter.** A chip under every research answer might fatigue users. Mitigation: chip is small, single line, click-to-expand only. Hide entirely on hover-rest after first use → defer that polish to Phase 4.
- **OpenSwarm upstream gets called twice in dev** if `/swarm` and capability routes are both invoked rapidly. Mitigation: not a real issue at Phase 2 scale; document for Phase 3 when budget enforcement lands.

---

## 12. Non-Goals (Phase 2)

- No autonomous routing across capabilities.
- No persona-to-persona handoff.
- No Writer's Room capability calls.
- No Image, Video, Document capabilities.
- No deprecation of `/swarm` or `/api/openswarm/writing-partner`.
- No backend storage redesign; receipts live in `ChatMessage` in localStorage.
- No multi-call concurrency per persona; one capability call per user turn.
- No retry on failure.
- No draft Voice Profile injection.
- No project mutation from capability output.
- No source/citation enforcement on direct (non-capability) answers.
- No new asset types or generated files.
- No renaming of the existing OpenSwarm bridge route.

---

## 13. Recommended Build Order

1. Land `shared/personaCapability.ts` + slice helper + tests.
2. Land server orchestration + route + server tests with OpenSwarm transport mocked.
3. Land client classifier + post helper + capability routing tests.
4. Wire `App.tsx` capability branch behind a runtime flag (`window.__WRITEROS_ENABLE_CAPABILITY_PHASE2__`); ship green tests.
5. Land receipt chip + inspector + component tests; verify presence-only VP rule.
6. End-to-end `AppZoeCapability.test.tsx`.
7. Manual smoke per §8.2.
8. Flip flag on by default; remove flag in a follow-up commit when smoke-tested.
9. Commit: `feat(persona-capability): Phase 2 — Zoe research/world-context capability path`.
