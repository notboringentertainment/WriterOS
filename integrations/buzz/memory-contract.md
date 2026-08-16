# Memory contract — Buzz writers' room

**Status:** proposed, not applied. This document describes an edit to a file outside this
repository (`/Users/ben/Projects/buzz-writers-room/PLAN.md`). WriterOS code does not, and
must not, write to that path. Ben reviews this contract and applies the edit by hand.

**Target file:** `/Users/ben/Projects/buzz-writers-room/PLAN.md` (read in full on 2026-08-15
to anchor the edit below; 524 lines, ending with "§11. Canon lock routing (addendum,
2026-08-05)").

**Related, read but not modified:** `archiver/atom_extract.py` (the `canon-block` command),
`package/established-canon.md` (existing narrative-form canon export), `atoms/canon/*.md`
(bare `key: value` atom headers, `status: canon`), `archiver/README.md` (Channel Canvas kind
`40100` capture, line 137).

---

## 1. Purpose and binding rules

The Buzz room already has an authoritative canon store — `atoms/canon/`, cited to signed
vault evidence, with `package/established-canon.md` as its narrative-form export (see PLAN.md
§11). This contract does not replace or duplicate that store. It adds a one-time identity
mapping to WriterOS and a manual, on-demand bundle-generation procedure so another agent
(Wayfinder, PitchStudio, a fresh WriterOS session) can be handed this project's canon without
reading Buzz internals directly.

Binding rules:

1. **The channel-to-project mapping happens once, through one field.** A Buzz channel maps
   to its WriterOS project through `project.json.sources.buzzChannelId` inside that project's
   `.writeros` package — set with WriterOS's existing `link-source` CLI command (Task 5):
   `npm run memory -- link-source --workflow buzz --source-id <channel-id> --project <path>`.
   This mapping is not duplicated anywhere in the `buzz-writers-room` tree; `project.json` is
   its one home.
2. **Reading canon atoms locally, tolerantly.** WriterOS's Buzz adapter
   (`server/projectMemory/adapters/buzz.ts`) already reads `atoms/canon/`,
   `atoms/provisional/`, and `atoms/rejected/` independently and treats a missing directory
   as valid-and-empty rather than an error (`atoms/canon: absent; no Buzz canon atoms found`
   is a warning, not a failure). This is already implemented on the WriterOS side; no
   PLAN.md change is required for it. It is recorded here because it is the fact that makes
   rule 5 below safe to state without qualification: a project that has only `atoms/canon/`
   populated (no `provisional/` or `rejected/` yet) is a normal, fully supported state.
3. **§11's atoms-win rule is scoped to inside Buzz; the WriterOS archive holds conflicts
   open instead.** PLAN.md §11 says "on any conflict between an external record (wayfinder
   workspace, notes/, memory) and canon atoms, atoms win" — that governs disputes an agent
   in a Buzz session settles for itself while working. It does not extend into the WriterOS
   shared archive. There, WriterOS's Buzz adapter always imports a Buzz atom as a
   `requestedStatus: candidate` record (never automatically active canon, whatever its
   `status:` header says in `atoms/`), pending Ben's promotion through the archive's own
   review action. If that candidate conflicts with the archive's existing active canon, the
   conflict stays **OPEN for Ben's arbitration** — it does not auto-supersede via §11's rule
   or via import order, and this contract does not change that. This is a deliberate,
   recorded deviation from §11 for the WriterOS side specifically, matching the product
   contract's stated policy (`docs/product/unified-project-memory-prd.md` §4: "Buzz canon
   conflicts remain open for Ben's arbitration. Buzz's native auto-win rule does not apply
   inside WriterOS.") — pending Ben's explicit confirmation, since that policy is the
   product's adopted default rather than something this contract itself decides.
4. **Writing atoms back to the archive.** Bundle generation (rule 5 below) is Buzz-side
   reading; it puts nothing into the WriterOS archive. To write this project's atoms into
   shared project memory, from a checkout of the WriterOS repo, with the channel mapping
   from rule 1 already set: `npm run memory -- import --source buzz --from
   <buzz-project-root> --project <path-to-.writeros> --dry-run`, review the preview, then
   re-run with `--apply` in place of `--dry-run`. This requires the linked `buzzChannelId`
   on the target project to match the channel this project's atoms cite — WriterOS's
   importer rejects any atom whose `room-session` provenance names a different channel.
   Canon and provisional atoms import as candidate canon-kind records (rule 3); rejected
   atoms import as development material, never canon.
5. **Reuse the existing canon surfaces as native input — don't re-derive canon.** When
   generating a bundle for a downstream agent, pull from what already exists:
   `atom_extract.py canon-block` for the atom-level injection text, and
   `package/established-canon.md` for the narrative-form established canon, plus whatever
   archive material (traces, prior packages) is relevant to the specific request. Every
   claim in the bundle keeps a **full 64-hex vault event id** as its evidence citation — see
   rule 7's note on `canon-block`'s truncated output.
