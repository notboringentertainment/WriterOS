# Script Workflow Polish PRD

**Date:** 2026-05-23
**Last updated:** 2026-06-03
**Status:** Active — Slice 1 and Script Facts shipped; next open product slices are Scratchpad, Script Status/Locking, and Autocomplete.
**Branch context:** `main` @ `d83f7a3`
**Depends on:** `docs/product/app-home-import-storage-prd.md` (complete)
**Related docs:** `docs/product/project-identity-script-context-prd.md`, `docs/product/writeros-future-work-prd.md`

## Purpose

This PRD captures the next script-editor product layer approved after reviewing StudioBinder-style workflow ideas.

It is intentionally narrow. The app foundation path is complete:

1. `.writeros` project package storage. ✅
2. Home project folder viewer backed by real external project folders. ✅
3. Final Draft `.fdx` import into the script editor. ✅
4. localStorage migration into file-backed projects. ✅ (Slice 4, PR #11)
5. Show in Folder and Duplicate package actions. ✅ (Slice 5, PR #13)

With the foundation stable, this PRD's slices improve writer flow without turning the product into a production-management suite.

## Approved Scope

This PRD owns five features, listed in implementation order:

1. **Title page + pagination foundation** (Slice 1, shipped) — establishes professional script metadata and gives writers trustworthy page breaks, page numbers, and page count.
2. **Script Facts panel** (Slice 2, shipped) — rebuild-from-script derivation of characters, locations, times, transitions; foundational for agent grounding and later autocomplete.
3. **Script scratchpad sidebar** (Slice 3, open) — persistent script-adjacent notes.
4. **Script locking/status flag** (Slice 4, open) — conservative readiness state.
5. **Character/location autocomplete** (Slice 5, open) — editor-flow polish; depends on Script Facts.

## Current State

Current `main` has:

- A functional Script surface built on TipTap.
- Screenplay element types: scene heading, action, character, dialogue, parenthetical, transition.
- Basic screenplay formatting through CSS margins and Courier-style page layout.
- Layout-derived page count in the Script toolbar.
- Title page metadata and read-only title page preview.
- Visible screenplay page divisions and page numbers.
- Keyboard flow for Tab, Shift-Tab, Enter, and Backspace element transitions.
- Scene extraction and script indexing for agent context.
- Script Facts derivation, persistence, stale indicator, near-match warnings, and Scan action.
- Current Script Facts routing into Writer's Room / Writing Partner context.
- Script Facts editor utility: click-to-navigate, repeated-click cycling, and assisted-manual warning step-through from the live editor document.
- File-backed `.writeros` project storage with Home folder viewer.
- Functional `.fdx` import populating script content.
- Show in Folder / Duplicate package actions.

Current `main` does not have:

- Character or location autocomplete.
- Script scratchpad/sidebar notes.
- Script lock/readiness state.
- PDF export.

## Product Principle

Function comes before form.

The Script surface should host the necessary writing workflow cleanly. Visual design can become more editorial later, but these features should first be implemented as direct, reliable controls that keep a writer in the script.

A second principle adopted during storage work: **rebuild from source.** Derived data (script facts, indexes, agent context) should be reconstructable from the canonical script at any time. The script is truth; derived stores are cache.

A third principle for this PRD: **page count must be trustworthy.** For screenwriters, page count is not decorative metadata. It is one of the main instruments for pacing, schedule awareness, and draft readiness. The Script surface should make page boundaries and current count visible without requiring PDF export.

## Feature 1: Title Page + Pagination Foundation (Slice 1)

WriterOS establishes the professional script front matter and the basic page model before full PDF export exists. This gives writers a usable title page preview and, more importantly, a trustworthy sense of where script pages begin and end while drafting.

Slice 1 may ship as multiple PRs:

1. **Slice 1a: Title page metadata + preview** — lower-risk project metadata work.
2. **Slice 1b: Pagination architecture spike** — choose the page model before building live pagination.
3. **Slice 1c: Pagination foundation** — visible page divisions, page numbers, and layout-derived page count.

Slice 1a can proceed independently and may ship as its own PR; the title page preview becomes usable in the Script surface before pagination work begins. Slice 1c should not be implementation-planned until Slice 1b records the chosen pagination approach and minimum supported page-break conventions.

V1 metadata:

- project title (mirrors project identity / `ProjectState.meta.title`)
- writer name
- based on / adapted from, optional
- contact block
- draft label
- draft date
- project format display, optional (derived from `ProjectState.meta.format` unless explicitly overridden later)

V1 behavior:

- Title page fields live with the project (persisted in `.writeros` package).
- The Script surface exposes a simple title page settings panel or modal.
- Metadata can be previewed as a clean read-only title page.
- Title page is visually consistent with standard screenplay title page conventions (centered title, byline, contact bottom-left).
- The Script editor uses a fixed US Letter 8.5 x 11 inch screenplay page model with Courier 12pt and stable standard screenplay margins.
- Page divisions are visible while writing.
- Script pages display page numbers.
- Toolbar page count is derived from the actual rendered script page model, not a rough word-count estimate.
- The title page preview is separate from screenplay page 1 and does not change script page numbering. Title page is unnumbered; screenplay body begins at page 1.
- A new empty script renders as one blank screenplay page and the toolbar shows 1 page.
- When PDF export exists, this metadata and page model become the foundation for exported scripts.

Open spike before plan:

- Decide whether V1 pagination should measure rendered DOM blocks directly or introduce an intermediate page-layout model that export can reuse later.
- Define the minimum convention-safe page-break behavior for V1 before implementation starts.
- Record the decision as a dated `## Slice 1b Pagination Architecture Decision` section appended to this PRD before Slice 1c planning begins.

Out of scope for V1:

- Full PDF export engine.
- Watermarks.
- Distribution tracking.
- Multiple title page templates.
- Revision pages or WGA color revision workflows.
- Production pagination, locked pages, or scene numbering.
- Dual dialogue pagination.
- Automatic `(MORE)` / `(CONT'D)` dialogue continuation markers.
- Automatic `CONTINUED:` scene continuation markers at page tops or bottoms.
- Browser print stylesheet behavior; PDF export will replace it later.

Reasoning:

Title pages are low-complexity and high-legibility. Proper pagination is more foundational but also more complex: writers need to see real page breaks and page count while drafting, not only during export. Shipping these under one Slice 1 priority keeps page awareness at the front of the product, while sub-slicing and spiking pagination first prevents the title page work from turning into an accidental full layout engine.

## Feature 2: Script Facts Panel (Slice 2)

Script Facts is a read-only panel that surfaces what's actually in the current script: characters, locations, times of day, transitions.

It is rebuilt from the current WriterOS script (the canonical draft), not from the original `.fdx` import. This keeps agents grounded in the current state and works equally for imported and natively-authored scripts.

V1 behavior:

- A "Scan Script Facts" action scans the current script and refreshes derived lists.
- Panel displays four sections: Characters, Locations, Times, Transitions.
- Each entry shows count of occurrences.
- Near-match warnings flag likely duplicates (e.g. `MARCUS` vs `MARCOS`, `INT. KITCHEN` vs `INT. KITCHEN -- NIGHT`).
- Derived facts persist as cache with `rebuiltAt` timestamp and a script-content hash so the panel can show "stale — script changed since last scan."
- Panel is read-only. No manual editing of facts. No mutation of script content.
- Agents may read facts as grounding context once a later integration explicitly opts in.

Out of scope for V1:

- Manual fact editing.
- Autocomplete (separate Slice 5).
- Agent write-back / agent-driven script edits.
- Auto-scan on every keystroke (explicit Scan button only; stale indicator is enough).
- Cross-project facts.

Open spike before plan:

- Identify the canonical script representation (TipTap doc JSON vs. serialized form on disk) so the parser walks the right abstraction layer.

### Slice 2a Spike: Canonical Script Representation

Decision date: 2026-06-02

Script Facts should walk a normalized screenplay-block adapter derived from `ProjectState.script.rawHtml`.

`ProjectState.script.rawHtml` is the canonical persisted script draft for Slice 2:

- Native editor edits flow through TipTap, then publish `editor.getHTML()` into `ProjectState.script.rawHtml`.
- Final Draft import converts `.fdx` paragraphs into the same WriterOS screenplay HTML before project state is created or replaced.
- File-backed packages write and read `script/script.writeros.html`, then rebuild script scenes and script metadata from that HTML.
- Existing agent context and pagination already rebuild from the same HTML via `buildScriptIndex` / `paginateScript`.

TipTap doc JSON is the live editor implementation detail, not the Slice 2 storage or parser target. The UI may pass the current editor snapshot HTML into the same adapter before the debounced persisted save lands, but the parser should not grow a separate TipTap JSON path. The original `.fdx` source is also not a parser target; after import, WriterOS script HTML is truth.

Adapter contract for implementation:

- Extract/expose the existing `parseScriptBlocks(rawHtml)` path from `buildScriptIndex` as the shared screenplay-block adapter; do not create a second HTML walk.
- Block shape: `{ index: number; type: ElementType; text: string }`.
- `index` preserves source paragraph order, including gaps if empty paragraphs are filtered out.
- `type` is normalized with `normalizeElementType`; unknown or missing element types become `action`.
- `text` collapses whitespace and trims, matching current `buildScriptIndex` behavior.
- Facts, script index, and future autocomplete should consume this adapter instead of each parsing HTML differently.

Staleness hash decision:

- Use a deterministic, local, non-cryptographic content hash over a versioned serialization of normalized screenplay blocks.
- Recommended implementation: FNV-1a 32-bit rendered as hex, seeded by a prefix such as `script-facts:v1`.
- The hash is only for stale-cache detection, not security. It should serialize the ordered `{ type, text }` sequence only, not sparse source indices, ids, scenes, or raw HTML. It should change when normalized visible block order, type, or text changes, while ignoring equivalent HTML serialization noise and empty-paragraph churn.

Near-match decision for V1:

- Use deterministic local matching only.
- Normalize labels to uppercase ASCII-ish text, strip punctuation, collapse whitespace, and compare token strings.
- Exact normalized equality is a single fact, not a warning.
- Flag likely duplicates when Levenshtein distance is `<= 2` for normalized strings whose longer label is at least 5 characters, with short labels below 5 characters excluded from edit-distance warnings.
- For locations, also flag token-set containment where the shorter label's tokens all appear in the longer label with one extra qualifier/time token, so `INT. KITCHEN` vs. `INT. KITCHEN -- NIGHT` is caught even though edit distance is large.
- Apply near-match warnings only to Characters and Locations in Slice 2 V1.

Implementation staging:

1. Extract/shared-test the screenplay-block adapter and content hash.
2. Build Script Facts derivation and cache shape from the adapter.
3. Add project-state persistence/migration for the derived cache.
4. Add the read-only panel, Scan action, stale indicator, and near-match warnings.

Shipped follow-ons:

- Script Facts now feed Writer's Room / Writing Partner context only when current.
- The panel now supports live-document click-to-navigate, repeated-click cycling, clearer warning reasons, and assisted-manual warning step-through.
- Explicit Scan remains intentional; "stale" means the derived facts cache no longer matches the current script and should not drive navigation or AI context until refreshed.

Reasoning:

Script Facts is infrastructure, not a writer-facing feature in isolation. It validates the rebuild-from-source pattern for derived data, gives agents clean grounding for future work, surfaces real writing issues (name drift) immediately, and seeds Slice 5 autocomplete with deterministic local data.

## Feature 3: Script Scratchpad Sidebar (Slice 3)

The scratchpad is a persistent script-adjacent note surface.

It lets writers keep working notes beside the screenplay without leaving the Script tab.

V1 behavior:

- Opens as a right-side sidebar or docked panel from the Script surface.
- Persists per project (in `.writeros` package).
- Supports plain rich text notes.
- Supports checkboxes for beat/task tracking.
- Supports simple bullet lists.
- Can optionally pin a note to the current scene.
- Does not alter screenplay content.
- Does not get sent to agents unless a later context rule explicitly includes it.

Out of scope for V1:

- Image embeds.
- Video embeds.
- Notion-style arbitrary block database.
- Collaboration comments.
- Project-wide asset management.

Reasoning:

The StudioBinder-style scratchpad is useful, but WriterOS should start with a durable writing aid, not a media-heavy sidebar. Image/video references should wait until `.writeros` storage has an asset model.

## Feature 4: Script Locking And Status (Slice 4)

Script locking gives the project a clear readiness state.

V1 does not attempt full production draft locking. It adds a conservative status flag that can later feed breakdown, export, and version workflows.

Recommended states:

```text
draft
locked
ready_for_breakdown
```

V1 behavior:

- Writer can mark the script as locked.
- Writer can mark the script as ready for breakdown.
- Locking requires confirmation.
- Locked status is visible in Script and Home project metadata.
- Locked status does not prevent editing in V1 unless a later PRD explicitly adds hard edit protection.
- Agents may receive the status as project metadata.

Out of scope for V1:

- WGA revision colors.
- Locked pages.
- Production scene numbering.
- Multi-user approval workflow.
- Breakdown sheet generation.

Reasoning:

The useful near-term product idea is not production bureaucracy. It is a clear signal that the writer considers this draft stable enough for the next workflow.

## Feature 5: Character And Location Autocomplete (Slice 5)

Autocomplete keeps writers in flow while typing the script.

V1 character sources:

- Script Facts characters (Slice 2 derivation).
- Story Bible character names when present.

V1 location sources:

- Script Facts locations (Slice 2 derivation).
- Previously used location segments from headings.

V1 behavior:

- Character autocomplete appears while typing character cues.
- Location autocomplete appears while typing scene headings.
- Suggestions are local and deterministic — sourced from Script Facts cache, not a live re-scan.
- Writer can ignore suggestions without UI friction.
- Selecting a suggestion preserves screenplay casing rules.
- No network or AI call is required.

Out of scope for V1:

- AI-generated character names or locations.
- Cross-project autocomplete.
- Aggressive auto-replacement.
- Full Final Draft parity.

Reasoning:

This is editor-flow polish that should happen after Script Facts so suggestions come from a known, refreshable source. Shipping Script Facts first means autocomplete is a thin UI layer over an already-validated derivation.

## Dependencies

App foundation dependencies are satisfied (storage Slices 4, 5, 5a complete).

Feature-specific dependencies:

- Title page metadata persists in the `.writeros` package — uses existing project storage. Project title mirrors `ProjectState.meta.title`; title-page-specific fields live in title page metadata.
- Pagination depends on a Slice 1b architecture spike before implementation begins.
- Pagination is derived from the current screenplay content and layout; page numbers are not manually stored.
- Script Facts depends on identifying the canonical script representation (spike before Slice 2 plan).
- Scratchpad persistence uses file-backed project storage. ✅
- Autocomplete (Slice 5) depends on Script Facts (Slice 2).
- Title page and pagination export depend on a later PDF/export pipeline (deferred).
- Locking/status should be part of project metadata, not a UI-only flag.

## Implementation Sequence

1. **Slice 1: Title Page + Pagination Foundation** — shipped: 1a metadata schema/settings/preview, 1b pagination architecture spike, 1c visible page divisions/page numbers/layout-derived page count.
2. **Slice 2: Script Facts** — shipped: canonical-script spike, parser, derived store with `rebuiltAt` + content hash, read-only panel, duplicate warnings, Rebuild button, current-facts AI context, and editor navigation utility.
3. **Slice 3: Scratchpad** — open: persistent sidebar, rich text, checkboxes, optional scene pin.
4. **Slice 4: Status flag** — open: script status metadata, visible controls, project-metadata exposure.
5. **Slice 5: Autocomplete** — open: character/location suggestions sourced from Script Facts and Story Bible.
6. **Later:** connect title page metadata and script page model into export when export pipeline exists.

Numbering note: the Script Facts editor utility plan/PR used "Slice 4" locally, but it is part of the shipped Script Facts workstream in this PRD. The open PRD Slice 4 remains the Script Status flag.

This order ships visible metadata and trustworthy page awareness first, then derived infrastructure, then writing aids, then state, then editor-flow polish.

## Acceptance Criteria

**Slice 1 — Title Page + Pagination:**
- Title page metadata persists with the project across reloads.
- Title page preview renders without requiring PDF export.
- All V1 metadata fields are editable from the Script surface.
- Slice 1b pagination architecture decision is documented in this PRD before Slice 1c planning begins.
- Screenplay pages use the specified US Letter / Courier 12pt page model.
- Script page divisions are visible in the editor.
- Script pages display page numbers.
- Toolbar page count is based on the rendered screenplay page model, not a word-count estimate.
- Title page preview is unnumbered and does not count as screenplay page 1; screenplay body begins at page 1.
- A new empty script shows one blank screenplay page and a toolbar count of 1 page.
- Page breaks honor the minimum convention set defined in the Slice 1b spike output, including at minimum: scene heading kept with next line, character cue kept with first dialogue line.
- WriterOS maintains an internal reference set of 2-3 simple `.fdx` fixtures (no dual dialogue, no `(MORE)` / `(CONT'D)`, no `CONTINUED:` markers) for Slice 1c validation.
- For those `.fdx` reference fixtures, WriterOS page count matches the known Final Draft page count within +/- 1 page.

**Slice 2 — Script Facts:**
- Script Facts panel displays characters, locations, times, transitions derived from the current script.
- Scan action refreshes the derived store and updates `rebuiltAt`.
- Panel shows a "stale" indicator when script content hash diverges from the cached scan hash.
- Near-match warnings appear for likely-duplicate characters or locations.
- Native (non-imported) projects produce the same panel as imported projects.

**Slice 3 — Scratchpad:**
- Scratchpad notes persist with the project and do not modify screenplay text.
- A scratchpad item can be pinned to the current scene.

**Slice 4 — Status:**
- A writer can see and change script status without leaving the Script surface.
- Locked/ready-for-breakdown status persists and appears in project metadata.

**Slice 5 — Autocomplete:**
- Character autocomplete suggests names present in Script Facts and Story Bible.
- Location autocomplete suggests locations present in Script Facts.

## Non-Goals

- Breakdown tagging.
- Elements Manager.
- Collaboration comments.
- Share links.
- Tasks assigned to collaborators.
- AV/two-column script mode.
- Script sides generator.
- WGA color revision system.
- Full PDF export.
- Watermarks.
- Production pagination / locked pages.
- Dual dialogue pagination.
- Automatic `(MORE)` / `(CONT'D)` dialogue continuation markers.
- Automatic `CONTINUED:` scene continuation markers at page tops or bottoms.
- Browser print stylesheet behavior.
- Call sheets or production scheduling.
- Manual editing of Script Facts.
- Agent-driven script edits.

Those may become separate PRDs later. They are not part of this approved next script workflow slice.

## Open Questions

These should be answered during implementation planning for each slice:

1. **Script Facts (Slice 2):** What is the canonical script representation the parser should walk — TipTap doc JSON in memory, the serialized form on disk, or both via a shared adapter? (Spike before plan.)
2. **Script Facts (Slice 2):** What near-match algorithm — Levenshtein threshold, normalized string prefix, or token-set comparison?
3. **Script Facts (Slice 2):** Which script-content hash algorithm should back staleness detection?
4. **Scratchpad (Slice 3):** Should scratchpad notes live under `documents.scriptScratchpad`, `script.scratchpad`, or a separate project notes file inside `.writeros`?
5. **Locking (Slice 4):** Should locking/status live in `ProjectState.meta`, `ProjectState.script`, or a dedicated production metadata object?
6. **Autocomplete (Slice 5):** Should autocomplete suggestions appear inline, in a small dropdown, or through an explicit keyboard command?

## Slice 1b Pagination Architecture Decision

**Date:** 2026-05-28

Slice 1c should introduce a deterministic screenplay pagination model as the source of truth for page count, page numbers, page divisions, and later export. The editor may use rendered DOM measurements to calibrate and smoke-test the browser view, but DOM measurement should not be the canonical pagination engine.

### Context

WriterOS already has the pieces of a script layout system:

- Screenplay element types live on TipTap paragraphs as `data-element-type`.
- Spacing and indents are centralized in `client/src/lib/screenplay.ts`.
- The editor CSS mirrors those spacing and indent constants.
- `.fdx` import normalizes screenplay content into WriterOS script HTML.

The missing piece is trustworthy page awareness. Current page counts are split between a word-count estimate in the script index and a rendered scroll-height estimate in the editor. Neither is strong enough for a writer-facing page count or for future PDF export.

### Options Considered

1. **DOM measurement as source of truth.**
   - Pros: closest to what the browser currently displays.
   - Cons: browser/layout timing dependent, harder to test headlessly, less reusable for package-level indexing and future PDF export.

2. **Pure deterministic layout model as source of truth.**
   - Pros: testable, portable, export-friendly, can run from saved project content.
   - Cons: must carefully match browser wrapping and screenplay CSS constants.

3. **Hybrid model.**
   - Pros: deterministic model remains canonical while DOM checks catch drift between model and editor rendering.
   - Cons: requires discipline so DOM checks do not become a second competing pagination system.

### Decision

Use option 3 with the deterministic model as canonical.

Slice 1c should add a pagination module, likely `client/src/lib/scriptPagination.ts`, that reads the current WriterOS script representation and returns a page model. The same result should drive:

- Script toolbar page count.
- Visible page divisions in the editor.
- Page number display.
- Script index page ranges once the old word-count estimate is replaced.
- Later PDF/export pagination.

The editor should not persist page breaks into screenplay content. Page breaks and page numbers are derived presentation state.

### Input Representation

Slice 1c should paginate from current WriterOS script content, not the original `.fdx` file.

The first adapter should accept the same serialized screenplay HTML shape used by `buildScriptIndex`: paragraphs with `data-element-type` and text content. If TipTap doc JSON becomes the better live-editor input later, it should feed the same normalized block shape instead of creating a separate pagination path.

Minimum normalized block shape:

```ts
type ScriptPaginationBlock = {
  index: number
  type: ElementType
  text: string
  sceneId?: string
}
```

### Page Model

Slice 1c should use the existing screenplay constants where possible and make page geometry explicit:

- US Letter: 8.5 x 11 inches.
- Font: Courier 12pt.
- Line height: 12pt / 1em = 1/6 inch.
- Margins: left 1.5in, right 1in, top 1in, bottom 1in.
- 54 usable 12pt lines per page = 9in body height (11in − 1in top − 1in bottom).
- Body page starts at page 1.
- Title page remains separate from the screenplay editor, unnumbered, not page 0, and excluded from the screenplay page count.
- An empty screenplay produces `pageCount: 1`, a single blank screenplay page, no block fragments, and `blocks: []`.

#### Empty-Page Sentinel

When the screenplay has no blocks, the single returned page uses these sentinel positions:

```ts
{
  pageNumber: 1,
  start: { blockIndex: 0, lineIndex: 0 },
  end:   { blockIndex: 0, lineIndex: 0 },
  blockStart: 0,
  blockEnd:   0,
  sceneIds:   [],
}
```

Consumers iterating a page's block range must guard with the script-level `blocks.length === 0` check before dereferencing `blocks[page.blockStart]`. For the empty-script result, `blockStart` and `blockEnd` are placeholders only and are not valid indexes into `blocks`. The sentinel exists so callers do not need to model "no page" as a separate state; an empty script always has exactly one renderable blank page.

#### Line Math

- 1 line = 12pt vertical = 1/6 inch.
- 54 lines per page is the usable body height; page-break decisions operate against this budget.
- Block height = `spacing-before` lines (from `getScreenplaySpacingBefore`) + wrapped text line count for the block's element type.
- `spacing-before` is suppressed when a block starts at the top of a page; the leading blank line is not charged against the new page's line budget.
- `pages[].blockStart` / `pages[].blockEnd` are inclusive block indices for non-empty scripts; they must match `pages[].start.blockIndex` / `pages[].end.blockIndex`.
- `blocks[].lineCount` counts only the wrapped text lines for that block. It excludes `spacing-before`, which is applied only during page-placement height calculations.
- Fragment `lineStart` / `lineEnd` values are zero-based offsets into the block's wrapped text lines, not page-relative or document-absolute coordinates. They use an exclusive-end convention so fragments at page boundaries do not double-count.
- Page `start.lineIndex` / `end.lineIndex` values use the same block-relative coordinate space as fragments; `end.lineIndex` may point one past the final content line represented on that page.

Per-element line widths should be derived from the 6in body content width and `SCREENPLAY_INDENTS` in `client/src/lib/screenplay.ts`; pagination must compute wrapping per element type, not from one uniform body width. Wrapped-line counts should be deterministic: use Courier 12pt as 10 characters per inch, calculate `charsPerLine = floor(elementWidthInches * 10)`, wrap at whitespace where possible, and hard-wrap only tokens longer than the available line width.

The pagination result should be enough to answer both page count and page-boundary rendering without re-measuring:

```ts
type ScriptPaginationPosition = {
  blockIndex: number
  lineIndex: number
}

type ScriptPaginationResult = {
  pageCount: number
  pages: Array<{
    pageNumber: number
    start: ScriptPaginationPosition
    end: ScriptPaginationPosition
    blockStart: number
    blockEnd: number
    sceneIds: string[]
  }>
  blocks: Array<{
    blockIndex: number
    pageStart: number
    pageEnd: number
    lineCount: number
    fragments: ScriptPaginationFragment[]
  }>
}

type ScriptPaginationFragment = {
  blockIndex: number
  fragmentIndex: number
  pageNumber: number
  lineStart: number
  lineEnd: number
  isContinuation: boolean
}
```

`pages[].blockStart` and `pages[].blockEnd` are inclusive block indices for non-empty scripts. They are intentionally duplicated from `start.blockIndex` and `end.blockIndex` as a convenience for consumers that need block-range iteration without unpacking positions. Fragment line indexes (`lineStart`, `lineEnd`) use the block-relative, exclusive-end convention above; a fragment with `lineStart: 2` and `lineEnd: 5` renders wrapped lines 2, 3, and 4 from that block. The first fragment of any block has `fragmentIndex: 0` and `isContinuation: false`; subsequent fragments produced by a page split have `isContinuation: true`. This lets Slice 1c render page breaks inside long action or dialogue blocks without inventing a second measurement pass.

### Minimum V1 Page-Break Conventions

Slice 1c is a pagination foundation, not full production pagination. It should still avoid the most visibly wrong breaks.

Minimum supported convention set:

- Keep a scene heading with the first following content line when both can fit on the same page.
- Keep a character cue with its first following parenthetical or dialogue line when both can fit on the same page.
- Keep a parenthetical with its first following dialogue line when both can fit on the same page.
- Allow long action or dialogue text to split by wrapped line when the block cannot fit on the current page.
- Do not insert or simulate `(MORE)`, `(CONT'D)`, or `CONTINUED:` markers in V1.

#### Deterministic Keep-With Fallback

When a protected pair (scene heading + next, character + first paren/dialogue, parenthetical + first dialogue) does not fit on the current page:

- The paginator pushes the entire protected pair to the top of the next page if the pair fits on a fresh page.
- If the protected pair still cannot fit on a fresh page (degenerate case: pair exceeds 54 lines), the paginator paginates normally without keep-with protection, splitting at the natural wrapped-line boundary. It does not insert `(MORE)`, `(CONT'D)`, or `CONTINUED:` markers and does not refuse to render.
- Keep-with is best-effort. It never causes the result to omit content, duplicate content, or produce overlapping fragments.

#### Long-Block Split Rule

- Action or dialogue blocks whose total height exceeds the remaining lines on the current page split at a wrapped-line boundary.
- The split should leave at least 2 wrapped lines on the current page and start with at least 2 wrapped lines on the next page when the block is long enough to support both.
- When the block is too short for the 2/2 rule (block length < 4 wrapped lines), the split proceeds at the natural boundary without further constraint. V1 does not enforce stricter widow/orphan logic.
- The resulting fragments retain the block's `blockIndex` and increment `fragmentIndex` per fragment; only the first fragment has `isContinuation: false`.

### Editor Integration

Slice 1c should keep the editor document canonical and render pagination as derived UI:

- Recalculate pagination from editor content after document-changing transactions.
- Use the pagination result to replace the toolbar's current page estimate.
- Render visible page divisions and page numbers from the same result.
- Keep page-break markers out of saved script HTML and `.writeros` package content.

#### Rendering Decision

Slice 1c renders the editor as a **continuous scroll** with derived page-break and page-number decorations layered over the existing screenplay surface. It does not introduce hard paginated page shells, fixed-height page containers, or off-screen page recycling. Hard page shells are deferred to a later slice (alongside PDF export and print stylesheet work).

#### Decoration Plugin Lifecycle

The pagination decoration plugin should:

- Hold the latest `DecorationSet` in plugin state.
- Recompute the full pagination result only for transactions that change the document (`tr.docChanged === true`).
- Skip recompute for selection-only transactions.
- Schedule the recompute behind `requestAnimationFrame` plus a debounce (suggested 150–250ms) so rapid keystrokes coalesce into a single recompute.
- V1 does **not** implement incremental recompute. Each recompute runs the paginator over the full document.

The plugin must assert that page-break and page-number decorations never appear in `editor.getHTML()` output.

#### Page Number Widget

Visible page numbers render top-right within the page's 1in top/right margin band, following Final Draft convention. The widget is positioned by the decoration plugin and is not part of the saved document.

### Validation Plan

Slice 1c should add an internal reference set under `tests/fixtures/fdx/pagination/`:

- 2-3 simple `.fdx` files.
- No dual dialogue.
- No automatic `(MORE)` / `(CONT'D)`.
- No `CONTINUED:` page-top or page-bottom markers.

#### Fixture Metadata

Each fixture sits beside an `expected.json` (or equivalent) describing the recorded Final Draft truth:

```json
{
  "finalDraftPageCount": 3,
  "capturedFrom": "Final Draft 12, default Letter template",
  "capturedAt": "2026-05-27",
  "notes": "Page count read from FD page navigator with title page hidden."
}
```

Acceptance: WriterOS page count matches `finalDraftPageCount` within +/- 1 page.

Additional tests should cover:

- Empty script returns 1 page.
- Title page metadata does not affect screenplay page count.
- Scene heading keep-with-next.
- Character cue keep-with-first-dialogue.
- Parenthetical keep-with-first-dialogue.
- First body page renders as page 1, not page 2.
- Long action/dialogue split behavior (2/2 minimum when block supports it).
- Per-element wrapping widths derived from `SCREENPLAY_INDENTS`.
- Pagination does not write page-break artifacts into saved script HTML.

#### Test Enumeration For 250-Word Estimate Removal

Slice 1c must update every test that currently asserts behavior against the legacy 250-word page estimate. At minimum:

- `tests/lib/scriptIndex.test.ts` — replace `ESTIMATED_SCRIPT_PAGE_WORDS`-based expectations with layout-derived page counts via the new paginator.
- `tests/lib/wpRouting.test.ts` — Writing Partner routing tests that assume 250 words/page must be re-anchored to layout-derived page count.
- Any other test that imports `ESTIMATED_SCRIPT_PAGE_WORDS` or hard-codes `250` against page math — grep before implementation and add to this list.

### Deferred

These remain out of scope for Slice 1c:

- PDF export.
- Browser print stylesheet support.
- Production locked pages.
- Revision pages or color revisions.
- Dual dialogue pagination.
- Automatic `(MORE)` / `(CONT'D)` dialogue continuation markers.
- Automatic `CONTINUED:` scene continuation markers.
- Final Draft parity for scripts that use deferred constructs.

### Consumers Of The Shared Pagination Result

`buildScriptIndex` in `client/src/lib/scriptIndex.ts` is the single integration point that replaces the legacy 250-word page estimate. It computes the layout-derived page count via the shared paginator and exposes it through the existing `estimatedPageCount` field for a transitional period; the field name remains for backward compatibility but the value becomes layout-derived.

Other call sites should inherit the layout-derived page count through `buildScriptIndex` rather than recomputing pagination themselves:

- `client/src/lib/fdxImport.ts` — no bespoke pagination logic in Slice 1c. The importer continues to produce normalized script content; page count is read from `buildScriptIndex` downstream.
- `client/src/lib/projectPackage.ts` — no bespoke pagination logic in Slice 1c. The package writer/reader continues to round-trip script content; page count is read from `buildScriptIndex` downstream.

If a future test or product requirement proves that one of these modules needs its own pagination pass, that decision is out of scope for Slice 1c and should be raised as a follow-up.

### Branch Hygiene

- Slice 1c work happens on branch `slice-1c-pagination-foundation`, created from `slice-1b-pagination-spike`.
- PR #17 (Slice 1b architecture spike) remains the planning base; no Slice 1c implementation merges into `slice-1b-pagination-spike`.
- If PR #17 receives review patches before Slice 1c implementation begins, rebase `slice-1c-pagination-foundation` onto the updated `slice-1b-pagination-spike` head before any implementation commits land.

### Slice 1c Planning Consequence

The Slice 1c plan should start with the shared pagination module and tests, then wire the editor toolbar and page-division UI to that model. It should not begin with browser DOM measurement as the primary engine, and it should not attempt PDF export in the same slice.
