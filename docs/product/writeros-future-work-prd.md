# WriterOS Future Work PRD

**Date:** 2026-05-08
**Status:** Draft for post-Phase-4 planning
**Branch context:** `feature/screenplay-editor-core`
**Current baseline:** `fd3ab45 feat: add script overview retrieval`
**Related surface redesign:** `docs/product/structured-writing-surfaces-prd.md`

## Summary

WriterOS now has the core deterministic agent-context foundation:

- project title / identity grounding
- surface-aware Writing Partner routing and helper labels
- screenplay block index from `state.script.rawHtml`
- estimated page ranges
- scene-scoped retrieval
- speaker-pair retrieval
- current focus / selected-text retrieval
- broad script overview retrieval

This PRD tracks what remains after that foundation. It intentionally does not restate the completed implementation plan. Its job is to keep future product work clean while the current branch is tested in the UI.

## Problem

The app is becoming technically capable, but the next risks are product clarity, durable storage, and document workflows:

- New writers need to understand what each surface is for without reading docs.
- Professional writers need shareable/readable document views, not only structured edit forms.
- Full projects need a storage plan before generated summaries, durable memory, or multi-project libraries.
- Treatment belongs as a real writing surface, but should not be jammed into script retrieval work.
- Current pagination is useful but estimated; export-quality pagination needs a separate plan.
- Agents can retrieve targeted raw context, but long-range answers will eventually need summaries and visible context boundaries.

## Goals

- Make WriterOS easier to understand for both novices and professionals.
- Redesign non-script writing surfaces as professional document types before generic preview/export work.
- Define Treatment as a future fifth surface.
- Decide storage architecture before durable summaries or project libraries.
- Plan measured pagination and export separately from estimated retrieval pages.
- Add context visibility so users can tell what the agent reviewed.
- Preserve the writing-first product model and current transcript boundaries.

## Non-Goals

- No immediate backend storage implementation in this PRD.
- No generated summary persistence until storage and staleness rules are decided.
- No Treatment implementation inside the current screenplay retrieval branch unless explicitly scoped later.
- No PDF/export engine as a side effect of document preview.
- No autonomous multi-agent orchestration.
- No changes to `/api/wp-chat` beyond thin context plumbing if a later slice requires it.

## Already Done

This PRD assumes the following are complete and should not be rebuilt unless tests or product QA reveal a regression:

- Project title editing and title context.
- Writing Partner / Writer's Room transcript separation.
- Surface-aware left-rail routing.
- `@Partner` / `@WritingPartner` override.
- Active helper guidance.
- Story Bible Casey/Zoe intent routing.
- Script index foundation.
- Page-range retrieval.
- Scene-scoped retrieval.
- Speaker-pair retrieval.
- Current selection/focus retrieval.
- Script overview retrieval for broad questions.

## Product Principles

1. **Expert power, beginner legibility.**
   A novice should know what a surface is for. A professional should not feel slowed down by onboarding.

2. **Structured surfaces should become real documents.**
   Synopsis, Outline, Story Bible, and Treatment should be useful as authored artifacts, not just context forms for agents.

3. **Authored source beats derived context.**
   Persist user-authored documents and visible state. Keep indexes, retrieval packs, and summaries derived unless a storage PRD says otherwise.

4. **Retrieval should be visible when trust matters.**
   If an agent comments on page 12 or the office scene, the UI should eventually be able to show that scope.

5. **Do not overpromise pagination.**
   Current page ranges are estimated retrieval pages. Export-quality pages require measured pagination.

## Roadmap Interaction: Writer Voice Profile

Writer Voice Profile is tracked separately in `docs/product/writer-voice-profile-prd.md` because it is writer-scoped rather than project-scoped.

It does not replace the workstreams in this PRD, but it changes how future UI and storage work should be sequenced:

- **Voice Profile is shell/onboarding work.** It affects first-run experience, profile/settings access, and AI persona context.
- **Treatment is studio surface work.** It affects the main writing surface navigation, document state, and Alex's project-facing coaching role.
- **Document Preview is surface rendering work.** It affects how Synopsis, Outline, Story Bible, and Treatment can be read as authored documents.
- **Storage planning must account for both scopes:** writer-scoped profile data and project-scoped writing documents.
- **Alex connects both ideas:** Voice Profile gives Alex the writer's process and creative identity; Treatment gives Alex the project's draft-development artifact.

Before implementing a major UI slice, confirm whether the change belongs to the shell/onboarding layer, the project/studio layer, or both. This avoids treating the profile as another writing surface, and avoids forcing Treatment into the first-run assessment flow.