6. **Generate only where atoms are locally readable; deliver manually.** `atoms/`, `traces/`,
   and `package/` have no sync path today — only the L0 vault (raw relay events) rsyncs
   Studio → Air (`archiver/backup_pull.py`), and that rsync moves the full raw signed
   events, bodies included. The binding fact is a **residency** rule, not a payload rule:
   raw L0 events move only between Ben-controlled machines (Studio and Air), and nothing
   this contract generates carries a raw event body back out of that pair — the bundles and
   citations this procedure produces carry locators only. This contract adds no transport.
   The bundle is generated by hand on whichever machine has `atoms/` locally readable (the
   Air — `atom_extract.py`'s configured vault path, `~/buzz-archive-backup/data`, is the
   Air-side copy `backup_pull.py` maintains; see Environment prerequisites below), then
   handed to the requesting agent directly — paste, attach, or point at the path. There is
   no channel, no sync job, no automatic fetch, and no assumption that a bundle generated on
   one machine is available on another.
7. **`canon-block`'s display output truncates evidence to 8-character prefixes — the bundle
   requires full ids.** `atom_extract.py canon-block` truncates each evidence id to 8
   characters for human-readable display (`atom_extract.py:206`, `e.strip()[:8]`) — confirmed
   by running it. The vault policy is that locators travel, and a locator ambiguous enough to
   need "use more characters" (`resolve.py`'s own ambiguity error, growing more likely as the
   vault grows) is not a resolvable one, so the bundle does not carry 8-character prefixes:
   each prefix is resolved to its full 64-hex event id via `resolve.py` before it goes in the
   bundle — see the "Generating the bundle" procedure below for the exact step.
8. **The bundle shows its own age.** Every generated `shared-project-memory.md` bundle
   carries a visible revision marker and generation timestamp at the top of the file, so a
   stale copy in someone's hands is identifiable at a glance rather than trusted implicitly.
9. **Channel Canvas (kind `40100`) is a noted V2 path, not a V1 commitment.** The archiver
   already captures Channel Canvas events (`archiver/README.md:134-137`, "Channel canvas =
   project-scoped canon home (kind 40100, `h`-tagged)... Archiver now captures kind 40100").
   That makes it the most likely native delivery surface for a future version, since it is
   already the project-scoped canon home other tooling reads. This contract records that as
   a forward note only; it proposes no V1 build against it.

---

## 2. Proposed edit

One edit: append a new numbered section after the file's current final section (§11).
PLAN.md's existing sections are additive addendums appended over time (§11 itself is dated
"addendum, 2026-08-05"); this follows the same pattern rather than editing existing prose.

