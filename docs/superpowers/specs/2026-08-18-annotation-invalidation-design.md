# Annotation Invalidation (Lean Producer) — Design

2026-08-18. Approved in conversation; completes the invalidation contract of
`docs/synthesis-agent-v1-design.md` (fingerprints §106-121, event table §157, transitions
§162-165, verification items 6-7). The consumer path shipped with the What's Standing
panel: invalidated questions re-derive as new and are re-proposable
(`tests/server/annotationStore.test.ts`, "invalidation aftermath").

## The reframing this design rests on

Confirmed in code and pinned by the store's own tests: a record's `claim`/`detail` can
never change in place, and no record is ever removed from `snapshot.records` — every
ledger event mutates only `status`, `updatedAt`, `supersedes`, or `source.authority`;
"editing" is publishing a sibling record with a new id. The producer's triggers are
therefore unreachable through normal app use today. They are reachable through a restored
backup whose memory ledger and annotation log come from different moments, or a
hand-edited/corrupted ledger — real scenarios for this user. The lean producer defends
those, completes the design contract, and is the machinery any future edit path will need.

## Goal

Never show the writer a resolution whose premise has moved, and durably reopen such
questions — without the report read path ever writing.

## Hard constraint

The report GET and CLI `report`/`questions` are contractually read-only
(`tests/server/whatsStandingReadHelper.test.ts` byte-compares `memory/` before and after;
`whatsStandingReadOnly.test.ts` likewise). Detection must therefore work read-side without
events; events are written only on paths that already hold the package write lock, plus
one explicit CLI command.

## Part 1 — Shared staleness detection (read-only)

`recordLanguageFingerprint` moves from `server/projectMemory/annotationStore.ts` to
`shared/projectMemoryAnnotations.ts` (the same move `annotationIdFor` made; the store
re-exports it so no import site breaks).

New shared function beside it:

```ts
export type AnnotationStaleness =
  | { stale: false }
  | { stale: true; cause: 'language-changed' | 'record-removed'
      changedRecordId: string; previousContentHash?: string; currentContentHash?: string }

export function annotationStaleness(
  support: RecordLanguageFingerprint[],
  snapshot: ProjectMemorySnapshot,
): AnnotationStaleness
```

Walks the support array in order; the FIRST divergence wins (matching the event schema's
single `changedRecordId`). A support record id absent from `snapshot.records` →
`record-removed` (with `previousContentHash` from the stored fingerprint, no current). A
present record whose `recordLanguageFingerprint(record).contentHash` differs →
`language-changed` with both hashes. Otherwise `{ stale: false }`.

Status, supersedes, and safety are invisible to this function by construction — it
compares only language hashes — which is what keeps the two pinned guardrails true: a
status flip never invalidates; an unrelated publish never invalidates.

## Part 2 — Read-side surfacing

**Readiness** (`shared/compose/whatsStandingReadiness.ts`): an `approved` annotation whose
`annotationStaleness(...)` is stale becomes an unresolved reference with new state
`'stale'` (added to `UnresolvedReferenceState`). Its warning message names the changed
record and says the resolution no longer holds. The report flags INCOMPLETE exactly as for
other unresolved states.

**Renderer** (`server/compose/whatsStandingRenderer.ts`): `resolutionText` returns
undefined for a stale approved annotation — the cue block renders the "this report does
not resolve what that refers to" line instead of a resolution whose premise moved. The
referent ids of a stale annotation are also not added to `sourceFieldIds` (they may cite a
removed record; a fresh answer will re-cite).

**Fact sheet** (`shared/compose/whatsStandingFactSheet.ts`): unchanged — it already skips
referents missing from the snapshot, and extra fields for stale-but-present referents are
harmless.

**Source hash** (`shared/compose/whatsStandingSourceHash.ts`): the report now depends on
annotation support fingerprints (staleness drives the banner and resolution rendering),
but the hash covers only the fact sheet plus the two revisions — and tampering a stored
support hash changes the report while moving NEITHER revision. The hash therefore gains a
canonical annotation digest: for each annotation in annotation-id-sorted order, its
`status`, `declineReason` (a plain decline settles the report; cant-say keeps it
INCOMPLETE — same status, opposite reports), `locator`, `referentRecordIds`, and
`support` array. Tests: identical snapshot and revisions with fresh vs tampered support
produce different source hashes; identical everything with only `declineReason` changed
produces different hashes.

**Declined re-ask** (`server/projectMemory/annotationStore.ts`,
`derivePendingQuestions`): a `declined` annotation (both reasons) whose staleness check
fires is re-asked — it re-derives as a `new` question exactly like an absent or
invalidated annotation, fulfilling the design's "suppresses re-asking while the language
it was judged against is unchanged." No event is needed: `declined → proposed` is already
a legal transition, and the eventual `propose` records fresh support. An `approved`-stale
annotation is NOT re-asked here — the transition table forbids proposing over `approved`;
it must be invalidated first (Part 3). Until then it appears in the banner only.

