# WriterOS Persona Capability Layer PRD

**Date:** 2026-05-14  
**Status:** Draft for product alignment  
**Branch context:** `feature/screenplay-editor-core`  
**Related docs:** `docs/product/agent-workflow-prd.md`, `docs/product/writer-voice-profile-prd.md`, `docs/product/writeros-future-work-prd.md`

## Summary

WriterOS personas are the user-facing collaborators. OpenSwarm is not a second visible agent surface; it is a capability layer that WriterOS personas can use when a request needs a bounded task, research pass, document operation, or external specialist workflow.

From the writer's perspective, there is one Zoe, one Sam, one Maya, one Writing Partner. Those collaborators may use deeper tools behind the scenes, but the relationship, transcript, and final answer stay in WriterOS.

The product thesis:

> A question can become a task, but the collaborator should remain continuous.

## Problem

Recent OpenSwarm bridge testing proved useful plumbing:

- WriterOS can package project context.
- WriterOS can include a completed writer-scoped Voice Profile.
- OpenSwarm can receive a bounded handoff packet.
- OpenSwarm task state remains separate from WriterOS transcript state.
- Empty project surfaces can be represented honestly.
- Swarm output can be shaped as a concise task report.

But testing also exposed a product framing gap:

- `/swarm` made OpenSwarm feel like a separate visible agent.
- "Swarm Writing Partner" looked like a second Writing Partner instead of a tool result.
- Task-report formatting was useful for internal handoff clarity, but not always right as the final user-facing answer.
- Users should not need to know whether Zoe answered directly or used a research/tool capability unless transparency or citation matters.

The existing PRDs describe Writing Partner, Writer's Room specialists, Voice Profile, and context packaging. They do not yet define OpenSwarm as an invisible or lightly surfaced capability layer behind those personas.

## Core Product Decision

OpenSwarm should be treated as a persona capability layer, not as a parallel agent UX.

### Visible Layer

WriterOS personas remain the only visible collaborators:

- Writing Partner
- Sam
- Casey
- Oliver
- Maya
- Zoe
- Alex

All conversational continuity belongs to WriterOS transcripts.

### Capability Layer

OpenSwarm may run task-oriented capabilities behind the current persona:

- research
- current/recent fact gathering
- structured analysis
- document generation or transformation
- multimodal asset work
- specialist task reports
- bounded critique against a context packet

OpenSwarm output is an intermediate artifact unless the user explicitly asks to see the raw task report.

### Final Response Layer

The visible WriterOS persona synthesizes the task result into the user's current conversation.

Example:

- User asks Zoe for color in a scene outside Damascus Gate.
- Zoe answers directly from supplied project context and general craft knowledge.
- User asks Zoe for background research on the gate's construction period and a transition into a present-day tour-guide arrival.
- Zoe invokes a research-capable task path.
- OpenSwarm returns a grounded research/task packet.
- Zoe responds as Zoe with scene-usable details, constraints, and transition options.

The user experiences this as Zoe getting better help, not as leaving Zoe.

## Product Principles

1. **Persona continuity is sacred.**  
   The visible collaborator should not split into WriterOS Zoe vs OpenSwarm Zoe.

2. **Tool calls are not relationships.**  
   OpenSwarm may produce task output, but it does not own the WriterOS conversation.

3. **Context packets are explicit and bounded.**  
   Every tool invocation should know what WriterOS supplied and what is absent.

4. **Task state is not transcript state.**  
   OpenSwarm threads, assistant state, logs, and intermediate outputs must not become WriterOS transcript history.

5. **Final answers belong in WriterOS voice.**  
   The user-facing response should feel like the selected persona using a tool, not like a tool talking over the persona.

6. **Transparency without clutter.**  
   Users should be able to inspect what context/tool was used, but routine answers should not become debugging reports.

7. **No premature autonomous orchestration.**  
   Start with explicit routing rules and limited tool paths before LLM-to-LLM planning.

## User Experience Model

### Direct Persona Answer

Use when the visible persona has enough in-app context and no external/source-backed task is needed.

Example:

```text
Zoe, help me describe a scene where my character stands in the old city of Jerusalem in front of Damascus Gate.
```

Expected behavior:

- Zoe responds directly.
- She uses project tone, Story Bible, Script context, and Voice Profile if relevant.
- No OpenSwarm task is needed.

### Persona Tool Invocation

Use when the request needs research, task execution, or structured analysis beyond the local WriterOS packet.

Example:

