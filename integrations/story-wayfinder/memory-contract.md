# Memory contract — Story Wayfinder

**Status:** proposed, not applied. This document describes edits to a file outside this
repository (`/Users/ben/.claude/skills/story-wayfinder/SKILL.md`). WriterOS code does not,
and must not, write to that path. Ben reviews this contract and applies the edits by hand,
after which he runs the manual harness gate described below before treating the edited
skill as live.

**Target file:** `/Users/ben/.claude/skills/story-wayfinder/SKILL.md` (read in full on
2026-08-15 to anchor the edits below; 178 lines, no YAML ticket fences — ticket and export
headers are bare `key: value` lines under an H1).

---

## 1. Purpose and binding rules

Story Wayfinder is the decision layer that produces a project's canon before drafting
starts. This contract wires its ticket lifecycle to WriterOS's shared project memory
(`npm run memory -- context|import`, Task 5/6 of Unified Project Memory V1) without
changing what the skill fundamentally does: a project with no WriterOS home works exactly
as Wayfinder has always worked — dry, local, markdown-only.

Binding rules, in the order they bite during a session:

1. **Read before choosing.** A session loads shared project memory context before choosing
   which ticket to work, so a writer never resolves a ticket blind to canon set elsewhere
   (a Buzz room, a PitchStudio table ruling already ratified, an earlier WriterOS session).
2. **Canon predicate is stricter than "any grill or sketch."** A resolved ticket publishes
   as canon only when **both** `type ∈ {grill, sketch}` **and** `mode: hitl` hold. This is
   the controller preflight ruling, and it supersedes an earlier looser draft of this rule
   ("regardless of mode") that would have let an AFK grill or sketch masquerade as canon.
   Wayfinder's own rule already says only HITL tickets lock story decisions (SKILL.md, "A
   HITL ticket only resolves through live exchange... Only HITL tickets can lock story
   decisions"), so this predicate is not a new constraint on the skill's behavior — it is
   the existing constraint, now also enforced at the memory boundary. WriterOS enforces this
   independently at import time regardless of what this file says (`runImport` in
   `server/projectMemory/cli.ts` rejects any wayfinder active-canon record whose authority
   is not `{mode: 'hitl', ticketType: 'grill'|'sketch'}`), so a stale or mis-edited SKILL.md
   cannot itself smuggle non-HITL canon into the archive — but the skill's own text should
   say the true rule rather than a looser one.
3. **Homework publishes as development regardless of mode.** `type: homework` never carries
   canon authority (grill/sketch do); its resolved answer publishes as development material
   whether the ticket ran `hitl` or `afk`.
4. **Contradiction check includes active canon.** Step 2 of "Working a ticket" — the
   contradiction check — reads the project's active canon (not only this map's own
   Decisions so far) before a provisional answer can close.
5. **Publish order is contractual and unchanged.** SKILL.md's own text states the order
   explicitly at line 143: "The order below is the contract; a provisional answer is not
   canon until step 3 completes." Publishing to shared memory is one more thing that
   happens **at or after Close (step 3)** — never between the contradiction check (step 2)
   and Close (step 3). This contract does not renumber that constraint away; it adds a new
   step immediately after Close.
6. **Reopening publishes as a proposal, never a silent retraction.** The memory store does
   not auto-retract prior canon when a ticket is reopened. Reopening publishes the ticket's
   new state (question plus the prior answer, preserved as `## Superseded answer`) as an
   open question — a **supersession proposal** — that only takes effect on canon once the
   reopened ticket completes a fresh resolve → contradiction check → close cycle and
   republishes.
7. **Local, non-cloud project home required to publish for real.** Publishing (an actual
   write, `--apply`) requires the project's `.writeros` package (containing `project.json`)
   to sit on local, non-cloud-synced storage. A project whose `.writeros` package lives
   inside an iCloud Drive, Dropbox, Google Drive, or similar synced folder — or that has no
   WriterOS project home at all — stays **dry-run only** (`--dry-run`): the skill may show
   the writer what would publish, but must not apply it. This is what keeps a project like
   Bloodless, which currently has no local project home, from silently gaining canon writes
   the day this contract lands; it stays dry-run until Ben explicitly creates a local home
   for it.
8. **If memory is unavailable, ask — don't fail silently and don't block.** A CLI error, a
   missing project, or any other failure reaching shared memory is not a reason to stop the
   session or to pretend memory doesn't exist. Say so, ask the writer whether to continue
   without it, and keep going with the map and its files as the source of truth either way.

