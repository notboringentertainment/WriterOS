# WriterOS Native Agent Runtime Consolidation PRD

Status: Accepted
Source plan: `specs/openswarm-evaluation-and-runtime-consolidation.html`

## Summary

WriterOS will retire its OpenSwarm dependency and consolidate agent execution onto a native WriterOS runtime built from the already-shipped Morgan tool loop. The change removes the external Python service, the raw OpenSwarm bridge, and the OpenSwarm-backed Zoe research hop while preserving all WriterOS personas, visible chat behavior, receipt chips, citations, voice synthesis, and composer workflows.

The product goal is not a broad rewrite. It is a targeted agent-layer consolidation: one runtime, persona-specific toolsets, stronger provenance, and writer-approved mutations.

## Problem

WriterOS currently has multiple agent execution paths serving related product goals:

- Morgan chat already runs through a native tool-capable runtime.
- Zoe world-context research routes through OpenSwarm.
- `/swarm` routes through a raw OpenSwarm Writing Partner bridge.

This creates duplicate plumbing, an external service dependency on `:8080`, weaker observability for OpenSwarm-backed work, and a split foundation for future workflow tools. OpenSwarm also sits outside WriterOS's server boundary, so it cannot safely become the long-term runtime for document composition, edit proposals, or WriterOS-native tool execution.

## Product Decision

Replace OpenSwarm with a native WriterOS agent runtime.

This decision is confirmed by Rollout step 1 evidence before replacement work proceeds.

Morgan's runtime becomes the shared kernel. Personas become runtime configurations. Capabilities and workflows become tools. Writer-facing state changes remain gated by explicit approval.

OpenSwarm agents are eliminated from WriterOS. WriterOS personas remain.

## Goals

- Remove OpenSwarm service dependency and all production HTTP bridges to it.
- Preserve all 7 WriterOS personas: Morgan, Sam, Casey, Oliver, Maya, Zoe, Alex.
- Preserve each persona's chat surface, lane, voice, and context ordering.
- Preserve Zoe's world-context research capability with same receipt and citation behavior.
- Preserve receipt chips, voice synthesis, composers, and existing UI surfaces.
- Route agent capability work through native traceable runtime events.
- Add native workflow tools for compose and gated edit proposal flows.
- Keep mutations writer-approved through propose, approve, and stale-guard checks.

## Non-Goals

- Do not overhaul editor, composer, schemas, or project storage.
- Do not rename personas or change their visible titles.
- Do not turn specialists into unrestricted tool users in one release.
- Do not keep OpenSwarm only for provider diversity.
- Do not silently remove the `/swarm` command while users may still rely on it.

## User Experience Requirements

### Personas

All personas keep their existing product identities:

| Persona | Visible role preserved |
| --- | --- |
| Morgan | showrunner / triage / synthesis |
| Sam | pitch, logline, synopsis, market-facing clarity |
| Casey | character psychology and arc |
| Oliver | structure, beats, pacing, story architecture |
| Maya | dialogue, voice, subtext, scene speech |
| Zoe | world-building, rules, systems, continuity |
| Alex | process, momentum, habits, draft progress |

No UI copy should imply Zoe has a new job. Zoe gains native research backing, not a new title.

### Zoe Research

Zoe research remains available for world-context questions. The internal engine changes from OpenSwarm to a native research tool, but the writer-facing contract stays stable:

- Zoe answers in voice.
- Receipt chip still renders.
- Sources still appear in receipts.
- Final answer citations only reference known source labels.
- Unverified findings are separated from sourced findings.
- Failures produce in-voice fallback with receipt status, not raw upstream errors.

### `/swarm` Compatibility

`/swarm <message>` remains for one release as a compatibility alias. It must route through native Morgan, not OpenSwarm.

The transcript should show a one-time notice equivalent to:

`/swarm now routes to Morgan directly; the old external bridge was retired`

No production code or test content should retain OpenSwarm identifiers for this alias after migration.

### Workflow Tools

Native runtime tools should unlock workflow actions without taking control away from the writer:

- Morgan can invoke composition through existing composer pipelines.
- Morgan can propose edits.
- Direct document mutation by an agent is not allowed.
- Proposed edits require writer approval.
- Stale anchors or changed content must block unsafe application.

