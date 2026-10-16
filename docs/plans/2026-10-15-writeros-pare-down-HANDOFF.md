# Handoff: WriterOS pare-down (end of 2026-10-15)

Plan: `docs/plans/2026-10-15-writeros-pare-down.md`. It was approved by Codex review (4 rounds) and by Ben.
Log (review and build): `docs/plans/2026-10-15-writeros-pare-down-review-log.md`.
Mockups: `docs/plans/pare-down-mocks/`.
Product record: `PRODUCT.md`.
Audit evidence: `~/Projects/dry-runs/2026-10-15-writeros-audit/`.

## Where things stand

| Phase | State |
|---|---|
| 0: stop losing work | **Live.** PR #85 merged (`4fdb961`) and deployed to 5177 at 21:46 on 2026-10-15. |
| 1: the shell | **Built and checked, not merged.** Branch `build/pare-down-phase1`, commit `d7ed212`, local only (not pushed). Ben saw it in the browser: "the top bar is good". |
| 2: pages written by Morgan | Not started. |
| 3: Story Bible and readers | Not started. |
| 4: script export | Not started. |

Ben noticed that the question boxes are still on the pages. That's expected: Phase 1 only moved Treatment and Synopsis under Pages. Phase 2 replaces those editors, and Phase 3 replaces the Story Bible deck.

## First thing tomorrow

1. **Merge Phase 1.**
   - Push `build/pare-down-phase1` and open the PR.
   - Wait for CodeRabbit. Fix only Critical/Major findings, through a Codex fix round, at most 2 rounds.
   - Merge.
2. **Deploy.**
   - Back up first. `writeros-backup` goes to the Mac Studio; if it's unreachable, make a local tar into `~/WriterOS-backups/`.
   - Tag the current live build in `~/WriterOS-Prod` as `live-before-pare-down-phase1`.
   - Run `writeros-deploy`.
   - Check that the served bundle contains the new code and that `/api/health` answers.
   - Tell Ben to reload before typing.
3. **Start Phase 2 with Codex.** Branch `build/pare-down-phase2` from updated main, using a build contract like the earlier ones (scratchpad `build-phase0.txt` / `build-phase1.txt` are lost with the session; the pattern is below).

## How this build runs (Ben's rules)

- **Codex builds; Claude reviews and verifies.** Ben named Codex-as-reviewer as the source of nitpicking. Keep Codex out of the weeds.
- **Every build contract says:**
  - one phase only
  - smallest diff, no refactors, renames, cleanups or new dependencies
  - protected canon test files untouched (the list is in the plan's hard boundary)
  - plain-language UI copy
  - don't commit or push
  - check it yourself in a browser on a sandbox before reporting
- **Claude, after every build:**
  - read the full diff
  - rerun `npm run test:run && npm run check && npm run build`
  - drive the sandbox in a browser personally (Ben: "you keep creating these things blind")
  - run the Impeccable detector on changed UI
  - send back only Critical/Important findings, and log the Minors
- **Launch:** `codex exec --yolo --json -o <report> - < <contract>`, in the background.
- **Fix rounds:** `codex exec resume <thread> --dangerously-bypass-approvals-and-sandbox --json -o <report> - < <fixes>`.
- **Sandbox setup:**
  - copy projects to a scratch folder
  - `env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY PORT=5277 WRITEROS_PROJECTS_ROOT=<copy>/projects SUPABASE_URL= NODE_ENV=production node dist/index.js`
  - never point it at `~/WriterOS Projects` or port 5177
  - a fresh browser shows the voice first-run screen, then a "migrate" dialog: click Skip, then Cancel
- **Canon system is frozen** (the plan's hard boundary). Phase 2's central design: the legacy `documents/synopsis.json` / `treatment.json` stay byte-for-byte. Prose pages live in new `documents/pages/*.json` files that the observer doesn't watch, written through their own `PUT` with a revision check under the package lock.

## Decisions already made (don't re-ask)

- Middle ground: WriterOS keeps canon and the script. Synopsis, Treatment and Outline are pages Morgan writes on request, with no question boxes.
- Morgan asks only what canon lacks. Each question names its gap, drawn from four short format files based on Ben's `ai-film-writing-templates`.
- Q1: Project Meeting and pitch packets are **kept and repointed** in Phase 3, including the F22 fix.
- Q2: the start checklist is a **plain list first** (no ticks).
- Same look, calmer (Impeccable improves the UI, not function).

## Open items and known issues

- **Intermittent test failure:** about 1 in 4 full suite runs fails once. It isn't in the new tests, and isolated reruns didn't catch it. Worth naming if it appears again (run `npx vitest run` and grep the FAIL lines).
- **Mac Studio backup:** `writeros-backup` has been failing since at least 18:00 on 2026-10-15 (Studio unreachable). The local backup is at `~/WriterOS-backups/writeros-projects-2026-10-15-pre-phase0.tgz`.
- **Phase 0 Minors (logged, not fixed):**
  - the script now writes after every 500 ms typing pause
  - a save error can show briefly on a newly selected project
- **Codex threads:** Phase 0 is `01a142cd-dc2d-7ba3-b662-4881f0d19063` and Phase 1 is `01a1430a-0ccf-7362-a802-3fa5a276f3cc`. Phase 2 should start a fresh thread.
