# WriterOS Structured Writing Surfaces PRD

**Date:** 2026-05-10
**Status:** Living surface-roadmap PRD; May 18 product alignment applied
**Branch context:** `feature/screenplay-editor-core`
**Current baseline:** `b74c711 docs: add writer voice profile PRD`
**Related docs:** `docs/product/README.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/outline-story-coach-redesign-prd.md`, `docs/product/writeros-future-work-prd.md`, `docs/product/agent-workflow-prd.md`, `docs/product/project-identity-script-context-prd.md`
**Reference input:** `/Users/ben/Downloads/ai-film-writing-templates 2`

## Summary

WriterOS currently has the right high-level writing surfaces, but the structured surfaces are too thin and generic. Synopsis, Outline, and Story Bible are implemented as simple guided forms, not as professional story-development documents. This makes the app feel like it is asking for AI-imagined fields rather than helping the writer build real artifacts used in screenwriting, television development, pitching, revision, and AI filmmaking continuity.

This PRD redefines the non-script writing surfaces as four distinct professional document types:

- **Synopsis:** compact, complete, reader-facing story summary.
- **Outline:** writer-facing structural blueprint.
- **Treatment:** cinematic prose version of the full story.
- **Story Bible:** source-of-truth system for premise, tone, world, characters, rules, continuity, and future potential.

The goal is not to add more empty boxes. The goal is to make each surface feel like a real writing tool: mode-aware, editable, readable, exportable, and useful to both human writers and WriterOS agents.

## May 18 Product Alignment

This PRD now sits under the current product standard defined in `docs/product/README.md` and `docs/product/outline-story-coach-redesign-prd.md`:

> WriterOS writing surfaces ask plain-language story questions, translate the answers into professional structure behind the scenes, and render studio-presentable documents the writer can confidently share.

The earlier wording in this PRD sometimes describes professional "templates," "modes," "fields," and "sections" as if they should be visible directly to the writer in Edit View. That is no longer the desired user experience.

Canonical interpretation:

- **Edit View:** a story-assessment/interview surface. Prompts should be plain-language questions that pull story material out of the writer.
- **Hidden structure:** WriterOS maps answers into stable professional schema fields, structural labels, QA checks, and agent context.
- **Document View:** WriterOS renders the hidden structure and authored prose as a polished professional artifact.
- **Agent context:** specialists may receive professional labels and derived context, but those labels should not dominate the writer-facing Edit View.

This alignment applies explicitly to Synopsis and Story Bible as well as Outline. Treatment should be designed from this standard from day one.

## Research Basis

This PRD is grounded in the user's researched template package:

- `references/synopsis-best-practices-template.md`
- `references/outline-best-practices-template.md`
- `references/treatment-best-practices-template.md`
- `references/story-bible-best-practices-template.md`
- `references/transformation-playbook.md`

The package reflects external industry guidance, including:

- Final Draft's distinction between outlines, treatments, and scriptments.
- StudioBinder and Filmustage synopsis guidance around concise, causal, complete summaries.
- BBC Writers guidance that pitches and treatments should reveal major twists rather than withhold the story.
- UCLA treatment guidance: third-person present tense, visible/hearable action, minimal unfilmable interiority, and no camera directions.
- Final Draft, Scriptation, ScriptFella, and real bible examples showing that story bibles are both pitch/vision documents and living continuity archives.

Product conclusion:

WriterOS should treat these as separate document types with separate purposes, not as interchangeable story fields.

## Current State

Original baseline implementation when this PRD was first drafted:

- `SynopsisTab` has logline, setup, act one break, midpoint, act two break, and resolution.
- `OutlineTab` has a fixed Save the Cat beat list with one notes field per beat.
- `StoryBibleTab` has characters, setting, tone anchors, theme, voice notes, and world rules.
- `ProjectState` stores these surfaces in narrow shapes:
  - `synopsis.logline`
  - `synopsis.sections`
  - `outline.beats`
  - `storyBible.characters`
  - `storyBible.world`
  - `storyBible.themes`
  - `storyBible.rules`
- Routing already maps:
  - Synopsis to Sam
  - Outline to Oliver
  - Story Bible character/theme/tone work to Casey
  - Story Bible world/rules work to Zoe

What works:

- The top-level surface taxonomy is directionally right.
- Agent routing by surface is useful.
- The structured state is easy to test and pass into prompts.
- The app preserves Writing Partner and Writer's Room transcript separation.

What does not work:

- The fields are too generic for professional use.
- Synopsis is modeled as a beat worksheet instead of a prose summary.
- Outline is locked to one structure model.
- Story Bible is missing core bible concepts: one-page pitch, story engine, character index, relationships, locations, continuity log, open questions, and production continuity.
- Treatment, which should be a major bridge between idea/outline and script, does not exist yet.
- There is no Document View, so structured surfaces do not read like authored artifacts.
- There is no template-mode system for feature, short, pilot, episodic series, limited series, or AI film.

Current branch deltas since the original baseline:

