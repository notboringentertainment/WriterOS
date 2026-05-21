# WriterOS Project-Wide Format + Agent Context Protocol PRD

**Date:** 2026-05-16
**Status:** Canonical project-format protocol; foundation implemented on `feature/screenplay-editor-core`, ongoing reference for surface redesigns
**Branch context:** `feature/screenplay-editor-core`
**Related docs:** `docs/product/README.md`, `docs/product/structured-writing-surfaces-prd.md`, `docs/product/agent-workflow-prd.md`, `docs/product/persona-capability-layer-prd.md`, `docs/superpowers/plans/2026-05-16-synopsis-series-variant.md`

## Summary

The new Synopsis series variant proved that WriterOS needs first-class support for both feature and series projects. It also exposed a larger architecture issue: project format is currently being decided inside the Synopsis document at `documents.synopsis.content.header.format`, even though format affects Synopsis, Outline, Story Bible, Script context, and every specialist agent.

This PRD defines project format as project-wide state.

Core decision:

> `ProjectState.meta.format` is the canonical source of truth for project format.

V1 supports two project formats:

- `feature`
- `series`

Synopsis, Outline, and Story Bible should each show the same Feature/Series selector. Changing the selector anywhere updates `ProjectState.meta.format`. Script does not show this toggle in V1, but agents working on script pages still receive the project format in their context packet.

The product reason is simple: WriterOS should support both feature and series projects without making each surface invent its own local idea of format. The writer may primarily work in series, but the app should keep feature support strong and avoid forcing series assumptions onto every project.

## Current Problem

The latest Synopsis implementation added useful local behavior:

- `documents.synopsis.content.header.format` can be `feature` or `series`.
- `content.series` stores series-specific synopsis material.
- `SynopsisTab` routes between feature and series edit views by reading `content.header.format`.
- Sam/OpenSwarm context receives `synopsis.format` and `synopsis.showOverview`.

That solved the immediate Synopsis series need, but it made format surface-specific.

Problems with local Synopsis-only format:

- A project can be "series" in Synopsis while Outline and Story Bible still behave like generic or feature-biased surfaces.
- `ProjectState.meta.format` already exists and defaults to `feature`, but it is not the authority for the new selector.
- Agents receive format through the Synopsis context path, which makes format look like a Synopsis property rather than a project identity property.
- Story Bible becomes under-modeled for series, even though it is the surface most responsible for story engine, recurring arcs, future seasons, continuity, canon, and world rules.
- Outline remains too feature/Save-the-Cat-biased, even though series work needs pilot, episode, season, A/B/C story, engine, and serialized escalation awareness.
- Future surfaces could drift into their own local format toggles, creating contradictory project state.

The fix is not to remove series behavior from Synopsis. The fix is to move the format authority above every surface.

## Canonical Project Format Model

### Source Of Truth

`ProjectState.meta.format` is canonical.

Current state already includes:

```typescript
meta: {
  title: string
  genre: string
  format: string
  wordCount: number
  pageCount: number
}
```

V1 should treat `format` as a normalized project setting:

```typescript
type ProjectFormat = 'feature' | 'series'
```

Implementation can keep the stored field as `string` during migration so old localStorage records continue to load. Runtime behavior should normalize with a helper:

```typescript
function normalizeProjectFormat(value: unknown): ProjectFormat {
  return value === 'series' ? 'series' : 'feature'
}
```

Rules:

- `series` means a television or episodic/seasonal project.
- `feature` is the fallback for empty, unknown, legacy, or unsupported values.
- Future values such as `short`, `pilot`, `limited_series`, `ai_film`, or `custom` are out of V1 scope.
- Surface-local `format` fields may remain in document headers for compatibility and export display, but they must not drive behavior.

### Selector Contract

The Feature/Series selector should be a project-format control, not a surface-format control.

Each instance of the selector receives:

```typescript
value: ProjectFormat
onChange(next: ProjectFormat): void
```

Changing it updates `ProjectState.meta.format`.

