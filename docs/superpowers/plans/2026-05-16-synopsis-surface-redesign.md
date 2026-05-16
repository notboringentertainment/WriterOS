# Synopsis Surface Redesign — Phase 2 Design Plan

> **Status:** Design plan only. No implementation yet. Awaiting sign-off on UX model and §8 open questions.
>
> **Branch:** `feature/screenplay-editor-core` — HEAD `b97518e` (Phase 1 complete + pushed)
>
> **Source of truth PRD:** `docs/product/structured-writing-surfaces-prd.md` §Migration Strategy → Phase 2: Synopsis Surface Redesign + §Surface Requirements → Synopsis.

---

## 1. Current Synopsis Implementation Summary

**Component:** `client/src/components/writing/SynopsisTab.tsx`

- Props: `synopsis: { logline, sections{setup, act1Break, midpoint, act2Break, resolution} }`, `onUpdate(key, value)`, `onClear?`.
- Renders `<h2>Synopsis</h2>` + subtitle, then a vertical stack of six `GuidedSection` fields (logline + five prose breaks: setup, act1Break, midpoint, act2Break, resolution) inside `maxWidth: 760`. Single "Clear synopsis" button top-right, disabled when empty.
- No header metadata. No view toggle. No QA. No paragraph-vs-prose mode. Six labeled textareas only.

**State path:** `state.synopsis` (legacy top-level field).

**Hook:** `useProjectState` exports `setSynopsisSection(key, value)` and `clearSynopsis()`. Both mutate `state.synopsis` through the central `update` callback which persists via `saveProjectToLibrary` to localStorage (`writeros_project_state` + project library).

**Wiring:** `App.tsx:228–231` renders `<SynopsisTab synopsis={project.state.synopsis} onUpdate={…} onClear={…} />` inside `<Shell>`.

**Consumers of legacy `state.synopsis`:**

- `client/src/lib/wpRouting.ts` → `buildProjectContext` reads `state.synopsis.logline` and all five `sections` keys for the Sam agent context pack.
- `tests/lib/wpRouting.test.ts`, `tests/lib/useProjectState.test.ts`, `tests/components/SynopsisTab.test.tsx` all assert the legacy shape.

**New machinery already on disk (Phase 1):**

- `shared/documents.ts` — `SynopsisDocumentContent` (header, logline parts, 5-paragraph prose, QA, optional aiProductionImplications) + `AuthoredDocumentState<T>` wrapper (`version`, `mode`, `updatedAt`, `content`, optional `viewPreferences`, `qa`).
- `client/src/lib/documentMigration.ts` — `legacyToDocuments` + `documentsToLegacy`. Both round-trip-safe for synopsis prose paragraphs and logline.
- `client/src/lib/documentMarkdown.ts` — `synopsisToMarkdown(doc)` deterministic emitter; header + Logline + prose paragraphs; skips empty optional sections.
- `client/src/lib/projectState.ts` — `ProjectState.documents.synopsis` exists and is hydrated from legacy fields on every load (schema v3).

**Aesthetic baseline:** Night Desk dark theme. CSS variables `--bg/surface/surface-2/border/fg/fg-muted/fg-subtle`, `--font-display` and `--font-body`. Writing surfaces are flat with subtle borders — no card stacking.

---

## 2. Proposed UX Model

**Aesthetic direction: editorial draftroom.** Quiet, typographic, single-column reading width. No vertical card stacks. No marketing chrome. The page reads as a working manuscript with thin metadata, generous whitespace, and a present view-mode pill at the top-right.

### Page layout (Edit View)

