# OutlineTab Story-Coach Redesign — PRD

**Date:** 2026-05-18
**Status:** Canonical for Outline redesign and the shared non-script surface standard
**Branch context:** `feature/screenplay-editor-core`
**Related docs:** `docs/product/README.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/structured-writing-surfaces-prd.md`, `docs/product/synopsis-story-coach-redesign-prd.md`, `docs/product/story-bible-story-coach-redesign-prd.md`

> Product alignment note: this PRD defines the current WriterOS surface pattern. Synopsis, Treatment, and Story Bible follow the same principle: plain-language Edit View, professional structure hidden behind the scenes, and studio-presentable Document View. "Story-coach" is the internal interaction pattern, not a renamed surface — the surface stays **Outline**.

## Context

The OutlineTab currently shows 15 Save-the-Cat beats by their craft names ("Theme Stated", "Catalyst", "Debate", "All Is Lost", "Midpoint", "Break Into Three"). A novice writer using WriterOS for the first time has no idea what those mean. The tab feels like a craft exam, not a writing tool.

Outline is the structural midpoint between Synopsis and Script. The Feature Outline answers **"what is the script?"**. The Series Outline answers **"what is the show, what is the pilot, and what is the season?"**. The Edit View asks plain-language questions; the Document View renders professional, industry-presentable structure derived from those answers.

This PRD keeps the existing multi-card workflow. It does not introduce chat, AI generation, or a new wizard. It does not change agent behavior. It is a UX rewrite over a data-model upgrade, staged for safe rollout.

## Core product principle

**Outline, Synopsis, and Story Bible are story-assessment surfaces.** They pull answers from the writer in plain language, infer professional structure behind the scenes, and render industry-presentable documents. The writer is never asked to understand the structural craft to use the tool; the tool teaches by example through the rendered output.

## V1 Design Decisions (locked)

These are the design decisions that anchor V1. Implementation must respect them.

| # | Decision | Why |
|---|---|---|
| 1 | **Project format authority lives at `ProjectState.meta.format`.** | One source of truth for Feature vs Series across every surface. Outline reads it; does not own it. |
| 2 | **Outline content stored under `ProjectState.documents.outline.content`.** | Canonical, typed, schema-versioned. The Edit View renders from it; the Document View renders from it. |
| 3 | **Static deck config stores card metadata; project state stores writer responses only.** | Card questions, helpers, labels, and mapping paths live in `client/src/lib/outlineDeck.ts`. Writer answers live in `documents.outline.content`. Never mix the two. |
| 4 | **No per-format storage namespaces.** Do **not** introduce `projectState.outline.feature.*` or `projectState.outline.series.*`. | Format-specific fields live as siblings inside `documents.outline.content` (e.g. `seriesEngine`, `seasonArc`, `episodes[]`). Format authority gates which fields the Edit View shows. |
| 5 | **Series episodes are typed structured rows, not generic units.** | A new `episodes: OutlineEpisode[]` array on `OutlineDocumentContent`. Each row has typed fields (label, title, hookLogline, aStory, bcStory, changeByEnd, endingHook). Episodes do **not** live in `units[]` with `actOrSequence='Episode'`. |
| 6 | **Legacy `projectState.outline.beats` is a compatibility mirror only.** | Until Oliver/server context migrates to `documents.outline`, every Outline write mirrors into legacy beats inside the same mutator transaction. The canonical direction is `documents.outline → legacy`, never the reverse after migration. |
| 7 | **Plain-language question is the only headline on every edit card.** Structural craft labels never render in the edit DOM. | They surface only in Document View, in tests, or in developer-facing code. |
| 8 | **Feature deck is ~15 plain-language cards.** Series deck is meaningfully different — show DNA, world pressure, pilot, season spine, episode engine, episode map. | Feature answers "what is the script?"; Series answers "what is the show, what is the pilot, and what is the season?". |
| 9 | **Episode map seeds Episode 101 / 102 / 103, add-only in V1.** No reorder, no delete in V1. | Smallest UI that proves the typed-episode model. Reorder/delete is V2+. |
| 10 | **No drag/reorder. No AI assist.** | Card order is fixed by the template — that's the teaching point. |
| 11 | **`seasonClimax` is distinct from `seasonEndingHook`.** | Climax is the dramatic peak; ending/hook is the resolution-plus-dangling-thread. Two separate fields. |
| 12 | **Surface names are Synopsis, Outline, Story Bible, Script.** | "Story-coach" is an internal pattern. Never rendered as a tab, title, or user-visible string. |

## Scope decisions (locked)

