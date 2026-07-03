# StoryBibleTab Story-Coach Redesign - PRD

**Date:** 2026-05-18
**Status:** Canonical for the next Story Bible redesign slice; implementation pending
**Branch context:** `feature/screenplay-editor-core`
**Related docs:** `docs/product/README.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/outline-story-coach-redesign-prd.md`, `docs/product/synopsis-story-coach-redesign-prd.md`, `docs/product/structured-writing-surfaces-prd.md`

> Product alignment note: this PRD supersedes the current StoryBibleTab guided-form layout. The legacy `state.storyBible` shape (characters, world, themes, rules) is too thin for a real story bible and exposes professional section labels directly to the writer. The richer `documents.storyBible.content` schema already exists. The next product step is to wire the UI to that schema using the same plain-language story-assessment standard that ships for Synopsis and Outline.

## Context

The current Story Bible surface uses the `StoryBibleTab` guided-form view fed by `ProjectState.storyBible`. It shows craft-section headlines directly: "Characters", "World", "Themes", "Tone & Voice", "Rules of the World", with field labels "Setting", "Tone Anchors", "Voice Notes", "Central Theme", "World Rules". A new writer encountering this surface sees a worksheet and is asked to fill in fields that imply they already know what each one is for.

WriterOS already has a richer schema in `shared/documents.ts` (`StoryBibleDocumentContent`) covering cover identity, one-page pitch, tone and style, premise and world, characters with want/need/flaw/secret/contradiction/arc, story engine for feature and series, and an episode/sequence map. That schema is migrated, validated, persisted, and exported - but no surface reads or writes it. Story Bible is the last non-script surface still living on its legacy `state.storyBible` mirror only.

A Story Bible should feel like a confident creative source-of-truth document, not a checklist. The writer should be able to answer plain-language questions about identity, pitch, world, characters, and story engine, and WriterOS should compose those answers into a professional bible that another writer, an executive, or an AI agent can read.

## Core Product Principle

**Story Bible is a story-assessment surface for project identity, continuity, and longevity.**

The writer answers plain-language questions about who this story belongs to, what it promises, what world it lives in, who lives there, what keeps it going, and what is non-negotiable. WriterOS translates those answers into a professional story bible structure behind the scenes and renders a readable bible artifact in Document View.

The writer should not have to know what an "arc per season," "world rule," "anti-comp," or "story engine" is in order to produce a usable bible.

## Goals

- Make Story Bible match the current non-script surface standard: plain-language Edit View, hidden professional mapping, studio-presentable Document View.
- Wire the UI to `documents.storyBible.content`. Stop treating legacy `state.storyBible` as the source of truth for the Story Bible surface.
- Preserve every authored field from the current legacy shape through migration.
- Keep Feature and Series support first-class. The deck visibly changes by `ProjectState.meta.format`.
- Give Casey and Zoe richer, format-aware Story Bible context without authoring on the writer's behalf.
- Produce a Story Bible document a writer could share as a pitch or living canon snapshot.

## Non-Goals

- No AI drafting or "fill this in for me" button in this slice.
- No locations editor in V1.
- No continuity log editor in V1.
- No open-questions board in V1.
- No episode/sequence map editor in V1 (the schema field stays present; UI deferred).
- No AI production annex (prompt blocks, asset registry) in V1.
- No PDF/DOCX export.
- No Treatment surface.
- No Script changes.
- No autonomous Casey or Zoe edits to project state.
- No visible craft-jargon labels as Edit View card headlines.
- No pitch-vs-living density toggle in Document View; `cover.status` is persisted but does not branch rendering in V1.

## Scope Decisions - Locked

