# Slice 4 — Make Script Facts Useful in the Editor (Design)

> **Status:** Implemented and merged via PR #22 on 2026-06-03.
> **Predecessors:** Slice 2 (Script Facts Panel, PR #20), Slice 3 (Script Facts → AI context routing, PR #21).
> **Branch:** `slice-4-script-facts-editor-utility` (merged and deleted).

## Goal

Make the existing Script Facts panel useful *inside the editor*: surface near-match
warnings clearly, let the writer click a fact to jump to its occurrences in the
script, and provide an **assisted-manual** merge workflow that steps through the
occurrences of two near-matched labels so the writer fixes the spelling themselves.

No script-text mutation. No alias/merge persistence. No Vault. No AI-context changes
(Slice 3 already gates stale facts out of AI context).

## Non-Goals (YAGNI)

- No automatic rename / script-text rewrite (merge is assisted-manual only).
- No alias mapping store, no `vault/` work, no manifest.
- No change to AI-context routing or persona prompts.
- No auto-rebuild of the facts cache (rebuild stays the existing explicit button).

## Locked Product Decisions

1. **Merge = assisted-manual.** Merging two near-matched facts means stepping the
   writer through every occurrence of *both* labels (document order) so they retype
   the canonical spelling. The tool never edits the document. After the writer fixes
   the text the panel goes Stale; an explicit Rebuild resolves the warning naturally.
2. **Navigation resolves from the LIVE document at click time** — never from cached
   `blockIndices`. (See Critical Constraint.)
3. **Stale fully gates the interactive affordances.** When facts are not `Current`
   (`contentHash !== currentContentHash`) or never rebuilt, fact rows and warnings are
   plain, non-interactive text and the panel shows a "Rebuild to navigate" hint.
4. **Repeated click on a fact cycles** through that fact's occurrences (1st → 2nd → …
   → wraps).

## Critical Constraint — why navigation must be live

`parseScriptBlocks` assigns `block.index = sourceIndex` over the full
`[data-element-type], p` element list, **then filters** blocks with empty text. The
content hash (`hashScriptBlocks`) is computed over the *filtered* blocks, so empty
paragraphs contribute nothing to the hash. But cached `ScriptFactEntry.blockIndices`
preserve the *pre-filter* source positions.

Consequence: inserting an empty paragraph above a fact shifts that fact's live
position **without changing the content hash** — the cache stays `Current` while
cached `blockIndices` point one slot off. Therefore Current/stale status alone does
**not** prove cached indices are safe for navigation.

**Resolution:** Navigation and the merge stepper compute occurrence positions by
walking the *live* ProseMirror document at click time, using the same block-keying
logic that derivation uses, and filtering empty blocks identically. Cached
`blockIndices` are not used for navigation. Empty-paragraph churn cannot misdirect
navigation because positions are read live and empties are filtered the same way on
both sides.

`Current` gating is retained as a coarse guard: a stale fact may name a label that no
longer exists live, so interactive affordances stay disabled until Rebuild.

## Architecture

### New module: `client/src/lib/scriptFactNavigation.ts`

Pure, editor-agnostic resolution of fact → live occurrences.

- Export: `resolveFactOccurrences(blocks, target): number[]`.
- Input: `blocks` — an ordered list of live blocks with positions
  (`Array<{ type: ElementType; text: string; pos: number }>`, empties already
  filtered) — plus a `target` of `{ section, label }`.
- Output: `number[]` of ProseMirror positions, in document order, for every block
  whose derived key matches the target. Times resolve against scene-heading blocks
  via the existing `extractSceneTimes`; characters via the character-cue key;
  locations/transitions via the whole-block key.
- Reuses a shared keying helper (below) so navigation keying cannot drift from
  derivation keying.

**Contract — cached `blockIndices` are never read for navigation.** This module and
the editor bridge derive positions only from the live document passed in at call
time. `ScriptFactEntry.blockIndices` remains in the cache for derivation/display but
is intentionally not an input here. This is what makes empty-paragraph churn (which
does not change the content hash) unable to misdirect navigation.

### Refactor: `client/src/lib/scriptFacts.ts`

Extract the per-block keying currently inlined in `deriveScriptFactsFromBlocks` into
exported helpers, e.g.:

- `factKeyForBlock(block): { section: ScriptFactSection; key: string } | null` for
  character / scene-heading(location) / transition blocks.
- Keep `extractSceneTimes` exported for the times case.