```text
Zoe, my character is an expert tour guide. Do a little background research so we can transition from the gate's construction period to my character arriving in front of it.
```

Expected behavior:

- Zoe remains the visible collaborator.
- WriterOS builds a bounded task packet.
- OpenSwarm or a research-capable agent performs the task.
- Zoe synthesizes the result into scene-useful guidance.
- The transcript stores Zoe's final response, not the raw OpenSwarm thread.

### Explicit Task Report

Use when the user asks for a memo, report, audit, checklist, or explicitly invokes a debug/manual command.

Example:

```text
/swarm Review this project against my Voice Profile and return a concise task report.
```

Expected behavior:

- WriterOS may expose a task-report style answer.
- Output should be plain-text memo format, not chatty persona banter.
- This remains a debugging/manual affordance, not the primary product path.

## `/swarm` Status

`/swarm` is useful as a bridge-test and manual override command, but it should not define the final UX.

Current acceptable uses:

- developer smoke testing
- explicit bounded task reports
- validating context packet shape
- validating completed Voice Profile handoff
- validating missing-context behavior

Not final product behavior:

- separate "Swarm Writing Partner" identity
- forcing users to choose OpenSwarm as a destination
- replacing natural persona conversations with raw tool reports

## Architecture Direction

### Current Bridge Foundation

The current bridge can remain as the lower-level task transport:

```text
WriterOS client
  -> /api/openswarm/writing-partner
  -> OpenSwarm /open-swarm/get_response
  -> task result
```

This proved the transport, schema, Voice Profile inclusion, context inventory, and blank-surface behavior.

### Capability Preservation

Useful OpenSwarm agents from the original repo should be preserved when they provide durable capabilities that WriterOS personas can call.

The preservation rule:

- do not preserve old agents as competing user-facing personas
- do preserve useful agents as callable tools behind WriterOS personas
- expose the WriterOS persona as the collaborator and the OpenSwarm capability as the workshop/tool
- keep generated assets, documents, task packets, and receipts separate from conversational transcript state

Priority capability candidates:

| Original capability | Priority | WriterOS use | Visible persona examples |
| --- | --- | --- | --- |
| Document / Docs Agent | High | render, transform, export, or polish professional documents such as outlines, synopses, treatments, story bibles, pitch pages, PDFs, DOCX, and markdown | Writing Partner, Sam, Oliver, Alex |
| Image Creation Agent | High | create visual references, mood frames, office/location references, character or prop studies, visual style boards, and AI-production reference assets | Zoe, Writing Partner, Alex |
| Video Creation Agent | Later | create mood reels, motion tests, transition studies, animatics, or visual proof-of-concept clips when cost/latency/asset review is acceptable | Alex, Zoe, Writing Partner |
| Generic original swarm personas | Low | keep only if they provide a distinct capability that WriterOS personas do not already cover | none by default |

Example:

```text
User: Zoe, I need a visual reference of Isaiah's office.
```

Expected behavior:

- Zoe remains the visible collaborator.
- Zoe builds or requests a visual-reference task packet from project context.
- The image capability generates one or more reference options.
- Zoe returns with the image(s), scene-useful notes, and any continuity caveats.
- The image task receipt is inspectable, but the user does not experience "Image Agent" as a separate collaborator.

Document capability should also support the structured-surface page view direction. WriterOS should own the deterministic document schema and renderer; the document capability can help evaluate, polish, transform, or export the authored artifact without reinventing formatting per project.

### Next Abstraction

Add a higher-level persona task layer above the raw bridge.

Illustrative shape only; the final signature should be decided in Phase 2 design.

Possible shape:

```typescript
runPersonaTask({
  personaId,
  taskKind,
  userRequest,
  projectContext,
  voiceProfile,
  sourceSurface,
})
```

Responsibilities:

- decide whether the request needs a tool/capability path
- build the bounded task packet
- call the appropriate OpenSwarm capability
- keep raw task state out of WriterOS transcripts
- return a task result to the visible persona response path

### Final Response Flow

For a tool-assisted persona answer:

1. User sends message to WriterOS persona.
2. WriterOS builds project context and loads completed Voice Profile if present.
3. Routing decides direct answer vs capability invocation.
4. Capability invocation returns a task result.
5. WriterOS persona composes the final answer.
6. Final answer is saved in the existing WriterOS transcript.
7. Optional context/task receipt is stored or displayed separately.

## Context Packet Requirements

Every persona capability invocation should include:

- visible persona id
- user request
- active WriterOS surface
- project context inventory
- relevant project material
- completed Voice Profile if available
- missing-context summary
- task output requirements

It should not include:

- WriterOS transcripts unless explicitly needed and scoped
- Writer's Room specialist transcripts by default
- OpenSwarm assistant/thread history as WriterOS state
- draft Voice Profiles
- generated summaries that are stale or not user-approved

## Response Contract

### Intermediate Task Result

Task results should be concise, structured, and packet-grounded:

- plain text
- clear section labels
- evidence from supplied packet or cited research
- missing context named explicitly
- no claims of hidden WriterOS access
- no persona relationship performance

### Final Persona Response

Final responses should:

- sound like the visible WriterOS persona
- synthesize the task result into useful creative guidance
- preserve the user's requested level of detail
- cite or summarize sources when research was used
- optionally mention that a research/task pass was used when trust matters
- avoid exposing implementation names unless the user asked

## Relationship To Voice Profile

Voice Profile remains writer-scoped and separate from project state.

For direct persona answers:

- completed Voice Profile should be available where relevant.
- persona-specific profile slices should be used, not the entire profile everywhere.

For OpenSwarm capability calls:

- completed Voice Profile may be included when the task needs writer-voice alignment.
- draft profiles must not be included.
- Voice Profile should be labeled as writer identity, not project canon.

This PRD does not replace the remaining Phase 3 work in `writer-voice-profile-prd.md`: normal `/api/wp-chat` persona consumption still needs implementation.

## Relationship To Context Visibility

This PRD increases the importance of context visibility.

Recommended UI:

- `Context sent` inspector for each AI response.
- `Task used` receipt when a persona invoked OpenSwarm.
- Compact chips such as:
  - Voice Profile
  - Logline
  - Script excerpt
  - Story Bible
  - Research task
  - Missing: Characters

Purpose:

- users can trust what the persona reviewed
- users can see when a tool was used
- debugging does not require reading server logs

## Decisions Required Before Phase 2 Coding

The conceptual model is approved, but Phase 2 should not begin until these decisions are treated as product requirements rather than open questions.

### 1. Routing Authority

WriterOS owns routing authority.

Rules:

- The visible persona may suggest that a capability is needed.
- A model may classify intent only inside a narrow allowlist.
- The WriterOS orchestration layer decides whether a capability can run.
- OpenSwarm cannot self-route into new WriterOS-visible personas.
- Ambiguous requests should stay as direct persona answers or ask for confirmation.

Phase 2 should start with one explicit allowlisted path, preferably Zoe plus research/world-context, before broad automatic routing.

### 2. Tool Invocation Mode

Phase 2 supports limited automatic invocation only when intent is clear and the capability is allowlisted.

Also supported:

- explicit user requests such as "research this" or "generate a visual reference"
- `/swarm` as manual/debug task-report command

Not supported in Phase 2:

- autonomous multi-step agent planning
- model-selected arbitrary tools
- hidden chaining across multiple capabilities

### 3. Voice Profile Boundary

Completed Voice Profile may cross the capability boundary only when relevant to the task.

Rules:

- draft profiles are never sent
- completed profiles are sliced by persona/task need
- capability packets should label the profile as writer identity, not project canon
- receipts may show a `Voice Profile used` chip, but should not expose raw profile text by default
- users should eventually be able to disable profile injection for a capability call

Acceptance:

- if profile injection is disabled or no completed profile exists, the capability packet contains no `voiceProfile` field
- final persona response should not imply a profile was used when it was not

### 4. Minimum Task Receipt Moves To Phase 2

Phase 4 can own rich context controls, but Phase 2 needs a minimum receipt so tool use is trustworthy from the first production slice.

Minimum Phase 2 receipt:

- visible persona
- capability class
- task status: started, completed, failed, canceled, or timed out
- context chips, including supplied surfaces and missing surfaces
- whether Voice Profile was used, without raw profile text
- source count for research tasks
- artifact ids for generated documents/images/videos when persisted

The receipt may live in transcript metadata or a lightweight inspector. It should not be pasted into the assistant message body unless the user asks.

### 5. Asset And Document Storage

Capability outputs must follow artifact-specific storage rules.

Rules:

- final persona responses live in WriterOS transcripts
- intermediate task packets and raw capability output do not become transcript messages
- generated images, videos, PDFs, DOCX files, and other assets need a project-scoped asset registry before they are persisted
- until an asset registry exists, image/video capabilities may return a brief, prompt, or temporary preview, but should not silently create durable project assets
- document page views generated from WriterOS structured surfaces should use deterministic WriterOS renderers, not model-invented formatting
- exported documents should be explicit user actions and should reference the same deterministic document renderer