- **Edit View is question-first.** Each card headline is a plain-language question.
- **Professional labels are hidden in Edit View.** Terms like "Logline", "Tone words", "Anti-comps", "World rules", "Pilot engine", "Season one arc", "Continuity facts", "Behavioral anchors" may appear in Document View, mapping tables, tests, developer docs, and agent context. They must not be the main writer-facing card headline.
- **Document View is the professional bible artifact.** It uses industry-presentable headings and prose-or-table formatting drawn from `references/story-bible-best-practices-template.md`.
- **Feature/Series mode comes from `ProjectState.meta.format`.** `cover.format` is a compatibility mirror for display/export only.
- **Feature and Series content both persist across format flips.** Story-engine answers authored under Feature are not deleted when the writer switches to Series, and vice versa. Inactive-format answers are hidden from Edit View and Document View.
- **No partial product ship.** The first shipped revision must cover both Feature and Series Edit Views. Internal branch work can be staged, but do not release a state where one mode uses the story-coach standard and the other still uses visible guided-form headings.
- **Cards write existing document fields where possible.** The current schema is large enough for V1; do not expand it for prompts that can land in existing fields.
- **Schema additions are deferred.** Locations, continuity log, open questions, and AI production annex are non-goals for V1. The shipped slice must not block them: any deferred section keeps a stable persistence story that V2/V3 PRDs can extend.
- **Legacy `state.storyBible` mirror remains live in V1.** Casey and Zoe still receive the legacy shape through the existing routing pack until their context migration ships. Writes go to `documents.storyBible.content`; the legacy mirror is derived in the same transaction.
- **Clear behavior remains explicit.** A future "clear only character X" or "clear only world" command is a separate PRD. V1 clear wipes the entire bible document and the legacy mirror.

## Current Implementation Baseline

Active files this slice must respect or replace:

- `shared/documents.ts`
  - `StoryBibleCoverSchema`
  - `StoryBibleStatusSchema`
  - `StoryBibleOnePagePitchSchema`
  - `StoryBibleToneAndStyleSchema`
  - `StoryBiblePremiseAndWorldSchema`
  - `StoryBibleCharacterSchema`
  - `StoryBibleStoryEngineSchema`
  - `StoryBibleMapEntrySchema`
  - `StoryBibleDocumentContentSchema`
  - `createEmptyStoryBibleContent`
- `client/src/lib/useProjectState.ts`
  - `setStoryBibleDocument` (if absent, must be added in the wiring slice)
  - `setStoryBibleViewPreferences`
  - `clearStoryBible`
  - `setProjectFormat`
- `client/src/components/writing/StoryBibleTab.tsx`
  - Legacy guided-form orchestrator to be retired as default Edit View
- `client/src/components/shared/CharacterCard.tsx`
  - Existing character row editor for the legacy `state.storyBible.characters` shape; will need a story-coach replacement or refactor
- `client/src/components/shared/GuidedSection.tsx`
  - Generic label-plus-textarea used heavily today; retained as a sub-editor only
- `client/src/lib/documentMigration.ts`
  - Legacy ↔ documents mirror helpers
- `client/src/lib/wpRouting.ts`
  - Casey and Zoe context packs (currently read legacy `state.storyBible`)

Casey owns Story Bible character/theme/tone work. Zoe owns Story Bible world/rules work. Both must keep working through V1.

## UX Model

### Page Shape

The Story Bible page keeps the current writing-column layout:

- Surface title: `Story Bible`
- Short subtitle: identity, continuity, and the rules the world cannot break
- Shared Feature/Series selector near the surface header
- Edit/Document view toggle
- Edit View: story-coach cards grouped by reader-facing concerns plus a character list with plain-language interview rows
- Document View: formatted bible artifact

### Edit View Rules

- Each top-level card has:
  - plain-language question
  - one short helper sentence
  - one input control appropriate to the answer (text, textarea, comps tokenizer, status enum)
  - optional placeholder
  - hidden mapping path
- Group labels are simple and reader-facing, for example:
  - `The cover`
  - `The pitch`
  - `The tone`
  - `The world`
  - `The people`
  - `The shape` (Feature mode)
  - `The engine` (Series mode)
  - `The pilot` (Series mode)
  - `The season` (Series mode)
  - `The future` (Series mode)
- Group labels must not be professional template headings.
- Characters are edited as a list of plain-language interview cards. The list lives in a single group (`The people`) with a single "Add a character" affordance, not a forest of separate forms.
- A character card uses plain-language prompts as field labels (e.g. "What do they want?", "What are they hiding?"). Professional labels (Want, Need, Flaw, Secret, Contradiction, Arc) are not visible.
- Readiness checks may appear in Edit View only as plain-language review questions derived from authored fields.
- The writer never sees a required "bible complete" score.

### Document View Rules

Document View renders a clean external-facing bible:

- Cover block when supplied.
- One-page pitch.
- Tone and style.
- World (premise, world rules, history).
- Characters.
- Story engine, format-aware.
- Empty sections are omitted, not rendered as empty headings.
- Episode/sequence map is hidden in V1 unless the array is non-empty (deferred editor).
- Locations, continuity log, open questions, and AI production annex are hidden in V1.
- Document View remains read-only in V1.