All visible selector instances must stay in sync:

- Synopsis selector
- Outline selector
- Story Bible selector

Script does not get a visible selector in V1.

### Header Mirror Rule

Existing document header fields such as `documents.synopsis.content.header.format`, `documents.storyBible.content.cover.format`, and `documents.treatment.content.header.format` can be populated from `meta.format` for display/export compatibility.

They are mirrors only.

Behavioral reads should use `normalizeProjectFormat(state.meta.format)`.

## Surface Behavior

### Global Surface Rules

Synopsis, Outline, and Story Bible should show the same compact Feature/Series selector near the surface header. The selector should not imply the writer must fill every series-specific field. It simply sets the project's governing format so the surface can reveal appropriate structure and agents can receive the right lens.

Changing format must never delete authored content from either format.

### Synopsis

Current local behavior should be preserved but rewired to `meta.format`.

Feature mode:

- Shows the current feature Synopsis edit/document behavior.
- Emphasizes logline, complete feature story spine, prose synopsis, ending, causality, and concise external readability.
- Keeps feature QA checklist.

Series mode:

- Shows the existing series Synopsis edit/document behavior.
- Emphasizes show overview, pilot synopsis, season one arc, where it goes, characters, comps, and why this show now.
- Hides feature QA while preserving feature QA data.
- Uses `content.series`, lazy-initialized only when the project enters series mode and no series block exists.

Required change:

- `SynopsisTab` should derive active format from `state.meta.format`, passed as a prop or read through a shared state path.
- `documents.synopsis.content.header.format` should no longer decide whether feature or series edit view renders.
- Existing projects with `documents.synopsis.content.header.format === 'series'` should migrate/promote `state.meta.format` to `series`.

### Outline

Outline should become format-aware even before the full Outline redesign lands.

Feature mode should emphasize:

- acts
- sequences
- scenes
- protagonist goal
- midpoint
- act turns
- climax and resolution

Series mode should emphasize:

- pilot structure
- episode shape
- season arc
- A/B/C stories
- story engine
- character and world escalation across episodes
- serialized vs episodic pressure
- future setup without losing pilot clarity

V1 selector behavior:

- Outline shows the same Feature/Series selector.
- Changing it updates `meta.format`.
- Existing beat notes must remain untouched.
- The full outline schema redesign can follow after the selector authority is established.

### Story Bible

Story Bible is not exclusive to series. Feature projects also need character, world, tone, canon, and continuity support.

For series projects, Story Bible becomes more central:

- story engine
- pilot engine
- recurring arcs
- future seasons
- continuity
- canon
- world rules
- character and relationship evolution over time

Feature mode should emphasize:

- premise
- tone
- characters
- thematic engine
- world rules
- continuity needed to support one complete story

Series mode should emphasize:

- repeatable story engine
- character engines and recurring pressure
- pilot-to-series promise
- season-level arcs
- future season potential
- continuity and canon durability
- episode/season map

V1 selector behavior:

- Story Bible shows the same Feature/Series selector.
- Changing it updates `meta.format`.
- Current top-level Story Bible fields and future document-state Bible fields must be preserved.
- No agent or UI path should imply Story Bible only matters for series.

### Script

Script does not get the Feature/Series toggle in V1.

Reasons:

- The Script page is for formatted scene writing and line-level craft.
- Adding a format toggle there would compete with screenplay editing controls.
- Script formatting itself remains screenplay-style in V1 for both feature and series projects.

However:

- Script context sent to agents should include project format.
- Maya, Oliver, Casey, Zoe, Alex, and Writing Partner can use format to interpret pages differently.
- A series script can be discussed as a pilot, episode, cold open, act break, serialized beat, or recurring character/world pattern when the task asks for that.

## Agent Context Protocol

Agents must receive context shaped by three inputs:

1. Project format: `feature` or `series`.
2. Task: what the writer is asking now.
3. Persona: the specialist lens being invoked.

Format is project identity. It belongs near title, genre, and logline in every context packet.

### Shared Context Envelope

