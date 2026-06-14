# Plan — Voice Profile conditions persona chat (Slice: P1 + P2)

> STATUS: AWAITING BEN'S APPROVAL. Codex-reviewed twice (sound in substance). P1 ready to implement on Ben's sign-off; P2 held until Ben supplies register text + D.1 decision. No branch, no code yet.
> Current branch at planning time: `feature/story-bible-composer`.

## Goal

Make the writer's Voice Profile actually condition persona chat.

- **P1:** Thread the `VoiceProfileDocument` into the persona system prompt so it shapes every persona conversation.
- **P2:** Replace the hardcoded "Warm and encouraging" personality block with the writer's register (exact register text supplied by Ben before implementation — placeholder below).

**Scope:** persona CHAT surface only. Document compose (`server/compose/`) is OUT of scope.

---

## A. Audit verification — confirmed vs corrected

**Confirmed:**
- `createPersonaSystemPrompt` (`server/ai/openaiService.ts:734`) takes `Persona, AssessmentProfile, StoryMemory, userMessage` only — no `VoiceProfileDocument`. Still emits hardcoded `- Warm and encouraging, but specific and actionable` (`:744`). This is the gap.
- `profileLinesForCapability` (`:637`) formats a profile into prompt lines — pattern to mirror.
- Capture + synthesis intact: `shared/voiceProfile.ts`, `buildSynthesisPrompt` (`:30`).
- Profile lives in browser localStorage (`writeros_voice_profile_v1`, `shared/voiceProfile.ts:3`). Server never has it on a chat request.

**Corrected / refined:**
1. The client→API→server path for `voiceProfile` already exists — but only for the OpenSwarm/capability route, NOT chat. `openSwarmWritingPartnerSchema` (`routes.ts:380`) already accepts `voiceProfile`; `routes.ts` already has a full-doc renderer `buildVoiceProfileLines` (`:655`) and a reusable `voiceProfileDocumentSchema` (`:321`). The wp-chat CHAT path (`wpChatSchema:370` → `generatePersonaResponse` → `createPersonaSystemPrompt`) does not. We are extending an established pattern, not inventing one.
2. `sliceVoiceProfileForWorldContext` is too narrow for chat. It drops dialogue rules, collaboration prefs, feedback style, archetype detail — exactly the register-shaping fields P2 needs. Send the full `VoiceProfileDocument`, render a focused subset server-side. Do not reuse that slice here.
3. Audit's test claim is wrong. There is no golden/snapshot test of the persona system prompt; "Warm and encouraging" appears in zero tests. The only byte-identity guard is for the surface block (`renderSurfaceAwareness`, `openaiService.test.ts:639`). Nothing breaks — we only ADD tests.

---

## B. Resolved data path (recommended)

Mirror the `surface` precedent + the OpenSwarm sibling shape. Add `voiceProfile` as a top-level sibling of `projectContext` in the wp-chat payload (NOT inside projectContext — profile is "the writer," projectContext is "the project").

```
client/src/App.tsx  (handleWPSend :636 + specialist :655)
  loadCompletedVoiceProfile()              ← already imported, App.tsx:8
  → postWPChat({ ..., voiceProfile })       ← App.tsx:62 (extend body type)
  → POST /api/wp-chat
server/routes.ts
  wpChatSchema.parse                        ← add voiceProfile field (:370)
  → generatePersonaResponse(persona, msg, userProfile, storyMemory, history, voiceProfile)  ← :967
server/ai/openaiService.ts
  generatePersonaResponse                   ← add param (:890), pass through
  → createPersonaSystemPrompt(..., voiceProfile)  ← add param (:734)
  → renderVoiceProfileForPersona(voiceProfile)    ← NEW exported helper
```

