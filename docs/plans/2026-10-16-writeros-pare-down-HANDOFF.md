# Handoff: WriterOS pare-down (end of 2026-10-16)

This supersedes `2026-10-15-writeros-pare-down-HANDOFF.md`. Read that one only for history.

- Plan: `docs/plans/2026-10-15-writeros-pare-down.md`. Phase 3 is the section "Phase 3: Story Bible and readers". The hard boundary, the key decision and Ben's decisions still bind.
- Log: `docs/plans/2026-10-15-writeros-pare-down-review-log.md`.
- Mockups: `docs/plans/pare-down-mocks/story-bible.html`, with screenshots in `shots/`.

## Where things stand

| Phase | State |
|---|---|
| 0: stop losing work | Live (PR #85). |
| 1: the shell | Live (PR #86, `d274f64`). Rollback tag `live-before-pare-down-phase1`. |
| 2: pages written by Morgan | **Live** (PR #87, `fb3beb5`), deployed to 5177 at 13:58 on 2026-10-16. Rollback tag `live-before-pare-down-phase2`. |
| 3: Story Bible and readers | **Not started. Next.** |
| 4: script export | Not started. |

Local `main` = `origin/main` = `fb3beb5`. `~/WriterOS-Prod` runs `fb3beb5`.

## Phase 3: who does what (Ben, 2026-10-16)

**The roles are reversed from Phases 0–2. Claude builds Phase 3, and Codex reviews it.**

1. **Branch:** `build/pare-down-phase3` from `main`.
2. **Inventory before any code.** The plan requires a table of every read and write of synopsis / treatment / outline document content, each assigned one outcome (page prose, Story Bible, legacy fallback, or remove). It must be reviewed before code.
   - Claude writes the table to `docs/plans/2026-10-16-phase3-reader-inventory.md`.
   - Codex reviews the table read-only.
   - Then Claude builds.
3. **Build.** Claude builds Phase 3 exactly as the plan's section says:
   - Story Bible sectioned view, inline edit, honest labels, "Still open", signed Front Lot looks on people
   - readers moved per the inventory
   - dead code behind the closed write targets removed
4. **Codex review of the diff**, read-only. Launch it in the background and keep it out of the weeds: report only Critical/Important findings, with file:line and a concrete failure. Example:
   `codex exec --yolo --json -o <report> - < <review-prompt>`
   (run from `~/Projects/WriterOS`, with no leading `cd`, so it matches Ben's `Bash(codex exec:*)` rule).
5. Claude fixes Critical/Important findings only, and logs Minors. At most 2 review rounds.
6. **Verify** (see below), then PR, CodeRabbit (fix only Critical/Major), then Ben's explicit "merge and deploy Phase 3".

## Verification Claude must do personally

- `npm run test:run && npm run check && npm run build`, all green. About 1 in 4 full runs has a flaky failure; rerun it and name it.
- The protected canon test files stay unedited (list in the plan's hard boundary). Any edit needs Ben's explicit sign-off before it's applied. Ask him in plain words, with a recommendation.
- Impeccable detector on changed UI: `~/.claude/skills/impeccable/scripts/impeccable detect <files>`.
- **Browser walkthrough yourself** (Ben: "you keep creating these things blind"), on a sandbox:
  - copy `~/WriterOS Projects` to a scratch folder
  - copy Bloodless's Story-drive folder (`~/Library/Mobile Documents/com~apple~CloudDocs/My Scripts/Bloodless/wayfinder`) next to it
  - point the copy's `.writeros-story-drive-links.json` root at that copy
  - start the server with all `CLAUDE*` env vars stripped, plus `-u OPENAI_API_KEY -u ANTHROPIC_API_KEY WRITEROS_MORGAN_HOST=1 PORT=5277 WRITEROS_PROJECTS_ROOT=<copy>/projects SUPABASE_URL= NODE_ENV=production node dist/index.js`
  - never use 5177 or `~/WriterOS Projects`
  - a fresh browser shows the voice first-run screen (Skip for now), then a migrate dialog (Cancel)
  - use `agent-browser`; if a click by ref "succeeds" but nothing happens, the target may be below the fold, so scroll it into view or click from page script
- **Morgan in a new sandbox folder won't start** (exit code 1): Claude Code's "trust this folder?" prompt appears, and WriterOS's auto-answer (`server/morganHost/morganSession.ts` `decideTrust`) sends ↓ + Enter too fast and picks "No, exit". This bug is pre-existing and logged, not fixed. Workaround: trust the copied folder once by running Morgan's launch in a pty with slower keys (↓ at 1.5 s, Enter at 3 s), or run `claude` in that folder and answer yes. After that, servers started from Claude's shell work.
- **Live test for Phase 3:** ask Morgan to fill an empty Story Bible section. She must propose through `storyBible`, at Ben's yes. Check the "Still open" list against What's Standing.
- **Deploy** ("deploy means live"):
  - `writeros-backup` first (the Mac Studio has been unreachable all day; fall back to `tar -czf ~/WriterOS-backups/writeros-projects-<date>-pre-phase3.tgz -C ~ "WriterOS Projects"`)
  - tag `~/WriterOS-Prod` `live-before-pare-down-phase3`
  - `writeros-deploy`
  - check `/api/health` and the served bundle
  - open one real page through the API to prove it

## Permissions and gates

- Ben added `Bash(codex exec:*)`. A command that starts with `cd …&&` doesn't match it, so run codex without a leading `cd`.
- Auto mode blocks merges until Ben says so explicitly, per phase (WriterOS CLAUDE.md rule 6). Don't ask him for a standing OK; he approves each merge.
- Blast Radius holds `rm -rf` on variable paths. Make fresh directories instead of deleting.

## Logged, not fixed (don't re-raise as new)

- **Phase 1:**
  - two tabs saving the voice profile at the same moment
  - the saved status isn't cleared when switching projects
  - the Memory menu item has no action after the last project is deleted
  - the voice-profile GET is missing `no-store`
- **Phase 2:**
  - the Morgan trust auto-answer, above
  - each read-only shell command Morgan runs raises an approval card
  - Morgan's chat shows raw `**bold**`
  - the out-of-date notice has a thick amber left border (Impeccable side-tab)
  - `pagesApi.ts` doesn't check the bootstrap response (CodeRabbit Minor)
  - "Morgan's suggestion" heading spacing is tight
- **Phase 0:**
  - the script writes after every 500 ms typing pause
  - a save error can show briefly on a newly selected project
- **Infra:** the Mac Studio backup is failing (Studio unreachable since 2026-10-15 evening).

## Decisions already made (don't re-ask)

- Middle ground: WriterOS keeps canon and the script. Pages are written by Morgan. Canon is frozen.
- Q1: Project Meeting and pitch packets are kept and **repointed in Phase 3** to the Story Bible and the page prose, including the F22 fix (export never deletes a saved or approved packet).
- Q2: the start checklist is a plain list (done in Phase 2).
- Same look, calmer.
- Ben approved the three Outline-composer protected-test edits (Phase 2 only; that approval doesn't carry over).

## Sandbox leftovers

- Scratch files are under this session's scratchpad (`/private/tmp/claude-501/-Users-ben/bfeb863f-…/scratchpad/`) and are disposable.
- Port 5277 is stopped.
- The Morgan sandbox conversation lives in `~/.claude/projects/-private-tmp-claude-501--Users-ben-bfeb863f-…-sbx2-wayfinder/`. It's harmless.