## Workstream 1: Surface Orientation

Goal: make each writing surface self-explanatory without turning the app into a tutorial.

Recommended behavior:

- Add subtle orientation copy at the top of each non-room writing surface.
- Keep copy short, durable, and role-based.
- Explain both the surface purpose and its natural helper.

Example copy:

- **Script:** `Write pages and revise scenes. The Writing Partner uses current focus, selected text, page, scene, and speaker context.`
- **Synopsis:** `Shape the reader-facing story summary. Sam helps sharpen premise, pitch logic, and synopsis clarity.`
- **Outline:** `Map writer-facing structure. Oliver helps test causality, escalation, pacing, and sequence flow.`
- **Story Bible:** `Develop character, world, tone, and continuity. Casey handles character/theme psychology; Zoe handles world, rules, and setting logic.`
- **Treatment:** `Write the full story in cinematic prose before or alongside pages. Alex helps diagnose readiness, gaps, and draft strategy.`

Success criteria:

- A first-time user understands why the surface exists.
- A returning user can ignore the copy without losing space or focus.
- Story Bible clearly communicates Casey vs Zoe.

## Workstream 2: Professional Structured Writing Surfaces

Goal: replace the simplistic Synopsis, Outline, and Story Bible field model with professional document surfaces, then let those surfaces be read as shareable writing documents.

Recommended behavior:

- Follow `docs/product/structured-writing-surfaces-prd.md`.
- Treat Synopsis, Outline, Treatment, and Story Bible as separate document types.
- Add `Edit View` / `Document View` toggle for:
  - Synopsis
  - Outline
  - Story Bible
  - future Treatment
- `Edit View` keeps fields, controls, and agent-friendly structure.
- `Document View` renders the same authored source as a clean read-through document.
- Script does not need the same toggle because it is already document/page-oriented.

Non-goals for first slice:

- No PDF generation.
- No DOCX export.
- No print-perfect styling.

Future export targets:

- PDF
- Markdown
- DOCX
- Fountain / screenplay formats where appropriate

Success criteria:

- Writer can build Synopsis, Outline, Treatment, and Story Bible artifacts that match their professional document jobs.
- Writer can review a synopsis or outline as a coherent artifact.
- Document View uses the same stored source as Edit View.
- Export remains a later explicit step.

## Workstream 3: Treatment Surface

Goal: add a fifth writing surface for full-story cinematic prose.

Treatment is distinct from:

- **Synopsis:** compressed reader/pitch-facing story.
- **Outline:** structural beat map.
- **Script:** formatted screenplay pages.
- **Story Bible:** reference source for character, world, tone, and continuity.

Treatment should include:

- title / format / genre metadata
- logline
- concept overview
- major characters and arcs
- present-tense cinematic story prose
- major turns and ending when known
- visual and tonal language
- open questions / unresolved decisions

Agent model:

- Alex is the primary helper.
- Sam can compress treatment into synopsis/logline.
- Oliver can diagnose structure.
- Casey, Maya, and Zoe can use treatment passages through their lenses.

Important boundary:

- AI production notes should stay separate from Treatment prose so the document still reads like a story document.

Success criteria:

- Writer can develop a project before a full script exists.
- Alex can compare Treatment, Outline, and Script progress.
- Broad story questions can use Treatment before raw Script excerpts when appropriate.

## Workstream 4: Storage And Project Library

Goal: decide durable project storage before summaries, memory, export/import, or multi-project workflows grow.

Current boundary:

- `localStorage` is acceptable for this branch.
- It is not the long-term answer for full scripts, transcripts, summaries, documents, and project libraries.

Persist authored/user-visible state:

- project title and metadata
- script raw HTML / scenes
- synopsis
- outline
- story bible
- treatment prose
- transcripts
- user-visible decisions or project notes

Keep derived/rebuildable unless performance requires otherwise:

- script indexes
- retrieval packs
- estimated page spans
- speaker windows
- context summaries

Questions to answer in a storage PRD:

- Local files, browser storage, SQLite, cloud database, or hybrid?
- How are projects imported/exported?
- How are transcripts stored and pruned?
- How are large scripts versioned?
- What is the backup/recovery story?
- What data can be safely regenerated?

Success criteria:

- Clear source-of-truth model.
- Safe migration path from current local state.
- No accidental reintroduction of stale prototype scaffolds.

### In-branch UX: Save / Rename / Delete

Within the localStorage boundary above, the TopBar exposes a project-actions menu next to the project switcher and "New script" button. The menu binds to the active project.