## Story-Coach Deck Model

Create a small deck-definition module rather than hard-coding questions across components.

Recommended new file:

- `client/src/lib/storyBibleDeck.ts`

Suggested types:

```typescript
type StoryBibleDeck = 'feature' | 'series'

type StoryBibleInputKind =
  | 'text'
  | 'textarea'
  | 'comps'
  | 'status'
  | 'tone-words'
  | 'characters'

interface StoryBiblePromptInput {
  path: string
  kind: StoryBibleInputKind
  label?: string
  placeholder?: string
}

interface StoryBiblePromptDef {
  id: string
  deck: StoryBibleDeck
  groupLabel: string
  question: string
  helper: string
  inputs: readonly StoryBiblePromptInput[]
  documentLabel: string
}
```

Rules:

- `question` is the Edit View headline.
- `documentLabel` is never rendered as the Edit View headline.
- `mappingPath` points into `StoryBibleDocumentContent`.
- Composite prompts may write more than one field; the write helper must be deterministic and unit-tested.
- Deck order is fixed in V1.
- No drag/reorder.
- Character list uses a single `characters` kind that delegates to a story-coach character-row editor; the deck does not enumerate per-character question prompts.

## Feature Deck - V1 Prompt Set

Feature mode answers the question: **Can an outside reader understand what this story is, what it promises, who lives in it, and how it ends without explanation?**

| # | Group | Question | Helper | Maps to | Document label |
| --- | --- | --- | --- | --- | --- |
| 1 | The cover | What should appear as the title? | Use the title you would want on a pitch document. | `cover.title` | Title |
| 2 | The cover | Who should be credited as the writer or creator? | Keep it exactly how you want it to appear. | `cover.writer` | Writer |
| 3 | The cover | What kind of project is this? | Genre, plus how you'd describe the format on a cover page. | `cover.genre` | Genre |
| 4 | The cover | Where is this bible right now? | Pitch / development / production / living canon. | `cover.status` | Status |
| 5 | The pitch | Say the project in one clean sentence. | The protagonist, problem, pressure, and hook. | `onePagePitch.logline` | Logline |
| 6 | The pitch | What is this in a nutshell? | One short paragraph an outsider could repeat back. | `onePagePitch.inANutshell` | In a nutshell |
| 7 | The pitch | Why does this story matter? | The personal, cultural, or emotional reason it exists. | `onePagePitch.whyThisMatters` | Why this matters |
| 8 | The pitch | What is the promise to the reader? | What they should feel by the end. | `onePagePitch.corePromise` | Core promise |
| 9 | The pitch | What question does the story argue? | The central thematic question. | `onePagePitch.centralQuestion` | Central question |
| 10 | The pitch | What makes this different from things it could be confused with? | The angle that makes it specific. | `onePagePitch.whatMakesItDifferent` | What makes it different |
| 11 | The tone | What three to six tone words describe how this should feel? | Comma-separated. Match how you'd describe it to a director. | `toneAndStyle.toneWords` | Tone words |
| 12 | The tone | What should a reader compare it to? | Optional. A few precise comps, not a market paragraph. | `toneAndStyle.comps` | Comps |
| 13 | The tone | What should a reader never confuse it with? | Optional. Anti-comps that frame what this is not. | `toneAndStyle.antiComps` | Anti-comps |
| 14 | The tone | How should the dialogue, visuals, and sound feel? | One or two sentences each across dialogue, visual, and sound style. | `toneAndStyle.dialogueStyle`, `toneAndStyle.visualStyle`, `toneAndStyle.soundOrMusicStyle` | Dialogue / Visual / Sound |
| 15 | The tone | What rules govern pacing, humor, and intensity? | One short note each on pacing, humor, and violence/intensity rules. | `toneAndStyle.pacingRules`, `toneAndStyle.humorRules`, `toneAndStyle.violenceOrIntensityRules` | Pacing / Humor / Intensity |
| 16 | The tone | What must this project never feel like? | The single line you'd write on a wall in the writers' room. | `toneAndStyle.mustNeverFeelLike` | Must never feel like |
| 17 | The world | What is the world of this story? | Time, place, social texture, and the imbalance the story enters. | `premiseAndWorld.premise` | Premise |
| 18 | The world | What rules govern this world? | The non-negotiables. Violations break reader trust. | `premiseAndWorld.worldRules` | World rules |
| 19 | The world | What does the public know about this world's history? | The history a casual character would tell you. | `premiseAndWorld.publicHistory` | Public history |
| 20 | The world | What is hidden underneath that history? | The buried truth the story uncovers. | `premiseAndWorld.hiddenHistory` | Hidden history |
| 21 | The world | What mythology or reveals unfold over the story? | The sequence of large reveals, if any. | `premiseAndWorld.mythologyReveals` | Mythology reveals |
| 22 | The people | Who lives in this story? | Add each major character. Each character gets a small interview. | `characters` | Characters |
| 23 | The shape | What state is the world in when we start? | The beginning balance the story disrupts. | `storyEngine.featurePropulsion` | Feature propulsion |
| 24 | The shape | What keeps the premise alive across the whole story? | The renewable pressure inside the feature. | `storyEngine.whatKeepsThePremiseAlive` | What keeps the premise alive |
| 25 | The reach | If this could continue, where could it go? | Sequel or franchise potential. Skip if not relevant. | `storyEngine.futureSeasonPotential` | Future potential |