**Store-enforced, not merely hidden:** the parent design (§163-164) says the store
enforces the declined-re-propose fingerprint check, and today `propose` accepts any
declined annotation. `propose` therefore refuses — under its lock, before any write —
to re-propose a `declined` annotation whose `annotationStaleness(existing.support,
current)` is `{ stale: false }`, with an `AnnotationStoreError('conflict')` naming the
rule ("this question was declined and the wording it was judged against has not
changed"). Direct-store regression test required: fresh decline → propose rejected, log
byte-identical; tampered decline support → propose succeeds.

## Part 3 — Durable producer

New method on the annotation store:

```ts
invalidateStale(projectPath: string): Promise<InvalidatedAnnotation[]>
// InvalidatedAnnotation = { annotationId: string; cause; changedRecordId: string }
```

Under one `withLock` (with the existing lock-time identity re-read): replay the log, read
the snapshot via `readSnapshotReadOnlyInHeldLock`, and for every annotation with status
`approved` whose `annotationStaleness` fires, build one `annotation-invalidated` event —
`cause`, `changedRecordId`, `previousContentHash`/`currentContentHash` as the staleness
result provides them, `annotationRevision` strictly sequential across the batch. ALL
events are preflighted (schema + replay rules, the existing `preflightAnnotationEvent`)
against the threaded state before ANY append, preserving the store-wide rule that an error
path never changes the log. Returns the list of what it invalidated (empty list = no-op,
no write, no revision change).

**Automatic invocation:** `propose` and `answerQuestion` run the same detection at the
start of their existing locked section and prepend any invalidation events to their own
event batch (revisions threaded through). Cost in the common case: one fingerprint
comparison per approved annotation against the snapshot already in hand — no extra I/O.
`approve`/`decline` are not sweep points: they operate on an explicitly `proposed`
annotation and already refuse if its own premise moved.

## Part 4 — CLI command

`npm run memory -- invalidate --project <path>` → calls `invalidateStale`, prints one
line per invalidated annotation (id, cause, changed record id) or "Nothing to invalidate —
all resolutions still hold." Exit 0 in both cases; store errors map through the existing
`AnnotationStoreError` exit-code contract (2 bad input / 3 corrupt or conflict). This is
the recovery tool for the restored-backup scenario and the only way to settle an
approved-stale annotation when the writer has nothing else to answer.

## Explicitly not in this slice

- No memory-ledger changes of any kind (design §198) — the producer only appends to
  `memory/annotations.jsonl`.
- No new panel UI. Stale items surface through the existing banner; the card appears once
  a sweep has invalidated the annotation. A dedicated "reopen" button is future work.
- No `phraseHash`-based partial matching — staleness is whole-record language, matching
  what the fingerprints actually store today.
- No scheduler/watcher. Sweeps run on writer paths and on demand.

## Testing

Drift is simulated by tampering stored `support` contentHashes in `annotations.jsonl`
(legal: the log is data; records themselves are immutable through the API), or by
constructing snapshots in memory for the shared helpers.

- `annotationStaleness` unit tests: clean; language-changed (hash mismatch, both hashes
  present); record-removed (id absent, previous hash only); first-divergence-wins when two
  supports moved; status/supersedes flips on the support record → `{ stale: false }`.
- Readiness: approved+stale → `unresolved_reference` warning with `(stale)` state and the
  report flags; approved+fresh → clean (existing test still passes).
- Renderer: stale approved annotation renders the unresolved line, not "You resolved
  this", and cites only the referencing record.
- Store `invalidateStale`: tampered approved support → one invalidated event with correct
  cause/hashes/revision; two stale annotations → two events, sequential revisions; nothing
  stale → returns [], log byte-identical; declined/proposed annotations untouched by the
  sweep; after the sweep the question re-derives as `new` and `propose` succeeds
  (consumer-path integration).
- Sweep-on-write: tamper an approved annotation's support, then `answerQuestion` a
  DIFFERENT question → both the invalidation event and the answer land in one locked
  batch, revisions sequential, all preflighted (failure of the answer leaves the log
  byte-identical including no invalidation events).
- Declined re-ask: tampered declined support → `pendingQuestions` re-asks as `new`;
  untampered declined stays suppressed (existing test).
- Guardrails re-asserted: flipping a support record's status via a real supersession does
  not invalidate; an unrelated publish does not invalidate.
- Source hash: same snapshot + same revisions, fresh vs tampered support → different
  hashes; declined vs cant-say with all other digest fields equal → different hashes;
  annotation-free reports keep their current hash (backward compatible).
- Store gate: propose over a fresh decline → conflict, log byte-identical; over a stale
  decline → succeeds with fresh support recorded.
- CLI: `invalidate` on a stale package prints the line and writes the event; on a clean
  package prints the no-op line and writes nothing (byte-compare).
- Read-only contracts unchanged: existing byte-compare tests on report/questions must
  still pass with the readiness changes in place.

## Verification

`npm run check`, `npm run test:run`, `npm run build`. Live check: `writeros-backup` first,
then on a scratch copy of a real package, tamper one approved support hash, run the CLI
`invalidate`, and confirm the panel re-asks the question end to end.