```
┌────────────────────────────────────────────────────────────┐
│  [Synopsis]                          [Edit ◐ Document]     │ ← view toggle pill
│  Reader-facing story spine.                                │
│                                                            │
│  ── METADATA ────────────────────────────────────────────  │ ← thin rule, not a card
│  TITLE          My Untitled Project                        │ ← inline label/value
│  WRITER         Ben                                        │   font-display caps labels
│  FORMAT         Feature   GENRE  Drama   RUNTIME  100m     │
│  COMPS          Heat · Manchester by the Sea               │ ← comma-list, no chips
│                                                            │
│  ── LOGLINE ────────────────────────────────────────────   │
│  When [protagonist] discovers …                            │ ← single textarea
│                                                            │
│  ── SYNOPSIS ────────────────────  [prose ⇄ paragraphs]    │ ← compose-mode toggle
│  (prose mode)                                              │
│   Long-form editable prose. One column. Serif body.        │
│                                                            │
│  ── REVIEW ─────────────────────────────────────────────   │
│   ☐ protagonist named early   ☐ goal clear                 │ ← inline checklist
│   ☐ obstacle clear            ☐ stakes clear               │   no boxed panel
│   ☐ ending revealed           ☐ paragraphs connect causally│
│   ☐ tone matches intended     ☐ no unnecessary subplot     │
│                                                            │
│                                  [Clear synopsis]          │ ← destructive bottom-right
└────────────────────────────────────────────────────────────┘
```

### Compose modes (inside Edit View)

- **Prose mode** (default for content that fits in a single paragraph): single tall textarea whose displayed value is the joined output of all five prose fields — `[opening, escalation, middle, climax, resolution].filter(Boolean).join('\n\n')`. Margin hint: "One uninterrupted draft. Use blank lines to break paragraphs."
  - On every keystroke, the textarea value is split on `\n\n` and written back across the five fields in order (`opening, escalation, middle, climax, resolution`); any overflow paragraphs are appended to `resolution` to guarantee no data loss.
  - This means **prose mode never hides any populated paragraph** — even if a legacy project only has `resolution` filled, prose mode renders that text.
- **Paragraphs mode** (default whenever migrated legacy data has any non-opening prose field populated, OR ≥2 prose fields populated): five labeled inputs (`opening, escalation, middle, climax, resolution`), each a `GuidedSection`-style textarea. Switching to prose mode joins with `\n\n` per the rule above.
- Mode persists in `documents.synopsis.viewPreferences.synopsisComposeMode: 'prose' | 'paragraphs'` — a new optional field on `DocumentViewPreferencesSchema` (see §4).
- **Default-mode heuristic on first load (no stored preference):**
  - If `prose.opening` is non-empty AND `prose.{escalation, middle, climax, resolution}` are all empty → `prose`.
  - Otherwise (any non-opening field populated, or multiple fields populated, or all empty) → `paragraphs`.
  - This guarantees a user with legacy content in `midpoint` or `resolution` sees their data immediately without needing to discover the toggle.

### Document View

- Same single column, read-only.
- Renders authored content as styled HTML (no third-party md library — apply the same shape `synopsisToMarkdown` uses on the data directly).
- Title in display font, large. Logline in italics. Prose paragraphs justified, body font.
- Metadata block omitted when `header.title` and `header.writer` are both empty.
- Footer note (small, muted): `Last edited [updatedAt]`. No export affordance in this phase — see §8 Q8.

### View toggle behavior

- Single pill, top-right of the content column: `Edit | Document`.
- Persists to `documents.synopsis.viewPreferences.activeView`.
- Initial state defaults to `edit` unless previously toggled.

### Clear behavior

- "Clear synopsis" moves to bottom-right of Edit View.
- Two-click confirmation matching the `VoiceProfileDrawer` pattern (first click arms; second click confirms; auto-cancel after ~3s).
- On confirm: reset both `documents.synopsis.content` (back to `createEmptySynopsisContent()`, new `updatedAt`) and `state.synopsis` (back to default).

### What this is NOT

- No nested cards / accordion blocks.
- No floating panels.
- No multiple side-by-side columns.
- No landing-page treatment.
- No new color palette. Uses existing CSS variables only.

---

## 3. Data-Write Strategy — Recommendation: **Documents-first authoring, legacy mirroring**

Three options considered:

| Option | Write target | Legacy field state | Risk | Verdict |
|---|---|---|---|---|
| Legacy-only | `state.synopsis.*` | live source | header/QA/comps/AI-implications have nowhere to live | rejected — defeats Phase 2 |
| Documents-first, legacy mirroring | `documents.synopsis.content` (canonical) → mirror prose + logline back to `state.synopsis` on every write | warm copy | mirror must stay tight; one-way | **recommended** |
| Documents-only, drop legacy | `documents.synopsis.content` | stale | breaks `wpRouting.buildProjectContext` until Phase 4 | rejected — out of scope |

