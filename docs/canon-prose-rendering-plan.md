# Plan — Render `canon.md` as readable prose, grouped by subject

Status: **revision 3** — Phase A approved for implementation; Phase B to be reviewed separately; Phase C deferred (2026-08-17)
Author: Claude, 2026-08-17
Repo: `~/Projects/WriterOS`, branch off `main`

Revision 1 was reviewed and rejected: Phase A sound, Phases B and C required redesign. All six
findings were independently verified against the code before this rewrite; all six were
correct. What changed is summarised at the end.

---

## Context

Every WriterOS project keeps its settled story decisions in `memory/canon.md`, regenerated
whenever memory changes. It is the artifact a writer reads to answer "what have I actually
locked?"

Today it is unreadable. Each record renders as an H2 heading containing the whole decision,
followed by three lines of bookkeeping:

```markdown
## One\-sheet: a zoo trainer and the detective who chose the badge over her get a second
   shot when her escaped parrot overhears a crime boss's misdeed — and won't stop
   squawking about it.

- Memory ID: mem\_ec1e180e85a0186a8e65fd94849f0d12
- Source: writeros · file:///Users/ben/Projects/buzz-writers-room/...
- Updated: 2026-08-17T03:47:59.510Z
```

Three problems, all visible above:

1. **Inverted structure.** The decision is crammed into a heading; the body carries only
   metadata. No grouping, so 13 unrelated decisions sit as 13 sibling sections.
2. **Over-escaping.** `escapedInline` escapes every hyphen, paren and underscore, producing
   `One\-sheet` and `\(also an open question\)`.
3. **Lost relational context.** Clauses like "Superseded by beats 9–11" are buried, so records
   read as free-floating. This already caused a real error: reviewing this output, the writer
   concluded a correct canon entry was wrong and nearly overwrote it. The clause that would
   have settled it was present but unreadable.

Intended outcome: `canon.md` reads like a story document — prose, grouped by subject,
provenance demoted but never lost — while remaining a deterministic projection of the snapshot.

## Why the rendering change itself is low-risk

- **`canon.md` is a pure projection.** `store.ts:625-626` regenerates `canon.md` and
  `review.md` wholesale from the snapshot via `atomicReplace` on every write. No data exists
  only in these files.
- **`store.ts:634-639` self-heals.** It reads both files back and compares against a fresh
  render; a mismatch rewrites them. Changing the renderer therefore regenerates every project
  on next access, with no migration step.
- **No agent reads `canon.md`.** `agentContext.ts:405-407` builds agent context from the
  snapshot via `retrieval.ts` / `renderContext.ts`. Morgan, the Writer's Room seats and
  document tabs are unaffected by Phase A.

## Hard constraints

**C1 — The renderer is a pure function of the snapshot, and nothing else.** The self-heal check
compares `renderCanonProjection(snapshot)` against file bytes. Any input outside the snapshot —
a sidecar file, the clock, locale, model inference — makes the store rewrite files it should
leave alone. *(Revision 1 violated this with a `memory/subjects.md` ordering file. Removed.)*

**C2 — Canon text is untrusted.** Escaping may become more surgical; it may not be removed.
Prose bodies must not be able to introduce headings, list structure, fenced blocks, or raw HTML.

**C3 — No clause may be dropped.** Supersession, dependency and scope qualifiers carry the
meaning. The renderer may re-wrap and re-punctuate; it may never truncate a claim or detail.

**C4 — Nothing becomes canon by rendering.** Presentation only. No phase alters a record's kind,
status, claim, or authority.

**C5 — Subject metadata must not change agent retrieval.** `relevanceScore`
(`retrieval.ts:96-106`) normalises `record.tags` and scores them against the query message,
surface and persona lane. Anything stored in `tags` changes which records agents see.
*(Revision 1 proposed `subject:` tags. Removed.)*

---

## Design

Three phases. **Phase A ships alone, as its own PR.** B and C follow separately, because A is
presentation-only and B/C touch stored records.

### Phase A — Prose rendering (`projections.ts`) — ship first

Rewrite `renderRecord`, `renderCanonProjection` and `renderReviewProjection`. Same inputs, same
filters (`kind === 'canon' && status === 'active' && safety === 'clear'`), new output:

- **Claim becomes body prose,** not a heading. Detail follows as its own paragraphs.
- **Provenance demoted** to the end of each entry — memory ID, source URI, updated timestamp,
  authority, spoiler flag. Everything currently emitted is still emitted.
