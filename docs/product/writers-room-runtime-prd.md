# Writers' Room Runtime — Build Spec

**Status:** Draft for Claude Code execution
**Date:** 2026-07-06
**Owner:** Ben / notboringentertainment
**Pattern credit:** Memory-block + shared-blackboard + sleep-time architecture adapted from Letta/MemGPT. Implementation is 100% native: WriterOS TypeScript + Supabase. No external agent platform.

---

## 1. Purpose

Replace the request-response persona runtime with a **living room**: seven persistent
agents who remember across sessions, share canon through common memory, speak to each
other, and react to the writer's work without being summoned. The writing surfaces
(Script, Outline, Story Bible, Treatment, Synopsis) remain forms — but they become
where the room's output *lands*, not where the intelligence lives.

## 2. Non-Goals (read these twice)

- NOT a general agent platform. One room. Seven residents. One writer.
- NOT a replacement for the compose pipeline. Fact sheets, readiness, recipes,
  and source hashes stay exactly as built. The room feeds them; it does not bypass them.
- NOT autonomous canon editing. Agents PROPOSE writes; the writer adopts. Always.
- NOT a rebuild of PitchStudio. PitchStudio remains the heavy batch-development pass.
  The room is the live layer. Seed export remains the bridge.
- NO new UI framework. The room renders in the existing React shell.

## 3. Architecture at a Glance

```
┌─────────────────────────── WriterOS (existing) ───────────────────────────┐
│  Writing surfaces (forms) ── document state ── compose pipeline ── canon  │
│         │ field-change events                        ▲ adopted proposals  │
└─────────┼────────────────────────────────────────────┼────────────────────┘
          ▼                                            │
┌──────────────────────────── Room Server (new) ───────┼────────────────────┐
│  Event Bus ──► Scheduler (wake rules) ──► Turn Runner (per agent)         │
│                     │                          │                          │
│                     ▼                          ▼                          │
│               room_messages ◄──── tools: speak / propose / remember /     │
│               (channel log)              message_agent / pass             │
│                     │                                                     │
│  Supabase: memory_blocks (private + shared) · room_events · proposals     │
└─────────┼──────────────────────────────────────────────────────────────── ┘
          ▼ SSE stream
   Room UI (group-chat channel: presence, typing, interjections)
```

Three loops, one bus:
1. **Reactive loop** — writer speaks in the channel → scheduler picks speakers → turns run.
2. **Ambient loop** — document field changes → event → wake rules decide who cares.
3. **Digest loop** — idle timer → background turns compress channel history into
   memory blocks (the sleep-time pattern). Cheap model, no channel output by default.

## 4. Core Concepts

### 4.1 Memory blocks
A memory block is a labeled, size-capped string persisted in Supabase and injected
into an agent's context every turn. Two scopes:

- **Private** (`agent_id` set): the agent's own working memory. Casey's notes on
  Ace's wound live here. Editable only by that agent (via `remember` tool) and the writer.
- **Shared** (`agent_id` null, attached via join table): the blackboard. All attached
  agents see the current value every turn. When one updates it (Morgan only, see 10),
  everyone has it next turn. No sync code — it's a read at context-assembly time.

Standard shared blocks per project:
| Label            | Content                                          | Cap    |
|------------------|--------------------------------------------------|--------|
| `story_locks`    | Active locks verbatim from Story Bible           | 2,000  |
| `concept_seed`   | Banked concept doc / seed (never silently edited)| 4,000  |
| `project_state`  | Morgan-maintained "where we are" digest          | 2,000  |
| `voice_profile`  | Writer's synthesized voice profile               | 3,000  |
| `open_questions` | Current open questions ("invent here")           | 2,000  |

