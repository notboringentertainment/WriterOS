# WriterOS Direction

**Date:** 2026-07-28
**Status:** Direction doc. Supersedes the ambient-agent portions of
`writers-room-runtime-prd.md`. Consistent with
`open-swarm-agent-runtime-consolidation-prd.md` (Accepted). Positions
`agent-observability-provenance-prd.md` as the trust layer.
**Evidence base:** `experiment/bounded-agent-eval` — 45 runs attempted, 42
produced findings, sealed protocol, arm-blind grading.

---

## 1. The line

**Agents investigate, check, and propose. The writer decides. Every claim shows
its evidence.**

That sentence is the product.

WriterOS has repeatedly drifted toward agents holding *final authority* over
whether work is good — the swarm, the ambient room, formatting tools dressed as
reasoning. That is the theater. It is not the same thing as agents helping with
story, and the two must not be conflated.

An agent may say *"this choice weakens his arc, and here is the passage that
shows it."* An agent may not pronounce a script good, ready, strong, or
objectively broken. The first is assistance with evidence. The second is
authority it has not earned and cannot demonstrate.

## 2. What the evidence actually supports

A sealed experiment ran three architectures over five treatments: one agent in a
single pass (**A**), one agent in two sequential passes (**A′**), and two
isolated specialist agents with synthesis (**B**).

**Scope of the test:** every planted defect was a *consistency relation* — an arc
contradicting the prose, a setup without payoff, a declared relationship absent
from the acts. Those are the only defects that could be specified in advance and
scored. The lenses instructed the model to look for breaks and never offered
"this works" as an outcome worth reaching.

### Where the models are strong

| Measure | Result |
|---|---|
| Planted consistency defects found | **24 of 25** (A′ and B) |
| Honest citation rate | **99.4% / 99.3% / 98.1%** (A / A′ / B) |
| Anchor damage through synthesis | **None** (82.7% → 82.9%, 72.0% → 72.2%) |

Given a defect that is a relation between statements, they find it and cite it
honestly. Nearly every anchor failure was a miscounted character offset on a
quote that was present and correct — arithmetic, not misattribution.

### Where they are weak

| Measure | Result |
|---|---|
| Precision on a held-out author-written treatment | **54.5% / 56.0% / 43.5%** |

Roughly half the findings on that treatment did not survive its author's
grading.

**Important qualification:** that treatment was not defect-free. Its frozen
answer key names **two known weaknesses** the author flagged in advance and
**three deliberate ambiguities**. Findings hitting those are hits or correct
readings, not fabrications. So the raw finding-volume comparison between that
page and a page with twelve planted defects proves little on its own, and is not
relied on here.

### The claim this supports, stated narrowly

> **Absence of contradiction is not presence of quality.** A checker that looks
> only for contradiction can never report that something is good — not because it
> cannot perceive, but because it is not asking.

That is a claim about the *checking* function. It is **not** a claim that agents
cannot assist with story.

### What was not tested

The experiment says nothing about agent usefulness for:

- character development, wound and motivation work
- generating and comparing structural alternatives
- outlining, beat work, sequence design
- scene energy, dialogue, voice
- synopsis, treatment, and pitch transformation
- research and continuity lookup across a project

No conclusion in this document extends to those. Anyone citing this doc to argue
that WriterOS should not help with them is misreading it.

## 3. What this kills

- **Ambient agents.** Personas that wake themselves and react unprompted.
- **Agent-to-agent conversation.** Specialists talking to each other rather than
  returning bounded typed artifacts and exiting.
- **Final authority.** Any surface where an agent pronounces work good, ready,
  strong, or broken, rather than raising a specific issue with evidence.
- **Confidence as a displayed signal.** Self-reported confidence ran 0.82–0.95 on
  findings graded false. It does not discriminate.
- **Note volume as evidence of value.** Eight findings is not eight problems.

The Writer's Room PRD's behavioral model is superseded. Its memory-block and
shared-canon mechanics remain, as described below.

## 4. What this keeps

- **Memory blocks and shared canon.** Locked decisions, character facts,
  continuity state persisting across sessions.
