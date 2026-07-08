# Writers' Room Phase 1 — Spike Decisions

Log of every decision made where the PRD (`docs/product/writers-room-runtime-prd.md`)
is silent or where reality forced a deviation. One entry per decision, newest last.
Scope guard: one room, seven residents, one writer (§15). Anything tempting
generalization is flagged here and NOT built.

## D1 — Supabase project: fresh `writeros-room`
The repo had no Supabase wiring at all (no client lib, no migrations — the server
is a pure AI proxy; documents persist in browser localStorage). The old "Writer OS"
Supabase project was paused >90 days and unrestorable. Created `writeros-room`
(ref `ebibbtbmrgxoshafhdrm`, us-west-1, $0/month) and applied the §5 migration there.

## D2 — RLS disabled on the six room tables (spike posture)
The only DB client is the local dev server holding the key in `.env`; the key is
never shipped to the browser. Supabase's advisor correctly flags this as critical
for production. **Hardening debt, owed before any deploy or Phase 2 multi-device
use:** enable RLS + policies, move to service-role key server-side.

## D3 — `unique nulls not distinct` on memory_blocks
PRD §5 says `unique (project_id, agent_id, label)`. Postgres treats NULLs as
distinct in plain unique constraints, so shared blocks (`agent_id` null) would
never conflict and upserts would duplicate rows. Added `nulls not distinct`
(PG15+). Semantics match the PRD's intent; syntax deviates.

## D4 — Events originate client-side
§6.1 says "hook into existing document save paths." Those paths are client-side
(`useProjectState.update()` → localStorage); the server never sees document saves.
So the `doc_field_changed` emitter lives in the client save chain and POSTs to
`/api/room/events`. The server owns the queue, scheduler, and turns.

## D5 — Debounce is leading-edge (emit first, suppress 90s)
§6.1 says debounce 90s per field; §14 acceptance says Casey reacts "within a
minute" of the change. Trailing debounce (fire 90s after last keystroke) cannot
satisfy the acceptance clock. Leading-edge does: first change emits immediately,
subsequent changes to the same field are suppressed for 90s (latest value folded
into a refreshed event when the window closes, only if the value moved again).

## D6 — Digest/cheap tier: env-var model on the existing Anthropic client
modelProvider has no cheap/primary tier split today (one model per provider).
Rather than build a tier system (generalization trap), digest turns and lock
checks pass an explicit `model` override (`ANTHROPIC_DIGEST_MODEL`, default
`claude-haiku-4-5`) through the existing streaming client. Real tiering can land
post-Phase 2 if the ledger says it's worth it.

## D7 — Proposal adoption applies client-side; provenance in log, not schema
Documents live in localStorage, so "adoption writes the field" must happen in the
client (same `setStoryBibleDocument` path the writer uses). Provenance
`agent:<id>` is recorded on the proposal row + the channel system message, NOT as
a new field on document schemas — changing `shared/documents.ts` shapes would
ripple through compose/fact-sheet code the PRD says to leave alone.

## D8 — `session_opened` recorded, not acted on
§8 gives Morgan a session_opened wake with one orientation line. Phase 1
deliverables don't include it; the spike handles `writer_message`,
`doc_field_changed`, and `idle_tick` only. The event kind is accepted and stored
so Phase 2 wake rules can consume history, but no turn fires on it.

## D9 — Attribution guard adapted to channel evidence
§7.2: agents may not present another agent's position unless that agent actually
said it "in the channel or ledger." Morgan's guard checks a consult ledger; the
room has no consults in Phase 1. Reused the same attribution regexes
(exported from agentRuntime/toolsets.ts) with the evidence set = authors who
actually have messages in the assembled channel window.

## D10 — Streaming = `speak` tool input deltas over SSE
§6.3 wants assistant text deltas streamed live. The channel message is the
`speak` tool's `content` argument, which arrives as `input_json_delta`, not text
deltas. Extended the streaming client with an optional raw stream-event callback;
the room runner extracts the `content` string prefix from partial JSON and
broadcasts real deltas. Model "thinking" text before the tool call is NOT
broadcast (internal, §9 noise).

## D11 — "Project open" = live SSE connection
idle_tick needs "while a project is open" (§6.2). The room UI holds an SSE
connection per project; the scheduler treats a project as open iff it has a live
connection. No heartbeat endpoint, no presence table.

## D12 — Writer-message wake includes Casey on character intent
§8 Casey wakes when a "character mentioned in writer_message." That literal
name match remains, using Story Bible character names sent with the message
payload. Phase 1 also wakes Casey when the writer directly invokes Casey for
character-psychology work (`want`, `need`, `flaw`, `secret`, `arc`, motivation,
lead/protagonist, etc.). This keeps the room useful before the Story Bible is
fully filled out. LLM-grade relevance detection remains Phase 2 tuning.

## D13 — project_id is text, not uuid (Codex review P1)
WriterOS project ids are client-generated strings, not guaranteed UUIDs
(`crypto.randomUUID()` normally, but fallback `project-<ts>-<rand>` and test ids
like `p1` exist). Second migration converted all six `project_id` columns
uuid → text so the room accepts whatever `activeProjectId` the client carries.

## D14 — Lock gate fails open on checker errors
§7.3 is silent on lock-check failure. A flaky cheap-model call must not silently
swallow proposals, and the writer still adopts/rejects every card by hand — the
human gate holds either way. On checker error the proposal files as pending and
a warning is logged. Revisit if the ledger shows the checker erroring often.

## D15 — Channel UI lives inside the existing WritersRoom dock
§12 says "extends the existing WritersRoom surface." The channel is a new
"The Room" entry at the top of the dock's left nav (default selection when the
room is configured); the six 1:1 specialist chats remain untouched below it.
No new tab, no new shell surface, no router change.

## D16 — Proposal adoption scope: Story Bible character fields only
Casey is the only proposing agent in Phase 1 and her lane is character
psychology. Adopt is enabled for `characters[<id>].<field>` paths on the
storyBible surface; any other path renders its card with Adopt disabled and an
honest tooltip. Generalizing a path-applier across all four surfaces is exactly
the §15 scope trap.