None of this changes the sketch boundary, the assets rules, the fog/ticket/out-of-scope
rule, or the reopening mechanics already in SKILL.md. It only tells the skill when and how
to talk to shared project memory around the edges of what it already does.

---

## 2. Proposed edits

Four edits. Each is given as an exact **OLD** block (verbatim from the file as read on
2026-08-15) and the **NEW** block that replaces it — apply with a literal find-and-replace
so there is no renumbering ambiguity. Apply them in the order listed; each edit's OLD text
is still present in the file when the edit before it has been applied (they touch
non-overlapping regions, so order does not actually matter, but this is the order that
reads most naturally top to bottom).

### Edit A — insert a new "Shared project memory" section

**Anchor (the boundary between "Ticket types" and "Fog, ticket, or out of scope"):**

OLD:
```
- **Homework** (hitl or afk): Work that must happen before a decision can be discussed — rewatch the comp pilot, re-read the old treatment. Resolved when done; the answer records what was done and any facts later tickets depend on. Groundwork only.

## Fog, ticket, or out of scope — one rule
```

NEW:
```
- **Homework** (hitl or afk): Work that must happen before a decision can be discussed — rewatch the comp pilot, re-read the old treatment. Resolved when done; the answer records what was done and any facts later tickets depend on. Groundwork only.

## Shared project memory

If the project has a WriterOS project home, wayfinder sessions read and write that
project's shared project memory — the canon and development record shared with
PitchStudio and Buzz. This is optional infrastructure: a project with no WriterOS
home works exactly as this skill has always worked, dry, local, markdown-only.

**Reading.** Before choosing a ticket (see "Work through the map" below), load the
project's shared memory context and read its active canon and open conflicts
alongside MAP.md. The contradiction check (see "Working a ticket" below) considers
that active canon in addition to this map's own Decisions so far.

**Writing — what publishes, and when.** Publication happens only at or after a
ticket's Close step — never between the contradiction check and Close. The
resolve → contradiction check → close order is unchanged and absolute; publishing
is one more thing that happens after a ticket is genuinely closed, not a
replacement for closing it.

- A resolved `type: grill` or `type: sketch` ticket publishes as **canon** only
  when it also carries `mode: hitl`. A `type: grill` or `type: sketch` ticket
  resolved `mode: afk` — which should not occur under this skill's own rule that
  only HITL tickets lock story decisions — never publishes as canon.
- A resolved `type: homework` ticket publishes as **development**, regardless of
  `mode`.
- `type: research` tickets and everything under `assets/` remain groundwork; they
  publish as development or open-question material, never as canon, exactly as
  this skill has always treated them.
- Reopening a locked decision (see "Reopening a locked decision" below) never
  retracts or overwrites the old published canon by itself. It publishes as an
  **open question carrying the superseded answer**, and the writer treats it as a
  supersession *proposal* — final only once the reopened ticket completes its own
  fresh resolve → contradiction check → close cycle and republishes.

**Where the project home must live.** Publishing (an actual write) requires a
**local, non-cloud** WriterOS project home — a `.writeros` project package
containing `project.json` that sits on local disk, not inside an iCloud Drive,
Dropbox, Google Drive, or other cloud-synced folder. A project whose `.writeros`
package lives on cloud-synced storage, or that has no WriterOS project home at
all, stays **dry-run only**: preview what would publish, show the writer, but do
not apply it. Do not treat a dry-run preview as canon and do not tell the writer a
decision is shared until an actual local publish has succeeded.

**If memory is unavailable.** If shared project memory cannot be reached (the
project command fails, the project home cannot be found, or any other error),
say so plainly and ask the writer whether to continue the session without it.
Never fail silently, and never block a ticket's own local resolution on memory
being reachable — the map and its files are always the source of truth for this
skill; shared memory is an additional publication target, not a dependency for
doing the work.

## Fog, ticket, or out of scope — one rule
```

### Edit B — load memory context before choosing a ticket

**Anchor ("Work through the map"):**

OLD:
```
### Work through the map

The writer returns to an existing map.

1. Load MAP.md — the low-res view, not every ticket body.
2. Choose the ticket. If the writer named one, it must still be open, unblocked, and unclaimed — otherwise explain which condition fails and offer the frontier instead. If no ticket is named, take the first frontier ticket by the ordering rule. **Claim it** before any work.
3. Work it through **Resolve, check, then close** above, zooming as needed: open any resolved ticket's full body on demand; invoke the instruments the map's Notes name.
4. Stop. One ticket per session.
```