### Recommended approach

1. **Canonical source for the Synopsis surface becomes `state.documents.synopsis`.** All new UI binds to it.
2. **Every mutation derives the legacy slice and mirrors it.** Use the existing `documentsToLegacy(docs).synopsis` adapter — it already produces the exact `{ logline, sections }` shape.
3. **`wpRouting` and other consumers continue reading `state.synopsis` unchanged.** They get the mirror, byte-identical for prose paragraphs and logline. Header/QA/AI-implications are NOT mirrored (no legacy slot, no consumer expects them yet).
4. **On load, `migrateState` already hydrates `documents.synopsis` from legacy on v2 state.** No-op for v3 state.
5. **Edge: no current code path writes `state.synopsis` directly** outside `useProjectState`. Every legacy setter funnels through the new `setSynopsisContent` / `clearSynopsis` updaters that maintain both surfaces.

This honors Phase 1's system-level "legacy is SoT for now" boundary while flipping it at the surface level for Synopsis only — exactly as the PRD §Recommended Next Step authorized.

### 3a. Persistence safety — required fix to `saveProjectState` BEFORE any new UI

**Bug present in the current Phase 1 code.** `client/src/lib/projectState.ts:184–190` currently saves like this:

```ts
export function saveProjectState(state: ProjectState): void {
  const stateToSave: ProjectState = {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documents: legacyToDocuments(state),    // ← destructive
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
}
```

Every save **regenerates `documents` from the legacy slice**, which discards document-only fields the new Synopsis UI will write: `documents.synopsis.content.header.*`, `content.qa.*`, `content.aiProductionImplications`, `viewPreferences.*`, and the new `synopsisComposeMode`. That is incompatible with Documents-first authoring.

**Fix (precedes any UI work):** persist `state.documents` as-is and only refresh fields that are derivable from legacy.

Pseudocode shape:

```ts
export function saveProjectState(state: ProjectState): void {
  // Refresh derived prose/logline mirror without clobbering document-only fields.
  const mirroredSynopsis = mirrorSynopsisFromLegacy(
    state.documents.synopsis,
    state.synopsis,
  )

  const stateToSave: ProjectState = {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documents: {
      ...state.documents,
      synopsis: mirroredSynopsis,
    },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
}
```

Where `mirrorSynopsisFromLegacy(existingDoc, legacy)` returns a `AuthoredDocumentState<SynopsisDocumentContent>` that preserves `existingDoc.content.header`, `content.qa`, `content.aiProductionImplications`, `viewPreferences`, `mode`, and `updatedAt`, while overwriting `content.logline.text` from `legacy.logline` and `content.prose.{opening, escalation, middle, climax, resolution}` from `legacy.sections.{setup, act1Break, midpoint, act2Break, resolution}`.

This makes save **idempotent for document-only fields**. Outline, Treatment, and Story Bible documents are left untouched in this phase — `legacyToDocuments` is no longer called on save.

Notes:
- `migrateState` (the load path) already does the safe thing: it keeps `obj.documents` when present and only regenerates when missing or pre-v3. No change needed on load.
- For Outline and Story Bible, future phases will need their own narrow mirror helpers (`mirrorOutlineFromLegacy`, etc.). Out of scope for Phase 2 — leave `state.documents.outline` and `state.documents.storyBible` as passed in (untouched on save).
- For Treatment, there is no legacy slice and no mirror needed; just pass through.

The cleanest implementation: a single `mirrorDocumentsForSave(state)` helper that preserves all current `state.documents` and only updates `documents.synopsis` from the legacy mirror. Document-only Synopsis fields survive; non-synopsis documents are untouched.

### 3b. Persistence safety — tests required

Add to `tests/lib/projectState.test.ts`:

- `saveProjectState` preserves `documents.synopsis.content.header.title` across save/load round-trip.
- `saveProjectState` preserves `documents.synopsis.content.qa.protagonistNamedEarly = true` across save/load.
- `saveProjectState` preserves `documents.synopsis.viewPreferences.activeView = 'document'` across save/load.
- `saveProjectState` preserves `documents.synopsis.viewPreferences.synopsisComposeMode = 'paragraphs'` across save/load.
- `saveProjectState` preserves `documents.synopsis.content.aiProductionImplications` across save/load.
- `saveProjectState` mirrors `state.synopsis.logline` into `documents.synopsis.content.logline.text` (mirror still works).
- `saveProjectState` does NOT touch `documents.outline`, `documents.treatment`, or `documents.storyBible` (pass-through). Mutate one before save, assert it survives load.

---

## 4. Component / File Changes Expected

### Modify

- `client/src/lib/projectState.ts` — fix `saveProjectState` per §3a so document-only Synopsis fields survive persistence. Add `mirrorSynopsisFromLegacy` (or `mirrorDocumentsForSave`) helper. Stop calling `legacyToDocuments(state)` on save. Load path (`migrateState`) is unchanged.
- `client/src/lib/documentMigration.ts` — add `mirrorSynopsisFromLegacy(existingDoc, legacy)` (or equivalent helper invoked by `saveProjectState`). Pure function. Preserves `header`, `qa`, `aiProductionImplications`, `viewPreferences`, `mode`, `updatedAt`; updates `logline.text` and `prose.{opening…resolution}` from the legacy slice. Unit-tested in isolation.
- `client/src/components/writing/SynopsisTab.tsx` — full rewrite. Becomes a thin shell switching Edit/Document view and assembling sub-components.
- `client/src/lib/useProjectState.ts`
  - Replace `setSynopsisSection(key, value)` and `clearSynopsis()` with:
    - `setSynopsisDocument(updater: (content: SynopsisDocumentContent) => SynopsisDocumentContent)` — apply update to `documents.synopsis.content`, refresh `updatedAt`, mirror to `state.synopsis` via `documentsToLegacy`.
    - `setSynopsisViewPreferences(patch: Partial<DocumentViewPreferences>)` — for activeView + compose mode.
    - `clearSynopsis()` — clears both surfaces.
  - Decide in implementation whether to keep `setSynopsisSection` as a thin proxy during transition or delete after callers update.
- `client/src/App.tsx` (lines 228–231) — pass `synopsisDocument={project.state.documents.synopsis}` plus new updaters. Remove legacy prop wiring.
- `shared/documents.ts` — extend `DocumentViewPreferencesSchema` to include `synopsisComposeMode?: 'prose' | 'paragraphs'`. Optional field, backward-compatible. `AuthoredDocumentState.version` stays at `1` — no breaking change.

### Add

- `client/src/components/writing/synopsis/SynopsisEditView.tsx` — orchestrates metadata + logline + prose + QA inside Edit mode.
- `client/src/components/writing/synopsis/SynopsisDocumentView.tsx` — reader-mode render.
- `client/src/components/writing/synopsis/SynopsisHeaderEditor.tsx` — inline label/value editor for title/writer/format/genre/runtime/comps. Comma-separated comps parsed on blur.
- `client/src/components/writing/synopsis/SynopsisLoglineEditor.tsx` — single textarea bound to `content.logline.text`. (Optional protagonist/goal/obstacle/stakes/hook sub-fields collapsed behind an "advanced" disclosure for v2; skip in v1.)
- `client/src/components/writing/synopsis/SynopsisProseEditor.tsx` — switches prose ↔ paragraphs mode based on `viewPreferences.synopsisComposeMode`. Owns the join/split logic on toggle. Reuses `GuidedSection` in paragraphs mode.
- `client/src/components/writing/synopsis/SynopsisQaChecklist.tsx` — eight inline checkboxes with PRD labels. Two columns on wide viewport, one on narrow. Reads/writes `content.qa.*`. Inline, no panel chrome.
- `client/src/components/writing/synopsis/SynopsisViewToggle.tsx` — Edit/Document pill. Local for v1; promote to `shared/` when Outline/Treatment/Bible adopt the same pattern.

### Touch (light)

