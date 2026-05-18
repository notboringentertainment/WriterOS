# Synopsis Surface — Series Variant Implementation Plan

> Source: refined Ultraplan output committed at `~/.claude/plans/synopsis-page-needs-revised-giggly-star.md`.
> Companion to: `docs/superpowers/plans/2026-05-16-synopsis-surface-redesign.md` (Phase 2).
> Branch: `feature/screenplay-editor-core`. Baseline before this slice: `96db8cd`.
>
> **Historical note (2026-05-18):** The status table below is authoritative for this implementation slice. The local Synopsis `header.format` authority documented here was a stepping stone and is superseded by project-wide `ProjectState.meta.format` authority in `docs/product/project-wide-format-agent-context-prd.md`.

## Status snapshot

| # | Task | Status | Commit |
|---|---|---|---|
| 1 | Series schema + `createEmptySeriesContent` factory | ✅ DONE | `fe200b7` |
| 2 | `mirrorSynopsisFromLegacy` series-preservation regression test | ✅ DONE | `2e2a0ba` |
| 3 | `SynopsisHeaderEditor` format dropdown + series rows | ✅ DONE | `e2ea097` |
| 4 | Six series editor components | ✅ DONE | `7ded362`, `125b9d3`, `6cc3287`, `726eb75`, `0ff9a54`, `974fc87` (6 commits) |
| 5 | `SynopsisSeriesEditView` orchestrator | ✅ DONE | `9e08dac` |
| 6 | `SynopsisDocumentView` series branch | ✅ DONE | `7f75474` |
| 7 | `SynopsisTab` routing + lazy-init `content.series` | ✅ DONE | `cdaf53d` |
| 8 | `wpRouting` + `server/routes` Sam context upgrade | ✅ DONE | `59ae8bf` |
| 9 | PRD update + full verify (`npm run test:run`, `check`, `build`) | ✅ DONE | `d689e6a` |

## Files touched per task

### Task 1 — Schema (DONE `fe200b7`)

**Modify:**
- `shared/documents.ts` — add `SynopsisSeriesTypeSchema`, `SynopsisEpisodeLengthSchema`, `SynopsisFutureSeasonSchema`, `SynopsisSeriesCharacterSchema`, `SynopsisPilotSchema`, `SynopsisSeriesContentSchema`, inferred types, `createEmptySeriesContent()`. Extend `SynopsisDocumentContentSchema` with `series: SynopsisSeriesContentSchema.optional()`.

**Tests:**
- `tests/shared/documents.test.ts` — 13 new tests across two describe blocks: empty/populated series Zod validation, enum rejection for bad `seriesType` / `episodeLength`, `SynopsisDocumentContent` accepts with-or-without `series`.

**Locked:**
- `createEmptySynopsisContent` UNTOUCHED. Series is opt-in.
- `header.format` stays `z.string()`. UI enforces values.

### Task 2 — Mirror regression test (DONE `2e2a0ba`)

**Modify:** test-only.

**Tests:**
- `tests/lib/documentMigration.test.ts` — 3 new tests asserting `mirrorSynopsisFromLegacy` preserves a populated `content.series` block through the save mirror via `...existingDoc.content` spread. Covers: legacy-only mutation preserves series, legacy + populated series preserves both, undefined series stays undefined.

**Locked:**
- No code change to `documentMigration.ts`. Regression guard against any future destructive rewrite.

### Task 3 — Header editor format dropdown (DONE `e2ea097`)

**Modify:**
- `client/src/components/writing/synopsis/SynopsisHeaderEditor.tsx` — replace free-text format input with `<select>` of `feature` / `series`. Add optional props `seriesType`, `episodeLength`, `onSeriesTypeChange`, `onEpisodeLengthChange`. Conditional `Series type` and `Episode length` rows render only when `value.format === 'series'` AND both `on*Change` callbacks supplied.

**Tests:**
- `tests/components/SynopsisHeaderEditor.test.tsx` — 13 new tests across two describe blocks (`format dropdown`, `series rows`). Pre-existing tests updated (1 setup change, 1 assertion mode update — no coverage lost).

**Locked:**
- Empty/legacy `format` strings render as `Feature` selected.
- Header editor cannot reach `content.series` — series sub-props plumbed from the orchestrator only.

### Task 4 — Six isolated series editor components (DONE)

**Create:**
- `client/src/components/writing/synopsis/SynopsisShowOverviewEditor.tsx` — single tall textarea via `GuidedSection`. Props: `{ value, onChange }`. Guidance: "What's the renewable conflict? What world? What tone?"
- `client/src/components/writing/synopsis/SynopsisPilotEditor.tsx` — pilot logline single-line + pilot prose textarea. Props: `{ value: { logline, prose }, onChange }`. Guidance: "Tells a complete pilot story and shows why episode two exists."
- `client/src/components/writing/synopsis/SynopsisSeasonArcEditor.tsx` — textarea via `GuidedSection`. Props: `{ value, onChange }`.
- `client/src/components/writing/synopsis/SynopsisFutureSeasonsEditor.tsx` — variable-length list of `{ id, label, summary }` rows. **NO auto-seed on empty.** Add/remove buttons. `crypto.randomUUID()` for ids.
- `client/src/components/writing/synopsis/SynopsisSeriesCharactersEditor.tsx` — variable-length list of `{ id, name, role, bio, arcPerSeason: string[] }` rows. Inline arc-per-season editor with add/remove buttons. Pattern derived from `CharacterCard` but inline (different field shape).
- `client/src/components/writing/synopsis/SynopsisCompsEditor.tsx` — textarea via `GuidedSection`. Guidance flags it as optional.

