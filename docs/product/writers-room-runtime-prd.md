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
pre-seeded Story Bible data is part of the product acceptance path. If these
moments don't feel different from the current app, stop and reassess before
Phase 2.

### Phase 2 — Full Cast
All seven agents, full wake-rule table, message_agent + mention chains, bench
mechanic, budget ledger, presence UI.

### Phase 3 — The First Meeting
The concept interview (see prior design discussion) implemented as the room's
opening session on a new project: Morgan hosts, specialists ask their lane
questions, answers land in canon fields with provenance, skips land in
open_questions, readback assigns locked / leaning / open. Output banks as
concept_seed and exports in CONCEPT_TEMPLATE.md shape for PitchStudio.

### Phase 4 — Round Trip
Import a completed PitchStudio run: filled sections land as pending proposals
(never direct writes), attributed to the PitchStudio cast, adoptable per-item.

## 15. Risks & Honest Notes

- **Chatty-room failure mode.** The single biggest product risk is agents that
  perform relevance instead of having it. The pass tool, value gate, and budget
  are the defense; tune them before adding personality flourish.
- **Memory rot.** Digest prompts need real iteration. Bad digests = agents
  confidently remembering things wrong, which is worse than forgetting. Ledger +
  block history (updated_by/updated_at) make this auditable.
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