Acceptance:

- generated assets are not embedded directly in transcript message bodies
- persisted assets survive reload and are referenced by artifact id
- deleting or clearing a transcript does not delete project artifacts unless the user explicitly asks

### 6. Writer's Room Availability

Capability invocation inside Writer's Room specialist transcripts is deferred until Phase 3.

Phase 2 scope:

- capability invocation happens through the main WriterOS persona path, likely the left rail / Writing Partner-mediated flow
- Writer's Room specialist transcripts remain direct specialist chat without capability calls

Reason:

- one surface at a time keeps transcript ownership, receipts, and failure handling testable

### 7. Source And Citation Discipline

Research-backed capability calls must not launder unsourced claims into confident persona answers.

Rules:

- research task outputs should include source metadata where possible
- final persona responses should cite or summarize sources when source-backed claims matter
- if a claim is useful but unsourced, the persona must label it as unsourced or treat it as a creative assumption

Acceptance:

- a research task that returns a factual claim without a source cannot be presented as established fact

## Implementation Phases

### Phase 0: PRD Alignment

Goal: confirm the product model before more code.

Tasks:

- Approve OpenSwarm as a capability layer behind personas.
- Approve `/swarm` as debug/manual task-report command, not primary UX.
- Approve visible persona continuity.
- Approve task result vs final persona response distinction.

Success criteria:

- Team language stops saying "OpenSwarm Zoe" as a user-facing persona.
- Future work can distinguish transport, task result, and final response.

### Phase 1: Preserve And Label Current Bridge

Goal: keep the working bridge while preventing product confusion.

Tasks:

- Keep current `/api/openswarm/writing-partner` transport.
- Treat `/swarm` as manual/debug command in docs and UI copy.
- Keep context inventory and blank-surface safeguards.
- Keep plain-text task report contract for explicit reports.

Success criteria:

- Existing bridge tests remain green.
- Manual `/swarm` still helps validate packet quality.
- Users are not encouraged to treat `/swarm` as normal conversation.

### Phase 2: Add Persona Capability Adapter

Goal: make personas able to use OpenSwarm without exposing a second identity.

Tasks:

- Add a small orchestration layer for persona tasks.
- Implement the Phase 2 decision gate above: routing authority, profile boundary, minimum receipt, storage rules, Writer's Room deferral, and source discipline.
- Start with one persona/tool pair.
- Recommended first slice: Zoe + research/world-context task.
- Limit Phase 2 invocation to the main WriterOS persona path; defer Writer's Room specialist capability calls.
- Return task result to the visible persona path.
- Store only the final persona answer in the WriterOS transcript.
- Store a minimum task receipt outside the assistant message body.
- Add failure, cancel, and timeout handling before enabling user-facing capability calls.

Success criteria:

- User asks Zoe a research-backed world question.
- Research/task capability runs behind the scenes.
- Zoe answers as Zoe.
- Context/task receipt is inspectable.
- OpenSwarm thread state is not imported into WriterOS transcript state.
- Failed, canceled, or timed-out capability calls produce in-voice fallback responses and do not create orphan transcript entries.

### Phase 3: Expand Capability Matrix

Goal: map persona needs to capability types.

Initial matrix:

| Persona | Capability examples |
| --- | --- |
| Writing Partner | broad task triage, packet review, routing brief, document/export routing, visual-reference routing |
| Sam | comps research, pitch-market framing, synopsis audit, pitch document polish/export |
| Casey | psychology/relationship research when explicitly needed, character dossier audit |
| Oliver | structure audit, beat causality report, outline document polish/export |
| Maya | dialogue style references, dialect/period language research, dialogue sample transformation |
| Zoe | world/history/continuity research, setting logic, visual reference and style-board generation |
| Alex | process planning, treatment-to-pages readiness audit, treatment document polish/export, mood-reel or proof-of-concept planning |

Capability class matrix:

| Capability class | Priority | Primary value |
| --- | --- | --- |
| Research | High | source-backed context for history, setting, markets, comps, technical details, and real-world analogs |
| Document | High | consistent page/document artifacts from WriterOS structured surfaces |
| Image | High | visual reference generation for settings, characters, props, tone, and AI-production continuity |
| Video | Later | expensive/slow visual proof-of-concept work after asset management and review flows exist |