Standard private blocks per agent: `lane_notes` (their domain, 4,000),
`writer_rapport` (what they've learned about Ben, 1,500).

Caps are enforced at write time. Overflow triggers a digest turn (see 7.4), never a crash.

### 4.2 The channel
One append-only `room_messages` log per project. Every speaker — writer or agent —
writes to the same log. Agent-to-agent messages are IN the channel (visible theater,
honest function). No hidden DMs in v1; debate happens where the writer can see it.

### 4.3 Wake triggers
The scheduler wakes agents on events, never on a chat request routed to "a bot."
Event kinds: `writer_message`, `doc_field_changed`, `lock_changed`, `idle_tick`,
`agent_mention` (an agent named another agent in a message), `session_opened`.

### 4.4 Proposals & provenance
Agents write canon only through `propose_field_write(surface, fieldPath, value, rationale)`.
Proposals land in a `proposals` table with status `pending`. The UI renders them as
adopt/reject cards pinned to the relevant form field. Adoption writes the field with
provenance `agent:<id>` and logs to the channel. This is the dissent-ledger philosophy
as UI, and it reuses the compose pipeline's existing fact-sheet paths.

## 5. Data Model (Supabase)

```sql
create table room_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  author text not null,            -- 'writer' | persona id
  kind text not null default 'say',-- 'say' | 'proposal_ref' | 'system'
  content text not null,
  reply_to uuid references room_messages(id),
  created_at timestamptz default now()
);

create table memory_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,                 -- null = writer-global (voice_profile, rapport)
  agent_id text,                   -- null = shared block
  label text not null,
  value text not null default '',
  char_cap int not null default 2000,
  updated_by text,                 -- 'writer' | persona id | 'digest'
  updated_at timestamptz default now(),
  unique (project_id, agent_id, label)
);

create table block_attachments (   -- which agents see which shared blocks
  block_id uuid references memory_blocks(id) on delete cascade,
  agent_id text not null,
  primary key (block_id, agent_id)
);

create table room_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}',
  processed_at timestamptz,        -- null = queued
  created_at timestamptz default now()
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  agent_id text not null,
  surface text not null,           -- 'storyBible' | 'outline' | 'synopsis' | 'treatment'
  field_path text not null,        -- e.g. 'characters[ace].want'
  proposed_value text not null,
  rationale text not null,
  status text not null default 'pending', -- 'pending'|'adopted'|'rejected'|'superseded'
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table agent_turn_ledger (   -- budget + observability
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  agent_id text not null,
  trigger_event uuid references room_events(id),
  action text not null,            -- 'spoke'|'proposed'|'passed'|'digested'|'errored'
  input_tokens int, output_tokens int,
  created_at timestamptz default now()
);
```

Persona identity stays in `shared/personas.ts` (writingPartner, sam, casey, oliver,
maya, zoe, alex). No agents table — the roster is code; the state is rows.

## 6. Server Components (server/room/)

### 6.1 Event producer (`emitRoomEvent.ts`)
Hook into existing document save paths. On field change, emit
`doc_field_changed { surface, fieldPath, oldValue, newValue }`. Debounce 90s per
field so keystroke-level saves don't spam the room. Lock edits emit `lock_changed`
immediately, no debounce.

### 6.2 Scheduler (`scheduler.ts`)
Single worker loop (setInterval 5s in dev; Supabase queue later if needed).
Pulls unprocessed `room_events`, applies wake rules (§8), produces a **speaker list**
ordered by relevance. Rules:
- `writer_message`: Morgan always evaluates. If the writer @mentions an agent,
  that agent is primary speaker; Morgan may stand down (pass).
- Max 2 agent speakers per event. Others who "care" get the event summarized into
  their next context instead (they'll have read the room when next awake).
- `idle_tick` fires after 10 min of no channel activity while a project is open
  AND at session open if docs changed since the room last spoke. Wakes digest turns
  plus AT MOST one cast member with something pending (an unresolved flag in lane_notes).

### 6.3 Turn runner (`runRoomTurn.ts`)
Refactor of runAgent, with the terminal-tool contract replaced by a room toolset.
Context assembly order: persona system prompt → shared blocks → private blocks →
last 30 channel messages → trigger event → tool definitions. MAX_ITERS stays 4.
Streaming: assistant text deltas stream to the channel via SSE as they generate
(this is the typing indicator — real, not theater).

## 7. Agent Turn Anatomy

### 7.1 Room toolset (replaces terminal-tool pattern)
| Tool | Effect |
|------|--------|
| `speak(content, replyTo?)` | Append to channel. Streams live. |
| `propose_field_write(surface, fieldPath, value, rationale)` | Create proposal card. Auto-posts a one-line channel ref. |
| `remember(label, value)` | Update own private block (cap-enforced). |
| `message_agent(agentId, content)` | Channel message addressed to another agent; emits `agent_mention` event (depth-capped, §9). |
| `pass(reason)` | End turn silently. Reason goes to ledger, not channel. |

A turn may combine tools (remember + speak is the common pair). Every turn MUST end
in `speak` or `pass` — the malformed-retry nudge from runAgent carries over.

### 7.2 Attribution guard
Carries over from morganRuntime unchanged: agents may not present another agent's
position without that agent having actually said it in the channel or ledger.

### 7.3 Lock fidelity gate
Before a proposal persists, server-side check: does `proposed_value` touch a field
governed by an active lock? If the proposal contradicts a lock (LLM check on cheap
model, cached), status is set to `blocked` and the agent is told in-turn. Agents may
ARGUE against a lock in the channel — that's the room working — but cannot write
around one. Only the writer edits locks.

### 7.4 Digest turns (sleep-time pattern)
Trigger: idle_tick, or any block at >85% cap. The agent runs with a digest prompt:
compress channel history + current blocks into updated blocks. No channel output
unless the digest surfaces a genuine flag (then one message max, marked as such).
Runs on the cheap model tier. This is what makes memory feel curated, not hoarded.

## 8. Wake Rules Per Persona (the craft layer)

This table is the encoded story-development knowledge. It ships as data
(`server/room/wakeRules.ts`) so tuning it never touches the engine.

| Agent | Wakes on | Sleeps through | Digest bias (what lane_notes keeps) |
|-------|----------|----------------|-------------------------------------|
| Morgan (writingPartner) | every writer_message; lock_changed; session_opened; any blocked proposal | nothing — but passes freely | project_state upkeep; unresolved threads; who owes what |
| Casey | changes to character fields (want/need/flaw/secret/arc); character mentioned in writer_message | structure, comps, world rules | per-character psychology; contradictions between page behavior and stated spine |
| Oliver | outline unit/beat changes; act structure; ending field; pacing complaints in channel | dialogue polish, voice, comps | tension curve state; structural risks; beat/page drift |
| Sam | logline, synopsis prose, comps, genre/format fields | scene-level anything | pitch clarity; derivative risk; buyer angle |
| Maya | dialogue blocks in script; voice profile changes; opening scene | beat math, feasibility | voice drift vs voice_profile; character speech fingerprints |
| Zoe | world-rule fields; premise changes — ONLY if project format is speculative (flag on project) | everything on contemporary-realism projects (fully benched) | rule consistency; world-as-pressure opportunities |
| Alex | format/budget-adjacent fields; any proposal marked high-scope; lock_changed | early ideation | feasibility flags; scope creep in the story itself |

Bench mechanic: a benched agent (Zoe on Yes Chef) receives no events and burns no
tokens, but their blocks persist. Unbenching is instant.

## 9. Anti-Noise Rules (the room must be worth entering)

- **Value gate in every persona prompt:** "If your contribution would not change
  what the writer does next, call pass." Passing is free and logged; speaking is a claim.
- **Budget:** max 6 unprompted agent messages per project per hour (writer replies
  reset nothing — responding to the writer is never "unprompted"). Ledger-enforced.
- **Mention depth:** agent_mention chains cap at 2 hops without a writer message
  in between. Debate happens; filibusters don't.
- **No greetings, no recaps** in ambient turns. Agents enter mid-thought, like a
  real room. Session_opened allows Morgan one orientation line, nobody else.

## 10. Shared Block Governance

- Only Morgan (and the writer) writes shared blocks. Specialists request changes
  via channel; Morgan synthesizes into `project_state` / `open_questions`.
- `story_locks` and `concept_seed` are writer-only. Agents read, argue, never write.
- `concept_seed` is banked: appended by new interview rounds, never edited in place.

## 11. Model Routing & Cost

Via existing `modelProvider.ts`, two tiers:
- **Cast tier** (reactive turns, proposals): current primary Anthropic model.
- **Digest tier** (sleep-time turns, lock checks): cheap model — Haiku, or route
  to the local Qwen/Gemma boxes via the provider abstraction later.
Ledger table gives per-agent token accounting from day one. If a week of normal
use exceeds budget comfort, first lever is idle_tick frequency, second is
channel-history window (30 → 15 messages).

## 12. Room UI (client)

Extends the existing WritersRoom surface. Requirements:
- Group-chat channel: per-agent accent colors (already in personas.ts), streaming
  text, presence row (active / thinking / benched).
- Proposal cards render inline in the channel AND as pins on the target form field.
  Adopt / reject / "discuss" (reject-with-reply, which posts to channel).
- @mention autocomplete for summoning a specific agent.
- A "room activity" dot on the app shell when agents spoke while the writer was
  in another surface. Never a modal. Never an interruption to typing.

## 13. Prerequisites & Repo Sequencing

Before the Phase 1 branch is cut:

1. **This PRD merges to `main` as a docs-only change** so all branches see it.
2. **Streaming Anthropic client lands first, separately.** §6.3 and §7.1 require
   `messages.stream` (live channel deltas ARE the typing indicator). Extract the
   streaming client + `pause_turn` handling from PR #55 into its own small PR,
   run a live Anthropic smoke against current Morgan behavior, merge to main.
   Do NOT retrofit streaming mid-spike; the baseline must be boring before the
   room is built on it.
3. **Spike branch cuts from a `main` that already streams.** If anything is weird
   during the spike, it's the room, not the client.
4. The rest of PR #55 stays parked: Zoe's native research tool and the
   persona-capability rewiring are transitional work on the request-response
   path this runtime replaces. Zoe's research re-enters post-Phase 2 as a room
   *tool* dispatched from her turns (web search inside `runRoomTurn`), not as a
   persona-capability route.
5. Old roadmap Phase 5 (workflows-as-tools) is superseded by the §7.1 toolset.
   OpenSwarm retirement (old Phase 4) remains valid and gains urgency — the room
   must not inherit a dead dependency.
6. **DEPLOY BLOCKER (not a spike blocker):** `server/room/supabaseClient.ts`
   connects with `SUPABASE_ANON_KEY`. Before any non-local deployment, the room
   tables' RLS posture MUST be resolved: either explicit RLS policies scoped to
   the app's access pattern, or a server-side service-role key (never bundled
   client-side). Local development may proceed without this.

## 14. Build Phases

### Phase 1 — The Spike (target: one weekend)
Morgan + Casey only. Deliverables:
1. Tables from §5 migrated in Supabase.
2. `runRoomTurn` with the §7.1 toolset (no message_agent yet).
3. One ambient event source wired: Story Bible character field change → doc_field_changed; writer_message reactive loop wakes Casey on explicit character-psychology requests even before the Story Bible is complete.
4. Idle_tick digest for Casey only.
5. Minimal channel UI: stream, send, proposal card with adopt/reject.

**Acceptance (the "is it alive" test):**
1. Reactive room flow: open any active project with an incomplete or empty Story
   Bible. Open the room and ask Casey to help define a lead character's `want`.
   Within a minute, Casey speaks in the channel, streams live, and either offers
   a concrete field-ready value or asks the one next question needed to make it
   field-ready.
2. Ambient integration: in any project with a Story Bible character card, edit
   that character's `want` / `need` / `flaw` / `secret` / `arc` field and verify
   the resulting `doc_field_changed` event wakes Casey without a direct room
   prompt.

If an exact Story Bible character card exists, Casey may also file a proposal
card that the writer can adopt. No DevTools, manual project-id lookup, or
pre-seeded Story Bible data is part of the product acceptance path.

**Status note:** these are SMOKE TESTS. They prove the chassis (reactive
response, ambient wake, streaming, proposals). They do not prove the product.
Test 1 is passable by any competent chatbot. The "is it alive" proof —
unprompted agent reaction connecting a silent edit to prior-session memory —
is the EXIT GATE of Phase 3 (see below), staged through the product path only.

### Phase 2 — The First Meeting (writer-facing product)
The agent-led concept interview. Full normative contract in **Addendum A** —
flow, question bank, provenance model, banking rules, and the PitchStudio
export contract. Addendum A is binding; this heading is a pointer.

Runs on the Phase 1 chassis (turn runner, streaming, proposals, memory
blocks, channel UI). Does NOT require Phase 3 machinery. Morgan + specialist
turns run as a directed session, not ambient wake.

### Phase 3 — Full Cast Ambient
All seven agents, full wake-rule table, message_agent + mention chains, bench
mechanic, budget ledger, presence UI.

**Exit gate (the restored "is it alive" test), product path only:**
1. Converse with Casey about a character in the room. Close the project.
2. Idle digest files Casey's memory (automated tests MAY use a seeded
   clock/test helper to advance time; product QA MUST NOT — real path only).
