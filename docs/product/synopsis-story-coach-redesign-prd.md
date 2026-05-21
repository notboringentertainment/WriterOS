# SynopsisTab Story-Coach Redesign - PRD

**Date:** 2026-05-18
**Status:** Canonical for the next Synopsis redesign slice; implementation pending
**Branch context:** `feature/screenplay-editor-core`
**Related docs:** `docs/product/README.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/outline-story-coach-redesign-prd.md`, `docs/product/structured-writing-surfaces-prd.md`, `docs/superpowers/plans/2026-05-16-synopsis-surface-redesign.md`, `docs/superpowers/plans/2026-05-16-synopsis-series-variant.md`

> Product alignment note: this PRD supersedes older Synopsis edit-view guidance wherever that guidance makes Synopsis feel like a template, worksheet, or craft-jargon form. The current implemented data model is useful and should be preserved. The next product step is to revise the writer-facing Edit View so it meets the same plain-language story-assessment standard as Outline.

## Context

The May 16 Synopsis work gave WriterOS important infrastructure:

- `documents.synopsis` is the canonical source for the Synopsis surface.
- Legacy `state.synopsis` is mirrored for compatibility.
- Edit View and Document View exist.
- Feature and Series content can both be preserved.
- `ProjectState.meta.format` is now the project-wide format authority, with `documents.synopsis.content.header.format` acting only as a display/export mirror.

That work solved storage, preservation, and format plumbing. It did not fully solve product feel.

The current Synopsis edit surface still exposes the document's professional sections too directly: Header, Logline, Prose, QA, Show Overview, Pilot Synopsis, Season One Arc, Future Seasons, Characters, and Comps. Those sections are valid professional output sections, but as Edit View headlines they can still feel like a template app. WriterOS should not ask the writer to fill a studio document by staring at studio document headings.

The Synopsis surface should instead feel like a sharp story coach asking what an outside reader needs to understand. Behind the scenes, WriterOS maps those answers into a polished feature synopsis or series synopsis that the writer can confidently send to a producer, studio exec, contest reader, collaborator, or buyer.

## Core Product Principle

**Synopsis is a story-assessment surface for external readability.**

The writer answers plain-language questions about story clarity, audience promise, causality, stakes, ending, series engine, and buyer-facing positioning. WriterOS translates those answers into professional synopsis structure behind the scenes and renders a reader-facing document in Document View.

The writer should not have to know what a professional synopsis section is called in order to produce one.

## Goals

- Make Synopsis match the current non-script surface standard: plain-language Edit View, hidden professional mapping, studio-presentable Document View.
- Preserve the implemented `documents.synopsis` schema and existing user content wherever possible.
- Keep Feature and Series support first-class.
- Make `ProjectState.meta.format` the only behavioral authority for Feature/Series mode.
- Give Sam cleaner, format-aware synopsis context without making Sam mutate authored content.
- Produce a Synopsis document a writer could reasonably share outside the app.

## Non-Goals

- No AI drafting or "write it for me" button in this slice.
- No Treatment surface.
- No Story Bible redesign.
- No Script format toggle.
- No PDF/DOCX export.
- No autonomous Sam edits to project state.
- No new project formats beyond `feature` and `series`.
- No visible craft-jargon labels as Edit View card headlines.

## Scope Decisions - Locked

