# Writers' Room Intake — Architecture Spec / PRD

Status: DRAFT (spec only — no implementation until the design gate clears)
Scope: schema + coverage contract + field-landing map. Question-writing is a separate pass.
Related: `docs/plans/voice-profile-persona-chat.md` (P1 — independent track)
Canonical contract: `shared/voiceProfile.ts` → `VoiceProfileDocument` (UNTOUCHED)

---

## 1. What this is

The Writers' Room reframes Voice Profile capture from a static form into a sequence of
per-agent interviews. You "meet the room" — each specialist interviews you on questions in
their domain — and the session produces the **same canonical `VoiceProfileDocument`** the
form produces today.

It is the *future* intake. It does not replace or block P1, which wires the current
form-captured profile into persona chat. The room is a new **producer** of an artifact P1
already **consumes**. They meet at the document contract and nowhere else.

---

## 2. Locked decisions (do not relitigate)

1. `VoiceProfileDocument` is the canonical consumed contract and stays **untouched**. The
   room is a producer of this artifact, not a new store.
2. **Capture/store separation.** The capture layer (what each agent asks) is freely
   redesignable per agent. The storage layer (canonical doc fields) is fixed. Ownership
   means *who asks* and *who reads it back* — never write arbitration.
3. **Single end-of-room synthesis** (one pass over all answers → one doc). Per-agent live
   synthesis is deferred (see §12).
4. **No creative choices made for the writer.** The room elicits; the writer holds the pen.
5. **Oliver lands in `storytellingDNA.principles`.** No `storyStructureDNA` section. Once
   the shared core owns themes (`recurringThemes`) and Oliver owns `principles`, that field
   narrows to structure by ownership — no rename, no new field. Tripwire in §12.
6. **Design-approval gate.** No Claude Code implementation begins until the HTML design
   presentation is approved. See §11.
7. Theater sits on top of real elicitation, never instead of it. Skippable on return.

---

## 3. The model: capture-by-agent → store-by-agent → consume-by-agent

Three layers, with deliberately different rules:

- **Capture** — each agent interviews the writer in its domain. Fully authored per agent.
  Theater lives here. No partitioning constraints.
- **Synthesis** — one pass reads the *union* of all answers and emits one
  `VoiceProfileDocument`. Because it is a single pass, no two agents can clobber a field;
  "overlap" between agents is harmless.
- **Consume** — each persona reads the slice it cares about through a selector, exactly as
  `sliceVoiceProfileForWorldContext` already does for Zoe today.

Structurally: a **shared core** every agent needs (why-you-write, archetype, recurring
themes, humor/tone stance, collaboration baseline), drawn out by the host (the existing
`writingPartner` generalist persona), **plus** specialist branches each agent owns. Shared
spine, specialist branches. Do not over-fragment.

---

## 4. Agent → field-landing map (the contract)

"Captures" is the domain an agent interviews on (free to author). "Lands in" is the fixed
canonical field its answers synthesize into. "Reads back" is the section it narrates during
the room's closing beat.

| Agent | Role today | Captures | Lands in (`VoiceProfileDocument`) |
|---|---|---|---|
| Host (`writingPartner`) | Creative Director | inward why, archetype, recurring themes, humor/tone stance, collaboration baseline | `coreStatement`, `archetype`, `creativeNorthStars`, `storytellingDNA.recurringThemes`, `collaborationPreferences` |
| Sam | Synopsis Specialist | outward/market why, influences, positioning, comps | `influences.*`; sharpens market-facing `coreStatement` |
| Casey | Character Psychologist | character instincts, who-you're-drawn-to / reject, both-sides instinct | `characterInstincts.*` |
| Maya | Dialogue & Voice Coach | spoken voice, subtext, bad-prose-in-dialogue | `dialogue.*` |
| Oliver | Story Structure Editor | endings, act breaks, pacing, structural principles | `storytellingDNA.principles` |
| Zoe | World-Building Architect | page voice (action prose), visual instincts, world/lore/accuracy instincts | `visualLanguage.*`; world-instinct overflow → `storytellingDNA.notes` |
| Alex | Draft Coach | process, when-flowing, stuck patterns, support needs, collaboration specifics | `process.*`, `collaborationPreferences` (merged with host), `alexCoachingNotes` |

Notes on the seams:
- **Host vs. Sam on "the why":** inward (host) vs. outward/market (Sam). Two altitudes of
  one question; single synthesis merges them. Not a conflict.
