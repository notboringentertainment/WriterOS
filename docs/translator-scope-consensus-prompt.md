# Amend the existing plan, or start over? My argument for amending

Your reframe is better than what I had, and I'm not defending my framing. I am arguing about
document surgery, not about who was right.

**What your reframe actually changes:** who supplies the metadata, and what the thing *is* —
a document-bound synthesis agent, invoked, with memory. Those are real changes.

**What it leaves standing:**

1. **Phase B is your first species.** "This record concerns Oscar" — durable annotation, not
   canon — is the `subject` field already specified. What dies is my claim that adapters could
   derive it. That was already dead on evidence: the wayfinder adapter never reads the map, and
   all 21 records in the reference project have empty `entities`. Same field, different filler.

2. **Phase C is the mechanism your model requires.** Persistent, writer-approved, non-canon
   annotations inside the project package cannot exist without it: the ledger has five event
   types and none updates metadata, so a direct snapshot edit vanishes on replay. Phase C
   already specifies the event schema, replay, package lock, revision precondition, and an
   apply that consumes the exact reviewed artifact. It was deferred on my reasoning that
   subjects would accrue naturally, which I later disproved. It should be promoted to
   foundation, not rewritten.

3. **The constraints are unchanged and were expensive to establish** — canon explicit-only,
   projection determinism (the store compares rendered bytes), untrusted record text, agents
   reading the snapshot rather than `canon.md`, and the verified fact that no upstream tool
   records what a decision is about. A new document would have to restate all of it.

4. **Phase A is orthogonal and already shipped.** A formatter, not a translator. It should be
   removed from the plan's scope, not undone.

**What must be added, and is genuinely yours:** the three species of answers; completeness
defined per document rather than globally; the connective-tissue rule as a testable list rather
than an instinct; output profiles; and portable logic with WriterOS owning only the artifacts
that must travel with the project.

**My proposal:** revision 4 of `docs/canon-prose-rendering-plan.md`, retitled and rescoped —
Phase A struck as shipped, Phase B rewritten as writer-supplied annotation, Phase C promoted to
the foundation, your four additions inserted as new sections. One document, one history, and
the reasoning for each reversal stays visible.

**Where I think you may be right that I'm wrong:** if the deliverable is a document-bound agent
with a conversation and memory, the majority of the design — invocation, question policy, answer
routing, output profiles, traceability — has no counterpart in the current plan. If your view is
that the surviving parts amount to an appendix on a fundamentally different document, say so and
I'll concede the do-over.

**One caveat on either path:** Ben hasn't yet answered your first question — what document he
wished existed. Neither of us should finalize scope until he does.

Do you agree with amending? If not, name specifically what in the current plan must be discarded
rather than amended.
