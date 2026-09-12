# Session Handoff — WriterOS Unified Project Memory V1

> **UPDATE 2026-08-16 (resumed session):** Much of the below is now done. Current state:
>
> - **Feel test steps 4–5 executed via agent-browser** (transcripts delivered to Ben in-conversation; screenshots in the session scratchpad). Memory ON: Morgan answered the Ivy/Prescott question correctly per canon, receipt "Project memory revision 158". Memory OFF: Morgan declined to invent, receipt "Project memory disabled". **Step 6 (Ben's accuracy + voice verdict) still pending.** Caveat: with `WRITEROS_PROJECTS_ROOT` unset the test project vanishes from the project list, so the OFF pass ran in a browser-storage project — same persona, clean transcript, different project shell.
> - **Scoped review of 50fb3ce: PASS** (2 should-fix, both addressed). New commits, each reviewed:
>   - `6e4ddd4` — scope-guards `refreshAnalysisQueue` (cross-project retry bleed, RED-first test), hardens the queue-only-retry test, adds the snapshot-failure full-surface-error test. Review: PASS.
>   - `ff8f276` — border shorthand fix in MemorySurface styles (see crash finding below). Review: PASS (one nit: MemoryConflictCard.tsx:194-201 badges still use the borderColor-over-shorthand pattern — latent only, those spans are conditionally mounted so the warning can't fire today; follow-up for consistency).
>   - Follow-up ticket candidate from review (pre-existing, unfixed): `runAction`'s `setSnapshot` has no scope guard (useProjectMemory.ts) — same bug class as the retry bleed.
> - **Dev-server "random deaths" ROOT-CAUSED:** `server/vite.ts:33-35` (scaffold-era) calls `process.exit(1)` on any vite logger error, and vite forwards *browser* console.error output — so any React dev warning killed the server. The Memory tab toggle emitted such a warning (borderColor longhand removed while border shorthand persisted); fixed in `ff8f276`. The vite.ts exit-on-error landmine itself is UNCHANGED (pre-existing infra, Ben's call) — any future client console.error will still kill the dev server.
> - **Browser acceptance:** patch preview on Synopsis PASS (Apply applied fields, Keep-as-suggestion + Reopen worked, Dismiss discarded, doc untouched). Edit-a-document → proposals PASS (synopsis edits produced `document_fact` active + `decision` candidates; zero auto-canon — doctrine holds). Reject PASS (UI reject → ledger `rejected` events; note: no confirmation dialog on reject — immediate). Conflict actions/banner NOT exercised in browser: test project has zero conflicts (unit tests cover them). Normal-writing sniff PASS.
> - **NEW FINDINGS for Ben (product calls, not fixed):**
>   1. **Promote is dead for all 102 imported wayfinder atom candidates**: their source has `workflow: "story-wayfinder"` and no `authority` field, so `sourceCanActivateCanon` fails and every promote 400s. Import→review→promote cannot complete for wayfinder imports. Intended (authority gate) or import bug?
>   2. `routes.ts` (~line 159) flattens the store's explanatory action errors ("Only a clear, explicitly approved, authority-eligible canon candidate may be promoted") into generic "Project memory request is invalid." — the UI can't tell the writer why promote failed.
>   3. Promote/Reject buttons render on candidates that can never promote (decision-kind, authority-less wayfinder atoms) — UX gap.
>   4. Morgan's chat narration claims it "cannot rewrite documents" even as the patch-preview flow does exactly that alongside the reply — persona/system mismatch.
> - Server for continued testing: `PORT=5199 WRITEROS_PROJECTS_ROOT="/Users/ben/Documents/WriterOS Projects" npm run dev` from this worktree (unchanged), or plain `npx tsx server/index.ts` with the same env to avoid watch restarts.
> - Still remaining: Ben's step-6 verdict → open decisions 1–5 below → push branch / PR #66 triage → 9 contract edits → merge.
>
> **LATER SAME SESSION — Ben's rulings:**
> - **Feel test step 6: PASS.** Ben's verdict: the memory-ON reply sounds like Morgan — voice holds under the canon block. No per-surface off-switch needed. Open decision 1 CLOSED.
> - **Branch pushed** (`3b579c8..ff8f276`); PR #66 updated, open, mergeable.
> - **CodeRabbit gate: dead on this PR** — "Review skipped: Too many files" (197 > 150 limit) plus insufficient org usage credits. **Ben ruled: accept the internal gate instead** — every commit on the branch passed an independent scoped review (SDD ledger). PR-triage step CLOSED.
> - Next: Ben hand-applies the 9 contract edits (`integrations/buzz/memory-contract.md` ×1, `integrations/story-wayfinder/memory-contract.md` ×4, `integrations/pitchstudio/memory-contract.md` ×4) and runs his manual Wayfinder harness gate → merge (Ben's call alone).
> - Still open for Ben: spoiler canon visibility, Buzz conflict auto-detection deferral, four PRD defaults, Grave Affairs `memory/` folder.
> - **Promote/authority finding RESOLVED by Ben's ruling (2026-08-16, "fix the promote issue"):** commit `1474378` — an explicit promote in review is now the human-in-the-loop ratification. New store-stamped authority variant `{verification:'writeros-promotion'}` (unpublishable, so imports can't forge it); promote requires candidate + clear + canon + source approval `explicit`. Unblocks 68 of the 102 imported atoms; the 34 with approval `none` (unratified in wayfinder) stay review-only by doctrine. AFK-ratified and legacy-downgraded candidates became promotable too (tests updated with ruling citations). Conflict-resolution activation still uses the old strict gate — follow-up if Ben wants alignment. Live-verified: real atom promoted in UI → ledger `promoted` event rev 180, stamp on record, canon.md shows "Authority: promoted in WriterOS review". Scoped review of `1474378`: PASS (nits: replay's `published` branch doesn't reject hand-forged derived markers — within the ledger trust boundary; stamping replaces an ineligible verified-shape authority in the snapshot, original ticket metadata recoverable from the ledger). Pushed `ff8f276..1474378` — PR #66 current with local HEAD.
> - **Test project DELETED** (Ben's instruction, 2026-08-16): `Memory feel test (f7ef17c4).writeros` moved to Trash after the feel test and promote verification completed. Dev server on 5199 stopped. Bloodless wayfinder source files were never touched (import was read-only).
> - **Stool Pigeon imported to WriterOS (2026-08-16 evening):** new server project `Stool Pigeon (785623e6).writeros`; 21 records published via memory CLI from `stool-pigeon-test/STOOL-PIGEON-outline.md` (13 canon candidates awaiting Ben's promote, 4 open questions active, 4 development candidates). Publish inputs kept in session scratchpad `stool-pigeon-records/`. Buzz-atom top-up available later: the Studio archiver IS live on the new community (correction to an earlier stall diagnosis — the repoint wrote to a NEW separate root `~/buzz-archive-stool-pigeon/`, status live/authenticated, capturing channel `ce2311b7…`; the old `~/buzz-archive/status.json` was stale understudy state, not the live one). Old Archivist identity + owner-signed auth tag carried over to the new relay unchanged — no Buzz-app re-provisioning was needed. Ben promoted all 13 Stool Pigeon canon candidates 2026-08-16 evening.
> - **Buzz moved to a new self-owned hosted community (2026-08-16).** No WriterOS code impact. But when Ben applies the Buzz contract edit (one of the 9): the `link-source` channel id must be the NEW stool-pigeon channel in the new community — NOT `934064c8…` (that was The Understudy test channel; Ben ruled its content disposable). Also: never mix two channels' atoms in one atoms tree — the importer hard-fails the whole import on a channel mismatch.

Written 2026-08-16 by the controller/reviewer session, mid-browser-acceptance. Read fully before acting. The SDD ledger at `.superpowers/sdd/WriterOS-Unified-Project-Memory-V1-Plan/progress.md` is the complete build record (every ruling, review, fix round); this note is the working-state summary.

## What we are testing right now, and why

**The "feel test"** — Ben's concern: every WriterOS agent surface now carries a memory/canon block in its prompt, and nobody has measured whether that changes how his tuned personas *sound* (tested with fake model providers only). We are A/B testing a real persona on real canon.

Setup already done:
- Test project created by Ben: `/Users/ben/Documents/WriterOS Projects/Memory feel test (f7ef17c4).writeros`
- Real Bloodless canon imported into it (import reads Bloodless READ-ONLY; only the test package was written): **158 records applied — 16 active canon (all ratified decisions), 102 candidates (atoms), 40 open questions.** Split-layout import worked from one `--from`.
- Ben confirmed all 16 canon cards render in Memory → Canon. (Browser-acceptance steps 1 and 3: PASS.)

Remaining feel-test steps:
1. **Step 4:** Ben opens the test project's Synopsis, asks the writing partner exactly: *"Remind me — why was Ivy already on the Prescott job before the solo rule existed? Does that contradict our canon?"* Canonical truth: the solo rule dates from Sebastian's ultimatum, which came AFTER the Prescott job — no contradiction. With memory ON the agent should nail this and the receipt under the reply should cite the right records.
2. **Step 5 — memory OFF mechanism:** there is no runtime toggle. Flip by restarting the dev server WITHOUT `WRITEROS_PROJECTS_ROOT` (memory then reports status "disabled" on all agent paths; chat still works). Then Ben asks the SAME question again.
3. **Step 6 — Ben judges:** (a) accuracy with vs without memory; (b) whether the persona's VOICE is unchanged or has gone stiff/listy under the canon block. Only Ben can judge (b) — that is the point of the test.

Ben now has an `agent-browser` skill available (see `~/.claude/CLAUDE.md` → Browser Automation) — the resumed session may be able to drive some browser steps directly, but voice judgment stays Ben's.

## How to run the app (critical — this burned us once)

- **Always run from THIS worktree**, never the main checkout: a Hermes-supervised server (launchagent `ai.hermes.gateway`) runs the OLD main-checkout WriterOS on port 5177 and relaunches itself if killed. **Never fight it. Never use 5177.**
- Command: `cd ~/Projects/WriterOS/.worktrees/unified-project-memory-v1 && PORT=5199 WRITEROS_PROJECTS_ROOT="/Users/ben/Documents/WriterOS Projects" npm run dev` → app at http://127.0.0.1:5199
- A background server from the previous session may still be running on 5199 — check `lsof -nP -iTCP:5199 -sTCP:LISTEN` and verify its cwd is the worktree before starting another.
- `.env` in this worktree is a symlink to the main checkout's `.env` (gitignored; created for the walkthrough so room/AI keys work).

## Code state

- Branch `codex/unified-project-memory-v1`, worktree `~/Projects/WriterOS/.worktrees/unified-project-memory-v1`, HEAD `50fb3ce`, working tree clean.
- All 12 plan tasks complete + final whole-branch review + final fix wave + 2 parked fixes + acceptance fixes. Full suite at HEAD: 2381 passed / 10 skipped; `npm run check` clean.
- **PR #66 is STALE**: pushed at `3b579c8`; local has 3 unpushed commits (`199b11c`, `abfb5a5`, `50fb3ce`). Pushing updates the PR and triggers CodeRabbit auto-review (Ben's org reviews every push; this replaced the plan's Greptile gate — Ben has no Greptile subscription). Nobody has checked PR #66 for CodeRabbit findings yet.
- **Unreviewed commit:** `50fb3ce` (analysis-queue failure isolated from snapshot rendering + section-level retry) was committed with RED→GREEN evidence but its scoped review was never dispatched — the session ended first. Dispatch a small scoped review of `abfb5a5..50fb3ce` (diff via the SDD skill's review-package script) before considering the branch review-complete.
- Half-finished: nothing else. No uncommitted edits.

## Known residue / traps

- **Grave Affairs** (`…/Grave Affairs (eea74df4).writeros`) was opened in the NEW app during acceptance; autosave added a `memory/` folder (near-empty). **Trap: the OLD app (5177) still has the folder-deleting save bug — editing Grave Affairs there will silently delete that folder.** Ben was offered deletion of the folder to fully decouple; **he never answered** — open decision. Content is trivial/re-derivable either way.
- The browser-folder (File System Access) mode shows a session-error instead of the intended browserOnly notice — real small gap, pinned by a deliberately-labeled test (`tests/components/AppMemoryActivation.test.tsx`, "KNOWN GAP"), deferred.

## Open decisions (Ben's, all still pending)

1. **Feel-test verdict** (in progress — see above). If voice degrades: a per-surface memory off-switch was offered as the remedy (small, not yet built).
2. **Spoiler canon visibility:** Ben's own agents currently cannot see spoiler-marked canon (e.g. the ending) and could contradict it unknowingly. Show it to his agents, or keep hidden?
3. **Buzz conflict detection:** V1 imports all Buzz atoms as review candidates but does NOT auto-flag contradictions with existing canon (Ben eyeballs while promoting). Accept for V1? (Auto-detection = recorded V1.1 headline item.)
4. **Four PRD defaults pending Ben's confirmation** (recorded in the plan/PRD): Buzz arbitration (Ben arbitrates, deviating from Buzz PLAN §11 atoms-win); Bloodless atoms.jsonl imported read-only; Buzz bundle delivery manual in V1; Bloodless stays dry-run-only until Ben creates a local home.
5. **Grave Affairs memory/ folder** — delete or keep (see residue).

## Remaining before merge (in order)

1. Finish feel test (steps 4–6 above).
2. Remaining browser-acceptance steps: patch preview on Synopsis ("rewrite this synopsis" → Apply/Keep/Dismiss), edit-a-document → proposal appears in Memory Review, promote/reject/conflict actions with confirmation gates, conflict banner behavior, normal-writing regression sniff.
3. Scoped review of `50fb3ce`.
4. Push branch (updates PR #66) → triage CodeRabbit findings (verify each against code before acting — treat as claims, same as every reviewer).
5. Ben hand-applies the 9 contract edits (`integrations/*/memory-contract.md` — exact OLD/NEW anchors + rollback text, all verified byte-exact) and runs his manual Wayfinder harness gate.
6. Merge — Ben's call alone. Then `superpowers:finishing-a-development-branch`; the complete "Rulings I made" list (17 rulings) was delivered to Ben in-conversation and lives in the ledger.

## House rules that governed this build (keep them)

- Canon explicit-only (Ben ratified 2026-08-15; saved to persistent memory as `canon-explicit-only`): nothing auto-becomes canon, ever.
- Never write to Bloodless (iCloud), PitchStudio, buzz-writers-room, or `~/.claude/skills/story-wayfinder` — contracts are hand-apply-by-Ben only.
- No story/character names (Bloodless, Ivy, Sebastian, …) in code, tests, or fixtures — Ben's standing rule.
- Never stage `AGENTS.md` or `supabase/.temp`.
- Every code change: implementer → scoped independent review → fix rounds. No unreviewed commits (see `50fb3ce` gap above).
- Plain language with Ben, one question at a time, no option grids. He's told us when we got this wrong.
