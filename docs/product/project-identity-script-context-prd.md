# WriterOS Project Identity + Script Context PRD

**Date:** 2026-05-07  
**Status:** Draft for review  
**Branch context:** `feature/screenplay-editor-core`  
**Related docs:** `docs/product/agent-workflow-prd.md`, `docs/product/writeros-future-work-prd.md`, `docs/superpowers/specs/2026-05-04-writing-partner-design.md`, `docs/superpowers/plans/2026-05-05-screenplay-editor-core.md`

> Note: the core project identity and deterministic script retrieval work described here has been implemented through `fd3ab45 feat: add script overview retrieval`. Remaining future work is now tracked separately in `docs/product/writeros-future-work-prd.md`.

## Summary

WriterOS needs a stronger project identity layer and an addressable screenplay context system before agent behavior can become consistently trustworthy on real feature-length scripts.

The current implementation proves the direction: agents can receive structured project data, script excerpts, dialogue snippets, specialist lenses, and a Writing Partner Brief. But it also exposed a deeper limitation. A screenplay is not a short text field. It is usually 90-120+ pages, and agent questions are often about a specific page, scene, relationship, beat, or current editor focus. Sending the first excerpt or a capped snippet list will always fail for some legitimate questions.

The next product step is to make the project itself identifiable and make the script addressable. Agents should know what project they are inside, what page or scene the writer is working on, and how to retrieve the right script span when the writer asks a targeted question.

## Problem

### Project Identity Is Too Weak

`ProjectState.meta.title` exists, appears in the top bar, and is sent through agent context. But the app does not provide a real title-editing workflow. In live use, the project commonly remains `Untitled Project`, which means the strongest grounding signal available to agents is absent.

This matters because title is not just display metadata. It is the project identity lock:

- It tells the agent which story world it is inside.
- It disambiguates conversations across projects.
- It anchors memories, decisions, summaries, and transcripts.
- It should be part of every agent context pack.

### Script Context Is Not Addressable

The current script context repair derives:

- first 500-word plain-text excerpt
- scene headings
- dialogue snippets
- action snippets
- character names

This is useful as a short-term pack, but it is not enough for a full screenplay. A question like "rate the Isaiah/Dante dialogue" can target a scene far past the first excerpt. A question like "what changed since page 12?" requires page awareness. A question like "does the climax contradict the opening?" requires retrieval across distant spans plus summaries.

### Editor State Can Be Fresher Than Project State

`ScreenplayEditor` debounces saves by 500ms. Agent calls use `buildProjectContext(project.state)`. If the writer edits or pastes script text and immediately asks an agent, the visible editor may contain text that has not yet reached `ProjectState`.

Agents must not miss text the writer can see on screen.

### Page Count Is Display-Only

The toolbar estimates page count from rendered height, but the page concept is not part of project state or script context. Agents cannot retrieve page 8, current page, or nearby pages because pages are not represented as data.

## Product Principles

1. **The project title is a first-class identity field.**  
   Agents should treat the title as the strongest project lock, not decorative UI text.

2. **Raw screenplay HTML remains the editable source of truth.**  
   Derived script indexes should be rebuildable from `state.script.rawHtml` and should not replace the editor document.

3. **Agents receive targeted script context, not arbitrary chunks.**  
   "First 500 words" is only an empty-focus fallback. The normal path should be current focus, explicit page/scene request, named character exchange, or structural query.

4. **The writer's visible focus matters.**  
   If the cursor or selection is on page 42, agents should privilege page 42 unless the writer asks for something else.

5. **Long-range script understanding requires summaries plus retrieval.**  
   Raw text is for local craft analysis. Scene/page summaries are for broad questions, continuity, structure, and cross-script reasoning.

6. **Context packaging should be deterministic before model invocation.**  
   The app should be able to explain which page, scene, or dialogue window it sent.

7. **No true autonomous orchestration yet.**  
   This PRD improves state and retrieval. It does not add model-to-model delegation or background agents.

## Goals

