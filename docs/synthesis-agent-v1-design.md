# Design — "What's Standing", v1

Status: **revision 5** — cleared to build; questioning retained by writer's decision; struck-record display fixed
Author: Claude, 2026-08-18
Repo: `~/Projects/WriterOS`

Revision history: r1 proposed a parallel Markdown-and-linter stack (rejected — WriterOS already
composes documents). r2 rebuilt on the compose pipeline (rejected — annotations could contradict
authoritative canon; the pipeline could not represent the document). r3 narrowed annotations to
reference resolution (rejected — discrepancy detection undefined, annotations could not identify
the words they resolved, declines could not enforce their own re-ask rule). Every finding across
three rounds was verified against the code; every one was correct.

Supersedes `docs/canon-prose-rendering-plan.md`, whose Phase A shipped as a formatter (PR #68).

---

## Two decisions from the throwaway test (2026-08-18)

A disposable mock was generated from Stool Pigeon's real memory and read cold. Ben answered the
question that the old canon had misled him on a day earlier, and got it right. Two consequences:

**Questioning is retained, for a product reason rather than a correctness one.** The cold read
passed *without* annotations, which by the review's own rule would cut them from v1. Ben's reason
for keeping them: "I like to be queried. It makes me sharper." That is a legitimate reason and it
is recorded here so the capability is not later deleted as unnecessary — the evidence says it is
not required for comprehension, and the decision to build it anyway is deliberate.

**Struck records must not sit under "In force".** The mock listed a record reading "STRUCK — do not
use as couple-engine" under the heading *In force*, with `Standing: active`. Both statements are
true — it is an active canon record — but together they read as the opposite of what the record
says. Records whose own wording carries a struck or superseded cue are displayed in a separate
section, still labelled with their true structured standing, never mixed in with clean decisions.
Getting this wrong recreates the confusion the report exists to prevent.

The mock also confirmed the report's value comes from putting the record's own qualifying sentence
directly beneath the decision. That stays.

## What is being built

**"What's Standing"** — a report telling Ben, cold, weeks later: which decisions are in force,
which the record says were replaced, which are contested, and which questions are open. First
profile because it has a proven failure to prevent (he read a struck canon entry, concluded the
record was backwards, and nearly overwrote correct canon), needs the least invention, and still
exercises questioning, persistence, staleness and traceability.

**v1 contains no model call at all.** That is new in r4 and it falls out of the other decisions:
the report is rendered by template, and the only questions it asks are triggered by an explicit
lexical cue list rather than proposed by a model. Nothing untrusted reaches a prompt, so the whole
injection surface disappears from v1 rather than being defended. When a later profile needs
authored prose, it goes through the existing compose contracts, and the question-proposer contract
specified in r3 — inert-data framing, typed output, record-id allowlist, bounded count, injection
tests — is what it must satisfy. Recorded here, deliberately unbuilt.

## The report claims nothing about relationships

r3 said the report would flag a discrepancy when a record's prose disagreed with its `supersedes`
field. To do that, deterministic code must first recognise that "Superseded by beats 9–11" *asserts
supersession* — that is a relation grammar, and a wrong one silently misreports canon.

v1 does not build one. It **prints the qualifier and claims nothing.** Under each standing decision
it shows the record's own sentence verbatim, with any resolved references rendered as links, and
separately shows the structured `status` and `supersedes` fields as the memory store holds them.
Ben sees both and draws the conclusion. The report never says "these disagree", because it has no
sound way to know.

A narrow relation grammar is a later profile's problem, argued on its own merits.

## What triggers a question, then

A **reference cue list** — explicit, narrow, testable, no semantics: phrases matching patterns such
as `superseded by …`, `replaces …`, `see …`, `per …`, and beat-range forms like `beats 9–11`. A cue
match asserts only *this phrase appears to point at something*. It never asserts what the relation
is. The list is data, reviewed like any other rule set, and each pattern has tests.

## Annotations resolve references, and say where

`ProjectMemoryRecordSchema` (`shared/projectMemory.ts:105`) already owns authoritative `status` and
`supersedes`. Annotations never speak about either — that would be a second source of truth for a
fact the store owns. The only annotation kind in v1:

| Question type | Answer shape |
|---|---|
| `resolve-reference` | multi-select over an allowlist of record ids, or "can't say" |

An approved annotation persists **the location of the words it resolved**, not just a record id:

- `field` — `claim` or `detail`
- `phrase` — the exact matched text
- `occurrence` — index, since a phrase can appear more than once
- `phraseHash` — hash of the phrase plus a bounded window of surrounding text
- `referents` — the selected record ids

Without this an annotation is unreconstructable: a record id and an opaque question fingerprint
cannot tell you which words were resolved. It also means **the server renders the question text
from this structure** — fixed framing, quoting the phrase in context. No model authors the framing,
so an untrusted claim cannot shape what Ben is asked.

**No free-text answers.** Prose typed instead of a selection is not parsed and not stored; it is
shown back with two routes — file it as a memory candidate through the existing promotion path, or
discard. The question's shape decides the species of answer; nothing judges it after the fact.

**"Can't say" is a durable unresolved outcome**, not an approved annotation. It suppresses
re-asking while the referenced language is unchanged, and keeps readiness incomplete.

## Fingerprints cover language, not standing

There is no per-record revision — records carry `updatedAt`, and the snapshot's single `revision`
moves for unrelated events, so neither can establish whether a referenced record changed.

Fingerprints therefore cover **the referencing language and the referent's identity**:

- for the referencing record: `phraseHash` plus a hash of `claim` and `detail`
- for each referent: its id and a hash of `claim` and `detail`
- for a referenced conflict: its id, `leftRecordId`, `rightRecordId`, `reason`, `status`

`status` and `supersedes` are deliberately **excluded** from record fingerprints. A decision moving
from in-force to superseded does not change what a phrase denotes, and including it would re-ask a
question whose answer is still right. The report reads standing fields live at render time instead.

Invalidation fires when any covered fingerprint changes. Global revision is a cheap pre-check only.

## Compose pipeline: what must change

1. **A deterministic path.** `composeFromRecipe` (`server/compose/index.ts:26`) always calls the
   model. Add `composeDeterministic(factSheet, recipe, renderer)`. `RecipeSection`
   (`shared/compose/types.ts:21`) carries headings, style and field ids but **no templates**, so the
   profile supplies a **block renderer** — a pure function from section plus facts to
   `ComposedBlock[]`. Shared finalisation and the applicable fidelity checks —
   `missing_provenance`, `dangling_source_id`, `coverage` — run afterwards exactly as they do for
   model output. `injection_echo` and `entity_diff` are model-output checks; skipping them is
   explicit in code, not incidental.
2. **Run provenance.** `ComposedDocument` gains an optional `run`: `snapshotRevision`,
   `annotationRevision`, `runId`. Optional keeps existing documents valid. `model` becomes nullable
   for deterministic runs.
3. **Storage is a report collection, not a document slot.** `ProjectDocumentsSchema`
   (`shared/documents.ts:576`) holds four singleton authored surfaces. A report is neither singleton
   nor authored — it is a versioned run artifact. Add a separate `generatedReports` collection keyed
   by profile and run id, so the second profile costs no schema change. Its own route and client
   surface.
4. **Surface enum.** `ComposeSurface` admits the new surface; the token-limit entry is unused
   deterministically but the type requires it.

Per-type modules follow the existing convention in `shared/compose/`: `whatsStandingFactSheet.ts`,
`whatsStandingReadiness.ts`, `whatsStandingRecipe.ts`, `whatsStandingSourceHash.ts`. The fact source
is project memory plus approved annotations.

## Annotation log: distinct schema per event

`memory/annotations.jsonl`, replayed to current state. Per event:

| Event | Payload |
|---|---|
| `annotation-proposed` | annotation id, question type, target record id, `field`, `phrase`, `occurrence`, `phraseHash`, candidate id allowlist, **support fingerprints**, run id, timestamp |
| `annotation-approved` | annotation id, selected referent ids, **support fingerprints** (referencing record, every referent, any referenced conflict), actor, run id, timestamp |
| `annotation-declined` | annotation id, reason (`declined` \| `cant-say`), **support fingerprints**, actor, run id, timestamp — no value |
| `annotation-invalidated` | annotation id, cause, which fingerprint changed with old and new values, timestamp |

Fingerprints appear on proposal and decline as well as approval — r3 required a decline to prove a
fingerprint had moved before re-asking, while storing nothing to compare against.

All carry `annotationRevision`, incremented per applied event. Legal transitions: proposed →
approved | declined; approved → invalidated; declined → proposed only when a covered fingerprint
moved. Anything else is rejected on replay. A malformed line halts replay at that line number and
reports it; later events are unreadable, never skipped.

Annotations are never canon, never returned by `retrieval.ts`, never mutate a record.

## Store boundary: share mechanics, not schema

Its own domain — a sixth memory-ledger event type would leave an older build unable to replay a
ledger it meets. But it reuses the memory store's low-level utilities: package locking, append and
fsync, bounded reads, replay scaffolding. Independent of the memory ledger's schema, coupled to
memory through ids and fingerprints, which is what invalidation is built on.

## Run consistency

**The package lock is never held across a question.** Pin `snapshotRevision` and
`annotationRevision` at run start. Before each answer write, revalidate both plus that question's
fingerprints; if anything moved, re-run readiness and re-ask or drop rather than answering a premise
that no longer holds. Revalidate before committing the artifact; on mismatch refuse and name what
changed. Never emit a report stitched from two states.

## Incompleteness is loud, and settlement lives elsewhere

Declines still produce a report — a refused report is worse than a partial one — but it carries a
**global INCOMPLETE status at the top** naming every unresolved item, plus local markers.

Unresolved items recur every run until memory is fixed, and that is correct. Each one carries a
deep link to the existing review action that settles it. The report never offers a second
settlement path.

## Explicitly not in v1

Any model call; relation grammar; discrepancy claims; subject grouping; story-bible and
director-brief profiles; free-text or creative questions; annotations about status or supersession;
agents reading generated reports (`retrieval.ts` stays their only path); backfilling records; any
change to the memory ledger.

## Inherited constraints

Verified against the code: canon is explicit-only (2026-08-15); projections compare rendered bytes
(`store.ts:634-639`) so reports stay outside that path; agents read the snapshot
(`agentContext.ts:405-407`); the memory ledger has five event types and a sixth breaks older
readers; `tags` feeds retrieval scoring (`retrieval.ts:96-106`) so nothing organizational goes there
— note `buzz.ts:220-221` already writes scoring-visible tags, a pre-existing issue deserving its own
ticket; no upstream tool records what a decision is about, which is why annotations are authored
through questions rather than extracted.

## Verification

1. `npm run check`, `npm run test:run`, `npm run build`.
2. Annotations never reach canon, never appear in retrieval output, never mutate a record.
3. No annotation can express status or supersession — enforced at the schema level, not by
   convention.
4. The report claims no relationship: assert that output contains no discrepancy language, only
   quoted qualifiers plus separately-labelled structured fields.
5. Cue list: each pattern has positive and negative tests; a cue match produces a question, never an
   assertion.
6. Replay: illegal transitions rejected; a declined or "can't say" question is not re-asked while
   its fingerprints hold; a corrupt line halts replay with its line number.
7. Invalidation: editing a supporting record's `claim` invalidates; flipping only its `status` does
   not; an unrelated publish that moves global revision does not.
8. Staleness: a run whose pinned state moves mid-conversation refuses to commit and names what
   changed.
9. Determinism: two runs over identical memory and annotations produce identical blocks.
10. End to end on Stool Pigeon: generate "What's Standing", confirm the struck couple-engine entry
    appears with its own sentence quoted and its `supersedes` field shown separately, and that
    leaving "beats 9–11" unresolved marks the report INCOMPLETE at the top.
11. `writeros-backup` first.

## Open for the reviewer

- The report now shows a quoted qualifier beside structured fields and leaves the reader to
  reconcile them. That is honest, but it is also the same cognitive work that caused the original
  near-miss. Is "show both, claim nothing" actually better for the reader than a narrow, tested
  relation grammar limited to explicit `superseded by` phrasing?
- With no model in v1, the cue list is the only thing that finds referencing phrases. A missed cue
  means a reference is silently never resolved and the reader never learns it existed. Should
  unmatched-but-suspicious text be surfaced somewhere, or is silence acceptable for v1?
- `generatedReports` keyed by profile and run id will accumulate. What prunes it, and does an old
  report pinned to a superseded snapshot revision need marking as historical when opened?