- `ProjectState.documents` exists for Synopsis, Outline, Treatment, and Story Bible.
- Synopsis has been redesigned around `documents.synopsis`, Edit View / Document View, and feature/series content preservation.
- Project format authority has moved to `ProjectState.meta.format`.
- Outline is now governed by `docs/product/outline-story-coach-redesign-prd.md`.
- Story Bible still needs its own redesign PRD before implementation continues.

## Problem

WriterOS is a writing-first studio, but its non-script surfaces currently feel like generic AI worksheets. That damages the product in several ways:

- Professional writers cannot use the surfaces as real development documents.
- New writers are taught an oversimplified version of what the documents are.
- Agents receive shallow context because the app stores shallow documents.
- The Story Bible cannot function as durable canon or continuity.
- The Outline cannot diagnose causality, escalation, scene function, or sequence logic deeply.
- The Synopsis cannot become a clean reader-facing artifact.
- Treatment work has nowhere to live, so broad story planning is forced into the wrong surfaces.

The product needs a document architecture upgrade before more durable memory, export, or advanced agent workflows are built.

## Goals

- Make Synopsis, Outline, Treatment, and Story Bible professional-grade document surfaces.
- Preserve the distinction between document types.
- Add progressive structure without overwhelming the writer.
- Support both Edit View and Document View for non-script surfaces.
- Make each surface mode-aware by project format and intended use.
- Store user-authored document source, not just prompt helper fields.
- Keep AI production notes separate from core writing documents.
- Improve agent context quality by giving each specialist the right document structure.
- Avoid reintroducing stale backend or prototype scaffolds.

## Non-Goals

- No backend storage implementation in this PRD.
- No cloud sync, authentication, Drizzle, Neon, Replit, Passport, or session scaffold.
- No PDF, DOCX, or print-perfect export in the first implementation slice.
- No autonomous multi-agent orchestration.
- No forced linear workflow from synopsis to outline to treatment to script.
- No requirement that every project fill every field.
- No model-generated canon written into a project without explicit user approval.
- No collapse of Synopsis, Outline, Treatment, and Story Bible into one mega-document.
- No Voice Profile implementation in this PRD. Voice Profile remains writer-scoped and separate.

## Product Principles

1. **Real document types, not generic fields.**
   Each surface should match the professional job it claims to do.

2. **The app should teach by structure, not lecture.**
   Writers should understand the document by using it. Guidance should be compact and contextual.

3. **Edit View is for construction; Document View is for reading.**
   A writer should be able to fill structured fields, then review the result as a coherent artifact.

4. **Progressive depth beats form overload.**
   Core fields should be immediately usable. Advanced, continuity, and AI production sections should be accessible without dominating the first screen.

5. **Authored source beats generated summary.**
   The writer's documents are source of truth. Agent summaries, retrieval packs, and QA diagnostics are derived unless explicitly saved.

6. **AI filmmaking support belongs in annexes.**
   Production continuity, asset prompts, reference images, and generation constraints are useful, but they must not crowd out story documents.

7. **Every surface should improve agent intelligence.**
   Sam, Oliver, Casey, Zoe, Maya, Alex, and the Writing Partner should receive richer, cleaner context because the documents are better.

8. **A suite, not a pipeline.**
   Some projects start with script pages. Some start with a bible. Some never need a treatment. WriterOS should support the writer's path.

## Document Taxonomy

| Surface | Primary job | Reader | Style | Detail level | Primary helper |
| --- | --- | --- | --- | --- | --- |
| Synopsis | Explain the whole story quickly | External reader, producer, contest, collaborator | Compressed prose | Broad story spine | Sam |
| Outline | Build and test structure | Writer and close collaborator | Functional structure | Beat, sequence, scene, episode, or season | Oliver |
| Treatment | Tell the full story in cinematic prose | Writer, producer, collaborator, agent | Present-tense prose | Major scenes, turns, arcs, ending | Alex |
| Story Bible | Preserve source of truth | Writer, room, production, AI continuity | Reference document | Premise, world, characters, canon, continuity | Casey/Zoe |
| Script | Execute pages | Writer, reader, production | Screenplay format | Scenes, action, dialogue | Writing Partner/Maya |

## Surface Requirements

### Synopsis

Detailed current authority: `docs/product/synopsis-story-coach-redesign-prd.md`.

Purpose:

- A compact, complete overview of the story.
- Reader-facing.
- Usually one page or less unless a submission target says otherwise.
- Reveals the ending when known.

Current issue:

- The current synopsis fields are really structure checkpoints. They can be useful internally, but they do not produce a proper synopsis artifact.

Recommended V1 sections:

- Header metadata:
  - title
  - writer
  - format
  - genre
  - target runtime
  - optional comps
- Logline:
  - protagonist
  - goal
  - obstacle
  - stakes
  - hook
- Synopsis prose:
  - opening paragraph
  - escalation paragraph
  - middle/reversal paragraph
  - climax paragraph
  - resolution paragraph