- `client/src/lib/shellState.ts` — verify nothing here ties to per-section focus tracking. Keep the `synopsis: false` flag if it gates rail hints; otherwise untouched.
- No changes to `wpRouting.ts`. Sam continues to receive `state.synopsis` legacy shape via the mirror.
- No changes to `documentMarkdown.ts` (Markdown export deferred per §8 Q8).
- `documentMigration.ts` IS modified — gains the new `mirrorSynopsisFromLegacy` helper per the Modify list above.

### Deliberately untouched

- Server (`server/**`), persona prompts, OpenSwarm bridge.
- `useProjectState.updateScript`, `createProject` / `switchProject` — they call `defaultProjectState()` which already hydrates `documents`.

---

## 5. Migration & Data Safety Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Document-only Synopsis fields wiped on every save** (current `saveProjectState` rebuilds `documents` from legacy on each write) | **certain in current code** | **Hard blocker.** Must be fixed before any new UI binds to document-only fields. See §3a/§3b. Required tests gate UI work. |
| Existing user `synopsis.logline` / `sections` lost on Phase 2 deploy | high if mis-wired | `migrateState` already hydrates `documents.synopsis` from legacy on first v3 load. Add a load-time test asserting that after `loadProjectState` a populated legacy state appears in `documents.synopsis.content` byte-equivalent. Add an integration test that mounts the new `SynopsisTab` with a populated v2-shaped legacy state and asserts every field renders. |
| Prose-mode hides legacy content stored in non-opening paragraphs (e.g., user has only `resolution` filled, prose mode shows blank) | high if mis-implemented | Prose mode value is always the joined output of all five prose fields, not just `opening`. Default-mode heuristic forces paragraphs mode whenever any non-opening prose field is populated. Test cases for `resolution`-only and `midpoint`-only legacy state. See §2 Compose Modes. |
| Mirror drift — user edits new UI, legacy field falls behind, Sam gets stale context | medium | Every documents-mutating action goes through `setSynopsisDocument`, which always mirrors via `documentsToLegacy` before returning. Unit test: after `setSynopsisDocument`, `state.synopsis` equals `documentsToLegacy(state.documents).synopsis`. |
| Header / QA / aiProductionImplications fields invisible to legacy consumers | low — by design | Documented in plan + PRD addendum. Sam upgrade tracked separately for a later phase. |
| Compose-mode switch losing text | medium | Prose → Paragraphs split: split on `\n\n`, fill `opening…resolution` in order, dump overflow into `resolution`. Paragraphs → Prose join: `[opening, escalation, middle, climax, resolution].filter(Boolean).join('\n\n')`. Both lossless; round-trip test required. |
| Clear synopsis acting on partial state (UI only clears docs, mirror gets out of sync) | low | `clearSynopsis` resets both `documents.synopsis` to `createEmptyDocuments().synopsis` shape and `state.synopsis` to `defaultProjectState().synopsis`. Single test asserts both. |
| Switching projects after Phase 2 carries Phase 1 `documents` correctly | low | Phase 1 round-trip test already covers this. Add a regression test that creates a project, populates new fields, switches away and back. |
| `DocumentViewPreferencesSchema` extension breaks existing tests | low | Adding optional field is backward-compatible. Existing tests don't supply it. |
| Tests asserting old `SynopsisTab` prop shape break | high | Expected. Rewrite `tests/components/SynopsisTab.test.tsx` in lockstep with the component. |

---

## 6. Test Plan

### Unit / lib tests (additions to `tests/lib/useProjectState.test.ts`)

- `setSynopsisDocument` updates `documents.synopsis.content` and mirrors to `state.synopsis`.
- `setSynopsisDocument` refreshes `documents.synopsis.updatedAt`.
- `setSynopsisViewPreferences({ activeView: 'document' })` round-trips.
- `clearSynopsis` empties both `documents.synopsis.content` and `state.synopsis`.
- After an arbitrary edit sequence, `state.synopsis` always equals `documentsToLegacy(state.documents).synopsis`.

### Component tests (`tests/components/SynopsisTab.test.tsx`, full rewrite)

