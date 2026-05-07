# WriterOS Agent Workflow PRD

**Date:** 2026-05-07  
**Status:** Draft for review  
**Branch context:** `feature/screenplay-editor-core`  
**Related docs:** `docs/superpowers/specs/2026-05-04-writing-partner-design.md`, `docs/superpowers/plans/2026-05-04-writing-partner-ai.md`

## Summary

WriterOS should treat agents as writing-surface support inside a flexible writing suite, not as a required linear workflow or a set of equal competing chatbots.

The Writing Partner remains the generalist front door and broad project host. The Writer's Room specialists remain distinct advisors with separate transcripts and domain-specific strengths. The next product step is not to replace those agents, but to make their roles easier to understand, make context flow more reliable, and ensure specialists can benefit from the Writing Partner's broader project awareness when their focused context is insufficient.

## Problem

The current agent layer works technically:

- Writing Partner and Writer's Room chat both connect to the model provider.
- Transcripts are separate.
- Persona routing works.
- Agents can use structured project context when it exists.
- Anthropic-backed responses are live.

But early manual testing revealed a product/context issue:

- Some specialists feel grounded because their needed fields are already structured and populated.
- Other specialists look weaker when the app does not package the context their role needs.
- The writer has to infer which specialist to use from personality names rather than from the writing surface or task at hand.
- Empty surfaces can create misleading expectations. A project may not need a synopsis, a Story Bible, or every specialist at every stage.

Example: Maya, the Dialogue & Voice Coach, was asked to rate initial dialogue. She knew the project and Isaiah in a general way, but did not receive the actual script dialogue text. She correctly acted like a dialogue specialist, but the app had not supplied her most important context.

## Product Principles

1. **WriterOS is a suite, not a pipeline.**  
   A project may use only Script and Outline, or only Story Bible and Synopsis, or all surfaces. The product must not imply that every tab must be filled.

2. **Surfaces represent writing jobs.**  
   Each surface exists because it serves a different writer need:
   - Script: pages, scenes, dialogue, draft execution.
   - Outline: private structure for the writer.
   - Synopsis: external-facing story explanation for readers, buyers, producers, contests, or pitch use.
   - Story Bible: continuity, character/world memory, especially useful for series and complex projects.
   - Writer's Room: deliberate specialist consultation.

3. **Writing Partner is the generalist host.**  
   The Writing Partner should have the broadest project awareness and should help the writer decide what kind of help is needed.

4. **Specialists stay specialists.**  
   Specialists should remain focused, opinionated, and useful in their domains. They should not all receive the exact same giant prompt by default.

5. **Surface-first UX, specialist-depth underneath.**  
   The writer should not need to decode six personality names before asking for help. The app should guide by writing task: pages, outline, pitch, character, world, dialogue, process.

6. **No premature autonomous orchestration.**  
   Do not build true LLM-to-LLM delegation yet. First make context packaging, routing, and specialist UX excellent.

## Agent Model

### Writing Partner

Role: generalist front door, project host, context bridge.

Responsibilities:

- Understand broad project state across all surfaces.
- Respond directly to general questions.
- Route or recommend specialist help when useful.
- Preserve the left-rail transcript separately from Writer's Room transcripts.
- Help when project context is incomplete by naming the missing field or surface.
- Provide a short general project brief that specialists can use.

### Specialists

Role: focused advisors attached to writing tasks and surfaces.

Current specialists remain:

- Sam: synopsis, logline, pitch clarity, external-facing story.
- Oliver: outline, beats, structure, causality, pacing.
- Casey: character psychology, want/need/wound/arc, theme through character.
- Maya: script pages, dialogue, voice, subtext, rhythm.
- Zoe: world, rules, continuity, setting logic.
- Alex: process, momentum, blockers, revision planning.

The current personalities are assets. The improvement is to make their entry points and context packs more surface-aware.

## Writing Surface Model

### Script

Primary question: "What is on the page?"

Relevant agent support:

- Writing Partner for general scene help.
- Maya for dialogue, voice, subtext, line-level rhythm.
- Oliver for scene function and structure.
- Casey for character behavior and emotional truth.

Required context pack:

- Current or first script excerpt sourced from `state.script.rawHtml`, stripped to plain text.
- Reproducible excerpt cap: first 500 words for Phase 1.
- Scene headings.
- Dialogue/action snippets.
- Character names detected or structured character records.
- Optional active element/selection later.

### Outline

Primary question: "How does the story work for me as the writer?"

Relevant agent support:

- Oliver default.
- Writing Partner for triage.
- Casey/Zoe as needed when structure depends on character/world.

Required context pack:

- Beat names and notes.
- Filled vs empty beat status.
- Linked script scenes when available.
- Logline and core premise.

### Synopsis

Primary question: "How does this story read to someone else?"

Relevant agent support:

- Sam default.
- Writing Partner for broad triage.

Required context pack:

- Logline.
- Synopsis sections.
- Project title/genre.
- Outline summary when available.
- Missing-pitch-field awareness.

### Story Bible

Primary question: "What must remain true across the project?"

Relevant agent support:

- Casey for Characters, Themes, Tone & Voice.
- Zoe for World and Rules.
- Writing Partner for global continuity.

Required context pack:

- Characters with wound/want/need/arc.
- World setting, tone anchors, rules, voice notes.
- Themes.
- Script/outline references when relevant.

### Writer's Room

Primary question: "I want a focused expert opinion."

Relevant agent support:

- Direct specialist transcript.
- Specialist-specific context pack.
- Writing Partner brief included as a small shared grounding layer.

## Context Architecture

The next implementation should distinguish three layers:

### 1. Writing Partner Brief

A compact, broad project digest available to all agents.

Should include:

- Title and genre if set.
- Logline or best available premise.
- Primary characters.
- Current stage indicators: pages present, outline beats filled, synopsis sections filled, Story Bible fields filled.
- Short project memory summary.

Purpose:

- Specialists do not become blind when their pruned context is sparse.
- The app can preserve focus without isolating specialists from the project.

### 2. Surface Context Pack

Context based on where the writer is working or what surface the specialist belongs to.

Examples:

- Script pack: excerpt, dialogue snippets, scene headings.
- Outline pack: beat notes and empty-beat map.
- Synopsis pack: logline and synopsis sections.
- Story Bible pack: character/world/theme/rule fields.

Purpose:

- Agents receive the material required for the writing job.
- Missing context can be described precisely.

### 3. Specialist Lens

Persona-specific emphasis and pruning.

Examples:

- Maya gets script excerpt first, then character/voice context.
- Oliver gets outline first, then script scenes and synopsis.
- Sam gets logline/synopsis first, then outline/project brief.
- Casey gets character fields first, then themes and relevant script behavior.
- Zoe gets world/rules first, then script/outline facts that affect continuity.
- Alex gets project progress and writer process context first.

Purpose:

- Specialists remain distinct.
- Prompts stay token-aware.
- The writer receives focused responses rather than generic all-purpose advice.

## Required Behavior

1. Writing Partner answers general project questions using broad context.
2. Specialists answer with domain focus and access to the context their domain requires.
3. If required context is missing, agents should say what is missing and provide a useful next step.
4. Agents should not imply the writer must fill every surface.
5. A specialist should not claim missing context when the relevant material exists elsewhere in WriterOS and can be packaged.
6. The UI should make likely agents obvious from the current surface.
7. Writing Partner and Writer's Room transcripts must remain separate.

## Non-Goals

- No true autonomous multi-agent delegation yet.
- No server-side model-to-model consultation loop yet.
- No mandatory project setup wizard.
- No requirement that every project fill every tab.
- No destructive auto-writing into project fields without explicit user action.
- No replacing current specialist personas.

## UX Direction

Keep current agents, but clarify entry points.

Potential UI language:

- Script help: "Pages, dialogue, scene work"
- Outline help: "Structure and beats"
- Synopsis help: "Pitch and reader-facing summary"
- Story Bible help: "Characters, world, continuity"
- Writer's Room: "Ask a specialist"

Specialists can remain named personalities, but the product should help the writer understand the job each one solves.

## Implementation Phases

### Phase 1: Context Packaging Repair

Goal: agents no longer miss context that exists in the app.

Tasks:

- Add script excerpt extraction to project context.
- Source the excerpt from `state.script.rawHtml`, strip HTML, and cap it to the first 500 words.
- Include dialogue/action snippets for Maya and Script-related help.
- Add Writing Partner Brief generation without letting the brief crowd out specialist context.
- Include brief in all specialist prompts.
- Preserve existing `/api/wp-chat` route shape or evolve it minimally.
- Add tests for context extraction and persona-specific context inclusion.

Success criteria:

- Maya can rate initial dialogue from the current script.
- Oliver still focuses on outline/structure.
- Sam still focuses on synopsis/logline.
- Casey/Zoe retain role focus.

### Phase 2: Surface-Aware Routing

Goal: the app makes the likely helper obvious without hiding specialist choice.

Tasks:

- Clarify default routing by active surface.
- Add or refine helper labels in UI.
- Keep @mentions as explicit override.
- Keep Writer's Room direct specialist selection.

Success criteria:

- Writer can ask Writing Partner from any surface and receive relevant routing.
- Writer understands why a specialist is suggested.

### Phase 3: Prompt Tuning

Goal: responses feel like WriterOS, not a generic chatbot.

Tasks:

- Tune Writing Partner as concise generalist host.
- Tune each specialist around the surface/job they support.
- Add missing-context response guidelines.
- Test with real project samples across stages.

Success criteria:

- Responses are specific, context-aware, and usefully constrained.
- Agents ask one or two precise questions instead of broad generic prompts.

### Phase 4: Optional Orchestration

Goal: only if needed, add deeper coordination.

Possible future behavior:

- Writing Partner can generate a specialist brief internally.
- Specialist can request broader project context from app context services.
- Model-to-model delegation only after latency, cost, transcript ownership, and streaming implications are understood.

## Open Questions

1. Should the UI label specialists by names first, writing jobs first, or both?
2. Should Script have a default surface agent distinct from Maya, or should Maya own page-level dialogue/voice while Writing Partner owns general script help?
3. Should Story Bible have a unifying continuity agent later, or are Casey/Zoe enough?
4. How should WriterOS represent project stage without forcing a setup flow?
5. Should clear transcript remain immediate, or require confirmation once transcripts become long-term artifacts?

## Recommended Next Step

Implement Phase 1 only:

- Add script excerpt/dialogue context.
- Add a Writing Partner Brief.
- Feed the brief plus specialist packs to agents.
- Verify with the current *Lifeline* project:
  - Maya can rate initial dialogue.
  - Sam can identify what synopsis info is missing.
  - Alex can acknowledge limited process/project-stage data.
  - Casey, Oliver, and Zoe remain grounded.