- **Save** — force-flushes pending writes and shows a transient "Saved ✓" pill. Auto-save still runs on every change; Save provides explicit reassurance, not a different persistence path.
- **Rename** — opens the existing inline title editor in the TopBar. The click-title-to-edit fast path is preserved; the menu item adds discoverability.
- **Delete** — `window.confirm` against the active project title, then removes it from the library. If other projects remain, switches to the most-recent. If it was the only project, auto-seeds a blank (matches `loadActiveProjectLibrary` fallback). To delete a different project, the user switches to it first.

Explicitly deferred to the long-term storage PRD: export/import to file, named snapshots/version history, undo for delete, custom in-app confirm modal, and cloud sync.

## Workstream 5: Measured Pagination And Export

Goal: replace estimated retrieval pages with measured document pages when the product needs export-quality page references.

Current behavior:

- Retrieval pages are estimated at 250 words per page.
- This is deterministic and good enough for agent targeting.
- It is not screenplay-accurate pagination.

Future behavior:

- Measure page breaks from the editor layout or a pagination engine.
- Track page spans per block/scene.
- Use measured pages for UI, retrieval, print, and export.
- Preserve estimated pages as fallback if measurement is unavailable.

Success criteria:

- Page numbers shown to users match page-like document layout.
- Export and agent retrieval agree on page boundaries.
- Agents do not overclaim precision when only estimated pages are available.

## Workstream 6: Script Summaries And Durable Context

Goal: make long-range questions useful without sending full raw script text.

First step:

- Add deterministic summary placeholders based on scene headings, page ranges, first action/dialogue beats, and speaker lists.

Later step:

- Allow model-generated scene/page summaries with explicit save/recompute behavior.
- Track summary staleness when `state.script.rawHtml` changes.
- Keep summaries separate from raw script source.

Storage dependency:

- Do not persist generated summaries until storage rules are decided.

Success criteria:

- Agents can answer whole-script, continuity, first-act, climax, and character-arc questions with scoped context.
- The app can tell whether a summary is current or stale.
- Raw text remains available for local craft analysis.

## Workstream 7: Context Visibility And Controls

Goal: help users trust what the agent reviewed.

Future UI ideas:

- Small `Context sent` inspector for each agent response.
- Context chips such as:
  - `Page 12`
  - `Pages 10-14`
  - `INT. DANTE OFFICE - DAY`
  - `Script overview`
  - `Selected text`
- Optional explicit controls:
  - send selected text
  - send current scene
  - send current page
  - send page range

Success criteria:

- Users can understand why an answer is scoped.
- Agents can say what they reviewed without sounding like they read the whole script.
- Debugging bad retrieval becomes possible from the UI.

## Suggested Sequence

1. **Manual usability pass.**
   Play with the current UI and capture friction before new implementation.

2. **Roadmap coordination with Writer Voice Profile.**
   Confirm first-run/profile entry-point decisions before adding major shell or navigation UI. Voice Profile work should follow `docs/product/writer-voice-profile-prd.md`.

3. **Surface orientation polish.**
   Add concise role/surface copy if testing confirms confusion.

4. **Structured Writing Surfaces implementation slice.**
   Redesign Synopsis, Outline, Treatment, and Story Bible around professional document models before doing generic preview/export work.

5. **Storage PRD.**
   Decide durable writer/project storage before generated summaries, project libraries, or assuming profile memory can survive beyond local browser state.

6. **Treatment PRD / implementation slice.**
   Build the fifth surface after storage implications are clear enough.

7. **Measured pagination / export plan.**
   Treat page fidelity and export as their own product/technical effort.

8. **Generated summaries.**
   Add only after storage and staleness rules exist.

## Manual QA Prompts For Current UI

Use these while gauging usability:

- Can a new user tell what Script, Synopsis, Outline, and Story Bible are for?
- Can the user tell who will answer in the Writing Partner rail before sending?
- Does Story Bible make the Casey/Zoe split understandable?
- Does the left rail feel like one Writing Partner thread, not a random agent switcher?
- Does asking about a page, scene, exchange, selected text, or broad script issue feel predictable?
- Does the UI need to show what context was sent, or is the current answer quality enough for now?

## Open Questions

1. Should surface orientation copy be always visible, collapsible, or shown only for empty/new surfaces?
2. Should Document View be a toggle in the surface header or a preview button?
3. Should Treatment be implemented before or after storage architecture?
4. Should context visibility be user-facing now, or remain a developer/debug tool until retrieval fails in testing?
5. What is the minimum storage plan needed before generated summaries?
6. Where should the Writer Voice Profile entry point live in the shell so it is discoverable without competing with project title or writing-surface navigation?