3. In a later session, silently edit that character's `want` field. Within
   the debounce window plus one minute, Casey speaks unprompted, connecting
   the edit to the prior conversation, and files a proposal or a pass.
No DevTools, no seeded data in QA. If this moment does not feel categorically
different from a chatbot, stop and reassess before further ambient work.

### Phase 4 — Round Trip
Import a completed PitchStudio run: filled sections land as pending proposals
(never direct writes), attributed to the PitchStudio cast, adoptable per-item.

## 15. Risks & Honest Notes

- **Chatty-room failure mode.** The single biggest product risk is agents that
  perform relevance instead of having it. The pass tool, value gate, and budget
  are the defense; tune them before adding personality flourish.
- **Memory rot.** Digest prompts need real iteration. Bad digests = agents
  confidently remembering things wrong, which is worse than forgetting. Ledger +
  block history (updated_by/updated_at) make this auditable. CONDITIONAL
  mitigation (build only on observed drift, never preemptively): read-only
  markdown export of memory blocks for human audit. Not in scope for any
  currently planned phase.
- **Cost.** Seven residents with ambient triggers is a token faucet. The ledger
  exists so this is measured, not felt. Digest tier on local models is the
  long-term answer and the provider abstraction already supports adding it.
- **Scope trap.** If any task in this build starts with "generalize," it is out
  of scope. This is one room for one writer. The accountability clause: the room
  exists to produce pages on whichever project the writer brings to it, and its
  success metric is pages shipped, not features shipped.