**Anchor (the exact final two paragraphs of the file, §11's closing text):**

OLD:
```
**Closing habit:** wayfinder sessions (and any external development session)
read `atoms/canon/` at session start, so a room ruling resolves its ticket
instead of being re-litigated.

Procedure, not code. No schema change, no automation — a formatter script is a
later slice only if manual posting proves annoying in real use.
```

NEW:
```
**Closing habit:** wayfinder sessions (and any external development session)
read `atoms/canon/` at session start, so a room ruling resolves its ticket
instead of being re-litigated.

Procedure, not code. No schema change, no automation — a formatter script is a
later slice only if manual posting proves annoying in real use.

---

## 12. WriterOS shared project memory bridge (addendum, 2026-08-15)

**What this is not.** No sync path exists for `atoms/`, `traces/`, or `package/`
today. The L0 vault rsync (raw relay events, Studio → Air) moves the full raw
signed events, bodies included — that is a residency rule, not a payload rule:
raw L0 events move only between Ben-controlled machines, and nothing generated
by this procedure carries a raw event body outward. Bundles and citations
produced from the vault carry locators only. This addendum adds no transport. It
is a bundle-generation procedure that runs by hand, on the one machine where
these directories are locally readable (the Air), followed by manual delivery of
the resulting file to whichever agent needs it.

**Channel-to-project mapping (once).** A Buzz channel maps to its WriterOS project
exactly once, through `project.json.sources.buzzChannelId` inside that project's
`.writeros` package. Set it with WriterOS's `link-source` command:

    npm run memory -- link-source --workflow buzz --source-id <channel-id> --project <path-to-.writeros>

Re-run only if the channel changes. Do not record this mapping anywhere in this
tree — `project.json` is its one home.

**Conflict arbitration in the WriterOS archive (deliberate deviation from §11 above,
pending Ben's confirmation).** §11's "atoms win" rule governs disputes settled inside
a Buzz session, between an external record (a wayfinder workspace, `notes/`, memory)
and this project's own canon atoms. It does not extend into the WriterOS shared
archive. There, a Buzz atom always imports as a candidate record — never
automatically active canon, whatever its `status:` header says here — pending Ben's
promotion through the archive's own review action. If that candidate conflicts with
canon already active in the archive, the conflict stays **OPEN for Ben's
arbitration**; it does not auto-supersede via §11's rule or via import order. This
matches the WriterOS product contract's stated policy ("Buzz canon conflicts remain
open for Ben's arbitration. Buzz's native auto-win rule does not apply inside
WriterOS.") but is recorded here as a deviation from this file's own §11 because §11
predates it and does not itself carry this scoping — Ben's explicit confirmation of
this split is still pending.

**Writing atoms back to the archive.** Generating a bundle (below) is reading only;
it puts nothing into the WriterOS archive. To write this project's atoms in, with the
channel mapping above already set, from a checkout of the WriterOS repo:

    npm run memory -- import --source buzz --from <buzz-project-root> --project <path-to-.writeros> --dry-run

review the preview, then re-run with `--apply` in place of `--dry-run`. This requires
the linked `buzzChannelId` on the target project to match the channel this project's
atoms cite — the import is rejected outright if an atom's `room-session` provenance
names a different channel. Canon and provisional atoms import as candidate
canon-kind records, held for Ben's promotion; rejected atoms import as development
material, never canon. See "Conflict arbitration" above for what happens when an
imported candidate conflicts with existing active canon.

**Generating the bundle.** On the machine where `atoms/` is locally readable, reuse
the existing canon surfaces rather than re-deriving canon:

    cd ~/Projects/buzz-writers-room/archiver && .venv/bin/python atom_extract.py canon-block

for the atom-level canon block, and `package/established-canon.md` (produced by
the existing canon-ingest procedure) for the narrative-form established canon,
together with whatever archive material (traces, prior packages) is relevant to
the request. `canon-block`'s own output truncates each evidence id to 8 characters
for human display — before anything goes in the bundle, resolve every truncated id
back to its full 64-hex form:

    cd ~/Projects/buzz-writers-room/archiver && .venv/bin/python resolve.py <8-char-prefix>

and take the `id` field from the printed event JSON. If `resolve.py` reports the
prefix is ambiguous, that citation cannot go in the bundle as an 8-character prefix
at all — resolve it fully or drop that line, never guess. Write the result into one
cited file, `shared-project-memory.md`, in this project's `package/` directory.
Every line keeps its evidence citation as a **full 64-hex vault event id** — nothing
in the bundle may assert a claim the source material doesn't already cite, and
nothing may cite evidence by a prefix short enough to be ambiguous.

The bundle carries a visible **revision** (a monotonic counter, or the source
atoms' latest `canon-at`/`created` date, whichever this project already tracks)
and a **generation timestamp**, both at the top of the file, so a stale copy in
someone's hands is identifiable at a glance:

    <!-- shared-project-memory bundle: revision <N>, generated <YYYY-MM-DDTHH:MM:SSZ> -->

**Delivery is manual in V1.** Once generated, hand the file to the requesting
agent directly (paste, attach, or point at the path) — there is no channel, no
sync job, and no automatic fetch. Regenerate before every delivery; do not reuse
a stale bundle across sessions.

**Likely V2 path.** Channel Canvas (Nostr kind `40100`, `h`-tagged, already
captured by the archiver — see `archiver/README.md`) is the most likely native
delivery surface for a future version: it is already the project-scoped canon
home other tooling reads. Not built in V1. Treat this line as a note for the next
addendum, not a commitment.
```

---

## 3. Rollback

Delete everything from the line `---` immediately before `## 12. WriterOS shared project
memory bridge (addendum, 2026-08-15)` through the end of the file, leaving the file ending
with:

```
**Closing habit:** wayfinder sessions (and any external development session)
read `atoms/canon/` at session start, so a room ruling resolves its ticket
instead of being re-litigated.

Procedure, not code. No schema change, no automation — a formatter script is a
later slice only if manual posting proves annoying in real use.
```

This restores the file to byte-identical with the version read on 2026-08-15, modulo any
unrelated edits Ben makes independently.

---

## 4. Environment prerequisites

- **Python archiver environment, invoked directly — no shebang, not executable.**
  `atom_extract.py` and `resolve.py` have no shebang line (both start with a docstring) and
  are not marked executable (`-rw-r--r--`), so both must be invoked as
  `.venv/bin/python <script> ...` from `~/Projects/buzz-writers-room/archiver` — confirmed
  by running `canon-block` directly. `archiver/.venv/bin/python` exists (a symlink to
  `python3.14`). Both scripts' configured vault path (`~/buzz-archive-backup/data`) must be
  available on the machine generating the bundle — the Air, per rule 6 above, since that
  path is `backup_pull.py`'s destination for the Studio → Air rsync, not a path the Studio
  itself populates.
- **WriterOS memory CLI reachable** for the one-time `link-source` mapping and for the
  `import --source buzz` write-back (rule 4 above) — a checkout of the WriterOS repo with
  `npm run memory` runnable.
- **`atoms/canon/` need not be pre-populated.** Both `atom_extract.py` and WriterOS's Buzz
  adapter already tolerate an absent or empty `atoms/canon/` (or `provisional/`/`rejected/`)
  directory; a bundle generated before any atom exists is simply empty of atom-derived
  content, not an error.
- **No network transport is added by this contract.** Bundle handoff is manual (chat paste,
  file share, or a shared path) by design in V1; do not build a delivery job against this
  contract without a separate decision to do so.