Every Writing Partner, Writer's Room, OpenSwarm bridge, and persona capability packet should include:

```typescript
project: {
  title?: string
  genre?: string
  format: ProjectFormat
  logline?: string
}
```

Current `ProjectContext` can continue to include surface sections, but format should move out of `synopsis` and into shared project identity.

Acceptable transition shape:

```typescript
interface ProjectContext {
  title?: string
  genre?: string
  format: ProjectFormat
  logline?: string
  synopsis: { ... }
  storyBible: { ... }
  script: ScriptContext
}
```

During migration, `synopsis.format` can remain as a deprecated compatibility field, but prompts and tests should assert the top-level format.

### Context Packing Rules

- Build context deterministically before model invocation.
- Put project format in the Writing Partner Brief.
- Let persona-specific context order continue to prune aggressively.
- Do not send every document field to every persona by default.
- Represent missing surfaces honestly.
- Do not let generated summaries, QA warnings, or agent suggestions become project canon unless the writer explicitly accepts them.
- Do not conflate writer-scoped Voice Profile with project-scoped Story Bible or format.

### Sam Protocol

Sam owns loglines, synopsis, pitch clarity, hook, stakes, and comps framing.

Feature context priority:

- project title, genre, format
- logline
- feature synopsis prose/sections
- ending/reveal status when available
- outline summary when useful
- comps and pitch-facing metadata

Series context priority:

- project title, genre, format
- series logline
- show overview
- pilot synopsis
- season one arc
- where it goes/future season promise
- comps and why this show now
- core characters when present

Behavior:

- In feature mode, Sam judges completeness, causality, stakes, and external readability of one complete story.
- In series mode, Sam judges show engine, pilot promise, renewable conflict, season shape, and pitch clarity.
- Sam should not force a series synopsis into a feature one-page structure.

### Oliver Protocol

Oliver owns structure, causality, pacing, escalation, beat function, and scene/episode architecture.

Feature context priority:

- format
- outline mode and units
- acts/sequences/scenes
- story spine
- synopsis and script scenes as supporting context

Series context priority:

- format
- pilot structure
- episode or season map
- A/B/C story threads
- story engine
- serialized escalation
- act breaks and hooks
- recurring character/world turns

Behavior:

- In feature mode, Oliver should evaluate acts, sequences, midpoint, reversals, scene function, and payoff.
- In series mode, Oliver should evaluate pilot engine, episode durability, season arc, escalation across installments, and whether story threads can renew.
- Oliver should not assume Save the Cat is the only model.

### Casey Protocol

Casey owns character psychology, want/need/wound, relationships, emotional truth, theme-through-character, and character voice standards.

Feature context priority:

- format
- character sheets
- protagonist/antagonist pressure
- emotional arc across one complete story
- theme and tone
- relevant script behavior

Series context priority:

- format
- ensemble roles
- recurring wants/needs/wounds
- character engines
- season arcs
- relationship pressure across episodes
- contradictions that can sustain long-term story

Behavior:

- In feature mode, Casey should focus on the emotional change across the whole movie.
- In series mode, Casey should distinguish episode movement from durable series engines.
- Casey should not treat open future-season character possibilities as locked canon.

### Zoe Protocol

Zoe owns world-building, rules, setting logic, mythology, continuity, canon, and production consistency.

Feature context priority:

- format
- setting
- world rules
- continuity-sensitive story facts
- genre logic
- relevant script/outline facts

Series context priority:

- format
- world engine
- canon rules
- recurring locations/systems
- continuity log when available
- mythology reveal cadence
- future season implications
- AI production continuity when relevant

Behavior:

- In feature mode, Zoe protects believability and internal logic across one contained story.
- In series mode, Zoe protects durable canon and repeatable world logic across episodes and seasons.
- Research capabilities remain bounded and source-backed per the Persona Capability Layer PRD.

### Maya Protocol

Maya owns dialogue, character voice, subtext, rhythm, and line-level performance.

Feature context priority:

- format
- selected script/dialogue excerpt first
- character voice notes
- relevant character sheets
- tone and style standards

Series context priority:

- format
- selected episode/pilot excerpt first
- recurring character voices
- ensemble voice contrast
- dialogue rules from Story Bible
- pilot voice vs series voice consistency

Behavior:

- In feature mode, Maya can judge whether dialogue serves scene and arc within a contained draft.
- In series mode, Maya should also judge whether voices are repeatable, distinctive, and sustainable across episodes.
- Maya should never give dialogue advice without acknowledging when actual dialogue text is missing.

### Alex Protocol

Alex owns draft readiness, process, blockers, momentum, development order, and treatment-to-pages strategy.

Feature context priority:

- format
- project progress indicators
- outline readiness
- synopsis/treatment readiness
- script progress and current blockers
- open questions

Series context priority:

- format
- pilot readiness
- series engine clarity
- Story Bible completeness
- season/episode planning status
- production and process blockers

Behavior:

- In feature mode, Alex helps move from concept, synopsis, outline, treatment, and pages toward a complete draft.
- In series mode, Alex helps separate pilot work from series bible work so the writer does not try to solve every future season before drafting.
- Alex should use format to recommend the next practical writing surface.

## Data Safety Rules

1. `ProjectState.meta.format` is the only behavioral authority for project format.
2. Feature/Series flips are non-destructive.
3. Switching to `series` may lazy-initialize `documents.synopsis.content.series` if it is absent.
4. Switching back to `feature` must not delete `documents.synopsis.content.series`.
5. Switching to `series` must not delete feature synopsis prose, QA, header data, outline beats, Story Bible data, or script pages.
6. Surface-local format fields are compatibility mirrors only.
7. Existing header format strings should continue to load; do not make document header schemas reject old values during this migration.
8. Empty, unknown, or unsupported format values normalize to `feature`.
9. Existing projects where Synopsis was set to `series` must promote the project format to `series` on migration.
10. Agent context is derived. Agents cannot silently mutate `meta.format`, documents, canon, or surface content.
11. Story Bible canon must remain writer-authored or explicitly accepted by the writer.
12. Voice Profile remains writer-scoped and project-agnostic. It must not be treated as project format or Story Bible canon.
13. Script does not get a V1 format toggle, but script content must survive all project-format flips.

## Migration Rules

Migration should preserve the local Synopsis series work while establishing project-wide authority.

Recommended V1 normalization:

```typescript
const metaFormat = normalizeProjectFormat(raw.meta?.format)
const synopsisHeaderFormat = normalizeProjectFormat(raw.documents?.synopsis?.content?.header?.format)
const projectFormat =
  raw.meta?.format === 'series' || raw.documents?.synopsis?.content?.header?.format === 'series'
    ? 'series'
    : 'feature'
```

Practical rules:

- If `state.meta.format === 'series'`, keep `series`.
- If `documents.synopsis.content.header.format === 'series'`, promote `state.meta.format` to `series`.
- Otherwise normalize to `feature`.
- Do not delete or rewrite `documents.synopsis.content.series` during migration.
- Do not create `content.series` for every feature project.
- After migration, UI behavior reads `state.meta.format`.
- After migration, document header `format` fields may be updated from `meta.format` only as mirrors.
- Existing tests that expect empty/legacy synopsis header format to render as Feature can remain valid, but they should no longer prove project-format authority.

## Tests And Acceptance Criteria

### Data Model

- `defaultProjectState().meta.format` remains `feature`.
- `normalizeProjectFormat('feature')` returns `feature`.
- `normalizeProjectFormat('series')` returns `series`.
- Empty, unknown, or legacy values normalize to `feature`.
- Migration promotes `documents.synopsis.content.header.format === 'series'` to `meta.format === 'series'`.
- Migration preserves `documents.synopsis.content.series` byte-equivalent.
- Format flips do not delete feature or series Synopsis content.

### Surface UI