- Edit View renders header, logline textarea, prose editor, QA checklist.
- Document View renders title in display font, logline, prose paragraphs joined; hides metadata block when header empty.
- View toggle pill flips `viewPreferences.activeView`; persists across re-render.
- Compose-mode toggle prose ↔ paragraphs preserves content (snapshot before/after).
- QA checkbox toggle writes to `content.qa.<key>`.
- Two-click clear: first click arms; second click confirms; auto-cancel after timeout.

### Persistence / data-safety tests (`tests/lib/projectState.test.ts`)

Per §3a/§3b — these gate any UI work.

- `saveProjectState` preserves `documents.synopsis.content.header.title` across save/load round-trip.
- `saveProjectState` preserves all six `documents.synopsis.content.header.*` fields including `comps`.
- `saveProjectState` preserves every key in `documents.synopsis.content.qa` (boolean each).
- `saveProjectState` preserves `documents.synopsis.content.aiProductionImplications` when set.
- `saveProjectState` preserves `documents.synopsis.viewPreferences.activeView`.
- `saveProjectState` preserves `documents.synopsis.viewPreferences.synopsisComposeMode`.
- `saveProjectState` mirrors `state.synopsis.logline` into `documents.synopsis.content.logline.text` (mirror still works after the fix).
- `saveProjectState` mirrors all five legacy `state.synopsis.sections.*` into the matching `documents.synopsis.content.prose.*` fields.
- `saveProjectState` does NOT mutate `documents.outline`, `documents.treatment`, or `documents.storyBible` (pass-through).
- Round-trip: save state with populated document-only fields, mutate localStorage in-place to v2 schemaVersion stripped, reload, confirm the documents survive because migrateState already preserves `obj.documents` when present.

### Migration / regression tests

- Load a synthetic v2 legacy state with `synopsis.logline = "L"` and all five sections populated; assert `state.documents.synopsis.content` reflects them via mirror; UI renders them in paragraphs mode by default (heuristic: any non-opening field populated).
- Load a v2 state with only `synopsis.logline` and `synopsis.sections.setup` populated (`opening` only) → UI defaults to **prose** mode.
- Load a v2 state with only `synopsis.sections.resolution` populated → UI defaults to **paragraphs** mode (non-opening field present); the `resolution` text is visibly rendered (regression guard for "prose mode hides non-opening content").
- Load a v2 state with only `synopsis.sections.midpoint` populated → UI defaults to **paragraphs** mode; midpoint text visible.
- Compose-mode round-trip: paragraphs → prose → paragraphs preserves every field byte-equivalent regardless of which subset of fields was populated.

### Integration smoke

- `npm run test:run` — full suite passes after the change.
- `npm run check` — clean.
- `npm run build` — clean.
- Manual: open dev, edit synopsis in prose mode, refresh, content survives, Document View renders, switch to a different project and back, content survives.

### What we do not test

- Server-side prompt changes (out of scope).
- Markdown export to file (Phase 1 emitter already tested).

---

## 7. Recommended Implementation Sequence (small commits)

Each step ends with green tests and a commit. TDD throughout. Strict priority order: **persistence/data safety → hook/state mirror invariants → UI components → final full test/check/build.**

### Priority 1 — Persistence and data safety (gates everything else)

1. **Extend view preferences schema (additive).** `shared/documents.ts`: add `synopsisComposeMode?: 'prose' | 'paragraphs'` to `DocumentViewPreferencesSchema`. Tests in `tests/shared/documents.test.ts`. Verify back-compat.
2. **Add `mirrorSynopsisFromLegacy` helper to `client/src/lib/documentMigration.ts`.** Pure function: preserves `header`, `qa`, `aiProductionImplications`, `viewPreferences`, `mode`, `updatedAt`; updates `logline.text` and the five `prose.*` fields from the legacy slice. Unit tests for preservation behavior.
3. **Fix `saveProjectState` per §3a.** Stop calling `legacyToDocuments(state)` on save. Replace with `mirrorSynopsisFromLegacy` for the synopsis surface; pass `documents.outline`, `documents.treatment`, `documents.storyBible` through unchanged. Add all `tests/lib/projectState.test.ts` cases listed in §6 (header/QA/viewPrefs/aiProductionImplications/comps preservation + mirror correctness + non-synopsis pass-through). All previous projectState tests must still pass.