### Feature Readiness Review

V1 has no stored `storyBibleQa` boolean object. Readiness for the Story Bible surface is derived from authored fields. Render derived plain-language checks; do not require a manual checklist in V1.

Recommended derived checks:

| Question | Derived from |
| --- | --- |
| Can a reader say the project back in one sentence? | `onePagePitch.logline` |
| Is the tone specific enough for another writer to reproduce? | `toneAndStyle.toneWords`, `toneAndStyle.dialogueStyle`, `toneAndStyle.visualStyle` |
| Do the world rules actually generate conflict? | `premiseAndWorld.worldRules` |
| Does the cast have at least one character with want, need, and flaw filled in? | `characters[]` |
| Is the story engine specific enough to predict scenes? | `storyEngine.featurePropulsion`, `storyEngine.whatKeepsThePremiseAlive` |
| Are the tone rules consistent with the genre? | `toneAndStyle.pacingRules`, `toneAndStyle.humorRules`, `toneAndStyle.violenceOrIntensityRules`, `toneAndStyle.mustNeverFeelLike` |

If a stored manual checklist is added later, it must be optional, backward-compatible, and must not block the story-coach UI.

## Series Deck - V1 Prompt Set

Series mode replaces `The shape` and `The reach` with engine, pilot, season, and future cards. All other groups are shared with the feature deck.

| # | Group | Question | Helper | Maps to | Document label |
| --- | --- | --- | --- | --- | --- |
| 1-22 | Same as Feature deck items 1-22 | Same | Same | Same | Same |
| 23 | The engine | What is the repeatable pressure that generates episodes? | The renewable conflict the show keeps drawing from. | `storyEngine.seriesEngine` | Series engine |
| 24 | The engine | What stops this premise from exhausting itself? | The safeguard against running out of story. | `storyEngine.whatKeepsThePremiseAlive` | What keeps the premise alive |
| 25 | The pilot | What is the pilot's central pressure? | The specific conflict that defines episode one. | `storyEngine.pilotEngine` | Pilot engine |
| 26 | The season | What is the shape of season one? | The season question, escalation, midpoint pressure, and end state. | `storyEngine.seasonArc` | Season one arc |
| 27 | The future | If the show continues, where can it go? | Future-season promises only when they clarify the engine. | `storyEngine.futureSeasonPotential` | Future seasons |

### Series Readiness Review

| Question | Derived from |
| --- | --- |
| Can a buyer say the show back in one sentence? | `onePagePitch.logline` |
| Is the repeatable engine specific, not generic? | `storyEngine.seriesEngine` |
| Does the pilot have its own engine on top of the show engine? | `storyEngine.pilotEngine` |
| Does season one have a visible shape? | `storyEngine.seasonArc` |
| Can the cast sustain recurring pressure across seasons? | `characters[]`, especially `relationshipPressure` and `arc` |
| Does the bible say what this show must never feel like? | `toneAndStyle.mustNeverFeelLike` |

## Character Card Story-Coach Prompts

The character editor card is the same in both decks. Field labels are plain-language questions. Stored paths follow the existing `StoryBibleCharacterSchema`.