- Synopsis, Outline, and Story Bible each render a Feature/Series selector.
- All selectors read from the same `meta.format` value.
- Changing the selector in Synopsis updates Outline and Story Bible when navigating.
- Changing the selector in Outline updates Synopsis and Story Bible when navigating.
- Changing the selector in Story Bible updates Synopsis and Outline when navigating.
- Script renders no Feature/Series selector in V1.
- Synopsis routes feature/series edit views from project format, not `content.header.format`.
- Outline and Story Bible preserve existing content when project format changes.

### Agent Context

- `buildProjectContext` emits top-level `format`.
- Server `projectContextSchema` accepts top-level `format`.
- `/api/wp-chat` maps format into `StoryMemory` or the context summary used by persona prompts.
- OpenSwarm Writing Partner prompt includes project format from the top-level context.
- Persona capability request schema includes project format.
- Zoe research prompts include project format without treating it as a citation/source.
- Sam, Oliver, Casey, Zoe, Maya, and Alex prompts or context summaries can see project format.
- Existing `synopsis.format` compatibility field can remain temporarily, but tests should assert top-level format.

### Persona Behavior

- Sam receives series synopsis context when format is `series`.
- Oliver receives format before evaluating outline structure.
- Casey receives format before judging character arc scope.
- Zoe receives format before judging continuity/canon scope.
- Maya receives format alongside script excerpt/dialogue context.
- Alex receives format alongside progress/readiness context.
- Missing-context messages name the relevant WriterOS surface rather than implying hidden access.

### Safety And Regression

- `npm run test:run` passes after implementation.
- `npm run check` passes after implementation.
- `npm run build` passes after implementation.
- Manual pass verifies format flips across Synopsis, Outline, and Story Bible without data loss.
- Manual pass verifies Script has no toggle but agent context still includes format.

## Recommended Implementation Sequence

### 1. Project Format Authority Slice

Implement this first.

Tasks:

- Add a shared or client-local `ProjectFormat` type and `normalizeProjectFormat` helper.
- Add a `setProjectFormat(next: ProjectFormat)` path in `useProjectState`, likely wrapping `setMeta({ format: next })`.
- Update migration so existing Synopsis `header.format === 'series'` promotes `meta.format` to `series`.
- Update `buildProjectContext` to emit top-level `format` from `state.meta.format`.
- Update server schemas and prompt builders to accept and display top-level format.
- Keep `synopsis.format` only as temporary compatibility.
- Add tests around normalization, migration, context shape, and server schema acceptance.

This slice should not redesign Outline or Story Bible yet.

### 2. Rewire Synopsis To Project Format

Tasks:

- Pass `projectFormat` and `onProjectFormatChange` into `SynopsisTab`.
- Route feature/series edit views from `projectFormat`.
- Keep lazy-init of `content.series` when entering series.
- Mirror `meta.format` into `content.header.format` only if needed for display/export compatibility.
- Update Synopsis tests so project format controls the view.

### 3. Add Shared Selector To Outline And Story Bible

Tasks:

- Extract a small reusable Feature/Series selector component.
- Render it in Synopsis, Outline, and Story Bible headers.
- Wire Outline and Story Bible selectors to `meta.format`.
- Keep existing Outline and Story Bible content shapes untouched.
- Add component tests proving cross-surface synchronization through shared state.

### 4. Upgrade Agent Context Protocol

Tasks:

- Update `ProjectContext`, `StoryMemory`, OpenSwarm bridge, and persona capability schemas to carry top-level format.
- Update persona context summaries so each specialist gets format in their brief.
- Add focused tests for Sam, Oliver, Casey, Zoe, Maya, and Alex context visibility.

### 5. Format-Aware Surface Redesigns

Tasks:

- Redesign Outline around feature vs series structure needs.
- Redesign Story Bible around feature vs series canon/story-engine needs.
- Preserve the Structured Writing Surfaces PRD sequence, but let project format guide each redesign.

The first implementation should be the project-format authority slice. That creates the foundation safely before any surface-specific redesign work expands the blast radius.