### Priority 2 — Hook/state mirror invariants

4. **Add `setSynopsisDocument` + `setSynopsisViewPreferences` to `useProjectState`, with mirror.** Keep legacy `setSynopsisSection` + `clearSynopsis` as thin wrappers calling through. Tests assert the mirror invariant: `state.synopsis` always equals `documentsToLegacy(state.documents).synopsis` after any setter.
5. **Rewrite `clearSynopsis`** to clear both surfaces (`documents.synopsis` reset to `createEmptyDocuments().synopsis`; `state.synopsis` reset to default). Tests confirm both states reset.

### Priority 3 — UI components (TDD, one isolated component per commit)

6. **Build `SynopsisViewToggle.tsx`** isolated. Component tests for Edit/Document toggle behavior + persistence to `viewPreferences.activeView`.
7. **Build `SynopsisHeaderEditor.tsx`** isolated. Tests for inline label/value rendering, comma-list comps parsing on blur, missing-field tolerance.
8. **Build `SynopsisLoglineEditor.tsx`** isolated. Tests for value binding + onChange flow.
9. **Build `SynopsisProseEditor.tsx`** with mode-switch logic per §2 Compose Modes. Tests cover:
   - prose ↔ paragraphs round-trip is lossless regardless of which fields are populated;
   - prose mode renders content from any non-opening field (regression guard);
   - default-mode heuristic (only `opening` populated → prose; anything else → paragraphs).
10. **Build `SynopsisQaChecklist.tsx`** isolated. Tests cover checkbox write + persistence.
11. **Build `SynopsisDocumentView.tsx`** rendering authored content. Snapshot tests for empty, partial, and fully-populated content.
12. **Build `SynopsisEditView.tsx`** orchestrator combining steps 6–10.
13. **Rewrite `SynopsisTab.tsx`** to switch Edit/Document and pass documents down. Update `App.tsx` to pass `synopsisDocument` and new updaters. Delete legacy `onUpdate` plumbing.
14. **Rewrite `tests/components/SynopsisTab.test.tsx`** to cover the new surface end-to-end.

### Priority 4 — Final full test / check / build

15. **Cleanup**: remove the thin `setSynopsisSection` wrapper if no callers remain.
16. **Run `npm run test:run`, `npm run check`, `npm run build`.** All clean.
17. **Document Phase 2 completion** in `docs/product/structured-writing-surfaces-prd.md` §Migration Strategy Phase 2 with verification notes (persistence fix, mirror invariant, view-pref schema additions, Sam context unchanged).

Total: ~17 small commits. Every commit independently green.

---

## 8. Open Product Questions

1. **Default compose mode on first load (no stored preference)** — **Decision: locked.** If `prose.opening` is populated and all four of `escalation, middle, climax, resolution` are empty → `prose`. Otherwise → `paragraphs`. Any non-opening prose field forces paragraphs mode so legacy data never hides. Matches §2 Compose Modes.
2. **Logline detail fields (protagonist/goal/obstacle/stakes/hook)** — **Decision: defer.** v1 surfaces only `content.logline.text`. Sub-fields stay in the schema but are not editable in Edit View.
3. **Comps input** — **Decision: comma-separated, parsed on blur.** No tag chips. Quiet aesthetic.
4. **AI Production Implications section** — **Decision: hide in v1.** Schema field stays optional. Surface alongside Treatment in a later phase.
5. **Two-click clear vs. modal confirm** — **Decision: two-click**, matching `VoiceProfileDrawer`. First click arms; second confirms; auto-cancel after ~3s.
6. **"Last edited" timestamp** in Document View footer — **Decision: show, muted.**
7. **Sam context upgrade** — **Decision: defer.** wpRouting still reads legacy `state.synopsis` via mirror. No context-pack changes this phase.
8. **Markdown export button** — **Decision: defer.** Existing `synopsisToMarkdown` would need test updates to cover header / QA / aiProductionImplications. Out of scope for Phase 2 (no `documentMarkdown.ts` changes per §4). Document View ships without an export affordance.

All questions resolved. Plan locked. Ready to implement.
