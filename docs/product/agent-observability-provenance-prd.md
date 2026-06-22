# WriterOS Agent Observability And Provenance Ultraplan PRD

**Date:** 2026-06-22
**Status:** Foundational PRD; build only after review
**Branch context:** `feat/morgan-m2-ask-specialist`
**Related docs:** `docs/product/agent-workflow-prd.md`, `docs/product/persona-capability-layer-prd.md`, `docs/product/writer-voice-profile-prd.md`, `docs/superpowers/plans/2026-06-21-morgan-m2-ask-specialist-staged-plan.md`

## Summary

WriterOS needs an agent observability and provenance layer.

The immediate trigger was Morgan M2 Ask Specialist: Morgan gained the ability to consult one specialist, synthesize the answer, and attribute it. The M2 trust fix now binds specialist attribution to an internal consult trace, so Morgan should not be able to say "Casey's read..." unless Casey was actually consulted in the current run.

That closes the functional M2 bug, but it does not give the operator a reliable way to inspect a live turn. The writer, developer, and admin still cannot easily answer the basic operational question:

> Did Morgan actually call Casey, what did she ask, and what happened?

This PRD owns that larger problem. It is not a user-facing receipt UI PRD. It is an under-the-hood traceability, admin diagnostics, and future memory-provenance foundation for all WriterOS agents and capabilities.

## Product Position

M2 is functionally complete once specialist attribution is protected by runtime state.

This PRD is the next foundation beneath stronger multi-agent workflows:

- M2: Morgan can consult one existing specialist and cannot fabricate source-anchored specialist attribution.
- Observability: WriterOS can prove, inspect, debug, and eventually persist what agents and tools actually did.
- Later memory: WriterOS agents can learn from interaction because memories carry source, confidence, scope, and confirmation state.

Do not smuggle this PRD into M2 as "one more fix." Build it as its own architecture layer with a clear operator/admin contract.

## Problem

WriterOS agents are moving from simple chat responses toward tool use, specialist consultation, research, composition, and eventually memory.

That makes generated prose insufficient as the record of truth.

Current failure modes:

- A transcript can say "Casey's read..." without showing whether Casey was actually called.
- A hidden tool call can succeed, fail, retry, or time out with no durable operator-visible trace.
- A guardrail can block and retry a response, but only tests or console debugging reveal why.
- A future agent memory could accidentally store an inference as a fact if provenance is not first-class.
- Live debugging depends on inference from the final answer rather than inspection of runtime events.

The Morgan M2 fabrication incident exposed the pattern:

- The system had a real tool path.
- The model could imitate the language of tool use.
- The transcript alone could not distinguish real consultation from fabricated attribution.
- The runtime needed an internal ledger to prevent the lie.
- The operator still needs a visibility layer to verify the run.

## Goals

1. Provide an admin/debug trace for every agent run.
2. Record every significant runtime event with a correlation id.
3. Make specialist/tool calls inspectable without showing debug clutter to the writer.
4. Make guardrail decisions inspectable: passed, blocked, retried, failed closed.
5. Preserve persona fluency in the user-facing transcript.
6. Establish a source-aware event model that future agent memory can reuse.
7. Make live troubleshooting fast enough for local development and production support.

## Non-Goals

- No writer-facing consult receipt UI in this PRD.
- No visible transcript redesign.
- No durable cross-agent memory implementation.
- No autonomous multi-agent orchestration.
- No analytics dashboard in the first slice.
- No raw prompt exposure to normal users.
- No storage of sensitive trace payloads without an explicit retention/privacy decision.

## Core Principle

Generated language is not the source of truth.

WriterOS should distinguish:

- what the writer said
- what an agent inferred
- what a tool was actually called to do
- what the tool returned
- what guardrails allowed or blocked
- what the final visible answer claimed
- what, if anything, is eligible for future memory

The writer can still experience one fluent collaborator. The operator needs a trace.

## Trace Model

Every agent run should get a stable `runId`.

Every meaningful internal event should attach to that `runId`.

Recommended event categories:

