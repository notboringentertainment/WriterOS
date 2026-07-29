# WriterOS Direction

**Date:** 2026-07-28
**Status:** Direction doc. Supersedes the ambient-agent portions of
`writers-room-runtime-prd.md`. Consistent with
`open-swarm-agent-runtime-consolidation-prd.md` (Accepted) and elevates
`agent-observability-provenance-prd.md` from infrastructure to product.
**Evidence base:** `experiment/bounded-agent-eval` — 45 runs, two independent
blind gradings, sealed protocol.

---

## 1. The line

**Agents do consistency, continuity, and provenance. The writer does story
judgment.**

That sentence is the product. Everything below either supports it or is
scheduled for deletion.

WriterOS has repeatedly drifted toward agents that render verdicts on whether
pages are good. That drift is what turned earlier work into theater: the swarm,
the ambient room, formatting tools dressed as reasoning. They performed
discernment they did not have.

The line is not a limitation reluctantly accepted. It is where the measured
capability actually is.

## 2. Why — the evidence

A sealed experiment ran three architectures over five treatments: one agent in a
single pass, one agent in two sequential passes, and two isolated specialist
agents with synthesis. All arms received identical lenses, identical output
contracts, and identical token allowances.

### Where the models are strong

| Measure | Result |
|---|---|
| Planted consistency defects found | **24 of 25** (both multi-call arms) |
| Honest citation rate | **99.4% / 99.3% / 98.1%** |
| Anchor damage through synthesis | **None** (82.7% → 82.9%, 72.0% → 72.2%) |

Given a defect that is a *relation between statements* — an arc that contradicts
the prose, a setup with no payoff, a declared relationship absent from the acts —
they find it, and they cite it honestly. Nearly every anchor failure was a
miscounted character offset on a quote that was present and correct.

### Where they are weak

| Measure | Result |
|---|---|
| Precision on a treatment its author considers sound | **54.5% / 56.0% / 43.5%** |
| Findings on that page vs a page with 12 planted defects | **~7.4 vs 12.2 per run** |

Roughly half the notes on sound pages do not survive the author's grading. Output
volume barely tracks whether anything is wrong.

### The honest caveat

The evaluation's own design contributed to this. Every planted defect was a
consistency relation, because those are the only defects that could be specified
in advance and scored. The lenses instructed the model to look for breaks and
never offered "this works" as an outcome worth reaching. A fault-finder finds
faults.

So the weakness is not evidence that models cannot perceive story quality. It is
evidence of something narrower and more useful:

> **Absence of contradiction is not presence of quality.** A system that only
> looks for contradiction can never report that something is good — not because
> it cannot feel, but because it is not asking.

There is no path from *"I found nothing wrong"* to *"this is alive."* That gap is
structural. It is the reason story judgment stays with the writer.

## 3. What this kills

Delete, or never build:

- **Ambient agents.** Personas that wake themselves and react to work unprompted.
- **Agent-to-agent conversation.** Specialists talking to each other rather than
  returning bounded typed artifacts and exiting.
- **Verdict surfaces.** Any UI where a persona pronounces on whether pages are
  good, ready, working, or strong.
- **Confidence as a signal.** Self-reported confidence ran 0.82–0.95 on findings
  that were graded false. It does not discriminate and must not be surfaced.
- **Note volume as evidence of value.** Eight findings is not eight problems.

The Writer's Room PRD's "seven persistent agents who speak to each other and
react to the writer's work without being summoned" is superseded on every clause
after "persistent."

## 4. What this keeps

All of the infrastructure survives. It is the story-judgment claim that dies.

- **Memory blocks and shared canon.** Locked decisions, character facts,
  continuity state persisting across sessions.
- **Typed proposals with writer approval.** Nothing mutates a document without an
  explicit yes.
- **The trace layer.** `agent-observability-provenance-prd.md` moves from plumbing
  to the centerpiece. "Did Morgan actually call Casey, what did she ask, what
  happened" is the differentiator — Mem0 stores facts, RAGFlow cites sources,
  neither answers what the system did.
- **The native runtime.** Consolidation stays correct; no external agent service.
- **Formatting tools.** As deterministic flows, not agents. A function that
  produces the same output every time is a tool. Giving it an agent costume is
  what made it feel like theater.

## 5. What is still open

**Architecture is unresolved.** One agent or several is not settled and this doc
does not settle it.

| | Synthetic corpus | Held-out real treatment |
|---|---|---|
| Better accepted-changes per token | Specialists (0.113 vs 0.059) | Sequential (0.085 vs 0.053) |
| Better precision | Sequential, narrowly | Sequential (56.0% vs 43.5%) |
| Median wall-clock | Specialists faster | Specialists faster (87.2s vs 121.2s) |

Two independent blind gradings pointed in opposite directions. Both short corpora
are treatment-length summaries, and the mechanism by which isolated specialists
should win — preserved attention under context pressure — is untestable at that
size.

**The deciding test has not run:** a long human-written document with an answer
key frozen by its author before any model sees it.

Until then, neither "collapse the personas into tool-modes" nor "build the
workflow kernel" is supported. Build neither.

Note also that specialists are **not** obviously the more complex option. Their
calls run in parallel and finish faster; sequential passes cannot overlap.
"Simpler" should be measured, not assigned from the number of agents.

## 6. What this means for the product

The tool WriterOS can honestly ship today is a **continuity and consistency
instrument with provenance** — not a story editor.

It answers:

- Does the arc statement match what the pages show?
- Was this established before it paid off?
- Which draft did this claim come from, and which specialist produced it?
- Has this character's stated need been tested anywhere?

It does not answer whether a scene works, whether a line lands, or whether the
draft is ready. Those questions go to the writer, and the interface should not
imply otherwise.

This is narrower than the original ambition and considerably more defensible.
None of the ten most-starred agent repos does it, and the experiment shows the
models are genuinely good at it.

### The precision problem is the blocking work

~50% precision on sound pages is what stands between this and shipping. The
likely cause is now specific rather than mysterious: a consistency checker asked
to render judgment will manufacture judgments. Narrowing the task to what it can
actually do should shrink the problem to something fixable.

That work comes before any architecture decision.

## 7. What would falsify this

Stated so it can be attacked:

1. A long-document test in which isolated specialists materially beat sequential
   passes would reopen the kernel question — though not the story-judgment claim.
2. A prompt design that reliably produces few or no findings on sound pages and
   still catches planted defects would show the calibration problem is task
   framing rather than capability.
3. An evaluation that plants *non-consistency* defects — a scene with no pulse, a
   line that does not land — and finds models detect them at usable precision
   would falsify §2 directly. Nobody has built that evaluation. It is the
   experiment that would actually test the claim.

## 8. Provenance of this document

Written after an experiment whose scorer contained three bugs, all found by
independent review, all mine: a defect-id collision that corrupted recall, a veto
rule that declared a winner when every arm had failed, and a parser that reported
every finding as a duplicate. The clean-control document was also written by the
same model that graded the pilot, and turned out to contain an ambiguous sentence
that produced six of ten apparent fabrications.

Conclusions here should be weighted accordingly. The strongest claims in §2 rest
on measurements that survived independent recomputation; the weakest is the
inference in §5, which two gradings contradict.
