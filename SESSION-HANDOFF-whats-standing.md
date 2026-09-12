# Handoff — "What's Standing" (translator work), 2026-08-18

## Who you're working with

Ben. Not an engineer — explain in plain English, define jargon on first use, one question
at a time. He gets frustrated by verbose replies; cut to the chase. His rule: **write the
design or the diff, stop, and let him run Codex review before/after building.** Verify
Codex's findings against the code before accepting them — he expects checking, not
deference. Both conceding correct findings and refuting wrong ones have happened; the
record matters to him. Canon is explicit-only (ratified 2026-08-15): nothing becomes
canon without his promote.

## Immediate state: awaiting Codex review

Commit `ab34f13` (slice 2) on branch `feat/whats-standing-report` is committed and Ben is
taking it to Codex. Expect findings back as a pasted message. Prior rounds ran 4–6
findings each; all were real. Verify each in code, fix, re-verify with
`npm run check && npm run test:run && npm run build` (never bare `npm test` — it watches).

**Gaps already declared in the commit message** — expect Codex to probe them; they are
decisions, not omissions:
1. Invalidation on language change: events/transitions exist in the schema, nothing emits
   `annotation-invalidated` yet. Next slice.
2. Free text answers are rejected with a reprompt instead of offered a save-verbatim
   route. Field use proved the cost: Ben typed a real story idea into the question prompt
   and it was dropped (recovered by hand, filed as candidate, revision 35).

Possible additional findings to anticipate: the interactive `standing` script (Ben's
personal `~/.local/bin/standing`, NOT in repo — out of review scope, say so if flagged);
`readdir` import in annotationStore (verify it compiles — it does); duplication between
`renderComposedMarkdown.ts` escaping and `projections.ts` escaping (known, deliberate —
PR #68 still in review; collapse into one utility once merged).

## What exists

**The system:** "What's Standing" — a deterministic (no model anywhere) report over a
project's memory snapshot: what's in force, what reads as withdrawn, contested, open,
awaiting decision. Records whose own wording carries a withdrawal cue (struck / do not
use / superseded by) display in a separate section — never under "In force". The report
quotes qualifying sentences and prints structured fields; it never asserts relationships.
Reference questions ("what does 'beats 9–11' refer to?") are derived from a tested cue
list, answered by the writer from a candidate menu, stored in an append-only annotation
log (`memory/annotations.jsonl`) that never touches the memory ledger or canon.

**Branch `feat/whats-standing-report`** (off main): `4c9b673` slice 1 (report),
`ab34f13` slice 2 (questions + annotation log). Key files:
- `shared/compose/whatsStanding{Cues,FactSheet,Recipe,SourceHash}.ts`
- `shared/projectMemoryAnnotations.ts` — event schemas, transitions, replay
- `server/compose/whatsStandingRenderer.ts`, `renderComposedMarkdown.ts`,
  `composeDeterministic` in `server/compose/index.ts`
- `server/projectMemory/annotationStore.ts`; `readSnapshotReadOnly` in `store.ts`
- CLI: `report`, `questions`, `answer` in `server/projectMemory/cli.ts`
- Tests: `tests/server/whatsStanding*.test.ts`, `annotationStore.test.ts`
- Design (authoritative, revision 5): `docs/synthesis-agent-v1-design.md`

**Other open PRs:** #67 (wayfinder research-type + supersession linkage), #68 (canon.md
prose rendering). Independent of this branch.

**Ben's shortcut:** `standing <name-fragment>` prints a project's report; `-o` saves to
Desktop; `-q` interactive questions (fixed today — heredoc stdin bug made input read as
EOF). Lives in `~/.local/bin/standing` + `~/.local/share/standing/questions.py`.

## Invariants — do not regress

- No model call anywhere in report or questions. Renderer and question text are pure
  functions; two runs over unchanged state are byte-identical.
- Annotations never reach canon, never enter `retrieval.ts`, never mutate a record;
  memory ledger and projections byte-identical across annotation writes (tests pin all).
- Annotations may only resolve references — never status/supersession (store owns those).
- Answers only from the offered candidate list; free text never parsed into an answer.
- `report`/`questions` are read-only: they use `readSnapshotReadOnly`, which must never
  create a ledger, append migrations, or repair projections.
- Fingerprints cover claim+detail only, never status — a status flip must not re-ask.

## After the review lands, the queue is

1. Fix Codex's verified findings; commit; Ben re-reviews if findings were substantial.
2. Push branch + PR (Ben says when).
3. **Next slice, agreed with Ben: the app panel.** "What's Standing" surface inside
   WriterOS — report view plus click-to-answer questions (text box that can't submit by
   accident; save-as-note button for prose). Terminal UX is dead scaffolding by his
   explicit call: "this stupid terminal idea does not survive the real WriterOS app."
   Add API routes beside existing memory routes; note the origin/session guards on
   `/api/project-library` when wiring client fetches.
4. Then invalidation slice (emit `annotation-invalidated` on fingerprint change; re-ask
   flow; run-consistency refusal on moved revisions).

## Live data facts

Projects root is `~/WriterOS Projects` (local, moved off iCloud 2026-08-17; launchagent
`tv.notboring.writeros` serves port 5177 with env pointing there). Stool Pigeon
(`785623e6`) is at memory revision 35: 13 canon, 4 open questions, 5 candidates —
including Ben's Marcelli-threat idea filed today. One approved annotation exists:
"Superseded by beats 9–11" → the beat-sequence record. Daily backup of the projects
folder runs 18:00 to the Studio (`~/.local/bin/writeros-backup`, log in
`~/Library/Logs/writeros-backup.log`). Grave Affairs has memory revision 0; Bloodless
and "Yes Chef!" have wayfinder folders on iCloud but nothing imported — importing them
is unscheduled but Ben cares ("I want what we set out to build for any and all
projects").