| Event kind | Purpose |
| --- | --- |
| `agent.run.started` | A user message entered an agent runtime |
| `agent.context.built` | Context packet was assembled |
| `tool.call.started` | A tool/capability/specialist call began |
| `tool.call.completed` | A tool/capability/specialist call succeeded |
| `tool.call.failed` | A tool/capability/specialist call failed or timed out |
| `guardrail.checked` | A deterministic guard evaluated output |
| `guardrail.blocked` | A guard rejected output and forced retry |
| `agent.final.accepted` | Final response was accepted |
| `agent.final.failed` | Runtime failed closed or exhausted retries |
| `memory.candidate.created` | Future phase: source-aware memory candidate was generated |

### Minimal Event Shape

```ts
interface AgentTraceEvent {
  runId: string;
  turnId?: string;
  timestamp: string;
  eventKind: string;
  personaId: string;
  status: 'started' | 'ok' | 'blocked' | 'error';
  durationMs?: number;
  payload?: Record<string, unknown>;
}
```

### Specialist Consult Event Shape

```ts
interface SpecialistConsultTraceEvent {
  runId: string;
  eventKind: 'tool.call.completed';
  toolName: 'askSpecialist';
  hostPersonaId: 'writingPartner';
  specialistId: 'casey' | 'sam' | 'oliver' | 'maya' | 'zoe' | 'alex';
  question: string;
  status: 'ok' | 'error';
  durationMs: number;
  responsePreview?: string;
}
```

`responsePreview` should be truncated and admin-only. Raw full specialist output may be stored later, but only after a retention/privacy decision.

## Admin Visibility Model

### Local Development

Local dev should log structured trace lines to the server terminal.

Example:

```text
[morgan] run=morgan_abc123 start persona=writingPartner
[morgan] run=morgan_abc123 askSpecialist start specialist=casey question="What does Casey think of that Ace backstory?"
[morgan] run=morgan_abc123 askSpecialist ok specialist=casey durationMs=1842 chars=921
[morgan] run=morgan_abc123 guard attribution passed consulted=casey
[morgan] run=morgan_abc123 final accepted
```

The log format should be consistent enough to grep by `runId`, `specialistId`, and `guard`.

### API Metadata

The normal user-facing API response can remain simple, but should optionally include admin/debug metadata when enabled.

Example:

```json
{
  "message": "I asked Casey. Her read is...",
  "suggestions": [],
  "debug": {
    "runId": "morgan_abc123",
    "consults": [
      {
        "specialistId": "casey",
        "question": "What does Casey think of that Ace backstory?",
        "status": "ok",
        "durationMs": 1842
      }
    ],
    "guardrails": [
      {
        "name": "specialist_attribution",
        "status": "passed"
      }
    ]
  }
}
```

This metadata should be gated by environment, admin mode, or developer setting. It should not appear in normal writer-facing UI by default.

### Future Admin Surface

A later slice may add an admin-only diagnostics panel or endpoint:

- search by `runId`
- inspect tool calls
- inspect guardrail outcomes
- see timing and failure reasons
- compare final claims to trace events

This is explicitly separate from a writer-facing receipt UI.

## Provenance And Memory Foundation

This PRD is also the foundation for future source-aware agent memory.

A memory system should not store "Maya knows Ben likes alternate line examples" as a free-floating fact. It should store:

- who observed it
- where it came from
- whether the user explicitly confirmed it
- whether it was inferred from repeated behavior
- which agent/lane may use it
- confidence level
- project scope vs writer scope
- whether it is still active

Trace events are the raw material. Memory is a promoted, reviewed, scoped interpretation of trace events.

Do not build durable learning until trace/provenance exists.

## Relationship To Existing PRDs

### Agent Workflow PRD

`agent-workflow-prd.md` defines persona roles, transcript boundaries, and surface-aware support. This PRD adds the operator-visible trace layer beneath those roles.

### Persona Capability Layer PRD

`persona-capability-layer-prd.md` says personas may use hidden capabilities while preserving persona continuity. This PRD defines how those hidden capability calls become inspectable without becoming visible collaborators.