- Add a user-facing project title workflow.
- Ensure the title is present in project identity, UI, and all agent contexts.
- Parse screenplay `rawHtml` into an addressable block index.
- Derive scenes and pseudo-pages from that block index.
- Track current editor focus sufficiently for agent context.
- Retrieve relevant script spans by page, scene, speaker, selection, and user query.
- Prevent agent calls from using stale script state after recent edits.
- Preserve Writing Partner and Writer's Room transcript separation.
- Keep `/api/wp-chat` a thin adapter over `OpenAIService.generatePersonaResponse`.

## Non-Goals

- No multi-project file system or cloud project library yet.
- No collaborative editing.
- No true industry screenplay pagination engine yet.
- No PDF export requirement.
- No background embedding/vector database requirement in this phase.
- No autonomous agent-to-agent delegation.
- No destructive rewrite of the existing screenplay editor.
- No Treatment editor implementation in the current Phase 3/4 slice. Treatment is captured below as a planned surface because it affects context strategy, but it should not interrupt script focus/retrieval work.

## Current State Review

### Existing State

`ProjectState` currently includes:

```typescript
meta: {
  title: string
  genre: string
  format: string
  wordCount: number
  pageCount: number
}

script: {
  rawHtml: string
  scenes: ScriptScene[]
  revisionHistory: unknown[]
}
```

The state shape is a reasonable starting point, but `meta.title`, `meta.wordCount`, and `meta.pageCount` are not consistently productized:

- `title` is shown but not editable in the UI.
- `wordCount` and `pageCount` exist in `meta` but editor metrics are held in component state rather than persisted.
- `script.scenes` stores headings but not page ranges, block ranges, or text spans.

### Existing Agent Context

`buildProjectContext(state)` is the client-side packaging function for `/api/wp-chat`. It currently derives script context directly from `state.script.rawHtml`.

`server/routes.ts` adapts that context into `StoryMemory`.

`OpenAIService.createContextSummary()` then builds persona-specific context text.

This is acceptable for Phase 1, but the parsing/retrieval logic belongs in a dedicated script context module before it grows further.

## Required Behavior

### Project Identity

1. A writer can set or edit project title in the UI.
2. The title persists in `ProjectState.meta.title`.
3. The title appears in:
   - Top bar
   - Writing Partner context chip
   - Writer's Room project/process context
   - Writing Partner Brief
   - Persona system prompt project context
4. Empty title should display as `Untitled Project` but should be represented internally in a way that allows the app to know it is unset.
5. Agents should not invent or rename the project title.
6. If the writer says "the project is called Lifeline", the app may suggest a title update later, but automatic title mutation is a separate explicit-save behavior.

Decision: store an unset/default title as an empty string. `Untitled Project` is a display fallback only, applied at rendering and omitted from agent identity/context until the writer sets a real title.

### Script Index

The app should derive a script index from `state.script.rawHtml`.

Each block should include:

```typescript
interface ScriptBlockIndex {
  id: string
  index: number
  type: ElementType
  text: string
  speaker?: string
  sceneId?: string
  sceneHeading?: string
  pageNumber: number
  wordStart: number
  wordEnd: number
}
```

Scenes should include:

```typescript
interface ScriptSceneIndex {
  id: string
  heading: string
  index: number
  pageStart: number
  pageEnd: number
  blockStart: number
  blockEnd: number
  wordStart: number
  wordEnd: number
}
```

Pages should include:

```typescript
interface ScriptPageIndex {
  pageNumber: number
  blockStart: number
  blockEnd: number
  wordStart: number
  wordEnd: number
  sceneIds: string[]
}
```

Notes:

- Phase 1 can use pseudo-pages based on screenplay-friendly word/block heuristics.
- Later phases can replace pseudo-pagination with measured editor page breaks.
- The index must be deterministic and rebuildable from `rawHtml`.

### Focus State

The app should track enough editor focus to retrieve current context:

```typescript
interface ScriptFocusState {
  blockId?: string
  pageNumber?: number
  sceneId?: string
  selectedText?: string
  updatedAt: number
}
```