- **Humor/tone** is shared-core (host), not Maya or Casey.
- **Action prose is Zoe, not Maya.** Maya = spoken voice (what characters say). Zoe = page
  voice (how the page reads when no one's talking). The doc already files action-prose under
  `visualLanguage.instincts` ("visual *or prose* instinct"), so this matches the schema.
- **Zoe has no `worldRules` field in the profile** — `worldRules` is project-level
  (`StoryMemory`), not writer-level. Zoe's *world* questions capture the writer's
  instincts/limits (e.g. "how much lore is too much"), which land in `visualLanguage.notes`
  or `storytellingDNA.notes`, not in any project's world.
- **`strengths` / `growthEdges`** are not owned by any single agent. They are
  **synthesis-derived** from the whole transcript. Flagged in §5.

---

## 5. Coverage contract (the discipline that keeps the room honest)

The danger of a beautiful room is that it produces a *thinner* profile than the boring form
did. The coverage contract prevents that: **the union of all agents' questions must feed
every canonical field that has a live or planned consumer.**

Every field in `VoiceProfileDocument` is classified as exactly one of:

- **agent-captured** — at least one agent's questions feed it (per §4 map). Most fields.
- **synthesis-derived** — produced by the synthesis pass reading the whole transcript, not
  asked directly: `strengths`, `growthEdges`, `archetype` (host frames it, synthesis names
  it), `*.notes` free-text summaries.
- **optional/cosmetic** — `displayName`, timestamps, `version`.

### Room question manifest (the machine-checkable artifact)

The coverage contract is only enforceable if the question→field mapping is *data*, not prose.
Phase 1 authors a **room question manifest**: an explicit list where every room question
declares which canonical fields it feeds. The coverage test reads this manifest — it never
parses §4 or any narrative.

Each manifest entry includes at minimum:

```
RoomQuestion = {
  id: string                 // stable question id (the synthesis answer key)
  agentId: string            // owning agent (host | sam | casey | maya | oliver | zoe | alex)
  prompt: string             // the question text / label shown to the writer
  targetFields: string[]     // VoiceProfileDocument dot-paths this question feeds
                             //   e.g. ['influences.directors', 'coreStatement']
  synthesisLabel: string     // human label fed to SYNTHESIS_QUESTION_LABELS (see §6)
  depth?: 'thin' | 'solid' | 'rich'   // optional: expected/required coverage depth
  theater?: Record<string, unknown>   // optional: per-question staging/theater metadata
}

RoomQuestionManifest = RoomQuestion[]
```

`targetFields` is the load-bearing field: it is the dot-path set the coverage test asserts
against. Synthesis-derived and optional/cosmetic fields (see classification above) are
exempt by their classification, not by absence from the manifest.

Acceptance rule for the question-authoring pass (§ Phase 1): no **agent-captured** field may
ship with zero questions pointing at it. The coverage check (test) asserts that **every
agent-captured field in the §4 landing map appears in at least one manifest entry's
`targetFields`**. The test derives coverage strictly from the manifest data — it does **not**
infer coverage from this spec's prose or from the §4 table. This is the gauge that proves the
room captures at least what the form did.

---

## 6. Synthesis

Reuse the existing single-pass model in `server/ai/openaiService.ts`
(`buildSynthesisPrompt` → `parseSynthesisResponse`). The room collects answers into the
same `answers: Record<string, string>` shape used today; synthesis reads the union and
emits one `VoiceProfileDocument`.

The only synthesis-side change: `SYNTHESIS_QUESTION_LABELS` is currently keyed `q1`–`q20`.
The room's new per-agent questions get their own IDs, so the label map must be extended (or
generalized to accept a passed-in label map). `parseSynthesisResponse` is **unchanged** — it
parses the document shape, which is not changing, not the question keys.

---

## 7. Provenance / coverage index (the legibility layer)

Separate from `VoiceProfileDocument` (decision 1 keeps the doc untouched). A sibling
structure computed at capture time:

```
RoomCoverage = {
  [agentId]: {
    answeredCount: number
    depth: 'thin' | 'solid' | 'rich'
    lastTouchedAt: string
  }
}
```

This powers "which agents know you well vs. thin" — a thin Maya pass flags weak dialogue
support. It is never read by personas as content; it is UI/legibility metadata only.

---

## 8. Data model & storage

- **Canonical doc:** unchanged.
- **`VoiceProfileState`** (existing, `shared/voiceProfile.ts`) currently holds
  `{ version, status, answers, deepDiveAnswers?, refinementAnswers?, profile?, ... }`. The
  room reuses `answers` (new keys) and adds an optional `roomCoverage?: RoomCoverage`.
  Additive and backward-compatible.
- **Preservation rule for `roomCoverage`.** Any code path that rewrites `VoiceProfileState`
  must **preserve** an existing `roomCoverage` unless the writer explicitly clears/resets the
  Voice Profile. `roomCoverage` is not derivable from the canonical doc, so a state rewrite
  that drops it silently destroys legibility metadata. **Implementation-risk areas:** the
  current fallback drawer/form write paths rebuild `VoiceProfileState` objects from scratch
  (form save, draft-answer persistence, reset/clear flows) — these must carry `roomCoverage`
  through rather than constructing fresh state that omits it. Resetting/clearing the profile
  is the *only* sanctioned path that may drop it.
- **localStorage key unchanged** (`writeros_voice_profile_v1`) so existing profiles load
  untouched.
- **Server/P1 path untouched:** the client still sends `voiceProfile` as a top-level sibling
  in `wpChatSchema`. The room changes only *how the profile was made*, never its shape or
  transport.

---

## 9. Migration from the form

