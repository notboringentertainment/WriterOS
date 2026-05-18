# OutlineTab Story-Coach Redesign — PRD

**Date:** 2026-05-18
**Status:** Canonical for Outline redesign and the shared non-script surface standard
**Branch context:** `feature/screenplay-editor-core`
**Related docs:** `docs/product/README.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/structured-writing-surfaces-prd.md`

> Product alignment note: this PRD defines the current WriterOS surface pattern. Synopsis, Story Bible, and future Treatment should follow the same principle: plain-language Edit View, professional structure hidden behind the scenes, and studio-presentable Document View.

## Context

The OutlineTab currently shows 15 Save-the-Cat beats by their craft names ("Theme Stated", "Catalyst", "Debate", "All Is Lost", "Midpoint", "Break Into Three"). A novice writer using WriterOS for the first time has no idea what those mean. The tab feels like a craft exam, not a writing tool.

WriterOS is a writing-first product *and* a teaching tool. The Outline experience should feel like being gently interviewed by a smart story coach: plain-language questions that draw the structural answers out of the writer, mapped invisibly to a professional outline behind the scenes. The bundled `ai-film-writing-templates` skill (researched specifically for this) defines the professional output shape.

This PRD keeps the existing multi-card workflow. It does not introduce chat, AI generation, or a new wizard. It does not change agent behavior. It is a UX rewrite over a data-model upgrade, staged for safe rollout.

## Core product principle

**Outline, Synopsis, and Story Bible are story-assessment surfaces.** They pull answers from the writer in plain language, infer professional structure behind the scenes, and render industry-presentable documents. The writer is never asked to understand the structural craft to use the tool; the tool teaches by example through the rendered output.

This PRD applies that principle to Outline. Synopsis already trends this direction (post May 16 refactor); Story Bible follows in a later slice.

## Scope decisions (locked)

- **Plain-language question is the only headline** on every edit card. Structural labels do not appear in the edit surface. They live inside the mapping table and surface only in the formatted document view, the craft-map view (deferred), or developer-facing code.
- **Format-aware:** `Feature` deck and `Series` deck, switched by the existing project-wide `ProjectFormatSelector`. Format authority stays at `projectState.meta.format`.
- **No drag/reorder.** Card order is fixed by the template — that's the teaching point.
- **No AI assist.** No Oliver buttons. No "draft for me." No chat. Pure UX + structure.
- **Episode-map repeater (series only):** seed Episode 101 / 102 / 103. Writer can add another episode and rename episode labels/titles. No season-management UI beyond that in this slice.
- **Clear outline** uses a confirmation dialog with two buttons:
  - **Feature:** "Clear everything" / "Clear acts, keep foundations" (foundations = the 7 spine answers).
  - **Series:** "Clear everything" / "Clear episodes, keep foundations" (foundations = the 7 spine answers **plus** the 4 series-engine answers and the 4 season-arc answers; episode-map and any future episode-level data clears).
- Cards are the source of truth. A separate "document view" renders them into the formatted outline template; not separately editable.

## Recommended approach

### Data model

