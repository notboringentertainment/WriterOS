# Memory contract — PitchStudio

**Status:** proposed, not applied. This document describes edits to a file outside this
repository (`/Users/ben/Projects/PitchStudio/PATTERN.md`). WriterOS code does not, and must
not, write to that path. Ben reviews this contract and applies the edits by hand.

**Target file:** `/Users/ben/Projects/PitchStudio/PATTERN.md` (read in full on 2026-08-15 to
anchor the edits below; v2.1, 332 lines).

---

## 1. Purpose and binding rules

PitchStudio's Step 8 export is the only bridge from its private room (`concepts/<slug>.md`,
`runs/`) to anything downstream. This contract wires that bridge to WriterOS's shared
project memory without touching PitchStudio's actual room mechanics — WRITE → ATTACK →
TABLE → REWRITE → DELIVER → EXPORT are unchanged.

Binding rules:

1. **Exports are advisory, never canon — by construction, not by convention.** Every export
   PATTERN.md produces already opens with `status: unratified` in its required header (see
   PATTERN.md's Step 8 header block). This contract does not change that header or its
   meaning; it makes explicit that `unratified` is a **permanent constant** PitchStudio
   never flips, not a pending state PitchStudio will later mark ratified.
2. **Canonization happens elsewhere, later, by a different actor.** PitchStudio has no
   promotion path of its own and this contract does not add one. If an export's decisions
   are to become canon, that happens through a **Wayfinder ratification ticket** worked
   through Wayfinder's own resolve → contradiction check → close cycle (see
   `integrations/story-wayfinder/memory-contract.md`) — never by editing the export's
   `status` field, moving it into a canon path, or telling the producer a table ruling is
   locked the moment Step 8 writes the file.
3. **Retrieve context before Step 1, not after.** The seed fidelity gate in Step 1 already
   asks whether the seed contradicts what's already decided; it should be asking against the
   project's actual active canon, not only what's in the seed and the producer's head.
4. **The table brief carries active canon and unresolved conflicts.** Step 4's TABLE BRIEF
   already lists the story, the real forks, the critics' dissents, and Morgan's leans; this
   contract adds the project's active canon and open conflicts that the current draft
   touches, so the producer rules with the same ground truth the critics attacked against.
5. **Scout emits no export — already true, no PATTERN.md edit needed.** PATTERN.md's
   existing text already states this without qualification: "Scout never exports" (Run
   modes table) and "**The one exemption: Scout does not export.**" (Step 8). Reading the
   file confirms no contradicting text exists elsewhere. This contract does not touch that
   language.
6. **Malformed or fabricated Scout exports are rejected defensively on the WriterOS side —
   already implemented, no PATTERN.md edit needed.** WriterOS's importer
   (`server/projectMemory/adapters/pitchStudio.ts`) already rejects any file whose header
   declares `run_mode: scout` with the warning `run_mode scout export rejected`, regardless
   of how the file arrived. This is a fact about the receiving end (WriterOS), not a change
   PitchStudio needs to make; it is recorded here so both sides of the contract are visible
   in one place.
7. **Export identification is already precise enough for WriterOS to find these files
   automatically — no filename change required.** WriterOS's importer identifies a
   PitchStudio export by either its `source: PitchStudio…` frontmatter header or a
   `-pitchstudio-` infix in the filename. PATTERN.md's existing filename convention,
   `YYYY-MM-DD-pitchstudio-<slug>.md`, already satisfies the filename half of that rule, and
   the required header's `source: PitchStudio v2.1` line already satisfies the frontmatter
   half. No filename or header change is proposed.

---

## 2. Proposed edits

Three edits, each as an exact **OLD** → **NEW** block from the file as read on 2026-08-15.

### Edit A — retrieve shared project memory before Step 1's work begins

**Anchor (the Step 1 heading and its opening instruction):**

OLD:
```
### Step 1 — Bank the seed + interview (unchanged from v1.2)
Create `concepts/<slug>.md` from TEMPLATE.md. Seed verbatim. Then the seed fidelity
gate: audit for locks, open questions, load-bearing relationships, stated ending.
If THIN → interview the producer with numbered, specific questions BEFORE anything runs.
Producer answers append to the seed, dated. Locks and open questions built from them.
```