Focus should update on selection changes and cursor movement.

Default retrieval priority:

1. Selected text with surrounding blocks.
2. Current block with surrounding blocks.
3. Current page.
4. Current scene.
5. First page / first scene fallback.

### Retrieval

Create a pure script context module with helpers like:

```typescript
buildScriptIndex(rawHtml: string): ScriptIndex
getCurrentFocusContext(index: ScriptIndex, focus: ScriptFocusState): ScriptContextPack
getPageRangeContext(index: ScriptIndex, startPage: number, endPage?: number): ScriptContextPack
getSceneContext(index: ScriptIndex, sceneIdOrHeading: string): ScriptContextPack
getDialogueWindowBySpeakers(index: ScriptIndex, speakers: string[], userMessage?: string): ScriptContextPack
getScriptOverview(index: ScriptIndex): ScriptOverview
selectScriptContext(index: ScriptIndex, focus: ScriptFocusState, userMessage: string, personaId: PersonaId): ScriptContextPack
```

`ScriptContextPack` should include:

```typescript
interface ScriptContextPack {
  reason: string
  label?: string
  pageRange?: { start: number; end: number }
  sceneHeadings: string[]
  blocks: ScriptBlockIndex[]
  plainText: string
  dialogueSamples: string[]
  actionSamples: string[]
  omitted?: {
    pageCount: number
    sceneCount: number
    reason: string
  }
}
```

The pack's `reason` should be human/debug readable:

- `current-selection`
- `current-page`
- `requested-page-range`
- `requested-speakers`
- `requested-scene`
- `script-overview`
- `fallback-first-page`

### Prompt Context

Writing Partner Brief should remain compact and identity-oriented:

- Project title
- Genre
- Logline / premise
- Stage indicators
- Script page/scene counts
- Current focus summary

Surface Context Pack should contain targeted script text.

Specialist Lens should decide how the pack is presented:

- Maya: dialogue-heavy raw blocks and speaker labels.
- Oliver: scene headings, page ranges, scene purpose, structural position.
- Casey: character-associated moments and emotional beats.
- Zoe: world/rule/continuity references.
- Sam: synopsis/logline plus overview, not raw page text unless requested.
- Alex: progress/focus, blockers, and revision scope.

### Planned Treatment Surface

WriterOS should add a Treatment surface in a later phase. A treatment is a prose document that tells the full story of a film, pilot, or screenplay before or alongside script drafting. It is longer and more vivid than a synopsis, but less mechanically structured than an outline.

Treatment should have a distinct product role:

- **Synopsis:** reader/pitch-facing compressed story spine.
- **Outline:** writer-facing structural map of beats, acts, scenes, or sequences.
- **Treatment:** writer-facing cinematic prose version of the full story, including major turns, emotional flow, tone, character arcs, and ending when known.
- **Script:** formatted screenplay pages and line-level craft.
- **Story Bible:** reference source for characters, world, tone, rules, and continuity.

Alex should be the primary specialist for Treatment because it is the natural bridge between concept/outline and actual pages. Sam may help compress treatment material into pitch-facing synopsis/logline work; Oliver may help diagnose structural gaps; Casey, Maya, and Zoe may use treatment passages through their specialist lenses.

Treatment context should influence retrieval strategy:

- Broad story questions may prefer Treatment before raw Script excerpts.
- Draft-readiness questions should compare Treatment, Outline, and Script progress.
- Script craft questions should still prioritize Script context.
- Pitch questions should prioritize Synopsis, then Treatment as supporting story detail.

Recommended future treatment structure:

- Header: title, writer, format, genre, version/date.
- Logline.
- Concept / overview.
- Main characters with want, need, flaw/wound, secret/contradiction, arc, relationship pressure.
- Story prose in present-tense cinematic paragraphs, organized by opening / act movements or sequences.
- Visual and tonal language.
- Open questions and unsolved decisions.

AI production notes, if added later, should remain separate from treatment prose so the Treatment surface still reads like a story document rather than a prompt sheet.

## UX Requirements

### Title Editing

