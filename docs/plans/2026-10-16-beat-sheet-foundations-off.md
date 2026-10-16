# Beat Sheet: Story-drive beats only

Date: 2026-10-16 · Branch: `plan/beat-sheet-foundations` · Status: Codex round 1 folded in; Ben approved both protected-test edits
A small step after pare-down Phase 3 and before Phase 4. The pare-down plan's hard boundary, key decision and fact rule all apply (`2026-10-15-writeros-pare-down.md`).

## Why

The Beat Sheet still asks seven foundation questions: who we follow, what they want, what they need, what pushes back, what failure costs, the theme, and the ending. The pare-down removed this kind of duplicate fact-entry from every other surface: the Story Bible and canon hold these facts, and Morgan reads them there.

On projects not linked to Story-drive, the Beat Sheet is also a hand-written beat editor. Ben, 2026-10-16: beats edited by hand lack Story-drive identity (Grave Affairs must be resubmitted through Story-drive for this reason). Ben chose: **the Beat Sheet shows Story-drive beats only.**

Usage today: only Grave Affairs has foundation answers (6 of 7), and they are flawed hand data. Bloodless (linked) has none, and the other six projects have none.

## What changes

1. **Linked projects** (`BeatSheetView.tsx`): remove the foundation cards (`SERIES_FOUNDATIONS`) above the beats. The status line, beats, Lookbook questions and orphan answers stay exactly as they are.
2. **Unlinked projects** (`OutlineTab.tsx`): replace `OutlineEditView` with a plain empty state:
   > No beat sheet yet. Beats come from this project's Story-drive beat sheet once the project is linked.
   - The beat-sheet status line still shows when there is one.
   - `OutlineEditView` and its card components are removed if nothing else imports them.
3. **No writes on open** (Codex R1): the effect in `OutlineTab.tsx` that seeds episodes 101–103 into a series outline is removed, so opening the Beat Sheet never changes `outline.json`. The format switch no longer warns about hidden answers.
4. **"Clear answers"** and `ClearOutlineDialog` are removed. No editable answers remain on the Beat Sheet. Lookbook answers have their own Dismiss. `useProjectState.clearOutline` goes if it has no other caller.
5. **Readers**, by the Phase 3 fact rule:
   - `wpRouting.ts` `documentOutlineBeats`:
     - The "Story spine" pseudo-beat is dropped; the Story Bible and canon carry those facts.
     - Hand-written units on an unlinked project are no longer sent as beats, so agents see the same beats the writer sees: Story-drive beats only.
   - `surfaceAwareness.ts` `outline` case: foundation cards and hand-unit cards come out of the question list. Agents then get no "unanswered" questions the page no longer asks.
     - For a linked project, it keeps the beat cards it sends today, so the wp-chat outline patch path (which needs an intake surface) is unchanged.
     - For an unlinked project, it reports `{ kind: 'none' }`.
     - For an unlinked project the old wp-chat writing partner therefore no longer proposes hand-outline rewrites (Codex R1). That is intended: beats come from Story-drive only. Morgan's own `outline` target is untouched (hard boundary).
   - `leftZone.ts` (Codex R1): the left rail's Beat Sheet list and beat count show Story-drive beats only; an unlinked project shows none.
   - `WritersRoom.tsx`, Oliver's summary: "N beats" from Story-drive beats; spine count dropped.
   - `shared/compose/factSheet.ts`, `recipe.ts`, `sourceHash.ts`: **unchanged.** They feed What's Standing and the compose source hash. Changing them would change canon-side output (hard boundary).

## What does not change (hard boundary)

- `documents/outline.json` on disk: the spine fields and hand units stay byte-for-byte. Nothing is migrated or deleted, as with the frozen synopsis and treatment.
- Beat sheet sync, the save route, the observer, `beatSheetRoutes` (including its spine-preserving save, covered by `tests/server/beatSheetRoutes.test.ts`, unedited), Morgan's `outline` target and the synced-beat guard.
- Lookbook.
- Project format selector on the Beat Sheet.

## Protected test edits (Ben approved both, 2026-10-16)

In `tests/components/BeatSheetView.test.tsx`:
- "keeps the Foundations cards above the beats" is rewritten to assert that **no** foundation card renders and that beat 1 still shows.
- "shows the full deck when there is no beat sheet" (Codex R1) is rewritten to assert the "No beat sheet yet" message and no Refresh button. It also stops passing the two removed episode props.

Every other assertion in the file stays.

## Not in scope (logged)

- **A "Link to Story-drive" button.** Linking is still terminal-only (audit F13), so an unlinked project's Beat Sheet is empty until someone links it. This is the obvious next small feature.
- Grave Affairs resubmission through Story-drive: Ben's, in Story-drive.

## Verification

- `npm run test:run`, `npm run check`, `npm run build`. Protected tests unedited except the one above.
- Sandbox walkthrough (port 5277):
  - Bloodless's Beat Sheet shows the status line and beats, with no foundation cards.
  - Grave Affairs (unlinked) shows the empty state.
  - `outline.json` for both is byte-identical before and after opening and saving.
- Impeccable detector on changed UI.
- Ask Morgan about the beats on Bloodless: she gets beats and no foundation questions.

## Roles

As in Phase 3: Claude builds, Codex reviews (this plan first, then the diff, at most two rounds, Critical/Important only). Merge and deploy on Ben's word.