- **Typed proposals with writer approval.** Nothing mutates a document without an
  explicit yes.
- **Trace and provenance.** Generic execution tracing is common. WriterOS
  differentiates by binding each writer-facing claim to source passages, canon
  state, specialist task, and writer acceptance. This is the **trust layer**.
- **The native runtime.** Consolidation stays correct; no external agent service.
- **Formatting and document transformations.** As deterministic flows, not
  agents. A function producing the same output every time is a tool; the agent
  costume is what made it feel like theater.
- **Story assistance itself.** Investigating, checking, proposing, comparing
  alternatives — with evidence attached and the decision left to the writer.

### A correction on emphasis

Trace is the trust layer, not the thing users arrive wanting. Writers open a
writing tool to **develop, revise, organize, and format work**. Provenance is
what makes that assistance trustworthy enough to accept; it is not the offer.
Product surfaces should lead with the help and carry the evidence underneath.

## 5. What is still open

**Persona topology is unresolved.** One agent or several is not settled here.

| | Synthetic corpus | Held-out real treatment |
|---|---|---|
| Accepted changes per token | Specialists (0.113 vs 0.059) | Sequential (0.085 vs 0.053) |
| Precision | Sequential, narrowly | Sequential (56.0% vs 43.5%) |
| Median wall-clock | Specialists (87.2s vs 121.2s) | Specialists |

Two arm-blind gradings on separate corpora pointed in opposite directions. Both
corpora are treatment-length summaries, and the mechanism by which isolated
specialists should win — preserved attention under context pressure — is
untestable at that size. The deciding test is a long human-written document with
an answer key frozen by its author before any model sees it.

Note that specialists are **not** obviously the more complex option. Their calls
run in parallel and finish faster; sequential passes cannot overlap. "Simpler"
must be measured, not assigned from the number of agents.

### Scaffold or detect

A second question is open, and it is larger than topology because it decides
what the product is rather than how it is built.

There are two ways to keep a story sound. **Constrain the structure up front**
so a damaging choice is harder to make — a fixed beat template the writer fills.
Or **let the writer decide freely and detect the damage after**, citing the
passage. Competing tools ship the first: a fixed feature-length beat template and
a separate episode format, sold as the differentiator on top of a general model.

This document assumes the second. §1 requires it — a writer who decides cannot
be handed a template that has already decided. But the assumption should be
recorded as a choice rather than inherited silently, because the two bets fail
differently:

- A scaffold never has to judge anything, so it sidesteps the precision problem
  in §5 entirely. It pays instead in fit: every template is someone else's spine,
  and the constraint tightens as the work becomes more genuinely authored.
- Detection preserves the writer's authority and imposes no shape, but it is
  only as trustworthy as its precision — which is the blocking work below.

The falsifying condition is a product one, not an experimental one: if writers
reliably prefer a scaffold they can push against to findings they must evaluate,
the assumption is wrong, and the precision work in §5 is being done in service of
a surface people do not want. Nothing in the evaluation speaks to this. It needs
writers, not runs.

### Do not stall on this

Defer **only** the topology decision. Both architectures require the same
substrate, and it should be built now:

- typed findings and proposals
- writer approval flow
- trace and provenance
- memory and canon
- formatting and document transformations
- bounded headless workflows

None of that changes based on how many personas end up behind it.

It also does not change based on §6's open question about non-consistency
defects. Two claims about memory and canon should be kept apart, because only
one of them is a dependency:

- **Within a single supplied document, memory is not required.** An early choice
  damaging a late scene is detectable from the document itself, provided the
  whole document is in context. Whatever §6 concludes about that defect class,
  it does not establish a memory prerequisite.
- **Across documents and across sessions, memory is required.** Locked
  decisions, character facts, and continuity state are what make a relation
  checkable when the two ends are not both on the page — a canon fact set in an
  earlier session, a bible entry contradicted by a new draft, a relation
  spanning artifacts.

Build it now for the second reason, which is a real product requirement
independent of both open questions. Do not claim the first.

### The blocking work