**Options considered:**
- **Option A (RECOMMENDED):** top-level `voiceProfile` sibling in `wpChatSchema`, new optional arg through the call chain. Reuses `voiceProfileDocumentSchema` (`:321`). Doesn't touch `StoryMemory` or `projectContext` shape. Matches `openSwarmWritingPartnerSchema`.
- Option B: thread via `projectContext` → map into `StoryMemory.voiceProfile` (like `surface`). Rejected — pollutes project-shaped `StoryMemory` with a writer-identity concern; bigger blast radius.
- Option C: server loads profile itself. Impossible — localStorage only. Rejected.

---

## C. Files to touch + specific change

**1. `server/ai/openaiService.ts`**
- `createPersonaSystemPrompt` (`:734`): add param `voiceProfile?: VoiceProfileDocument` (type already imported `:2`).
- **Single shared focused-subset renderer (no third renderer).** There are already two profile renderers — `buildVoiceProfileLines` (`routes.ts:655`, full doc, OpenSwarm) and `profileLinesForCapability` (`openaiService.ts:637`, focused subset). Do NOT add a third. Plan: extract the focused-subset logic currently inside `profileLinesForCapability` into one module-level helper `renderVoiceProfileSubset(profile?: VoiceProfileDocument): string` in `openaiService.ts` (its **home**), have `profileLinesForCapability` delegate to it, and have the persona-chat block reuse the same helper. Returns `''` when no profile; truncates fields. `buildVoiceProfileLines` (full doc) stays as-is — different shape, different purpose.
- **Slice 1 = ONE shared subset for all personas.** No persona-keyed tailoring (Maya→dialogue, Casey→character instincts, etc.) in this slice — deferred to a follow-up. Reason: smaller blast radius, simpler test matrix, spine wired sooner.
- Keep the helper module-private; do NOT export just for test convenience (see F — provider capture covers it). Export only if provider capture proves insufficient.
- In `basePrompt`: **P2** — replace static line `:744` with a conditional:
  - profile present → register block (see D) + a VOICE PROFILE block from the helper;
  - profile absent → exact current `- Warm and encouraging, but specific and actionable` line and NO voice block.
- `generatePersonaResponse` (`:890`): add trailing optional param `voiceProfile?`, forward to `createPersonaSystemPrompt` (`:898`).

**2. `server/routes.ts`**
- `wpChatSchema` (`:370`): add `voiceProfile: voiceProfileDocumentSchema.optional().catch(undefined)` — reuse existing schema (`:321`); `.catch(undefined)` so a malformed profile is advisory and never 500s chat (same rule as `surface`, `:263`).
- wp-chat handler (`:967`): pass `data.voiceProfile` as the new 6th arg.
- Note: `/api/chat` legacy handler (`:853`) also calls `generatePersonaResponse`; new param optional → that path unchanged (omits it).

**3. `client/src/App.tsx`**
- `postWPChat` body type (`:62`): add `voiceProfile?: VoiceProfileDocument` (type imported `:30`).
- Both send sites — `handleWPSend` (`:636`) and Writer's Room specialist (`:655`): add `voiceProfile: loadCompletedVoiceProfile()` (imported `:8`). Both sites must get it or left-rail and Writer's Room diverge.

**4. Tests** — see E.

---

## D. P2 register block injection — PLACEHOLDER

**P2 is BLOCKED on Ben — held.** P1 (the data path + shared subset block) can ship independently once approved. Do not implement the register block until Ben supplies (a) exact register text and (b) the D.1 decision. Keep the placeholder; invent nothing.

Register block gated entirely behind "profile present." Exact wording from Ben:

D.1 RESOLVED: **LITERAL constant** — house stance, identical for every writer. Per-writer voice is carried by the P1 subset block; the register instructs the persona to honor the profile's collaboration prefs / feedback style, not interpolate them. Register text (final, supplied by Ben 2026-06-14):