| Question | Maps to | Document label |
| --- | --- | --- |
| What is their name as it should appear? | `name` | Name |
| What is their role in the story? | `role` | Role |
| What do they want? | `want` | Want |
| What do they need? | `need` | Need |
| What is their flaw or wound? | `flaw` | Flaw |
| What are they hiding? | `secret` | Secret |
| What contradiction makes them feel real? | `contradiction` | Contradiction |
| How do they change across the story? | `arc` | Arc |
| What pressure do their key relationships put on them? | `relationshipPressure` | Relationship pressure |
| What small behaviors anchor how they read on the page? | `behavioralAnchors` | Behavioral anchors |
| How do they speak that sounds only like them? | `speechPatterns` | Speech patterns |
| What should this character never be written as? | `neverWriteThemAs` | Never write them as |
| What facts about them must never contradict later? | `continuityFacts` | Continuity facts |

The card collapses to name + role by default. Expanding reveals the full plain-language interview. Removing a character requires a two-click confirm in line with the existing destructive-action pattern used by Synopsis.

## Professional Document Mapping

### Feature Story Bible Document View

Feature Document View renders:

1. Cover block (title, writer, format, genre, version, date updated, status).
2. One-page pitch (logline, in a nutshell, why this matters, core promise, central question, what makes it different).
3. Tone and style.
4. World (premise, world rules, public history, hidden history, mythology reveals).
5. Characters (sorted by authored order; renders only filled fields per character).
6. Story engine (feature propulsion, what keeps the premise alive, future potential).
7. Last-edited footer.

Empty sections are skipped. Empty per-character fields are skipped.

### Series Story Bible Document View

Series Document View renders:

1. Cover block (with series-appropriate format display).
2. One-page pitch.
3. Tone and style.
4. World.
5. Characters.
6. Story engine: series engine, what keeps the premise alive, pilot engine, season one arc, future seasons.
7. Last-edited footer.

Runtime-equivalent fields are not in the bible cover; no analog of the synopsis runtime suppression is required.

### Format Authority Requirement

`StoryBibleDocumentView` must not decide Feature/Series behavior from `cover.format` alone. It must receive or derive the normalized project format from `ProjectState.meta.format`, then use `cover.format` only as display text. This matches the Synopsis Document View authority rule.

## Data Model And Source Of Truth

### Canonical State

- `state.documents.storyBible.content` is the canonical Story Bible content.
- `state.storyBible` (legacy: `characters`, `world`, `themes`, `rules`) remains a derived compatibility mirror until Casey and Zoe context packs migrate.
- `state.meta.format` remains the only behavioral Feature/Series authority.
- `state.documents.storyBible.content.cover.format` mirrors `state.meta.format` for document rendering/export compatibility.

### Schema Strategy

V1 must not expand `StoryBibleDocumentContentSchema`. The existing schema covers cover, one-page pitch, tone and style, premise and world, characters, story engine, and episode/sequence map. Locations, continuity log, open questions, and AI production annex remain non-goals for V1.

Allowed schema additions for V1:

- Optional, backward-compatible fields on `documents.storyBible.viewPreferences` via `DocumentViewPreferencesSchema` only if needed to preserve Story Bible UX or migration state (e.g., `migratedFromLegacyStoryBible`, expanded character IDs).

Disallowed schema changes for V1:

- Do not make `cover.format` the behavioral authority.
- Do not flatten `characters[]` into the legacy character shape.
- Do not remove the legacy mirror until every dependent context path is migrated.
- Do not add a stored manual readiness checklist.

### Legacy Mirror

The legacy `state.storyBible` mirror is derived from `documents.storyBible.content` after every write. Specifically:

- `state.storyBible.characters[]` ← `documents.storyBible.content.characters[]` projected onto the legacy shape (`id`, `name`, `role`, `wound` ← `flaw`, `want`, `need`, `arc`). Extra story-coach fields are dropped from the legacy mirror.
- `state.storyBible.world.setting` ← `documents.storyBible.content.premiseAndWorld.premise`.
- `state.storyBible.world.toneAnchors` ← `documents.storyBible.content.toneAndStyle.comps.join(', ')`.
- `state.storyBible.world.voiceNotes` ← `documents.storyBible.content.toneAndStyle.dialogueStyle`.
- `state.storyBible.themes` ← `documents.storyBible.content.onePagePitch.whyThisMatters`.
- `state.storyBible.rules` ← `documents.storyBible.content.premiseAndWorld.worldRules`.

