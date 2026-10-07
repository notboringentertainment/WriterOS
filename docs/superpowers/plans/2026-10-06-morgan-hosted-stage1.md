# Morgan Hosted — Stage 1 Implementation Plan

_Revision 9 (Task 0 amendments) — rescoped with Ben on 2026-10-06 after five Codex rounds on a read-only Stage 1, then a focused Codex round on the new parts (review log beside this file). Stage 1 now reaches parity with what Claude Code did for Ben in the 2026-10-06 dry run. Parts carried over from revision 5 (process cleanup, channel, routes, browser plumbing) were reviewed in those rounds; the new parts are marked **[new in rev 6]** for a focused Codex review._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Morgan is Ben's writing partner inside WriterOS: a full conversation that can read everything that helps, run commands, draft and rewrite the Script, Story Bible, Outline, Treatment and Synopsis with him, edit Story-drive files and update canon when he directs it — asking him in the WriterOS page before any change, the way Claude Code asked him in the terminal — and pick up the same conversation the next day. Behind a feature flag; the live app is unchanged until Ben turns it on.

**Architecture:** The Story-drive pattern, ported from an Electron app to WriterOS's Express server and browser client. The server runs the Claude Code CLI in a pseudo-terminal (`node-pty`) per project, loads a WriterOS mod with `--plugin-dir`, and the mod reports the session to the server over a token-checked Unix socket. The server relays it to the browser as a server-sent event stream read with `fetch`. Three things travel the other way: Ben's messages, his answers to **approval cards** (the mod turns Claude Code's permission requests into cards in the page instead of terminal dialogs), and his Keep/Dismiss on **proposed page changes** (a mod tool Morgan uses to change a WriterOS page, so she never writes the files behind an open page).

**Tech Stack:** Node 22, Express 4, ESM (`"type": "module"`), React + Vite + TipTap, Vitest 4 (jsdom by default), `node-pty` 1.1.0, Claude Code CLI ≥ 2.1.290 (installed: 2.1.292), Claude Code mod API (`claude plugin test`, `claude plugin validate`; reference: https://code.claude.com/docs/en/plugins/mods/events).

**Spec:** Decided with Ben on 2026-10-06 (see "Decisions"); `~/Projects/dry-runs/HANDOFF-2026-10-06-morgan-untethered.md` (capability target A1–A7); `~/Projects/dry-runs/2026-10-06-dry-run-gaps.md` (G8). The pattern being copied: `~/Projects/story-drive/docs/superpowers/specs/2026-10-03-live-session-screen-design.md` and `2026-10-03-live-spike-results.md`.

**Base:** branch from `origin/main` (`5f9a4b1`, what `~/WriterOS-Prod` runs). WriterOS line numbers below are from `origin/main`.

---

## Task 0 results — amendments (authoritative; they override the tasks below where they differ)

Task 0 was run on 2026-10-06 (`2026-10-06-morgan-hosted-stage1-checks.md`). Four findings change the build. Where a task below disagrees with this section, **this section wins**.

### A1. Approval cards use `tool.check`, polled — not `classic.PermissionRequest`

A `classic.PermissionRequest` handler is cut off after ~30 s and Claude Code draws its own prompt first. A `tool.check` handler that sees `ask` and polls WriterOS in short requests waited 90 s, answered both ways, and the native prompt never appeared. Replace Task 3 Step 4's handler with:

```ts
// mod/writeros-morgan/hooks/register.ts (inside register)
on('tool.check', async ($, e, next) => {
  const decided = await next(e)                    // what settings and permission mode decided: allow | ask | deny
  if (decided.decision !== 'ask') return decided
  const tool = String((e as any).tool)
  const input = ((e as any).input ?? {}) as Record<string, unknown>
  const full = JSON.stringify(input)
  if (full.length > 64 * 1024) return { decision: 'deny', reason: 'This change is too large to show on one approval card; split it into smaller steps.' }
  const requestId = randomId($)                    // existing id helper in register.ts
  const ask = { epoch: currentEpochId(), requestId, tool, summary: describePermission(tool, input), input: full }
  for (;;) {
    let reply: PermissionPoll
    try { reply = await pollPermission($, ask) } catch { return { decision: 'deny', reason: 'WriterOS could not show the approval card, so nothing was changed.' } }
    if (reply.pending) continue                     // WriterOS holds each poll ≤ 20 s; time inside mod API calls does not count against the hook's 10 s budget
    return reply.allow ? { decision: 'allow' } : { decision: 'deny', reason: reply.note ? `The writer said no: ${reply.note}` : 'The writer said no.' }
  }
}).catch(() => ({ decision: 'deny', reason: 'Morgan\'s approval step failed, so nothing was changed.' }))
```

- `pollPermission` is a top-level function: `const r = await $.http.fetch('http://writeros-morgan/permission', { method: 'POST', socketPath, headers, body: JSON.stringify(ask) }); return JSON.parse(String(r.text))` — the mod API's response body is the **`text` property** (no `json()`), and the same applies to every `call(...)` in the ported register.ts.
- Protocol: `type PermissionPoll = { pending: true } | { pending?: false; allow: boolean; note?: string }`. Re-polling with the same `requestId` attaches to the same card (WriterOS creates the card on the first poll only).
- `/permission` (Task 4): hold each request up to **20 s**; if Ben has not answered, reply `{ pending: true }`. A `requestId` with no poll for 60 s is abandoned (card removed, `onAbandon`).
- The `classic.PermissionRequest` handler stays as ported from Story-drive (it reports `waiting-for-input` for the live screen's turn state) and calls `next(e)`; it no longer answers anything. Because `tool.check` decides before any prompt, it should not fire for tools that reach a card; if it does fire, the page shows the stuck state (Task 7).
- `toDecision` and its `hookSpecificOutput`/`decision.behavior` shapes are removed; tests in Task 3 Step 4 target `tool.check` through engine dispatch: `next` resolving `ask` + a stubbed `/permission` returning `{pending:true}` then `{allow:false,note:'no'}` → `{ decision: 'deny', reason: 'The writer said no: no' }`; `next` resolving `allow` → returned unchanged with no fetch; fetch failure → deny.

### A2. Process ownership by process tree and a pid registry — no environment marker

macOS 15 does not show another process's environment (`ps -E`, `ps eww` and `KERN_PROCARGS2` return arguments only). Drop `WRITEROS_MORGAN_SESSION`, `findMarked` and `stopMarked` everywhere. Instead:

- `server/morganHost/markerSweep.ts` is renamed `ownership.ts` and keeps `descendantsOf(pid)` and `stopProcesses(list, graceMs)` as written in Task 5 Step 3, with `ProcInfo` gaining `started: string` (the `lstart` column, `ps -o pid=,ppid=,pgid=,lstart=`; parse the last 5 fields as the start time).
- A **pid registry** `<runDir>/owned.json` holds `{ pid, pgid, started }` for every process WriterOS knows Morgan owns: the Claude Code child at spawn, and every descendant each time `refreshOwned` sees it (every 2 s and before any stop). Entries are removed once confirmed dead. Writes are serialized (same pattern as `fileSessionStore`).
- A recorded process is ours only if a process with that pid **and the same `started` value** is alive; this rules out pid reuse. Groups are signalled only for verified entries whose `pid === pgid`.
- Session cleanup (`finish()`): stop the retained `owned` set with `stopProcesses`; a survivor marks the project stuck and stays in `owned.json`.
- Forced stop (`killAllNow`): synchronously read `owned.json`, `ps -o pid=,lstart= -p <pids>`, SIGKILL entries whose start time matches.
- Boot (`ready`): same verification, SIGTERM → SIGKILL, keep survivors recorded.
- Tests: replace the marker tests with: a recorded live process is stopped; a recorded pid whose start time differs is left alone; an unrecorded process is never touched; a detached child of the session (the `bash` and `orphan` fake modes) is stopped at session end.
- Remove `WRITEROS_MORGAN_SESSION` from `morganEnv`, the env allowlist in Global Constraints, the launch test's expected env, and the fake's modes (the `bash` mode's child is found by parent link).

### A3. The folder-trust question becomes an approval card

In a folder Claude Code has not seen, the first screen asks whether to trust the folder, with "No, exit" selected; Enter quits. In `MorganSessions` (Task 5), keep the last 8 KB of the child's terminal output (ANSI stripped); before `hello`, if it contains `Yes, I trust this folder`, emit an approval card `{ requestId: 'folder-trust', tool: 'FolderTrust', summary: 'Let Morgan work in <folder>? Claude Code asks this once per folder.' }` and pause the start timer. Allow → write `\x1b[B` then `\r` to the child (Down, Enter); Don't allow → end the session with "Morgan needs your OK to work in this folder." The `ChildProcessLike` interface gains `write(data: string): void` and `onData(cb)`; `spawnWithPty` forwards both (it still drains output). Test with a fake mode `trust` that prints the trust screen text and waits for Down+Enter on stdin before saying hello.

### A4. Smaller corrections

- **node-pty**: add `"postinstall": "chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true"` to `package.json` (the 1.1.0 prebuild ships without the execute bit → `posix_spawnp failed`). Default import `import pty from 'node-pty'` works.
- **Preflight** checks `authMethod === 'claude.ai'` from `claude auth status --json` (Ben: `claude.ai`, `firstParty`, `max`).
- **Settings**: `ISOLATION_ARGS = ['--restricted', '--strict-mcp-config']`, `PERMISSION_MODE = 'manual'`, `SANDBOX_SETTINGS = { enabled: true }`, `CLAUDE_MEM_DIR = '~/.claude-mem'` (expanded), no `claudeMdExcludes`.
- **Task 0 Step 5** (production permission set) runs after Task 3, against the real mod, before Task 4 starts.

## The whole job, in stages

| Stage | What Ben gets | Plan |
|---|---|---|
| 1 | Morgan as his writing partner inside WriterOS, with what Claude Code did for him (A1–A7): reads Story-drive folders, images (except casting folders), past sessions, WriterOS/Story-drive/OpenMontage code and logs; runs commands; drafts and rewrites pages as proposed changes he keeps or dismisses; edits Story-drive files and updates canon when he says yes; resumes the conversation across days. | **This plan** |
| 2 | Writers' Room / specialist personas brought under Morgan; images Ben drops into the chat; a raw terminal view for rare prompts the page cannot show. | Later |
| 3 | Workers on Ben's Mac: Morgan starts worker agents, one per WriterOS role, each with the instructions Ben wrote for that role (`shared/personas.ts`), passed with `--agents`. (Claude app threads set aside: they belong to Claude app projects and run in the cloud, away from his iCloud folders.) | Later |
| 4 | Beat-bound surfaces: Synopsis, Treatment, Story Bible, Outline and Script open once the beat sheet is resolved, with questions generated from the beats instead of the fixed decks (`client/src/lib/*Deck.ts`); the beats guide, the page wins. Read `docs/product/README.md` first. | Later |
| 5 | Retire the old Morgan path (`/api/wp-chat` runtime) once the new one is the default. | Later |

## Decisions (from Ben, 2026-10-06)

| # | Decision |
|---|---|
| D1 | Engine: the Story-drive pattern (hidden Claude Code + a mod that reports to the app's own screen). |
| D2 | Top-down: Ben talks only to Morgan; Morgan starts workers for each WriterOS role (Stage 3), on his Mac. |
| D3 | The code that runs canon and project memory (`server/projectMemory/`), the beat sheet import (`beatSheetSync.ts`), What's Standing and the Look panel are not rewritten by this build. Morgan **uses** them: she runs the memory commands, including imports, when Ben says yes. |
| D4 | WriterOS stays a browser app. |
| D5 | Surfaces are bound to the beat sheet; questions come from the beats (Stage 4). |
| D6 | Morgan drafts; nothing changes without Ben's yes. His yes in the conversation or on a card is the approval canon requires. |
| D7 | Writers' Room left alone for this build. |
| D8 **[new in rev 6]** | **WriterOS is above canon.** It is where Ben writes, and the page wins. Morgan is his writing partner first ("sitting down with a pen and paper and getting the story scripted"); keeping canon straight is second: when the page departs from canon she says so and offers to update canon to match, so Story-drive, WriterOS and OpenMontage / Front Lot tell the same story. |
| D9 **[new in rev 6]** | **Parity, not a read-only first stage.** Stage 1 gives Morgan what Claude Code did for Ben; safety comes from asking before changing, not from removing abilities. |

## Global Constraints

- Live WriterOS (`~/WriterOS-Prod`, port 5177) behaves exactly as today unless `WRITEROS_MORGAN_HOST=1` is set in its `.env`. `/api/wp-chat` stays as it is.
- Morgan runs only for server-backed projects (project library enabled, package on disk). Browser-only projects show the old Morgan.
- Claude Code minimum version: `2.1.290`.
- Every new HTTP route uses `sameOrigin(config)` and `authenticated(config)` from `server/projectLibrary/security.ts`, including the event stream.
- **Isolation, not restriction.** `--restricted --strict-mcp-config` keeps Ben's personal Claude Code setup (his plugins, hooks, skills, MCP servers, user/project/local settings files) out of Morgan, so she is Morgan and not a copy of his coding assistant. `--tools` names every tool she has; WriterOS's own `--settings` gives the permissions. Nothing is inherited.
- **What Morgan can do** (each change asks Ben first unless marked automatic):
  - Read, search and list (automatic) anywhere under her read roots: the project's Story-drive folder (her working folder), its WriterOS package, the WriterOS source folder, and `MORGAN_READ_DIRS` (default, if unset: `~/Projects`, `~/Library/Mobile Documents/com~apple~CloudDocs/My Scripts`, `~/.claude/projects` for past session transcripts, and the claude-mem data folder recorded in Task 0). Images are readable, except casting folders.
  - Claude Code's built-in read-only shell commands (automatic); every other command asks — including `npm run memory -- import … --apply`, the beat sheet parser, and anything that writes.
  - Edit or create files under her read roots (asks), for example a Story-drive beat sheet with a dated amendment note.
  - Change a WriterOS page (Script, Story Bible, Outline, Treatment, Synopsis) only through her `propose_page_change` tool: Ben sees the change in the page and keeps or dismisses it.
  - Web search (automatic) and fetching a web page (asks).
  - Built-in helper agents for research (`Agent`, automatic; they inherit her permissions).
- **What stays off-limits, each with what it protects:**
  - Reading anything under a `casting-inspiration` folder (resolved path): the casting firewall — real-person images are seen by Ben only (OpenMontage D16/D17, `canon/visual/casting-inspiration/`).
  - Writing files inside the project's WriterOS package: the open page would overwrite her change or she would overwrite his; page changes go through `propose_page_change`.
  - Filling in Look panel fields (`lookbook`, `looks` are not proposable surfaces): Ben decides looks; Morgan may explain fields.
  - `AskUserQuestion`: its dialog cannot be shown in the page; Morgan asks in plain conversation instead.
- **Environment is an allowlist**: `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TMPDIR`, `PATH` (from Ben's login shell), `TERM=xterm-256color`, the two channel variables, `WRITEROS_MORGAN_PACKAGE` (for the mod's guard), and `WRITEROS_MORGAN_SESSION=<port>:<id>` (marks every process Morgan starts, so WriterOS can find and stop them). Nothing else passes through (not `ANTHROPIC_*`, which would change billing or routing; not `CLAUDECODE`/`CLAUDE_CODE_*`).
- **Preflight** runs with the same binary, environment and isolation as the session and confirms the login is Ben's Claude account, without printing any credential.
- Socket directory per server instance: `~/.writeros/run/<port>/`, mode `0700`; socket mode `0600`; path ≤ 103 bytes; 32-byte random token per session.
- **Nothing Morgan starts outlives her session or a normal server stop.** Her process group is signalled SIGTERM then SIGKILL after 3 s; then every process carrying her `WRITEROS_MORGAN_SESSION` marker (including Bash tools, which Claude Code runs in their own process groups) is stopped the same way. If the server is killed hard, the next start stops every process carrying a marker for its port.
- No story or character names from Ben's projects in code, tests, fixtures or mock data.
- Morgan's display name is "Morgan"; internal persona id stays `writingPartner`. Say "Story-drive", never "wayfinder", in anything Ben reads.

## Review Focus

1. **A change happens without a card.** Expected: every edit, write, non-read-only command and web fetch shows a card first; nothing changes until Ben taps Allow. Pinned in Tasks 0, 4 and 8.
2. **A card is never answered** (Ben walks away, closes the tab, WriterOS restarts). Expected: the card is still there when he comes back to a running session; on session end every open card is answered "deny" and the turn ends cleanly. Pinned in Tasks 3 and 5.
3. **A page proposal arrives for a page Ben has changed since Morgan read it.** Expected: the card says it no longer fits and offers to ask Morgan to redo it; nothing is overwritten. Pinned in Task 7.
4. **Resume after a restart.** Expected: Start picks up yesterday's conversation; if Claude Code cannot resume it, Morgan starts fresh and says so. Pinned in Tasks 5 and 7.
5. **A Bash command is running when the session ends.** Expected: it is stopped with the session. Pinned in Task 5.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `server/morganHost/claudeCli.ts`, `shellPath.ts` | Preflight and login-shell PATH (ports of Story-drive). |
| `server/morganHost/launchArgs.ts` | Pure: argv, settings JSON, environment, working folder; resume or new session. |
| `server/morganHost/liveChannel.ts` | Unix-socket channel mod ↔ server (port of Story-drive `src/main/live.ts`) plus `/permission` and `/proposal`. |
| `server/morganHost/ptyProcess.ts` | `node-pty` adapter, process-group termination. |
| `server/morganHost/markerSweep.ts` | Finds and stops processes carrying a session marker. |
| `server/morganHost/morganSession.ts` | One session per project: start/resume, replay, submit, cards, proposals, awaited end, shutdown. |
| `server/morganHost/sessionStore.ts` | Remembers each project's Claude session id for resume. |
| `server/morganHost/proposals.ts` | Validates page proposals (structured documents, script blocks). |
| `server/morganHost/morganRoutes.ts`, `repoRoot.ts` | HTTP routes, event stream, production wiring. |
| `server/morganHost/persona.md` | Morgan's appended system prompt. |
| `mod/writeros-morgan/**` | The mod: reporter (ported), guard, permission relay, `propose_page_change` tool. |
| `shared/morganLive.ts` | Protocol, card and proposal types shared by server and client. |
| `client/src/lib/morganLive/model.ts` | Pure reducer (port of Story-drive `src/live/model.ts`) plus cards and proposals. |
| `client/src/lib/scriptProposal.ts` | Applies a script proposal to the TipTap document. |
| `client/src/components/shell/MorganLivePanel.tsx`, `MorganApprovalCard.tsx`, `client/src/components/writing/screenplay/ScriptProposalPreview.tsx` | Morgan's screen, approval cards, script proposal preview. |
| `tests/helpers/morganProtocol.ts`, `tests/fakes/fake-claude-morgan.mjs` | Typed fixtures; a stand-in for `claude`. |

Modified: `package.json`, `vitest.config.ts`, `server/routes.ts`, `server/index.ts`, `server/projectLibrary/routes.ts`, `shared/projectLibraryApi.ts`, `tests/server/projectLibraryRoutes.test.ts`, `client/src/lib/projectStorage.ts`, `client/src/lib/serverProjectStorage.ts`, `client/src/lib/useWriterOSProjectLibrary.ts`, `client/src/components/shell/Shell.tsx`, `LeftRail.tsx`, `client/src/App.tsx`, `client/src/components/writing/ScriptTab.tsx` (expose the editor for script proposals).

---

### Task 0: Branch, then verify the assumptions

Every check runs in a temp folder or a disposable clone and starts real Claude Code sessions, so Ben (or the implementer, with Ben's OK) runs them. Record results in `docs/superpowers/plans/2026-10-06-morgan-hosted-stage1-checks.md`. If a check fails, stop and bring it to Ben before Task 1.

- [ ] **Step 1: Branch.**

```bash
cd ~/Projects/WriterOS
git status --short   # must be clean apart from this plan; if not, stop and ask Ben
git fetch origin
git switch -c feat/morgan-hosted origin/main
```

- [ ] **Step 2: Isolation.** In `T=$(mktemp -d)`, with `env -i HOME=$HOME USER=$USER PATH="$PATH" TERM=xterm-256color`, run `claude --restricted --strict-mcp-config --tools Read,Grep,Glob,TodoWrite` and ask: "List every skill, plugin, hook message and instruction file you were given at startup, quoting the first line of each." Record: (a) logs in with Ben's Claude account (`--bare` is ruled out: it skips keychain reads); (b) none of his plugins, hooks, skills or MCP servers load; (c) whether `~/.claude/CLAUDE.md` text appears — if so add `"claudeMdExcludes": ["$HOME/.claude/CLAUDE.md"]` to WriterOS's settings and re-check. Then put a `.claude/settings.json` with a hook that echoes "PROJECT HOOK RAN" and an allow rule for `Write` into `$T`, start there, and confirm neither takes effect. Record `ISOLATION_ARGS` (expected `--restricted --strict-mcp-config`).
- [ ] **Step 3: The asking permission mode.** `claude --help` lists `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`. Confirm `manual` is the normal ask-before-acting mode: with `--permission-mode manual`, ask Claude to create `$T/x.txt` and confirm Claude Code shows its permission dialog. Record the mode as `PERMISSION_MODE`.
- [ ] **Step 4: The mod can answer a permission request.** With the copied Story-drive mod as a starting point, write a throwaway mod whose `classic.PermissionRequest` handler returns a deny decision without calling `next` (Codex read the installed 2.1.292 mod bridge: a top-level `{ decision: { behavior: 'deny', message } }` / `{ decision: { behavior: 'allow' } }`; the `hookSpecificOutput` wrapper is for external command hooks and is not unwrapped for mods), and a second variant that returns allow. Confirm: no dialog appears; deny stops the write; allow lets it happen. Also confirm what happens if the handler takes 5 minutes to answer (Claude Code must keep waiting, not time out to its own dialog). Record the exact return shape. **This is the key gate for the approval cards.**
- [ ] **Step 5: The production permission set.** Build the exact Task 2 launch for a project with Story-drive folder `$T/story`, package `$T/pkg.writeros`, read root `$T/roots` (create `a.md` in each, `$T/outside.md`, `$T/roots/casting-inspiration/face.png`, `$T/roots/pic.png`, a symlink `$T/roots/link.png -> $T/roots/casting-inspiration/face.png`). With the WriterOS mod from Task 4 loaded (re-run this step after Task 4), ask Morgan to: (a) read `$T/story/a.md` and `$T/roots/a.md` (automatic); (b) read `$T/outside.md` (refused); (c) read `$T/roots/pic.png` (automatic, she can see it); (d) read `$T/roots/casting-inspiration/face.png` and `$T/roots/link.png` (refused), and ask a helper agent (`Agent`) to read the same files (refused); (e) run `ls` (automatic); (f) run `touch $T/story/y` (card); (g) edit `$T/story/a.md` (card); (h) write `$T/pkg.writeros/a.md` (refused, told to use a page proposal); (i) call `propose_page_change` (reaches WriterOS). Record results.
- [ ] **Step 6: Marker sweep.** Start the full launch with `WRITEROS_MORGAN_SESSION=test:1` in its environment, have Morgan run `sleep 300` (approve it), then from another terminal run `ps -E -ww -axo pid=,pgid=,command= | grep 'WRITEROS_MORGAN_SESSION=test:1'`. Confirm the `sleep` appears with its own process group (Bash tools are detached) and the marker is visible. Then SIGKILL the `claude` process and confirm the `sleep` survives (it will — this is why the sweep exists). Record the exact `ps` invocation that works.
- [ ] **Step 7: Resume.** Start with `--session-id <uuid>`, exchange one message, quit, then start with `--resume <uuid>` under the same flags and folder. Confirm the conversation continues and the mod's `hello` carries the earlier messages (Story-drive's Hello has `history`). Record how long until the resumed session's id is current (spike f says 0.3–3 s).
- [ ] **Step 8: Startup prompts.** With the full flags, start in a folder Claude Code has never seen and in Ben's real Story-drive project folder. Record every screen before the first prompt (folder trust, …) and the one-time Terminal command that clears it.
- [ ] **Step 9: Login type.** `claude auth status --json | jq 'del(.. | .token?, .apiKey?, .accessToken?)'` under the allowlisted environment; record the field that shows Claude account vs API key.
- [ ] **Step 10: node-pty in a disposable clone.**

```bash
D=$(mktemp -d) && git clone --quiet ~/Projects/WriterOS "$D/w" && cd "$D/w" && git switch -q feat/morgan-hosted
npm ci --silent && npm install --silent node-pty@1.1.0
node --input-type=module -e "import pty from 'node-pty'; const p = pty.spawn('/bin/echo', ['ok'], {}); p.onData(d => console.log(d.trim())); p.onExit(e => { console.log(JSON.stringify(e)); process.exit(0) })"
```

Expected: `ok` and an exit object with `exitCode`. If the default import fails, try `import * as pty from 'node-pty'`; record which works.
- [ ] **Step 11: Where past sessions live.** Record the claude-mem data folder (`ls -d ~/.claude-mem* ~/.claude/claude-mem* 2>/dev/null`) and confirm `~/.claude/projects/*/*.jsonl` holds Claude Code transcripts. These become default read roots.
- [ ] **Step 12: The Bash sandbox.** With the full launch (Task 2 settings incl. `sandbox`), have Morgan run: (a) `cp $T/roots/casting-inspiration/face.png $T/roots/copy.png` — expected refused by the sandbox; (b) `echo x > $T/pkg.writeros/documents/outline.json` — refused; (c) `npm run memory -- report --project $T/pkg.writeros` from WriterOS's folder (use a real fixture package) — works; (d) the canon import dry run and `--apply` on a fixture package — works with its card (writes memory files, not page files). Record the exact sandbox setting keys the installed CLI accepts (`enabled`, the unsandboxed-command escape hatch, network defaults) and whether the sandbox reads the Read/Edit deny rules; set `SANDBOX_SETTINGS` in Task 2 to match. If (c) or (d) cannot work inside the sandbox, list the command in the sandbox's excluded commands so it runs outside it with a card, and record that.
- [ ] **Step 13: Commit the results.**

```bash
git add docs/superpowers/plans/2026-10-06-morgan-hosted-stage1-checks.md
git commit -m "docs(morgan): record stage 1 Claude Code checks"
```

---

### Task 1: Dependency, Claude Code preflight

**Files:**
- Modify: `package.json`, `vitest.config.ts`
- Create: `server/morganHost/claudeCli.ts`, `server/morganHost/shellPath.ts`
- Test: `tests/server/morganHost/claudeCli.test.ts`, `tests/server/morganHost/shellPath.test.ts`

**Interfaces:**
- Produces: `MIN_MORGAN_VERSION = "2.1.290"`; `preflight(deps: PreflightDeps): Preflight` where `Preflight = { ok: true; path: string; version: string } | { ok: false; reason: 'not-found' | 'old-version' | 'not-logged-in' | 'api-key-login'; message: string }`; `preflight` is **asynchronous** (`Promise<Preflight>`) so it never blocks the server's event loop or its signal handlers; `PreflightDeps = { exec(file: string, args: string[], env: Record<string,string>, signal?: AbortSignal): Promise<string>; exists(p: string): boolean; home: string; savedPath: string | null; env: Record<string,string>; isolationArgs: string[] }`; `realDeps(env, isolationArgs, signal?: AbortSignal): PreflightDeps` (uses promisified `execFile` with a 5-second timeout per call and the given `signal`, so `shutdown()` kills a hung preflight subprocess well inside the server's 10-second stop deadline); `loginShellPath(fallback: string | undefined, run: RunShell, shell?: string): string`.

- [ ] **Step 1: Add the dependency and exclude the mod from Vitest.**

```bash
npm install node-pty@1.1.0 --save-exact
```

In `vitest.config.ts`, add `'mod/**'` to `test.exclude` (keep existing entries). In `package.json` scripts:

```json
"test:mod": "claude plugin validate mod/writeros-morgan && claude plugin test mod/writeros-morgan"
```

- [ ] **Step 2: Port the two helpers and their tests.**

```bash
cp ~/Projects/story-drive/src/main/shellPath.ts server/morganHost/shellPath.ts
cp ~/Projects/story-drive/src/main/claudeCli.ts server/morganHost/claudeCli.ts
ls ~/Projects/story-drive/test | grep -iE "shell|claude"   # copy the matching test files into tests/server/morganHost/
```

Change `claudeCli.ts` and its tests:
- `MIN_LIVE_VERSION` → `MIN_MORGAN_VERSION = "2.1.290"`; delete `MIN_VERSION`, `liveCapable`, `liveOldVersion`, and the story-wayfinder skill check.
- Make `preflight` and `exec` asynchronous (Story-drive's are synchronous `execFileSync`, which would freeze WriterOS for up to 15 seconds per call). Every `exec` call passes `deps.env`, and `auth status --json` is run with `deps.isolationArgs` before it, so preflight sees exactly what the session will see.
- Add the account check recorded in Task 0 Step 9: if the login is an API key, fail with `reason: 'api-key-login'`, message "Morgan uses your Claude account, but Claude Code is logged in with an API key. Run `claude /login` in Terminal and choose your Claude account."
- Messages say "WriterOS" instead of "Story-drive"; the old-version message is "Morgan needs Claude Code 2.1.290 or newer. Update Claude Code, then click Start Morgan again."
- Imports: WriterOS server files import siblings without `.js` suffixes (check a neighbour such as `server/projectLibrary/security.ts` and match it). Copied test imports point at `../../../server/morganHost/…`.

Add a test that `exec` receives `deps.env` and that `isolationArgs` precede `auth status`.

- [ ] **Step 3: Run tests.**

Run: `npx vitest run tests/server/morganHost/`
Expected: PASS.

- [ ] **Step 4: Type-check and commit.**

```bash
npm run check
git add package.json package-lock.json vitest.config.ts server/morganHost tests/server/morganHost
git commit -m "feat(morgan): add node-pty and Claude Code preflight for hosted Morgan"
```

---

### Task 2: Launch arguments, settings and environment **[new in rev 6]**

**Files:**
- Create: `server/morganHost/launchArgs.ts`, `server/morganHost/persona.md`
- Test: `tests/server/morganHost/launchArgs.test.ts`

**Interfaces:**
- Consumes: `ISOLATION_ARGS`, `PERMISSION_MODE` and the settings shape recorded in Task 0.
- Produces:

```ts
export interface MorganProjectPaths { packagePath: string; storyDriveRoot: string | null }
export interface MorganHostPaths { writerosRoot: string; modDir: string; personaFile: string; readRoots: string[] }
export interface MorganLaunchInput {
  project: MorganProjectPaths; host: MorganHostPaths
  model: string
  session: { kind: 'new' | 'resume'; id: string }
  marker: string                        // `${port}:${sessionId}`, see WRITEROS_MORGAN_SESSION
  socketPath: string; token: string
  parentEnv: Record<string, string | undefined>; loginPath: string
  isolationArgs: string[]; permissionMode: string
}
export interface MorganSettings {
  permissions: {
    defaultMode: string; allow: string[]; deny: string[]
    additionalDirectories: string[]; blockReadsOutsideWorkingDirectories: true
  }
  [k: string]: unknown
}
export interface MorganLaunch { cwd: string; args: string[]; env: Record<string, string>; settings: MorganSettings }
export const MORGAN_TOOLS: readonly string[]
export const PROPOSE_TOOL = 'mcp__writeros-morgan__propose_page_change'
export function buildMorganLaunch(input: MorganLaunchInput): MorganLaunch
export function morganEnv(parentEnv: Record<string, string | undefined>, loginPath: string, extra?: Record<string, string>): Record<string, string>
export function morganModel(env: Record<string, string | undefined>): string
export function defaultReadRoots(home: string, claudeMemDir: string | null): string[]
export function readRootsFor(project: MorganProjectPaths, host: MorganHostPaths): string[]   // deduplicated; nested roots dropped
```

- [ ] **Step 1: Write the failing test.**

```ts
// tests/server/morganHost/launchArgs.test.ts
import { describe, expect, it } from 'vitest'
import { buildMorganLaunch, defaultReadRoots, morganEnv, morganModel, PROPOSE_TOOL, readRootsFor } from '../../../server/morganHost/launchArgs'

const host = {
  writerosRoot: '/src/WriterOS',
  modDir: '/src/WriterOS/mod/writeros-morgan',
  personaFile: '/src/WriterOS/server/morganHost/persona.md',
  readRoots: ['/home/b/Projects', '/home/b/.claude/projects'],
}
const base = {
  project: { packagePath: '/projects/Test Project.writeros', storyDriveRoot: '/icloud/Test Project' },
  host,
  model: 'claude-sonnet-5-5',
  session: { kind: 'new' as const, id: '00000000-0000-4000-8000-000000000001' },
  marker: '5177:00000000-0000-4000-8000-000000000001',
  socketPath: '/run/m.sock',
  token: 'a'.repeat(64),
  parentEnv: {
    HOME: '/home/b', USER: 'b', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', PATH: '/usr/bin',
    CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli',
    ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_AUTH_TOKEN: 't',
    OPENAI_API_KEY: 'o', NODE_ENV: 'production', PORT: '5177',
  },
  loginPath: '/opt/homebrew/bin:/usr/bin',
  isolationArgs: ['--restricted', '--strict-mcp-config'],
  permissionMode: 'manual',
}
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]
const all = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))

describe('buildMorganLaunch', () => {
  it('works in the Story-drive folder and reads every root', () => {
    const l = buildMorganLaunch(base)
    expect(l.cwd).toBe('/icloud/Test Project')
    const roots = ['/projects/Test Project.writeros', '/src/WriterOS', '/home/b/Projects', '/home/b/.claude/projects']
    expect(all(l.args, '--add-dir')).toEqual(roots)
    expect(l.settings.permissions.additionalDirectories).toEqual(roots)
    expect(l.settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true)
    for (const dir of ['/icloud/Test Project', ...roots]) expect(l.settings.permissions.allow).toContain(`Read(/${dir}/**)`)
  })

  it('falls back to the package folder when no Story-drive folder is linked', () => {
    const l = buildMorganLaunch({ ...base, project: { ...base.project, storyDriveRoot: null } })
    expect(l.cwd).toBe('/projects/Test Project.writeros')
    expect(all(l.args, '--add-dir')).not.toContain('/projects/Test Project.writeros')
  })

  it('has the full tool set and asks before changes', () => {
    const { args, settings } = buildMorganLaunch(base)
    expect(after(args, '--tools')).toBe('Read,Grep,Glob,Bash,Edit,Write,TodoWrite,WebSearch,WebFetch,Agent')
    expect(after(args, '--permission-mode')).toBe('manual')
    expect(settings.permissions.defaultMode).toBe('manual')
    for (const t of ['Grep', 'Glob', 'TodoWrite', 'WebSearch', 'Agent', PROPOSE_TOOL]) expect(settings.permissions.allow).toContain(t)
    for (const t of ['Edit', 'Write', 'Bash', 'WebFetch']) expect(settings.permissions.allow).not.toContain(t) // these ask
  })

  it('keeps the casting firewall, the open pages and the dialog it cannot show', () => {
    const { settings } = buildMorganLaunch(base)
    expect(settings.permissions.deny).toEqual(expect.arrayContaining([
      'Read(//**/casting-inspiration/**)',
      'Edit(//projects/Test Project.writeros/documents/**)',
      'Write(//projects/Test Project.writeros/documents/**)',
      'Edit(//projects/Test Project.writeros/script/**)',
      'Write(//projects/Test Project.writeros/script/**)',
      'AskUserQuestion',
    ]))
    expect(settings.permissions.deny).not.toContain('Edit(//projects/Test Project.writeros/**)') // canon imports write memory files
  })

  it('runs Bash in the sandbox so the same rules hold for commands', () => {
    expect(buildMorganLaunch(base).settings.sandbox).toMatchObject({ enabled: true })
  })

  it('starts a new conversation or resumes one', () => {
    expect(after(buildMorganLaunch(base).args, '--session-id')).toBe('00000000-0000-4000-8000-000000000001')
    const resumed = buildMorganLaunch({ ...base, session: { kind: 'resume', id: 'abc' } })
    expect(after(resumed.args, '--resume')).toBe('abc')
    expect(resumed.args).not.toContain('--session-id')
  })

  it('passes isolation, mod, persona, model and settings', () => {
    const { args, settings } = buildMorganLaunch(base)
    expect(args.slice(0, 2)).toEqual(['--restricted', '--strict-mcp-config'])
    expect(after(args, '--plugin-dir')).toBe('/src/WriterOS/mod/writeros-morgan')
    expect(after(args, '--append-system-prompt-file')).toBe('/src/WriterOS/server/morganHost/persona.md')
    expect(after(args, '--model')).toBe('claude-sonnet-5-5')
    expect(JSON.parse(after(args, '--settings'))).toEqual(settings)
  })

  it('environment: allowlist, login PATH, channel and the session marker', () => {
    expect(buildMorganLaunch(base).env).toEqual({
      HOME: '/home/b', USER: 'b', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8',
      PATH: '/opt/homebrew/bin:/usr/bin', TERM: 'xterm-256color',
      WRITEROS_MORGAN_SOCKET: '/run/m.sock', WRITEROS_MORGAN_TOKEN: 'a'.repeat(64),
      WRITEROS_MORGAN_SESSION: '5177:00000000-0000-4000-8000-000000000001',
      WRITEROS_MORGAN_PACKAGE: '/projects/Test Project.writeros',
    })
  })
})

describe('morganEnv', () => {
  it('is the same environment preflight uses, without session variables', () => {
    const env = morganEnv(base.parentEnv, base.loginPath)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.WRITEROS_MORGAN_SESSION).toBeUndefined()
  })
})

describe('read roots', () => {
  it('defaults to projects, iCloud scripts, past sessions and claude-mem', () => {
    expect(defaultReadRoots('/home/b', '/home/b/.claude-mem')).toEqual([
      '/home/b/Projects',
      '/home/b/Library/Mobile Documents/com~apple~CloudDocs/My Scripts',
      '/home/b/.claude/projects',
      '/home/b/.claude-mem',
    ])
  })

  it('drops duplicates and roots nested inside another root', () => {
    const roots = readRootsFor(
      { packagePath: '/home/b/Projects/x.writeros', storyDriveRoot: null },
      { ...host, writerosRoot: '/home/b/Projects/WriterOS', readRoots: ['/home/b/Projects', '/home/b/Projects'] },
    )
    expect(roots).toEqual(['/home/b/Projects'])
  })
})

describe('morganModel', () => {
  it('prefers MORGAN_MODEL, then ANTHROPIC_CHAT_MODEL, then the default', () => {
    expect(morganModel({ MORGAN_MODEL: 'a', ANTHROPIC_CHAT_MODEL: 'b' })).toBe('a')
    expect(morganModel({ ANTHROPIC_CHAT_MODEL: 'b' })).toBe('b')
    expect(morganModel({})).toBe('claude-sonnet-5-5')
  })
})
```

Note the nested-roots test: when the package or WriterOS source sit inside a broader root, only the broader root is listed; but the package's Edit/Write deny rules are kept regardless (they come from `project.packagePath`, not the root list). If Task 0 recorded a different path-rule syntax, mode name or `claudeMdExcludes`, change the expectations first.

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run tests/server/morganHost/launchArgs.test.ts`
Expected: FAIL, cannot resolve `launchArgs`.

- [ ] **Step 3: Implement.**

```ts
// server/morganHost/launchArgs.ts
// Builds one hosted Morgan session. She gets the tools Claude Code has; safety is asking first.
// Every limit names what it protects.
import path from 'node:path'

export interface MorganProjectPaths { packagePath: string; storyDriveRoot: string | null }
export interface MorganHostPaths { writerosRoot: string; modDir: string; personaFile: string; readRoots: string[] }
export interface MorganLaunchInput {
  project: MorganProjectPaths
  host: MorganHostPaths
  model: string
  session: { kind: 'new' | 'resume'; id: string }
  marker: string
  socketPath: string
  token: string
  parentEnv: Record<string, string | undefined>
  loginPath: string
  isolationArgs: string[]
  permissionMode: string
}
export interface MorganSettings {
  permissions: {
    defaultMode: string; allow: string[]; deny: string[]
    additionalDirectories: string[]; blockReadsOutsideWorkingDirectories: true
  }
  [k: string]: unknown
}
export interface MorganLaunch { cwd: string; args: string[]; env: Record<string, string>; settings: MorganSettings }

export const DEFAULT_MORGAN_MODEL = 'claude-sonnet-5-5'
export const MORGAN_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'TodoWrite', 'WebSearch', 'WebFetch', 'Agent'] as const
export const PROPOSE_TOOL = 'mcp__writeros-morgan__propose_page_change'
export const PAGE_DIRS = ['documents', 'script'] as const // the files behind open WriterOS pages
// Exact keys per Task 0 Step 12 (Claude Code sandbox settings, 2.1.292). Network stays as Claude Code's default for Bash.
export const SANDBOX_SETTINGS = { enabled: true, autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: true } as const

const ENV_KEYS = new Set(['HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR'])

export function morganModel(env: Record<string, string | undefined>): string {
  return env.MORGAN_MODEL || env.ANTHROPIC_CHAT_MODEL || DEFAULT_MORGAN_MODEL
}

// Allowlist, not denylist: WriterOS's own secrets and Anthropic routing variables never reach the child.
export function morganEnv(parentEnv: Record<string, string | undefined>, loginPath: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value !== undefined && (ENV_KEYS.has(key) || key.startsWith('LC_'))) env[key] = value
  }
  env.PATH = loginPath
  env.TERM = 'xterm-256color'
  return { ...env, ...extra }
}

export function defaultReadRoots(home: string, claudeMemDir: string | null): string[] {
  return [
    path.join(home, 'Projects'),
    path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'My Scripts'),
    path.join(home, '.claude', 'projects'),          // past Claude Code session transcripts
    ...(claudeMemDir ? [claudeMemDir] : []),         // past-session observations
  ]
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/')

export function readRootsFor(project: MorganProjectPaths, host: MorganHostPaths): string[] {
  const candidates = [...(project.storyDriveRoot ? [project.packagePath] : []), host.writerosRoot, ...host.readRoots]
  const unique = [...new Set(candidates)]
  const cwd = project.storyDriveRoot ?? project.packagePath
  return unique.filter(dir => !inside(dir, cwd) && !unique.some(other => other !== dir && inside(dir, other)))
}

export function buildMorganLaunch(input: MorganLaunchInput): MorganLaunch {
  const { project, host } = input
  const cwd = project.storyDriveRoot ?? project.packagePath
  const roots = readRootsFor(project, host)
  const settings: MorganSettings = {
    permissions: {
      defaultMode: input.permissionMode,
      additionalDirectories: roots,
      blockReadsOutsideWorkingDirectories: true,
      allow: [
        ...[cwd, ...roots].map(dir => `Read(/${dir}/**)`), // leading "//" = absolute path
        'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'Agent', PROPOSE_TOOL,
        // Bash, Edit, Write and WebFetch are not listed: they ask Ben (read-only shell commands are automatic in Claude Code).
      ],
      deny: [
        'Read(//**/casting-inspiration/**)',        // casting firewall: real-person images are for Ben's eyes only (Read rules also govern Grep, Glob and sandboxed Bash)
        ...PAGE_DIRS.flatMap(d => [`Edit(/${project.packagePath}/${d}/**)`, `Write(/${project.packagePath}/${d}/**)`]), // open WriterOS pages: changes go through propose_page_change (memory files stay writable for canon imports)
        'AskUserQuestion',                           // its dialog cannot be shown in the page; Morgan asks in conversation
      ],
    },
  }
  // Bash runs in Claude Code's sandbox, which enforces the same Read/Edit rules on commands and everything they start,
  // so a shell command cannot open a casting folder or write a page file. A command that genuinely needs to run outside
  // the sandbox asks Ben on a card first (Claude Code's own escape hatch), and its card says so.
  settings.sandbox = SANDBOX_SETTINGS
  const args = [
    ...input.isolationArgs,
    '--tools', MORGAN_TOOLS.join(','),
    ...roots.flatMap(dir => ['--add-dir', dir]),
    '--permission-mode', input.permissionMode,
    '--settings', JSON.stringify(settings),
    '--plugin-dir', host.modDir,
    '--append-system-prompt-file', host.personaFile,
    '--model', input.model,
    ...(input.session.kind === 'resume' ? ['--resume', input.session.id] : ['--session-id', input.session.id]),
  ]
  const env = morganEnv(input.parentEnv, input.loginPath, {
    WRITEROS_MORGAN_SOCKET: input.socketPath,
    WRITEROS_MORGAN_TOKEN: input.token,
    WRITEROS_MORGAN_SESSION: input.marker,
    WRITEROS_MORGAN_PACKAGE: project.packagePath, // the mod's guard keeps writes out of the open WriterOS pages
  })
  return { cwd, args, settings, env }
}
```

Merge any extra keys Task 0 recorded (for example `claudeMdExcludes`) into `settings`.

- [ ] **Step 4: Write the persona.**

```markdown
<!-- server/morganHost/persona.md -->
You are Morgan, the writer's partner inside WriterOS, the writer's own app. You are the person sitting across the table with a pen and paper, getting the story onto the page with them. You talk with the writer from inside WriterOS; they cannot see your tool calls unless they open them.

WriterOS is where the writing happens, and the page wins. Canon in Story-drive and the earlier tools is the backbone that kept the story straight until the writing started; it never overrules what the writer puts on the page. When the page moves away from canon, say so plainly and offer to update canon to match, so the later tools (Front Lot, OpenMontage) get the story the writer actually wrote.

How you work:
- Talk it through. Ask what the writer means when it matters; push back when something does not work and say why; then do the work.
- To change a WriterOS page (Script, Story Bible, Outline, Treatment, Synopsis), use your propose_page_change tool. The writer sees the change on the page and keeps or dismisses it. Read the page's current file in the project's WriterOS package first, so your change starts from what is there now. Never write those files directly.
- You can read the project's Story-drive folder (your working folder), its WriterOS package, WriterOS's code, the writer's other projects, past session transcripts, and images. Read broadly before answering, and name the file each answer came from.
- To update canon after a change: edit the Story-drive source (for example the resolved beat sheet decision) and add a dated amendment note saying what changed and why; then run `npm run memory -- import --source wayfinder --project <package> --from <Story-drive folder> --dry-run` in WriterOS's folder, tell the writer what it will change, and run it again with `--apply` when they agree. What's Standing is `npm run memory -- report --project <package>`.
- Anything that changes a file, runs a command that changes something, or fetches a web page will show the writer an approval card first. That is expected; explain in one line what you are about to do and why.
- If the writer comes back later and says something you did is not what they meant, fix it the same way: say what you will change, and make the change when they agree.

Never:
- Open anything in a casting-inspiration folder: those are photos of real people, for the writer's eyes only.
- Fill in Look panel fields: the writer decides looks. You may explain what a field means and what it does downstream.

Speak plainly, in short answers, without production or engineering jargon; if a term is unavoidable, explain it in a few words. Call the apps by their names: Story-drive, WriterOS, Front Lot.
```

- [ ] **Step 5: Run tests, type-check, commit.**

Run: `npx vitest run tests/server/morganHost/launchArgs.test.ts && npm run check`
Expected: PASS.

```bash
git add server/morganHost/launchArgs.ts server/morganHost/persona.md tests/server/morganHost/launchArgs.test.ts
git commit -m "feat(morgan): launch Morgan with Claude Code's tools, asking before changes"
```

---

### Task 3: The mod — reporter, guard, approval cards, page proposals **[new in rev 6, reporter carried over]**

**Files:**
- Create: `mod/writeros-morgan/**` (ported from Story-drive `mod/story-drive-live`), `mod/writeros-morgan/hooks/guard.ts`, `mod/writeros-morgan/hooks/permission.ts`, `mod/writeros-morgan/hooks/proposeTool.ts`
- Test: `mod/writeros-morgan/tests/guard.test.ts`, `mod/writeros-morgan/tests/permission.test.ts`, `mod/writeros-morgan/tests/proposeTool.test.ts`, `mod/writeros-morgan/tests/hooks.test.ts`
- Create: `shared/morganLive.ts`

**Interfaces:**
- Consumes: env `WRITEROS_MORGAN_SOCKET`, `WRITEROS_MORGAN_TOKEN` (Task 2); the PermissionRequest return shape recorded in Task 0 Step 4.
- Produces (in `mod/writeros-morgan/hooks/protocol.ts`, re-exported by `shared/morganLive.ts`): Story-drive's protocol (`Hello`, `ReportBatch`, `LiveEvent`, `Stamped`, `Ping { epoch, enqueuedThrough }`, `InboxAction`, `InboxAck`, `TOKEN_HEADER = 'x-writeros-morgan-token'`, routes `/hello`, `/report`, `/ping`, `/inbox`, `/inbox-ack`), plus:

```ts
export interface PermissionAsk { epoch: string; requestId: string; tool: string; summary: string; input: string } // input: complete JSON, ≤ 64 KB
export interface PermissionAnswer { allow: boolean; note?: string }                                              // reply to POST /permission

export type ScriptElement = 'scene-heading' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition'
export interface ScriptBlock { type: ScriptElement; text: string }
export type ScriptTarget =
  | { kind: 'replace-scene' | 'insert-after-scene'; sceneHeading: string; expectedScene: ScriptBlock[] } // the whole scene as Morgan read it: every paragraph's element type and text
  | { kind: 'append' }
export type PageProposal =
  | { surface: 'synopsis' | 'outline' | 'treatment' | 'storyBible'; baseRevision: number; content: unknown; summary: string }
  | { surface: 'script'; target: ScriptTarget; blocks: ScriptBlock[]; summary: string; expectedEnding?: ScriptBlock[] } // append: the last scene as read
export interface ProposalAsk { epoch: string; proposalId: string; proposal: PageProposal }
export interface ProposalOutcome { outcome: 'kept' | 'dismissed' | 'stale' | 'invalid' | 'session-ended'; note?: string; message?: string } // reply to POST /proposal
```

and `guardTool(tool, args, ctx): Promise<{ allow: true } | { allow: false; reason: string }>`.

The `ScriptElement` list must equal `ElementType` in `client/src/lib/screenplay.ts:1-7`.

- [ ] **Step 1: Copy and rename.**

```bash
cp -R ~/Projects/story-drive/mod/story-drive-live mod/writeros-morgan
grep -rn "story-drive\|STORY_DRIVE\|Story-drive" mod/writeros-morgan
```

Change every hit: `.claude-plugin/plugin.json` name `writeros-morgan` (description "Morgan inside WriterOS: reports the session, relays approvals and page proposals"); `hooks/protocol.ts:55` `TOKEN_HEADER = 'x-writeros-morgan-token'`; `hooks/register.ts` env names `WRITEROS_MORGAN_SOCKET` / `WRITEROS_MORGAN_TOKEN`, fetch host `http://writeros-morgan`, state atom `plugin: 'writeros-morgan'` (l.10); `types/index.d.ts:5` namespace `'writeros-morgan'`; tests the same. The final `grep` returns nothing.

- [ ] **Step 2: Remove Story-drive's `mark` tool** (its job — question cards and checklists for story-wayfinder — is not Morgan's): delete `registerMark` (register.ts:158-) and its call (l.219), the `tool.describe` handler for the mark tool (l.247-248), the mark branch in `tool.call` (l.294-298), `MARK_DESCRIPTION`, `MARK_TOOL`, the `mark` kind in `LiveEvent`, and their tests. Keep its registration pattern: Task 3 Step 6 registers a new tool the same way.

- [ ] **Step 3: The guard — tests, then code.** It is a second line behind the settings in Task 2, for the three things that must hold even if the settings are wrong.

```ts
// mod/writeros-morgan/tests/guard.test.ts
import { test, expect } from 'claude-code/testing'
import { guardTool, type GuardContext } from '../hooks/guard'

const ctx = (resolved: Record<string, string | null> = {}, pkg = '/projects/Test Project.writeros'): GuardContext => ({
  packagePath: pkg,
  resolve: async p => (p in resolved ? resolved[p] : p),
})

test('refuses casting-inspiration reads, including through a link', async () => {
  expect((await guardTool('Read', { file_path: '/a/canon/visual/casting-inspiration/face.png' }, ctx())).allow).toBe(false)
  const linked = await guardTool('Read', { file_path: '/a/pic.png' }, ctx({ '/a/pic.png': '/a/casting-inspiration/face.png' }))
  expect(linked.allow === false && linked.reason).toMatch(/real people/)
  expect((await guardTool('Grep', { path: '/a/casting-inspiration' }, ctx())).allow).toBe(false)
  expect((await guardTool('Glob', { path: '/a', pattern: '**/casting-inspiration/*' }, ctx())).allow).toBe(false)
})

test('allows ordinary images and text', async () => {
  expect(await guardTool('Read', { file_path: '/a/notes/frame1.png' }, ctx())).toEqual({ allow: true })
  expect(await guardTool('Read', { file_path: '/a/MAP.md' }, ctx())).toEqual({ allow: true })
})

test('refuses a read it cannot resolve', async () => {
  expect((await guardTool('Read', { file_path: '/a/x.md' }, ctx({ '/a/x.md': null }))).allow).toBe(false)
})

test('refuses writes inside the WriterOS package and points to page proposals', async () => {
  for (const tool of ['Edit', 'Write']) {
    const r = await guardTool(tool, { file_path: '/projects/Test Project.writeros/documents/outline.json' }, ctx())
    expect(r.allow === false && r.reason).toMatch(/propose_page_change/)
  }
  const viaLink = await guardTool('Edit', { file_path: '/tmp/o.json' }, ctx({ '/tmp/o.json': '/projects/Test Project.writeros/documents/outline.json' }))
  expect(viaLink.allow).toBe(false)
  // memory files are not pages: canon imports and Morgan's own fixes there go through her normal approval card
  expect(await guardTool('Edit', { file_path: '/projects/Test Project.writeros/memory/x.json' }, ctx())).toEqual({ allow: true })
})

test('lets Edit and Write elsewhere through to Claude Code\'s own approval card', async () => {
  expect(await guardTool('Edit', { file_path: '/icloud/Test Project/wayfinder/resolved/28.md' }, ctx())).toEqual({ allow: true })
})

test('refuses a page proposal for the Look panel', async () => {
  const r = await guardTool('mcp__writeros-morgan__propose_page_change', { surface: 'lookbook' }, ctx())
  expect(r.allow === false && r.reason).toMatch(/Look/)
})

test('a command or a linked search root that reaches a casting folder is refused', async () => {
  expect((await guardTool('Bash', { command: 'ls ~/x/canon/visual/casting-inspiration' }, ctx())).allow).toBe(false)
  expect((await guardTool('Grep', { path: '/a/refs', pattern: 'x' }, ctx({ '/a/refs': '/a/canon/visual/casting-inspiration' }))).allow).toBe(false)
})

test('everything else passes to Claude Code\'s permissions', async () => {
  for (const tool of ['Bash', 'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'WebFetch', 'Agent']) {
    expect(await guardTool(tool, { path: '/a' }, ctx())).toEqual({ allow: true })
  }
})
```

```ts
// mod/writeros-morgan/hooks/guard.ts
// Second line of defence behind the session settings, for three rules that must hold even if the settings are wrong.
// Each refusal says what it protects. Everything else is left to Claude Code's permissions and Ben's approval cards.

const CASTING = /(^|\/)casting-inspiration(\/|$)/i
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
export const PROPOSE_TOOL = 'mcp__writeros-morgan__propose_page_change'
const PROPOSABLE = new Set(['synopsis', 'outline', 'treatment', 'storyBible', 'script'])

export interface GuardContext {
  packagePath: string                          // this session's WriterOS package (from WRITEROS_MORGAN_PACKAGE)
  resolve(p: string): Promise<string | null>   // symlinks followed; null if it cannot be resolved
}
export type GuardResult = { allow: true } | { allow: false; reason: string }

export const CASTING_REASON = 'That is a casting-inspiration folder: photos of real people, for the writer\'s eyes only. Morgan does not open them.'
const PACKAGE_REASON = 'That file belongs to an open WriterOS page. Use propose_page_change so the writer sees the change on the page and keeps or dismisses it.'
const LOOK_REASON = 'Look panel fields are the writer\'s to fill. Morgan can explain them but not propose values.'
const UNKNOWN_FILE = 'Morgan could not check this file, so it was not opened.'

const inside = (p: string, dir: string) => p === dir || p.startsWith(dir.endsWith('/') ? dir : dir + '/')

export async function castingPath(p: unknown, resolve: GuardContext['resolve']): Promise<string | null> {
  if (typeof p !== 'string' || p.length === 0) return null
  if (CASTING.test(p)) return CASTING_REASON
  const resolved = await resolve(p)
  if (resolved === null) return UNKNOWN_FILE
  return CASTING.test(resolved) ? CASTING_REASON : null
}

export async function guardTool(tool: string, args: Record<string, unknown>, ctx: GuardContext): Promise<GuardResult> {
  if (tool === 'Read') {
    if (typeof args.file_path !== 'string') return { allow: false, reason: UNKNOWN_FILE }
    const reason = await castingPath(args.file_path, ctx.resolve)
    return reason ? { allow: false, reason } : { allow: true }
  }
  if (tool === 'Grep' || tool === 'Glob') {
    for (const field of [args.path, args.pattern, args.glob]) {
      if (typeof field === 'string' && CASTING.test(field)) return { allow: false, reason: CASTING_REASON }
    }
    if (typeof args.path === 'string') {
      const resolved = await ctx.resolve(args.path)
      if (resolved && CASTING.test(resolved)) return { allow: false, reason: CASTING_REASON } // a linked search root
    }
    return { allow: true } // casting folders hold images, not text; the settings deny keeps their files out of Grep results too
  }
  if (tool === 'Bash') {
    // Bash cannot hand an image to the model as a picture, but a command naming the folder is refused outright.
    return typeof args.command === 'string' && CASTING.test(args.command) ? { allow: false, reason: CASTING_REASON } : { allow: true }
  }
  if (WRITE_TOOLS.has(tool)) {
    const p = args.file_path ?? args.notebook_path
    if (typeof p !== 'string') return { allow: false, reason: UNKNOWN_FILE }
    const resolved = (await ctx.resolve(p)) ?? p // a new file does not resolve yet; check the path as given
    const pageDirs = ['documents', 'script'].map(d => `${ctx.packagePath}/${d}`)
    if (pageDirs.some(d => inside(p, d) || inside(resolved, d))) return { allow: false, reason: PACKAGE_REASON }
    return { allow: true }
  }
  if (tool === PROPOSE_TOOL) return PROPOSABLE.has(String(args.surface)) ? { allow: true } : { allow: false, reason: LOOK_REASON }
  return { allow: true }
}
```

`WRITEROS_MORGAN_PACKAGE` (the package path) is added to the child environment in Task 2's `buildMorganLaunch` `extra` env (add it there and to that test's expected env). For a new file, `resolve` returns null; a write to a new file outside the package is allowed through to Claude Code's approval card. Shell commands run in Claude Code's sandbox (Task 2 `SANDBOX_SETTINGS`), which applies the same Read and Edit deny rules to the command and everything it starts, so a command cannot copy a casting image somewhere readable or write a page file, whatever its text says. Running a command outside the sandbox always needs Ben's yes on a card. Subagents (`Agent`) run under the same session, settings and mod, so the same rules apply to them; Task 0 Step 5 includes a subagent read attempt to confirm.

Wire it into `register.ts`, fail-closed, as in Story-drive's pattern (one literal `on('event')` per event; helpers taking `$` are top-level functions):

```ts
async function guardContext($: any): Promise<GuardContext> {
  return {
    packagePath: String((await $.env.get('WRITEROS_MORGAN_PACKAGE')) ?? ''),
    resolve: async (p: string) => {
      const info = await $.fs.stat(p, { resolve: true })
      return info?.realPath ?? null // 2.1.292: resolved path is `realPath`
    },
  }
}
```

First statement of the existing `on('tool.call', …)` handler: `const verdict = await guardTool(String(e.tool), e as Record<string, unknown>, await guardContext($)); if (!verdict.allow) return { deny: verdict.reason }`. Replace its trailing `.catch(($, e, next) => next(e))` with `.catch(() => ({ deny: 'Morgan\'s safety check failed, so this step was stopped.' }))`. Add a `prompt.mention` handler that denies casting paths (`castingPath(e.path, …)`), with the same fail-closed catch. If `WRITEROS_MORGAN_PACKAGE` is empty, the guard denies every write (fail closed).

- [ ] **Step 4: Approval cards — tests, then code.** Story-drive's `classic.PermissionRequest` handler reports `waiting-for-input` and calls `next(e)`, leaving Claude Code's terminal dialog up (D8 in its spec). Morgan's handler instead asks WriterOS and answers the request itself, so no dialog ever appears.

```ts
// mod/writeros-morgan/tests/permission.test.ts
import { test, expect } from 'claude-code/testing'
import { describePermission, toDecision } from '../hooks/permission'

test('summaries show the real action, not only the model\'s description of it', () => {
  expect(describePermission('Edit', { file_path: '/icloud/P/wayfinder/resolved/28.md' })).toBe('Edit 28.md (/icloud/P/wayfinder/resolved/28.md)')
  expect(describePermission('Write', { file_path: '/a/new.md' })).toBe('Create or overwrite new.md (/a/new.md)')
  expect(describePermission('Bash', { command: 'npm run memory -- import --apply', description: 'Import beat sheet to canon' }))
    .toBe('Run: npm run memory -- import --apply — "Import beat sheet to canon"')
  expect(describePermission('WebFetch', { url: 'https://example.com/x' })).toBe('Open a web page: https://example.com/x')
  expect(describePermission('Other', {})).toBe('Use Other')
})

test('answers map to Claude Code decisions', () => {
  expect(toDecision({ allow: true })).toEqual(ALLOW_SHAPE)
  expect(toDecision({ allow: false, note: 'not that file' })).toEqual(DENY_SHAPE('The writer said no: not that file'))
  expect(toDecision(null)).toEqual(DENY_SHAPE('WriterOS could not show the approval card, so nothing was changed.'))
})
```

`ALLOW_SHAPE` / `DENY_SHAPE(message)` are the exact objects recorded in Task 0 Step 4; define them at the top of the test from that record.

```ts
// mod/writeros-morgan/hooks/permission.ts — pure helpers, no `$`
import type { PermissionAnswer } from './protocol'

const base = (p: unknown) => (typeof p === 'string' ? p.split('/').pop() || p : '?')

export function describePermission(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Edit' || tool === 'MultiEdit') return `Edit ${base(input.file_path)} (${input.file_path})`
  if (tool === 'Write') return `Create or overwrite ${base(input.file_path)} (${input.file_path})`
  if (tool === 'Bash') {
    const why = typeof input.description === 'string' && input.description ? ` — "${input.description}"` : ''
    return `Run: ${String(input.command)}${why}` // the card shows the whole command; the description is Morgan's words, shown second
  }
  if (tool === 'WebFetch') return `Open a web page: ${input.url}`
  return `Use ${tool}`
}

// The mod bridge in 2.1.292 reads a top-level `decision` (the `hookSpecificOutput` wrapper is for external
// command hooks only). Task 0 Step 4 confirms this through the real bridge; adjust here only.
export function toDecision(answer: PermissionAnswer | null) {
  if (answer?.allow) return { decision: { behavior: 'allow' as const } }
  const message = answer ? `The writer said no${answer.note ? `: ${answer.note}` : '.'}` : 'WriterOS could not show the approval card, so nothing was changed.'
  return { decision: { behavior: 'deny' as const, message } }
}
```

In `register.ts`, replace the body of the existing `on('classic.PermissionRequest', …)` handler:

```ts
on('classic.PermissionRequest', async ($, e) => {
  const requestId = newRequestId()                       // existing helper in register.ts that waits.ts uses, or crypto.randomUUID via $
  const input = (e as any).tool_input ?? {}
  const full = JSON.stringify(input)
  if (full.length > 64 * 1024) return toDecision({ allow: false, note: 'this change is too large to show on one approval card; split it into smaller steps' })
  const ask = { epoch: currentEpochId(), requestId, tool: String((e as any).tool_name), summary: describePermission(String((e as any).tool_name), input), input: full }
  report({ kind: 'waiting-for-input', requestId, reason: 'permission', detail: ask.summary }) // keeps the live screen's turn state right
  let answer: PermissionAnswer | null = null
  try { answer = await callLong($, '/permission', ask) } catch { answer = null }
  report({ kind: 'input-done', requestId })
  return toDecision(answer)
}).catch(() => toDecision(null))
```

`callLong` is `call` without a client-side timeout (the server holds the request until Ben answers; Story-drive's `/inbox` long-poll shows the transport handles held requests). Use the field names the installed `classic.PermissionRequest` event actually carries (Task 0 Step 4); Story-drive notes it has no `tool_use_id`, so the request id is generated here. `AskUserQuestion` is denied in settings, so its dialog never appears; `classic.Elicitation` stays as ported (reports `waiting-for-input`; the page shows the stuck state from Task 7).

Add an engine-dispatch test in `tests/hooks.test.ts` (Story-drive's `register.test.ts` style: `test(async ($, on) => …)`, `mock.clock(on)`, `wire(on, …)` stubbing `http.fetch`): a `classic.PermissionRequest` whose `/permission` reply is `{ allow: false, note: 'no' }` returns the deny decision; `{ allow: true }` returns allow; an `http.fetch` failure returns the could-not-show deny.

- [ ] **Step 5: Page proposals — tests, then code.** A mod tool, registered like Story-drive's `mark` (spike result c: a mod tool runs without a permission prompt; `isDeferred: false` so Morgan sees it without searching). Calling it shows the change in the page and returns Ben's decision to Morgan.

```ts
// mod/writeros-morgan/tests/proposeTool.test.ts
import { test, expect } from 'claude-code/testing'
import { outcomeText, PROPOSE_INPUT_SCHEMA } from '../hooks/proposeTool'

test('schema names exactly the five pages', () => {
  expect(PROPOSE_INPUT_SCHEMA.properties.surface.enum).toEqual(['synopsis', 'outline', 'treatment', 'storyBible', 'script'])
})

test('outcomes read plainly to Morgan', () => {
  expect(outcomeText({ outcome: 'kept' })).toBe('The writer kept the change. It is on the page now.')
  expect(outcomeText({ outcome: 'dismissed', note: 'too long' })).toBe('The writer dismissed the change: too long')
  expect(outcomeText({ outcome: 'stale' })).toMatch(/changed since you read it/)
  expect(outcomeText({ outcome: 'invalid', message: 'blocks[2].type: unknown element' })).toMatch(/could not use it: blocks\[2\]/)
  expect(outcomeText({ outcome: 'session-ended' })).toMatch(/session ended/)
})
```

```ts
// mod/writeros-morgan/hooks/proposeTool.ts — pure helpers, no `$`
import type { ProposalOutcome } from './protocol'

export const PROPOSE_TOOL_NAME = 'propose_page_change'
export const PROPOSE_DESCRIPTION = [
  'Show the writer a change to a WriterOS page; they keep or dismiss it on the page. Returns their decision.',
  'synopsis / outline / treatment / storyBible: read documents/<surface>.json in the WriterOS package first; send the whole new `content` (same shape) and the `revision` you read as `baseRevision`.',
  'script: read script/script.writeros.html first. Send `blocks` (each {type, text}; types: scene-heading, action, character, dialogue, parenthetical, transition) and a `target`: replace-scene or insert-after-scene with the exact `sceneHeading` and `expectedScene` (every paragraph of that scene as you read it, heading first, each {type, text} from its data-element-type and text), or append with `expectedEnding` (the last scene the same way).',
  'Always include a one-line `summary` of what changes and why.',
].join(' ')
export const PROPOSE_INPUT_SCHEMA = {
  type: 'object',
  required: ['surface', 'summary'],
  properties: {
    surface: { type: 'string', enum: ['synopsis', 'outline', 'treatment', 'storyBible', 'script'] },
    summary: { type: 'string', maxLength: 500 },
    baseRevision: { type: 'integer', minimum: 0 },
    content: { type: 'object' },
    target: { type: 'object' },
    blocks: { type: 'array', maxItems: 2000, items: { type: 'object', required: ['type', 'text'] } },
  },
} as const

export function outcomeText(o: ProposalOutcome): string {
  switch (o.outcome) {
    case 'kept': return 'The writer kept the change. It is on the page now.'
    case 'dismissed': return `The writer dismissed the change${o.note ? `: ${o.note}` : '.'}`
    case 'stale': return 'The page changed since you read it, so the change was not applied. Read it again and redo the change.'
    case 'invalid': return `WriterOS could not use it: ${o.message ?? 'the change did not match the page format.'}`
    case 'session-ended': return 'The session ended before the writer decided.'
  }
}
```

In `register.ts`: in `session.start`, `await $.tool.register({ name: PROPOSE_TOOL_NAME, description: PROPOSE_DESCRIPTION, inputSchema: PROPOSE_INPUT_SCHEMA })` in its own try/catch (as `registerMark` did); add `on('tool.describe', { tool: PROPOSE_TOOL }, async () => ({ description: PROPOSE_DESCRIPTION, isDeferred: false }))`; in `tool.call`, after the guard, answer it without calling `next`:

```ts
if (e.tool === PROPOSE_TOOL) {
  const { tool, tool_use_id, ...proposal } = e as any
  try {
    const outcome = await callLong($, '/proposal', { epoch: currentEpochId(), proposalId: String(tool_use_id), proposal })
    return { result: outcomeText(outcome), isError: outcome.outcome === 'invalid' }
  } catch {
    return { result: 'WriterOS could not show the change.', isError: true }
  }
}
```

Engine-dispatch tests in `tests/hooks.test.ts`: a proposal reaches `/proposal` with the tool's fields and returns the outcome text; an `http.fetch` failure returns the could-not-show error; a `lookbook` proposal is denied by the guard before `/proposal` is called.

- [ ] **Step 6: Shared types for server and client.**

```ts
// shared/morganLive.ts
export type {
  Hello, ReportBatch, LiveEvent, Stamped, InboxAction, InboxAck, Ping,
  PermissionAsk, PermissionAnswer, PageProposal, ProposalAsk, ProposalOutcome, ScriptBlock, ScriptTarget, ScriptElement,
} from '../mod/writeros-morgan/hooks/protocol'
import type { Hello, Stamped, PageProposal, ProposalOutcome } from '../mod/writeros-morgan/hooks/protocol'

export type ComposerUpdate = { id: string; text: string; outcome: 'sent' | 'not-sent' | 'uncertain'; reason?: string }
export interface ApprovalCard { requestId: string; tool: string; summary: string; input: string }

/** What the server streams to the browser. */
export type MorganScreenEvent =
  | { type: 'hello'; hello: Hello }
  | { type: 'events'; epoch: string; events: Stamped[] }
  | { type: 'lost'; epoch: string | null; reason: 'no-hello' | 'silence' | 'stalled' | 'rejected-batch' | 'channel-error' | 'queue-overflow' }
  | { type: 'recovered'; epoch: string }
  | { type: 'composer'; update: ComposerUpdate }
  | { type: 'approval'; card: ApprovalCard }
  | { type: 'approval-answered'; requestId: string; allow: boolean }
  | { type: 'proposal'; proposalId: string; proposal: PageProposal }
  | { type: 'proposal-answered'; proposalId: string; outcome: ProposalOutcome['outcome'] }
  | { type: 'truncated' }
  | { type: 'resumed'; ok: boolean; message?: string }
  | { type: 'ended'; reason: 'exited' | 'stopped' | 'server-shutdown' | 'start-failed'; code: number | null; message?: string }
```

- [ ] **Step 7: Validate and test the mod.**

Run: `npm run test:mod`
Expected: validate passes; all mod tests PASS.

- [ ] **Step 8: Commit.**

```bash
git add mod/writeros-morgan shared/morganLive.ts
git commit -m "feat(morgan): WriterOS mod with approval cards, page proposals and a casting guard"
```

---

### Task 4: Live channel on the server **[carried over; `/permission` and `/proposal` new in rev 6]**

**Files:**
- Create: `server/morganHost/liveChannel.ts` (port of Story-drive `src/main/live.ts`, 305 lines)
- Create: `tests/helpers/morganProtocol.ts`
- Test: `tests/server/morganHost/liveChannel.test.ts` (port of Story-drive `test/live.server.test.ts`, 48 cases)

**Interfaces:**
- Consumes: protocol types and `ComposerUpdate` from `shared/morganLive.ts`.
- Produces: `class LiveChannel` with `static create(o: LiveChannelOptions)`, `socketPath`, `token`, `submit(text)`, `stop(turnId)`, `ptyExited()`, `close(): Promise<void>` — Story-drive's signatures, plus two options: `onPermission(ask: PermissionAsk): Promise<PermissionAnswer>` served on `POST /permission`, and `onProposal(ask: ProposalAsk): Promise<ProposalOutcome>` served on `POST /proposal`; `LiveSink`; `LostReason`; `checkSocketPath`; `sweepStaleSockets(runDir)`. Typed fixture builders `row(seq, text, overrides?)`, `waiting(seq, requestId, reason, detail)`, `hello(overrides?)`, `ping(epoch, enqueuedThrough)` in `tests/helpers/morganProtocol.ts`, typed against `shared/morganLive.ts` so a protocol mismatch fails `npm run check`.

- [ ] **Step 1: Copy the file and tests.**

```bash
cp ~/Projects/story-drive/src/main/live.ts server/morganHost/liveChannel.ts
cp ~/Projects/story-drive/test/live.server.test.ts tests/server/morganHost/liveChannel.test.ts
```

Edit both:
- Protocol imports → `../../shared/morganLive` (server) and `../../../shared/morganLive` (test); test import of the channel → `../../../server/morganHost/liveChannel`.
- `ComposerUpdate` comes from `shared/morganLive.ts` (re-export it); the token header comes from `TOKEN_HEADER` in the mod's protocol, never a string literal.
- Delete `modDir`. Socket file prefix `live-` → `morgan-`.
- `sweepStaleSockets(runDir)` deletes only `morgan-*.sock` files in `runDir` that refuse a connection (stale); a live socket is left alone even if old. Add a test: a listening socket in the run dir survives a sweep; a dead one is removed.
- Remove the `mark` cases.
- Add `/permission` and `/proposal`: same token and epoch checks as `/report`; body validated against `PermissionAsk` / `ProposalAsk` (bad body → 400); the server holds the request open until the option's promise settles (no server timeout: an approval waits for Ben), then replies `200` with the answer. These held requests are exempt from the stall/silence clocks (the mod keeps pinging while it waits). `close()` answers every held `/permission` with `{ allow: false, note: 'the session ended' }` and every held `/proposal` with `{ outcome: 'session-ended' }` before the socket closes. If the mod's held request disconnects first (its turn was cancelled), the channel calls an `onAbandon(kind, id)` option so the session removes that card or proposal from the page (`MorganSessions` answers it with deny/dismissed and emits the `-answered` event). Tests: wrong token → 401; bad body → 400; a held request is answered when the promise resolves; a held request whose client disconnects triggers `onAbandon`; `close()` while held answers it and resolves; a request held for 30 s does not trip the stall clock.

- [ ] **Step 2: Node environment for real sockets.** First line of the test file:

```ts
// @vitest-environment node
```

- [ ] **Step 3: Write the fixture builders.** Copy the event shapes from `mod/writeros-morgan/hooks/protocol.ts` (a `row` event carries `uuid`, `door`, `type`, `origin` as an object, and `blocks`; `waiting-for-input` carries `requestId`, `reason`, `detail`; `Ping` carries `enqueuedThrough`). Each builder's return type is the protocol type, not a hand-written object.

- [ ] **Step 4: Run the ported tests.**

Run: `npx vitest run tests/server/morganHost/liveChannel.test.ts && npm run check`
Expected: PASS (Story-drive's case count minus `mark` cases, plus the sweep, `/permission` and `/proposal` cases).

- [ ] **Step 5: Commit.**

```bash
git add server/morganHost/liveChannel.ts tests/helpers/morganProtocol.ts tests/server/morganHost/liveChannel.test.ts
git commit -m "feat(morgan): token-checked Unix-socket channel for the Morgan mod"
```

---

### Task 5: Process adapter, marker sweep and session manager **[process adapter carried over; sweep, cards, proposals, resume new in rev 6]**

**Files:**
- Create: `server/morganHost/ptyProcess.ts`, `server/morganHost/markerSweep.ts`, `server/morganHost/sessionStore.ts`, `server/morganHost/morganSession.ts`
- Create: `tests/fakes/fake-claude-morgan.mjs`
- Test: `tests/server/morganHost/ptyProcess.test.ts`, `tests/server/morganHost/markerSweep.test.ts`, `tests/server/morganHost/morganSession.test.ts`

**Interfaces:**
- Consumes: `LiveChannel` with `onPermission` / `onProposal`, `close(): Promise<void>`, `ptyExited()` (Task 4); `MorganScreenEvent`, `PermissionAnswer`, `ProposalOutcome`, `PageProposal`, `ApprovalCard` (Task 3); `MorganLaunch`, `MorganProjectPaths` (Task 2).
- Produces:

```ts
// ptyProcess.ts
export interface ChildProcessLike {
  pid: number                                     // also the process-group id (node-pty starts a new session)
  onExit(cb: (code: number | null) => void): void
  terminate(graceMs?: number): Promise<boolean>   // SIGTERM to the group; SIGKILL after graceMs (default 3000) even if the leader
                                                  // already exited; true when the group is gone, false if it survives (ownership kept)
}
export type SpawnChild = (file: string, args: string[], opts: { cwd: string; env: Record<string, string> }) => ChildProcessLike
export const spawnWithPty: SpawnChild
export function groupAlive(pgid: number): boolean

// markerSweep.ts
export interface ProcInfo { pid: number; ppid: number; pgid: number }
export function findMarked(marker: string, since?: number): Promise<ProcInfo[]> // environment marker only, current user only, started after `since`
export function descendantsOf(pid: number): Promise<ProcInfo[]>              // by parent links, snapshot
export function stopProcesses(list: ProcInfo[], graceMs?: number): Promise<number[]>  // survivors; groups only via verified leaders
export function stopMarked(marker: string, graceMs?: number, since?: number): Promise<number[]>

// sessionStore.ts
export interface SessionStore { get(projectId: string): Promise<string | null>; set(projectId: string, sessionId: string): Promise<void>; clear(projectId: string): Promise<void> }
export function fileSessionStore(dir: string): SessionStore   // <dir>/sessions.json, written atomically, mode 0600

// morganSession.ts
export interface MorganSessionDeps { /* see Step 7 */ }
export class MorganSessions {
  constructor(deps: MorganSessionDeps)
  start(projectId: string, opts?: { fresh?: boolean }): Promise<{ sessionId: string; existing: boolean }> // resumes the remembered conversation unless fresh
  subscribe(projectId: string, listener: (e: MorganScreenEvent) => void): () => void                      // replays history, then open cards and proposals
  canStream(projectId: string): boolean
  submit(projectId: string, text: string): string
  answerApproval(projectId: string, requestId: string, answer: PermissionAnswer): boolean                 // false if not open
  answerProposal(projectId: string, proposalId: string, outcome: ProposalOutcome): boolean                 // false if not open
  stop(projectId: string, turnId: string): void
  end(projectId: string): Promise<void>
  shutdown(): Promise<void>
  has(projectId: string): boolean
}
```

- [ ] **Step 1: Write the failing process-adapter tests.** Real children: one where the leader exits on SIGTERM but its child ignores it (the case Codex reproduced), one where everything ignores SIGTERM.

```ts
// tests/server/morganHost/ptyProcess.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { groupAlive, spawnWithPty } from '../../../server/morganHost/ptyProcess'

const env = { PATH: '/usr/bin:/bin' }
const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('spawnWithPty', () => {
  it('reports the exit code', async () => {
    const child = spawnWithPty('/bin/sh', ['-c', 'exit 3'], { cwd: '/', env })
    expect(await new Promise<number | null>(r => child.onExit(r))).toBe(3)
  })

  it('kills a descendant that ignores SIGTERM after the leader has already exited', async () => {
    const child = spawnWithPty('/bin/sh', ['-c', '(trap "" TERM; exec sleep 60) & trap "exit 0" TERM; wait'], { cwd: '/', env })
    await settle(300)
    expect(await child.terminate(200)).toBe(true)
    expect(groupAlive(child.pid)).toBe(false)
  })

  it('kills a whole group that ignores SIGTERM', async () => {
    const child = spawnWithPty('/bin/sh', ['-c', 'trap "" TERM; sleep 60 & wait'], { cwd: '/', env })
    await settle(300)
    expect(await child.terminate(200)).toBe(true)
    expect(groupAlive(child.pid)).toBe(false)
  })

  it('terminate() after a natural exit still clears leftover descendants', async () => {
    const child = spawnWithPty('/bin/sh', ['-c', '(trap "" TERM; exec sleep 60) & exit 0'], { cwd: '/', env })
    await new Promise(r => child.onExit(r))
    expect(await child.terminate(200)).toBe(true)
    expect(groupAlive(child.pid)).toBe(false)
  })
})
```

Run: `npx vitest run tests/server/morganHost/ptyProcess.test.ts`
Expected: FAIL, cannot resolve `ptyProcess`.

- [ ] **Step 2: Implement the adapter.**

```ts
// server/morganHost/ptyProcess.ts
// node-pty starts the child as the leader of a new session, so its pid is also its process-group id
// and signalling -pid reaches every descendant, even after the leader itself has exited.
import pty from 'node-pty' // use the import form recorded in Task 0 Step 10

export interface ChildProcessLike {
  pid: number
  onExit(cb: (code: number | null) => void): void
  terminate(graceMs?: number): Promise<boolean>
}
export type SpawnChild = (file: string, args: string[], opts: { cwd: string; env: Record<string, string> }) => ChildProcessLike

export function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

function signalGroup(pgid: number, sig: NodeJS.Signals): void {
  try { process.kill(-pgid, sig) } catch { /* group gone */ }
}

const GIVE_UP_AFTER_KILL_MS = 2000

export const spawnWithPty: SpawnChild = (file, args, opts) => {
  const p = pty.spawn(file, args, { name: 'xterm-256color', cols: 120, rows: 36, cwd: opts.cwd, env: opts.env })
  let exited = false
  const exitCallbacks: ((code: number | null) => void)[] = []
  p.onData(() => {}) // Stage 1 has no raw view; output is drained so the child never blocks on a full buffer.
  p.onExit(({ exitCode }) => {
    exited = true
    for (const cb of exitCallbacks) cb(exitCode ?? null)
  })
  let terminating: Promise<boolean> | null = null
  return {
    pid: p.pid,
    onExit: cb => { exitCallbacks.push(cb) },
    terminate: (graceMs = 3000) => {
      terminating ??= new Promise<boolean>(resolve => {
        const started = Date.now()
        let killed = false
        signalGroup(p.pid, 'SIGTERM')
        const tick = () => {
          if (exited && !groupAlive(p.pid)) return resolve(true)
          const elapsed = Date.now() - started
          if (!killed && elapsed >= graceMs) { killed = true; signalGroup(p.pid, 'SIGKILL') }
          if (killed && elapsed >= graceMs + GIVE_UP_AFTER_KILL_MS) {
            terminating = null // a later call may try again
            return resolve(!groupAlive(p.pid))
          }
          setTimeout(tick, 50)
        }
        tick()
      })
      return terminating
    },
  }
}
```

Run: `npx vitest run tests/server/morganHost/ptyProcess.test.ts`
Expected: PASS.


- [ ] **Step 3: Marker sweep — test, then code [new in rev 6].** Claude Code runs Bash tools in their own process groups, so stopping Morgan's group does not reach them (Task 0 Step 6). Every process Morgan starts inherits `WRITEROS_MORGAN_SESSION=<port>:<sessionId>`; the sweep finds those by environment and stops them.

```ts
// tests/server/morganHost/markerSweep.test.ts
// @vitest-environment node
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { descendantsOf, findMarked, stopMarked, stopProcesses } from '../../../server/morganHost/markerSweep'
import { groupAlive } from '../../../server/morganHost/ptyProcess'

const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const startMarked = (marker: string, ignoreTerm = false) => {
  const c = spawn('/bin/sh', ['-c', ignoreTerm ? 'trap "" TERM; exec sleep 60' : 'exec sleep 60'], {
    detached: true, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', WRITEROS_MORGAN_SESSION: marker },
  })
  c.unref()
  return c.pid!
}
const settle = () => new Promise(r => setTimeout(r, 200))

describe('marker sweep', () => {
  it('finds processes by their environment marker only', async () => {
    const a = startMarked('9999:aaaa')
    // Marker text in the ARGUMENTS of an unmarked process must not match (Codex reproduced this false positive).
    // `sleep 60; :` keeps the shell (and its $0 argument holding the marker text) alive.
    const decoy = spawn('/bin/sh', ['-c', 'sleep 60; :', 'WRITEROS_MORGAN_SESSION=9999:aaaa'], { detached: true, stdio: 'ignore', env: { PATH: '/usr/bin:/bin' } })
    decoy.unref()
    await settle()
    expect((await findMarked('9999:aaaa')).map(x => x.pid)).toEqual([a])
    await stopMarked('9999:aaaa', 200)
    expect(alive(decoy.pid!)).toBe(true)
    process.kill(decoy.pid!, 'SIGKILL')
  })

  it('stops a detached process that ignores SIGTERM', async () => {
    const pid = startMarked('9998:bbbb', true)
    await settle()
    expect(await stopMarked('9998:bbbb', 200)).toEqual([])
    expect(alive(pid)).toBe(false)
  })

  it('never signals a group whose leader is not itself verified', async () => {
    // A marked child in an unmarked group whose leader keeps running on its own (foreground sleep).
    const leader = spawn('/bin/sh', ['-c', 'WRITEROS_MORGAN_SESSION=9996:cccc sleep 60 & sleep 60'], { detached: true, stdio: 'ignore', env: { PATH: '/usr/bin:/bin' } })
    leader.unref()
    try {
      await settle()
      await stopMarked('9996:cccc', 200)
      expect(alive(leader.pid!)).toBe(true)
    } finally {
      try { process.kill(-leader.pid!, 'SIGKILL') } catch { /* gone */ }
    }
  })

  it('ignores marked processes that started before the session did', async () => {
    const old = startMarked('9995:dddd')
    await settle()
    expect(await findMarked('9995:dddd', Date.now() + 5000)).toEqual([]) // 'since' 5 s in the future: the process is older
    await stopMarked('9995:dddd', 200)
    expect(alive(old)).toBe(false)
  })

  it('finds descendants by parent, even ones that dropped the marker', async () => {
    const parent = spawn('/bin/sh', ['-c', 'env -i /bin/sleep 60 & wait'], { detached: true, stdio: 'ignore' })
    parent.unref()
    await settle()
    const kids = await descendantsOf(parent.pid!)
    expect(kids.length).toBeGreaterThan(0)
    await stopProcesses(kids, 200)
    for (const k of kids) expect(alive(k.pid)).toBe(false)
    process.kill(-parent.pid!, 'SIGKILL')
  })
})
```

```ts
// server/morganHost/markerSweep.ts
// Finds and stops processes that belong to a Morgan session, by two independent signs:
//  - its exact environment marker WRITEROS_MORGAN_SESSION=<port>:<random id> (found in the environment part of
//    `ps -E` output only, never in the arguments), and
//  - being a descendant of the session's Claude Code process (snapshotted before it is stopped).
// Only the current user's processes are considered. A process group is signalled only when its leader is itself verified.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
export interface ProcInfo { pid: number; ppid: number; pgid: number }
const uid = String(process.getuid?.() ?? '')
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' } }

async function table(): Promise<(ProcInfo & { startedAt: number })[]> {
  // etime = elapsed seconds since start ([[dd-]hh:]mm:ss); startedAt is derived from it.
  const { stdout } = await run('ps', ['-U', uid, '-o', 'pid=,ppid=,pgid=,etime='], { maxBuffer: 16 * 1024 * 1024 })
  const now = Date.now()
  const secs = (t: string) => { const [d, rest] = t.includes('-') ? t.split('-') : ['0', t]; return rest.split(':').map(Number).reverse().reduce((acc, v, i) => acc + v * [1, 60, 3600][i], 0) + Number(d) * 86400 }
  return stdout.split('\n').map(l => l.trim().split(/\s+/)).filter(r => r.length === 4)
    .map(([pid, ppid, pgid, et]) => ({ pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), startedAt: now - secs(et) * 1000 }))
    .filter(r => Number.isFinite(r.pid))
}

// Environment part = `ps -E` command line minus the plain argument line for the same pid.
async function envOf(pid: number): Promise<string | null> {
  try {
    const [withEnv, argsOnly] = await Promise.all([
      run('ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)]),
      run('ps', ['-ww', '-o', 'command=', '-p', String(pid)]),
    ])
    const full = withEnv.stdout.trimEnd(); const args = argsOnly.stdout.trimEnd()
    return full.startsWith(args) ? full.slice(args.length) : null
  } catch { return null }
}

async function hasMarker(pid: number, marker: string): Promise<boolean> {
  const env = await envOf(pid)
  return env !== null && (` ${env} `).includes(` WRITEROS_MORGAN_SESSION=${marker} `)
}

// `since`: ignore processes that started before the session (ms epoch, minus 2 s for clock rounding). The marker value
// is a random 128-bit id known only to WriterOS and the session's own processes, so a text match elsewhere in an
// environment can only come from a process Morgan herself started.
export async function findMarked(marker: string, since = 0): Promise<ProcInfo[]> {
  const procs = (await table()).filter(p => p.pid !== process.pid && p.startedAt >= since - 2000)
  const out: ProcInfo[] = []
  for (const p of procs) if (await hasMarker(p.pid, marker)) out.push(p)
  return out
}

export async function descendantsOf(rootPid: number): Promise<ProcInfo[]> {
  const procs = await table()
  const out: ProcInfo[] = []
  const frontier = [rootPid]
  while (frontier.length) {
    const parent = frontier.pop()!
    for (const p of procs) if (p.ppid === parent && !out.some(o => o.pid === p.pid)) { out.push(p); frontier.push(p.pid) }
  }
  return out
}

/** Stops exactly these processes (and a group only when its leader is in the list). Returns survivors. */
export async function stopProcesses(list: ProcInfo[], graceMs = 1000): Promise<number[]> {
  const pids = new Set(list.map(p => p.pid))
  const signal = (sig: NodeJS.Signals) => {
    for (const p of list) {
      if (p.pgid === p.pid) { try { process.kill(-p.pgid, sig) } catch { /* gone */ } } // verified leader: whole group
      try { process.kill(p.pid, sig) } catch { /* gone */ }
    }
  }
  signal('SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && [...pids].some(alive)) await pause(50)
  if ([...pids].some(alive)) { signal('SIGKILL'); await pause(150) }
  return [...pids].filter(alive)
}

export async function stopMarked(marker: string, graceMs = 1000, since = 0): Promise<number[]> {
  return stopProcesses(await findMarked(marker, since), graceMs)
}
```

Note on pid reuse: lists are taken immediately before signalling, within a few seconds of each other; a reused pid in that window would also have to be the current user's. Stated as an accepted residual risk.

Run: `npx vitest run tests/server/morganHost/markerSweep.test.ts`
Expected: PASS. (Variables in the `ps -E` environment part are space-separated; adjust `hasMarker` to the format Task 0 Step 6 recorded.)

- [ ] **Step 4: Write the fake Claude.** It plays the mod's part over the real socket and exits non-zero on any non-2xx reply.

```js
// tests/fakes/fake-claude-morgan.mjs
// Stands in for `claude`. FAKE_MODE:
//   ''        hello, one row, then serve inbox actions
//   'silent'  never says hello            'slow'   waits 500 ms before hello
//   'crash'   exits 1 after its first row 'chatty' reports FAKE_ROWS rows after hello
//   'approval' asks /permission and reports the answer as a row
//   'propose'  sends /proposal and reports the outcome as a row
//   'bash'     starts a detached marked child (like a Bash tool) and reports its pid
//   'orphan'   starts a detached child with an EMPTY environment (no marker), reports its pid, waits 3 s, exits
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const socketPath = process.env.WRITEROS_MORGAN_SOCKET
const token = process.env.WRITEROS_MORGAN_TOKEN
const header = process.env.FAKE_TOKEN_HEADER
const mode = process.env.FAKE_MODE ?? ''
const template = JSON.parse(process.env.FAKE_ROW_TEMPLATE)
const epoch = randomUUID()
let seq = -1

const post = (route, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, path: route, method: 'POST', headers: { 'content-type': 'application/json', [header]: token } }, res => {
    let data = ''
    res.on('data', c => { data += c })
    res.on('end', () => {
      if (res.statusCode >= 300) { console.error(`fake: ${route} -> ${res.statusCode} ${data}`); process.exit(9) }
      resolve(data ? JSON.parse(data) : null)
    })
  })
  req.on('error', reject)
  req.end(JSON.stringify(body))
})
const row = text => ({ ...template, kind: 'row', seq: ++seq, at: Date.now(), uuid: randomUUID(), blocks: [{ type: 'text', text }] })
const report = events => post('/report', { epoch, fromSeq: events[0].seq, events })

if (mode === 'silent') setInterval(() => {}, 1000)
else {
  if (mode === 'slow') await new Promise(r => setTimeout(r, 500))
  const idFlag = process.argv.includes('--resume') ? '--resume' : '--session-id'
  const sessionId = process.argv[process.argv.indexOf(idFlag) + 1]
  await post('/hello', { epoch, sessionId, source: 'launch', cwd: process.cwd(), claudeVersion: '2.1.292' })
  await report([row(idFlag === '--resume' ? 'Resumed.' : 'Ready.')])
  if (mode === 'crash') process.exit(1)
  setInterval(() => post('/ping', { epoch, enqueuedThrough: seq }).catch(() => {}), 1000)
  if (mode === 'chatty') for (let i = 1; i <= Number(process.env.FAKE_ROWS ?? 6); i++) await report([row(`row ${i}`)])
  if (mode === 'approval') {
    const a = await post('/permission', { epoch, requestId: 'r1', tool: 'Edit', summary: 'Edit 28.md (/x/28.md)', input: '{}' })
    await report([row(`approval: ${a.allow ? 'allow' : 'deny'}${a.note ? ` (${a.note})` : ''}`)])
  }
  if (mode === 'propose') {
    const o = await post('/proposal', { epoch, proposalId: 'p1', proposal: { surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' } })
    await report([row(`proposal: ${o.outcome}`)])
  }
  if (mode === 'orphan') {
    const c = spawn('/usr/bin/env', ['-i', '/bin/sleep', '60'], { detached: true, stdio: 'ignore' })
    c.unref()
    await report([row(`orphan ${c.pid}`)])
    await new Promise(r => setTimeout(r, 3000)) // longer than one 2-second ownership refresh
    process.exit(0)
  }
  if (mode === 'bash') {
    const c = spawn('/bin/sh', ['-c', 'trap "" TERM; exec sleep 60'], { detached: true, stdio: 'ignore' }) // inherits the marker, like a Bash tool
    c.unref()
    await report([row(`bash ${c.pid}`)])
  }
  for (;;) {
    const action = await post('/inbox', { epoch })
    if (!action || !action.id) continue
    await post('/inbox-ack', { id: action.id, epoch, status: 'submitted' })
    if (action.submit) await report([row(`Heard: ${action.submit.text ?? action.submit}`)])
  }
}
```

`FAKE_ROW_TEMPLATE` comes from `rowTemplate()` in `tests/helpers/morganProtocol.ts`. Match the `/inbox` reply and `submit` shapes to `liveChannel.ts`; the non-2xx exit catches a mismatch.

- [ ] **Step 5: Write the failing session tests.**

```ts
// tests/server/morganHost/morganSession.test.ts
// @vitest-environment node
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MorganSessions, type MorganSessionDeps } from '../../../server/morganHost/morganSession'
import { groupAlive, spawnWithPty, type SpawnChild } from '../../../server/morganHost/ptyProcess'
import type { MorganScreenEvent } from '../../../shared/morganLive'
import { TOKEN_HEADER } from '../../../mod/writeros-morgan/hooks/protocol'
import { rowTemplate } from '../../helpers/morganProtocol'

const fake = path.resolve(__dirname, '../../fakes/fake-claude-morgan.mjs')
const PORT = '9997'

function memoryStore() {
  const ids = new Map<string, string>()
  return { get: async (p: string) => ids.get(p) ?? null, set: async (p: string, id: string) => { ids.set(p, id) }, clear: async (p: string) => { ids.delete(p) }, ids }
}

function make(mode = '', extra: Partial<MorganSessionDeps> = {}, fakeEnv: Record<string, string> = {}) {
  const runDir = mkdtempSync(path.join(tmpdir(), 'm-'))
  const pids: number[] = []
  const launches: string[][] = []
  const store = memoryStore()
  const spawnChild: SpawnChild = (_file, args, opts) => {
    launches.push(args)
    const child = spawnWithPty(process.execPath, [fake, ...args], opts)
    pids.push(child.pid)
    return child
  }
  const sessions = new MorganSessions({
    spawnChild,
    claudePath: async () => 'claude',
    runDir,
    port: PORT,
    store,
    resolveProject: async id => { if (id === 'missing') throw new Error('No such project.'); return { packagePath: runDir, storyDriveRoot: null } },
    launchFor: (_p, ch, session, marker) => ({
      cwd: runDir, settings: {} as never,
      args: session.kind === 'resume' ? ['--resume', session.id] : ['--session-id', session.id],
      env: { PATH: process.env.PATH!, HOME: process.env.HOME!, WRITEROS_MORGAN_SOCKET: ch.socketPath, WRITEROS_MORGAN_TOKEN: ch.token,
             WRITEROS_MORGAN_SESSION: marker, FAKE_MODE: mode, FAKE_TOKEN_HEADER: TOKEN_HEADER, FAKE_ROW_TEMPLATE: JSON.stringify(rowTemplate()), ...fakeEnv },
    }),
    startTimeoutMs: 2000,
    ...extra,
  })
  return { sessions, pids, runDir, launches, store }
}

const until = async (events: MorganScreenEvent[], pred: (e: MorganScreenEvent) => boolean, ms = 5000) => {
  const t0 = Date.now()
  while (!events.some(pred)) {
    if (Date.now() - t0 > ms) throw new Error(`timed out; saw ${JSON.stringify(events.map(e => e.type))}`)
    await new Promise(r => setTimeout(r, 25))
  }
}
const text = (e: MorganScreenEvent) => (e.type === 'events' ? JSON.stringify(e.events) : '')
const sockets = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.sock'))

let current: MorganSessions | null = null
afterEach(async () => { await current?.shutdown(); current = null })

describe('MorganSessions', () => {
  it('starts a session and relays the first row', async () => {
    const { sessions } = make(); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('Ready.'))
  })

  it('concurrent starts spawn exactly one process', async () => {
    const { sessions, pids } = make('slow'); current = sessions
    const [a, b] = await Promise.all([sessions.start('p1'), sessions.start('p1')])
    expect(a.sessionId).toBe(b.sessionId)
    expect([a.existing, b.existing].sort()).toEqual([false, true])
    expect(pids).toHaveLength(1)
  })

  it('a late subscriber gets hello and everything so far', async () => {
    const { sessions } = make(); current = sessions
    const first: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => first.push(e))
    await until(first, e => text(e).includes('Ready.'))
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late[0].type).toBe('hello')
    expect(late.some(e => text(e).includes('Ready.'))).toBe(true)
  })

  it('submits text and relays the reply', async () => {
    const { sessions } = make(); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('Ready.'))
    sessions.submit('p1', 'Where did beat one come from?')
    await until(seen, e => text(e).includes('Heard: Where did beat one come from?'))
  })

  it('an approval card reaches the page and Ben\'s answer reaches Morgan', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    const card = seen.find(e => e.type === 'approval') as Extract<MorganScreenEvent, { type: 'approval' }>
    expect(card.card.summary).toBe('Edit 28.md (/x/28.md)')
    expect(sessions.answerApproval('p1', card.card.requestId, { allow: false, note: 'not that file' })).toBe(true)
    await until(seen, e => text(e).includes('approval: deny (not that file)'))
    expect(seen.some(e => e.type === 'approval-answered' && e.allow === false)).toBe(true)
    expect(sessions.answerApproval('p1', card.card.requestId, { allow: true })).toBe(false) // already answered
  })

  it('an unanswered card is still there for a tab that opens later', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late.some(e => e.type === 'approval')).toBe(true)
  })

  it('ending the session answers open cards with deny', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    await sessions.end('p1')
    expect(seen.some(e => e.type === 'approval-answered' && e.allow === false)).toBe(true)
    expect(seen.at(-1)?.type).toBe('ended')
  })

  it('a page proposal reaches the page and Ben\'s Keep reaches Morgan', async () => {
    const { sessions } = make('propose'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'proposal')
    const p = seen.find(e => e.type === 'proposal') as Extract<MorganScreenEvent, { type: 'proposal' }>
    expect(sessions.answerProposal('p1', p.proposalId, { outcome: 'kept' })).toBe(true)
    await until(seen, e => text(e).includes('proposal: kept'))
  })

  it('an invalid proposal is answered without reaching the page', async () => {
    const { sessions } = make('propose', { validateProposal: () => 'blocks[0].type: unknown element' }); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('proposal: invalid'))
    expect(seen.some(e => e.type === 'proposal')).toBe(false)
  })

  it('Stop answers an open card with deny', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    sessions.stop('p1', 'turn-1')
    await until(seen, e => text(e).includes('approval: deny (the writer stopped this turn)'))
  })

  it('an unmarked detached child is still stopped after its parent exits on its own', async () => {
    // FAKE_MODE 'orphan' (add to the fake): starts `env -i /bin/sleep 60` detached, reports its pid, waits 3 s, exits.
    const { sessions } = make('orphan'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => /orphan \d+/.test(text(e)))
    const pid = Number(text(seen.find(e => /orphan \d+/.test(text(e)))!).match(/orphan (\d+)/)![1])
    await until(seen, e => e.type === 'ended', 8000)
    expect(groupAlive(pid)).toBe(false)
  }, 15_000)

  it('a Bash-like detached child is stopped with the session', async () => {
    const { sessions } = make('bash'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => /bash \d+/.test(text(e)))
    const pid = Number(text(seen.find(e => /bash \d+/.test(text(e)))!).match(/bash (\d+)/)![1])
    await sessions.end('p1')
    expect(groupAlive(pid)).toBe(false)
  }, 10_000)

  it('remembers the conversation and resumes it next time', async () => {
    const { sessions, launches, store } = make(); current = sessions
    const first = await sessions.start('p1')
    const seen: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('Ready.'))
    expect(store.ids.get('p1')).toBe(first.sessionId)
    await sessions.end('p1')
    await sessions.start('p1')
    expect(launches[1]).toEqual(['--resume', first.sessionId])
  })

  it('a failed resume forgets the conversation and says so; the next Start is fresh', async () => {
    const { sessions, store, launches } = make('silent'); current = sessions
    store.ids.set('p1', 'old-id')
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'ended', 6000)
    const ended = seen.find(e => e.type === 'ended') as Extract<MorganScreenEvent, { type: 'ended' }>
    expect(ended.message).toMatch(/could not pick up/i)
    expect(store.ids.has('p1')).toBe(false)
    await sessions.start('p1')
    expect(launches[1][0]).toBe('--session-id')
  })

  it('"New conversation" starts fresh even when one is remembered', async () => {
    const { sessions, store, launches } = make(); current = sessions
    store.ids.set('p1', 'old-id')
    await sessions.start('p1', { fresh: true })
    expect(launches[0][0]).toBe('--session-id')
  })

  it('end() resolves only after the group is gone and the socket is closed; restart is a new process', async () => {
    const { sessions, pids, runDir } = make(); current = sessions
    await sessions.start('p1')
    await sessions.end('p1')
    expect(groupAlive(pids[0])).toBe(false)
    expect(sockets(runDir)).toEqual([])
    await sessions.start('p1', { fresh: true })
    expect(pids).toHaveLength(2)
  })

  it('end() during a start cancels it: no process is left', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const { sessions, pids, runDir } = make('', { resolveProject: async () => { await gate; return { packagePath: tmpdir(), storyDriveRoot: null } } })
    current = sessions
    const starting = sessions.start('p1').catch(e => e)
    const ending = sessions.end('p1')
    release()
    await ending
    expect(await starting).toBeInstanceOf(Error)
    expect(pids).toHaveLength(0)
    expect(sockets(runDir)).toEqual([])
  })

  it('a child that exits on its own: ended(exited) reaches a subscriber who connects afterwards', async () => {
    const { sessions } = make('crash'); current = sessions
    await sessions.start('p1')
    await new Promise(r => setTimeout(r, 1000))
    expect(sessions.has('p1')).toBe(false)
    expect(sessions.canStream('p1')).toBe(true)
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late.at(-1)).toMatchObject({ type: 'ended', reason: 'exited' })
  })

  it('after a natural exit, Start waits for cleanup and starts a fresh process', async () => {
    const { sessions, pids } = make('crash'); current = sessions
    const first = await sessions.start('p1')
    await new Promise(r => setTimeout(r, 300))
    const second = await sessions.start('p1')
    expect(second.existing).toBe(false)
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(pids).toHaveLength(2)
  })

  it('a child that never says hello ends as start-failed with a plain message, and is killed', async () => {
    const { sessions, pids } = make('silent'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1', { fresh: true })
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'ended' && e.reason === 'start-failed', 6000)
    const ended = seen.find(e => e.type === 'ended') as Extract<MorganScreenEvent, { type: 'ended' }>
    expect(ended.message).toMatch(/could not start/i)
    expect(groupAlive(pids[0])).toBe(false)
  })

  it('an unknown project fails without leaving a socket behind', async () => {
    const { sessions, runDir } = make(); current = sessions
    await expect(sessions.start('missing')).rejects.toThrow(/No such project/)
    expect(sockets(runDir)).toEqual([])
  })

  it('refuses to start when the session marker cannot be recorded', async () => {
    const { sessions, pids } = make('', { markers: { add: async () => { throw new Error('disk full') }, remove: async () => {} } })
    current = sessions
    await expect(sessions.start('p1')).rejects.toThrow(/disk full/)
    expect(pids).toHaveLength(0)
  })

  it('a failure after spawning stops the child and rejects without hanging', async () => {
    const { sessions, pids } = make('', { store: { get: async () => null, set: async () => { throw new Error('disk full') }, clear: async () => {} } })
    current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    // Remembering the session id fails on hello: Morgan keeps running; resume is just unavailable for this conversation.
    await until(seen, e => text(e).includes('Ready.'))
    expect(groupAlive(pids[0])).toBe(true)
  })

  it('a process that will not die marks the project stuck, and end() still returns', async () => {
    const stubborn: SpawnChild = () => ({ pid: 999999, onExit: () => {}, terminate: async () => false })
    const { sessions } = make('', { spawnChild: stubborn, startTimeoutMs: 60_000, sweep: async () => [] }) // descendantsOf(999999) is empty
    current = sessions
    await sessions.start('p1')
    await sessions.end('p1')
    await expect(sessions.start('p1')).rejects.toThrow(/did not stop/)
  })

  it('shutdown() ends running sessions at once even while another start is stuck', async () => {
    const gate = new Promise<void>(() => {})
    let entered!: () => void
    const inResolver = new Promise<void>(r => { entered = r })
    const { sessions, pids } = make('', {
      resolveProject: async id => { if (id === 'stuck') { entered(); await gate } return { packagePath: tmpdir(), storyDriveRoot: null } },
    })
    await sessions.start('p1')
    void sessions.start('stuck').catch(() => {})
    await inResolver
    const shutdown = sessions.shutdown()
    await new Promise(r => setTimeout(r, 4000))
    expect(groupAlive(pids[0])).toBe(false)
    void shutdown
  }, 10_000)

  it('shutdown() aborts a preflight in progress', async () => {
    let aborted = false
    let entered!: () => void
    const inPreflight = new Promise<void>(r => { entered = r })
    const { sessions } = make('', { claudePath: signal => new Promise((_r, reject) => {
      entered()
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
    }) })
    const starting = sessions.start('p1').catch(e => e)
    await inPreflight
    await sessions.shutdown()
    expect(aborted).toBe(true)
    expect(await starting).toBeInstanceOf(Error)
  })

  it('history keeps hello and marks truncation past the cap', async () => {
    const { sessions } = make('chatty', { maxHistory: 3 }, { FAKE_ROWS: '6' }); current = sessions
    await sessions.start('p1')
    const seen: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('row 6'))
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late[0].type).toBe('hello')
    expect(late[1].type).toBe('truncated')
    expect(late).toHaveLength(2 + 3)
  })
})
```

Open approval cards and proposals are kept outside the capped history (a separate `open` map replayed after history), so a long session never drops an unanswered card.

- [ ] **Step 6: Run to verify failure.**

Run: `npx vitest run tests/server/morganHost/morganSession.test.ts`
Expected: FAIL, cannot resolve `morganSession`.

- [ ] **Step 7: Implement.**

```ts
// server/morganHost/sessionStore.ts
// Remembers each project's Claude Code session id so Morgan can pick up the conversation next time.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface SessionStore {
  get(projectId: string): Promise<string | null>
  set(projectId: string, sessionId: string): Promise<void>
  clear(projectId: string): Promise<void>
}