`deriveScriptFactsFromBlocks` is rewritten to consume these helpers (behavior
unchanged — covered by existing derivation tests). `scriptFactNavigation.ts` consumes
the same helpers. This is the only change to `scriptFacts.ts` derivation behavior:
none, just extraction.

### Editor bridge: `ScriptTab.tsx`

- Add a `buildLiveBlocksWithPositions(editor)` helper: walk `editor.state.doc`
  top-level nodes, capture `{ type: node.attrs.elementType (normalized), text:
  node.textContent (normalized), pos }`, filter empty text. Order matches
  `parseScriptBlocks`.
- Add `handleFactNavigate(section, label)` and merge-stepper state. On click: build
  live blocks, call `resolveFactOccurrences`, then
  `editor.chain().setTextSelection(pos).scrollIntoView().focus().run()` and apply a
  transient highlight. Repeated calls for the same fact advance a cursor index
  (wrap). A different fact resets the cursor.
- Transient highlight: brief CSS class on the target node (or a ProseMirror
  decoration) that fades; no persistent document change.
- Gating: pass an `interactive: boolean` (= panel status is `Current`) to the panel;
  only wire callbacks when interactive.

### Merge stepper

Built entirely on navigation. For a warning `{ labels: [a, b], section }`:

- Resolve occurrences for `a` and `b` from the live document, concatenate, sort by
  document position → a single ordered walk.
- "Step through" advances one occurrence per click (wrap at end). Same transient
  highlight + cursor placement.
- No state persisted beyond the in-session stepper cursor.

### Panel: `ScriptFactsPanel.tsx`

- Props gain `interactive: boolean`, `onNavigateFact(section, label)`,
  `onStepWarning(warning)`.
- When `interactive`, fact rows render as buttons; warnings render reason + a "Step
  through" button. When not interactive, current plain rendering + a muted "Rebuild to
  navigate" hint near the status.
- Warning reason copy: `edit-distance` → "possible typo"; `token-containment` → "one
  name contains the other". Show section (Characters / Locations).

## Data Flow

```
ScriptFactsPanel (click fact / step warning)
  → onNavigateFact / onStepWarning  (ScriptTab)
    → buildLiveBlocksWithPositions(editorRef.current)
    → resolveFactOccurrences(blocks, target)   [scriptFactNavigation.ts]
    → editor.chain().setTextSelection(pos).scrollIntoView().focus()
    → transient highlight
```

Cache (`state.script.facts`) is read-only here; it supplies the *list* of facts and
warnings to display and the Current/stale status. It is never written by this slice.

## Error / Edge Handling

- Fact has zero live occurrences (possible only if Stale slipped through): no-op, keep
  affordances disabled when not `Current`.
- Editor not ready / null ref: no-op.
- Times fact: resolve against scene-heading blocks; if the time token no longer
  appears, no-op.
- Cursor index out of range after edits: clamp / reset to first.

## Testing

Unit (`scriptFactNavigation.test.ts`):
- Character / location / time / transition keys resolve to correct positions.
- **Required:** insert an empty paragraph before a fact; cache stays `Current`;
  resolution still returns the correct live position (lands correctly, not off-by-one).
- Multiple occurrences return positions in document order.
- Merge resolution merges + sorts both labels' occurrences by position.

Component (`ScriptFactsPanel.test.tsx`):
- Not-`Current` → rows/warnings non-interactive + rebuild hint shown.
- `Current` → fact rows are buttons; warning shows reason text + step button.
- Clicking a fact calls `onNavigateFact` with `(section, label)`.

Integration (`ScriptTab` test, jsdom):
- Click fact → editor selection/scroll invoked at resolved position.
- Repeated click cycles occurrences.
- Step-through walks both labels in document order.

## Files

**Create:**
- `client/src/lib/scriptFactNavigation.ts`
- `tests/lib/scriptFactNavigation.test.ts`

**Modify:**
- `client/src/lib/scriptFacts.ts` — extract shared keying helpers (no behavior change).
- `client/src/components/writing/ScriptFactsPanel.tsx` — interactive rows, warning
  reasons, rebuild hint.
- `client/src/components/writing/ScriptTab.tsx` — live block/position bridge,
  navigate + step handlers, transient highlight, interactive gating.
- `tests/.../ScriptFactsPanel.test.tsx`, `tests/.../ScriptTab` tests — extend.

## Verification

`npm run test:run`, `npm run check`, `npm run build`, `git diff --check`. Manual
browser QA: click facts to navigate, insert a blank line above a fact and confirm
navigation still lands correctly, step through a near-match warning.