- **Edit View is question-first.** The primary headline on each card must be a plain-language question.
- **Professional labels are hidden in Edit View.** Terms like "Opening paragraph", "Escalation", "Season One Arc", "Show Overview", and "Comps & Why This Show Now" may appear in Document View, tests, mapping tables, developer docs, and agent context. They must not be the main writer-facing card headline.
- **Document View is the professional artifact.** It may use industry-presentable headings and prose formatting.
- **Feature/Series mode comes from `ProjectState.meta.format`.** `documents.synopsis.content.header.format` is a compatibility mirror for display/export only.
- **Feature and Series content both persist.** Switching formats hides inactive content; it never deletes it.
- **No partial product ship.** The first shipped story-coach revision should cover both Feature and Series Edit Views. Internal branch work can be staged, but do not release a state where one mode uses the story-coach standard and the other still uses visible template headings.
- **Cards write existing data where possible.** The current schema is enough for V1. Add fields only if a specific story-coach answer has no safe home.
- **Clear behavior remains explicit.** Existing clear semantics wipe the whole Synopsis document, including inactive Feature/Series content, while resetting the header format mirror from `ProjectState.meta.format`. A future "clear only feature" or "clear only series" command is a separate PRD/slice.

## Current Implementation Baseline

Current files to preserve and refactor around:

- `shared/documents.ts`
  - `SynopsisDocumentContent`
  - `SynopsisLoglineSchema`
  - `SynopsisProseSchema`
  - `SynopsisQaSchema`
  - `SynopsisSeriesContentSchema`
  - `createEmptySynopsisContent()`
  - `createEmptySeriesContent()`
- `client/src/lib/useProjectState.ts`
  - `setSynopsisDocument`
  - `setSynopsisViewPreferences`
  - `setProjectFormat`
  - `clearSynopsis`
- `client/src/components/writing/SynopsisTab.tsx`
  - thin shell around active view and active format
- `client/src/components/writing/synopsis/*`
  - current feature and series editor components
  - current `SynopsisDocumentView`
- `client/src/lib/documentMigration.ts`
  - legacy mirror helpers
- `client/src/lib/wpRouting.ts`
  - Sam context compatibility fields

The next slice should treat this as a strong data foundation, not as product completion.

## UX Model

### Page Shape

The Synopsis page keeps the current compact writing-column layout:

- Surface title: `Synopsis`
- Short subtitle: external readability, not craft instruction
- Shared Feature/Series selector near the surface header
- Edit/Document toggle
- Edit View: story-coach cards grouped by reader-facing concerns
- Document View: formatted synopsis artifact

### Edit View Rules

- Each card has:
  - plain-language question
  - one short helper sentence
  - one input control appropriate to the answer
  - optional placeholder
  - hidden mapping path
- Group labels should be simple and reader-facing, for example:
  - `The promise`
  - `The story`
  - `The read`
  - `The show`
  - `The pilot`
  - `The season`
- Group labels should not be professional template headings.
- Readiness checks may appear in Edit View only as plain-language review questions.
- The writer never sees a required "template complete" score.

### Document View Rules

Document View renders a clean external-facing artifact:

- Title and writer when supplied.
- Metadata block when useful.
- Logline in an italic or lead style.
- Feature mode renders a concise synopsis body.
- Series mode renders a buyer-facing show synopsis.
- Empty sections are omitted, not rendered as empty headings.
- QA/readiness checks are hidden by default. They are an editing aid, not part of the studio-facing document.
- Document View remains read-only in V1.

## Story-Coach Deck Model

Create a small deck-definition module rather than hard-coding questions across components.

Recommended new file:

- `client/src/lib/synopsisDeck.ts`

Suggested type:

```typescript
type SynopsisDeck = 'feature' | 'series'

interface SynopsisPromptDef {
  id: string
  deck: SynopsisDeck
  groupLabel: string
  question: string
  helper: string
  placeholder?: string
  mappingPath: string
  documentLabel: string
}
```

Rules:

- `question` is the Edit View headline.
- `documentLabel` is never rendered as the Edit View headline.
- `mappingPath` points into `SynopsisDocumentContent`.
- Composite prompts may write more than one field, but the write helper must be deterministic and unit-tested.
- Deck order is fixed in V1.
- No drag/reorder.

## Feature Deck - V1 Prompt Set

Feature mode answers the question: **Can an outside reader understand the whole movie quickly, including the ending?**