Success criteria:

- each capability has clear trigger rules
- each capability returns bounded task output
- final responses stay in persona voice
- capability outputs are stored, displayed, or discarded according to artifact type, not silently merged into transcripts
- document formatting remains deterministic from WriterOS schemas rather than model-invented per project

### Phase 4: Context Visibility And Controls

Goal: expand the minimum Phase 2 receipt into richer user controls without cluttering the writing flow.

Tasks:

- Upgrade `Context sent` / `Task used` receipt UI.
- Allow user to inspect task packet summary.
- Show missing WriterOS surfaces.
- Add controls for profile inclusion, selected context, and explicit task retry where appropriate.
- Avoid exposing raw private Voice Profile content by default.

Success criteria:

- user can tell why the persona answered the way it did
- user can tell whether OpenSwarm was used
- no server log inspection needed for normal QA

## Non-Goals

- No autonomous multi-agent planning loop in this PRD.
- No merging OpenSwarm assistant/thread state into WriterOS transcripts.
- No visible duplicate personas.
- No mandatory `/swarm` workflow.
- No backend storage redesign.
- No cloud sync or account system.
- No automatic project mutation from tool output.
- No research claims without source/citation strategy.

## Risks

### Persona Split

If tool output is shown raw too often, users will feel like they are talking to two Zoes. Keep raw reports optional or explicit.

### Hidden Tool Confusion

If tools run invisibly with no receipt, users may not trust sourced claims. Add context/task visibility.

### Over-Orchestration

If every question becomes a task, normal writing flow slows down. Use tools only when needed.

### Profile Overuse

If Voice Profile appears in every answer, responses become self-conscious. Use it where relevant.

### Research Safety

Historical/current research needs source discipline. Persona synthesis should not launder unsourced task output into confident claims.

## Success Matrix

| Scenario | Expected result |
| --- | --- |
| Blank project + completed Voice Profile + `/swarm` report | Task report uses Voice Profile, says project context is missing, names surfaces to fill |
| Project logline + completed Voice Profile + `/swarm` report | Task report evaluates logline against profile and context inventory |
| Zoe setting-color request with no research need | Zoe answers directly in WriterOS voice |
| Zoe historical/research request | Zoe invokes capability, then answers as Zoe with grounded scene-useful guidance |
| Draft Voice Profile exists | No profile is sent to capability layer |
| OpenSwarm task completes | Only final persona response enters WriterOS transcript |
| User inspects context | UI shows packet summary and tool receipt without exposing raw private profile by default |
| Capability call errors mid-turn | Persona returns an in-voice fallback; receipt shows `Task: failed`; no orphan transcript entry is created |
| User cancels mid-capability | OpenSwarm task is aborted; no transcript entry is created; no asset is persisted |
| Capability call times out | Persona returns an in-voice fallback; receipt shows timeout; no orphan task state is imported |
| Two consecutive Zoe research calls | Calls use distinct OpenSwarm thread ids; no cross-call memory leaks into WriterOS |
| Receipt inspected with Voice Profile included | Presence chip is shown; raw profile text is not shown by default |
| User-facing UI string check | The literal `OpenSwarm` appears only in debug/developer UI or explicit technical receipts, not normal persona copy |
| Image capability output is persisted | Asset is stored in a project-level asset registry, survives reload, and is referenced from transcript metadata rather than embedded in message body |
| Research task returns claim without source | Final persona response either includes source context or labels the claim as unsourced/assumption; it is never presented as established fact |
| Writer's Room specialist asks for capability in Phase 2 | Specialist gives an in-voice explanation that capability calls are available through the main persona path for now, or asks the user to run the task there |

## Open Questions

1. Which persona/tool pair should be the first production slice after Writing Partner bridge testing?
2. What exact source/citation UI should research-backed persona responses use?
3. Should `/swarm` become developer-only after one production persona capability path and minimum task receipts ship?
4. Should the minimum receipt live first in transcript metadata, a side-panel inspector, or both?
5. What is the minimum viable project asset registry for persisted images, videos, PDFs, and DOCX exports?

## Recommended Next Step

Do not rebuild the current bridge. Keep it as the lower-level transport.

Next product slice:

1. Add this PRD as the new source of truth for OpenSwarm integration.
2. Add minimal context/task visibility for `/swarm` and future tool-assisted persona responses.
3. Implement one persona capability adapter, preferably Zoe + research/world-context task.
4. Verify final answers preserve visible persona continuity while tool/task state stays separate.