## 16. Open Questions (deliberately unresolved — decide during build)

- Does the writer's chat input live only in the Room surface, or as a persistent
  drawer on every surface? (Lean: drawer everywhere, Phase 2.)
- Should adopted proposals auto-update `project_state`, or is that Morgan's next
  digest's job? (Lean: digest's job — keeps Morgan's voice in the loop.)
- Per-agent model casting (Casey on a warmer model, Alex on a colder one)? Fun,
  cheap to try post-Phase 2, zero architectural cost thanks to modelProvider.

---

# Addendum A — The First Meeting (Phase 2 Contract)

**Status:** Normative. MUST/SHOULD/MAY per RFC 2119. This addendum is binding
for Phase 2 implementation; where it conflicts with earlier prose, it wins.
**Source-of-truth files:** `~/Projects/PitchStudio/CONCEPT_TEMPLATE.md` and
`~/Projects/PitchStudio/PATTERN.md` (v1.2). The export contract in §A10 was
derived from those files directly; if they change, §A10 MUST be re-verified.

## A1. Product Definition

The First Meeting is an agent-led interview that develops a writer's raw idea
into a **sufficient seed**: locks, open questions, load-bearing specifics, and
a stated-or-explicitly-open ending. It is the project-level analog of the
Voice Profile: interactive, skippable, and the canonical statement of intent.