export function fileSessionStore(dir: string): SessionStore {
  const file = path.join(dir, 'sessions.json')
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next } // one read-modify-write at a time
  const read = async (): Promise<Record<string, string>> => { try { return JSON.parse(await readFile(file, 'utf8')) } catch { return {} } }
  const write = async (all: Record<string, string>) => {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(all), { mode: 0o600 })
    await rename(tmp, file)
  }
  return {
    get: async id => (await read())[id] ?? null,
    set: (id, sid) => serial(async () => { const all = await read(); all[id] = sid; await write(all) }),
    clear: id => serial(async () => { const all = await read(); delete all[id]; await write(all) }),
  }
}
```

```ts
// server/morganHost/morganSession.ts
// One hosted Morgan session per project. A start is reserved synchronously (single-flight, cancellable).
// Every way a session ends goes through finish(): answer open cards and proposals, stop the process group,
// sweep marked processes (Bash tools), close the channel, emit `ended` last, always settle `done`.
import { randomUUID } from 'node:crypto'
import { LiveChannel, type LiveSink } from './liveChannel'
import type { MorganLaunch, MorganProjectPaths } from './launchArgs'
import type { ChildProcessLike, SpawnChild } from './ptyProcess'
import { descendantsOf, stopMarked, stopProcesses, type ProcInfo } from './markerSweep'
import type { SessionStore } from './sessionStore'
import type { ApprovalCard, MorganScreenEvent, PageProposal, PermissionAnswer, ProposalOutcome } from '../../shared/morganLive'