This mirror is one-way for V1: writes from the story-coach Edit View land in `documents.storyBible.content` and refresh `state.storyBible` in the same transaction. Direct writes to `state.storyBible` are blocked once the story-coach Edit View is the default surface.

## Component Plan

Recommended new files:

- `client/src/lib/storyBibleDeck.ts`
  - `FEATURE_STORY_BIBLE_DECK`
  - `SERIES_STORY_BIBLE_DECK`
  - prompt definitions
  - mapping helpers (`getDeckForFormat`, `getMappingPaths`, `isComposite`, `resolveStoryBiblePath`, `storyBibleProbeContent`, `buildStoryBiblePatch`)
- `client/src/lib/storyBibleReadiness.ts`
  - derived feature and series readiness checks
- `client/src/components/writing/storyBible/StoryBibleQuestionCard.tsx`
  - renders question, helper, and input(s)
  - never renders `documentLabel` as the card headline
  - delegates `characters` kind to the story-coach character editor
- `client/src/components/writing/storyBible/StoryBibleCharacterCard.tsx`
  - plain-language interview card for a single character
  - collapsed by default; expands to the full interview
  - two-click remove
- `client/src/components/writing/storyBible/StoryBibleCharactersEditor.tsx`
  - story-coach character list with "Add a character"
  - replaces direct rendering of `CharacterCard` and the legacy "+ Add Character" affordance
- `client/src/components/writing/storyBible/StoryBibleStoryCoachEditView.tsx`
  - dispatches Feature/Series decks based on `ProjectState.meta.format`
  - replaces the current guided-form Edit View
- `client/src/components/writing/storyBible/StoryBibleReadinessReview.tsx`
  - plain-language derived checks only
- `client/src/components/writing/storyBible/StoryBibleDocumentView.tsx`
  - read-only professional artifact

Recommended edited files:

- `client/src/components/writing/StoryBibleTab.tsx`
  - replace direct render with story-coach Edit View / Document View dispatch
  - keep `ProjectFormatSelector` and view-toggle pattern from `SynopsisTab`
- `client/src/lib/useProjectState.ts`
  - add `setStoryBibleDocument` and `setStoryBibleViewPreferences` if missing
  - wire `clearStoryBible` to reset both `documents.storyBible.content` and the legacy `state.storyBible` mirror
- `client/src/lib/documentMigration.ts`
  - ensure the legacy mirror projection is up to date for the new fields
- `client/src/lib/wpRouting.ts`
  - extend Casey and Zoe context packs to read `documents.storyBible.content` (planned for the agent-context follow-up sub-phase)
- `tests/components/StoryBibleTab.test.tsx`
  - rewrite assertions around the story-coach Edit View, format authority, and Document View

Files to retire after the story-coach Edit View is the default:

- `client/src/components/shared/CharacterCard.tsx`
  - retire only after the story-coach character card has shipped and no other surface depends on the legacy shape.
- Any `GuidedSection` usage inside `StoryBibleTab.tsx`.

## Migration And Data Safety

- Existing `state.storyBible.characters[]` populates `documents.storyBible.content.characters[]` on first mount via a one-time migration:
  - `name`, `role`, `want`, `need`, `arc` carry over.
  - `wound` lands on `flaw`.
  - All other story-coach fields default to empty strings.
  - Each character receives a stable `id`.
- `state.storyBible.world.setting` lands on `premiseAndWorld.premise`.
- `state.storyBible.world.toneAnchors` tokenizes into `toneAndStyle.comps`.
- `state.storyBible.world.voiceNotes` lands on `toneAndStyle.dialogueStyle`.
- `state.storyBible.themes` lands on `onePagePitch.whyThisMatters`.
- `state.storyBible.rules` lands on `premiseAndWorld.worldRules`.
- Migration runs once. A `migratedFromLegacyStoryBible` flag on `documents.storyBible.viewPreferences` prevents re-migration. The flag must be added to `DocumentViewPreferencesSchema` in the same slice.
- This migration flag is a view-preference guard, not an expansion of `StoryBibleDocumentContentSchema`.
- No content is deleted during migration. Empty legacy fields produce empty document fields, not undefined.
- Feature/Series flips preserve all authored content. Format flips never delete characters, story-engine answers, world content, or cover identity.
- Save/load must continue preserving document-only fields, especially `characters[]` substructure and `cover.status`.
- `clearStoryBible` resets both `documents.storyBible.content` (to `createEmptyStoryBibleContent()`) and the legacy `state.storyBible` mirror in a single transaction.