Outputs (dual-write, single interview):
1. **WriterOS canon:** confirmed answers land in document fields and memory
   blocks via the proposal path (§A7).
2. **PitchStudio handoff:** a seed-stage concept file in CONCEPT_TEMPLATE
   shape that passes PATTERN.md Step 1.5 as SUFFICIENT (§A10–A11).

Non-goals: the interview does NOT produce loglines, beats, spines, or any
`## Development` content. Those are room/PitchStudio outputs. An interview
that starts drafting development material has failed its scope.

## A2. Modes & Casting

Two interview modes, chosen by the writer at start (Morgan MAY recommend):

| Mode | Cast | Budget ceiling | Use |
|------|------|----------------|-----|
| `quick` | Morgan only | 1 question per THIN area, ≤8 total | Game out an idea fast |
| `full` | Morgan + eligible specialists | Per-lane budgets (§A6) | New project intake |

Bench rules (normative): Zoe is benched unless the project is flagged
speculative (writer sets flag at intake; Morgan MAY ask once). Alex is benched
in `quick` mode. A benched lane's audit areas fall to Morgan.

These modes are interview depth only. PitchStudio's `run_mode`
(Scout/Room/Full) is Morgan-at-PitchStudio's casting decision and is NOT set
by the interview (§A10).

## A3. Entry Points

1. **New project flow:** after project creation (and Voice Profile if first
   project), the app MUST offer the First Meeting as an explicit choice with
   a visible skip. Skipping is one click and MUST NOT nag afterward.
2. **Room surface:** a "First Meeting" action MUST be available in the room
   whenever no banked seed exists for the project; after banking, the same
   action reads "New interview round" (§A9 append-only).
3. The interview MUST NOT auto-start. Ever.

## A4. Session State Machine

Module home: `server/room/interview/` (own family; the scheduler wakes things,
the interview owns session state). Persistence:

```sql
create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  mode text not null,                    -- 'quick' | 'full'
  state text not null default 'intake',  -- see below
  seed_text text not null default '',    -- verbatim, never edited after intake
  audit jsonb not null default '{}',     -- per-area SUFFICIENT|THIN verdicts
  cursor jsonb not null default '{}',    -- current lane, question_id, budgets spent
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

States: `intake → auditing → interviewing → readback → banked → exported`,
plus `paused` (reachable from any pre-banked state, resumable to the exact
cursor). Transitions:

| From | To | Trigger |
|------|----|---------|
| intake | auditing | writer submits seed text |
| auditing | interviewing | audit finds ≥1 THIN area |
| auditing | readback | audit finds all areas SUFFICIENT |
| interviewing | readback | budgets exhausted, OR Morgan early-stop (§A5.4), OR writer "wrap it up" |
| readback | banked | writer clicks Bank (§A9) |
| banked | exported | writer triggers export (§A10) |
| any pre-banked | paused | writer pauses or closes project |

Pause/resume is a MUST. A paused session survives app restarts.

## A5. Flow (normative sequence)

**A5.1 Intake.** Writer pastes/types anything from one sentence to pages.
Stored verbatim as `seed_text`. Morgan MAY ask the speculative flag question
here (once).

**A5.2 Audit.** Morgan classifies each audit area SUFFICIENT or THIN,
mirroring PATTERN.md Step 1.5 checks: (a) locks present/implied, (b) open
questions explicit, (c) backstory/relationship specifics for every
emotionally load-bearing element, (d) ending stated or explicitly open.
Verdicts are stored in `audit` and stated to the writer in one message —
no hidden grading.

**A5.3 Interview.** Only THIN areas generate questions, drawn from the lane
question bank (§A6), asked by the owning persona in their voice, one at a
time. SUFFICIENT areas earn zero questions — the room MUST NOT re-ask what
the seed already answers. Every question is skippable; Morgan frames skips
as delegation to the room ("that's ours to invent, noted"), never as a gap
the writer failed to fill.

**A5.4 Escape hatches (all MUST):** writer can pause/resume at any question;
writer has a visible "wrap it up" affordance that jumps to readback; Morgan
can stop early when signal is sufficient, stating why. On ANY early exit,
Morgan MUST enumerate what remains open before banking.

**A5.5 Readback.** Morgan summarizes: confirmed answers, their proposed
mutability (§A8), and the open-questions list. Writer adjusts mutability
per item (single tap per item), then banks.

## A6. Question Bank — The Traceability Contract

Ships as data (`server/room/interview/questionBank.ts`). This table is the
SINGLE contract chaining question → WriterOS target → CONCEPT_TEMPLATE
destination → provenance → requirement. §A10 governs file assembly only;
any element not traceable through this table does not export.
Per-lane budgets apply per THIN area, `full` mode. Wording MAY be tuned;
triggers, targets, destinations, and requirements MUST NOT drift.
**Req?** = the area MUST be answered OR explicitly delegated (recorded in
Open questions) before banking. **Opt** = may remain silent.

| Lane | Trigger (THIN area) | Budget | Example question | WriterOS target | Template destination | Origin on confirm | Req? |
|------|--------------------|--------|------------------|-----------------|----------------------|-------------------|------|
| Morgan | locks absent | 2 | "What's the one thing this story is not allowed to become?" | `story_locks` block | `## Locks — do not violate` | [SEED] | Req |
| Morgan | ending unstated | 1 | "Do you know how it ends — even roughly? Or is the ending ours?" | `story_locks` or `open_questions` | `## Locks` (known) / `## Open questions` (ceded) | [SEED] / delegation | Req |
| Morgan | open questions/delegation absent | 1 | "What's ours to invent — where do you want the room to surprise you?" | `open_questions` block | `## Open questions — invent here` | delegation | Req |
| Casey | load-bearing character unspecified | 4 | "What broke this person before page one?" / "What can't they say out loud, even to themselves?" | `storyBible.characters[x].{flaw, secret, want, need}` | `## Seed` (tagged specifics) | [SEED] or [EXTRAPOLATED] | Req if load-bearing |
| Zoe | speculative + world rules absent | 3 | "What does this world refuse to allow?" | `story_locks` (hard rules) + seed color | `## Locks` + `## Seed` | [SEED] | Req if speculative |
| Sam | premise identity unclear | 2 | "What's the trailer moment? And what is this absolutely NOT?" | seed color + frontmatter `tone` | `## Seed` + frontmatter | [SEED] | Opt |
| Oliver | stakes/engine unclear | 2 | "What's the worst thing that could happen at the middle of this story?" | seed color or `open_questions` | `## Seed` / `## Open questions` | [SEED] / delegation | Opt |
| Maya | voice/texture absent | 2 | "What does this sound like — name a scene from anything that has the voice you hear." | seed color + frontmatter `tone` | `## Seed` + frontmatter | [SEED] | Opt |
| Alex | format/scope unstated | 1 | "What is this — feature, pilot, short? And is there a budget reality I should know?" | frontmatter `format` + seed color | frontmatter + `## Seed` | [SEED] | Opt |

The four Morgan/Casey Req rows map 1:1 to PATTERN.md Step 1.5's audit
checks — locks, delegation (Open questions), load-bearing specifics,
ending — so a banked session satisfying them is a sufficient seed BY
CONSTRUCTION. Zoe's row is a conditional, lock-adjacent requirement for
speculative projects; it is NOT part of the 1:1 proof.

Rules: budgets are per THIN area, not per session; a lane with all areas
SUFFICIENT asks nothing; `quick` mode collapses all lanes to Morgan at 1
question per THIN area. Follow-ups count against the budget. No lane may
exceed budget without an explicit writer invitation ("keep going").

## A7. Transcribe-and-Confirm

**A7.1 Pattern.** The writer answers in story terms. The asking agent
transcribes into schema terms and files it through the EXISTING proposal
path — no new write mechanism. Writer confirmation = adoption. The writer
MAY edit the transcription before confirming.