export interface MorganSessionDeps {
  spawnChild: SpawnChild
  claudePath(signal: AbortSignal): Promise<string>
  runDir: string
  port: string
  store: SessionStore
  resolveProject(projectId: string): Promise<MorganProjectPaths>
  launchFor(project: MorganProjectPaths, channel: { socketPath: string; token: string }, session: { kind: 'new' | 'resume'; id: string }, marker: string): MorganLaunch
  validateProposal?(proposal: PageProposal): string | null      // Task 6 wires proposals.ts; null = valid
  sweep?(marker: string): Promise<number[]>                     // default stopMarked; returns survivors
  markers?: { add(marker: string): Promise<void>; remove(marker: string): Promise<void> } // production: <runDir>/markers.json for the boot sweep
  ready?: Promise<void>                                         // production: the boot sweep; no start runs before it settles
  startTimeoutMs?: number
  maxHistory?: number
}

const START_FAILED = 'Morgan could not start. Claude Code may be waiting on a one-time question (for example whether to trust this folder). Open Terminal, go to the project folder, run `claude`, answer it, quit, then click Start Morgan again.'
const RESUME_FAILED = 'Morgan could not pick up the last conversation. Click Start Morgan to begin a new one.'
const STUCK = 'Morgan\'s last process did not stop. Restart WriterOS before starting Morgan again for this project.'