## Casey And Zoe Context

Casey owns Story Bible character / theme / tone work. Zoe owns Story Bible world / rules work. After this slice ships, both should receive richer, format-aware Story Bible context. The agent-context migration lands as a follow-up sub-phase inside this PRD's rollout (Sub-phase 4); the initial Edit View ship in Sub-phases 1-3 must not break the existing Casey/Zoe context packs.

Casey context (after migration):

- Top-level project title, genre, and `ProjectState.meta.format`.
- One-page pitch: logline, in a nutshell, core promise, central question.
- Tone and style: tone words, comps, anti-comps, dialogue style, must never feel like.
- Characters: full story-coach character fields (want, need, flaw, secret, contradiction, arc, relationship pressure, behavioral anchors, speech patterns, never write them as).
- Themes: derived from `onePagePitch.centralQuestion` and `onePagePitch.whyThisMatters`, supplemented by tone signals.

Zoe context (after migration):

- Top-level project title, genre, and `ProjectState.meta.format`.
- World: premise, world rules, public history, hidden history, mythology reveals.
- Story engine: format-appropriate fields (feature propulsion or series engine + pilot engine + season arc + future potential).
- Continuity-sensitive facts: `characters[].continuityFacts` aggregated.

Casey and Zoe behavior rules:

- Both evaluate, suggest, and pressure-test, but must not silently mutate authored Story Bible content.
- Both mark unknown major decisions as `[NEEDS DECISION: ...]`.
- Casey must not invent character backstory, secrets, or arcs not present in the bible.
- Zoe must not invent world rules, history, or mythology not present in the bible.

## Test Plan

### Deck Tests

Create `tests/lib/storyBibleDeck.test.ts`:

- Feature deck contains all V1 prompt IDs in fixed order.
- Series deck contains all V1 prompt IDs in fixed order.
- Every prompt has a plain-language `question`.
- No prompt renders its `documentLabel` as its `question`.
- Every `mappingPath` resolves against `StoryBibleDocumentContent` (with non-empty characters and full nested structure).
- Composite prompts carry per-input labels and at least two paths.
- `getDeckForFormat('feature')` returns the feature deck; `getDeckForFormat('series')` returns the series deck.
- `buildStoryBiblePatch` is immutable, deterministic, and supports 3-level nested writes.

### Readiness Tests

Create `tests/lib/storyBibleReadiness.test.ts`:

- Feature readiness checks return six derived signals regardless of input.
- Engine-clear satisfied when `storyEngine.featurePropulsion` is filled.
- Cast-real satisfied only when at least one character has `name` filled and at least one of `want`, `need`, `flaw` filled. Empty stub rows must not satisfy.
- Tone-specific satisfied only when `toneWords`, `dialogueStyle`, and `visualStyle` are all filled.
- Series readiness returns six derived signals regardless of input.
- Series-engine-specific satisfied when `storyEngine.seriesEngine` is filled.
- Pilot-has-own-engine satisfied when `storyEngine.pilotEngine` is filled in addition to `seriesEngine`.

### Edit View Tests

Update or create component tests:

- Feature Edit View renders the plain-language questions for items 1-25.
- Feature Edit View does not show professional labels as card headlines.
- Series Edit View renders items 1-22 plus the series-specific 23-27 set; suppresses feature-only items 23-25.
- Series Edit View does not show professional labels as card headlines.
- Character list renders one card per character, collapsed by default.
- Expanding a character card reveals the full plain-language interview.
- Two-click remove on a character card fires `onRemove`.
- Format selector updates `ProjectState.meta.format`, not only `cover.format`.
- Switching formats preserves inactive engine fields (feature and series engine answers both persist).
- Clear performs the documented two-click destructive reset and wipes both canonical and legacy mirrors.

### Document View Tests

Create `tests/components/StoryBibleDocumentView.test.tsx`:

- Document View branches from normalized project format, not `cover.format` alone.
- Feature Document View renders cover, pitch, tone, world, characters, feature engine.
- Series Document View renders cover, pitch, tone, world, characters, series engine + pilot + season arc + future seasons.
- Empty sections are omitted.
- Empty per-character fields are omitted.
- Readiness checks do not render in the professional document by default.
- `cover.format` is rendered as display only; `projectFormat` controls branching.

### Data Tests

Update existing data-layer tests:

- Legacy `state.storyBible` migrates into the new document shape once, then sets `migratedFromLegacyStoryBible`.
- Re-mount does not re-migrate.
- Save/load preserves feature engine and series engine content across the cycle.
- Save/load preserves character story-coach fields (`secret`, `contradiction`, `behavioralAnchors`, `speechPatterns`, `neverWriteThemAs`, `continuityFacts`).
- Clear resets both mirrors in the same transaction.

### Casey/Zoe Tests

Update `tests/lib/wpRouting.test.ts` and server route tests in Sub-phase 4:

- Casey context exposes one-page pitch, tone, and full character story-coach fields in both formats.
- Zoe context exposes world fields and the format-appropriate story-engine fields.
- Inactive-format story-engine content does not leak (e.g., feature propulsion never reaches Zoe in series mode).
- `state.storyBible` legacy mirror continues to be read until the migration is complete; Casey and Zoe see no regression.

## Phased Rollout

### Sub-phase 1 - Deck Definitions And Tests

- Add `storyBibleDeck.ts`.
- Add `storyBibleReadiness.ts`.
- Add unit tests for deck integrity, mapping, and readiness derivation.
- No UI behavior changes yet.
- Ship even before any tab refactor.

### Sub-phase 2 - Story-Coach Edit View

- Add `StoryBibleQuestionCard`, `StoryBibleCharacterCard`, `StoryBibleCharactersEditor`, `StoryBibleStoryCoachEditView`, `StoryBibleReadinessReview`.
- Refactor `StoryBibleTab` to render the story-coach Edit View for both Feature and Series.
- Preserve current Document View (still legacy or absent in V1 - Document View comes in Sub-phase 3).
- Implement schema migration: legacy `state.storyBible` → `documents.storyBible.content` once on first mount.
- Add optional `migratedFromLegacyStoryBible` to `DocumentViewPreferencesSchema` and store it on `documents.storyBible.viewPreferences`.

### Sub-phase 3 - Document View

- Add `StoryBibleDocumentView`.
- Branch by normalized project format.
- Keep `cover.format` as display/export mirror only.
- Add header-format-conflict test coverage.

### Sub-phase 4 - Casey And Zoe Context Upgrade

- Extend `wpRouting.ts` Casey and Zoe context packs with the new fields.
- Update server routes / openaiService to validate and surface the new shape.
- Keep legacy `state.storyBible` mirror available for any consumer still on the old pack.
- Update routing and server tests.

### Sub-phase 5 - Verification

Required before final commit:

- `npm run test:run`
- `npm run check`
- `npm run build`
- Manual browser pass:
  - Feature story-coach cards render and save.
  - Series story-coach cards render and save.
  - Character list adds, expands, edits, and two-click removes correctly.
  - Feature/Series flips preserve inactive engine content.
  - Document View renders a professional bible in both modes.
  - Casey and Zoe context packs surface the right format-appropriate fields.

## V1 Decisions

These decisions close the remaining implementation ambiguities for the V1 Story Bible story-coach redesign:

1. `cover.status` is metadata only in V1. It must not change Document View density, section visibility, or prompt behavior. Pitch-vs-living density is deferred to a later PRD.
2. Legacy migration always defaults `cover.status` to `development`. Do not infer `pitch` from sparse story-engine content.
3. Character cards expose `behavioralAnchors`, `speechPatterns`, and `neverWriteThemAs` behind an optional "more about this character" expansion so the default card remains scannable.
4. Derived readiness stays qualitative in V1. Do not render a numeric satisfied count such as "3 of 6 reader checks pass."
5. Story Bible does not get a one-page pitch export shortcut in V1. Export waits for the cross-surface Markdown / PDF / DOCX export phase.

## Acceptance Criteria

- A new writer can use Story Bible without knowing professional bible terminology.
- Edit View primarily asks plain-language story questions and character-interview prompts.
- Professional document labels appear in Document View, not as Edit View card headlines.
- Feature mode produces a complete bible artifact for a feature project.
- Series mode produces a bible artifact with series engine, pilot engine, season one arc, and future-season promise.
- Format authority comes from `ProjectState.meta.format`.
- Existing Story Bible content survives the redesign through a one-time legacy migration.
- Casey receives richer character / theme / tone context after the agent-context migration.
- Zoe receives richer world / rules / story-engine context after the agent-context migration.
- Neither Casey nor Zoe gains authority to silently edit Story Bible project content.