Specialists remain read-only until expanded one persona/tool pair per later PR.

## Functional Requirements

### Runtime Consolidation

- Extract Morgan's tool loop into a persona-agnostic runtime kernel.
- Keep Morgan's public behavior unchanged after extraction.
- Support persona-specific tool registries.
- Support terminal response tools, capability tools, trace events, and error handling.
- Preserve existing reach/context boundaries.

### Native Research

- Replace Zoe's OpenSwarm research hop with a native research tool.
- Use bounded web research with citation discipline.
- Keep the existing research JSON contract and receipt schema stable.
- Map source results into receipt sources.
- Map final text citations back to receipt sources for `citedInFinal`.
- Treat server-tool search errors as soft failures without raw error leakage.
- Research and synthesis model calls must stream; non-streaming long generations are a known timeout failure mode.
- Support cancellation cleanly.

### OpenSwarm Retirement

- Remove OpenSwarm service startup from dev tooling.
- Remove OpenSwarm env vars and documentation.
- Remove OpenSwarm HTTP routes.
- Remove OpenSwarm client bridge code.
- Remove OpenSwarm tests or rewrite them around native compatibility behavior.
- Keep docs/history references only where useful for project history.

### Compose And Edit Proposal Tools

- Add a compose tool that wraps existing composer pipeline behavior.
- Return generated composition as a proposal/reference, not silent mutation.
- Add a propose-edit tool with workspace anchor and content hash.
- Reject stale proposals.
- Apply only after writer approval.

## Observability And Receipts

Every native capability run should produce traceable runtime events. Writer-visible receipts must remain stable where persisted schemas already exist.

Receipt behavior must cover:

- `ok`
- `soft_fail`
- `timeout`
- `cancelled`
- source list
- cited-in-final marking
- failure reason where safe
- duration and context chips where already supported

## Acceptance Criteria

- Morgan chat works through native runtime.
- Morgan specialist consult works.
- Sam, Casey, Oliver, Maya, Zoe, and Alex direct chat still work.
- Each persona keeps prompt/context ordering verified by snapshots.
- Zoe research works without OpenSwarm running on `:8080`.
- Zoe research positive path returns at least one successful sourced answer with receipt sources and citation marking.
- `/swarm` routes to native Morgan with one-time compatibility notice.
- Composer workflows still work.
- Morgan can invoke compose through native runtime.
- Gated edit proposal can be approved.
- Stale edit proposal is refused.
- No OpenSwarm service, env var, route, or bridge remains in production paths.

## Validation

Completion requires:

- TypeScript clean.
- Full Vitest suite green.
- Production build green.
- Persona snapshot tests green for all 7 personas.
- Repo-wide OpenSwarm reference check green outside docs/history/specs.
- Live end-to-end smoke with no service on `:8080`:
  - Morgan chat
  - specialist consult
  - Zoe research with receipt
  - compose via Morgan
  - approved edit proposal

## Rollout

1. Verify current OpenSwarm behavior and capture parity evidence. This step is a go/no-go gate: adverse evidence halts the rollout and reopens the decision via a plan amendment.
2. Extract shared runtime with Morgan unchanged.
3. Replace Zoe research with native research tool.
4. Retire OpenSwarm routes, dev tooling, env, docs, and bridge code.
5. Add compose and propose-edit runtime tools.
6. Expand specialist tool access later, one persona/tool pair per PR.

## Risks

- Native research quality may differ from OpenSwarm's Deep Research Agent. Mitigation: parity fixture, bounded web search, source/citation tests.
- Runtime extraction could alter Morgan behavior. Mitigation: preserve public adapter signature and run existing Morgan tests unmodified.
- `/swarm` removal could surprise users. Mitigation: one-release compatibility alias to native Morgan.
- Agent tools could mutate too much. Mitigation: proposal-only edits, writer approval, stale guards.
- Provider concentration increases. Mitigation: boxed provider client boundary; no provider-specific types outside adapter.

## Open Questions

- Which specialist gets first read-only native runtime tool after Zoe and Morgan?
- Should native research expose provider/source metadata in developer-only trace views?