- Synopsis QA:
  - protagonist named early
  - goal clear
  - obstacle clear
  - stakes clear
  - ending revealed
  - paragraphs connect causally
  - tone matches intended project
  - no unnecessary subplot or backstory
- Optional AI production implications:
  - visually important sequence
  - continuity-sensitive character moment
  - difficult world/VFX element
  - likely reference image needs

#### Series mode

Enabled by the shared project-format selector (`ProjectState.meta.format === 'series'`). `documents.synopsis.content.header.format` may mirror the project format for display/export compatibility, but it is not the behavioral authority.

Eight sections in stable composition order:

1. Logline
2. Show Overview — renewable conflict, world, and tone.
3. Pilot Synopsis — pilot logline + pilot prose body.
4. Season One Arc — season-level story arc prose.
5. Where It Goes — future-season summaries (variable list, no auto-seed).
6. Characters — variable list with name, role, bio, and arc-per-season entries.
7. Comps & Why This Show Now — optional comp set and positioning statement.
8. Metadata block — header fields including Series Type and Episode Length.

Header additions when `format === 'series'`:

- **Series Type:** `limited` or `ongoing`.
- **Episode Length:** `half_hour`, `hour`, or `other`.
- Target Runtime row hidden (replaced by Episode Length).

QA checklist:

- Hidden in series mode. Feature QA data in storage is preserved untouched.

Format-flip safety:

- Feature ↔ series flips are non-destructive. Both `content.prose` / `content.qa` (feature) and `content.series` (series) are preserved in storage across every flip.
- `content.series` is lazy-initialized only when the user first switches to series mode and it is currently absent. Feature-only projects never gain a `series` key.

Clear button:

- Wipes BOTH feature AND series blobs (existing `clearSynopsis` semantics). A future "clear only series" affordance is a separate slice.

Sam context in this slice:

- Sam receives project format from top-level project context. During transition, compatibility fields such as `synopsis.format` and `synopsis.showOverview` may remain, but they should be treated as derived/mirrored context rather than a separate Synopsis-owned format authority.
- Pilot synopsis, season arc, future seasons, characters, and comps are not exposed to AI until a later context-pack upgrade explicitly includes them.

Edit View behavior:

- Offer a guided prose builder rather than only independent boxes.
- Let the writer choose:
  - single prose field
  - paragraph builder
- Keep the existing logline, but upgrade the rest.
- Keep historical beat-style fields only as migration/source notes or optional "structure helper," not the main model.

Document View behavior:

- Render as a clean synopsis:
  - header
  - logline
  - one continuous `Synopsis` section
  - optional QA hidden or shown separately

Agent behavior:

- Sam should diagnose whether the synopsis is complete, causal, concise, and externally readable.
- Sam should not treat synopsis as a mystery-box pitch.
- Sam should call out missing ending as `[NEEDS DECISION: ending]` rather than inventing one.

### Outline

Purpose:

- A structural blueprint for the writer.
- Helps test sequence, causality, escalation, character turns, and scene function.
- Can be high-level or scene-by-scene depending on project stage.

Current issue:

- The current fixed Save the Cat beat list is one useful mode, but it is not the outline model.
- Each beat has only `notes`, so the app cannot reason deeply about conflict, turn, outcome, or why the next beat follows.

May 18 supersession:

The older mode-selector/reorderable-index-card direction below has been superseded by `docs/product/outline-story-coach-redesign-prd.md`. Do not implement a V1 Outline mode selector, drag/reorder workflow, or visible Save-the-Cat beat-name surface from this PRD.

Canonical V1 Outline direction:

- Feature and Series decks are selected by the shared project format at `ProjectState.meta.format`.
- Edit View asks fixed plain-language story questions.
- Structural labels such as "Inciting incident," "Midpoint," or "All Is Lost" do not appear as card headlines in Edit View.
- The fixed deck order is part of the teaching/coaching model.
- Writer answers persist in `documents.outline.content`.
- Legacy `outline.beats` remains a derived mirror only while Oliver/server context still needs it.
- Feature projects use the 19-card feature deck from the Outline Story-Coach PRD.
- Series projects use the 15-base-card series deck plus episode map repeater from the Outline Story-Coach PRD.
- V1 must not ship a user-visible state where Feature has the new deck and Series still shows the legacy Save-the-Cat beat-title UI.

> **SUPERSEDED.** The earlier "Recommended hidden/shared fields" schema in this PRD — including a user-visible Structure-model dropdown (three-act / five-act / eight-sequence / Save the Cat / episode acts / custom), an Outline-units table with `number / act / title / location / characters / what happens / conflict / turn / consequence / why next / linked script scenes / draft notes`, and an "Optional AI production columns" block — has been removed. The canonical hidden mapping for V1 is specified in `docs/product/outline-story-coach-redesign-prd.md` (Feature 19-card deck, Series 15-card deck + episode map, story-spine fields, schema migration contract). Do not reintroduce a user-visible mode selector, drag/reorder unit table, or visible Save-the-Cat beat names from this PRD. Git history preserves the previous text if needed for archaeology.

Edit View behavior:

- Ask plain-language story questions as the primary card headlines.
- Hide professional structural labels except in developer mappings, tests, agent context, and Document View.
- Preserve existing beat notes through migration into the new card answers.
- Keep diagnostics derived and supportive; do not turn the edit surface into a craft exam.

Document View behavior:

- Render a studio-presentable outline from the hidden professional mapping: story spine, format-appropriate act/sequence/episode structure, plain-language card answers grouped under their professional headings, and optional scene table. Specific section composition and labels are owned by `docs/product/outline-story-coach-redesign-prd.md`.

Agent behavior:

- Oliver should evaluate structure through change, pressure, causality, pacing, and escalation.
- Oliver should know the project format and the hidden professional mapping behind the writer's plain-language answers.
- Oliver should not assume every project uses Save the Cat.

### Treatment

Purpose:

- A prose document that tells the full story before or alongside the script.
- Longer and more vivid than a synopsis.
- Less mechanically structured than an outline.
- Useful for developing, pitching, diagnosing readiness, and giving agents the full dramatic flow.

Current issue:

- Treatment is referenced as future work but does not exist.
- Without it, WriterOS forces full-story prose planning into Synopsis or Outline, which weakens both.

May 18 direction:

- Treatment is a good candidate to design cleanly from the current standard because it is not replacing a heavily-used existing surface.
- Its Edit View should still be plain-language and story-assessment driven, not a visible treatment-template checklist.
- Its hidden mapping should produce cinematic present-tense prose that feels appropriate to share with a producer, collaborator, or studio reader.
- Add Treatment only through a dedicated PRD or implementation slice; do not opportunistically add it while fixing Synopsis, Outline, or Story Bible.

Recommended V1 sections:

- Header metadata:
  - title
  - writer
  - format
  - genre
  - version
  - date
- Logline
- Concept:
  - premise
  - tone
  - theme
  - emotional promise
- Main characters:
  - role
  - external want
  - internal need
  - flaw/wound
  - secret/contradiction
  - arc
  - relationship pressure
- Treatment prose:
  - opening
  - act one
  - act two
  - act three
  - or custom prose sections
- Visual and tonal language:
  - overall tone
  - visual world
  - recurring images/motifs
  - music/sound feeling
  - pacing
  - genre rules
  - comps/references
- Open questions:
  - story decisions
  - character decisions
  - world/mythology decisions
  - production decisions
- Optional AI production implications:
  - visual sequence risks
  - character continuity risks
  - location continuity risks
  - VFX/generation challenges
  - reference assets needed

Edit View behavior:

- Treatment should support prose-first writing.
- Sections should be collapsible and reorderable.
- The writer should be able to write long-form text comfortably.
- AI production notes should be separated from prose.

Document View behavior:

- Render as a readable treatment.
- No form chrome.
- No agent notes mixed into prose.

Agent behavior:

- Alex is the primary helper because treatment bridges concept, structure, process, and draft readiness.
- Sam may compress treatment into synopsis/logline.
- Oliver may map treatment prose back to structure.
- Casey, Maya, and Zoe may use treatment passages through their lenses.

### Story Bible

Purpose:

- The project source of truth.
- Stores premise, tone, world, characters, story engine, rules, canon facts, continuity, future potential, and production-sensitive details.
- For series, it also proves the concept can generate ongoing stories.

Current issue:

- The current Story Bible is closer to a starter note page.
- It lacks the source-of-truth and continuity architecture that makes a bible valuable.

May 18 direction:

- Story Bible must follow the same plain-language story-assessment standard as Outline.
- Do not expose the full professional bible template as a giant form in V1.
- Edit View should ask practical questions that help the writer define premise, tone, character engines, world rules, canon, open questions, and series durability without requiring bible jargon.
- Professional labels such as Pitch Bible, Living Bible, canon log, story engine, and continuity architecture may appear in hidden mappings, Document View, and advanced controls only where they help rather than intimidate.
- A dedicated Story Bible redesign PRD is required before implementation continues on this surface.

Recommended V1 sections:

- Cover and identity:
  - title
  - writer/creator
  - format
  - genre
  - version
  - date updated
  - status: pitch / development / production / living canon
- One-page pitch:
  - logline
  - in a nutshell
  - why this story matters
  - core promise
  - central question
  - what makes it different
- Tone and style:
  - tone words
  - comps
  - anti-comps
  - pacing rules
  - humor rules
  - violence/intensity rules
  - dialogue style
  - visual style
  - sound/music style
  - what this project must never feel like
- World:
  - time period
  - geography
  - social world
  - economic reality
  - political/power structure
  - technology level
  - rules
  - public history
  - hidden history
  - mythology reveals
- Characters:
  - character index
  - detailed character sheets
  - wants/needs/flaws/secrets/contradictions
  - arcs
  - relationship pressure
  - behavioral anchors
  - speech patterns
  - never write them as
  - continuity facts
- Story engine:
  - feature propulsion
  - series engine
  - pilot engine
  - season arc
  - future season potential
  - what keeps the premise alive