The cleanest migration is the one that doesn't try to be clever. Because the room produces
the same `VoiceProfileDocument`, existing profiles stay valid and consumed — no remap needed.

- **Complete profile** (`status: 'complete'`): the room enters **readback mode** on return.
  It does not re-interview. It narrates "here's the writer we think you are" from the stored
  doc. (This is the "skippable on return" guardrail.)
- **Partial form answers** (`status: 'draft_answers'`, keyed `q1`–`q20`):
  - existing `q1`–`q20` draft answers **remain in the old form fallback** — they are not
    moved, deleted, or rewritten by the room;
  - they **may still be synthesized** through the existing endpoint if the writer chooses to
    finish via the form path;
  - the room does **not** auto-map old `q` keys onto the new agent questions (the new
    questions are authored fresh; a 1:1 remap would be lossy theater);
  - if old answers are surfaced during room rollout, they are **legacy context, not completed
    room coverage** — they do not satisfy the §5 coverage contract and do not populate
    `roomCoverage`. A writer who wants the room experience runs it fresh.
- **The old form stays as a fallback/skip path** during rollout. It is not deleted until the
  room is proven (§11, Phase 3).

`VoiceProfileDrawer.tsx` (review/edit UI) can remain **unchanged for display** — it reads the
same `VoiceProfileDocument`, which is not changing. The caveat is on writes, not reads: any
state-write path it (or the form) triggers must preserve `roomCoverage` per the §8
preservation rule. Add tests asserting that preservation when those write paths are
implemented.

---

## 10. Repo plug-in points (grounded against current code)

- `shared/voiceProfile.ts` — `VoiceProfileDocument` **untouched**. Add additive room types
  (`RoomCoverage`, agent-segment definitions) as new exports. Extend `VoiceProfileState`
  with optional `roomCoverage?`.
- `client/src/lib/voiceProfileAssessment.ts` — current 7-section/20-Q form definition.
  **Leave intact** as the fallback. Author the room's per-agent question sets in a new
  sibling module (e.g. `client/src/lib/voiceProfileRoom.ts`) so the form keeps working.
- `client/src/components/` — new room UI components (visuals driven by the approved design
  presentation). The form components and `VoiceProfileDrawer` stay.
- `server/ai/openaiService.ts` — extend `SYNTHESIS_QUESTION_LABELS` to cover new question
  IDs (or generalize to accept a label map). `parseSynthesisResponse` unchanged.
- **P1 branch (`feature/voice-profile-persona-chat`)** — do **not** modify from the room
  work, and do **not** branch the room off it. Branch the room off `main` (after P1 merges,
  or in parallel touching only new/additive files). The room *needs P1 merged for its output
  to matter*, but never edits P1's code.

---

## 11. Sequencing & rollout — with the design gate

P1 runs on its own track and is a prerequisite for the room to *matter*, not for it to be
built or designed.

- **Phase 0 — Design presentation.** An HTML mockup of the room: the seven agents (each
  visually/typographically distinct), per-agent capture, agent reactions/hand-offs, and the
  closing "here's the writer we think you are" readback beat. Built from this spec.
- **⛔ APPROVAL GATE.** Ben signs off on the design presentation. **No Claude Code
  implementation begins before this sign-off.** This gate is the whole point of Phase 0 —
  taste and feel get approved before a line of room code exists.
- **Phase 1 — Question authoring.** Write the per-agent question sets (deferred from this
  spec). Sequenced *after* design, because the approved design may reshape how many
  questions each agent asks and the pacing of hand-offs. Must satisfy the §5 coverage check.
- **Phase 2 — Build (Claude Code).** Room UI + capture wiring + synthesis label extension +
  coverage index. Form remains as skip/fallback.
- **Phase 3 — Cutover.** Room becomes the default intake; form retained as fallback until
  the room is proven.

---

## 12. Deferred / open

- **Per-agent live synthesis (2b).** Each agent synthesizing its own section live as it
  interviews. More magical, but multiplies LLM calls and JSON-parse failure surface ~6×.
  Deferred; revisit after the single-pass room is proven.
- **Dedicated `storyStructureDNA` section.** Deferred. Tripwire to add it: (a) `principles`
  visibly jams structure against leftover thematic content in real use, or (b) you decide
  strict 1:1 agent↔section is a hard product law. If added: additive + optional + a
  migration that backfills `storyStructureDNA` from `principles`. Until then, Oliver →
  `principles`.
- **Question text.** Authored in Phase 1, not here.
- **Whether the host is `writingPartner` or a dedicated room MC.** Assumed `writingPartner`
  for now; revisit if the design wants a distinct host presence.

---

## 13. Risks

- **Room produces a thinner profile than the form.** → §5 coverage contract + coverage test.
- **Theater overwhelms elicitation.** → guardrail: skippable, theater-on-top, real schema
  underneath.
- **Collision with P1.** → none by construction (producer/consumer split). Enforced by: room
  branches off `main`, never off P1's branch, and touches only additive/new files on the
  server.
- **Scope creep via "new questions."** → the coverage contract is the leash; new questions
  must earn their place by feeding a real field.