**A7.2 Proposals table extension (discriminator + provenance):**

```sql
alter table proposals add column kind text not null default 'ambient_suggestion';
  -- 'ambient_suggestion' | 'interview_answer'
alter table proposals add column session_id uuid references interview_sessions(id);
alter table proposals add column question_id text;
alter table proposals add column origin text;
  -- 'seed' | 'extrapolated'  (interview never produces 'invented';
  --  ambient_suggestion rows record 'extrapolated' or 'invented')
```

`origin` is set by the transcribing agent and is writer-adjustable at
confirm (an agent may mistag a restatement as extrapolation). Export tags
(§A8, §A10) are rendered FROM this column — never inferred at export time.

Additionally, `interview_sessions` gains the full transcript, so answers
that never become proposals (seed color, skips) still carry provenance:

```sql
alter table interview_sessions add column answers jsonb not null default '[]';
  -- [{question_id, lane, answer_text, origin, disposition, at}]
  -- disposition: 'field_mapped' | 'seed_color' | 'skipped_delegated'
```

The transcript is the export's source of record; proposals are the write
path into WriterOS fields.

UI renders `interview_answer` proposals as inline confirmations in the
interview flow (single-tap confirm/edit/decline), not as ambient cards.
Same persistence, different presentation.

**A7.3 Refusal & seed color.** If the writer declines the field mapping
("don't put that in a field"), the answer is preserved verbatim as **seed
color** — appended to the seed record (dated, marked as interview answer)
and exported inside `## Seed`, but written to NO WriterOS field. Refusal is
a valid outcome, not an error state. Answers with no natural field target
(Sam/Maya/Oliver texture answers) default to seed color without asking.

## A8. Provenance Model — Two Axes, No Automatic Mapping

**Origin axis** (PitchStudio vocabulary, carried in the export):
`[SEED]` — stated by the writer. `[EXTRAPOLATED]` — derived from writer
material and writer-approved. `[INVENTED]` — the room's creation.

**Mutability axis** (WriterOS vocabulary, carried in UI + blocks):
`locked` — inviolable, fidelity-gate enforced. `leaning` — challengeable
with reasoning (dissent territory). `open` — explicitly ceded to the room.

The axes are orthogonal. There is NO automatic mapping between them.
Assignment rules:

| Case | Origin | Mutability |
|------|--------|------------|
| Writer states it flatly ("she wants revenge") | [SEED] | writer assigns at readback (default: locked) |
| Writer states it tentatively ("maybe she wants revenge") | [SEED] | leaning (writer may promote) |
| Agent infers, writer approves as challengeable ("revenge masks grief — yes, but push on it") | [EXTRAPOLATED] | leaning |
| Agent infers, writer adopts as canon | [EXTRAPOLATED] | locked |
| Writer skips/cedes the area | — (room will fill as [INVENTED]) | open |

Storage: origin is recorded on the proposal row and carried into the export's
tags. Mutability lives where it already lives — `story_locks` block (locked),
`open_questions` block (open), and a `leanings` list inside `concept_seed`
(leaning). Interview UI MUST show all three states with distinct affordances
at readback; the export MUST NOT emit mutability labels beyond the Locks and
Open-questions sections (PitchStudio's contract only knows those two, plus
origin tags).

## A9. Banking Rules

**Minimum bankable session:** seed verbatim + audit verdicts + a Locks
section (MAY be empty only with the explicit line "No locks — writer cedes
broadly") + an Open-questions section (MAY be empty only with the explicit
line "Nothing delegated — writer holds all intent"; the §A6 delegation
question MUST have been asked or the area audited SUFFICIENT). Nothing
else is required; a `quick` session with four answers banks fine.

**The bank moment is visible UX (MUST):** a "Bank this round" action showing
exactly what will be written — seed text, dated interview answers, locks,
leanings, open questions — before commit. No silent memory-block writes.
Banking writes `concept_seed` (append), `story_locks`, and `open_questions`
blocks, and sets session state `banked`.

**Append-only:** banked rounds are never edited in place. A later "New
interview round" (§A3.2) appends a dated round to `concept_seed`. Story
Bible wins on current state; the seed wins on original intent.

## A10. Export Contract (PitchStudio handoff)

Export target: a seed-stage concept file, written to
`~/Projects/PitchStudio/concepts/<slug>.md` (path configurable). Trigger: an
explicit "Export to PitchStudio" action, available from state `banked`.
The export is byte-shape compatible with CONCEPT_TEMPLATE.md. Normative map:

| Template element | Interview source | Rule |
|------------------|------------------|------|
| frontmatter `title` | project title | MUST set |
| frontmatter `logline` | seed's own logline if the writer stated one | MUST NOT synthesize; empty if unstated |
| frontmatter `format`, `tone`, `device` | Alex/Sam/Maya confirmed answers | set if confirmed, else empty |
| frontmatter `status` | — | MUST be `seed` |
| frontmatter `date` | export date | MUST set |
| frontmatter `run_mode`, `seed_fidelity` | — | MUST be empty — Morgan-at-PitchStudio's calls |
| frontmatter provenance fields (`developed_on` … `feedback_rounds`) | — | MUST be empty/defaults |
| `# <Working Title>` | project title | MUST set |
| `## Seed` | seed verbatim + dated interview answers (marked as writer interview answers) + seed color (§A7.3), with origin tags `[SEED]`/`[EXTRAPOLATED]` inline | MUST populate; verbatim seed first, never edited |
| `## Locks — do not violate` | locked items at readback | MUST emit (section added below Seed, per PATTERN Step 1.5 audit) |
| `## Open questions — invent here` | open items + all skips | MUST emit |
| `## Development` + all `###` subsections | — | MUST emit the template skeleton UNFILLED, exactly as in CONCEPT_TEMPLATE.md |

Leanings export inside `## Seed` as tagged lines ("writer is leaning X —
challenge permitted"), since PitchStudio's contract has no leaning section.

## A11. Validation Gates (both MUST pass before Phase 2 closes)

**Gate 1 — automated shape check (`server/room/interview/exportCheck.ts`):**
frontmatter parses with every TEMPLATE key present; `status: seed`; Seed,
Locks, and Open-questions sections present and non-empty (Locks and
Open-questions each MAY carry only their explicit empty-state line per
§A9); every `## Development` subsection present and
unfilled. Runs on every export; a failing export MUST NOT write the file.

**Gate 2 — live PitchStudio smoke (once, at phase close):** hand a real
exported concept file to Hermes with: *"Run the standard PitchStudio
workflow on concepts/<slug>.md through Step 1.5 only. Report the seed
fidelity verdict and list any interview questions you would ask."*

PASS = verdict SUFFICIENT. Full stop.

A THIN verdict is ALWAYS a Phase 2 defect, classified by the questions
PitchStudio asks: a question the interview already answered = the
conformance map lied (fix §A10 rendering); a question the interview never
asked and never recorded as delegated = coverage gap (fix §A6 triggers or
the skip-to-delegation path). Rationale: §A6's Req rows mirror PATTERN.md
Step 1.5's audit checks one-to-one, so a correctly banked and correctly
rendered export is sufficient by construction — every audit area is either
answered or explicitly delegated in `## Open questions`. If PitchStudio
disagrees, our contract is broken, not its audit. Fix, re-export, re-run
until SUFFICIENT.

## A12. Phase 2 Acceptance (product path, no DevTools)

**Track A — thin seed (interview exercised):**
1. Create a new project with a one-sentence idea. Start a `full` First
   Meeting. Morgan audits aloud, THIN areas trigger lane questions in
   persona voices, SUFFICIENT areas trigger none.
2. Answer some questions, skip at least one, refuse at least one field
   mapping, pause mid-session, close the app, reopen, resume at the exact
   question.
3. Reach readback: adjust one item's mutability, see remaining-open list,
   bank with the visible bank moment. Confirmed answers are now in Story
   Bible fields with provenance; locks in the locks block.
4. Export. Gate 1 passes. Open the file: verbatim seed intact, tags
   present, Development skeleton unfilled.
5. Run a second interview round; verify append (round 1 untouched).
6. Gate 2 smoke passes on a real export.

**Track B — rich seed (restraint exercised):**
7. Create a second project with a rich seed: locks stated, open questions
   explicitly delegated, backstory specifics for every load-bearing
   relationship, ending stated (or explicitly ceded). Start a `full` First
   Meeting. Morgan MUST audit every area SUFFICIENT, ask ZERO targeted
   questions, and proceed directly to readback. Any question asked against
   this seed is a §A5.3 violation ("the room MUST NOT re-ask what the seed
   already answers") and fails acceptance.
8. Bank and export the rich seed; Gate 1 passes; the export carries the
   writer's locks and delegations verbatim.

If the interview feels like a form with extra steps — if a writer staring
at it blanks the way they blank at the Story Bible — stop and fix question
craft before shipping. That is the failure mode this phase exists to kill.

## A13. Explicitly Out of Scope for Phase 2

message_agent chains, bench-mechanic UI, budget ledger UI, ambient wake
tuning (all Phase 3); PitchStudio import/round-trip (Phase 4); memory
markdown export (conditional, §15); any generalization beyond one room.