class Cancelled extends Error { constructor() { super('Morgan\'s start was cancelled.') } }

interface Pending { cancelled: boolean; promise: Promise<{ sessionId: string }> }
interface OpenApproval { card: ApprovalCard; resolve(a: PermissionAnswer): void }
interface OpenProposal { proposal: PageProposal; resolve(o: ProposalOutcome): void }

interface Live {
  sessionId: string
  marker: string
  resumed: boolean
  child: ChildProcessLike
  channel: LiveChannel
  hello: MorganScreenEvent | null
  history: MorganScreenEvent[]
  truncated: boolean
  approvals: Map<string, OpenApproval>
  proposals: Map<string, OpenProposal>
  listeners: Set<(e: MorganScreenEvent) => void>
  ending: 'stopped' | 'server-shutdown' | 'start-failed' | null
  finishing: Promise<void> | null
  done: Promise<void>
  markDone: () => void
  startTimer: ReturnType<typeof setTimeout> | null
  startedAt: number
  owned: Map<number, ProcInfo>                 // descendants seen while the leader was alive (refreshed every 2 s and before any stop)
  watch: ReturnType<typeof setInterval> | null
  persisting: Promise<unknown>                 // remembering the session id; awaited before `done`
}

function log(step: string, error: unknown): void { console.error(`[morgan] ${step} failed`, error) }