NEW:
```
### Work through the map

The writer returns to an existing map.

1. Load MAP.md — the low-res view, not every ticket body.
2. Load shared project memory context (see "Shared project memory" above), if the
   project has one. Read its active canon and open conflicts before choosing a
   ticket. If memory is unavailable, ask the writer whether to continue without
   it before proceeding.
3. Choose the ticket. If the writer named one, it must still be open, unblocked, and unclaimed — otherwise explain which condition fails and offer the frontier instead. If no ticket is named, take the first frontier ticket by the ordering rule. **Claim it** before any work.
4. Work it through **Resolve, check, then close** above, zooming as needed: open any resolved ticket's full body on demand; invoke the instruments the map's Notes name.
5. Stop. One ticket per session.
```

### Edit C — contradiction check reads active canon, and a publish step lands right after Close

**Anchor ("Working a ticket: resolve, check, then close", the four numbered steps):**

OLD:
```
1. **Resolve provisionally.** Work the question (live exchange for HITL; AFK work otherwise). Draft `## Answer` in the ticket — decision plus the reasoning that produced it, in the writer's terms. The ticket stays in `tickets/`, `resolved:` stays blank.
2. **Contradiction check.** Re-read Decisions so far with the provisional answer in mind. No conflict → step 3. Conflict → **stop and surface it as a reopening decision**: name both decisions, show the collision, ask the writer which holds. Never silently edit a locked decision, and never resolve the conflict for the writer.
   - **Old decision holds:** revise the provisional answer with the writer until coherent, then step 3. If coherence can't be reached this session, leave the ticket open and claimed with the conflict noted under its Question — that still counts as this session's one ticket.
   - **New decision holds:** run the reopening procedure on the old ticket (below), then step 3.
3. **Close.** Fill `resolved:`, move the file to `resolved/`, append the one-line gist to Decisions so far (prefixed "(groundwork)" for research/homework).
4. **Tend the map.** Graduate newly-sharp fog into tickets (create, then wire `blocked-by`), clearing each graduated patch from Not yet specified. Scope out anything revealed to sit beyond the destination. If the answer invalidates other open tickets, revise their Questions — never delete a ticket; a dead one gets scoped out so its history survives.
```

NEW:
```
1. **Resolve provisionally.** Work the question (live exchange for HITL; AFK work otherwise). Draft `## Answer` in the ticket — decision plus the reasoning that produced it, in the writer's terms. The ticket stays in `tickets/`, `resolved:` stays blank.
2. **Contradiction check.** Re-read Decisions so far — and the project's active canon in shared project memory, if the project has one — with the provisional answer in mind. No conflict → step 3. Conflict → **stop and surface it as a reopening decision**: name both decisions, show the collision, ask the writer which holds. Never silently edit a locked decision, and never resolve the conflict for the writer.
   - **Old decision holds:** revise the provisional answer with the writer until coherent, then step 3. If coherence can't be reached this session, leave the ticket open and claimed with the conflict noted under its Question — that still counts as this session's one ticket.
   - **New decision holds:** run the reopening procedure on the old ticket (below), then step 3.