| # | Group | Question | Helper | Maps to | Document label |
| --- | --- | --- | --- | --- | --- |
| 1 | The page | What should appear as the title? | Use the title you would want on a submission page. | `header.title` | Title |
| 2 | The page | Who should be credited as the writer? | Keep it exactly how you want it to appear. | `header.writer` | Writer |
| 3 | The page | What kind of movie is this? | Genre, tone, and target length if you know it. | `header.genre`, `header.targetRuntime` | Genre / Runtime |
| 4 | The page | What should a reader compare it to, if anything? | Optional. Use a few precise comps, not a long market paragraph. | `header.comps` | Comps |
| 5 | The promise | Say the movie in one clean sentence. | Protagonist, problem, pressure, and hook. | `logline.text` | Logline |
| 6 | The promise | Who are we following? | Name them and give the one detail that makes them readable fast. | `logline.protagonist` | Protagonist |
| 7 | The promise | What are they chasing? | The visible goal an outside reader can track. | `logline.goal` | Goal |
| 8 | The promise | What is pushing back? | Person, system, force, flaw, or situation. Be specific. | `logline.obstacle` | Obstacle |
| 9 | The promise | Why does it matter if they fail? | The cost in human terms. | `logline.stakes` | Stakes |
| 10 | The promise | What makes this feel specific or urgent? | The angle that makes the story feel like this movie, not a generic premise. | `logline.hook` | Hook |
| 11 | The story | Where do we start, and what is already wrong? | Establish the world, the lead, and the imbalance. | `prose.opening` | Opening |
| 12 | The story | What happens that forces the story forward? | The event or choice that changes direction. | `prose.escalation` | Escalation |
| 13 | The story | How does the situation get more complicated? | Pressure, reversals, relationships, discoveries, and consequences. | `prose.middle` | Middle |
| 14 | The story | What is the biggest confrontation or turn? | The decisive collision before the ending. | `prose.climax` | Climax |
| 15 | The story | How does it end? | Reveal the ending. Do not protect the twist from the reader here. | `prose.resolution` | Resolution |

### Feature Readiness Review

The existing `content.qa` booleans should remain, but their Edit View labels should become plain-language reader checks.

| Question | Maps to |
| --- | --- |
| Can a reader name the lead early? | `qa.protagonistNamedEarly` |
| Can a reader tell what the lead wants? | `qa.goalClear` |
| Can a reader tell what is pushing back? | `qa.obstacleClear` |
| Can a reader feel the cost of failure? | `qa.stakesClear` |
| Does the synopsis reveal the ending? | `qa.endingRevealed` |
| Does each paragraph cause the next? | `qa.paragraphsConnectCausally` |
| Does the tone sound like the movie? | `qa.toneMatchesProject` |
| Have you cut backstory or subplots that do not help the main read? | `qa.noUnnecessarySubplot` |

The readiness review is an editing aid. It does not render in the studio-facing Document View unless a later PRD adds an explicit diagnostics/export mode.

## Series Deck - V1 Prompt Set

Series mode answers the question: **Can an outside reader understand the show, the pilot promise, and why the engine can keep going?**

| # | Group | Question | Helper | Maps to | Document label |
| --- | --- | --- | --- | --- | --- |
| 1 | The page | What should appear as the title? | Use the title you would want on a pitch document. | `header.title` | Title |
| 2 | The page | Who should be credited as the writer? | Keep it exactly how you want it to appear. | `header.writer` | Writer |
| 3 | The page | What kind of show is this? | Genre, series type, and episode length. | `header.genre`, `series.seriesType`, `series.episodeLength` | Genre / Series Type / Episode Length |
| 4 | The promise | Say the show in one clean sentence. | The premise, pressure, and audience promise. | `logline.text` | Series Logline |
| 5 | The show | What world, tone, and repeatable pressure should a buyer understand first? | Explain the renewable conflict without pitching every episode. | `series.showOverview` | Show Overview |
| 6 | The pilot | What is the pilot in one sentence? | The first episode's central problem and hook. | `series.pilot.logline` | Pilot Logline |
| 7 | The pilot | What happens in the pilot, including the ending? | Tell the complete pilot story and why episode two exists. | `series.pilot.prose` | Pilot Synopsis |
| 8 | The season | What changes across season one? | The season question, escalation, midpoint pressure, and end state. | `series.seasonOneArc` | Season One Arc |
| 9 | The future | If the show continues, where can it go? | Add future-season promises only when they clarify the engine. | `series.futureSeasons` | Where It Goes |
| 10 | The people | Who keeps the show alive week after week? | Characters, roles, pressure, and how their arcs can continue. | `series.characters` | Characters |
| 11 | The read | What should a buyer compare it to, and why now? | Comps plus the reason this show belongs in the market now. | `series.compsAndWhyThisShowNow` | Comps & Why This Show Now |