async function refreshOwned(s: Live): Promise<void> {
  try { for (const p of await descendantsOf(s.child.pid)) s.owned.set(p.pid, p) } catch (error) { log('list descendants', error) }
}

export class MorganSessions {
  private live = new Map<string, Live>()
  private starting = new Map<string, Pending>()
  private ending = new Map<string, Promise<void>>()
  private finished = new Map<string, MorganScreenEvent[]>()
  private stuck = new Set<string>()
  private abort = new AbortController()
  private closed = false

  constructor(private readonly deps: MorganSessionDeps) {}

  has(projectId: string): boolean { return this.live.has(projectId) }
  canStream(projectId: string): boolean { return this.live.has(projectId) || this.finished.has(projectId) }

  start(projectId: string, opts: { fresh?: boolean } = {}): Promise<{ sessionId: string; existing: boolean }> {
    if (this.closed) return Promise.reject(new Cancelled())
    if (this.stuck.has(projectId)) return Promise.reject(new Error(STUCK))
    const pending = this.starting.get(projectId)
    if (pending) return pending.promise.then(r => ({ ...r, existing: true }))
    const running = this.live.get(projectId)
    if (running && !running.finishing && !this.ending.has(projectId)) return Promise.resolve({ sessionId: running.sessionId, existing: true })
    const next: Pending = { cancelled: false, promise: undefined as never }
    next.promise = (async () => {
      await this.deps.ready?.catch(() => {})   // the boot sweep must not run over a new session
      await this.ending.get(projectId)
      await this.live.get(projectId)?.done
      if (this.stuck.has(projectId)) throw new Error(STUCK)
      return this.spawn(projectId, next, opts.fresh === true)
    })().finally(() => { if (this.starting.get(projectId) === next) this.starting.delete(projectId) })
    this.starting.set(projectId, next)
    return next.promise.then(r => ({ ...r, existing: false }))
  }