**Strategy: single source of truth from day one.** `documents.outline` (already defined in `shared/documents.ts` with `OutlineSpineSchema` + `OutlineUnitSchema`, currently unused by UI) becomes the source of truth in **the same release** that the new UI ships. After every write, the relevant fields are mirrored into legacy `projectState.outline.beats[].notes` inside the same mutator transaction so `OpenAIService` (which assembles Oliver's outline context from legacy beats) continues working untouched.

Every shipped release keeps `documents.outline` and the legacy mirror consistent. There is no shipped state where one surface writes to the new schema while another writes to the legacy schema. Mirroring is a derivation, not a parallel store.

Schema version bumps from 3 to 4. First mount on schemaVersion-3 data runs a one-time migration that sets a `migratedFromLegacyBeats: true` flag on `documents.outline.viewPreferences`. This requires extending the `OutlineViewPreferencesSchema` in `shared/documents.ts` to include an optional `migratedFromLegacyBeats?: boolean` field alongside `activeView`. Migration is idempotent — re-running on already-migrated data is a no-op.

### Card type

New file `client/src/lib/outlineDeck.ts`:

```ts
type OutlineDeckSection =
  | 'spine' | 'beginning' | 'middle' | 'end'
  | 'seriesEngine' | 'seasonArc' | 'episodeMap';

interface OutlineCardDef {
  id: string;                  // stable, e.g. 'spine.protagonist'
  deck: 'feature' | 'series';
  section: OutlineDeckSection;
  sectionLabel: string;        // 'Beginning' (shown as section header in edit view)
  structuralLabel: string;     // INTERNAL ONLY — used by document view + tests, never rendered in OutlineCard
  question: string;            // PRIMARY headline, plain-language
  helper: string;              // one-line coaching
  placeholder?: string;
  mappingPath: string;         // dot-path into OutlineDocumentContent
}
```

`OutlineCard` renders `sectionLabel` (as a group header above the card group), `question`, `helper`, and the answer textarea. It does **not** render `structuralLabel`.

Path resolver utilities (`resolveCardValue`, `setCardValue`) handle paths like `spine.protagonist` and `units[actOrSequence='Act One',title='Inciting incident'].whatHappens` (find-or-create).

### Feature deck — 19 cards

**Foundations / Spine (7)** — populates `documents.outline.content.spine`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 1 | "Who is this story about?" | "Name them, age them, give one sharp detail that defines them." | Protagonist | `spine.protagonist` |
| 2 | "What do they want more than anything?" | "One sentence. The visible, external thing they're chasing." | External goal | `spine.externalGoal` |
| 3 | "What do they actually need to learn?" | "Different from what they want. The internal lesson." | Internal need | `spine.internalNeed` |
| 4 | "Who or what is pushing back against them?" | "Person, system, force, or part of themselves. Be specific." | Central opposition | `spine.centralOpposition` |
| 5 | "What happens if they fail?" | "The cost, in human terms." | Core stakes | `spine.coreStakes` |
| 6 | "What is this story really about underneath?" | "One word or one sentence. The argument the story is making." | Theme | `spine.theme` |
| 7 | "How does it end? Tell me now, even rough." | "If you don't know yet, guess. We can change it." | Ending | `spine.ending` |

**Beginning (5)** — Act One units:

| # | Question | Helper | Internal label |
|---|---|---|---|
| 8 | "Show me the first moment of your story. What does the camera see?" | "Tone, world, mood. One image." | Opening image |
| 9 | "What does their life look like before everything changes?" | "Daily routine, who they're around, what's quietly broken." | Normal world |
| 10 | "What event arrives that they can't ignore?" | "The thing that kicks the story into motion." | Inciting incident |
| 11 | "Why don't they just say yes right away?" | "What they're afraid of, what they'd lose, who they'd disappoint." | Debate |
| 12 | "What finally forces them to commit?" | "The choice or event that locks them in. No going back." | Act One break |

**Middle (4)** — Act Two A / Midpoint / Act Two B:

| # | Question | Helper | Internal label |
|---|---|---|---|
| 13 | "Once they're in, what's the new world like and what's their first move?" | "Initial strategy. Often partly working, partly failing." | Act Two A |
| 14 | "Halfway through, something flips. What is it?" | "False win, false defeat, big reveal, or point of no return." | Midpoint |
| 15 | "Who or what is bleeding into the story now and changing them?" | "Subplot, relationship, ally, mentor — the parallel track carrying the theme." | Subplot |
| 16 | "What's the worst moment? When are they most defeated?" | "Loss, death, betrayal, exposed lie. Lowest point." | All-is-lost |

**End (3)** — Act Three:

| # | Question | Helper | Internal label |
|---|---|---|---|
| 17 | "What do they finally understand that they didn't before?" | "The realization. Often quiet. Earned." | New insight |
| 18 | "What do they do about it? Walk me through the climax." | "Their decisive choice and the final confrontation." | Climax |
| 19 | "Last image. What's the last thing we see?" | "Mirror the opening if you can. Prove the world has changed." | Final image |

**Total: 19 cards.**

### Series deck — 15 base cards + episode repeater

**Foundations / Spine (7)** — same as feature cards 1–7, populating `documents.outline.content.spine`.

**Series engine (4)** — populates `documents.outline.content.seriesEngine`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 8 | "What conflict does this show generate every week?" | "The thing the show is about, that keeps happening." | Repeatable conflict | `seriesEngine.repeatableConflict` |
| 9 | "What's the long question the whole show is asking?" | "Will they survive? Will she ever forgive him? What is this place?" | Serial question | `seriesEngine.serialQuestion` |
| 10 | "What does a typical episode look like, mechanically?" | "Case of the week? Heist? Therapy session? Pattern viewers can rely on." | Episode engine | `seriesEngine.episodeEngine` |
| 11 | "Why doesn't this premise burn out by episode 6?" | "The renewable fuel. What keeps it alive." | Premise longevity | `seriesEngine.premiseLongevity` |

**Season arc (4)** — populates `documents.outline.content.seasonArc`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 12 | "What question does season one specifically answer?" | "Different from the series question. Tighter. Bounded." | Season question | `seasonArc.seasonQuestion` |
| 13 | "Who or what is the season's main pressure system?" | "Antagonist, conspiracy, deadline, illness — the engine of season one." | Season antagonist | `seasonArc.seasonAntagonist` |
| 14 | "Where does the season pivot in the middle?" | "Mid-season reversal." | Season midpoint | `seasonArc.seasonMidpoint` |
| 15 | "How does season one end — and what's the hook into season two?" | "Resolution plus dangling thread." | Season ending/hook | `seasonArc.seasonEndingHook` |

**Base count: 15 cards.**

**Episode map (repeater, additive)** — seeded with three cards Ep 101, 102, 103. One card per episode. Each card asks:

> "Episode {N} — what's the A-story, B-story, and the final hook?"
> Helper: "Three short answers. Keep it tight."

Each episode card has an editable label (default `Episode 101`, etc.) and an `[+ Add another episode]` button at the end of the section that appends a new card with the next default label. No reorder, no delete in v1 (deferred). Each episode card stores into `documents.outline.content.units` as `actOrSequence='Episode'`, `number=N`, `title=<editable label>`, `whatHappens=<answer>`.

*Note: `seriesEngine` and `seasonArc` schema fields may not exist in `OutlineDocumentContent` in `shared/documents.ts` yet. V1's sub-phase 1A verifies and adds them as **typed objects with stable schema keys**, not free-form `Record<string, string>` maps. The stable keys (`repeatableConflict`, `serialQuestion`, `episodeEngine`, `premiseLongevity` on `seriesEngine`; `seasonQuestion`, `seasonAntagonist`, `seasonMidpoint`, `seasonEndingHook` on `seasonArc`) are the migration contract — UI copy can change later without breaking persisted data or downstream consumers. All fields are optional strings.*

### Formatted-outline view (inline toggle, mirrors SynopsisTab)

OutlineTab gets a view toggle component (`OutlineViewToggle`) modeled on `SynopsisViewToggle` at `client/src/components/writing/synopsis/SynopsisViewToggle.tsx`. State lives at `documents.outline.viewPreferences.activeView: 'edit' | 'document'`.

- **Edit view (default):** the deck. Cards show only the plain-language question, helper, and answer field. Section headers (Foundations, Beginning, etc.) appear above card groups.
- **Document view:** a read-only render of the template structure from the bundled `outline-best-practices-template.md`, filled from `documents.outline.content`. New component `OutlineDocumentView.tsx`. Structural labels (Inciting incident, Midpoint, etc.) **do** appear here as part of the industry-presentable rendering. Empty sections render the heading + a muted placeholder line (*"Add a card answer to fill this section."*).
- The 10-item **QA checklist** from the template ref renders at the bottom of document view, each item with a checkbox driven by simple heuristics in `client/src/lib/outlineQa.ts`. V2 hides checklist items that depend on scene-level data we don't capture yet.

### Component plan

**New files:**
- `client/src/lib/outlineDeck.ts` — `FEATURE_DECK`, `SERIES_DECK`, `OutlineCardDef`, path utilities, `migrateLegacyBeats` helper.
- `client/src/lib/outlineQa.ts` — QA-checklist heuristics returning `DocumentWarning[]`.
- `client/src/components/writing/outline/OutlineCard.tsx` — new card. Renders question, helper, answer. **Does not render `structuralLabel`.** No drag handle.
- `client/src/components/writing/outline/OutlineEditView.tsx` — deck render, grouped by `sectionLabel`. Episode repeater controls live in the `episodeMap` section footer.
- `client/src/components/writing/outline/OutlineDocumentView.tsx` — formatted-template render (the only surface where structural labels appear).
- `client/src/components/writing/outline/OutlineViewToggle.tsx` — copy of SynopsisViewToggle pattern.
- `client/src/components/writing/outline/ClearOutlineDialog.tsx` — confirm dialog with two destructive buttons. Copy adapts to format: feature shows "Clear acts, keep foundations"; series shows "Clear episodes, keep foundations".

**Edited files:**
- `client/src/components/writing/OutlineTab.tsx` — rewrite as shell: ProjectFormatSelector, OutlineViewToggle, dispatch to edit/document view.
- `client/src/lib/useProjectState.ts` — add `setOutlineDocument(patch)`, `setOutlineViewPreferences(patch)`, `addEpisodeCard()`, `renameEpisodeLabel(unitId, label)`. Update `clearOutline` to accept `{ keep: 'all' | 'foundations' }`. **Every mutator that touches outline content also writes the legacy mirror in the same call** — see "Source-of-truth discipline" below.
- `client/src/lib/documentMigration.ts` — add `mirrorOutlineToLegacy(content, legacyBeats)` (inverse of the existing `outlineLegacyToContent`). Extend `outlineLegacyToContent` to populate spine fields where reasonable matches exist.
- `client/src/lib/projectState.ts` — bump `CURRENT_SCHEMA_VERSION` to 4. Add migration from 3 → 4 that runs `migrateLegacyBeats` once and sets `documents.outline.viewPreferences.migratedFromLegacyBeats`.
- `client/src/App.tsx` — pass new props to OutlineTab (around lines 243–251 per existing pattern).
- `shared/documents.ts` — verify `OutlineSpineSchema` (147–155) and `OutlineUnitSchema` (157–181) sufficient. Add `seriesEngine` and `seasonArc` record fields if missing.
- `tests/components/OutlineTab.test.tsx` — see test plan.

**Leave alone for now:** `client/src/components/shared/BeatCard.tsx` and `server/ai/openaiService.ts` outline reads. Both keep working via the legacy mirror until V3 (deferred).

### Source-of-truth discipline (non-negotiable)

To avoid any shipped mixed-source-of-truth state:

1. The **only** writer of `documents.outline.content` is `useProjectState.setOutlineDocument` (and its derivatives for episodes / view prefs / clear). No component patches the schema directly.
2. `setOutlineDocument` is implemented as: apply patch → compute new `documents.outline` → derive legacy beats via `mirrorOutlineToLegacy(newContent, currentLegacyBeats)` → commit both in one `setProjectState` call.
3. Reads of outline content from the UI go through `documents.outline.content`. Reads from Oliver (server) continue going through legacy beats — that's fine because the mirror is fresh after every write.
4. The migration runner (one-time, on schemaVersion 3 → 4) is the only place legacy beats are *promoted* into `documents.outline`. After migration, the canonical direction is `documents.outline → legacy`.

If a release cannot maintain this invariant, it does not ship.

### Legacy beat → card mapping (for migration)

| Legacy beat ID | New card |
|---|---|
| `opening-image` | feature card #8 |
| `theme-stated` | feature card #6 (`spine.theme`) |
| `set-up` | feature card #9 |
| `catalyst` | feature card #10 |
| `debate` | feature card #11 |
| `break-into-two` | feature card #12 |
| `b-story` | feature card #15 |
| `fun-and-games` | feature card #13 |
| `midpoint` | feature card #14 |
| `bad-guys-close` | feature card #13 (concatenate after escalation) |
| `all-is-lost` | feature card #16 |
| `dark-night` | feature card #17 |
| `break-into-three` | feature card #18 (prepend) |
| `finale` | feature card #18 (append) |
| `final-image` | feature card #19 |

Multi-source merges join with `\n\n---\n\n`. If a legacy beat had no notes, it contributes nothing.

### Format-switch behavior

When the writer switches `projectFormat` mid-project, all answers persist. Spine cards (1–7) appear in both decks so their answers carry over invisibly. Format-specific content (feature acts vs series engine / season arc / episode map) remains in `documents.outline.content` but only the active deck's cards render. If the writer has any non-spine answers in the current format, show a confirmation: *"Switching to {target} will hide your {current} outline answers. They'll be kept and restored if you switch back."* Otherwise switch silently.

### Test plan

**Changes to `tests/components/OutlineTab.test.tsx`:**
- Replace `renders all 15 Save the Cat beat names` with `renders feature deck cards by section`. Assert plain-language questions are visible as the card's heading. Assert structural labels ("Inciting incident", "Midpoint", "All Is Lost", etc.) **do not appear anywhere in the edit-view DOM**.
- Replace `calls onUpdateBeat when notes textarea changes` with `calls setOutlineDocument with the card's mappingPath when card answer changes`.
- Replace `shows existing beat notes` with `renders existing answer from documents.outline.spine.protagonist`.
- Update `clears the whole outline in one click` to drive the new confirm dialog; cover both clear paths (feature and series variants).
- Update `disables clear outline when the outline is empty` to use the new emptiness check on `documents.outline.content`.
- Keep format-selector tests as-is.
- Remove drag/reorder tests.

**New test files:**
- `tests/lib/outlineDeck.test.ts` — feature deck has 19 cards covering all template spine + act fields; series deck has 15 base cards covering spine + series engine + season arc; no card has its structural name as `question`; deck data is internally consistent (every `mappingPath` resolves into the `OutlineDocumentContent` schema).
- `tests/lib/outlineMigration.test.ts` — legacy 15 beats with notes migrate to the right card answers; empty beats produce no spurious answers; multi-beat-to-one-card concatenation works; migration is idempotent; `migratedFromLegacyBeats` flag set correctly.
- `tests/lib/outlineMirror.test.ts` — `mirrorOutlineToLegacy` produces legacy beat notes consistent with the reverse migration; round-trip stable for all 15 legacy beat IDs Oliver reads.
- `tests/components/OutlineDocumentView.test.tsx` — filled `OutlineDocumentContent` renders all template headings; empty sections render placeholder copy; QA checklist renders with correct heuristic outputs. Structural labels are present here (verifies they only surface in document view).
- `tests/lib/outlineQa.test.ts` — heuristics flip correctly when relevant fields populate; v1-hidden items stay hidden.
- `tests/components/OutlineTab.viewToggle.test.tsx` — toggling to "document" renders OutlineDocumentView; toggling back returns to deck.
- `tests/components/OutlineTab.formatSwitch.test.tsx` — feature answers persist after switching to series and back; confirmation appears when non-spine answers exist.
- `tests/components/OutlineTab.episodeRepeater.test.tsx` — default seed shows 3 episode cards; add button appends new card with next default label; rename label persists.

### Phased rollout

**Locked rollout rule:** The first user-facing ship of the Outline redesign must include **both Feature and Series edit decks**. Format-aware decks are a V1 decision; we do not ship a state where one format uses the new deck and the other still shows the legacy Save-the-Cat beat-title surface. Internal development can be staged in sub-phases on the branch, but no sub-phase merges to main as a user-visible release until both decks are complete and the legacy `BeatCard` edit surface is gone for both formats.

Each shipped release keeps a single source of truth — `documents.outline` authoritative, legacy beats derived in the same mutator transaction.

#### V1 — Outline Story-Coach Redesign (single shipped release)

Internal development sub-phases on the V1 branch (order is engineering preference, all three land together before V1 ships):

**Sub-phase 1A — Schema + mutators + mirror discipline.**
- `client/src/lib/useProjectState.ts` (add `setOutlineDocument`, `setOutlineViewPreferences`, `addEpisodeCard`, `renameEpisodeLabel`, updated `clearOutline({ keep })`; every mutator writes the legacy mirror in the same transaction).
- `client/src/lib/documentMigration.ts` (`mirrorOutlineToLegacy`, refined `outlineLegacyToContent`).
- `client/src/lib/projectState.ts` (`CURRENT_SCHEMA_VERSION` → 4 + idempotent migration runner).
- `shared/documents.ts` (verify `OutlineSpineSchema`, `OutlineUnitSchema`; add `seriesEngine` and `seasonArc` record fields if missing).
- `tests/lib/outlineMigration.test.ts` (new), `tests/lib/outlineMirror.test.ts` (new).

**Sub-phase 1B — Feature deck edit view.**
- `client/src/lib/outlineDeck.ts` (new, includes `FEATURE_DECK` + path utilities + `migrateLegacyBeats` helper).
- `client/src/components/writing/outline/OutlineCard.tsx` (new).
- `client/src/components/writing/outline/OutlineEditView.tsx` (new).
- `client/src/components/writing/outline/ClearOutlineDialog.tsx` (new; feature copy + series copy both included, dialog dispatches off `projectFormat`).
- `client/src/components/writing/OutlineTab.tsx` (rewrite as shell; reads `documents.outline.content`).
- `client/src/App.tsx` (props).
- `tests/components/OutlineTab.test.tsx` (updated), `tests/lib/outlineDeck.test.ts` (new — covers feature deck content + structural-labels-not-in-edit-DOM invariant).

**Sub-phase 1C — Series deck + episode repeater + format-switch confirm.**
- `client/src/lib/outlineDeck.ts` (extend with `SERIES_DECK` + episode-map handling).
- `client/src/components/writing/OutlineTab.tsx` (format-aware deck selection, format-switch confirmation when non-spine answers exist).
- Episode add/rename UI in `OutlineEditView.tsx`.
- `tests/lib/outlineDeck.test.ts` (extend for series deck), `tests/components/OutlineTab.formatSwitch.test.tsx` (new), `tests/components/OutlineTab.episodeRepeater.test.tsx` (new).

**V1 ship gate (all must be true before merging to main):**
- Feature projects render the new card deck. Legacy beat titles ("Theme Stated", "Catalyst", "Debate", etc.) do not appear anywhere in the edit-view DOM for feature projects.
- Series projects render the new card deck (15 base + episode cards). Legacy beat titles do not appear anywhere in the edit-view DOM for series projects.
- `documents.outline` is the source of truth; legacy beats mirror correctly after every write; Oliver's outline context in Writer's Room remains accurate.
- Migration from schemaVersion 3 → 4 runs once, idempotently, on real existing project data.
- `npm run test:run`, `npm run check`, `npm run build` all pass.

#### V2 — Document view + QA checklist (separate ship after V1)

Pure render layer on top of V1's source of truth. No new writes, no schema changes.

Files: `client/src/components/writing/outline/OutlineDocumentView.tsx` (new), `client/src/components/writing/outline/OutlineViewToggle.tsx` (new), `client/src/lib/outlineQa.ts` (new), OutlineTab toggle integration, `tests/components/OutlineDocumentView.test.tsx` (new), `tests/lib/outlineQa.test.ts` (new), `tests/components/OutlineTab.viewToggle.test.tsx` (new).

#### V3 — Deferred / out of this slice

Retire `BeatCard.tsx`, migrate Oliver's outline reads in `server/ai/openaiService.ts` directly to `documents.outline`, remove the legacy mirror.

### Risks and open questions

1. **`seriesEngine` / `seasonArc` schema fields** may not exist in `shared/documents.ts` yet. V1's sub-phase 1A verifies and extends the schema if needed. If extension would touch other consumers, that's an upstream task that lands inside sub-phase 1A's schema work, not after.
2. **Confirmation copy** for the clear dialog and format-switch confirm: final wording lands during implementation review with the writing-first voice. Two-button labels confirmed: feature uses "Clear acts, keep foundations"; series uses "Clear episodes, keep foundations".
3. **QA heuristic precision.** Some checklist items will fire too eagerly; tune thresholds during V2 review.
4. **No mid-flight series fallback.** Per the locked rollout rule, V1 does not ship until both Feature and Series decks are complete on the branch. There is no interim "feature-only" release; series users continue to see today's legacy OutlineTab until V1 ships fully.

### Critical file paths

**V1 — all sub-phases land together before shipping**
- `client/src/lib/outlineDeck.ts` (new; `FEATURE_DECK` + `SERIES_DECK` + path utilities + `migrateLegacyBeats`)
- `client/src/components/writing/outline/OutlineCard.tsx` (new)
- `client/src/components/writing/outline/OutlineEditView.tsx` (new; supports episode repeater)
- `client/src/components/writing/outline/ClearOutlineDialog.tsx` (new; feature + series copy)
- `client/src/components/writing/OutlineTab.tsx` (rewrite, currently lines 1–146; format-aware deck selection + format-switch confirm)
- `client/src/lib/useProjectState.ts` (add mutators near lines 154–185, 300–305; episode add/rename)
- `client/src/lib/documentMigration.ts` (lines 32–51, 149–194)
- `client/src/lib/projectState.ts` (`CURRENT_SCHEMA_VERSION` + migration logic around 154–226)
- `client/src/App.tsx` (lines 243–251)
- `shared/documents.ts` (`OutlineSpineSchema` 147–155, `OutlineUnitSchema` 157–181; add `seriesEngine`, `seasonArc` if missing)
- `tests/components/OutlineTab.test.tsx`
- `tests/lib/outlineDeck.test.ts` (new)
- `tests/lib/outlineMigration.test.ts` (new)
- `tests/lib/outlineMirror.test.ts` (new)
- `tests/components/OutlineTab.formatSwitch.test.tsx` (new)
- `tests/components/OutlineTab.episodeRepeater.test.tsx` (new)

**V2**
- `client/src/components/writing/outline/OutlineDocumentView.tsx` (new)
- `client/src/components/writing/outline/OutlineViewToggle.tsx` (new)
- `client/src/lib/outlineQa.ts` (new)
- Reference: `/Users/ben/.claude/skills/ai-film-writing-templates/references/outline-best-practices-template.md`
- Pattern: `client/src/components/writing/synopsis/SynopsisDocumentView.tsx`, `SynopsisViewToggle.tsx`
- `tests/components/OutlineDocumentView.test.tsx` (new), `tests/lib/outlineQa.test.ts` (new), `tests/components/OutlineTab.viewToggle.test.tsx` (new)

**V3 (deferred, out of this slice)**
- `server/ai/openaiService.ts:407,466,523` — switch Oliver to `documents.outline`
- Delete `client/src/components/shared/BeatCard.tsx`

## Verification

After each shipped release (V1, V2):

1. `npm run test:run` — full test suite green.
2. `npm run check` — typecheck clean.
3. `npm run build` — production build succeeds.
4. Manual UI verification in a browser:
   - **V1:**
     - Feature project shows the new 19-card deck. Legacy beat titles ("Theme Stated", "Catalyst", "Debate", "All Is Lost", etc.) do not appear anywhere in the edit-view DOM.
     - Series project shows the new 15-base-card deck plus seeded Episode 101 / 102 / 103. Legacy beat titles do not appear in the edit-view DOM for series either.
     - Add-episode and rename-episode-label work and persist.
     - Old user notes still visible under the correct new cards after migration; migration runs once and is idempotent.
     - Clear dialog offers two options with format-correct copy.
     - Format switch with non-spine answers shows the confirmation; answers persist after switching back.
     - Oliver in Writer's Room still references outline beats correctly via the legacy mirror.
   - **V2:** Document view renders all answered sections + placeholders for empty ones; structural labels appear here as section subtitles per template ref; QA checklist reacts to filling fields.

End-to-end check: load a real existing project (May 16 era data), confirm migration runs cleanly on the new V1 deck, switch between feature and series, confirm answers persist, then in V2 toggle to document view and confirm the formatted output matches the template ref structure.
