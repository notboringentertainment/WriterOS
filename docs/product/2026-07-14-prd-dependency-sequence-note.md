# Dependency and Sequence Note — Meeting Revisions/Pitch Packet vs. OpenSwarm Retirement

Date: 2026-07-14

Two PRDs were authored/amended today:

1. `project-meeting-revisions-pitch-packet-export-prd.md` (new)
2. `open-swarm-agent-runtime-consolidation-prd.md` (amended to code truth; retirement scope = Phases 3–4)

## Hard rule

Separate branches, separate PRs, no shared code scope. Neither PR may touch the other's files beyond incidental docs.

## Why they don't collide

- Meeting/Packet work lives in `server/room/interview/*`, `server/room/store.ts` + `lockSections.ts`, `supabase/migrations/*`, `shared/pitchPacket.ts` (new), `shared/documents.ts` (read-only), `client/src/components/ritual/*`, `client/src/lib/useInterviewSession.ts`.
- OpenSwarm retirement lives in `server/routes.ts`, `server/persona-capability/*`, `server/ai/agentRuntime|morganRuntime/*`, `scripts/dev.mjs`, `client/src/App.tsx` + `client/src/lib/wpRouting.ts`, `.env.example`, `README.md`, swarm tests.
- Only shared substrate: the `agentRuntime` kernel (used by the Writers' Room) and the Vitest suite. The Meeting PR does not modify the kernel; the retirement PR must keep room suites green (explicit acceptance gate in the amended PRD).

## Dependencies

- Both build on the merged Shared Memory Contract (PR #64, `44ea520`). Nothing else gates the Meeting PR.
- Within the Meeting PRD: ledger/migrations → context-aware audit + operations → preview diff → Pitch Packet export (rollout §).
- Within retirement: Phase 3 (native research) must merge before Phase 4 (removal + `/swarm` reroute); never one combined PR.
- The Meeting PRD's AI-proposed packet metadata uses the existing native runtime as-is; it does not need or wait for retirement Phases 3–5.

## Recommended sequence (not a dependency)

Start the Meeting/Packet branch first (pure product gap, user-visible), run retirement Phase 3 in parallel or after — the two can proceed concurrently without rebase pain given the disjoint file sets. Land retirement Phase 4 whenever Phase 3 has soaked; it removes a currently-broken path, so there is no urgency coupling.