  private emitTo(s: Live, e: MorganScreenEvent): void {
    if (e.type === 'hello') {
      s.hello = e; s.history = []; s.truncated = false
      if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null }
    } else if (e.type !== 'approval' && e.type !== 'proposal') { // open items live in their own maps, never trimmed
      s.history.push(e)
      const max = this.deps.maxHistory ?? 5000
      if (s.history.length > max) { s.history.splice(0, s.history.length - max); s.truncated = true }
    }
    for (const l of s.listeners) { try { l(e) } catch (error) { log('listener', error) } }
  }

  private async spawn(projectId: string, pending: Pending, fresh: boolean): Promise<{ sessionId: string }> {
    const check = () => { if (pending.cancelled || this.closed) throw new Cancelled() }
    check()
    const claude = await this.deps.claudePath(this.abort.signal)
    check()
    const project = await this.deps.resolveProject(projectId)
    check()
    const remembered = fresh ? null : await this.deps.store.get(projectId).catch(() => null)
    check()

    const session = remembered ? { kind: 'resume' as const, id: remembered } : { kind: 'new' as const, id: randomUUID() }
    const marker = `${this.deps.port}:${randomUUID()}` // per process, so a resumed conversation never shares a marker with an old process
    await this.deps.markers?.add(marker) // must be on disk before anything starts: it is how a later boot finds leftovers
    let live: Live | null = null
    const emit = (e: MorganScreenEvent) => { if (live) this.emitTo(live, e) }
    const sink: LiveSink = {
      hello: hello => {
        emit({ type: 'hello', hello })
        const s = live
        if (s) {
          if (s.resumed) emit({ type: 'resumed', ok: true })
          s.persisting = this.deps.store.set(projectId, hello.sessionId ?? s.sessionId).catch(error => log('remember session', error))
        }
      },
      events: (epoch, events) => emit({ type: 'events', epoch, events }),
      lost: (epoch, reason) => emit({ type: 'lost', epoch, reason }),
      composer: update => emit({ type: 'composer', update }),
      recovered: epoch => emit({ type: 'recovered', epoch }),
    }
    const channel = await LiveChannel.create({
      runDir: this.deps.runDir,
      now: () => Date.now(),
      setTimer: (fn, ms) => { const t = setTimeout(fn, ms); return { cancel: () => clearTimeout(t) } },
      sink,
      onPermission: ask => new Promise<PermissionAnswer>(resolve => {
        const s = live
        if (!s || s.finishing) return resolve({ allow: false, note: 'the session is ending' })
        const card: ApprovalCard = { requestId: ask.requestId, tool: ask.tool, summary: ask.summary, input: ask.input }
        s.approvals.set(ask.requestId, { card, resolve })
        emit({ type: 'approval', card })
      }),
      onAbandon: (kind, id) => {
        if (kind === 'permission') this.answerApproval(projectId, id, { allow: false, note: 'Morgan stopped waiting' })
        else this.answerProposal(projectId, id, { outcome: 'dismissed', note: 'Morgan stopped waiting' })
      },
      onProposal: ask => new Promise<ProposalOutcome>(resolve => {
        const s = live
        if (!s || s.finishing) return resolve({ outcome: 'session-ended' })
        const problem = this.deps.validateProposal?.(ask.proposal) ?? null
        if (problem) return resolve({ outcome: 'invalid', message: problem })
        s.proposals.set(ask.proposalId, { proposal: ask.proposal, resolve })
        emit({ type: 'proposal', proposalId: ask.proposalId, proposal: ask.proposal })
      }),
    })
    if (!(channel instanceof LiveChannel)) throw new Error(`Morgan's channel could not open (${channel.unavailable}).`)

    let child: ChildProcessLike
    try {
      check()
      const launch = this.deps.launchFor(project, { socketPath: channel.socketPath, token: channel.token }, session, marker)
      child = this.deps.spawnChild(claude, launch.args, { cwd: launch.cwd, env: launch.env })
    } catch (error) {
      await channel.close().catch(e => log('channel close', e))
      throw error
    }

    let markDone!: () => void
    const s: Live = {
      sessionId: session.id, marker, resumed: session.kind === 'resume', child, channel,
      hello: null, history: [], truncated: false, approvals: new Map(), proposals: new Map(), listeners: new Set(),
      ending: null, finishing: null, done: new Promise<void>(r => { markDone = r }), markDone: () => markDone(), startTimer: null,
      startedAt: Date.now(), owned: new Map(), watch: null, persisting: Promise.resolve(),
    }
    live = s
    s.watch = setInterval(() => { void refreshOwned(s) }, 2000)
    this.finished.delete(projectId)
    this.live.set(projectId, s)
    child.onExit(code => { void this.finish(projectId, s, code) })
    s.startTimer = setTimeout(() => {
      s.ending ??= 'start-failed'
      void this.stopSession(projectId, s)
    }, this.deps.startTimeoutMs ?? 10000)
    return { sessionId: s.sessionId }
  }

  answerApproval(projectId: string, requestId: string, answer: PermissionAnswer): boolean {
    const s = this.live.get(projectId)
    const open = s?.approvals.get(requestId)
    if (!s || !open) return false
    s.approvals.delete(requestId)
    open.resolve(answer)
    this.emitTo(s, { type: 'approval-answered', requestId, allow: answer.allow })
    return true
  }

  answerProposal(projectId: string, proposalId: string, outcome: ProposalOutcome): boolean {
    const s = this.live.get(projectId)
    const open = s?.proposals.get(proposalId)
    if (!s || !open) return false
    s.proposals.delete(proposalId)
    open.resolve(outcome)
    this.emitTo(s, { type: 'proposal-answered', proposalId, outcome: outcome.outcome })
    return true
  }

  private async stopSession(projectId: string, s: Live): Promise<void> {
    await refreshOwned(s) // while the leader is still alive, so detached children are still its descendants
    let gone = false
    try { gone = await s.child.terminate() } catch (error) { log('terminate', error) }
    if (!gone) void this.finish(projectId, s, null, false)
    await s.done
  }

  private finish(projectId: string, s: Live, code: number | null, groupGone?: boolean): Promise<void> {
    if (s.finishing) return s.finishing
    s.finishing = (async () => {
      try {
        if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null }
        for (const [id, open] of s.approvals) { open.resolve({ allow: false, note: 'the session ended' }); this.emitTo(s, { type: 'approval-answered', requestId: id, allow: false }) }
        s.approvals.clear()
        for (const [id, open] of s.proposals) { open.resolve({ outcome: 'session-ended' }); this.emitTo(s, { type: 'proposal-answered', proposalId: id, outcome: 'session-ended' }) }
        s.proposals.clear()
        try { s.channel.ptyExited() } catch (error) { log('settle composer', error) }
        if (s.watch) { clearInterval(s.watch); s.watch = null }
        await refreshOwned(s) // catches anything still attached; children already re-parented are in `owned` from earlier snapshots
        const descendants = [...s.owned.values()]
        let gone = groupGone ?? false
        if (groupGone === undefined) {
          try { gone = await s.child.terminate() } catch (error) { log('terminate', error); gone = false }
        }
        try {
          const byParent = await stopProcesses(descendants)                                 // includes children that dropped the marker
          const byMarker = await (this.deps.sweep ?? ((m: string) => stopMarked(m, 1000, s.startedAt)))(s.marker) // Bash tools started after the last snapshot
          if (byParent.length + byMarker.length > 0) gone = false
          else await this.deps.markers?.remove(s.marker).catch(error => log('forget marker', error))
        } catch (error) { log('sweep', error); gone = false }
        try { await s.channel.close() } catch (error) { log('channel close', error) }
        if (!gone) this.stuck.add(projectId)
        const reason = s.ending ?? 'exited'
        const failedResume = s.resumed && !s.hello
        if (failedResume) { try { await this.deps.store.clear(projectId) } catch (error) { log('forget session', error) } }
        const message = !gone ? STUCK : failedResume ? RESUME_FAILED : reason === 'start-failed' ? START_FAILED : undefined
        this.emitTo(s, { type: 'ended', reason, code, ...(message ? { message } : {}) })
        this.finished.set(projectId, [...(s.hello ? [s.hello] : []), ...(s.truncated ? [{ type: 'truncated' } as const] : []), ...s.history])
        await s.persisting
      } catch (error) {
        log('finish', error)
      } finally {
        if (this.live.get(projectId) === s) this.live.delete(projectId)
        s.listeners.clear()
        s.markDone()
      }
    })()
    return s.finishing
  }

  subscribe(projectId: string, listener: (e: MorganScreenEvent) => void): () => void {
    const s = this.live.get(projectId)
    if (!s) {
      for (const e of this.finished.get(projectId) ?? []) listener(e)
      return () => {}
    }
    if (s.hello) listener(s.hello)
    if (s.truncated) listener({ type: 'truncated' })
    for (const e of s.history) listener(e)
    for (const open of s.approvals.values()) listener({ type: 'approval', card: open.card })
    for (const [proposalId, open] of s.proposals) listener({ type: 'proposal', proposalId, proposal: open.proposal })
    s.listeners.add(listener)
    return () => { s.listeners.delete(listener) }
  }

  submit(projectId: string, text: string): string {
    const s = this.live.get(projectId)
    if (!s || s.finishing) throw new Error('Morgan is not running for this project.')
    return s.channel.submit(text)
  }

  stop(projectId: string, turnId: string): void {
    const s = this.live.get(projectId)
    if (!s) return
    // Stopping the turn answers whatever it was waiting on, so nothing is left hanging.
    for (const id of [...s.approvals.keys()]) this.answerApproval(projectId, id, { allow: false, note: 'the writer stopped this turn' })
    for (const id of [...s.proposals.keys()]) this.answerProposal(projectId, id, { outcome: 'dismissed', note: 'the writer stopped this turn' })
    s.channel.stop(turnId)
  }

  end(projectId: string): Promise<void> {
    const inFlight = this.ending.get(projectId)
    if (inFlight) return inFlight
    const pending = this.starting.get(projectId)
    if (!pending && !this.live.has(projectId)) return Promise.resolve()
    const p = (async () => {
      if (pending) { pending.cancelled = true; await pending.promise.catch(() => {}) }
      const s = this.live.get(projectId)
      if (!s) return
      s.ending ??= this.closed ? 'server-shutdown' : 'stopped'
      await this.stopSession(projectId, s)
    })().finally(() => this.ending.delete(projectId))
    this.ending.set(projectId, p)
    return p
  }

  async shutdown(): Promise<void> {
    this.closed = true
    this.abort.abort()
    const ids = new Set([...this.live.keys(), ...this.starting.keys()])
    await Promise.all([...ids].map(id => this.end(id)))
  }
}
```

A resumed session's `hello` is the success signal (Story-drive spike f: the id may be stale for up to 3 s inside the session, so the stored id is the one WriterOS launched with, or `hello.sessionId` when present). A resume that never says hello ends as start-failed, forgets the stored id and says so; the next Start is fresh. Remembering the id is best-effort: if the store write fails, Morgan keeps running and only resume is lost.

- [ ] **Step 8: Run tests, type-check, commit.**

Run: `npx vitest run tests/server/morganHost/ && npm run check`
Expected: PASS.

```bash
git add server/morganHost/ptyProcess.ts server/morganHost/markerSweep.ts server/morganHost/sessionStore.ts server/morganHost/morganSession.ts tests/fakes/fake-claude-morgan.mjs tests/helpers/morganProtocol.ts tests/server/morganHost
git commit -m "feat(morgan): hosted sessions with approval cards, page proposals, resume and full cleanup"
```

---

### Task 6: Routes, event stream, wiring and the flag **[carried over; approval, proposal, resume and context routes new in rev 6]**

**Files:**
- Create: `server/morganHost/morganRoutes.ts`, `server/morganHost/repoRoot.ts`, `server/morganHost/proposals.ts`
- Modify: `server/routes.ts`, `server/index.ts`, `server/projectLibrary/routes.ts`, `shared/projectLibraryApi.ts`, `tests/server/projectLibraryRoutes.test.ts`
- Test: `tests/server/morganHost/morganRoutes.test.ts`, `tests/server/morganHost/morganWiring.test.ts`, `tests/server/morganHost/proposals.test.ts`

**Interfaces:**
- Consumes: `MorganSessions` (Task 6); `sameOrigin`, `authenticated` (`server/projectLibrary/security.ts`); `ProjectLibraryConfig` (`server/projectLibrary/config.ts`: `rootPath: string | null`, `allowedOrigins: ReadonlySet<string>`, `sessionToken`); `ProjectLibraryStore.resolveProjectPackagePath` (`store.ts:417`); `readStoryDriveLinks(projectsRoot): Promise<StoryDriveLinks>` (`storyDriveLinks.ts:30`).
- Produces routes (all `sameOrigin` + `authenticated`; project id checked against `WRITEROS_PROJECT_ID_PATTERN` from `shared/projectLibraryApi.ts:7`):
  - `POST /api/morgan/:projectId/session` → `{ sessionId, existing }`; `503 { error: 'claude-unavailable', message }` when preflight fails; `404` for an unknown project
  - `GET /api/morgan/:projectId/stream` → `text/event-stream`, each message `data: <MorganScreenEvent JSON>`; `404` if no session
  - `POST /api/morgan/:projectId/submit` `{ text }` (1–20000 chars) → `{ composerId }`
  - `POST /api/morgan/:projectId/stop` `{ turnId }` → `204`
  - `DELETE /api/morgan/:projectId/session` → `204` after the process has exited
  - `registerMorganRoutes(app, config, sessions): void`
  - `morganHostEnabled(env): boolean` (true only for `'1'`)
  - `POST /api/morgan/:projectId/session` body `{ fresh?: boolean }` (fresh = "New conversation": do not resume)
  - `POST /api/morgan/:projectId/submit` body `{ text, context?: { surface?: string; title?: string } }` → the text Morgan receives starts with one line `[WriterOS: Ben is on the <surface> page]` when a surface is given
  - `POST /api/morgan/:projectId/approval/:requestId` body `{ allow: boolean, note?: string }` → `204`, or `404` if that card is no longer open
  - `POST /api/morgan/:projectId/proposal/:proposalId` body `{ outcome: 'kept' | 'dismissed' | 'stale', note?: string }` → `204`, or `404`
  - `createMorganHost(config, store, env): { sessions: MorganSessions; killAllNow(): void }` (production wiring; `killAllNow` synchronously SIGKILLs every process carrying this port's marker, for the forced-stop path)
  - `validateProposal(p: PageProposal): string | null` in `proposals.ts`: checks structured content against the surface's schema from `shared/documents.ts` and script blocks against the element list
  - `registerRoutes` returns `{ server, morganHost: { sessions: MorganSessions; killAllNow(): void } | null }`; check every caller of `registerRoutes` (`server/index.ts`, tests such as `tests/server/wpChatRoute.test.ts`) and update them.

- [ ] **Step 1: Write the failing route tests.** Real Express, real `fetch`, a typed config whose allowed origin matches the bound port, and a stub sessions object.

```ts
// tests/server/morganHost/morganRoutes.test.ts
// @vitest-environment node
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { morganHostEnabled, registerMorganRoutes } from '../../../server/morganHost/morganRoutes'
import type { ProjectLibraryConfig } from '../../../server/projectLibrary/config'

const TOKEN = 't'.repeat(64)

function stubSessions() {
  const listeners: ((e: unknown) => void)[] = []
  return {
    start: vi.fn(async (id: string) => { if (id === 'missing') throw Object.assign(new Error('No such project.'), { code: 'not-found' }); return { sessionId: 's1', existing: false } }),
    subscribe: vi.fn((_id: string, l: (e: unknown) => void) => { listeners.push(l); l({ type: 'hello', hello: { epoch: 'e1' } }); return () => {} }),
    submit: vi.fn(() => 'c1'),
    stop: vi.fn(),
    end: vi.fn(async () => {}),
    has: vi.fn(() => true),
    canStream: vi.fn(() => true),
    answerApproval: vi.fn((_p: string, id: string) => id === 'r1'),
    answerProposal: vi.fn((_p: string, id: string) => id === 'p1'),
    emit: (e: unknown) => listeners.forEach(l => l(e)),
  }
}

let server: Server | null = null
afterEach(() => { server?.close(); server = null })

async function boot(sessions = stubSessions()) {
  const app = express()
  app.use(express.json())
  server = app.listen(0, '127.0.0.1')
  await new Promise(r => server!.once('listening', r))
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  const config: ProjectLibraryConfig = {
    // Fill every required field from server/projectLibrary/config.ts; these three matter here.
    sessionToken: TOKEN,
    rootPath: '/projects',
    allowedOrigins: new Set([base]),
  } as ProjectLibraryConfig
  registerMorganRoutes(app, config, sessions as never)
  return { base, sessions }
}
const headers = (base: string) => ({ 'content-type': 'application/json', origin: base, 'x-writeros-session': TOKEN })

describe('morgan routes', () => {
  it('refuses requests without the session token', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: { origin: base } })).status).toBe(401)
  })

  it('refuses requests from another origin', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: { ...headers(base), origin: 'http://evil.test' } })).status).toBe(403)
  })

  it('refuses a malformed project id', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/${encodeURIComponent('../x')}/session`, { method: 'POST', headers: headers(base) })).status).toBe(400)
  })

  it('starts a session', async () => {
    const { base, sessions } = await boot()
    const r = await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: headers(base) })
    expect(await r.json()).toEqual({ sessionId: 's1', existing: false })
    expect(sessions.start).toHaveBeenCalledWith('p1', { fresh: false })
  })

  it('starts a new conversation on request', async () => {
    const { base, sessions } = await boot()
    await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: headers(base), body: JSON.stringify({ fresh: true }) })
    expect(sessions.start).toHaveBeenCalledWith('p1', { fresh: true })
  })

  it('submits with the page Ben is on', async () => {
    const { base, sessions } = await boot()
    await fetch(`${base}/api/morgan/p1/submit`, { method: 'POST', headers: headers(base), body: JSON.stringify({ text: 'tighten this', context: { surface: 'Outline' } }) })
    expect(sessions.submit).toHaveBeenCalledWith('p1', '[WriterOS: Ben is on the Outline page]\ntighten this')
  })

  it('answers an approval card, and 404s one that is no longer open', async () => {
    const { base, sessions } = await boot()
    const ok = await fetch(`${base}/api/morgan/p1/approval/r1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ allow: true }) })
    expect(ok.status).toBe(204)
    expect(sessions.answerApproval).toHaveBeenCalledWith('p1', 'r1', { allow: true })
    const gone = await fetch(`${base}/api/morgan/p1/approval/r9`, { method: 'POST', headers: headers(base), body: JSON.stringify({ allow: true }) })
    expect(gone.status).toBe(404)
    const bad = await fetch(`${base}/api/morgan/p1/approval/r1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ allow: 'yes' }) })
    expect(bad.status).toBe(400)
  })

  it('answers a page proposal', async () => {
    const { base, sessions } = await boot()
    const ok = await fetch(`${base}/api/morgan/p1/proposal/p1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ outcome: 'kept' }) })
    expect(ok.status).toBe(204)
    expect(sessions.answerProposal).toHaveBeenCalledWith('p1', 'p1', { outcome: 'kept' })
    const bad = await fetch(`${base}/api/morgan/p1/proposal/p1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ outcome: 'invalid' }) })
    expect(bad.status).toBe(400) // only the page's own outcomes come from the browser
  })

  it('reports an unknown project as 404', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/missing/session`, { method: 'POST', headers: headers(base) })).status).toBe(404)
  })

  it('reports preflight failure as 503 with the plain message', async () => {
    const sessions = stubSessions()
    sessions.start.mockRejectedValueOnce(Object.assign(new Error('Morgan needs Claude Code 2.1.290 or newer.'), { code: 'claude-unavailable' }))
    const { base } = await boot(sessions)
    const r = await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: headers(base) })
    expect(r.status).toBe(503)
    expect((await r.json()).message).toMatch(/2\.1\.290/)
  })

  it('submits text and refuses empty text', async () => {
    const { base, sessions } = await boot()
    const ok = await fetch(`${base}/api/morgan/p1/submit`, { method: 'POST', headers: headers(base), body: JSON.stringify({ text: 'hello' }) })
    expect(await ok.json()).toEqual({ composerId: 'c1' })
    expect(sessions.submit).toHaveBeenCalledWith('p1', 'hello')
    const bad = await fetch(`${base}/api/morgan/p1/submit`, { method: 'POST', headers: headers(base), body: JSON.stringify({ text: '' }) })
    expect(bad.status).toBe(400)
  })

  it('streams events with the session header, and refuses without it', async () => {
    const { base, sessions } = await boot()
    expect((await fetch(`${base}/api/morgan/p1/stream`, { headers: { origin: base } })).status).toBe(401)
    const ctrl = new AbortController()
    const r = await fetch(`${base}/api/morgan/p1/stream`, { headers: headers(base), signal: ctrl.signal })
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/)
    const reader = r.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"hello"')
    sessions.emit({ type: 'lost', epoch: 'e1', reason: 'silence' })
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"reason":"silence"')
    sessions.emit({ type: 'ended', reason: 'stopped', code: 0 })
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"ended"')
    expect((await reader.read()).done).toBe(true) // the server closes the stream after `ended`
    ctrl.abort()
  })

  it('ends a session after the process is gone', async () => {
    const { base, sessions } = await boot()
    const r = await fetch(`${base}/api/morgan/p1/session`, { method: 'DELETE', headers: headers(base) })
    expect(r.status).toBe(204)
    expect(sessions.end).toHaveBeenCalledWith('p1')
  })
})

describe('morganHostEnabled', () => {
  it('is on only for 1', () => {
    expect(morganHostEnabled({ WRITEROS_MORGAN_HOST: '1' })).toBe(true)
    expect(morganHostEnabled({ WRITEROS_MORGAN_HOST: 'true' })).toBe(false)
    expect(morganHostEnabled({})).toBe(false)
  })
})
```

Replace the `as ProjectLibraryConfig` cast by filling every field `config.ts` declares, so the compiler catches drift. Check how `sameOrigin` treats `Sec-Fetch-Site` (`security.ts`) and that `origin: base` passes it.

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run tests/server/morganHost/morganRoutes.test.ts`
Expected: FAIL, cannot resolve `morganRoutes`.

- [ ] **Step 3: Implement routes, repo root and production wiring.**

```ts
// server/morganHost/repoRoot.ts
// The WriterOS folder: two levels up from server/morganHost/ under tsx, one level up from dist/ in production.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function writerosRoot(fromUrl: string = import.meta.url): string {
  let dir = path.dirname(fileURLToPath(fromUrl))
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json')
    if (existsSync(pkg) && existsSync(path.join(dir, 'mod', 'writeros-morgan'))) return dir
    dir = path.dirname(dir)
  }
  throw new Error('WriterOS folder not found from ' + fromUrl)
}
```

```ts
// server/morganHost/proposals.ts
// Checks a page proposal before it reaches the page. Returns a plain problem, or null when it is usable.
import { z } from 'zod'
import {
  OutlineDocumentContentSchema, StoryBibleDocumentContentSchema, SynopsisDocumentContentSchema, TreatmentDocumentContentSchema,
} from '../../shared/documents'
import type { PageProposal } from '../../shared/morganLive'

const STRUCTURED = {
  synopsis: SynopsisDocumentContentSchema,
  outline: OutlineDocumentContentSchema,
  treatment: TreatmentDocumentContentSchema,
  storyBible: StoryBibleDocumentContentSchema,
} as const
const ScriptBlock = z.object({
  type: z.enum(['scene-heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition']),
  text: z.string().max(10_000),
})
const ScriptTarget = z.union([
  z.object({ kind: z.enum(['replace-scene', 'insert-after-scene']), sceneHeading: z.string().min(1).max(500), expectedScene: z.array(ScriptBlock).min(1).max(2000) }),
  z.object({ kind: z.literal('append') }),
])

const first = (e: z.ZodError) => { const i = e.issues[0]; return `${i.path.join('.') || 'content'}: ${i.message}` }

export function validateProposal(p: PageProposal): string | null {
  if (typeof p?.summary !== 'string' || p.summary.trim() === '') return 'summary: say in one line what changes and why'
  if (p.surface === 'script') {
    const target = ScriptTarget.safeParse(p.target)
    if (!target.success) return `target.${first(target.error)}`
    const blocks = z.array(ScriptBlock).min(1).max(2000).safeParse(p.blocks)
    return blocks.success ? null : `blocks.${first(blocks.error)}`
  }
  const schema = STRUCTURED[p.surface as keyof typeof STRUCTURED]
  if (!schema) return `surface: ${String((p as { surface: unknown }).surface)} cannot be changed this way`
  if (!Number.isInteger(p.baseRevision) || p.baseRevision < 0) return 'baseRevision: send the revision you read'
  const content = schema.safeParse(p.content)
  return content.success ? null : `content.${first(content.error)}`
}
```

```ts
// tests/server/morganHost/proposals.test.ts
import { describe, expect, it } from 'vitest'
import { validateProposal } from '../../../server/morganHost/proposals'
import { createEmptySeriesContent } from '../../../shared/documents' // or the empty-content helper each schema's tests use

describe('validateProposal', () => {
  it('accepts a script append and a replace-scene', () => {
    expect(validateProposal({ surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' })).toBeNull()
    expect(validateProposal({ surface: 'script', target: { kind: 'replace-scene', sceneHeading: 'INT. KITCHEN - NIGHT', expectedScene: [{ type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' }, { type: 'action', text: 'Dishes.' }] }, blocks: [{ type: 'scene-heading', text: 'INT. KITCHEN - NIGHT' }], summary: 'Rewrite' })).toBeNull()
  })

  it('names the first problem plainly', () => {
    expect(validateProposal({ surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'montage', text: 'x' } as never], summary: 's' })).toMatch(/^blocks\.0\.type/)
    expect(validateProposal({ surface: 'script', target: { kind: 'replace-scene' } as never, blocks: [{ type: 'action', text: 'x' }], summary: 's' })).toMatch(/^target/)
    expect(validateProposal({ surface: 'lookbook' as never, baseRevision: 1, content: {}, summary: 's' })).toMatch(/cannot be changed/)
    expect(validateProposal({ surface: 'outline', baseRevision: 3, content: { nonsense: true }, summary: 's' })).toMatch(/^content/)
    expect(validateProposal({ surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'x' }], summary: ' ' })).toMatch(/^summary/)
  })

  it('accepts structured content that matches its schema', () => {
    // Build a valid outline content with the helper the existing document tests use (see tests/shared/documents*.test.ts).
    const content = VALID_OUTLINE_CONTENT
    expect(validateProposal({ surface: 'outline', baseRevision: 3, content, summary: 'Tighten act two' })).toBeNull()
  })
})
```

Set `VALID_OUTLINE_CONTENT` from the fixture or factory the existing `shared/documents` tests use (`grep -rn "OutlineDocumentContentSchema" tests | head`).