~50% precision on real prose is what stands between this and shipping. The likely
cause is specific rather than mysterious: a consistency checker asked to render
judgment will manufacture judgments. Narrowing each call to a task it can
actually perform should shrink it. That work comes before any topology decision.

**The cost of a false positive is set by the rewrite it provokes, not by the
category of the finding.** A false note the writer skips costs nothing. A false
note the writer acts on costs a rewrite of sound work — and that rewrite is
itself a new authorial decision with its own downstream consequences. Acted-upon
false findings do not merely waste time; they can introduce the same class of
defect the finding claimed to catch. That applies at any altitude: a persuasive
false note on a single line can send a writer to rework a scene that was
working.

The variable is **rewrite radius** — how much sound material a finding puts at
risk if the writer accepts it and is wrong. Structural findings should default
to a higher evidence threshold because their likely radius is larger, not
because structural and line-level are different in kind. Where a line-level
finding carries a wide radius, it should inherit the higher threshold too.

The operative conclusion is unchanged: a single global threshold tuned to
aggregate F1 is wrong, because it prices every false positive identically when
their costs differ by an order of magnitude.

## 6. What would falsify this

1. A long-document test where isolated specialists materially beat sequential
   passes reopens the topology question.
2. A prompt design that reliably produces few or no findings on sound pages while
   still catching planted defects shows the calibration problem is task framing
   rather than capability.
3. An evaluation planting **non-consistency** defects — a scene with no pulse, a
   line that does not land — that finds models detect them at usable precision
   would falsify §2's narrow claim directly. Nobody has built that evaluation. It
   is the experiment that would actually test the ceiling.

### Specifying falsifier 3

The reason nobody has built it is that "a scene with no pulse" is not
specifiable in advance, and an unspecifiable defect cannot be planted or graded.
There is a class that *is* specifiable and still sits outside consistency
checking: **an early decision that is fully consistent with everything
downstream and still wrong.** No contradiction appears on the page. The damage
is that a later scene now has less to do.

Three plantable shapes:

- **Capability granted too early.** A character is given a skill, resource, or
  ally in act one that drains a later obstacle of difficulty. Nothing
  contradicts; the obstacle is simply no longer one.
- **Question answered before it is asked.** Information is disclosed early that
  leaves a later reveal with nothing to reveal. The reveal still parses. It just
  lands flat.
- **Want stated too plainly.** A motivation is made explicit at the start that
  a later scene was built to expose. The later scene becomes redundant rather
  than incoherent.

Each is specifiable before the model sees the page, gradeable against a frozen
key, and invisible to a checker looking only for contradiction — which is
exactly what makes it the right test of §2's narrow claim.

**This test must run on a long document.** The defect class is defined by
distance: an early choice damaging a late scene. The corpora behind §2 were
treatment-length summaries, which have no late scene. That limits how far the
24-of-25 result can be extended — a consistency relation inside a three-page
summary and one spanning ninety pages of prose may not be the same detection
task. The long-document requirement in §5 is therefore not only the topology
tiebreaker; it is the first condition under which this defect class exists at
all.

## 7. Provenance of this document

The evaluation behind it had real defects, and they should be weighed:

- The scorer contained three bugs, all found by independent review, all authored
  by the same model that wrote this doc: a defect-id collision that corrupted
  recall, a veto rule that declared a winner when every arm had failed, and a
  parser that reported every finding as a duplicate.
- The synthetic clean control was written by that same model and contained an
  ambiguous sentence responsible for six of ten apparent high-severity
  fabrications, making the clean-control safety result unreliable.
- 45 runs were attempted; **42 produced findings.** Three returned nothing.
  Thirteen further attempts failed on billing and are retained but excluded.
- Only **A′ and B were compute-matched** (12,000 output tokens each). A received
  4,000 and is a cheap baseline, excluded from the decisive comparison.
- Grading was **arm-blind but not multi-grader.** One reviewer graded both
  corpora, unblinding at recorded timestamps. Independence across corpora is not
  independence across graders.

The strongest claims in §2 survived independent recomputation. The weakest is the
topology inference in §5, which two gradings contradict.