Recommended MVP:

- Make the top-bar project title editable.
- Use a restrained inline input or popover, not a large settings page.
- Empty state displays `Untitled Project`.
- Save on Enter, blur, or explicit check button.
- Escape cancels edit.

The title should feel like naming a document, not filling a mandatory setup wizard.

### Script Context Visibility

Recommended MVP:

- Writer's Room context chip for Maya should show script availability, e.g. `6 pages · current page 4 · 2 speakers matched`.
- Agent responses should be able to say which page/scene they reviewed.
- Later: show a small "Context sent" inspector for debugging.

### Current Focus

Recommended MVP:

- Track cursor page/scene internally.
- No visible UI required beyond possible toolbar page display.
- If the writer selects text before asking, selection should be privileged.

### Document Preview Toggle

Planned idea for non-script surfaces:

- Synopsis, Outline, Story Bible, and future Treatment can offer `Edit View` / `Document View`.
- Edit View keeps fielded guidance and structured controls visible.
- Document View renders the same authored source as a clean read-through document so writers can judge flow without form chrome.
- Script already has formatted page presentation, so it does not need this toggle in the same way.
- Export should come later. The toggle is for drafting and review first, not file generation.

## Data Ownership

### Source Of Truth

`state.script.rawHtml` remains the source of truth for script content.

### Derived State

The script index may be:

1. Built on demand from `rawHtml`.
2. Memoized client-side.
3. Stored in `ProjectState.script.index` only if performance requires it.

Recommendation: build/memoize first; persist only stable metadata such as `pageCount`, `wordCount`, `scenes`, and focus state.

### Storage Boundary

Storage is a tracked architectural concern, but not the next implementation slice.

Current recommendation:

- Persist authored source documents and user-visible state: project title, raw script HTML, story bible, outline, synopsis, transcripts, and later treatment prose.
- Keep script indexes, estimated pages, scene spans, speaker windows, and retrieval packs derived and rebuildable from source documents.
- Do not persist large derived retrieval data unless performance forces it.
- Treat `localStorage` as acceptable short-term project persistence for this branch, but not the long-term storage plan for full scripts, transcripts, summaries, and project memory.
- Make an explicit storage decision before implementing generated summaries, durable agent memory, or multi-project libraries.

### Schema Versioning

This work likely requires a schema migration:

- `CURRENT_SCHEMA_VERSION` should increment.
- Legacy states without title should migrate safely.
- Legacy states with `Untitled Project` should keep display compatibility.
- Script focus/index fields should default to empty rather than attempting destructive inference in migration.

## Technical Design

### Proposed Modules

```text
client/src/lib/scriptIndex.ts
client/src/lib/scriptRetrieval.ts
client/src/lib/projectIdentity.ts
client/src/lib/wpRouting.ts
server/ai/openaiService.ts
server/routes.ts
```

`scriptIndex.ts`:

- Parse TipTap HTML.
- Normalize screenplay blocks.
- Assign stable block IDs.
- Assign scene IDs.
- Estimate page numbers.
- Produce page/scene indexes.

`scriptRetrieval.ts`:

- Interpret user message for page references, scene headings, speaker pairs, and broad query types.
- Select relevant context pack.
- Enforce context caps.

`projectIdentity.ts`:

- Normalize title and genre.
- Decide display title vs stored title.
- Build project identity lines for agents.

`wpRouting.ts`:

- Keep routing and context assembly.
- Use script retrieval helpers instead of doing raw parsing itself.

### Pagination Strategy

Phase 2 pseudo-pagination should be deterministic. The MVP default is 250 words per estimated page, with scene boundaries preserved as metadata. This avoids pretending to have industry-accurate page breaks before measured editor pagination exists.

A later screenplay-weighted heuristic may replace the MVP default:

- Start a new page when accumulated screenplay-weight exceeds a threshold.
- Different block types have different weights:
  - Scene heading: moderate, often starts a new context anchor.
  - Action: proportional to word count.
  - Character: low.
  - Dialogue: proportional to word count plus line overhead.
  - Parenthetical: low.
  - Transition: low / often page-end marker.