```ts
// server/morganHost/morganRoutes.ts
import type { Express, Request, Response } from 'express'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { WRITEROS_PROJECT_ID_PATTERN } from '../../shared/projectLibraryApi'
import type { ProjectLibraryConfig } from '../projectLibrary/config'
import { authenticated, sameOrigin } from '../projectLibrary/security'
import type { ProjectLibraryStore } from '../projectLibrary/store'
import { readStoryDriveLinks } from '../projectLibrary/storyDriveLinks'
import { preflight, realDeps } from './claudeCli'
import { buildMorganLaunch, defaultReadRoots, morganEnv, morganModel } from './launchArgs'
import { sweepStaleSockets } from './liveChannel'
import { stopMarked } from './markerSweep'
import { MorganSessions } from './morganSession'
import { validateProposal } from './proposals'
import { spawnWithPty } from './ptyProcess'
import { writerosRoot } from './repoRoot'
import { fileSessionStore } from './sessionStore'
import { loginShellPath } from './shellPath'

export function morganHostEnabled(env: Record<string, string | undefined>): boolean {
  return env.WRITEROS_MORGAN_HOST === '1'
}

// Set to what Task 0 recorded.
export const ISOLATION_ARGS = ['--restricted', '--strict-mcp-config']
export const PERMISSION_MODE = 'manual'

const StartSchema = z.object({ fresh: z.boolean().optional() }).default({})
const SubmitSchema = z.object({
  text: z.string().min(1).max(20000),
  context: z.object({ surface: z.string().max(60).optional(), title: z.string().max(200).optional() }).optional(),
})
const StopSchema = z.object({ turnId: z.string().min(1).max(200) })
const ApprovalSchema = z.object({ allow: z.boolean(), note: z.string().max(1000).optional() })
const ProposalAnswerSchema = z.object({ outcome: z.enum(['kept', 'dismissed', 'stale']), note: z.string().max(1000).optional() })

function projectId(req: Request, res: Response): string | null {
  const id = req.params.projectId
  if (!WRITEROS_PROJECT_ID_PATTERN.test(id)) {
    res.status(400).json({ error: 'bad-project', message: 'Project id is not valid.' })
    return null
  }
  return id
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

export function withContext(text: string, context?: { surface?: string }): string {
  const surface = context?.surface?.replace(/[\[\]\n]/g, '').trim()
  return surface ? `[WriterOS: Ben is on the ${surface} page]\n${text}` : text
}

export function registerMorganRoutes(app: Express, config: ProjectLibraryConfig, sessions: MorganSessions): void {
  const guard = [sameOrigin(config, 'Morgan'), authenticated(config, 'Morgan')]

  app.post('/api/morgan/:projectId/session', ...guard, async (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = StartSchema.safeParse(req.body ?? {})
    if (!body.success) return res.status(400).json({ error: 'bad-start', message: 'fresh must be true or false.' })
    try {
      res.json(await sessions.start(id, { fresh: body.data.fresh === true }))
    } catch (error) {
      const code = errorCode(error)
      const status = code === 'not-found' ? 404 : code === 'claude-unavailable' ? 503 : 500
      res.status(status).json({ error: code ?? 'start-failed', message: (error as Error).message })
    }
  })

  // Read by the browser with fetch (not EventSource) so the normal session header is sent.
  app.get('/api/morgan/:projectId/stream', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    if (!sessions.canStream(id)) return res.status(404).json({ error: 'no-session', message: 'Morgan is not running for this project.' })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    let open = true
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000)
    const finish = () => { if (!open) return; open = false; clearInterval(keepAlive); unsubscribe(); res.end() }
    // `ended` is the last event of a session (live or replayed): deliver it, then close the stream.
    const unsubscribe = sessions.subscribe(id, e => {
      if (!open) return
      res.write(`data: ${JSON.stringify(e)}\n\n`)
      if (e.type === 'ended') queueMicrotask(finish)
    })
    req.on('close', finish)
  })

  app.post('/api/morgan/:projectId/submit', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = SubmitSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-text', message: 'Message must be 1 to 20000 characters.' })
    try {
      res.json({ composerId: sessions.submit(id, withContext(body.data.text, body.data.context)) })
    } catch (error) {
      res.status(409).json({ error: 'no-session', message: (error as Error).message })
    }
  })

  app.post('/api/morgan/:projectId/approval/:requestId', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = ApprovalSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-answer', message: 'allow must be true or false.' })
    const answer = { allow: body.data.allow, ...(body.data.note ? { note: body.data.note } : {}) }
    if (!sessions.answerApproval(id, String(req.params.requestId), answer)) return res.status(404).json({ error: 'not-open', message: 'That request is no longer waiting.' })
    res.status(204).end()
  })

  app.post('/api/morgan/:projectId/proposal/:proposalId', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = ProposalAnswerSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-outcome', message: 'outcome must be kept, dismissed or stale.' })
    const outcome = { outcome: body.data.outcome, ...(body.data.note ? { note: body.data.note } : {}) }
    if (!sessions.answerProposal(id, String(req.params.proposalId), outcome)) return res.status(404).json({ error: 'not-open', message: 'That change is no longer waiting.' })
    res.status(204).end()
  })

  app.post('/api/morgan/:projectId/stop', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = StopSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-turn', message: 'turnId is required.' })
    sessions.stop(id, body.data.turnId)
    res.status(204).end()
  })

  app.delete('/api/morgan/:projectId/session', ...guard, async (req, res) => {
    const id = projectId(req, res); if (!id) return
    await sessions.end(id)
    res.status(204).end()
  })
}

// Forced-stop path: synchronous, exact markers only (from markers.json), environment part only, current user only,
// and no group signals (a leader cannot be verified quickly enough here). Anything missed is caught by the next boot sweep.
function killMarkedNowSync(markers: string[]): void {
  if (markers.length === 0) return
  try {
    const uid = String(process.getuid?.() ?? '')
    const withEnv = execFileSync('ps', ['-E', '-ww', '-U', uid, '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const argsOnly = execFileSync('ps', ['-ww', '-U', uid, '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const args = new Map(argsOnly.split('\n').map(l => l.trim()).filter(Boolean).map(l => [Number(l.split(/\s+/)[0]), l] as const))
    for (const line of withEnv.split('\n').map(l => l.trim()).filter(Boolean)) {
      const pid = Number(line.split(/\s+/)[0])
      const plain = args.get(pid)
      if (!plain || pid === process.pid || !line.startsWith(plain)) continue
      const env = ` ${line.slice(plain.length)} `
      if (markers.some(m => env.includes(` WRITEROS_MORGAN_SESSION=${m} `))) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
    }
  } catch (error) { console.error('[morgan] forced cleanup failed', error) }
}

// Production wiring. Preflight runs on the first start, not at server boot, so a missing or old
// Claude Code shows as a 503 message in Morgan's screen instead of stopping WriterOS.
export function createMorganHost(
  config: ProjectLibraryConfig & { rootPath: string },
  store: ProjectLibraryStore,
  env: Record<string, string | undefined>,
): { sessions: MorganSessions; killAllNow(): void } {
  const root = writerosRoot()
  const port = env.PORT || '5000'
  const runDir = path.join(os.homedir(), '.writeros', 'run', port)
  mkdirSync(runDir, { recursive: true, mode: 0o700 })
  chmodSync(runDir, 0o700)
  sweepStaleSockets(runDir)
  const markers = markerFile(runDir)
  // Left by a server that was killed hard. Markers whose processes survive SIGKILL stay recorded for the next try;
  // they belong to old sessions, so new starts are not blocked by them.
  const ready = (async () => {
    for (const m of await markers.all()) {
      const survivors = await stopMarked(m)
      if (survivors.length === 0) await markers.remove(m)
      else console.error(`[morgan] ${survivors.length} old process(es) for marker ${m} did not stop; kept for the next start`)
    }
  })().catch(error => console.error('[morgan] boot sweep failed', error))

  const loginPath = loginShellPath(env.PATH, (shell, args) => execFileSync(shell, args, { encoding: 'utf8' }))
  const baseEnv = morganEnv(env, loginPath)
  const configured = (env.MORGAN_READ_DIRS ?? '').split(':').filter(d => path.isAbsolute(d))
  const readRoots = (configured.length > 0 ? configured : defaultReadRoots(os.homedir(), env.MORGAN_CLAUDE_MEM_DIR ?? CLAUDE_MEM_DIR)).filter(d => existsSync(d))
  const host = {
    writerosRoot: root,
    modDir: path.join(root, 'mod', 'writeros-morgan'),
    personaFile: path.join(root, 'server', 'morganHost', 'persona.md'),
    readRoots,
  }

  // A success is cached; a failure is not, so Ben can fix Claude Code and click Start again.
  let checked: Promise<string> | null = null
  const claudePath = (signal: AbortSignal) => {
    if (checked) return checked
    const attempt = preflight(realDeps(baseEnv, ISOLATION_ARGS, signal)).then(result => {
      if (!result.ok) throw Object.assign(new Error(result.message), { code: 'claude-unavailable' })
      return result.path
    })
    checked = attempt
    attempt.catch(() => { if (checked === attempt) checked = null })
    return attempt
  }

  const sessions = new MorganSessions({
    spawnChild: spawnWithPty,
    claudePath,
    runDir,
    port,
    store: fileSessionStore(path.join(os.homedir(), '.writeros', 'morgan', port)),
    validateProposal,
    markers,
    ready,
    resolveProject: async projectId => {
      let packagePath: string
      try { packagePath = await store.resolveProjectPackagePath(projectId) }
      catch (error) { throw Object.assign(new Error('That project is not in the WriterOS library.'), { code: 'not-found', cause: error }) }
      const links = await readStoryDriveLinks(config.rootPath)
      return { packagePath, storyDriveRoot: links.links[projectId]?.root ?? null }
    },
    launchFor: (project, channel, session, marker) => buildMorganLaunch({
      project, host, model: morganModel(env), session, marker,
      socketPath: channel.socketPath, token: channel.token,
      parentEnv: env, loginPath, isolationArgs: ISOLATION_ARGS, permissionMode: PERMISSION_MODE,
    }),
  })
  return { sessions, killAllNow: () => killMarkedNowSync(markers.allSync()) }
}

// <runDir>/markers.json: the exact markers of sessions this server started and has not finished cleaning up.
function markerFile(runDir: string) {
  const file = path.join(runDir, 'markers.json')
  const readSync = (): string[] => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return [] } }
  let queue: Promise<unknown> = Promise.resolve()
  const serial = (fn: () => void) => { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next as Promise<void> }
  const write = (list: string[]) => writeFileSync(file, JSON.stringify(list), { mode: 0o600 })
  return {
    all: async () => readSync(),
    allSync: readSync,
    add: (m: string) => serial(() => write([...new Set([...readSync(), m])])),
    remove: (m: string) => serial(() => write(readSync().filter(x => x !== m))),
  }
}
```

`CLAUDE_MEM_DIR` is a constant set to the folder Task 0 Step 11 recorded (or `null`). `MORGAN_READ_DIRS`, when set, replaces the default roots entirely (colon-separated absolute paths).


Check `readStoryDriveLinks`'s return shape and whether the links registry is keyed by project id (`storyDriveLinks.ts:17-21`); if a link's `root` can be relative, resolve it the way `beatSheetRoutes.ts` does.

- [ ] **Step 4: Wire it in.** In `server/routes.ts`, after `registerLookbookRoutes(...)`:

```ts
let morganHost: { sessions: MorganSessions; killAllNow(): void } | null = null
if (morganHostEnabled(process.env) && projectLibraryStore && projectLibraryConfig.rootPath) {
  morganHost = createMorganHost({ ...projectLibraryConfig, rootPath: projectLibraryConfig.rootPath }, projectLibraryStore, process.env)
  registerMorganRoutes(app, projectLibraryConfig, morganHost.sessions)
}
```

and return `{ server, morganHost }` instead of the server alone; update every caller. In `server/index.ts`:

```ts
const { server, morganHost } = await registerRoutes(app)
let stopping = false
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    if (stopping) return
    stopping = true
    const hardStop = setTimeout(() => { morganHost?.killAllNow(); process.exit(1) }, 10000) // 3 s SIGTERM grace + 2 s SIGKILL wait + marker sweep
    void (morganHost?.sessions.shutdown() ?? Promise.resolve()).finally(() => { clearTimeout(hardStop); process.exit(0) })
  })
}
```

(10 seconds covers the 3-second SIGTERM grace, the 2-second SIGKILL wait and the marker sweep; `launchctl kickstart -k` sends SIGTERM first. The forced path's `killAllNow()` SIGKILLs every process carrying this port's marker.)

In the bootstrap handler (`server/projectLibrary/routes.ts`) add `morganHost: morganHostEnabled(process.env) && Boolean(config.rootPath)`, add `morganHost: boolean` to the bootstrap type in `shared/projectLibraryApi.ts`, and update the full-response assertion in `tests/server/projectLibraryRoutes.test.ts` (~l.126).

- [ ] **Step 5: Wiring test** — flag off means no routes and no change; flag on registers them.

```ts
// tests/server/morganHost/morganWiring.test.ts
// @vitest-environment node
import express from 'express'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { registerRoutes } from '../../../server/routes'

const saved = process.env.WRITEROS_MORGAN_HOST
afterEach(() => { if (saved === undefined) delete process.env.WRITEROS_MORGAN_HOST; else process.env.WRITEROS_MORGAN_HOST = saved })

async function statusOf(flag: string | undefined) {
  if (flag === undefined) delete process.env.WRITEROS_MORGAN_HOST; else process.env.WRITEROS_MORGAN_HOST = flag
  const app = express()
  const { server, morganHost } = await registerRoutes(app)
  server.listen(0, '127.0.0.1')
  await new Promise(r => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const status = (await fetch(`${base}/api/morgan/p1/session`, { method: 'POST' })).status
  await morganHost?.sessions.shutdown()
  server.close()
  return { status, hasHost: morganHost !== null }
}

describe('Morgan host flag', () => {
  it('flag off: no Morgan routes', async () => {
    expect(await statusOf(undefined)).toEqual({ status: 404, hasHost: false })
  })
})
```

Add a boot-sweep test in the same file: with a temp `HOME`, write `markers.json` in `<HOME>/.writeros/run/<test port>/` containing `"<test port>:x"`, start a detached `sleep 60` with `WRITEROS_MORGAN_SESSION=<test port>:x` in its environment and another with `<test port>:y` (not recorded), call `createMorganHost` with `PORT=<test port>`, await a start (which waits for `ready`), and expect the first `sleep` gone and the second still running (kill it afterwards).

Add a flag-on case using the same project-library test setup `tests/server/projectLibraryRoutes.test.ts` uses (a temp `WRITEROS_PROJECTS_ROOT`); expect the unauthenticated POST to answer `403` or `401` (routes registered and guarded), not `404`. Morgan's process is never started in this test.

- [ ] **Step 6: Run tests and the whole suite, commit.**

Run: `npx vitest run tests/server/ && npm run test:run && npm run check && npm run build`
Expected: all PASS; build succeeds with `node-pty` left external.

```bash
git add server/morganHost/morganRoutes.ts server/morganHost/repoRoot.ts server/routes.ts server/index.ts server/projectLibrary/routes.ts shared/projectLibraryApi.ts tests/server
git commit -m "feat(morgan): authenticated Morgan routes, awaited shutdown, behind WRITEROS_MORGAN_HOST"
```

---

### Task 7: Morgan's screen, approval cards and page proposals in the browser **[panel carried over; cards, proposals, resume new in rev 6]**

**Files:**
- Create: `client/src/lib/morganLive/model.ts` (port of Story-drive `src/live/model.ts`), `client/src/components/shell/MorganLivePanel.tsx`, `client/src/components/shell/MorganApprovalCard.tsx`, `client/src/lib/scriptProposal.ts`, `client/src/lib/morganProposal.ts`, `client/src/components/writing/screenplay/ScriptProposalPreview.tsx`
- Modify: `client/src/lib/projectStorage.ts`, `client/src/lib/serverProjectStorage.ts`, `client/src/lib/useWriterOSProjectLibrary.ts`, `client/src/components/shell/Shell.tsx`, `client/src/components/shell/LeftRail.tsx`, `client/src/App.tsx`, `client/src/components/writing/ScriptTab.tsx`
- Test: `tests/lib/morganLive/model.test.ts` (port of Story-drive `test/live.model.test.ts`), `tests/lib/serverProjectStorageMorgan.test.ts`, `tests/components/MorganLivePanel.test.tsx`, `tests/components/MorganApprovalCard.test.tsx`, `tests/lib/scriptProposal.test.ts`, `tests/lib/morganProposal.test.ts`

**Interfaces:**
- Consumes: routes (Task 6); `MorganScreenEvent`, `ApprovalCard`, `PageProposal` (Task 3).
- Produces: in `projectStorage.ts`, `ProjectStorageAdapter` gains `morgan?: ProjectStorageMorganClient` (alias `MorganApi`), set by `bootstrapServerProjectStorage` (`serverProjectStorage.ts:80`, which returns `ProjectStorageAdapter`) only when the bootstrap says `morganHost: true`; `useWriterOSProjectLibrary` returns it as `morgan: adapter.morgan ?? null`, like `beatSheet`:

```ts
// client/src/lib/projectStorage.ts
export interface ProjectStorageMorganClient {
  start(projectId: string, opts?: { fresh?: boolean }): Promise<{ sessionId: string; existing: boolean }>
  submit(projectId: string, text: string, context?: { surface?: string }): Promise<string>
  answerApproval(projectId: string, requestId: string, answer: { allow: boolean; note?: string }): Promise<void>
  answerProposal(projectId: string, proposalId: string, answer: { outcome: 'kept' | 'dismissed' | 'stale'; note?: string }): Promise<void>
  stop(projectId: string, turnId: string): Promise<void>
  end(projectId: string): Promise<void>
  stream(projectId: string, onEvent: (e: MorganScreenEvent) => void, onClosed: () => void): () => void
}
export type MorganApi = ProjectStorageMorganClient
```

and `<MorganLivePanel projectId={string} morgan={MorganApi} surface={string} onPageProposal={(p: { proposalId: string; proposal: PageProposal } | null) => void} />`. The session token stays inside `serverProjectStorage.ts`, as it does for the beat-sheet and lookbook calls today.

- [ ] **Step 1: Port the reducer and its tests.**

```bash
cp ~/Projects/story-drive/src/live/model.ts client/src/lib/morganLive/model.ts
cp ~/Projects/story-drive/test/live.model.test.ts tests/lib/morganLive/model.test.ts
```

Edit:
- Protocol imports → `shared/morganLive`; the test imports the reducer from `client/src/lib/morganLive/model` and builders from `tests/helpers/morganProtocol` (remove any Story-drive preflight or launcher imports).
- Input is `MorganScreenEvent`. Map `ended` to what the old `session-ended` case did, keeping `reason` and `message`; add `truncated` (sets `earlierHidden: true`).
- User-row attribution: Story-drive recognises rows submitted through its own plugin by the plugin name `story-drive-live`; change it to `writeros-morgan`, or Ben's own messages disappear from the feed. Add a test for it.
- Remove everything about `mark` events (ticket header, progress steps, question cards, decision callouts).
- Replace Raw view state with `stuck: { reason: string; detail?: string } | null`, set on `waiting-for-input` whose reason is not `permission` (permission requests arrive as approval cards), on `lost` other than `no-hello`, and cleared on the matching `input-done` / `recovered`.
- New state **[rev 6]**: `cards: ApprovalCard[]` (add on `approval`, remove on `approval-answered`), `proposals: { proposalId, proposal }[]` (add on `proposal`, remove on `proposal-answered`), `notice: string | null` (set by `resumed` — ok: "Picked up where you left off."; not ok: its message). Tests for each. Keep: committed rows, the provisional live-writing area, folded tool calls, turn state, composer outcomes.
- Update the ported tests to match; delete the `mark` and raw-toggle cases.

Run: `npx vitest run tests/lib/morganLive/model.test.ts`
Expected: PASS.

- [ ] **Step 2: Write the failing storage test.**

```ts
// tests/lib/serverProjectStorageMorgan.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrapServerProjectStorage } from '../../client/src/lib/serverProjectStorage'

afterEach(() => vi.unstubAllGlobals())

function bootstrapFetch(morganHost: boolean) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/project-library/bootstrap')) {
      return new Response(JSON.stringify({ enabled: true, label: 'Projects', sessionToken: 'tok', morganHost }), { status: 200 })
    }
    if (url.endsWith('/api/morgan/p1/session') && init?.method === 'POST') {
      expect((init.headers as Record<string, string>)['X-WriterOS-Session']).toBe('tok')
      return new Response(JSON.stringify({ sessionId: 's1', existing: false }), { status: 200 })
    }
    if (url.endsWith('/api/morgan/p1/stream')) {
      const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"hello","hello":{"epoch":"e1"}}\n\n')); c.close() } })
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response('{}', { status: 404 })
  })
}

describe('server storage: morgan', () => {
  it('is absent when the bootstrap says morganHost false', async () => {
    vi.stubGlobal('fetch', bootstrapFetch(false))
    const storage = await bootstrapServerProjectStorage(/* same arguments existing tests pass */)
    expect(storage?.morgan).toBeUndefined()
  })

  it('starts with the session header and parses the event stream', async () => {
    vi.stubGlobal('fetch', bootstrapFetch(true))
    const storage = await bootstrapServerProjectStorage(/* same arguments existing tests pass */)
    expect(await storage!.morgan!.start('p1')).toEqual({ sessionId: 's1', existing: false })
    const events: unknown[] = []
    await new Promise<void>(resolve => storage!.morgan!.stream('p1', e => events.push(e), resolve))
    expect(events).toEqual([{ type: 'hello', hello: { epoch: 'e1' } }])
  })
})
```

Fill in `bootstrapServerProjectStorage`'s arguments from an existing test of it (`grep -rn bootstrapServerProjectStorage tests | head -3`).

- [ ] **Step 3: Implement the storage `morgan` operations.** Inside `bootstrapServerProjectStorage`, after `sessionHeaders` is built (~l.97), when `bootstrap.morganHost === true`:

```ts
const morganBase = (projectId: string) => `/api/morgan/${encodeURIComponent(projectId)}`
async function morganRequest(url: string, init: RequestInit): Promise<Response> {
  const r = await fetch(url, { ...init, headers: { ...sessionHeaders, 'Content-Type': 'application/json' } })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(typeof body.message === 'string' ? body.message : 'Morgan request failed.')
  }
  return r
}
const morgan: MorganApi = {
  start: async (id, opts) => (await morganRequest(`${morganBase(id)}/session`, { method: 'POST', body: JSON.stringify({ fresh: opts?.fresh === true }) })).json(),
  submit: async (id, text, context) => (await (await morganRequest(`${morganBase(id)}/submit`, { method: 'POST', body: JSON.stringify({ text, ...(context ? { context } : {}) }) })).json()).composerId,
  answerApproval: async (id, requestId, answer) => { await morganRequest(`${morganBase(id)}/approval/${encodeURIComponent(requestId)}`, { method: 'POST', body: JSON.stringify(answer) }) },
  answerProposal: async (id, proposalId, answer) => { await morganRequest(`${morganBase(id)}/proposal/${encodeURIComponent(proposalId)}`, { method: 'POST', body: JSON.stringify(answer) }) },
  stop: async (id, turnId) => { await morganRequest(`${morganBase(id)}/stop`, { method: 'POST', body: JSON.stringify({ turnId }) }) },
  end: async id => { await morganRequest(`${morganBase(id)}/session`, { method: 'DELETE' }) },
  stream: (id, onEvent, onClosed) => {
    const ctrl = new AbortController()
    void (async () => {
      try {
        const r = await fetch(`${morganBase(id)}/stream`, { headers: sessionHeaders, signal: ctrl.signal })
        if (!r.ok || !r.body) return
        const reader = r.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let cut: number
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, cut)
            buffer = buffer.slice(cut + 2)
            const data = frame.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n')
            if (data) onEvent(JSON.parse(data))
          }
        }
      } catch { /* aborted or network error */ }
      finally { if (!ctrl.signal.aborted) onClosed() }
    })()
    return () => ctrl.abort()
  },
}
```

and include `morgan` in the returned adapter. Add `morganHost?: boolean` to the client's `ProjectLibraryBootstrap` type if it is separate from `shared/projectLibraryApi.ts`. In `useWriterOSProjectLibrary.ts`, add `morgan?: ProjectStorageMorganClient | null` beside `beatSheet` (l.115) and `morgan: adapter.morgan ?? null` beside l.336, and extend that hook's existing test the same way its `beatSheet` case is tested.

Run: `npx vitest run tests/lib/serverProjectStorageMorgan.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing component test.**

```tsx
// tests/components/MorganLivePanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MorganLivePanel } from '../../client/src/components/shell/MorganLivePanel'
import type { MorganApi } from '../../client/src/lib/projectStorage'
import { hello, row, waiting } from '../helpers/morganProtocol'

function fakeApi() {
  let push: (e: unknown) => void = () => {}
  const api: MorganApi = {
    start: vi.fn(async () => ({ sessionId: 's1', existing: false })),
    submit: vi.fn(async () => 'c1'),
    answerApproval: vi.fn(async () => {}),
    answerProposal: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    stream: vi.fn((_id, onEvent) => { push = onEvent as never; return () => {} }),
  }
  return { api, push: (e: unknown) => push(e) }
}

const onPageProposal = vi.fn()

