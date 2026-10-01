# Look sessions — handoff (2026-10-01)

Read this first in a new session. It says where the work is, what Codex is reviewing, and what to do with its reply.

## Where the code is

| Repo | Location | Branch | State |
|---|---|---|---|
| WriterOS (look sessions) | `~/Projects/WriterOS-worktrees/look-sessions` | `feat/look-sessions` | 13 commits on top of the Beat Sheet branch at `1c48e808`; HEAD `fe61987`, plus this handoff file. Not merged, not pushed, not deployed. |
| WriterOS (Beat Sheet, parent) | `~/Projects/WriterOS` | `feat/beat-sheet-lookbook` | HEAD `e04dd25` (flaky beatSheetRoutes test fixed: `writerOSObserverIdle()`, 7/20 → 0/20). Not merged, not deployed. |
| OpenMontage | `~/Projects/OpenMontage-worktrees/writeros-look-source` | `feat/writeros-look-source` (from `authored-film` @ `d1039c0`) | Tasks 0, 8, 9, 10 + republish fix `86003a0`; HEAD `bf827c6`. Codex-reviewed (design change approved). Not merged. |
| story-wayfinder skill | `~/.claude/skills/story-wayfinder` | not git | EDITED IN PLACE and already live: looks redirect to WriterOS. Backups `*.bak-2026-09-30`, `-run2`, `-run3`, `-run4`. |

Plan, decisions and full review history: `docs/superpowers/specs/2026-09-30-look-sessions-design.md`, `docs/superpowers/plans/2026-09-30-look-sessions.md`, `docs/superpowers/plans/2026-09-30-look-sessions-review-log.md` (Task 12 dry-run results table and the follow-ups list are there).

## What Codex is reviewing now

Ben gave Codex a read-only review of the WriterOS code (`git diff 1c48e808..HEAD` in the look-sessions worktree). Codex reviewed the plan and the OpenMontage side earlier, but never this WriterOS code. The seven focus areas asked about:

1. Never-draft: any path where model output (Zoe reply, memory receipt, Lookbook route, structured-document patch) changes `documents.looks` spec or fieldSources.
2. Promote: retry-first, op-id reuse, depends_on derivation, provenance, firewall, trim, supersession, expectedRevision, export inside the package lock.
3. Memory payload: lookHash recomputed on parse; canon.md YAML fence safety.
4. Canonical JSON and look_spec mirror agreement with OpenMontage (incl. Python case-fold, whitespace).
5. Client state: stale draft/session after Promote, promotionOpId retry, Start from the promoted look, list-field text sync, another client wiping `documents/looks.json`.
6. Memory review change (`canPromoteMemoryRecord`) exactly matches the server.
7. Behaviour changes for projects with no looks, or for non-Zoe personas.

Requested output: findings by severity with file:line and smallest fix, then SHIP / FIX FIRST.

## What to do with Codex's reply

Ben will paste it. Codex's verdict is input, not orders (Ben's standing rule): verify every finding against the code yourself before changing anything; confirm or refute each with file:line; fix only what is real; say plainly where you disagree. For each real finding: write a failing test first, fix, re-run. Then the full WriterOS verification: `npm run test:run`, `npm run check`, `npm run build`. Commit on `feat/look-sessions` with the attribution line. Record outcomes in the review log.

Conventions that held all through: plain-language replies to Ben (no jargon, one question at a time); a scratch test copy of WriterOS for visual checks runs with `PORT=5198 HOST=127.0.0.1 WRITEROS_PROJECTS_ROOT=<scratch library> NODE_ENV=production node dist/index.js` from the worktree after `npm run build` (env from `~/Projects/WriterOS/.env`); never touch `~/WriterOS Projects` or `projects/bloodless`; drive the browser with `agent-browser`.

## Go-live order (after the review is settled)

1. Merge Beat Sheet into main and deploy it (Ben runs `writeros-backup`, then `writeros-deploy`).
2. Bring `feat/look-sessions` onto the new main (it picks up `e04dd25`) and re-run all checks.
3. Deploy in two steps: first only the memory-reader change (Task 2, `0814912`, plus Task 1's shared code) as the rollback floor; then everything else.
4. Merge the OpenMontage branch into `authored-film` (with Ben's OK).
5. Per real project, when ratifying looks: add `writeros_package` to its OpenMontage `project.yaml`; Ben approves the config change in a terminal.

Branch merges need Ben's explicit permission (WriterOS CLAUDE.md).

## Known, deferred

- The background memory analysis can open a false conflict between a promoted look and a later edit naming the same character (logged in the review log).
- Reference-image import works only for wayfinder looks, not WriterOS looks.
- About ten rubric/harness wording issues from the wayfinder self-test (in `~/wayfinder-harness/results-log.md`).
- The wayfinder skill already points writers at the Look panel, which is not in Ben's real WriterOS until go-live step 3.
