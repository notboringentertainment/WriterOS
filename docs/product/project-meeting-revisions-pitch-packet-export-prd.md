# Project Meeting Revisions and Pitch Packet Export Contract PRD

Status: Draft for review
Date: 2026-07-14
Depends on: Shared Memory Contract (PR #64, merged at `44ea520`); plan doc `docs/superpowers/plans/2026-07-11-shared-memory-contract.md` (Rev 5.1)
Related PRDs: `writers-room-runtime-prd.md`, `agent-observability-provenance-prd.md`
Branch/PR discipline: this work ships on its own branch and PR, separate from OpenSwarm runtime retirement (see `open-swarm-agent-runtime-consolidation-prd.md`). The two code scopes must not mix.

## Summary

Hands-on testing of the Project Meeting exposed two connected product gaps:

1. **New Meeting rounds repeat prior questions and only accumulate material.** Round 2 exists to review and redirect Round 1, but today it re-asks the same required questions and can only add — never revise, retract, or supersede — what Round 1 banked.
2. **"Export to PitchStudio" produces temporary Markdown in UI state.** The button renders a skeleton into a `<pre>` tag and nothing else. It must produce a real, complete, reviewed, importable Pitch Packet artifact.

This PRD introduces a **revisioned active project direction** layered on top of the existing immutable Meeting history, a set of explicit decision operations (keep, revise, retract, supersede, redirect), a context-aware new-round audit that never re-asks answered questions, and a shared, versioned **Pitch Packet contract** between WriterOS and PitchStudio with a real file download.

## Code truth (current behavior, verified 2026-07-14)

This section records the implementation as it exists on `main` at `44ea520`. Requirements later in this document are defined against these facts.

### Meeting rounds

- A "round" is one `interview_sessions` row (`supabase/migrations/20260708000001_first_meeting_interview.sql`, extended by `20260712000001_shared_memory_contract_fns.sql` which adds `bank_snapshot jsonb`). There is no separate rounds table. Terminal states (`banked`, `exported`) mark completed rounds; `getInterviewStatus` (`server/room/interview/runtime.ts:80-89`) relabels the CTA to "New interview round" once any session is terminal.
- One active pre-banked session per project is enforced by an advisory check plus the DB partial unique index `interview_sessions_one_active_per_project` (`20260710000001_interview_single_active_session.sql`).
- The canonical Meeting record is append-only: `seed_text` is verbatim and never edited after intake; `answers` is an append-only transcript; `bank_snapshot` is written once at banking and never mutated.
- Banking (`bankInterview`, `runtime.ts:291-330`) writes transactionally via the `bank_meeting_memory` RPC (`20260712000001_shared_memory_contract_fns.sql:93-183`): project-wide `concept_seed.revision` CAS, `story_locks` value CAS, regenerated `concept_seed` and `open_questions` projections, cumulative Meeting-lock union (`mergeMeetingLocks`, `server/room/lockSections.ts:81-93`), caps 4000/2000/2000 enforced in SQL.
- The pre-bank preview exists: `previewBankFinal` (`runtime.ts:279-289`) returns exact final block values, rendered in a collapsed "Exact block values to be written" details block (`client/src/components/ritual/ProjectMeetingPage.tsx:230-235`).

### Why Round 2 repeats Round 1 questions

- `startInterview` (`runtime.ts:119-120`) calls `auditSeed(seedText, …)` then `selectQuestionsForAudit(…)`.
- `auditSeed` (`server/room/interview/audit.ts:18-40`) is a pure regex scan of the new session's `seed_text` string only (`LOCK_RE`, `OPEN_RE`, `BACKSTORY_RE`, `ENDING_RE`, `WORLD_RE`). It reads no prior answers, no `bank_snapshot`, no shared memory blocks, no locks.
- `selectQuestionsForAudit` (`server/room/interview/questionBank.ts:127-151`) selects a question for every required trigger (`locks`, `ending`, `open_questions`, `load_bearing_character`; plus `world_rules` when speculative) whose verdict is `THIN`. The question bank is static (9 rows, `questionBank.ts:19-119`).
- Consequence: any required trigger the new round's seed does not lexically satisfy is re-asked, regardless of what Round 1 answered and banked. This is the concrete root cause of the observed repetition.

### Revision primitives (what exists, what does not)

- `memory_blocks.revision` is a monotonic optimistic-concurrency token, not a history log. Block values are overwritten in place; there is no version table and no old-value retention.
- Meeting locks explicitly have no withdrawal/supersession workflow (`lockSections.ts:8-9`: existing Meeting locks stay active "until an explicit future withdrawal/supersession workflow — out of scope here"). Open-question resolution semantics were likewise deferred in the shared-memory-contract plan.
- The only existing `superseded` status is on the `proposals` table (`server/room/types.ts:45`) — the ambient room-proposal flow (DECISIONS D7, D16), not a Meeting revision primitive.
- Everything the Meeting banks is therefore additive-only today. That is the gap this PRD fills.

### The two existing exports

1. **Meeting export ("Export to PitchStudio" button).** `ProjectMeetingPage.tsx:259` → `useInterviewSession.exportToPitchStudio` (`client/src/lib/useInterviewSession.ts:225-235`) → server `exportInterview` (`runtime.ts:332-343`) → `renderPitchStudioSeedExport` (`server/room/interview/exportCheck.ts:75-100`), validated by `checkInterviewExport` (`exportCheck.ts:117-151`), session set to `exported`. The client stores the result only in React state (`exportMarkdown`) and renders it in a `<pre>`. **No file download, no persistence, no handoff.** The rendered Markdown has YAML frontmatter where only `title` and `date` are populated (`logline`, `format`, `tone`, `device`, etc. emit empty), a seed/locks/open-questions body, and a 20-subsection `## Development` skeleton that the export check requires to be *unfilled*. It is a seed-handoff skeleton, not a packet.
2. **Document-model seed export ("Export seed" in the project menu).** `client/src/components/shell/ProjectMenu.tsx:74` → `App.tsx` `handleExportSeed` → `composeSeedMarkdown` (`shared/seedMarkdown.ts:172-183`) → `downloadTextFile(…, 'text/markdown')`. This is a real `.md` download, sourced from the structured document model (`shared/documents.ts`: synopsis, story bible, treatment) with frontmatter `title, logline, format, genre, tone, comps` and sections for synopsis, character notes, world, locks, and open questions. `shared/seedMarkdown.ts` is merged on `main` (not branch-only).

These two exports have different data sources, different frontmatter keys, and different section shapes. Neither reads the other's data.

### Pitch-packet field availability today

| Field | Structured document model (`shared/documents.ts`) | Meeting canon (`memory_blocks` / sessions) |
| --- | --- | --- |
| Title | Synopsis `header.title`; StoryBible `cover.title`; Treatment `header.title` | Export frontmatter `title` (project meta) |
| Logline | Synopsis `logline.text`; Treatment `logline` | Frontmatter key emitted empty |
| Format | Synopsis `header.format`; Treatment `header.format` | Emitted empty |
| Genre | Synopsis `header.genre`; Treatment `header.genre` | Absent |
| Tone | StoryBible `toneAndStyle.toneWords`; Treatment `concept.tone` | Emitted empty |
| Premise | StoryBible `premiseAndWorld.premise`; Treatment `concept.premise` | Empty skeleton header only |
| Story engine | **Does not exist as a named field** (closest: `stakes_engine` question trigger; Synopsis-series `premiseLongevity`) | Does not exist |
| Core characters | Synopsis `characters`; StoryBible `characters[]` (role/want/need/flaw/secret/arc) | Free-text answers only, normalized to `interview_answer.*` sentinels |
| Locks | StoryBible `locks[]` `{status, statement, rationale}` | `story_locks` block (two-section) |
| Open questions | Treatment `openQuestions.{story,character,worldOrMythology,production}` | `open_questions` block (cumulative projection) |
| Comps | Synopsis `header.comps[]`; Treatment `compsAndReferences` | Empty skeleton |
| Device | — | Frontmatter key emitted empty |

### Identified contradictions (resolved by decision, not guessed)

1. **Two competing PitchStudio exports** (Meeting skeleton vs. document seed). Resolution: §"Product Decisions" D-1.
2. **No PitchStudio import contract exists anywhere in the repo.** "PitchStudio" appears only as a renderer name, button label, comment, and tests. Resolution: this PRD *defines* the contract; PitchStudio adopts it (§"Pitch Packet Contract").
3. **Meeting canon and document model are disconnected** — banking writes only `memory_blocks`, never storyBible/synopsis/treatment; `writerOSTarget` strings in the question bank are labels, never applied. Resolution: D-2.
4. **Locks and open questions each live in two disconnected stores** (StoryBible `locks[]` vs. `story_locks` block; Treatment `openQuestions` vs. `open_questions` block). Resolution: the packet composer reads both and labels origin; it does not merge the stores (D-2).
5. **`project_id` type drift**: Phase-1 room tables were created `uuid` then converted (`20260707000002_project_id_text.sql`); `interview_sessions.project_id` is `text` (DECISIONS D13). New tables in this PRD use `text` to match `interview_sessions`. Implementation must verify the conversion covered every room table it joins against before writing FKs or joins.
6. **`writers-room-runtime-prd.md` §4.1 vs. Rev 5.1 plan**: the runtime PRD's original `concept_seed` description (append-only doc) was amended by the shared-memory-contract plan to a bounded projection. If the on-disk PRD copy still carries the old wording, amend it in this PR's doc changes — do not re-litigate the semantics.

## Product Decisions

**D-1 — One canonical export.** The Pitch Packet replaces the Meeting export skeleton as the product's PitchStudio handoff. `renderPitchStudioSeedExport`'s 20-subsection Development skeleton is retired from the writer-facing path (its check module remains only if PitchStudio still needs a skeleton *import* format, which is PitchStudio's call — flagged as an open question). The project-menu "Export seed" (`composeSeedMarkdown`) remains as-is for now: it is a document-model seed for external development workflows, not the reviewed packet. A follow-up may fold it in; not this PR.

**D-2 — The packet is a reviewed join, not a store merge.** The Pitch Packet composer reads from both worlds — Meeting canon (concept seed projection, `story_locks`, `open_questions`, banked answers) and the structured document model (synopsis/story bible/treatment fields) — and presents a single review screen. It does not unify the underlying stores, does not write document fields into `memory_blocks`, and does not write Meeting canon into documents. Provenance is labeled per field.

**D-3 — History immutable, direction revisioned.** `interview_sessions`, `answers`, and `bank_snapshot` stay append-only and immutable, exactly as the shared memory contract defines. Revision happens in a new append-only **decision ledger**; "current direction" is a deterministic fold over that ledger. Shared block values remain regenerated projections — now projections of (sessions + ledger) instead of (sessions only).

**D-4 — Writer approval gates canon and export.** AI may propose missing metadata (logline, tone, story engine, …) on the packet review screen, but a proposed value never enters the exported artifact or any canonical store without explicit writer approval. This extends the existing propose→approve posture (DECISIONS D7; where-awareness edit gating).

**D-5 — Additive migrations only.** No existing table is altered destructively; no schema-version bump of the document model; existing banked sessions remain valid without backfill *required* (backfill is provided but optional-idempotent, see Migrations).

## Goals

- Round N+1 reviews and redirects Round N instead of repeating it.
- Explicit, auditable keep / revise / retract / supersede / redirect operations over banked Meeting decisions.
- New-round audit consumes prior answers, active locks, open questions, and the current active projection; no question repeats unless the writer reopened that area.
- Pre-bank preview shows the exact resulting active state (block values and decision-level diff) before anything commits.
- A single, versioned, shared Pitch Packet schema consumed by both WriterOS (export) and PitchStudio (import).
- Export produces a real `.md` and `.json` download; a clean boundary exists for future direct import.
- Required packet fields are reviewed by the writer; AI proposals are visibly provisional until approved.

## Non-Goals

- No merge of the Meeting canon and the structured document model into one store.
- No changes to the four-block shared memory contract labels, caps, sentinels, or the 28-attachment invariant.
- No changes to ambient room-proposal adoption (DECISIONS D7, D16).
- No direct network push to PitchStudio in this release (file handoff only; the import boundary is specified, not built).
- No changes to composer pipelines or `shared/seedMarkdown.ts` behavior.
- No OpenSwarm-related work (separate PRD, separate branch/PR).

## Concept model

### Immutable Meeting history

Unchanged from the shared memory contract:

- `interview_sessions` rows (one per round), `seed_text` verbatim, `answers` append-only, `bank_snapshot` written once at bank.
- Rounds are never edited, reordered, or deleted. Round N's record shows what the writer said and banked *at that time*, forever.

### Mutable, revisioned active project direction

New concept: the **active direction** — the set of currently-standing Meeting decisions (locks, open questions, mapped answers, seed-color notes). It is:

- **Materialized from an append-only decision ledger** (`meeting_decisions`, below), so "mutable" means "new ledger entries change the fold result," never "rows edited."
- **Versioned**: every bank that changes the active direction increments a per-project `direction_revision` (reusing the existing `memory_blocks.revision` CAS discipline — `getSharedBlockSnapshot` / `bank_meeting_memory` pattern).
- **The single input to** (a) new-round audits, (b) shared block projections, and (c) the Pitch Packet composer's Meeting-sourced fields.

### Decision ledger

New table `meeting_decisions` (append-only):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `text` | matches `interview_sessions.project_id` (D13; see contradiction 5) |
| `session_id` | `uuid` | round that created this entry |
| `area` | `text` | audit-area key: `locks`, `ending`, `open_questions`, `load_bearing_character`, `world_rules`, plus per-question areas (`question:<question_id>`) |
| `field_path` | `text` | canonical field path per `resolveCanonicalFieldPath` (`banking.ts:116-129`) |
| `op` | `text` | `assert` \| `revise` \| `retract` \| `supersede` \| `redirect` |
| `content` | `jsonb` | the decision payload (statement, mutability, origin marker `[SEED]/[EXTRAPOLATED]/[INVENTED]`, disposition) |
| `targets` | `uuid[]` | prior ledger entries this entry revises/retracts/supersedes (empty for `assert`/`redirect`) |
| `created_at` | `timestamptz` | |

Fold rules (pure function, one module, unit-tested; deterministic and order-stable — ledger order = `created_at`, tiebreak `id`):

1. **Content-bearing ops** are `assert`, `revise`, `supersede`. A content-bearing entry is **active** iff no later entry lists it in `targets`.
2. **Non-content ops** are `retract` and `redirect`. They are never active content: a `retract` exists only to deactivate its targets; a `redirect` is a session-scoped record of a re-ask (see Operations) and is ignored by the fold entirely.
3. **Target validity**: `targets` may only reference content-bearing entries with strictly earlier `(created_at, id)` order. Append-only ordering plus this rule makes cycles structurally impossible. An entry with a missing or non-content target is excluded from the fold and emits a runtime event (see Failure behavior); its valid targets, if any, still deactivate.
4. **Multiple replacements**: several later entries may target the same prior entry — deactivation is idempotent. One entry may target many priors (a merging `supersede`). A `revise` chain (A revised by B revised by C) leaves only C active.

### Operations

All five operations are writer actions taken during a new round's **recap stage** (see UX) or readback. Keep/revise/retract/supersede become ledger entries written atomically with the bank. **Redirect is different: it is a session-local action with an immediate effect and explicit storage.**

Code truth: there is no persistent question queue today — `InterviewCursor` stores only `{lane, question_id, budgets_spent}` (`server/room/interview/types.ts:32-39`) and the runtime reconstructs the question list from the stored `audit` verdicts on every turn. Redirect therefore ships as a **typed cursor extension**, not a new column:

- `InterviewCursor` gains `redirects: Array<{ area, question_id, at, answered_at: string | null }>`. The `cursor` jsonb column already exists, so no migration is needed; code treats an absent `redirects` as `[]` (pre-feature cursors stay valid), and `DEFAULT_INTERVIEW_CURSOR` adds `redirects: []`.
- Tapping "Ask me again" appends an element **with dedupe**: appending for an area that already has an element with `answered_at: null` is a no-op. The write is the existing single-row session `cursor` update — atomic as-is.
- Question-list reconstruction becomes: base selection from audit verdicts ∪ the questions of redirect elements with `answered_at: null`, redirected questions ordered after the remaining base questions. Answering or skipping a redirected question stamps its element's `answered_at` (same cursor write as the answer), removing it from reconstruction — the same idempotence the base list gets from the transcript.
- At bank, each `redirects` element (answered or not) becomes one `op:'redirect'` ledger entry — audit-trail only, never read by any later round's audit, so a redirect cannot reopen an area beyond the session that created it. It lives only in that session's cursor and is spent when the session banks; no separate consumption bookkeeping exists or is needed. (The state machine has no "abandoned" state — `intake/auditing/interviewing/readback/banked/exported/paused` — and this PRD adds none; a paused session resumes with its cursor, redirects intact.)

| Operation | Meaning | Ledger effect | Effect on audit |
| --- | --- | --- | --- |
| **Keep** | Carry decision forward unchanged | No entry (absence of targeting = still active) | Area stays covered; question suppressed |
| **Revise** | Replace decision content, same intent | New entry `op:'revise'`, `targets:[old]` | Area covered by new content |
| **Retract** | Withdraw decision; no replacement | New entry `op:'retract'`, `targets:[old]`, empty content | Area returns to uncovered; question eligible next round |
| **Supersede** | New decision replaces one or more prior (possibly across areas) | New entry `op:'supersede'`, `targets:[…]` | Superseded areas covered by the new decision's area |
| **Redirect** | Reopen an area for questioning without supplying a replacement | Immediate: deduped element appended to `cursor.redirects` (question re-enters this session's reconstructed list). At bank: `op:'redirect'` entry recorded for audit trail only | Current session re-asks that area's question now; later audits are unaffected by the redirect entry itself |

Notes:

- `assert` is the implicit op for decisions created by normal banking (Round 1 answers, new Round-N answers). Writers never see the word "assert."
- Retract on a Meeting lock is the "explicit future withdrawal/supersession workflow" that `lockSections.ts:8-9` deferred. The Meeting-locks section of `story_locks` stops being a pure cumulative union: it becomes the rendered fold of active lock decisions. `mergeMeetingLocks` is replaced by the fold-driven renderer; the two-section format and the surface-owned first section are unchanged.
- Operations never touch prior rounds' `bank_snapshot` or transcripts. Round 1's history still shows the lock the writer later retracted; the *direction* no longer carries it.

### New-round audit (context-aware)

`auditSeed` gains a second input: the **audit context**.

```
auditSeed(seedText, {
  speculative,
  context: {
    activeDecisions,      // fold of meeting_decisions (content-bearing entries only)
    priorAnswers,         // TranscriptEntry index across terminal sessions
    storyLocks,           // current story_locks block value
    openQuestions,        // current open_questions block value
  }
})
```

Coverage rule per required trigger, evaluated in order (extending the existing `AuditVerdict = 'SUFFICIENT' | 'THIN'`, `types.ts:22`):

1. **Covered by new seed** (existing regex pass) → `SUFFICIENT` (existing verdict).
2. **Covered by active direction** — an active ledger decision exists for that area, or a prior `field_mapped` answer maps to it and was not retracted → `SUFFICIENT_FROM_PRIOR` (new verdict).
3. Otherwise → `THIN` (ask).

Redirects play no part in the audit: reopening happens live in the current session via "Ask me again" (see Operations), after the audit has already selected questions. Retraction affects the *next* round the ordinary way — the retracted decision is no longer active, so rule 2 stops covering its area.

`selectQuestionsForAudit` suppresses questions for `SUFFICIENT_FROM_PRIOR` triggers and instead emits a **carried-forward recap item**: the area, the standing answer (rendered from the active decision), and inline Keep / Revise / Retract / Redirect controls. The recap is the first stage of a new round (see UX). The static question bank is unchanged; no LLM question generation is introduced.

**Invariant (acceptance-tested): a question whose area is covered by the active direction is never re-asked unless the writer taps "Ask me again" on that area in the current session's recap.**

### Pre-bank preview (exact resulting active state)

`previewBankFinal` extends to return, in addition to the existing exact block values:

- `directionDiff`: per-area list of `{area, before, after, op}` covering every kept / revised / retracted / superseded / newly asserted decision this bank will commit.
- `directionRevision`: the revision this bank reads (CAS token) — same stale-guard discipline as today.

UI renders the diff above the existing "Exact block values to be written" details block. Preview parity with commit remains an invariant: what `previewBankFinal` returns is byte-identical to what `bank_meeting_memory` writes, or the bank retries/aborts on CAS conflict exactly as today (3 retries on `projection_conflict` / `locks_conflict`).

## Pitch Packet Contract

### Schema

New module `shared/pitchPacket.ts` (Zod, mirroring `shared/documents.ts` conventions). This file is the **single shared contract**; PitchStudio vendors or imports this exact schema. Versioned with a literal `packetVersion`.

```ts
export const PITCH_PACKET_VERSION = 1 as const

PitchPacketField<T> = {
  value: T,
  origin: 'document' | 'meeting' | 'writer' | 'ai_proposed',
  approved: boolean,          // must be true for every required field at export
  sourceRef?: string          // e.g. 'synopsis.header.title', 'story_locks', 'session:<id>'
}

PitchPacketSchema = {
  packetVersion: 1,
  projectId: string,
  exportedAt: string (ISO),
  directionRevision: number,          // revision of active direction at export
  title: PitchPacketField<string>,            // required
  logline: PitchPacketField<string>,          // required
  format: PitchPacketField<string>,           // required
  genre: PitchPacketField<string>,            // required
  tone: PitchPacketField<string>,             // required
  premise: PitchPacketField<string>,          // required
  storyEngine: PitchPacketField<string>,      // required — NEW field, no current home (see below)
  coreCharacters: PitchPacketField<Array<{ name, role, want, need, flawOrWound, secretOrContradiction, arc }>>, // required, ≥1
  locks: PitchPacketField<Array<{ statement, originMarker, rationale? }>>,      // required (may be empty array, but reviewed)
  openQuestions: PitchPacketField<Array<{ text, category? }>>,                  // required (may be empty array, but reviewed)
  comps: PitchPacketField<string[]>,          // supported (optional)
  device: PitchPacketField<string>,           // supported (optional)
}
```

- **Story engine** has no existing field anywhere (verified). It lives *in the packet record only* for this release; it is writer-entered or AI-proposed on the review screen. Promoting it into the document model is out of scope.
- **Core characters** source from StoryBible `characters[]` when present; the composer maps `flawOrWound`/`secretOrContradiction` field names verbatim from `shared/documents.ts`. Meeting free-text character answers surface as review-screen context, not as auto-filled structured records.
- **Locks** render with the existing origin markers `[SEED]/[EXTRAPOLATED]/[INVENTED]` and carry the `LOCKS_PREFACE` sentence from `shared/seedMarkdown.ts` in the `.md` rendering. **Open questions** carry `OPEN_QUESTIONS_PREFACE`. Both prefaces are already exported constants; reuse, don't duplicate.

### Persistence

New table `pitch_packets`: `id uuid` PK, `project_id text`, **`session_id uuid not null references interview_sessions(id)`** (the banked session this packet was exported from), `packet jsonb` (validated against `PitchPacketSchema`), `packet_version int`, `status text` (`draft` | `approved` | `exported`), `direction_revision bigint`, `created_at`, `exported_at timestamptz null`. Index on `(project_id, created_at)` and `(session_id)`.

Relationship semantics:

- Session → packet: query `pitch_packets` by `session_id`, latest by `created_at`. No column is added to `interview_sessions`; its `state` transition to `exported` stays as today.
- Re-export after a further round creates a **new row** carrying the new round's `session_id` and the then-current `direction_revision`. Prior packet rows are immutable artifacts and are never updated.
- At most one `draft`/`approved` packet per session; starting a new review for the same session supersedes (deletes) the un-exported draft row. Exported rows are permanent.

### Export lifecycle (explicit state machine)

Browser downloads cannot be transactional with database state, so **no state depends on download success**:

1. Review screen edits persist to the `draft` packet row.
2. Writer approves the final field → server sets `status:'approved'` (plain write).
3. Writer clicks the export action → **one server transaction**: packet `status:'exported'` + `exported_at` set, session `state:'exported'`. The response returns the persisted packet.
4. Client then generates and downloads both files from the persisted packet JSON (`.md` rendered deterministically from `packet`; `.json` is `packet` itself). File generation is a pure function of the stored row, so the artifacts are regenerable at any time.
5. Failed or repeated download: state unchanged. An exported packet always offers a re-download action; it re-renders the same files from the same row. "Delivered" is a client-side concern only.
6. A failure inside step 3's transaction leaves packet `approved` and session `banked` — retryable, nothing partial.

### Field precedence and conflict resolution

The composer is deterministic. For every field, candidate values rank:

1. Writer-entered value (`origin:'writer'`) — always wins.
2. Approved AI proposal (`origin:'ai_proposed'`, `approved:true`).
3. Default source chain (below) — first non-empty wins for the auto-fill:

| Field | Default source chain |
| --- | --- |
| title | Synopsis `header.title` → Treatment `header.title` → StoryBible `cover.title` → project meta title |
| logline | Synopsis `logline.text` → Treatment `logline` |
| format, genre, comps | Synopsis header → Treatment header/`compsAndReferences` |
| tone | Treatment `concept.tone` → StoryBible `toneAndStyle.toneWords` (joined) |
| premise | StoryBible `premiseAndWorld.premise` → Treatment `concept.premise` |
| coreCharacters | StoryBible `characters[]` → Synopsis `characters` |
| locks | Meeting `story_locks` fold (canonical) + StoryBible `locks[]` appended as document-origin entries; exact-statement duplicates deduped |
| openQuestions | Meeting `open_questions` block (canonical) + Treatment `openQuestions.*` appended; exact-text duplicates deduped |
| storyEngine, device | No source chain — writer or approved proposal only |

**Conflict rule**: when two sources yield non-empty, differing values for a scalar field, the composer auto-fills from the chain but marks the field `conflict: true` with all candidates listed; a conflicted field cannot be approved until the writer picks or edits a value. The composer never silently merges conflicting scalars. List fields (locks, openQuestions, comps) union-with-dedupe and label each entry's origin instead — origin labeling *is* the conflict surface there.

### Review and approval flow

1. Writer triggers export from the banked stage (same placement as today's button).
2. Composer assembles a draft packet per the precedence table: document-model fields auto-filled with `origin:'document'`, Meeting-sourced fields with `origin:'meeting'`, gaps left empty, conflicts flagged.
3. For each empty required field, the runtime may generate a proposal (`origin:'ai_proposed'`, `approved:false`). Proposals must derive from actual project content (documents, seed, banked answers) — context-hollow proposals are a defect, consistent with the standing agents-must-be-context-aware requirement.
4. Review screen shows every field with origin badge; writer edits (→ `origin:'writer'`) or approves each. Required fields block export until `approved:true`.
5. Approve → packet persisted `status:'approved'` → download buttons enabled.

### Export artifacts

- **`.json`** — the `PitchPacketSchema` object, pretty-printed. The machine contract; PitchStudio's future direct import consumes exactly this.
- **`.md`** — human-readable rendering: YAML frontmatter (`packet_version, title, logline, format, genre, tone, device, comps, exported_at, direction_revision`) + sections (Premise, Story Engine, Core Characters, Locks — do not violate, Open Questions — invent here). Renderer lives beside the schema in `shared/` (client-callable, like `composeSeedMarkdown`; no server route required for download).
- Delivery: real browser downloads via the existing `downloadTextFile` utility used by `handleExportSeed`. Both files always offered; filename pattern `<slug>-pitch-packet-v<packetVersion>-r<direction_revision>.{md,json}`.

### Future direct-import boundary

- The `.json` artifact is the wire format. When direct import ships, WriterOS exposes the same object over an authenticated endpoint; PitchStudio validates with the shared schema and rejects unknown `packetVersion` (no silent coercion).
- Compatibility rule: additive optional fields do not bump `packetVersion`; any change to a required field's shape or semantics does. WriterOS export and PitchStudio import must both pin supported versions explicitly.
- Nothing in this release calls PitchStudio over the network.

## Backward compatibility and migrations

All migrations additive, in the existing `supabase/migrations/` sequence style (content asserted by migration tests, per `sharedMemoryContractMigration.test.ts` pattern):

1. `meeting_decisions` table + indexes (`project_id`, `session_id`, GIN on `targets`).
2. `pitch_packets` table.
3. Extend `bank_meeting_memory` (or add a wrapping RPC `bank_meeting_round`) to write ledger entries in the same transaction as block writes and `bank_snapshot`. Existing RPC signature preserved for compatibility during rollout; old callers keep working.
4. **Read-time fallback + optional explicit backfill.** Projects with pre-feature banked sessions work without any backfill: the audit context builder derives coverage from `bank_snapshot.applied_classifications` in memory when the ledger is empty for a session — **a read never writes**. Status reads (`getInterviewStatus`) and audits are strictly read-only. Separately, an explicit, manually-run, idempotent backfill operation (script or one-shot migration) may materialize `assert` ledger entries from existing snapshots; it is re-runnable and skips already-derived entries. Backfill is optional operator hygiene, not a correctness requirement.
5. No changes to `memory_blocks` shape, labels, caps, sentinels, or attachments. No document-model schema-version bump.

Sessions banked before this feature remain valid, viewable, and included in `projectConceptSeed` exactly as today.

## Failure behavior

- **Memory unavailable**: reuse the existing turn-boundary 503 guard posture (`roomRoutes.ts` / `runRoomTurn.ts`) — visible, composer-closing, retryable; never hollow fallback.
- **CAS conflict at bank** (`projection_conflict`, `locks_conflict`, new `direction_conflict`): retry up to 3× re-reading snapshots, exactly today's loop; on exhaustion surface a retryable error, session stays in `readback`, nothing partially committed (single transaction).
- **Packet validation failure at export**: blocked with per-field errors on the review screen; no file produced; no state transition.
- **Download failure** (browser-side): packet row is already `exported` (the export transaction precedes file generation); writer re-triggers download from the exported packet without re-review; no state change.
- **AI proposal failure**: field stays empty with a "proposal unavailable" note; writer can always type the value. Proposal failure never blocks the review screen from rendering.
- **Ledger/fold invariant violation detected at read** (targets referencing missing entries): fail loud in dev/tests; in product, exclude the malformed entry from the fold and log a runtime event (observability below).

## UX copy (exact strings)

- Round CTA (unchanged mechanism): `Project Meeting` / `New interview round`.
- Recap stage header: `What's standing from earlier rounds`.
- Recap item controls: `Keep` · `Revise` · `Retract` · `Ask me again` (the redirect op's writer-facing label — "redirect" is internal vocabulary).
- Suppressed-question note (per recap item): `Answered in Round {n}. We won't re-ask unless you reopen it.`
- Retract confirm: `Retracting removes this from your project's active direction. Your Round {n} answer stays in the record.`
- Pre-bank diff header: `Exactly what this round changes` (above the existing `Exact block values to be written`).
- Export button: `Export to PitchStudio` (unchanged label).
- Review screen title: `Pitch Packet review`.
- Origin badges: `From your documents` / `From the Meeting` / `You wrote this` / `Suggested — needs your approval`.
- Export blocked state: `Approve every required field to export.`
- Success state: `Pitch Packet exported. Two files downloaded: Markdown and JSON.`
- Never surface: "story-coach" (internal-only pattern name), "assert", "ledger", "fold", "projection".

## Observability

- Ledger writes, fold computations at audit time, packet composition, AI proposals, and exports each emit runtime trace events consistent with `agent-observability-provenance-prd.md`.
- Every exported packet records `direction_revision` and per-field `sourceRef` — a complete provenance chain from artifact back to session/answer/document.

## Acceptance criteria

Meeting revisions:

1. Round 2 started after a banked Round 1 opens with the recap stage listing every active decision from Round 1.
2. A required question answered and mapped in Round 1 does not appear in Round 2's question list.
3. `Ask me again` (redirect) on a recap item appends a deduped element to `cursor.redirects` and exactly that area's question re-enters the current session's reconstructed question list; answering it stamps `answered_at`; the `redirect` ledger entries are written at bank; the redirect has no effect on any later round's audit.
4. Revise replaces the standing decision; the old content is absent from the active direction and present in Round 1's immutable record.
5. Retract removes the decision from the active direction; the area's question becomes eligible in the *next* round; `story_locks` Meeting section no longer renders the retracted lock; Round 1's `bank_snapshot` still contains it.
6. Supersede targeting two prior decisions renders one new decision and deactivates both targets.
7. Pre-bank preview shows the per-area diff and the exact block values; committed values are byte-identical to the preview or the bank retries/fails with no partial write.
8. Same-session bank idempotency: a second bank call against an already-banked session is a no-op returning the banked session (existing behavior, `runtime.ts:295-298`, preserved with ledger writes added). Note: "two concurrent banks on one project" is an unreachable state — the partial unique index allows only one active session per project — so no cross-session concurrency criterion exists. The defensive `direction_conflict` CAS retry path (for non-bank writers touching the same blocks) is covered by a focused unit test, not an integration scenario.
9. A project with pre-feature banked sessions and no backfill: new round audit still suppresses questions covered by `bank_snapshot`-derived coverage; nothing errors; no read path writes ledger entries.

Pitch Packet export:

10. Export from a banked session opens the review screen with document-sourced and Meeting-sourced fields auto-filled and origin-labeled.
11. Empty required fields receive AI proposals grounded in actual project content; each is marked needs-approval and blocks export until approved or replaced.
12. Export with all required fields approved downloads both `.md` and `.json`; the `.json` validates against `PitchPacketSchema`; the `.md` frontmatter and sections match the renderer spec.
13. The packet row persists with `status:'exported'`, `packet_version:1`, and the `direction_revision` current at export; session transitions to `exported`.
14. Re-export after a further round produces a new packet row reflecting the updated direction; the prior packet row is unchanged.
15. Export is blocked with per-field errors when any required field is unapproved; no file downloads; no state transition.
16. TypeScript clean, full Vitest suite green, production build green.

## Test matrix

Following existing patterns: pure-function unit tests; store tests via `__setRoomDbForTests` fakes; route tests over live Express with `vi.mock`; RTL component tests; migration-content tests; env-gated real-DB integration (`tests/integration/`, throwaway `itest-` project ids with cleanup).

| Layer | Suite (new or extended) | Covers |
| --- | --- | --- |
| Unit | `meetingDecisionsFold.test.ts` | fold determinism; active-set rules per op; malformed-targets exclusion; empty-ledger ≡ current behavior |
| Unit | `interviewAudit.test.ts` (extend) | coverage precedence: new seed > active/prior coverage > `THIN`; `SUFFICIENT_FROM_PRIOR` verdict; speculative `world_rules` interaction (redirects never enter the audit) |
| Unit | `interviewStateMachine.test.ts` / `interviewRuntime.test.ts` (extend) | `cursor.redirects` as session-local queue: deduped append; reconstruction includes unanswered redirects after base questions; `answered_at` stamp removes from list; absent field = `[]` (pre-feature cursors); pause/resume preserves redirects; bank converts elements to `op:'redirect'` ledger entries |
| Unit | `interviewQuestionBank.test.ts` (extend) | suppression + recap emission; no-repeat invariant |
| Unit | `lockSections.test.ts` (extend) | fold-driven Meeting-locks rendering; retraction removes line; surface section untouched |
| Unit | `interviewBanking.test.ts` (extend) | `directionDiff` construction; mutability defaults unchanged |
| Unit | `pitchPacket.test.ts` | schema validation; required-field approval gate; version literal; composer precedence chains; scalar-conflict flag determinism; list union-dedupe |
| Unit | `pitchPacketMarkdown.test.ts` | `.md` renderer: frontmatter keys, sections, prefaces reused from `seedMarkdown` |
| Store | `interviewStore.test.ts` (extend) + `meetingDecisionsStore.test.ts` | ledger insert/read; packet persist; snapshot+revision reads |
| Migration | `meetingRevisionsMigration.test.ts` | SQL content: tables, indexes, RPC transaction covers ledger + blocks + snapshot; backfill idempotence |
| Route | `roomRoutesInterview.test.ts` (extend) | recap payload; op endpoints; preview diff; export/review/approve endpoints; 503 guard on all new routes |
| Component | `ProjectMeetingPage.test.tsx` (extend) | recap stage controls; `Ask me again`; diff render; export → review screen |
| Component | `PitchPacketReview.test.tsx` | origin badges; approval gating; conflicted field blocks approve until writer picks; blocked-export copy; export-then-download order; re-download from exported packet |
| Integration (env-gated) | `sharedMemoryContract.integration.test.ts` (extend) or `meetingRevisions.integration.test.ts` | real-DB bank with ledger in one transaction; same-session bank idempotency; read-time fallback on seeded legacy sessions (no writes); packet row lifecycle incl. export transaction |
| Unit | `bankMeetingMemory.test.ts` (extend) | defensive `direction_conflict` retry loop (focused unit test — the cross-session concurrent-bank scenario is unreachable and deliberately not tested) |
| E2E smoke (manual runbook) | extend `docs/writers-room-phase1-runbook.md` | two-round flow with one revise + one retract + one redirect; full export with one AI proposal approved |

## Rollout

1. Ledger + fold + migrations (no behavior change; audit still legacy).
2. Context-aware audit + recap stage + operations (Meeting behavior change ships).
3. Pre-bank diff preview.
4. Pitch Packet schema + review screen + real downloads; retire the `<pre>` skeleton path.
5. Runbook update + live two-round smoke.

Single branch, single PR is acceptable if reviewable; otherwise split PRs along the order above. Known bugs found during any step are fixed and shipped before the next slice begins — no deferred debt.

## Open questions

1. Does PitchStudio still need the 20-subsection Development skeleton as an *import* format, or does the packet `.json` fully replace it? (Owner: Ben, with PitchStudio hat on. Until answered, `exportCheck.ts` stays in the tree unused by the UI.)
2. Should `Revise` on a lock allow changing its mutability class (`locked`/`leaning`/`open`) in the same gesture, or is that a separate control? (Default in this PRD: same gesture — content and mutability edited together.)
3. ~~Backfill timing~~ — resolved 2026-07-14: read-time fallback with no writes; explicit idempotent backfill is optional and manually run (Migrations item 4). Status reads never mutate state.