### Writer Voice Profile PRD

`writer-voice-profile-prd.md` is writer-scoped preference and identity work. This PRD supplies the provenance requirements future profile/memory updates should satisfy.

### Morgan M2 Ask Specialist

M2 remains the functional specialist-consult milestone. Its runtime consult ledger is an early local version of this PRD's broader trace concept. M2 does not need to expose a full admin trace before PR, but this PRD should own the follow-up architecture.

## Suggested Implementation Slices

### Slice 1: Local Morgan Trace Logs

Goal: make Morgan M2 live testing verifiable from the dev terminal.

Scope:

- generate a `runId` for each Morgan runtime invocation
- log `run started`, `askSpecialist start`, `askSpecialist ok/error`, attribution guard result, and final accepted/failed
- include specialist id, question preview, duration, and response length
- no API shape change
- no UI change
- no persistence

Acceptance:

- asking Morgan to consult Casey produces terminal evidence of the Casey call
- direct Morgan answers produce no consult event
- a blocked unverified attribution logs the guard block

### Slice 2: Optional Debug Metadata

Goal: make traces inspectable through API responses in admin/dev mode.

Scope:

- extend runtime result with optional `debug` metadata
- return debug metadata from `/api/wp-chat` only when enabled
- keep normal UI rendering unchanged
- tests assert metadata is present only when debug mode is enabled

Acceptance:

- browser network tab can show the consult trace
- normal user-facing response remains `{ message, suggestions }` when debug is disabled

### Slice 3: Shared Agent Trace Schema

Goal: make tracing portable across Morgan, specialists, OpenSwarm capability calls, and document composition.

Scope:

- define shared trace event types
- route Morgan events through the shared schema
- add test helpers for trace assertions
- document privacy/retention defaults

Acceptance:

- Morgan trace events and future capability events share one schema
- tests can assert tool calls without scraping terminal logs

### Slice 4: Admin Diagnostics Store

Goal: persist recent traces for support and debugging.

Scope:

- short-lived local trace store in development
- production-ready storage decision deferred until app storage architecture is settled
- retention limits and redaction required

Acceptance:

- operator can inspect recent runs by `runId`
- sensitive payloads are truncated/redacted by default

### Slice 5: Memory Provenance Bridge

Goal: allow future agent memory candidates to cite trace events.

Scope:

- memory candidates reference source event ids
- distinguish explicit user statements from model inference
- require confirmation before global writer preferences become durable

Acceptance:

- no memory can be created without provenance
- agent-specific and global memories have scoped visibility rules

## Risks

1. **Debug metadata leaks into user experience.**
   Mitigation: gated by environment/admin mode, tests assert default absence.

2. **Trace payloads store sensitive creative material too broadly.**
   Mitigation: preview/truncation first, raw retention only after explicit storage policy.

3. **Tracing becomes noisy and unusable.**
   Mitigation: structured event kinds, correlation ids, and slice-specific log contracts.

4. **Observability turns into user-facing receipt UI prematurely.**
   Mitigation: this PRD is admin/debug first. Writer-facing receipts need a separate UX decision.

5. **Memory work starts before provenance is stable.**
   Mitigation: future memory PRD must cite this PRD and require source-aware memory events.

## Open Questions

1. Should local dev traces be plain structured text, JSON lines, or both?
2. Should debug metadata be enabled by env var, query flag, admin setting, or all three?
3. How much of the specialist response can be stored safely in a trace preview?
4. Should run ids be exposed in the visible UI for support, or only in network/admin tools?
5. What retention policy fits a future shipped product with private creative material?
6. Should guardrail events include the blocked text preview, or only the guard reason?

## Definition Of Done For The PRD

This PRD is accepted when WriterOS has a reviewed architecture path for:

- proving whether a specialist/tool call happened
- correlating a visible answer to internal runtime events
- debugging Morgan M2 consults without guessing from prose
- keeping routine writer UX clean
- supporting future source-aware agent memory

The first implementation slice should be local Morgan trace logs, not a broad dashboard.