**Tests (one per component):**
- Each in `tests/components/Synopsis<Name>.test.tsx`.
- Coverage: renders, value binding, onChange fires with correct payload, add/remove behavior for variable lists.

**Locked:**
- All pure presentational. Local `useState` only for transient UI state.
- CSS variables only. No new deps.
- One commit per component (6 commits in this task).

### Task 5 — SynopsisSeriesEditView orchestrator (DONE)

**Create:**
- `client/src/components/writing/synopsis/SynopsisSeriesEditView.tsx` — composes header + logline + six new series editors. Two-click clear at bottom-right (inline copy of the pattern from `SynopsisEditView.tsx` lines 16–51).

**Tests:**
- `tests/components/SynopsisSeriesEditView.test.tsx` — renders all eight sub-sections, patches series via `patchSeries(next)` helper, two-click clear arms then fires `onClear`.

**Locked:**
- Composition order: header → logline → ShowOverview → Pilot → SeasonArc → FutureSeasons → Characters → Comps. No QA checklist.
- `content.series` defensively read with `?? createEmptySeriesContent()` for single-tick safety, even though Task 7's lazy-init guarantees non-null.
- Clear semantics: calls the same `onClear` prop that `clearSynopsis` already wipes — including `content.series` via factory reset.

### Task 6 — DocumentView series branch (DONE)

**Modify:**
- `client/src/components/writing/synopsis/SynopsisDocumentView.tsx` — branch on `content.header.format === 'series'`. Series path renders metadata (title, writer, format, genre + series type + episode length; runtime hidden), then sections in stable order with `font-display` caps headers: Show Overview, Pilot Synopsis (logline italic lead + prose body), Season One Arc, Where It Goes (future seasons list), Characters (name + role italic + bio + arc-per-season bulleted), Comps & Why This Show Now. Empty sections omitted (same rule as feature path). Falls back to feature rendering when `header.format === 'series'` but `content.series` undefined.

**Tests:**
- Update existing `tests/components/SynopsisDocumentView.test.tsx`. New tests: series mode renders metadata with seriesType + episodeLength + hides runtime; empty sections omitted; section order stable; fall-through to feature when series block missing.

### Task 7 — SynopsisTab routing + lazy-init (DONE)

**Modify:**
- `client/src/components/writing/SynopsisTab.tsx` — derive `activeFormat = content.header.format === 'series' ? 'series' : 'feature'`. Route Edit View by format. Wrap `onContentPatch` locally to lazy-init `content.series = createEmptySeriesContent()` when format flips to `'series'` and `content.series` is currently undefined.

**Tests:**
- `tests/components/SynopsisTab.test.tsx` — legacy `format = ''` renders feature edit view + QA checklist; flip to series initializes `content.series` AND renders series edit view AND hides QA; flip back to feature shows feature view with preserved feature data; round-trip flip preserves both `content.prose` and `content.series` byte-equivalent.

**Locked:**
- QA hidden in series mode. Feature QA data preserved untouched in storage.

### Task 8 — Sam context upgrade (DONE)

**Modify:**
- `client/src/lib/wpRouting.ts` — extend `ProjectContext.synopsis` shape and the literal in `buildProjectContext` with `format: text(state.documents.synopsis.content.header.format)` and `showOverview: text(state.documents.synopsis.content.series?.showOverview ?? '')`.
- `server/routes.ts` — extend `projectContextSchema.synopsis` with the two new optional string fields (Zod strips unknown keys by default — schema MUST list them). Extend Sam prompt block to emit `- Format: {format || 'feature'}` and `- Show Overview: {showOverview || 'Not supplied'}` after the logline.

**Tests:**
- `tests/lib/wpRouting.test.ts` — `buildProjectContext` returns the two new fields reflecting `documents.synopsis.content`.
- Server route test — pass a `projectContext` with `format` + `showOverview` to the Sam route; assert Zod accepts and prompt-builder includes both lines.

**Locked:**
- No other persona prompts changed (Zoe `synopsis.logline` reference at `openaiService.ts:608` untouched).

### Task 9 — PRD + full verify (DONE)

**Modify:**
- `docs/product/structured-writing-surfaces-prd.md` — append "Series mode" subsection under `### Surface Requirements → Synopsis` enumerating the eight series sections, the format-switch behavior, and the QA-hidden rule. Append a follow-on note under Phase 2 status: "Series variant added in `2026-05-16-synopsis-series-variant` slice."