NEW:
```
### Step 1 — Bank the seed + interview (unchanged from v1.2)

**Retrieve shared project memory first, if the project has one.** Before creating
`concepts/<slug>.md`, run the project's shared memory context (WriterOS's
`npm run memory -- context --project <project> --format markdown`, or the
project's memory panel) and read its active canon and any open conflicts. Treat
that active canon as load-bearing input to the seed fidelity gate below — a seed
that contradicts active canon needs an interview question about the
contradiction, not a silent overwrite. If no shared project memory exists for
this project, proceed exactly as this pattern already does.

Create `concepts/<slug>.md` from TEMPLATE.md. Seed verbatim. Then the seed fidelity
gate: audit for locks, open questions, load-bearing relationships, stated ending.
If THIN → interview the producer with numbered, specific questions BEFORE anything runs.
Producer answers append to the seed, dated. Locks and open questions built from them.
```

### Edit B — table brief includes active canon and unresolved conflicts

**Anchor (Step 4's TABLE BRIEF bullet list):**

OLD:
```
### Step 4 — The table (the producer conversation — THE step)
Morgan digests draft + attacks and brings the producer a TABLE BRIEF in chat:
- The story in ten lines
- The 2–4 REAL forks, framed as creative choices with stakes, not technical options
  ("Del says the ending teaches Ava a lesson; Jesse's draft has her feel the cost.
   Last time you ruled she ends emboldened. Which is it here?")
- The critics' strongest dissents, quoted
- Morgan's leans, with reasons, clearly marked as leans
```

NEW:
```
### Step 4 — The table (the producer conversation — THE step)
Morgan digests draft + attacks and brings the producer a TABLE BRIEF in chat:
- The story in ten lines
- The project's active canon and any unresolved conflicts (retrieved in Step 1)
  that this draft touches, so the producer rules with the same ground truth Del
  and Nora attacked against
- The 2–4 REAL forks, framed as creative choices with stakes, not technical options
  ("Del says the ending teaches Ava a lesson; Jesse's draft has her feel the cost.
   Last time you ruled she ends emboldened. Which is it here?")
- The critics' strongest dissents, quoted
- Morgan's leans, with reasons, clearly marked as leans
```

### Edit C — the advisory-only / ratification-path note on Step 8

**Anchor (the closing paragraph of Step 8's "Why non-skippable" note):**

OLD:
```
The departures section is what turns that pile into a checklist. `status: unratified`
is what stops the next session treating the document as canon before anyone agreed
to it.
```

NEW:
```
The departures section is what turns that pile into a checklist. `status: unratified`
is what stops the next session treating the document as canon before anyone agreed
to it.

**This export is advisory, never canon, by construction.** `status: unratified` is
not a temporary state this pattern will later flip to `ratified` — it is a
permanent constant on every export this pattern produces. PitchStudio has no
promotion path of its own. If the export's decisions are to become canon, that
happens later and elsewhere: a person opens a Wayfinder ratification ticket
against this file, works it through Wayfinder's own resolve → contradiction
check → close cycle, and only Wayfinder's publish step — never this export step —
writes canon. Never edit this file's `status` field, never move it into a
project's canon path, and never tell the producer a decision here is locked; it
is a recommendation with reasoning attached, exactly as advisory as anything
else in this document.
```

---

## 3. Rollback

Reverse in any order (non-overlapping regions):

- **Undo Edit C:** replace Edit C's NEW block with Edit C's OLD block (deletes the
  "This export is advisory, never canon, by construction" paragraph).
- **Undo Edit B:** replace Edit B's NEW block with Edit B's OLD block (removes the active
  canon/conflicts bullet from the TABLE BRIEF list).
- **Undo Edit A:** replace Edit A's NEW block with Edit A's OLD block (removes the
  "Retrieve shared project memory first" paragraph, restoring Step 1's heading as directly
  followed by "Create `concepts/<slug>.md`...").

After all three are reverted, the file is byte-identical to the version read on 2026-08-15,
modulo any unrelated edits Ben makes independently.

---

## 4. Environment prerequisites

- **WriterOS memory CLI reachable.** `npm run memory -- context` (from a checkout of the
  WriterOS repo) must be runnable from wherever PitchStudio sessions execute shell commands,
  for Edit A and Edit B to do anything. If it is not reachable, or the target project has no
  WriterOS project home, Step 1 and Step 4 proceed exactly as PATTERN.md already specifies
  today — retrieval is additive, not a new hard dependency.
- **No change to `notes/` or the Step 8 filename convention.** This contract does not touch
  where the export is written or how it is named; WriterOS's import-side identification
  (frontmatter `source: PitchStudio…` or a `-pitchstudio-` filename infix) already matches
  what Step 8 already produces.
- **No change to Scout's behavior.** Scout still runs Jesse sections 1–5 plus a Morgan
  verdict and produces no export; nothing in this contract adds a memory touchpoint to
  Scout, since Scout has no frame to retrieve context against in any useful way and no
  export to enrich.
