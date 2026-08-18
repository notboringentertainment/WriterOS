# What's Standing Panel — Design

2026-08-18. Approved in conversation; follows `docs/synthesis-agent-v1-design.md`, whose
server side is fully built and merged (PR #69). This slice adds the app surface: a page
where the writer reads the "What's Standing" report and answers its reference questions in
place. The terminal commands (`report`, `questions`, `answer`) remain, but the app page is
the real home for this work.

## Goal

One tab where reading the report and resolving its problems are the same act. The writer
opens What's Standing, sees the INCOMPLETE banner if references are unresolved, and finds
each open question rendered directly beneath the sentence that raised it — candidates
offered, never free text. An answer regenerates the report in the same round trip, so the
banner visibly shrinks as questions are settled.

## Non-goals

- No report persistence. The `generatedReports` collection from the design doc stays
  unbuilt; reports are cheap to recompose and `ComposedDocument.run` already carries the
  run identity. A later slice can add storage without changing this page.
- No invalidation producer. That is its own slice. (The consumer path — invalidated
  questions re-derive as new — already works and this page inherits it for free.)
- No consolidation of the `Block` renderer. This slice adds a fourth private copy in the
  new view, matching the existing convention in the three document views. Extracting a
  shared component is a separate cleanup.
- No free-text answers anywhere on the page, per the ratified constraint: prose is not
  parsed and not stored.

## Server

### Shared read helper

The CLI `report` command owns a consistent-pair read: annotation state, snapshot, then
annotation state again, retrying if the annotation revision moved, so the pair is one
moment's state. Extract that into `server/projectMemory/whatsStandingReport.ts`:

```ts
readWhatsStandingReport(projectPath: string, projectId: string): Promise<
  | { ok: true; composed: ComposedDocument; questions: EnrichedQuestion[] }
  | { ok: false; reason: string }>
```

`EnrichedQuestion` is a `PendingQuestion` plus candidate headlines:

```ts
interface EnrichedQuestion {
  annotationId: string
  status: 'new' | 'proposed'
  questionText: string
  recordId: string          // locator.recordId — where the question anchors
  candidates: { id: string; headline: string }[]  // headline = claim first line, truncated
}
```

The CLI `report` and `questions` commands are re-pointed at the helper so route and CLI
cannot drift. Behavior of both commands is unchanged (same output, same exit codes).

### Routes

Both live in `server/projectMemory/routes.ts` beside the existing memory routes and use the
identical guard stack: `requireSameOrigin`, `requireSession`, project-id pattern check,
`projectLibraryStore.resolveProjectPackagePath`, and the snapshot/manifest project-id
assertion.

**`GET /api/projects/:projectId/whats-standing`**
Calls the helper. `200 { composed, questions }`. Read-only: uses
`readSnapshotReadOnly` / `annotationStore.state` only — generating a report changes
nothing on disk.

**`POST /api/projects/:projectId/whats-standing/answer`**
Body, zod-validated:

```ts
{ annotationId: string, answer:
    { kind: 'referents'; recordIds: string[] }   // non-empty
  | { kind: 'cant-say' }
  | { kind: 'decline' } }
```

Mirrors the CLI `answer` command exactly: read snapshot read-only, find the question in
`pendingQuestions`, propose if status is `new`, then `approve` (referent ids must be among
the question's candidates — checked here for a clean 400, and enforced again by the store's
preflight) or `decline` with the given reason. All store-side protections from the review
rounds apply unchanged: package-lock revalidation, language-fingerprint checks,
validate-before-append.

On success, respond `200` with a freshly composed `{ composed, questions }` from the same
helper — the client updates in one round trip.

Errors: `400` unknown/invalid body or referent outside candidates; `404` unknown question
(it may have been settled elsewhere); `409` when the store refuses because memory moved
(`AnnotationStoreError` reason `conflict`) — the response body includes the store's
message, and the client refetches. `500` otherwise.

### Block anchor

`leadInParagraph` gains an optional `annotationId` in `shared/compose/types.ts` and
`shared/compose/schemas.ts`. `whatsStandingRenderer.ts` sets it on every cue block —
resolved or not — from the same `annotationIdFor(...)` call it already makes. Optional
keeps every existing `ComposedDocument` valid; no other block type changes.

## Client

### Tab wiring

`WritingTab` gains `'whats-standing'` in both declarations (`client/src/lib/shellState.ts`
and the duplicate union in `client/src/components/shell/TopBar.tsx`; label
"What's Standing"). `App.tsx` renders `<WhatsStandingTab>` for the case.
`surfaceAwareness.ts` gets a deliberate no-op branch: the report has no intake deck and no
authored content, so agent context contributes nothing for this tab.

The tab needs a folder-backed project (`activeFolderProjectId`), the same requirement as
every memory feature. Without one, the tab renders a short explanation instead of the
report.

### Fetch layer

`client/src/lib/projectMemoryApi.ts` gains two methods on `createProjectMemoryApi`:

- `whatsStanding(projectId)` → GET, returns the payload or `{ ok: false, reason }`
- `answerWhatsStanding(projectId, annotationId, answer)` → POST, same envelope

Same session-token header and URL-builder conventions as the existing methods. Responses
validated with zod (`ComposedDocumentSchema` plus a payload schema) before use, like the
compose clients do.

### Components

New folder `client/src/components/writing/whatsStanding/`.

**`WhatsStandingTab`** — owns the state: `payload`, `loading`, `error`, `answeringId`.
Fetches on mount and when the active project changes. Double-submit guard via ref, same as
`SynopsisTab`. Passes an `onAnswer(annotationId, answer)` callback down; on success swaps
the whole payload; on `409` refetches and shows a one-line notice that memory moved and the
questions were refreshed.

**`WhatsStandingView`** — pure presentation of one payload:

1. **Banner.** When `composed.fidelity.status` is not `clean`, a banner in the suite's
   review-banner style. The count of unresolved references comes from the
   `unresolved_reference` warnings, NOT from the question list — a can't-say reference is
   unresolved (it stays in the banner) but is deliberately not re-asked, so it gets no
   card. Any other warning kinds render beneath in the same style as the existing document
   views' flagged state.
2. **Blocks.** The report blocks through a private `Block` switch (fourth copy, per
   non-goals), handling the same seven block types as the other views.
3. **Question cards.** After rendering a `leadInParagraph` block whose `annotationId`
   matches an open question, the matching `QuestionCard` renders directly beneath it.
   Questions whose block is absent (should not happen — the renderer and the question
   derivation share `buildStandingEntries`) render in a fallback list at the bottom so no
   question is ever invisible.

**`QuestionCard`** — styled after `MemoryConflictCard`: bordered card, discrete buttons,
disabled state while an answer is in flight. Content:

- The candidates as toggleable rows (id + headline), multi-select, since an answer may
  cite several records.
- Three actions: **Confirm referents** (enabled only when at least one candidate is
  selected), **Can't say**, **Decline**. Button copy states the consequence in plain
  language: can't say keeps the report incomplete; decline means "this isn't really a
  reference" and won't be asked again unless the wording changes.
- Zero-candidate questions show the store's own explanation line and offer only Can't say
  and Decline.
- No text input exists on the card.

Visual language throughout: same typography, spacing, banner and card styles as the
existing document views and memory components — this page must read as a sibling of
Synopsis/Treatment/Outline, not a new app.

## Data flow

```
open tab → GET whats-standing → { composed, questions }
render blocks; card per open question beneath its anchor block
writer answers → POST answer → store validates under lock → recompose
              → fresh { composed, questions } → view re-renders, banner shrinks
conflict (409) → refetch GET → notice: "memory moved; questions refreshed"
```

The report shown after an answer always comes from the server's recomposition — the client
never edits the document it holds.

## Error handling

- No folder project: explanatory empty state, no fetch.
- GET failure: inline error with retry button.
- POST 400/404: surface the server message on the card; refetch to resync.
- POST 409: refetch and one-line notice (the store's message names what moved).
- A payload that fails zod validation is treated as a fetch failure, never rendered.

## Testing

- **Route tests** (beside the existing memory route tests): GET returns composed report
  plus enriched questions on a seeded package; answer round trip for referents, cant-say,
  and decline, each asserting the returned report reflects the answer; referent outside
  candidates → 400 and the log unchanged; unknown question → 404; guard stack enforced
  (no session → rejected); GET writes nothing to the package (byte-compare `memory/`).
- **Helper test**: CLI `report` output unchanged after re-pointing at the shared helper.
- **Renderer test**: cue blocks carry the `annotationId` matching
  `annotationIdFor(locator)`; schema round-trip with the new optional field.
- **Client tests** (suite convention in `tests/lib/`): api methods build correct URLs and
  validate payloads; `QuestionCard` — confirm disabled until a candidate selected,
  multi-select, all three answers call `onAnswer` with the right shape, in-flight
  disabling, zero-candidate variant hides Confirm; `WhatsStandingView` — question card
  renders beneath its anchor block, fallback list for unanchored questions, banner counts.
- **Live pass**: run the app against Stool Pigeon; confirm the report renders, the open
  struck-cue question is answerable, and the banner clears when it is settled.

## Verification

`npm run check`, `npm run test:run`, `npm run build`, plus the live pass above with visual
confirmation in the browser.