- **Plain-language question is the only headline** on every edit card (Decision 7).
- **Format-aware:** Feature deck and Series deck, switched by the existing project-wide `ProjectFormatSelector`. Format authority stays at `ProjectState.meta.format` (Decision 1).
- **No drag/reorder.**
- **No AI assist.**
- **Episode map (series only):** seeded Episode 101 / 102 / 103, add-only V1, typed `episodes[]` rows (Decisions 5, 9).
- **Clear outline** uses a confirmation dialog with two buttons:
  - **Feature:** "Clear everything" / "Clear acts, keep foundations" (foundations = the 7 spine answers).
  - **Series:** "Clear everything" / "Clear episodes, keep foundations" (foundations = the 7 spine answers **plus** show-DNA + world-pressure + pilot + season-spine + episode-engine answers; episodes clears).
- Cards are the source of truth in the Edit View. The Document View renders them into the formatted outline template; not separately editable.

## Recommended approach

### Data model

**Strategy: single source of truth from day one.** `documents.outline` becomes the source of truth in the same release that the new UI ships. After every write, the relevant fields are mirrored into legacy `projectState.outline.beats[].notes` inside the same mutator transaction so `OpenAIService` (which assembles Oliver's outline context from legacy beats) continues working untouched.

Every shipped release keeps `documents.outline` and the legacy mirror consistent. Mirroring is a derivation, not a parallel store.

Schema version bumps from 3 to 4. First mount on schemaVersion-3 data runs a one-time migration that sets `migratedFromLegacyBeats: true` on `documents.outline.viewPreferences`. This requires extending `OutlineViewPreferencesSchema` in `shared/documents.ts` with an optional `migratedFromLegacyBeats?: boolean` field alongside `activeView`. Migration is idempotent.

**`OutlineDocumentContent` schema additions** (all new fields land in `shared/documents.ts`).

The new fields are typed as **required** strings/objects/arrays — same shape as the existing `OutlineSpineSchema`. Migration safety does **not** come from making them `z.optional()`. It comes from the schemaVersion 3 → 4 migration normalizing every loaded project to include defaulted values (empty strings, empty `episodes: []`, empty `seriesEngine`/`seasonArc` objects) **before** the Zod parse runs. Once normalized, the parse succeeds against the required schema. This matches the existing pattern for `OutlineSpineSchema` — those fields are required strings, defaulted by `createEmptyOutlineContent()` and the migration runner.

If a Zod parse ever encounters a schemaVersion-3 payload that bypassed migration, that is a bug in the migration runner, not a schema problem.

```ts
// New typed siblings inside OutlineDocumentContent (NOT new top-level ProjectState keys).
// Spine, units[], mode, structureModel, aiProductionColumns stay as-is.

export const OutlineSeriesEngineSchema = z.object({
  showPitch: z.string(),            // one-line pitch for the whole show
  repeatableConflict: z.string(),   // the conflict the show keeps generating
  premiseLongevity: z.string(),     // why the premise doesn't burn out
  serialQuestion: z.string(),       // the long question viewers track
  episodeEngine: z.string(),        // mechanical shape of a typical episode
  worldPressure: z.string(),        // the world + what's wrong with it + rules
  pilotPromise: z.string(),         // what the pilot promises the show is about
})

export const OutlineSeasonArcSchema = z.object({
  seasonQuestion: z.string(),       // the bounded question season one answers
  seasonAntagonist: z.string(),     // pressure system for the season
  seasonMidpoint: z.string(),       // mid-season pivot
  seasonClimax: z.string(),         // climactic confrontation (distinct from ending/hook)
  seasonEndingHook: z.string(),     // resolution plus dangling thread into season two
})

export const OutlineEpisodeSchema = z.object({
  id: z.string(),
  number: z.number(),               // e.g. 101, 102, 103 — display order driver
  label: z.string(),                // editable display label, default 'Episode 101'
  title: z.string(),                // optional working title (stored as '' when blank)
  hookLogline: z.string(),          // one-line hook/logline for the episode
  aStory: z.string(),               // primary plot of the episode
  bcStory: z.string(),              // B and/or C story, combined free-text in V1
  changeByEnd: z.string(),          // what is materially different by the end
  endingHook: z.string(),           // hook into the next episode
})

// Extended container — these three fields sit alongside spine/units, NOT under a feature/series namespace.
export const OutlineDocumentContentSchema = z.object({
  mode: OutlineModeSchema,
  structureModel: OutlineStructureModelSchema,
  spine: OutlineSpineSchema,
  units: z.array(OutlineUnitSchema),
  seriesEngine: OutlineSeriesEngineSchema,
  seasonArc: OutlineSeasonArcSchema,
  episodes: z.array(OutlineEpisodeSchema),
  aiProductionColumns: z.object({ enabled: z.boolean() }),
})
```

The keys above (`showPitch`, `repeatableConflict`, `premiseLongevity`, `serialQuestion`, `episodeEngine`, `worldPressure`, `pilotPromise`, `seasonQuestion`, `seasonAntagonist`, `seasonMidpoint`, `seasonClimax`, `seasonEndingHook`, `OutlineEpisode.{label,title,hookLogline,aStory,bcStory,changeByEnd,endingHook}`) are the stable contract. Edit View copy can change without breaking persisted data or downstream consumers.

**Defaulting responsibilities:**

- `createEmptyOutlineContent()` returns a fully-formed `OutlineDocumentContent` with `seriesEngine` and `seasonArc` populated with empty strings on every key, and `episodes: []`. New projects start at schemaVersion 4 and never see the legacy shape.
- The schemaVersion 3 → 4 migration runner is the single normalization point for existing projects. Before the new schema is parsed, it: (a) reads the legacy `documents.outline.content` (which may lack `seriesEngine`, `seasonArc`, `episodes`), (b) normalizes it with defaults from `createEmptyOutlineContent()`, (c) writes the normalized content back into `documents.outline.content` and sets `viewPreferences.migratedFromLegacyBeats = true`. The result is always a schema-valid `OutlineDocumentContent`.
- **Merge direction is required:** defaults are spread first, existing writer content is spread on top. At minimum: `{ ...createEmptyOutlineContent(), ...existingContent }`. For nested objects, preserve writer data the same way: `spine: { ...defaults.spine, ...existingContent.spine }`, `seriesEngine: { ...defaults.seriesEngine, ...existingContent.seriesEngine }`, `seasonArc: { ...defaults.seasonArc, ...existingContent.seasonArc }`, and `aiProductionColumns: { ...defaults.aiProductionColumns, ...existingContent.aiProductionColumns }`. Arrays use existing values when present (`episodes: existingContent.episodes ?? defaults.episodes`, `units: existingContent.units ?? defaults.units`). Never spread defaults over existing content; that would silently erase already-entered spine answers with empty strings.
- The Series deck seeds Episode 101 / 102 / 103 lazily on first Series Edit View mount when `episodes.length === 0`, via an explicit mutator (no implicit writes from render). Seeding is a UX behavior on the empty array, not a schema default.

### Card type

New file `client/src/lib/outlineDeck.ts`:

```ts
type OutlineDeckSection =
  | 'spine'
  | 'beginning' | 'middle' | 'end'              // feature
  | 'showDNA' | 'world' | 'pilot'               // series
  | 'seasonSpine' | 'episodeEngine' | 'episodeMap';  // series

interface OutlineCardDef {
  id: string;                  // stable, e.g. 'spine.protagonist', 'showDNA.showPitch'
  deck: 'feature' | 'series';
  section: OutlineDeckSection;
  sectionLabel: string;        // group header in edit view
  structuralLabel: string;     // INTERNAL ONLY — used by document view + tests, never rendered in OutlineCard
  question: string;            // PRIMARY headline, plain-language
  helper: string;              // one-line coaching
  placeholder?: string;
  mappingPath: string | OutlineCardBinding[];  // single textarea or composite labeled fields
}

interface OutlineCardBinding {
  label: string;
  path: string;                // dot-path into OutlineDocumentContent
}
```

`OutlineCard` renders `sectionLabel` (as a group header), `question`, `helper`, and the answer textarea. It does **not** render `structuralLabel`.

Path resolver utilities (`resolveCardValue`, `setCardValue`) handle dot paths like `spine.protagonist`, `seriesEngine.repeatableConflict`, `seasonArc.seasonClimax`, stable unit paths like `units[id=feature.midpoint].whatHappens`, and array paths like `episodes.0.aStory`. Episodes are addressed by index in the resolver; the Edit View renders the `episodes[]` array directly, not via card defs (one EpisodeCard per row, see below). Composite cards render one labeled textarea per `OutlineCardBinding`.

### Feature deck — 15 cards

Answers "what is the script?". Plain-language phrasing, professional completeness preserved.

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

**Beginning (3)** — Act One units in `documents.outline.content.units`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 8 | "Show me the world they live in before everything changes." | "Opening image plus the daily life. What's quietly broken." | Opening / Normal world | `units[id=feature.openingNormalWorld].whatHappens` |
| 9 | "What event arrives that they can't ignore?" | "The thing that kicks the story into motion." | Inciting incident | `units[id=feature.incitingIncident].whatHappens` |
| 10 | "What finally forces them to commit — and what were they afraid of?" | "Why they resisted plus the choice or event that locks them in." | Debate / Act One break | `units[id=feature.actOneBreak].whatHappens` |

**Middle (3)** — Act Two A / Midpoint / Act Two B:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 11 | "Once they're in, what's their first move and what does it cost them?" | "New world, initial strategy, partial wins, costs accumulating." | Act Two A | `units[id=feature.actTwoA].whatHappens` |
| 12 | "Halfway through, something flips. What is it?" | "False win, false defeat, big reveal, or point of no return." | Midpoint | `units[id=feature.midpoint].whatHappens` |
| 13 | "What's the worst moment — and who or what made it possible?" | "Lowest point, including the subplot/relationship that carried them here." | All-is-lost (with subplot) | `units[id=feature.allIsLostWithSubplot].whatHappens` |

**End (2)** — Act Three:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 14 | "What do they finally understand, and what do they do about it?" | "The realization, the decisive choice, and the final confrontation." | New insight + Climax | `units[id=feature.climax].whatHappens` |
| 15 | "Last image. What's the last thing we see?" | "Mirror the opening if you can. Prove the world has changed." | Final image | `units[id=feature.finalImage].whatHappens` |

**Total: 15 cards.** Subplot folds into the all-is-lost card; opening image folds into normal-world; debate folds into act-one break; new insight folds into climax. Feature act-card mappings use stable `OutlineUnit.id` values; if a mapped unit does not exist, the path utility creates it with the matching title, act/sequence, and display order. Professional completeness is preserved by the V2 Document View, which expands answers into the full template structure from `outline-best-practices-template.md`.

### Series deck — 18 base cards + structured episode map

Answers "what is the show, what is the pilot, and what is the season?". Meaningfully different from Feature.

**Foundations / Spine (7)** — same as feature cards 1–7, populating `documents.outline.content.spine`.

**Show DNA / engine (3)** — populates `documents.outline.content.seriesEngine`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 8 | "Say the show in one clean line." | "The pitch a stranger could repeat back after one read." | Show pitch | `seriesEngine.showPitch` |
| 9 | "What conflict does this show keep generating every week?" | "The renewable engine that produces stories." | Repeatable conflict | `seriesEngine.repeatableConflict` |
| 10 | "Why doesn't this premise burn out by episode 6?" | "The fuel that keeps the show alive past the pilot energy." | Premise longevity | `seriesEngine.premiseLongevity` |

**World pressure (1)** — populates `seriesEngine.worldPressure`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 11 | "What is the world of this show, what's wrong with it, and what rules does it enforce?" | "The setting, the pressure, and the non-negotiables that drive scenes." | World pressure | `seriesEngine.worldPressure` |

**Pilot (1)** — populates `seriesEngine.pilotPromise`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 12 | "Walk me through what episode 1 promises — what pulls a stranger in, and what makes them stay for episode 2?" | "Hook plus promise. The contract the pilot makes with the audience." | Pilot promise | `seriesEngine.pilotPromise` |

**Season spine (5)** — populates `documents.outline.content.seasonArc`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 13 | "What question does season one specifically answer?" | "Different from the long series question. Tighter. Bounded." | Season question | `seasonArc.seasonQuestion` |
| 14 | "Who or what is the season's main pressure system?" | "Antagonist, conspiracy, deadline, illness — the engine of season one." | Season antagonist | `seasonArc.seasonAntagonist` |
| 15 | "Where does the season pivot in the middle?" | "Mid-season reversal." | Season midpoint | `seasonArc.seasonMidpoint` |
| 16 | "What's the climactic confrontation at the end of the season?" | "The dramatic peak. Distinct from the resolution." | Season climax | `seasonArc.seasonClimax` |
| 17 | "How does the season actually end — and what's the hook into season two?" | "Resolution plus dangling thread." | Season ending / hook | `seasonArc.seasonEndingHook` |

**Episode engine (1)** — populates `seriesEngine.episodeEngine` and `seriesEngine.serialQuestion`:

| # | Question | Helper | Internal label | Maps to |
|---|---|---|---|---|
| 18 | "What does a typical episode look like mechanically, and what's the long question viewers are tracking?" | "Episode shape plus the serial question that holds the season together." | Episode engine + serial question | `[{ label: "Typical episode shape", path: "seriesEngine.episodeEngine" }, { label: "Long question", path: "seriesEngine.serialQuestion" }]` |

Card 18 is the one composite in the deck (two textareas inside one card, each labeled, each mapping to a stable key).

**Base count: 18 cards.**

**Episode map — typed `episodes[]`, not generic units**

Rendered as a list of `EpisodeCard` components, one per `OutlineEpisode` in `documents.outline.content.episodes`. The list is seeded with Episode 101 / 102 / 103 the first time a Series project mounts the Edit View with `episodes.length === 0`.

Each `EpisodeCard` renders:

- **Editable label** (default `Episode 101`, `Episode 102`, etc.) → `episodes[i].label`
- **Title** (optional) → `episodes[i].title`
- **Hook / logline** — "What's the hook for this episode?" → `episodes[i].hookLogline`
- **A-story** — "What's the main plot this episode?" → `episodes[i].aStory`
- **B/C-story** — "What's running underneath? B and/or C story." → `episodes[i].bcStory`
- **What changes by the end** — "Material change. What's different in the world or the cast?" → `episodes[i].changeByEnd`
- **Ending hook** — "What pulls a viewer into the next episode?" → `episodes[i].endingHook`

`[+ Add episode]` button at the end of the section appends a new `OutlineEpisode` with `number = max(existing.number) + 1` and `label = 'Episode {number}'`. No reorder, no delete in V1.

### Formatted-outline view (V2; inline toggle, mirrors SynopsisTab)

Deferred to V2. Do not implement this section in V1.

OutlineTab gets a view toggle component (`OutlineViewToggle`) modeled on `SynopsisViewToggle`. State lives at `documents.outline.viewPreferences.activeView: 'edit' | 'document'`.

- **Edit view (default):** the deck. Cards show only the plain-language question, helper, and answer field. Section headers (Foundations, Show DNA, Season spine, etc.) appear above card groups. EpisodeCards render in the `episodeMap` section.
- **Document view:** a read-only render of the template structure from the bundled `outline-best-practices-template.md`, filled from `documents.outline.content`. Component `OutlineDocumentView.tsx`. Structural labels (Inciting incident, Midpoint, Episode logline, etc.) **do** appear here as part of the industry-presentable rendering. Empty sections render the heading + a muted placeholder line (*"Add a card answer to fill this section."*).
- The 10-item **QA checklist** from the template ref renders at the bottom of document view, each item with a checkbox driven by simple heuristics in `client/src/lib/outlineQa.ts`. V2 hides checklist items that depend on scene-level data the V1 deck does not capture.

### Component plan

**V1 new files:**
- `client/src/lib/outlineDeck.ts` — `FEATURE_DECK` (15 cards), `SERIES_DECK` (18 base cards), `OutlineCardDef`, path utilities, `seedEpisodes101To103`, `migrateLegacyBeats` helper.
- `client/src/components/writing/outline/OutlineCard.tsx` — new card. Renders question, helper, answer. **Does not render `structuralLabel`.** No drag handle.
- `client/src/components/writing/outline/EpisodeCard.tsx` — typed episode row. One per `OutlineEpisode`. Renders label, title, hookLogline, aStory, bcStory, changeByEnd, endingHook.
- `client/src/components/writing/outline/OutlineEditView.tsx` — deck render, grouped by `sectionLabel`. Episode-map section renders an `EpisodeCard` per row plus the `[+ Add episode]` control.
- `client/src/components/writing/outline/ClearOutlineDialog.tsx` — confirm dialog with two destructive buttons. Copy adapts to format.

**V2 new files (do not build in V1):**
- `client/src/lib/outlineQa.ts` — QA-checklist heuristics returning `DocumentWarning[]`.
- `client/src/components/writing/outline/OutlineDocumentView.tsx` — formatted-template render (the only surface where structural labels appear). Renders Feature outline template or Series outline template based on `ProjectState.meta.format`.
- `client/src/components/writing/outline/OutlineViewToggle.tsx` — copy of SynopsisViewToggle pattern.

**Edited files:**
- `client/src/components/writing/OutlineTab.tsx` — V1 rewrite as shell: ProjectFormatSelector, format-aware deck selection, and dispatch to Edit View. V2 adds OutlineViewToggle and Document View dispatch.
- `client/src/lib/useProjectState.ts` — add `setOutlineDocument(patch)`, `setOutlineViewPreferences(patch)`, `addEpisode()`, `renameEpisode(episodeId, label)`, `setEpisodeField(episodeId, field, value)`. Update `clearOutline` to accept `{ keep: 'all' | 'foundations' }`. **Every mutator that touches outline content also writes the legacy mirror in the same call.**
- `client/src/lib/documentMigration.ts` — add `mirrorOutlineToLegacy(content, legacyBeats)`. Extend `outlineLegacyToContent` to populate spine fields where reasonable matches exist.
- `client/src/lib/projectState.ts` — bump `CURRENT_SCHEMA_VERSION` to 4. Add migration 3 → 4 that runs `migrateLegacyBeats` once and sets `documents.outline.viewPreferences.migratedFromLegacyBeats`.
- `client/src/App.tsx` — pass new props to OutlineTab.
- `shared/documents.ts` — extend `OutlineDocumentContentSchema` with `seriesEngine: OutlineSeriesEngineSchema`, `seasonArc: OutlineSeasonArcSchema`, `episodes: z.array(OutlineEpisodeSchema)`. Update `createEmptyOutlineContent` to seed empty strings for `seriesEngine` and `seasonArc`, and `episodes: []`. Extend `OutlineViewPreferencesSchema` with optional `migratedFromLegacyBeats?: boolean`.
- `tests/components/OutlineTab.test.tsx` — see test plan.

**Leave alone for now:** `client/src/components/shared/BeatCard.tsx` and `server/ai/openaiService.ts` outline reads. Both keep working via the legacy mirror until V3 (deferred).

### Source-of-truth discipline (non-negotiable)

To avoid any shipped mixed-source-of-truth state:

1. The **only** writer of `documents.outline.content` is `useProjectState.setOutlineDocument` (and its derivatives for episodes / view prefs / clear). No component patches the schema directly.
2. `setOutlineDocument` is implemented as: apply patch → compute new `documents.outline` → derive legacy beats via `mirrorOutlineToLegacy(newContent, currentLegacyBeats)` → commit both in one `setProjectState` call.
3. Reads of outline content from the UI go through `documents.outline.content`. Reads from Oliver (server) continue through legacy beats — that's fine because the mirror is fresh after every write.
4. The migration runner (one-time, on schemaVersion 3 → 4) is the only place legacy beats are *promoted* into `documents.outline`. After migration, the canonical direction is `documents.outline → legacy`.

If a release cannot maintain this invariant, it does not ship.

### Legacy beat → card mapping (for migration)

| Legacy beat ID | New card or field |
|---|---|
| `opening-image` | feature card #8 (`units` → Opening / Normal world) |
| `theme-stated` | feature card #6 (`spine.theme`) |
| `set-up` | feature card #8 (concatenate after opening image) |
| `catalyst` | feature card #9 (`units` → Inciting incident) |
| `debate` | feature card #10 (`units` → Debate / Act One break, prepend) |
| `break-into-two` | feature card #10 (append) |
| `b-story` | feature card #13 (`units` → All-is-lost with subplot, prepend) |
| `fun-and-games` | feature card #11 (`units` → Act Two A) |
| `midpoint` | feature card #12 (`units` → Midpoint) |
| `bad-guys-close` | feature card #11 (concatenate after escalation) |
| `all-is-lost` | feature card #13 (append) |
| `dark-night` | feature card #14 (`units` → New insight + Climax, prepend) |
| `break-into-three` | feature card #14 (append) |
| `finale` | feature card #14 (append) |
| `final-image` | feature card #15 (`units` → Final image) |

Multi-source merges join with `\n\n---\n\n`. If a legacy beat has no notes, it contributes nothing. Series projects with legacy beats migrate identically into the spine + feature unit cards (episodes start empty, seeded 101/102/103 on first Series Edit View mount).

### Format-switch behavior

When the writer switches `ProjectState.meta.format` mid-project, all answers persist. Spine cards (1–7) appear in both decks so their answers carry over invisibly. Format-specific content (feature acts vs series engine / season arc / episodes) remains in `documents.outline.content` but only the active deck's cards render. If the writer has any non-spine answers in the current format, show a confirmation: *"Switching to {target} will hide your {current} outline answers. They'll be kept and restored if you switch back."* Otherwise switch silently.

### Test plan

**Changes to `tests/components/OutlineTab.test.tsx`:**
- Replace `renders all 15 Save the Cat beat names` with `renders feature deck cards by section`. Assert plain-language questions are visible as the card's heading. Assert structural labels ("Inciting incident", "Midpoint", "All Is Lost", etc.) **do not appear anywhere in the edit-view DOM**.
- Replace `calls onUpdateBeat when notes textarea changes` with `calls setOutlineDocument with the resolved single mapping path, or the specific composite binding path, when a card answer changes`.
- Replace `shows existing beat notes` with `renders existing answer from documents.outline.content.spine.protagonist`.
- Update `clears the whole outline in one click` to drive the new confirm dialog; cover both clear paths (feature and series variants).
- Update `disables clear outline when the outline is empty` to use the new emptiness check on `documents.outline.content`.
- Keep format-selector tests as-is.
- Remove drag/reorder tests.

**New test files:**
- `tests/lib/outlineDeck.test.ts` — feature deck has 15 cards covering all spine + act fields; series deck has 18 base cards covering spine + show DNA + world + pilot + season spine + episode engine; no card has its structural name as `question`; deck data is internally consistent (every single mapping path and every composite binding path resolves into the `OutlineDocumentContent` schema).
- `tests/lib/outlineMigration.test.ts` — legacy 15 beats with notes migrate to the right card answers; empty beats produce no spurious answers; multi-beat-to-one-card concatenation works; migration is idempotent; `migratedFromLegacyBeats` flag set correctly.
- `tests/lib/outlineMirror.test.ts` — `mirrorOutlineToLegacy` produces legacy beat notes consistent with the reverse migration; round-trip stable for all 15 legacy beat IDs Oliver reads.
- `tests/lib/outlineEpisodes.test.ts` — `seedEpisodes101To103` produces three typed `OutlineEpisode` rows with correct numbers and labels; `addEpisode` appends with `number = max + 1`; episode field mutators are immutable; episodes persist when format toggles to Feature and back to Series.
- `tests/components/OutlineTab.formatSwitch.test.tsx` — feature answers persist after switching to series and back; confirmation appears when non-spine answers exist; series episodes survive a feature round-trip.
- `tests/components/OutlineTab.episodeRepeater.test.tsx` — default seed shows 3 episode cards; add button appends new card with next default label; rename label persists; each typed field (hookLogline, aStory, bcStory, changeByEnd, endingHook) round-trips through state.

**V2 test files (do not build in V1):**
- `tests/components/OutlineDocumentView.test.tsx` — filled `OutlineDocumentContent` renders all template headings; empty sections render placeholder copy; QA checklist renders with correct heuristic outputs. Structural labels are present here (verifies they only surface in document view). Series document view renders `seasonClimax` and `seasonEndingHook` as separate sections.
- `tests/lib/outlineQa.test.ts` — heuristics flip correctly when relevant fields populate; v1-hidden items stay hidden.
- `tests/components/OutlineTab.viewToggle.test.tsx` — toggling to "document" renders OutlineDocumentView; toggling back returns to deck.

### Phased rollout

**Locked rollout rule:** The first user-facing ship of the Outline redesign must include **both Feature and Series edit decks plus the typed episode map**. We do not ship a state where one format uses the new deck and the other still shows the legacy Save-the-Cat beat-title surface, and we do not ship a state where series episodes live in `units[]` with `actOrSequence='Episode'`. Internal development can be staged on the branch, but no sub-phase merges to main as a user-visible release until V1 is complete.

#### V1 — Outline Story-Coach Redesign (single shipped release)

Internal development sub-phases on the V1 branch:

**Sub-phase 1A — Schema + mutators + mirror discipline.**
- `shared/documents.ts` — extend `OutlineDocumentContentSchema` with `seriesEngine`, `seasonArc`, `episodes[]`; extend `OutlineViewPreferencesSchema` with `migratedFromLegacyBeats`; update `createEmptyOutlineContent`.
- `client/src/lib/useProjectState.ts` — add `setOutlineDocument`, `setOutlineViewPreferences`, `addEpisode`, `renameEpisode`, `setEpisodeField`, updated `clearOutline({ keep })`; every mutator writes the legacy mirror in the same transaction.
- `client/src/lib/documentMigration.ts` — `mirrorOutlineToLegacy`, refined `outlineLegacyToContent`.
- `client/src/lib/projectState.ts` — `CURRENT_SCHEMA_VERSION` → 4 + idempotent migration runner.
- `tests/lib/outlineMigration.test.ts` (new), `tests/lib/outlineMirror.test.ts` (new), `tests/lib/outlineEpisodes.test.ts` (new — covers `seedEpisodes101To103`, add-episode, mutators).

**Sub-phase 1B — Feature deck edit view.**
- `client/src/lib/outlineDeck.ts` (new, includes `FEATURE_DECK` (15 cards) + path utilities + `migrateLegacyBeats` helper).
- `client/src/components/writing/outline/OutlineCard.tsx` (new).
- `client/src/components/writing/outline/OutlineEditView.tsx` (new).
- `client/src/components/writing/outline/ClearOutlineDialog.tsx` (new; feature copy + series copy both included, dialog dispatches off `ProjectState.meta.format`).
- `client/src/components/writing/OutlineTab.tsx` (rewrite as shell; reads `documents.outline.content`).
- `client/src/App.tsx` (props).
- `tests/components/OutlineTab.test.tsx` (updated), `tests/lib/outlineDeck.test.ts` (new — covers feature deck content + structural-labels-not-in-edit-DOM invariant).

**Sub-phase 1C — Series deck + typed episode repeater + format-switch confirm.**
- `client/src/lib/outlineDeck.ts` (extend with `SERIES_DECK` (18 base cards) + `seedEpisodes101To103`).
- `client/src/components/writing/outline/EpisodeCard.tsx` (new).
- `client/src/components/writing/outline/OutlineEditView.tsx` (extend with episode-map section).
- `client/src/components/writing/OutlineTab.tsx` (format-aware deck selection, format-switch confirmation when non-spine answers exist; series-first mount seeds episodes 101/102/103 via mutator).
- `tests/lib/outlineDeck.test.ts` (extend for series deck), `tests/components/OutlineTab.formatSwitch.test.tsx` (new), `tests/components/OutlineTab.episodeRepeater.test.tsx` (new).

**V1 ship gate (all must be true before merging to main):**
- Feature projects render the new 15-card deck. Legacy beat titles do not appear anywhere in the edit-view DOM for feature projects.
- Series projects render the new 18-base-card deck plus seeded Episode 101 / 102 / 103 in a typed `episodes[]` list. Legacy beat titles do not appear anywhere in the edit-view DOM for series projects.
- Episodes are stored as typed `OutlineEpisode` rows in `documents.outline.content.episodes`. No episode lives in `units[]` with `actOrSequence='Episode'`.
- `documents.outline` is the source of truth; legacy beats mirror correctly after every write; Oliver's outline context in Writer's Room remains accurate.
- Migration from schemaVersion 3 → 4 runs once, idempotently, on real existing project data.
- `npm run test:run`, `npm run check`, `npm run build` all pass.

#### V2 — Document view + QA checklist (separate ship after V1)

Pure render layer on top of V1's source of truth. No new writes, no schema changes.

Files: `client/src/components/writing/outline/OutlineDocumentView.tsx` (new), `client/src/components/writing/outline/OutlineViewToggle.tsx` (new), `client/src/lib/outlineQa.ts` (new), OutlineTab toggle integration, `tests/components/OutlineDocumentView.test.tsx` (new), `tests/lib/outlineQa.test.ts` (new), `tests/components/OutlineTab.viewToggle.test.tsx` (new).

#### V3 — Deferred / out of this slice

Retire `BeatCard.tsx`, migrate Oliver's outline reads in `server/ai/openaiService.ts` directly to `documents.outline` (including `seriesEngine`, `seasonArc`, `episodes[]`), remove the legacy mirror.

### Risks and open questions

1. **Episode reorder / delete** is deferred to V2+. V1 is add-only. If user testing reveals strong demand, V2 lifts the restriction. Episode `number` is the display-order driver; renumber-on-reorder logic is not yet specified.
2. **B-story vs C-story granularity.** V1 collapses B/C into a single `bcStory` text field. If writers consistently want them separated, V2 splits into `bStory` + `cStory` (additive, no migration loss).
3. **Confirmation copy** for the clear dialog and format-switch confirm: final wording lands during implementation review.
4. **QA heuristic precision.** Some checklist items will fire too eagerly; tune thresholds during V2 review.
5. **No mid-flight series fallback.** Per the locked rollout rule, V1 does not ship until both Feature and Series decks plus typed episodes are complete on the branch.

### Critical file paths

**V1 — all sub-phases land together before shipping**
- `shared/documents.ts` — extend `OutlineDocumentContentSchema` (currently around lines 183–190) with `seriesEngine`, `seasonArc`, `episodes[]`; add `OutlineSeriesEngineSchema`, `OutlineSeasonArcSchema`, `OutlineEpisodeSchema`; extend `OutlineViewPreferencesSchema`; update `createEmptyOutlineContent`.
- `client/src/lib/outlineDeck.ts` (new; `FEATURE_DECK` (15) + `SERIES_DECK` (18) + path utilities + `seedEpisodes101To103` + `migrateLegacyBeats`)
- `client/src/components/writing/outline/OutlineCard.tsx` (new)
- `client/src/components/writing/outline/EpisodeCard.tsx` (new)
- `client/src/components/writing/outline/OutlineEditView.tsx` (new; supports typed episode repeater)
- `client/src/components/writing/outline/ClearOutlineDialog.tsx` (new; feature + series copy)
- `client/src/components/writing/OutlineTab.tsx` (rewrite, currently lines 1–146; format-aware deck selection + format-switch confirm)
- `client/src/lib/useProjectState.ts` (add mutators near lines 154–185, 300–305; episode add/rename/field-set)
- `client/src/lib/documentMigration.ts` (lines 32–51, 149–194)
- `client/src/lib/projectState.ts` (`CURRENT_SCHEMA_VERSION` + migration logic around 154–226)
- `client/src/App.tsx` (lines 243–251)
- `tests/components/OutlineTab.test.tsx`
- `tests/lib/outlineDeck.test.ts` (new)
- `tests/lib/outlineMigration.test.ts` (new)
- `tests/lib/outlineMirror.test.ts` (new)
- `tests/lib/outlineEpisodes.test.ts` (new)
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
- `server/ai/openaiService.ts:407,466,523` — switch Oliver to `documents.outline` (spine + units + seriesEngine + seasonArc + episodes)
- Delete `client/src/components/shared/BeatCard.tsx`

## Verification

After each shipped release (V1, V2):

1. `npm run test:run` — full test suite green.
2. `npm run check` — typecheck clean.
3. `npm run build` — production build succeeds.
4. Manual UI verification in a browser:
   - **V1:**
     - Feature project shows the new 15-card deck. Legacy beat titles ("Theme Stated", "Catalyst", "Debate", "All Is Lost", etc.) do not appear anywhere in the edit-view DOM.
     - Series project shows the new 18-base-card deck plus seeded Episode 101 / 102 / 103 in a typed `episodes[]` list. Legacy beat titles do not appear in the edit-view DOM for series either.
     - Each EpisodeCard exposes label, title, hookLogline, aStory, bcStory, changeByEnd, endingHook. Add-episode appends `Episode 104` (and so on). Renaming a label persists.
     - Season climax and season ending/hook are distinct fields with distinct cards.
     - Old user notes still visible under the correct new cards after migration; migration runs once and is idempotent.
     - Clear dialog offers two options with format-correct copy.
     - Format switch with non-spine answers shows the confirmation; series episodes survive a switch to feature and back.
     - Oliver in Writer's Room still references outline beats correctly via the legacy mirror.
   - **V2:** Document view renders all answered sections + placeholders for empty ones; structural labels appear here as section subtitles per template ref; QA checklist reacts to filling fields; Series document view renders `seasonClimax` distinct from `seasonEndingHook`.

End-to-end check: load a real existing project (May 16 era data), confirm migration runs cleanly on the new V1 deck, switch between feature and series, confirm answers persist, confirm episodes 101/102/103 seed on first Series mount, then in V2 toggle to document view and confirm the formatted output matches the template ref structure.