- Name the value `estimatedPageNumber` or document that it is pseudo-pagination.
- Later replace with measured page breaks from the editor.

### Prompt Selection Rules

Message parser should detect:

- Page references: `page 12`, `pages 10-14`, `p. 7`.
- Scene references: exact or fuzzy scene heading.
- Speaker references: character names in message.
- Broad questions: `overall`, `first act`, `pacing`, `arc`, `continuity`.
- Current-focus questions: `this`, `here`, `on the page`, `current scene`, `these lines`.

Selection examples:

- "Rate the dialogue between Isaiah and Dante"  
  Retrieve dialogue window containing both speakers, with nearby action.

- "What is happening on page 12?"  
  Retrieve page 12 plus scene heading and adjacent page summary.

- "Does the present-day office scene contradict the opening?"  
  Retrieve matching scene plus opening scene summary/raw excerpt.

- "How is the first act pacing?"  
  Retrieve script overview, scene list, page counts, outline beats, and selected scene summaries, not raw full first act.

- "Polish this line" with selection  
  Retrieve selected text plus nearby dialogue/action blocks.

## Implementation Phases

### Phase 0: PRD Approval

Goal: align on state architecture before code changes.

Tasks:

- Review this PRD.
- Confirm top-bar title UX.
- Confirm 250-word estimated-page MVP.
- Decide whether index is derived-only or partially persisted.

### Phase 1: Project Identity MVP

Goal: agents have a reliable project title lock.

Tasks:

- Add editable title UI in top bar.
- Persist title through `setMeta`.
- Normalize empty title behavior.
- Ensure title appears in Writing Partner Brief and persona prompt.
- Add tests for title editing, persistence, context inclusion.

Success criteria:

- Writer can name the project `Lifeline`.
- Top bar, Writing Partner chip, Writer's Room, and agent context all use `Lifeline`.
- Empty projects still show `Untitled Project`.

### Phase 2: Script Index Foundation

Goal: script content becomes addressable.

Tasks:

- Create `scriptIndex.ts`.
- Parse `rawHtml` into indexed blocks.
- Derive speakers, scenes, estimated pages, word ranges.
- Use 250 words per estimated page for the MVP.
- Replace the current capped-list / first-occurrence dialogue bridge with scene/page-scoped speaker-pair retrieval from the index.
- Add focused unit tests with realistic screenplay HTML.
- Replace current ad hoc extraction in `wpRouting.ts` with index-derived context.

Success criteria:

- Given a long script, code can retrieve page 1, page N, scene spans, and speaker dialogue windows.
- Existing Maya dialogue behavior still works.
- Existing tests continue to pass.

### Phase 3: Focus State

Goal: agents can default to what the writer is looking at.

Tasks:

- Track current block/page/scene from TipTap selection.
- Have the script surface own a latest-editor-HTML snapshot/ref.
- Before agent send, build context from that latest editor snapshot or synchronously flush it into project state before `buildProjectContext`.
- Store focus in state or a dedicated ref passed into context assembly.
- Add tests for focus context selection.

Success criteria:

- If writer asks "what about this scene?" from the current scene, agent receives that scene.
- If writer edits and immediately asks Maya, latest visible text is included.

### Phase 4: Retrieval-Aware Agent Context

Goal: prompt context is selected by the writer's request.

Tasks:

- Add `scriptRetrieval.ts`.
- Detect pages, page ranges, speakers, scenes, current-focus language, and overview language.
- Produce `ScriptContextPack`.
- Thread pack reason and page/scene metadata through `StoryMemory`.
- Update prompt summaries to identify reviewed page/scene.

Success criteria:

- Maya can rate Isaiah/Dante dialogue anywhere in the script.
- Oliver can evaluate current page/scene structure.
- User can ask for page 12 and receive page 12 context.
- Broad questions use summaries/overview rather than arbitrary raw chunks.

### Phase 5: Script Summaries

Goal: long-range questions become useful without sending the whole screenplay.

Tasks:

- Create deterministic scene/page summary placeholders.
- Later allow model-generated summaries with explicit save/recompute behavior.
- Keep summaries separate from raw script text.
- Add stale-summary detection when `rawHtml` changes.

Success criteria:

- Agents can answer first-act / whole-script / continuity questions with meaningful context.
- Summary staleness is visible or safely handled.

### Later Phase: Treatment Surface

Goal: add a full-story prose surface that helps writers move from outline to pages and gives agents a stronger whole-story document.

Tasks:

- Add Treatment as a fifth writing surface.
- Persist treatment prose as authored source text, not derived retrieval data.
- Provide a treatment template based on title, format, genre, logline, concept, characters, story prose, visual/tonal language, and open questions.
- Make Alex the primary helper for treatment development, draft readiness, gap diagnosis, and page-generation planning.
- Update context routing so broad story/process questions can use Treatment before raw Script excerpts when appropriate.
- Keep AI production notes separate from treatment prose.

Success criteria:

- Writer can develop a story in treatment form before writing a full script.
- Alex can compare Treatment, Outline, and Script progress.
- Treatment improves broad story answers without replacing Synopsis, Outline, Script, or Story Bible.

## Testing Strategy

### Unit Tests

- Title normalization and display fallback.
- `setMeta` title persistence.
- Script HTML parsing into block index.
- Speaker detection across character/dialogue blocks.
- Scene span detection.
- Page estimation.
- Page range retrieval.
- Speaker-pair retrieval.
- Focus context selection.
- Context cap behavior.

### Component Tests

- Top bar title edit/save/cancel.
- Script editor focus updates.
- Writer's Room context indicator reflects script state.

### Server/Prompt Tests

- Writing Partner Brief includes title and script stage indicators.
- Maya receives raw dialogue for requested speaker pair.
- Oliver receives scene/page structure.
- Sam does not receive unnecessary raw script text by default.
- `/api/wp-chat` remains a thin adapter over `generatePersonaResponse`.

### Manual QA

Use the `Lifeline` sample:

- Set title to `Lifeline`.
- Ask Maya about Isaiah/Amina opening dialogue.
- Ask Maya about Isaiah/Dante office dialogue.
- Ask Oliver about page/scene structure.
- Ask Writing Partner "what page am I on?"
- Edit a line and immediately ask Maya about it.

## Risks

1. **False page precision.**  
   Pseudo-pages may not match industry page count. Mitigation: call them estimated internally and avoid overpromising until measured pagination exists.

2. **Context bloat.**  
   Keeping more indexed data can tempt oversized prompts. Mitigation: retrieval packs have strict caps and reasons.

3. **Stale focus.**  
   Cursor/focus state can drift. Mitigation: update on selection change and flush/read editor content before send.

4. **State migration complexity.**  
   More script metadata increases migration burden. Mitigation: derive index from raw HTML and avoid persisting large derived data initially.

5. **Prompt overconfidence.**  
   Agents may speak as though they reviewed the whole script. Mitigation: prompt should include reviewed page/scene metadata and require scoping language.

6. **TipTap selection coupling.**  
   Focus state depends on TipTap transaction and selection APIs. Mitigation: keep focus extraction isolated behind a small adapter so retrieval logic can remain pure and testable.

## Open Questions

1. Should project title be edited inline in the top bar, or in a small project details popover?
2. Should focus state be persisted across reloads or only live during the session?
3. Should users be able to explicitly choose "send current page", "send current scene", or "send selected text"?
4. Should script summaries be generated on demand, manually saved, or automatically refreshed?
5. When should screenplay-weighted pagination replace the 250-word estimated-page MVP?

## Recommended Next Step

Implement Phase 1 only after PRD review:

- Add project title editing.
- Normalize title display vs stored value.
- Ensure title is included in all agent identity/context paths.
- Add focused tests.

Then implement Phase 2 as a separate, reviewed slice:

- Build `scriptIndex.ts`.
- Replace ad hoc script extraction with index-derived context.
- Keep retrieval deterministic and test-first.