```
YOUR STANCE — an elite specialist in service of the work:
- You're a working professional at the top of your craft, brought in to serve a serious writer. Treat them as a peer, never a student.
- Earn trust through precision and judgment, not reassurance. No cheerleading, no praise as filler. If something works, say why in one line and move on.
- Say the hard thing plainly. A soft beat, a cliché, a page that isn't earning its place — name it directly. Withholding the real note to be nice is a failure of service.
- Hold strong opinions, offer them without hedging, then defer. The writer holds the pen; you serve their vision, not your taste. When you disagree, make the case once, clearly, and let them decide.
- Signal over volume. Respect their time and intelligence; don't restate what they already know.
- Adapt your directness to the writer's stated collaboration preferences and feedback style; honor what they said they want and don't want.
```
This block is emitted ONLY when a completed profile is present, replacing the `- Warm and encouraging...` line.

**P2 decisions:**
1. (OPEN — Ben to decide) Is the register a **literal constant** or **interpolated**?
   - **Literal** = a house stance, identical wording for every writer. (Per-writer voice already comes from the P1 subset block, so the register can be a fixed editorial posture.)
   - **Interpolated** = the register itself bends per writer, pulling profile fields (e.g. `collaborationPreferences.feedbackStyle`, `archetype`) into the wording.
2. (RESOLVED) Register replaces ONLY the `- Warm and encouraging...` line (`:744`). The `userProfile.feedbackStyle` line (`:745`) stays unchanged, to preserve existing behavior for this slice.

---

## E. Backward compatibility — guarantee

Single guard: `voiceProfile` is optional end-to-end, defaults `undefined`. In `createPersonaSystemPrompt`, the `else` branch (no profile) emits the exact current string and NO voice/register block → output byte-identical to today. The wp-chat payload omits the key when localStorage has no completed profile (`loadCompletedVoiceProfile()` returns `undefined`). `/api/chat` never passes it.

Locked by an explicit byte-identity test (below), modeled on the F1 surface guard.

---

## F. Test impact + plan

No existing test breaks (no persona-prompt snapshot exists). ADD:
- `tests/server/openaiService.test.ts`:
  - **byte-identity guard (no profile)**: since `createPersonaSystemPrompt` is private, capture the `systemPrompt` by mocking `createModelProvider()` and driving through `generatePersonaResponse` — assert the prompt with no profile is byte-identical to today. Do NOT make internals public for test convenience. (Export a narrow builder ONLY if provider capture proves insufficient.)
  - profile supplied → shared subset voice block present, key fields rendered/truncated. (No persona-specificity assertions — Slice 1 renders one shared subset for all personas.)
  - `profileLinesForCapability` still produces its current output after delegating to the extracted `renderVoiceProfileSubset` (no-regression on the capability path).
- `tests/server/wpChatRoute.test.ts` (spy pattern at `:242`, capture arg via `generateSpy.mock.calls[0]`):
  - profile in payload → forwarded as new `generatePersonaResponse` arg;
  - malformed profile → degrades to `undefined`, route still 200 (mirror `:313`);
  - no profile → arg `undefined`.
- NEW file `tests/components/AppVoiceProfileChat.test.tsx` (dedicated, not folded into AppSurfaceAwareness):
  - normal `/api/wp-chat` includes the FULL completed profile;
  - draft/incomplete profile is omitted from the wp-chat payload;
  - Zoe research capability still sends ONLY the `world_context` slice (no regression to the existing capability path).

Verification gate (CLAUDE.md): `npm run test:run`, `npm run check`, `npm run build`; then live-verify (dev server needs `tsx watch` restart — already in place per PR #29).

---

## G. Risks
- Prompt bloat: full doc is large. Mitigate — helper renders a focused subset + truncates (like `profileLinesForCapability`). System-prompt growth only; response `maxTokens` 800 unaffected.
- Two send sites drift: both `:636` and `:655` must get the profile. Covered by tests.
- `/api/chat` shared callee: optional param keeps it unchanged — verify in test.
- P2 semantics unresolved (D.1/D.2) — blocks only the register wording, not P1 plumbing.
- **Privacy (conscious decision, not silent):** the full `VoiceProfileDocument` now leaves the browser on every persona chat request. This is already true for the OpenSwarm path; recording it here as a deliberate, accepted decision for the chat path too.

---

## H. Proposed branch (create at implementation, after approval)
`feature/voice-profile-persona-chat`