- **No raw HTML in output.** Revision 1 proposed a `<details>` block; that requires emitting raw
  HTML, which turns any claim containing `</details>` or `<!--` into a structure break. Use a
  plain indented metadata line or a horizontal-rule-separated footer instead.
- **Structural escaping only.** Replace the blanket `([\\`*_\[\]{}()<>#+>!|~\-])` class with an
  `escapeBlock(text)` for paragraph bodies that neutralises only what breaks structure *at the
  position it appears*: leading `#`, leading `-`/`+`/`*`/`>`/digit-dot markers, four-space
  indents at line start, backticks and `~~~`, pipes, raw `<`, and setext underlines (`===`,
  `---` on their own line). Inline hyphens, parens and underscores in running prose stay
  literal. Keep the existing `escapedInline` unchanged for headings and metadata.
- **Header** carrying revision, last-changed date, and counts (settled / open / awaiting review).

Sections appear in existing record order in Phase A. Grouping arrives in B.

### Phase B — Subject as a first-class field

C5 rules out `tags`. C1 rules out inferring subjects at render time.

- **Storage.** Add `subject?: string` as an optional field on the memory record schema in
  `shared/projectMemory.ts`, alongside `tags` and `entities`. Optional and additive: existing
  records simply lack it, so no data migration and no change to dedupe, authority or retrieval.
  Retrieval must continue to ignore it — assert this with a test rather than assuming it.
- **Subjects are untrusted text too (C2).** A subject becomes a section heading, so it passes
  through `escapedInline` like any other heading — it is adapter-supplied and may contain `#`,
  backticks, brackets or newlines. Constrain it in the schema as well: single line, non-empty,
  max length, no control characters.
- **Backward compatibility.** Snapshots and ledger events written before this change contain no
  `subject` and must parse and replay byte-identically. Pin this with a fixture captured from a
  pre-change project — a real one, not a hand-written stub — asserting that loading it, replaying
  its ledger, and re-rendering produces the same result before and after the schema change.
- **Ordering, derived from the snapshot only, fully tie-broken.** `createdAt` values can be
  equal — records published in one import share a timestamp — so ordering must never fall back
  on array position or object key order. Subjects sort by the earliest `createdAt` among their
  records, then by subject string, then by that record's id. Within a subject, records sort by
  `createdAt` then id. Ids are unique, so the total order is deterministic. This is a pure
  function of the snapshot (C1) and reads naturally: the document unfolds in the order the
  story was decided. Records with no subject fall into a final "Everything else" section,
  ordered the same way. Test with a fixture whose records share a `createdAt` to the
  millisecond.
- **Writing.** Adapters (`adapters/wayfinder.ts`, `pitchStudio.ts`, `buzz.ts`) set `subject`
  where their source already knows one — wayfinder from the map section or ticket title,
  PitchStudio from its step, Buzz from the channel topic. Emitting nothing stays a first-class,
  warning-free outcome. New publishes flow through the existing `published` event, so Phase B
  needs no new ledger event.

### Phase C — Backfill existing records — DEFERRED

**Status: postponed by review, 2026-08-17.** Not to be built until a real backfill need exists.
Subjects accrue naturally as records are republished, so the ledger surgery below buys speed,
not capability. Recorded here so the cost is known if the need arrives.

Existing records have no subject, so Stool Pigeon renders entirely as "Everything else" after
Phase B — still far better than today, but not the goal.

Backfill mutates stored records, and the ledger has exactly five event types (`published`,
`promoted`, `rejected`, `conflict-resolved`, `legacy-authority-downgraded`). None updates
metadata. Editing `snapshot.json` directly would vanish on replay. So Phase C requires:

- **A `retagged` event schema** in `shared/projectMemory.ts`, added to
  `ProjectMemoryEventSchema`, carrying record id, before/after subject, and the acting revision.
- **Replay support** in the store's snapshot rebuild, applied in ledger order.
- **The existing write path's guarantees:** package write lock (`acquirePackageWriteLock`),
  manifest verification, and a revision precondition — reject if the snapshot moved.
- **A reviewed-artifact apply, not a re-proposal.** `retag --dry-run` writes a proposal file
  containing the snapshot revision, a snapshot hash, and every before/after pair. `--apply`
  consumes *that file* and refuses if the hash or revision no longer matches. A model may
  generate proposals — it is a one-time authoring step outside the renderer — but apply never
  regenerates them, so what is reviewed is exactly what lands.