- Episode, sequence, or chapter map:
  - unit
  - title
  - story event
  - character turn
  - world reveal
  - continuity additions
  - future setup
- Locations:
  - story function
  - visual identity
  - rules of the space
  - associated characters
  - events
  - continuity facts
- Continuity log:
  - date
  - category
  - fact
  - source scene/episode
  - locked status
  - notes
- Open questions:
  - story
  - character
  - world
  - tone
  - production
- Optional AI production annex:
  - global visual identity
  - character prompt blocks
  - location prompt blocks
  - asset registry
  - continuity QA

Edit View behavior:

- Use sections and sub-sections, not one long flat form.
- Provide two bible modes:
  - **Pitch Bible:** curated, readable, persuasive.
  - **Living Bible:** complete, searchable, operational.
- Allow advanced sections to be hidden by default.
- Character sheets should support both compact cards and expanded detail.
- Continuity log should feel like a table, not a paragraph field.

Document View behavior:

- Render as either:
  - Pitch Bible view
  - Living Bible view
- Keep AI production annex visually separate.

Agent behavior:

- Casey owns character psychology, theme-through-character, emotional truth, relationships, and voice.
- Zoe owns world rules, continuity, setting logic, mythology, and production consistency.
- Writing Partner can use the bible as global project grounding.
- Agents should distinguish locked canon from open questions.

## UX Model

### Two Views Per Surface

Every non-script writing surface should support:

- **Edit View:** plain-language story-assessment prompts, with controls appropriate to the content. The writer should answer human questions, not decode a professional template.
- **Document View:** a readable artifact assembled from the same authored source.

Script remains its own formatted document surface and does not need the same toggle in V1.

### Progressive Disclosure

Each surface should show:

- **Core:** minimal fields needed to make the document useful.
- **Advanced:** deeper craft, mode-specific, or professional fields.
- **Continuity:** canon facts, locked details, contradiction risks.
- **AI Production:** optional annex for generated media workflows.

Default UI should open on Core. Empty advanced sections should not make the app feel unfinished.

### Mode Awareness

Project format should influence the hidden professional mapping and the visible deck/surface shape.

V1 project formats:

- Feature
- Series

Future values such as Short, Pilot, Limited Series, AI Film, and Custom are out of V1 scope unless a later PRD explicitly adds them.

Examples:

- A feature outline should emphasize acts/sequences/scenes.
- A pilot/series outline should emphasize episode engine, A/B/C stories, season arc, and hooks.
- A series story bible should emphasize repeatable engine and future season potential.
- An AI film bible should surface continuity annexes earlier.

### Surface Header

Each surface should include compact orientation:

- What this document is for.
- Who it is for.
- Which helper is most relevant.
- Whether it is a pitch-facing, writer-facing, prose, or reference document.

The copy must be short enough that experienced writers can ignore it.

### Document QA

Each surface should eventually support a QA panel:

- Synopsis QA: complete, causal, ending revealed, concise.
- Outline QA: every beat turns, stakes escalate, scenes have function.
- Treatment QA: whole story, present tense, visible action, ending known.
- Story Bible QA: canon completeness, contradictions, locked/open facts.

QA should not block writing. It should behave like a craft checklist.

## Data Model Direction

Current `ProjectState` should evolve from narrow feature-specific fields into authored document states.

Recommended direction:

```typescript
interface ProjectState {
  meta: ProjectMeta
  script: ScriptState
  documents: {
    synopsis: SynopsisDocumentState
    outline: OutlineDocumentState
    treatment?: TreatmentDocumentState
    storyBible: StoryBibleDocumentState
  }
  agents: AgentState
  memory: ProjectMemoryState
}
```

Compatibility concern:

- Existing `synopsis`, `outline`, and `storyBible` top-level fields are live.
- Migration must preserve all existing user data.
- A transition period can keep both shapes or map legacy selectors into the new `documents` shape.

Recommended document wrapper:

```typescript
interface AuthoredDocumentState<TContent> {
  version: number
  mode: string
  updatedAt: string
  content: TContent
  viewPreferences?: {
    activeView?: 'edit' | 'document'
    collapsedSections?: string[]
    visibleDepth?: 'core' | 'advanced' | 'continuity' | 'ai_production'
  }
  qa?: {
    lastCheckedAt?: string
    warnings: DocumentWarning[]
  }
}
```

Important boundary:

- Document source is authored state.
- Agent summaries and retrieval packs are derived.
- QA warnings are derived unless the user saves them as notes.
- AI-generated suggestions must not become canon until accepted.

## Agent Context Implications

The current deterministic script retrieval foundation should remain intact. This PRD extends context quality for non-script surfaces.

### Writing Partner

Receives:

- compact project brief
- active surface summary
- document completeness status
- title/logline/premise
- current selected document excerpt if applicable

Behavior:

- Helps the writer decide which document or specialist is relevant.
- Names missing decisions without inventing them.
- Can suggest moving material to the correct surface.

### Sam

Receives:

- synopsis document
- logline
- outline/treatment summary when available
- pitch-facing metadata

Behavior:

- Improves clarity, compression, causality, and external readability.
- Flags hidden endings, vague stakes, or marketing copy.

### Oliver

Receives:

- `ProjectState.meta.format` (Feature or Series)
- plain-language Outline answers from `documents.outline.content`
- hidden professional mapping: story spine, feature deck units, series engine, season arc, episode map, and derived structural labels
- legacy `outline.beats` mirror only while Oliver/server context still depends on it
- treatment/script scene references when available

Behavior:

- Diagnoses structure through conflict, change, consequence, and "why next."
- Reasons about the project's professional structure via the hidden mapping; does not surface a user-visible "outline mode" selector or propose switching outline modes. Project format changes go through `ProjectState.meta.format`, not Oliver.

### Casey

Receives:

- character sheets
- relationship pressure
- themes
- tone/voice notes
- relevant script/treatment behavior

Behavior:

- Tracks emotional truth, wants/needs, contradictions, and character arcs.

### Zoe

Receives:

- world rules
- setting logic
- mythology
- continuity log
- location records
- AI production continuity when relevant

Behavior:

- Protects world logic, canon, and repeatable generation constraints.

### Alex

Receives:

- treatment
- outline readiness
- script progress
- open questions
- later: Writer Voice Profile

Behavior:

- Helps with draft readiness, development order, blockers, and strategy.
- Uses Treatment as the main project-facing coaching artifact.

### Maya

Receives:

- script excerpts first
- character voice and dialogue style from Story Bible when present
- treatment passages only when dialogue or voice intent needs broader story context

Behavior:

- Keeps dialogue advice connected to the project's declared voice standards.

## Migration Strategy

### Phase 0: PRD Review And Surface Decisions

Goal: align on product model before implementation.

Decisions:

- Confirm the four-document taxonomy.
- Confirm Treatment becomes a first-class surface.
- Confirm Edit View / Document View as the core UX model.
- Confirm current fields are insufficient and should migrate.
- Confirm localStorage remains acceptable until storage PRD.

### Phase 1: Structured Surface Schema PRD/Tech Spec

Goal: define exact TypeScript state shapes and migration path.

Status: **Implemented** in `2026-05-15-structured-surfaces-phase-1` plan.

Tasks:

- Draft document state interfaces — done in `shared/documents.ts`.
- Map legacy state to new document state — done in `client/src/lib/documentMigration.ts`.
- Decide whether to introduce `state.documents` immediately or evolve top-level fields first — decided: **introduce `state.documents` immediately, dual-shape, legacy remains source of truth this phase**.
- Define import/export-ready Markdown shapes — done in `client/src/lib/documentMarkdown.ts`.
- Define tests for data preservation — `tests/shared/documents.test.ts`, `tests/lib/documentMigration.test.ts`, `tests/lib/documentMarkdown.test.ts`, plus v2→v3 migration tests in `tests/lib/projectState.test.ts`.

Decisions locked in:

- Schema version bumps `2 → 3`. `migrateState` hydrates `documents` from legacy fields when absent or pre-v3.
- Treatment has no legacy mapping; default Treatment is an empty `AuthoredDocumentState` so storage and Markdown emit stay uniform across all four surfaces.
- Markdown emitters skip empty optional sections; never render empty headings.
- No UI components, `wpRouting`, or server code change in this phase. Surface redesign phases 2–5 will flip individual surfaces to write `documents` first.

Success criteria — evidence:

- No user data loss — round-trip tests in `tests/lib/documentMigration.test.ts` cover synopsis, outline, story bible.
- Existing app can still render current data — `npm run test:run` includes the existing suite untouched, plus new schema tests.
- New shapes support Document View and future export — `documentsToMarkdown(state.documents)` returns one Markdown string per surface in stable order.

### Phase 2: Synopsis Surface Redesign

Goal: replace the simplistic synopsis worksheet with a real synopsis document.

Status: **Implemented** in `2026-05-16-synopsis-surface-redesign` plan, branch `feature/screenplay-editor-core` (commits between `b97518e` and the final cleanup commit of this phase).

Tasks:

- Add synopsis document model — done in `shared/documents.ts` (Phase 1).
- Add Edit View / Document View toggle — `SynopsisViewToggle` + `SynopsisDocumentView` + `SynopsisEditView` + thin `SynopsisTab` shell.
- Add prose-first synopsis body — `SynopsisProseEditor` with prose ↔ paragraphs mode switch.
- Keep or migrate existing fields into paragraph builder/source notes — legacy `state.synopsis` mirrored from `documents.synopsis` on every write; default-mode heuristic prevents content from being hidden in prose mode.
- Add synopsis QA checklist — `SynopsisQaChecklist` inline 8-checkbox grid.
- Update Sam context pack — **deferred** to a later phase per plan §8 Q7. Sam still receives `state.synopsis` legacy shape via the mirror; no `wpRouting.ts` changes this phase.

Decisions locked in:

- `state.documents.synopsis` is the canonical source for the Synopsis surface; `state.synopsis` remains a live mirror for `wpRouting`.
- `saveProjectState` now preserves document-only Synopsis fields (header, QA, aiProductionImplications, viewPreferences). The destructive `legacyToDocuments(state)` call on save was replaced by `mirrorSynopsisFromLegacy` plus pass-through for other document surfaces. Outline / Treatment / Story Bible documents are untouched in this phase.
- `DocumentViewPreferencesSchema` gained an optional `synopsisComposeMode: 'prose' | 'paragraphs'`. Backward-compatible.
- Two-click clear matches the Voice Profile Drawer pattern; resets both `state.synopsis` and `state.documents.synopsis`.
- Markdown export, logline sub-fields, AI Production Implications surface, and Sam context upgrade are deferred to later phases per plan §8.

**Series variant added in `2026-05-16-synopsis-series-variant` slice.** That slice originally used `header.format` locally; current authority is project-wide `ProjectState.meta.format`, with header format as a compatibility mirror only. Series block is stored under `content.series` (optional). Sam context now receives project format plus transitional `synopsis.format` / `synopsis.showOverview` compatibility fields. See `docs/product/project-wide-format-agent-context-prd.md` for current authority and `docs/superpowers/plans/2026-05-16-synopsis-series-variant.md` for implementation history.

Success criteria — evidence:

- Writer can create a one-page synopsis artifact — header + logline + prose body + QA + Document View rendering all available in the new Synopsis surface.
- Existing logline and section text survive migration — `mirrorSynopsisFromLegacy` preservation tests in `tests/lib/projectState.test.ts`; default-mode heuristic and regression-guard tests in `tests/components/SynopsisProseEditor.test.tsx` (resolution-only and middle-only legacy data renders correctly in both modes).
- Sam can evaluate the synopsis as a synopsis — Sam's context pack continues to read `state.synopsis` legacy shape via mirror; mirror invariant verified by `tests/lib/useProjectState.test.ts` tests on `setSynopsisDocument`.

### Phase 3: Outline Story-Coach Redesign

Goal: replace the legacy Save-the-Cat beat-title surface with a format-aware story-coach deck that asks plain-language questions and maps answers into professional outline structure.

Status: Superseded and specified by `docs/product/outline-story-coach-redesign-prd.md`.

Tasks:

- Add Feature and Series decks selected by `ProjectState.meta.format`.
- Make `documents.outline` the source of truth in the same shipped release.
- Mirror outline data back to legacy `outline.beats` only for compatibility while Oliver still reads the legacy shape.
- Preserve existing beat notes through migration.
- Remove legacy beat titles from the Edit View DOM for both Feature and Series projects.
- Defer Document View/QA checklist to the V2 slice described in the Outline Story-Coach PRD.
- Update Oliver context once the document-state source of truth is stable.

Success criteria:

- Writer answers plain-language structure questions rather than filling visible craft-jargon beat labels.
- Feature and Series projects both get the new deck before the redesign ships.
- Existing beat notes survive migration.
- Oliver can diagnose causality and pacing from the hidden professional structure and/or fresh legacy mirror.

### Phase 4: Treatment Surface

Goal: add Treatment as the fifth writing surface.

Tasks:

- Add Treatment tab/navigation.
- Add treatment document state.
- Build prose-friendly Edit View.
- Build Document View.
- Add open questions and visual/tonal language.
- Make Alex the default helper.
- Update routing and context packaging.

Success criteria:

- Writer can develop full-story prose before script pages exist.
- Alex can compare Treatment, Outline, and Script readiness.
- Treatment does not pollute Synopsis or Story Bible responsibilities.

### Phase 5: Story Bible Redesign

Goal: turn Story Bible into a source-of-truth system.

Tasks:

- Add pitch/living bible modes.
- Expand tone/style, world, characters, story engine, locations, continuity log, and open questions.
- Add character index plus expanded character sheets.
- Add optional AI production annex.
- Update Casey/Zoe routing by section.
- Update context packs to distinguish locked facts from open questions.

Success criteria:

- Story Bible can serve as canon and continuity.
- Casey and Zoe receive high-quality specialist context.
- AI production continuity is useful but separated from story craft.

### Phase 6: Document Export And Import

Goal: make surfaces portable.

Tasks:

- Markdown export for each surface.
- Markdown import/parsing or assisted transform later.
- Optional JSON backup/import for structured state.
- Later PDF/DOCX export after render rules are mature.

Success criteria:

- Writer can get a professional Markdown artifact out of WriterOS.
- Exported documents preserve the same stable section order as templates.

## Implementation Constraints

- Keep `/api/wp-chat` thin over `OpenAIService.generatePersonaResponse`.
- Do not merge Writing Partner transcript with Writer's Room transcripts.
- Do not reintroduce Replit, Drizzle, Neon, Passport, MockBridge, or stale prototype guidance.
- Do not implement durable memory before storage architecture is decided.
- Do not let AI-generated QA or suggestions mutate documents automatically.
- Run `npm run test:run`, `npm run check`, and `npm run build` after meaningful code changes.