### Series Readiness Review

Series currently has no stored `seriesQa` object. V1 should use derived checks from existing fields unless implementation adds an optional `seriesQa` schema with explicit tests.

Recommended derived checks:

| Question | Derived from |
| --- | --- |
| Can a reader understand the show in one sentence? | `logline.text` |
| Is the repeatable engine clear? | `series.showOverview` |
| Does the pilot sound like a complete first episode? | `series.pilot.logline`, `series.pilot.prose` |
| Does season one have a visible shape? | `series.seasonOneArc` |
| Can the characters sustain recurring pressure? | `series.characters` |
| Does the pitch explain why this show, why now? | `series.compsAndWhyThisShowNow` |

If a stored manual checklist is added, it must be optional, backward-compatible, and should not block the story-coach UI.

## Professional Document Mapping

### Feature Document View

Feature Document View renders:

1. Title.
2. Writer.
3. Metadata: format, genre, runtime, comps when supplied.
4. Logline.
5. `Synopsis` body built from `prose.opening`, `prose.escalation`, `prose.middle`, `prose.climax`, and `prose.resolution`.
6. Last-edited footer.

Professional headings such as `Synopsis` may appear here. Empty paragraphs are skipped.

### Series Document View

Series Document View renders:

1. Title.
2. Writer.
3. Metadata: format, genre, series type, episode length, comps when supplied.
4. Series logline.
5. `Show Overview`.
6. `Pilot Synopsis`.
7. `Season One Arc`.
8. `Where It Goes`.
9. `Characters`.
10. `Comps & Why This Show Now`.
11. Last-edited footer.

Empty sections are skipped. Runtime is hidden in series mode and replaced by episode length.

### Format Authority Requirement

`SynopsisDocumentView` should not decide Feature/Series behavior from `content.header.format` alone. It should receive or derive the normalized project format from `ProjectState.meta.format`, then use `content.header.format` only as display text.

## Data Model And Source Of Truth

### Canonical State

- `state.documents.synopsis.content` remains the canonical Synopsis content.
- `state.synopsis` remains a compatibility mirror until Sam and all legacy consumers are fully migrated.
- `state.meta.format` remains the only behavioral Feature/Series authority.
- `state.documents.synopsis.content.header.format` mirrors `state.meta.format` for document rendering/export compatibility.

### Schema Strategy

V1 should avoid unnecessary schema expansion.

Use the existing fields:

- Feature:
  - `header`
  - `logline`
  - `prose`
  - `qa`
  - optional `aiProductionImplications`
- Series:
  - `header`
  - `logline`
  - `series.seriesType`
  - `series.episodeLength`
  - `series.showOverview`
  - `series.pilot`
  - `series.seasonOneArc`
  - `series.futureSeasons`
  - `series.characters`
  - `series.compsAndWhyThisShowNow`

Allowed schema additions:

- Optional `seriesQa` only if manual series readiness checks are required.
- Optional story-coach view preferences only if needed to preserve UX state.

Disallowed schema changes:

- Do not make `header.format` the behavioral authority.
- Do not move Synopsis under Outline, Treatment, or Story Bible.
- Do not remove the legacy mirror until every dependent context path is migrated.

## Component Plan

Recommended new files:

- `client/src/lib/synopsisDeck.ts`
  - `FEATURE_SYNOPSIS_DECK`
  - `SERIES_SYNOPSIS_DECK`
  - prompt definitions
  - mapping helpers
- `client/src/lib/synopsisReadiness.ts`
  - feature readiness adapter around `content.qa`
  - derived series readiness checks
- `client/src/components/writing/synopsis/SynopsisQuestionCard.tsx`
  - renders question, helper, and input
  - never renders `documentLabel` as the card headline
- `client/src/components/writing/synopsis/SynopsisStoryCoachEditView.tsx`
  - dispatches Feature/Series decks based on `ProjectState.meta.format`
  - replaces the current direct template-section editor as the default Edit View
- `client/src/components/writing/synopsis/SynopsisReadinessReview.tsx`
  - plain-language checks only

Recommended edited files:

- `client/src/components/writing/SynopsisTab.tsx`
  - pass normalized project format through all mode decisions
  - keep `SynopsisViewToggle`
  - render story-coach edit view in Edit mode
- `client/src/components/writing/synopsis/SynopsisDocumentView.tsx`
  - accept `projectFormat` or equivalent normalized format
  - stop using `content.header.format` as the behavioral branch
- `client/src/components/writing/synopsis/SynopsisHeaderEditor.tsx`
  - keep the shared `ProjectFormatSelector`
  - treat format updates as project-format changes, not local header-only changes
- Current feature/series editor components
  - refactor or retire as needed
  - reusable sub-editors are fine, but template-heading orchestration should not remain the default Edit View
- `tests/components/Synopsis*.test.tsx`
  - update assertions around visible copy and format authority

## Migration And Data Safety

- Existing feature fields populate the new Feature deck by direct mapping.
- Existing series fields populate the new Series deck by direct mapping.
- Existing `synopsisComposeMode` preferences may remain in stored data, but the story-coach Edit View becomes the default product path.
- No content is deleted during the story-coach migration.
- Feature/Series flips preserve:
  - `content.prose`
  - `content.qa`
  - `content.series`
  - `content.logline`
  - metadata
- `clearSynopsis` behavior must be tested after the refactor because it resets both canonical `documents.synopsis` and legacy `state.synopsis`.
- Save/load must continue preserving document-only fields, especially `content.series`, `content.qa`, and `viewPreferences`.

## Sam Context

Sam should receive Synopsis as a professional pitch/readability surface, not as a list of UI fields.

Context priority:

- Top-level project title, genre, and `ProjectState.meta.format`.
- Logline.
- Feature prose and readiness signals in Feature mode.
- Series show overview, pilot synopsis, season arc, future-season promise, characters, and comps/positioning in Series mode.
- Outline summary only as supporting context.

Sam behavior:

- In Feature mode, Sam evaluates story clarity, causality, stakes, ending, concision, and external readability.
- In Series mode, Sam evaluates show engine, pilot promise, renewable conflict, season shape, character engine, and buyer-facing positioning.
- Sam should name missing fields plainly.
- Sam should mark unknown major decisions as `[NEEDS DECISION: ...]`.
- Sam must not invent missing ending, pilot details, season arcs, or future-season promises.
- Sam must not mutate project format or authored Synopsis content.

## Test Plan

### Deck Tests

Create `tests/lib/synopsisDeck.test.ts`:

- Feature deck contains all V1 prompt IDs in fixed order.
- Series deck contains all V1 prompt IDs in fixed order.
- Every prompt has a plain-language `question`.
- No prompt renders its `documentLabel` as its `question`.
- Every `mappingPath` resolves against `SynopsisDocumentContent`.
- Composite prompts write deterministic patches.

### Edit View Tests

Update or create component tests:

- Feature Edit View renders the plain-language questions.
- Feature Edit View does not show professional labels as card headlines.
- Series Edit View renders the plain-language questions.
- Series Edit View does not show professional labels as card headlines.
- Header/metadata edits still persist.
- Logline, prose, QA, and series fields still persist.
- Format selector updates `ProjectState.meta.format`, not only `content.header.format`.
- Switching formats preserves inactive content.
- Clear still performs the documented two-click destructive reset.

### Document View Tests

Update `tests/components/SynopsisDocumentView.test.tsx`:

- Document View branches from normalized project format, not `content.header.format` alone.
- Feature Document View renders title, metadata, logline, and synopsis prose.
- Series Document View renders show overview, pilot synopsis, season one arc, future seasons, characters, and comps when present.
- Empty sections are omitted.
- Readiness checks do not render in the professional document by default.

### Data Tests

Update existing data-layer tests:

- Save/load preserves feature content after the story-coach refactor.
- Save/load preserves series content after the story-coach refactor.
- Legacy mirror remains fresh after each `setSynopsisDocument` write.
- `content.header.format` mirrors `state.meta.format`.
- Old projects with `documents.synopsis.content.header.format === 'series'` still promote/normalize `state.meta.format` to `series` during migration.

### Sam Tests

Update `tests/lib/wpRouting.test.ts` and server route tests:

- Top-level project context exposes normalized `format`.
- Sam receives Feature synopsis content in Feature mode.
- Sam receives Series synopsis content in Series mode.
- `synopsis.format` remains only a transitional compatibility field if still present.
- Prompt/context tests assert Sam does not rely on local Synopsis header format as authority.

## Phased Rollout

### Sub-phase 1 - Deck Definitions And Tests

- Add `synopsisDeck.ts`.
- Add `synopsisReadiness.ts`.
- Add unit tests for deck integrity and mapping.
- No UI behavior changes yet.

### Sub-phase 2 - Story-Coach Edit View

- Add `SynopsisQuestionCard`.
- Add `SynopsisStoryCoachEditView`.
- Refactor `SynopsisTab` to render the story-coach Edit View for both Feature and Series.
- Preserve current Document View.

### Sub-phase 3 - Document View Authority Fix

- Make `SynopsisDocumentView` branch from normalized project format.
- Keep `header.format` as display/export mirror.
- Update tests for header-format conflict cases.

### Sub-phase 4 - Sam Context Upgrade

- Send Sam the richer `documents.synopsis.content` context for the active format.
- Keep legacy compatibility only where still required.
- Update routing and server tests.

### Sub-phase 5 - Verification

Required before final commit:

- `npm run test:run`
- `npm run check`
- `npm run build`
- Manual browser pass:
  - Feature story-coach cards render and save.
  - Series story-coach cards render and save.
  - Feature/Series flips preserve inactive content.
  - Document View renders a professional artifact in both modes.
  - Sam context sees the right format and active Synopsis material.

## Open Questions

These should be answered during implementation, not deferred into product drift:

1. Should Feature metadata remain inline at the top or become the first story-coach group?
2. Should Series get a stored `seriesQa` object, or are derived readiness checks enough for V1?
3. Should `synopsisComposeMode` remain visible anywhere after the story-coach Edit View ships?
4. Should AI production implications stay hidden until export/asset workflows, or should they become an optional advanced section?
5. Should Document View support a one-page density toggle later, or should export handle density?

## Acceptance Criteria

- A new writer can use Synopsis without knowing professional synopsis terminology.
- Edit View primarily asks plain-language story questions.
- Professional document labels appear in Document View, not as Edit View card headlines.
- Feature mode produces a complete external-facing movie synopsis.
- Series mode produces a buyer-facing show synopsis with pilot and season promise.
- Format authority comes from `ProjectState.meta.format`.
- Existing Synopsis content survives the redesign.
- Sam receives richer Synopsis context without gaining authority to silently edit project content.