- **A downgrade path.** A `retagged` event in the ledger makes plain `git revert` unsafe: an
  older build replaying the ledger meets an event type it does not know. Specify the reader's
  behaviour for unknown event types (ignore-with-warning vs hard fail) before shipping, and
  state the minimum version required to read a ledger containing one.

If that cost is judged too high for the benefit, the honest alternative is to skip Phase C and
let subjects accrue naturally as records are republished.

---

## Files

| File | Phase | Change |
|---|---|---|
| `server/projectMemory/projections.ts` | A, B | The rendering rewrite. ~100 lines, self-contained. |
| `shared/projectMemory.ts` | B, C | Optional `subject` field; `retagged` event schema in C. |
| `server/projectMemory/retrieval.ts` | B | No behaviour change — add a test pinning that `subject` does not affect `relevanceScore`. |
| `server/projectMemory/adapters/{wayfinder,pitchStudio,buzz}.ts` | B | Set `subject` where the source knows one. |
| `server/projectMemory/store.ts` | C | Replay of `retagged`; lock and revision precondition. |
| `server/projectMemory/cli.ts` | C | `retag` command beside `runImport`; proposal-artifact apply. |
| `tests/server/projectMemoryStore.test.ts` | A | Existing projection assertions pin current output and will need updating. |
| `tests/server/projectMemoryRetrieval.test.ts` | B | New assertion for C5. |
| `tests/server/projectMemoryCli.test.ts`, `tests/server/projectMemoryAdapters*.test.ts` | B, C | New coverage for adapter subjects and the retag flow — confirm exact filenames before starting. |

## Verification

Commands, corrected — `npm test` is bare `vitest` and watches:

1. `npm run check` (tsc), `npm run test:run` (vitest run), `npm run build`.
2. **Determinism (C1):** render the same snapshot twice in-process and assert byte equality;
   then load a project through the store twice and assert `canon.md` is not rewritten on the
   second read. Absent this, a violation fails silently as constant disk churn.
3. **No loss (C3):** for a real snapshot, assert every claim and detail appears in full, and
   that records in equals entries out.
4. **Escaping (C2):** unit-test claims containing `# heading`, `- item`, `+ item`, `* item`,
   `1. item`, `> quote`, a four-space-indented line, a fenced block, `~~~`, `|`, raw `<div>`,
   `</details>`, `<!-- comment -->`, and a setext underline (`Title` / `===`). Assert none alter
   document structure.
5. **Retrieval unchanged (C5):** assert `relevanceScore` output is identical for records that
   differ only by `subject`.
6. **End to end:** run against the live Stool Pigeon package (21 records, revision 34, 13 active
   canon) and read the result against `~/wayfinder-harness/drafts/canon-rewrite-stool-pigeon.md`.
   Confirm the struck-couple-engine entry still shows "Superseded by beats 9–11".
7. Run `writeros-backup` first.

## Rollback

- **Phase A and B:** revert the commit. On next store access the self-heal comparison rewrites
  both files. No data migration involved; `subject` is additive and ignored by old readers.
- **Phase C:** not a simple revert — see the downgrade path above. Do not ship C until that
  behaviour is specified and tested.

---

## What changed from revision 1

| Finding | Resolution |
|---|---|
| P1 — `subjects.md` ordering violates C1 | Removed. Subject order derives from earliest `createdAt` in the snapshot. |
| P1 — `subject:` tags alter retrieval (`retrieval.ts:97`) | Removed. `subject` becomes a first-class optional field, with a test pinning that retrieval ignores it (C5). |
| P1 — `retag` lacks durable mutation design | Phase C now specifies a `retagged` event, replay, lock, revision precondition, and a downgrade path — or is deferred. |
| P1 — dry-run and apply can drift | `--apply` consumes the reviewed proposal artifact and rejects it if the snapshot revision or hash moved. |
| P2 — `escapeBlock` misses raw HTML and setext | Output now emits no raw HTML at all (`<details>` dropped); escaping and tests cover HTML, comments, setext, ordered and `+`/`*` lists, and indented code. |
| P2 — `npm test` is watch mode | Replaced with `npm run check`, `npm run test:run`, `npm run build`; adapter and CLI test files added to the file list. |

## Still open for the reviewer

- Is first-appearance ordering (earliest `createdAt` per subject) the right default, or should
  subjects sort alphabetically for stability as records are added?
- Is Phase C worth its cost, given that subjects accrue naturally on republish?
- Does dropping `<details>` cost enough readability to be worth revisiting with a safe
  HTML-escaping strategy instead?