async function started() {
  const f = fakeApi()
  render(<MorganLivePanel projectId="p1" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
  fireEvent.click(screen.getByRole('button', { name: /start morgan/i }))
  await waitFor(() => expect(f.api.stream).toHaveBeenCalled())
  f.push({ type: 'hello', hello: hello() })
  return f
}

describe('MorganLivePanel', () => {
  it('shows Morgan\'s reply as plain text and sends what Ben types', async () => {
    const f = await started()
    f.push({ type: 'events', epoch: hello().epoch, events: [row(0, 'Ready.')] })
    expect(await screen.findByText('Ready.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /message morgan/i }), { target: { value: 'Where did beat one come from?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(f.api.submit).toHaveBeenCalledWith('p1', 'Where did beat one come from?', { surface: 'Outline' }))
  })

  it('never renders model text as HTML', async () => {
    const f = await started()
    f.push({ type: 'events', epoch: hello().epoch, events: [row(0, '<img src=x onerror=alert(1)>')] })
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows an approval card and sends Ben\'s answer', async () => {
    const f = await started()
    f.push({ type: 'approval', card: { requestId: 'r1', tool: 'Edit', summary: 'Edit 28.md (/x/28.md)', input: '{}' } })
    expect(await screen.findByText('Edit 28.md (/x/28.md)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^allow$/i }))
    await waitFor(() => expect(f.api.answerApproval).toHaveBeenCalledWith('p1', 'r1', { allow: true }))
    f.push({ type: 'approval-answered', requestId: 'r1', allow: true })
    await waitFor(() => expect(screen.queryByText('Edit 28.md (/x/28.md)')).toBeNull())
  })

  it('"Don\'t allow" can carry a note to Morgan', async () => {
    const f = await started()
    f.push({ type: 'approval', card: { requestId: 'r2', tool: 'Bash', summary: 'Run a command: Import beat sheet to canon', input: '{}' } })
    fireEvent.change(await screen.findByRole('textbox', { name: /tell morgan why/i }), { target: { value: 'dry run first' } })
    fireEvent.click(screen.getByRole('button', { name: /don.t allow/i }))
    await waitFor(() => expect(f.api.answerApproval).toHaveBeenCalledWith('p1', 'r2', { allow: false, note: 'dry run first' }))
  })

  it('hands page proposals to the page', async () => {
    const f = await started()
    const proposal = { surface: 'script', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'Rain.' }], summary: 'Add rain' }
    f.push({ type: 'proposal', proposalId: 'p9', proposal })
    await waitFor(() => expect(onPageProposal).toHaveBeenCalledWith({ proposalId: 'p9', proposal }))
    expect(screen.getByText('Add rain')).toBeTruthy() // also listed in the rail, so Ben can find it
  })

  it('"New conversation" starts fresh', async () => {
    const f = await started()
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }))
    await waitFor(() => expect(f.api.end).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(f.api.start).toHaveBeenLastCalledWith('p1', { fresh: true }))
  })

  it('says plainly when Morgan is stuck, and Restart ends then starts', async () => {
    const f = await started()
    f.push({ type: 'events', epoch: hello().epoch, events: [waiting(0, 'r1', 'elicitation', 'A form')] })
    expect(await screen.findByText(/stuck on a prompt this screen cannot show/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /restart morgan/i }))
    await waitFor(() => expect(f.api.end).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(f.api.start).toHaveBeenCalledTimes(2))
    expect((f.api.end as any).mock.invocationCallOrder[0]).toBeLessThan((f.api.start as any).mock.invocationCallOrder[1])
  })

  it('shows the could-not-start message with its command', async () => {
    const f = await started()
    f.push({ type: 'ended', reason: 'start-failed', code: null, message: 'Morgan could not start. … run `claude` …' })
    expect(await screen.findByText(/could not start/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /start morgan/i })).toBeTruthy()
  })

  it('shows when the session ended', async () => {
    const f = await started()
    f.push({ type: 'ended', reason: 'server-shutdown', code: null })
    expect(await screen.findByText(/session ended/i)).toBeTruthy()
  })

  it('shows the start error from the server', async () => {
    const f = fakeApi()
    ;(f.api.start as any).mockRejectedValueOnce(new Error('Morgan needs Claude Code 2.1.290 or newer.'))
    render(<MorganLivePanel projectId="p1" morgan={f.api} surface="Outline" onPageProposal={onPageProposal} />)
    fireEvent.click(screen.getByRole('button', { name: /start morgan/i }))
    expect(await screen.findByText(/2\.1\.290/)).toBeTruthy()
  })
})
```

- [ ] **Step 5: Run to verify failure.**

Run: `npx vitest run tests/components/MorganLivePanel.test.tsx`
Expected: FAIL, cannot resolve `MorganLivePanel`.

- [ ] **Step 6: Implement the panel.** All state comes from the reducer (Step 1); the component renders it and calls `morgan`. Required (the tests find them by these names):
  - Before a session: a "Start Morgan" button. A failed start shows the error message.
  - Feed: committed rows in order, rendered as **plain text** with `white-space: pre-wrap` (WriterOS has no Markdown renderer in the rail — `LeftRail.tsx:108` renders `{msg.content}` directly; Markdown is a later improvement). Tool calls collapsed to one line ("Read MAP.md", "Searched for 'arena'"), expandable. If `earlierHidden`, a line "Earlier messages are not shown."
  - Live writing: the provisional area below the feed while Morgan writes.
  - Composer: textarea `aria-label="Message Morgan"`, "Send" button (Enter sends, Shift+Enter new line, ignore Enter during IME composition), "Stop" while a turn runs.
  - Stuck: "Morgan is stuck on a prompt this screen cannot show yet." and "Restart Morgan", which awaits `end` then calls `start` and re-subscribes.
  - Approval cards **[rev 6]**: each open card as `<MorganApprovalCard>` pinned above the composer (never scrolled away): the summary, for an edit, the file path and the old → new text shown as a small before/after (from `old_string` / `new_string`, or the full content for a write), and for a command, the complete command in a monospace block; a "Details" fold with the pretty-printed input (it is complete: the mod refuses anything over 64 KB rather than truncating); a textbox labelled "Tell Morgan why (optional)", and buttons "Allow" and "Don't allow". Answering disables both buttons until `approval-answered` arrives; a 404 from the route ("no longer waiting") removes the card.
  - Proposals **[rev 6]**: each open proposal listed in the rail with its summary and "Show on page"; every new or changed proposal list is passed to `onPageProposal` (the newest open one, or `null` when none is open).
  - Header **[rev 6]**: "New conversation" (confirms, then `end` + `start({ fresh: true })`). The composer sends `{ surface }` with each message (the page Ben is on, from the `surface` prop).
  - Notice **[rev 6]**: "Picked up where you left off." after a successful resume; the resume-failed message otherwise.
  - Ended: for `start-failed`, show the server's message (it includes the one-time Terminal command); otherwise "Morgan's session ended — start a new one." Both show "Start Morgan".
  - Stream closed unexpectedly while running: try re-subscribing once after 1 second; if that fails, show "Lost contact with Morgan." with "Start Morgan".
  - Unmount closes the stream but does not end the session (another tab may be using it).
  - Visual style: match the old transcript in `LeftRail.tsx` (same fonts, spacing and colors); no new design system.

- [ ] **Step 7a: Script proposals — pure logic, tests first [new in rev 6].**

```ts
// tests/lib/scriptProposal.test.ts
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { applyScriptProposal, locateTarget } from '../../client/src/lib/scriptProposal'
import { createScreenplayExtensions } from '../../client/src/components/writing/screenplay/ScreenplayEditor'

const html = (rows: [string, string][]) => rows.map(([t, x]) => `<p data-element-type="${t}">${x}</p>`).join('')
const editorWith = (rows: [string, string][]) => new Editor({ extensions: createScreenplayExtensions({}), content: html(rows) })
const rows = (e: Editor) => { const out: [string, string][] = []; e.state.doc.forEach(n => out.push([n.attrs.elementType, n.textContent])); return out }

const script: [string, string][] = [
  ['scene-heading', 'INT. KITCHEN - NIGHT'], ['action', 'Dishes.'],
  ['scene-heading', 'EXT. YARD - DAY'], ['action', 'Wind.'],
  ['scene-heading', 'INT. KITCHEN - NIGHT'], ['action', 'Later.'],
]
const sceneOf = (r: [string, string][]) => r.map(([type, text]) => ({ type, text })) as { type: any; text: string }[]
const yard = { kind: 'replace-scene' as const, sceneHeading: 'EXT. YARD - DAY', expectedScene: sceneOf(script.slice(2, 4)) }

describe('script proposals', () => {
  it('replaces the scene Morgan read', () => {
    const e = editorWith(script)
    expect(applyScriptProposal(e, { surface: 'script', summary: 's', target: yard, blocks: [{ type: 'scene-heading', text: 'EXT. YARD - DAY' }, { type: 'action', text: 'Rain.' }] }))
      .toEqual({ ok: true })
    expect(rows(e).slice(2, 4)).toEqual([['scene-heading', 'EXT. YARD - DAY'], ['action', 'Rain.']])
  })

  it('is stale when Ben changed that scene since Morgan read it, and changes nothing', () => {
    const e = editorWith([...script.slice(0, 3), ['action', 'Wind. Ben added this.'], ...script.slice(4)])
    const before = rows(e)
    expect(applyScriptProposal(e, { surface: 'script', summary: 's', target: yard, blocks: [{ type: 'action', text: 'x' }] })).toEqual({ ok: false, reason: 'stale' })
    expect(rows(e)).toEqual(before)
  })

  it('is stale when Ben changed an element type without changing the words', () => {
    const e = editorWith([...script.slice(0, 3), ['dialogue', 'Wind.'], ...script.slice(4)])
    expect(applyScriptProposal(e, { surface: 'script', summary: 's', target: yard, blocks: [{ type: 'action', text: 'x' }] })).toEqual({ ok: false, reason: 'stale' })
  })

  it('tells repeated headings apart by their contents, and refuses when still ambiguous', () => {
    const e = editorWith(script)
    applyScriptProposal(e, { surface: 'script', summary: 's', target: { kind: 'insert-after-scene', sceneHeading: 'INT. KITCHEN - NIGHT', expectedScene: sceneOf(script.slice(4, 6)) }, blocks: [{ type: 'transition', text: 'CUT TO:' }] })
    expect(rows(e).at(-1)).toEqual(['transition', 'CUT TO:'])
    const twins = editorWith([...script.slice(0, 2), ...script.slice(0, 2)])
    expect(applyScriptProposal(twins, { surface: 'script', summary: 's', target: { kind: 'replace-scene', sceneHeading: 'INT. KITCHEN - NIGHT', expectedScene: sceneOf(script.slice(0, 2)) }, blocks: [{ type: 'action', text: 'x' }] }))
      .toEqual({ ok: false, reason: 'ambiguous' })
  })

  it('appends, and is stale if the ending changed', () => {
    const e = editorWith(script)
    expect(applyScriptProposal(e, { surface: 'script', summary: 's', target: { kind: 'append' }, expectedEnding: sceneOf(script.slice(4, 6)), blocks: [{ type: 'action', text: 'End.' }] })).toEqual({ ok: true })
    expect(rows(e).at(-1)).toEqual(['action', 'End.'])
    expect(applyScriptProposal(e, { surface: 'script', summary: 's', target: { kind: 'append' }, expectedEnding: sceneOf(script.slice(4, 6)), blocks: [{ type: 'action', text: 'x' }] })).toEqual({ ok: false, reason: 'stale' })
  })

  it('a kept change is its own undo step, with typing just before and just after it', () => {
    const e = editorWith(script)
    e.commands.insertContentAt(e.state.doc.content.size - 1, ' More.') // Ben types
    const afterTyping = rows(e)
    applyScriptProposal(e, { surface: 'script', summary: 's', target: { kind: 'append' }, blocks: [{ type: 'action', text: 'End.' }] })
    const afterKeep = rows(e)
    e.commands.insertContentAt(e.state.doc.content.size - 1, '!') // Ben types again
    e.commands.undo()
    expect(rows(e)).toEqual(afterKeep)   // only the later typing is undone
    e.commands.undo()
    expect(rows(e)).toEqual(afterTyping) // then only the kept change
  })

  it('locates a scene from its heading to the next heading', () => {
    const r = locateTarget(editorWith(script).state.doc, yard)
    expect(r && 'from' in r).toBe(true)
  })
})
```

`ScreenplayEditor` builds its extensions inline with a pagination callback that closes over a component ref, so export a factory `createScreenplayExtensions(opts)` that takes those callbacks and use it in both `ScreenplayEditor` and this test (do not copy the list).

```ts
// client/src/lib/scriptProposal.ts
// Applies a Morgan script proposal to the open script as one isolated undo step — only if the target scene is
// exactly what Morgan read. Anything else is stale or ambiguous, and nothing changes.
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import type { PageProposal, ScriptTarget } from '@shared/morganLive'

type ScriptProposal = Extract<PageProposal, { surface: 'script' }>
type Block = { type: string; text: string }
// Exact snapshot: paragraph boundaries, element types and text (trailing spaces ignored).
const same = (a: Block[], b: Block[]) => a.length === b.length && a.every((x, i) => x.type === b[i].type && x.text.trimEnd() === b[i].text.trimEnd())

interface Scene { from: number; to: number; heading: string; blocks: Block[] }
function scenes(doc: PMNode): Scene[] {
  const out: Scene[] = []
  doc.forEach((node, offset) => {
    if (node.attrs.elementType === 'scene-heading') out.push({ from: offset, to: doc.content.size, heading: node.textContent.trim(), blocks: [] })
    out.at(-1)?.blocks.push({ type: String(node.attrs.elementType), text: node.textContent })
  })
  for (let i = 0; i < out.length - 1; i++) out[i].to = out[i + 1].from
  return out
}

export function locateTarget(doc: PMNode, target: ScriptTarget, expectedEnding?: Block[]):
  { from: number; to: number } | { at: number } | 'stale' | 'ambiguous' {
  const all = scenes(doc)
  if (target.kind === 'append') {
    if (expectedEnding !== undefined && !same(all.at(-1)?.blocks ?? [], expectedEnding)) return 'stale'
    return { at: doc.content.size }
  }
  const matches = all.filter(sc => sc.heading.toUpperCase() === target.sceneHeading.trim().toUpperCase() && same(sc.blocks, target.expectedScene))
  if (matches.length === 0) return 'stale'
  if (matches.length > 1) return 'ambiguous'
  const sc = matches[0]
  return target.kind === 'replace-scene' ? { from: sc.from, to: sc.to } : { at: sc.to }
}

export function applyScriptProposal(editor: Editor, p: ScriptProposal): { ok: true } | { ok: false; reason: 'stale' | 'ambiguous' } {
  const place = locateTarget(editor.state.doc, p.target, p.expectedEnding)
  if (place === 'stale' || place === 'ambiguous') return { ok: false, reason: place }
  const { schema } = editor.state
  const nodes = p.blocks.map(b => schema.nodes.paragraph.create({ elementType: b.type }, b.text ? schema.text(b.text) : null))
  const tr = closeHistory(editor.state.tr) // starts a new undo group: never merges with Ben's earlier typing
  if ('from' in place) tr.replaceWith(place.from, place.to, nodes)
  else tr.insert(place.at, nodes)
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr)) // ends it: Ben's next typing starts its own group
  return { ok: true }
}
```

If TipTap's history extension is `@tiptap/extension-history` rather than `prosemirror-history`, import `closeHistory` from the package it re-exports (`@tiptap/pm/history`); the test above pins the behaviour.


- [ ] **Step 7b: Structured-page proposals reuse WriterOS's existing preview [new in rev 6].** App already previews and applies `MemoryGroundedPatchProposal` (`App.tsx:288-330`, `MemoryPatchPreview`, `applyMemoryGroundedPatch` with its `revision` stale check in `client/src/lib/memoryPatch.ts:98`). Convert Morgan's proposal into that shape:

```ts
// client/src/lib/morganProposal.ts
import type { MemoryGroundedPatchProposal } from '@shared/memoryPatches'
import type { PageProposal } from '@shared/morganLive'

type Structured = Exclude<PageProposal, { surface: 'script' }>

export function toPatchProposal(p: Structured, current: unknown): MemoryGroundedPatchProposal {
  const changedPaths = Object.keys(p.content as object).filter(k =>
    JSON.stringify((p.content as Record<string, unknown>)[k]) !== JSON.stringify((current as Record<string, unknown> | null)?.[k]))
  return {
    patch: { kind: 'structured-document', surface: p.surface, baseVersion: p.baseRevision, proposedContent: p.content, changedPaths, memoryIds: [] },
    rationale: p.summary,
    canonConflicts: [],
    citations: [],
  }
}
```

Test (`tests/lib/morganProposal.test.ts`): `changedPaths` lists exactly the top-level keys that differ; the result passes `MemoryGroundedPatchProposalSchema` from `shared/memoryPatches.ts`. Check that schema's real field names and match them.

In `App.tsx`: add `morganProposalId?: string` and `morganProjectId?: string` to the `activePatchProposal` state. `onPageProposal` from the panel: for a structured proposal, `setActivePatchProposal({ proposal: toPatchProposal(p, documents[p.surface].content), messageId: proposalId, mode: 'previewing', morganProposalId: proposalId, morganProjectId: activeFolderProjectId })` and switch the shell to that surface; for a script proposal, set `morganScriptProposal` state `{ projectId: activeFolderProjectId, proposalId, proposal }` and switch to the Script page. **Ownership [rev 6 fix]:** the existing effect that clears `activePatchProposal` on `activeAgentProjectKey` change (`App.tsx:~299`) also clears `morganScriptProposal`; Keep on either kind first checks the stored `projectId` against the open project and does nothing on a mismatch. Component test: show a script proposal for `p1`, switch to `p2`, the banner is gone and `answerProposal` is not called. In `handleApplyPatch`, after `applyMemoryGroundedPatch`: if `morganProposalId` is set, call `morgan.answerProposal(projectId, id, { outcome: result.ok ? 'kept' : 'stale' })`. In the Dismiss handler: `{ outcome: 'dismissed' }`. The existing "Keep for later" (collapse to chip) does not answer Morgan; the proposal stays open until Keep or Dismiss.

- [ ] **Step 7c: Script proposal preview on the Script page [new in rev 6].** `ScriptTab` gains two optional props, `morganProposal?: { projectId: string; proposalId: string; proposal: ScriptProposal }` and `onMorganProposalOutcome?(outcome: 'kept' | 'dismissed' | 'stale')`. When set, it renders `<ScriptProposalPreview>` as a banner above the editor (the same placement as `MemoryPatchPreview` above structured pages): the summary, where it goes ("Replaces the scene INT. KITCHEN - NIGHT" / "After the scene …" / "At the end"), the proposed blocks formatted with the screenplay CSS classes, and "Keep" / "Dismiss". Keep calls `applyScriptProposal(editorRef.current, proposal)` and reports `kept`, or `stale` for both stale and ambiguous (the banner says "The script changed since Morgan read it — ask her to redo it." or "That scene heading appears more than once with the same text — ask Morgan to be more specific." and stays until dismissed); Dismiss reports `dismissed`. Before applying, ScriptTab checks the proposal's `projectId` equals the open project; if not, it reports nothing and clears the banner. App answers Morgan from `onMorganProposalOutcome` and clears the state. Component test: Keep applies and reports `kept`; Dismiss reports `dismissed` and leaves the script unchanged; a missing heading shows the stale message.

- [ ] **Step 7: Swap the rail.** Thread two optional props through `App.tsx` → `Shell.tsx` (`RailProps`, l.38) → `LeftRail.tsx` (`LeftRailProps`, l.9): `morgan` (from `projectFolder.morgan`, `useWriterOSProjectLibrary` at `App.tsx:177`) and `morganProjectId` (`activeFolderProjectId`, `App.tsx:233`; null for browser-only projects). In `LeftRail.tsx`, when both are set render `<MorganLivePanel key={morganProjectId} projectId={morganProjectId} morgan={morgan} surface={currentSurfaceLabel} onPageProposal={onMorganPageProposal} />` in place of the transcript + textarea block (`origin/main` l.95-131); otherwise render exactly what it renders today. The `key` resets the panel's reducer when the project changes; inside the panel, every async callback (start result, stream events, restart) checks a generation counter bumped on unmount and ignores results for an obsolete project. Add a component test: render for `p1`, rerender with `p2`, then deliver a late `p1` stream event; `p2`'s panel must not show it.

- [ ] **Step 8: Run tests, whole suite, type-check, build, commit.**

Run: `npx vitest run tests/components tests/lib/morganLive tests/lib/serverProjectStorageMorgan.test.ts tests/lib/scriptProposal.test.ts tests/lib/morganProposal.test.ts && npm run test:run && npm run check && npm run build`
Expected: all PASS.

```bash
git add client/src tests/lib tests/components
git commit -m "feat(morgan): Morgan in the left rail with approval cards and page proposals"
```

- [ ] **Step 9: Visual check** (repo rule for UI changes). Start the dev server with the flag (Task 8 Step 1), open a server project, and check with browser tooling: Start, a reply, a folded tool line, Stop, an approval card (ask Morgan to create a scratch file in the Story-drive folder; Allow and Don't allow), a structured proposal previewing on the Outline page, a script proposal banner on the Script page, New conversation, and the left rail at narrow width.

---

### Task 8: First real run with Ben (manual, dev checkout only) **[new in rev 6]**

Nothing here touches `~/WriterOS-Prod`. The test is whether Morgan can do, inside WriterOS, what Claude Code did for Ben on 2026-10-06.

- [ ] **Step 1: Start the dev server with the flag** on a port the live app is not using, from Ben's own Terminal:

```bash
cd ~/Projects/WriterOS && PORT=5178 WRITEROS_MORGAN_HOST=1 npm run dev
```

The live app on 5177 keeps running; each server has its own socket folder, session memory and marker port.

- [ ] **Step 2: Ask, read, explain (A1, A3, A4).** Open the project with the robot-job beat sheet, click Start Morgan, and ask:
  - "Where did the 'underground arena' wording in beat 1 come from?" Pass: she finds the dated amendment note and the Episode 1 outline it came from, names both files.
  - "What did I say about the robot fight in the Story-drive session on the 4th?" Pass: she searches past session transcripts and quotes Ben.
  - "What does 'shape only' do if I answer yes?" Pass: she reads WriterOS and Front Lot code and explains that a shape-only look is refused for generation.

- [ ] **Step 3: Look at images (A2) and the casting firewall.** "Look at the salon frames in the robot arena look-development notes and tell me what the room is." Pass: she opens the images and describes them. Then ask her to open anything in a `casting-inspiration` folder. Pass: refused, with the reason.

- [ ] **Step 4: Change something with Ben's yes (A5, A6).** A throwaway change on a copy, or a real one Ben wants: "Cut beat 4 from the beat sheet and update canon." Pass: she explains the change, an approval card appears for the beat sheet edit (Ben taps Allow), she adds a dated amendment note, runs the import dry run and says what it will change, a second card appears for `--apply`, and What's Standing reflects it afterwards. Then: "Actually, that's not what I meant — put it back." Pass: she reverses it the same way.

- [ ] **Step 5: Write on the page with Ben.** On the Script page: "Write the opening of scene 1 with me — start with what the room looks like." Pass: they talk it through; she proposes the scene as a script proposal; the banner shows on the Script page; Keep puts it in the script; undo removes it in one step. On the Outline page: "Tighten beat 3." Pass: the existing proposed-change banner appears on the Outline; Keep applies it.

- [ ] **Step 6: Other apps (A7).** "Check Story-drive's log for errors today." Pass: she reads it (approves any command it needs).

- [ ] **Step 7: Pick up tomorrow.** Stop the dev server (Ctrl+C), start it again, open the project, click Start Morgan. Pass: "Picked up where you left off." and the earlier conversation is there; she remembers what was decided.

- [ ] **Step 8: Cleanup.** With Morgan running a long command (ask her to run `sleep 120`, Allow), stop the dev server with Ctrl+C, then `ps -E -ww -axo pid,command | grep WRITEROS_MORGAN_SESSION=5178`. Pass: nothing listed. Also click Restart twice quickly; only one Claude Code process for the project afterwards.

- [ ] **Step 9: Record the results** in `~/Projects/dry-runs/` as a dated note (what Ben asked, what Morgan did, pass/fail per step, gaps found) and open the PR. Ben merges with `gh pr merge`; turning it on in the live app is a separate, Ben-run step (`WRITEROS_MORGAN_HOST=1` in `~/WriterOS-Prod/.env`, then `writeros-deploy`).

---

## Questions for Codex's review (rev 6, new parts only)

Revision 5's lifecycle, channel and routing were reviewed over five rounds (see the log). Review the parts marked **[new in rev 6]**:

1. **Approval cards** (Task 3 Step 4, Task 4, Task 5): the mod answers `classic.PermissionRequest` itself after a held `/permission` request. Any path where Claude Code still shows its own dialog (hanging the hidden terminal), times out on its own, or acts before the answer?
2. **Page proposals** (Task 3 Step 5, Task 6 `proposals.ts`, Task 7 Steps 7a–7c): structured proposals reuse `applyMemoryGroundedPatch` and its revision check; script proposals locate by heading and apply in one transaction. Any way a proposal overwrites newer work, lands in the wrong place, or leaves Morgan's tool call unanswered?
3. **Marker sweep** (Task 5 Step 3, Task 6 forced stop and boot sweep): finding Morgan's processes by an environment marker via `ps -E`. Reliable on macOS for the same user? Any risk of matching a process that is not Morgan's?
4. **Read roots and the casting firewall** (Task 2, Task 3 Step 3): broad default roots plus a `Read(//**/casting-inspiration/**)` deny and the guard. Any read path to a casting image left open (Grep output, Agent subagents, `@` mentions)?
5. **Resume** (Task 5): resuming with `--resume <id>`; forgetting a failed resume. Any way two processes end up on the same conversation, or a stale id loops?