**Verify:**
- `npm run test:run` — full suite green.
- `npm run check` — clean.
- `npm run build` — clean.
- Manual browser pass (per Ultraplan §Verification step 13).

## Data safety rules

These rules govern every commit in this slice. Violation = block the task.

1. **Lazy-init `content.series` only when needed.** The orchestrator (`SynopsisTab`, Task 7) initializes `content.series = createEmptySeriesContent()` exactly when an incoming patch sets `header.format === 'series'` AND `content.series === undefined`. No other code path creates a series block. Feature-only projects never gain a `series` key. Pure idempotent: re-applying the same patch shape does not double-init.

2. **Series is additive in storage.** Switching feature → series → feature must preserve BOTH the feature data (`prose`, `qa`, `logline`, `header.targetRuntime`, `aiProductionImplications`) AND the series data (`content.series`). Verified by the Task 7 round-trip test.

3. **`saveProjectState` must continue to spread `...existingDoc.content`.** The Phase 2 fix (`mirrorSynopsisFromLegacy` instead of `legacyToDocuments`) carries series through unchanged. Task 2's regression test guards this. Any change to the save path must re-prove series survival.

4. **`createEmptySynopsisContent` factory stays feature-only.** Do not add `series` to the factory output. Series only appears in storage when the user explicitly enters series mode. Empty/new projects have `content.series === undefined`.

5. **Legacy `state.synopsis` mirror is feature-only.** `documentsToLegacy` reads only `content.logline.text` + `content.prose`. Series content is invisible to the legacy slice (and therefore invisible to legacy consumers like Sam's existing `synopsis.sections` field). Sam upgrade in Task 8 is the surgical exception.

6. **Format flip is non-destructive.** Changing `header.format` between `feature` ↔ `series` never deletes data from the other format's block. The orchestrator does NOT clear `content.prose`/`qa` when switching to series, and does NOT clear `content.series` when switching to feature.

7. **Clear semantics documented.** The two-click `Clear synopsis` button — in both feature and series edit views — resets `documents.synopsis.content` to `createEmptySynopsisContent()`, which means it wipes BOTH feature AND series blobs. This is the existing `clearSynopsis` behavior from Phase 2; no change. Documented so the user is not surprised. A future "clear only series" affordance is a separate slice.

8. **`header.format` schema stays `z.string()`.** Do not narrow to `z.enum`. Legacy data with any free-text value must still load. UI enforces the dropdown options at the editor level.

## Required tests before final commit

Before merging this slice, all of the following must be green:

### Schema + data layer (Tasks 1, 2)
- ✅ `SynopsisSeriesContentSchema` accepts populated + empty content
- ✅ Bad `seriesType` / `episodeLength` rejected
- ✅ `SynopsisDocumentContentSchema` accepts with-or-without `series`
- ✅ `mirrorSynopsisFromLegacy` preserves populated `content.series`
- ✅ `mirrorSynopsisFromLegacy` preserves series when legacy logline + sections also populated
- ✅ Undefined series stays undefined (no auto-creation by the mirror)

### Header editor (Task 3)
- ✅ Format dropdown renders Feature / Series options
- ✅ Empty / legacy format strings render as `Feature` selected
- ✅ Change fires `onChange({ format })` with new value
- ✅ Series rows hidden when format=feature
- ✅ Series rows hidden when callbacks missing
- ✅ Series rows render when format=series + both callbacks supplied
- ✅ Defaults: `seriesType=ongoing`, `episodeLength=hour`
- ✅ Change fires correct callback with correct value

### Series editor components (Task 4)
- Per-component tests covering: renders, value binding, onChange fires with correct payload, variable-list add/remove behavior, no auto-seed on empty `futureSeasons` / `characters`.

### Orchestrator (Task 5)
- All eight sub-sections render
- `patchSeries` wires correctly
- Two-click clear arms on first click, fires `onClear` on second, auto-cancels after timer

### Document view (Task 6)
- Series mode renders metadata rows including seriesType + episodeLength
- Runtime row hidden in series mode (replaced by episodeLength)
- Empty series sections omitted
- Section order stable
- Falls back to feature rendering when format=series but `content.series` undefined

### Tab routing (Task 7)
- Legacy `format=''` renders feature edit view + QA checklist
- Flip to series: initializes `content.series`, renders series edit view, hides QA
- Flip back to feature: feature view with preserved feature data, QA returns
- Round-trip flip preserves both `content.prose` and `content.series` byte-equivalent
- Lazy-init is idempotent (re-applying same patch does not double-init)

### Sam context upgrade (Task 8)
- Client `buildProjectContext` returns `synopsis.format` + `synopsis.showOverview`
- Server `projectContextSchema` accepts the two new fields (not stripped)
- Sam prompt block includes the two new lines

### Full suite (Task 9)
- `npm run test:run` — all green (expected ~620+ tests)
- `npm run check` — zero TS errors
- `npm run build` — clean (chunk-size advisory acceptable)
- Manual browser pass: format flip preserves data both directions; Sam can reference Show Overview in chat