## Testing Strategy

### Unit Tests

- Legacy synopsis migrates into new synopsis document.
- Legacy outline beats migrate into the canonical `documents.outline` shape defined in `docs/product/outline-story-coach-redesign-prd.md`.
- Legacy story bible fields migrate into new bible sections.
- Document View assembly preserves authored content.
- Markdown export emits stable sections.
- Empty optional sections do not produce broken documents.

### Component Tests

- Edit View / Document View toggles persist view preference.
- Synopsis prose body updates state.
- Outline Feature/Series project format changes the visible story-coach deck safely without deleting hidden answers.
- Outline plain-language story-coach cards accept writer answers, persist them via `documents.outline`, and survive deck swaps without data loss. (No user-visible add/reorder/delete of cards in V1 — the deck order is fixed.)
- Treatment tab renders and saves prose sections.
- Story Bible advanced sections can expand/collapse.
- Continuity log rows can be added and edited.

### Agent/Context Tests

- Sam receives synopsis-specific context.
- Oliver receives `ProjectState.meta.format` plus plain-language Outline answers from `documents.outline.content`, with hidden professional mapping (story spine, deck units, series engine/season arc) per `docs/product/outline-story-coach-redesign-prd.md`.
- Alex receives Treatment context when active.
- Casey receives character/theme context.
- Zoe receives world/rule/continuity context.
- Missing decisions are represented explicitly.
- `/api/wp-chat` remains a thin adapter.

### Manual QA

- Start with a blank project and create a synopsis.
- Import or paste an existing rough project and classify material into surfaces.
- Confirm migration: legacy outline beat notes from a pre-redesign project land in the corresponding plain-language story-coach card answers, with no visible Save-the-Cat beat labels in Edit View.
- Build a story bible for a feature and a series project.
- Add a treatment and ask Alex for draft-readiness advice.
- Verify AI production annexes do not dominate the writing documents.

## Risks

### Form Overload

Professional templates can become intimidating. Mitigation: progressive disclosure, presets, and Document View.

### Migration Complexity

Existing localStorage users may have live data in narrow fields. Mitigation: preserve everything, add tests, and keep legacy fallbacks during transition.

### Over-Structuring The Writer

Some writers do not want a rigid framework. Mitigation: allow prose-first and custom modes.

### Agent Context Bloat

Richer documents can tempt oversized prompts. Mitigation: specialist context packs, summaries, and active-surface selection.

### AI Production Annex Creep

AI video continuity is useful but can overwhelm writing. Mitigation: annexes are optional and separate.

### Premature Export Work

Document View may make export tempting. Mitigation: Markdown export first; PDF/DOCX later.

## Open Questions

Answered by May 18 alignment:

1. Synopsis and Story Bible should be revised to the same plain-language story-assessment standard as Outline.
2. The user's template package should mostly become behind-the-scenes structure, Document View rendering, tests, QA checks, and agent context. It should not become intimidating Edit View copy.
3. Document View is read-only in V1 unless a later PRD explicitly changes it.
4. The first schema slice already happened; `ProjectState.documents` exists.
5. Feature/Series format authority belongs at `ProjectState.meta.format`.
6. The exact Synopsis story-assessment prompt set is defined in `docs/product/synopsis-story-coach-redesign-prd.md`.

Still open:

1. What is the exact Story Bible story-assessment prompt set for Feature and Series?
2. Should Treatment be designed immediately after the active surfaces are clarified, or held until Outline/Story Bible implementation is complete?
3. Should AI production annexes be enabled manually, by project type, or only in later export/asset workflows?
4. Should "Transform source into proper document type" become a first-class workflow inside the app?
5. Should Markdown export ship with each surface redesign or remain a separate export phase?

Open work ownership:

| Follow-up | Owner document | Required before |
| --- | --- | --- |
| Synopsis story-assessment revision | `docs/product/synopsis-story-coach-redesign-prd.md` | More Synopsis implementation beyond compatibility fixes |
| Story Bible story-coach redesign | `docs/product/story-bible-story-coach-redesign-prd.md` | Story Bible implementation |
| Treatment surface design | `docs/product/treatment-surface-prd.md` | Adding Treatment navigation/state/UI |
| Agent context migration | `docs/product/agent-workflow-prd.md` plus each surface PRD | Switching a surface from legacy mirrors to `documents.*` source of truth |

## Recommended Next Step

Do not begin with visual polish or more code. Complete product alignment first:

1. Keep `docs/product/README.md` as the current doc-precedence map.
2. Treat `docs/product/project-wide-format-agent-context-prd.md` as the source of truth for format authority.
3. Treat `docs/product/outline-story-coach-redesign-prd.md` as the source of truth for the story-coach surface standard.
4. Use `docs/product/synopsis-story-coach-redesign-prd.md` before further Synopsis implementation.
5. Draft a Story Bible redesign PRD before any Story Bible implementation.
6. Draft Treatment from the new standard when the team is ready to add the fifth surface.