3. **Close.** Fill `resolved:`, move the file to `resolved/`, append the one-line gist to Decisions so far (prefixed "(groundwork)" for research/homework).
4. **Publish to shared project memory**, if the project has one (see "Shared project memory" above). This runs only here — at or after Close — never between the contradiction check and Close. From a checkout of the WriterOS repo, run `npm run memory -- import --source wayfinder --from <project-root>/wayfinder --project <path-to-.writeros> --dry-run`, review the preview, then re-run with `--apply` in place of `--dry-run` to publish. Import is idempotent: each record's dedupe key comes from its file path and content hash, so running it again after later tickets close only picks up what's newly resolved — already-published records no-op rather than duplicate. **Known limitation — split layout.** The adapter expects a project's ticket folders (`tickets/`, `resolved/`, `assets/`) and any legacy `atoms/atoms.jsonl` under one shared root passed via `--from`. A real Wayfinder project splits these — ticket folders live under `<project-root>/wayfinder/`, while `atoms/` sits at the project root — so one `--from` value cannot capture both today. An adapter fix to accept split roots is queued; until it lands, use `--from <project-root>/wayfinder` (captures tickets, resolved, and assets) as the default, and run a second import against `<project-root>` only if root-level legacy atoms need including. Say so plainly to the writer rather than silently skipping them.
5. **Tend the map.** Graduate newly-sharp fog into tickets (create, then wire `blocked-by`), clearing each graduated patch from Not yet specified. Scope out anything revealed to sit beyond the destination. If the answer invalidates other open tickets, revise their Questions — never delete a ticket; a dead one gets scoped out so its history survives.
```

### Edit D — reopening notes the supersession-proposal behavior

**Anchor (the reopening paragraph, immediately after the four numbered steps from Edit C):**

OLD:
```
**Reopening a locked decision** (only ever at the writer's explicit choice): move its file back to `tickets/`; clear `claimed:` and `resolved:`; retitle its answer `## Superseded answer (<date>)` and note the reopen reason under the Question; delete its line from Decisions so far. Tickets it was blocking become blocked again automatically. Any *resolved* ticket whose answer relied on it gets a `revisit:` flag in Not yet specified naming both tickets — those decisions may still stand, but the writer re-confirms them when their flag is worked.
```

NEW:
```
**Reopening a locked decision** (only ever at the writer's explicit choice): move its file back to `tickets/`; clear `claimed:` and `resolved:`; retitle its answer `## Superseded answer (<date>)` and note the reopen reason under the Question; delete its line from Decisions so far. Tickets it was blocking become blocked again automatically. Any *resolved* ticket whose answer relied on it gets a `revisit:` flag in Not yet specified naming both tickets — those decisions may still stand, but the writer re-confirms them when their flag is worked. If the project has shared project memory, this reopening publishes as an open-question supersession proposal at the next publish point (see "Shared project memory" above) — never as an automatic canon retraction.
```

---

## 3. Rollback

To fully revert this contract, reverse the edits in any order (they touch non-overlapping
regions of the file):

- **Undo Edit D:** replace Edit D's NEW block with Edit D's OLD block.
- **Undo Edit C:** replace Edit C's NEW block with Edit C's OLD block.
- **Undo Edit B:** replace Edit B's NEW block with Edit B's OLD block.
- **Undo Edit A:** replace Edit A's NEW block with Edit A's OLD block (this deletes the
  entire "## Shared project memory" section and restores the direct adjacency of the
  "Homework" bullet and the "## Fog, ticket, or out of scope" heading).

After all four are reverted, the file is byte-identical to the version read on 2026-08-15
(178 lines), modulo any unrelated edits Ben makes independently.

---

## 4. Environment prerequisites

- **Manual harness gate — not automated.** Before treating an edited SKILL.md as live, Ben
  runs `tests/HARNESS.md` (in `/Users/ben/.claude/skills/story-wayfinder/tests/`) with a
  human playing WRITER and a human playing GRADER, and requires **three consecutive
  zero-FAIL runs** before explicitly approving the edit. No agent invokes this harness on
  Ben's behalf, and no automated gate substitutes for it.
- **The `.skill` bundle stays stale in V1.** `~/.claude/skill-bundles/story-wayfinder.skill`
  has no build tooling to regenerate it from `SKILL.md`, and installed local sessions read
  `SKILL.md` directly rather than the bundle, so this edit does not require rebuilding or
  touching the bundle. This is a recorded limitation, not a defect to fix under this task:
  any consumer that reads the `.skill` bundle instead of `SKILL.md` directly will not see
  these changes until a build pipeline for the bundle exists.
- **WriterOS memory CLI reachable.** `npm run memory -- context` and
  `npm run memory -- import --source wayfinder` (from a checkout of the WriterOS repo) must
  be runnable from wherever a Wayfinder session executes shell commands, for the "Shared
  project memory" section to do anything. Where the CLI is unreachable, rule 8 above (ask,
  don't fail silently) applies. See Edit C's step 4 above for the exact command form and the
  current split-layout limitation between a project's `wayfinder/` folder and its root
  `atoms/` — an adapter fix for that split is queued but not yet landed.
- **Local, non-cloud `.writeros` project home.** Publishing (`--apply`, not `--dry-run`)
  requires the project's package to live outside any cloud-synced folder. No new tooling is
  proposed to detect this automatically in V1 — the skill (and the writer) judge it by where
  the project actually lives.
