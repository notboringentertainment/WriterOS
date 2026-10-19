# WriterOS — agent context (keep this file thin)

Models are strong enough to infer the stack from `package.json` and the tree. Only document what is **not obvious** from them.

## Status page and finishing work

- **Start of every session:** read [`STATUS.md`](STATUS.md) first. It says what is live, open and next.
- **When work lands** (merged, and deployed where the app deploys), whoever finished it, Claude or Codex, does all three before calling it done:
  1. **Rewrite `STATUS.md` in place:** Live, Open, Next, and the date. Plain language for Ben, readable in two minutes, no commit hashes or internal code names. Start from the current file so newer status isn't overwritten by an older view.
  2. **Archive the work's notes:** move its plan, handoff and review notes into `docs/archive/` (moved, not deleted). Current plans and standing reference docs stay. This repository is public: notes that were never committed and mention Ben's stories, characters or places go to `~/Projects/housekeeping/archive/<date>/` instead, never into the repo.
  3. **Remove the work's worktree** only when its exact commit is in the target branch, it has no uncommitted or untracked files, its ignored files hold nothing that exists only there, and nothing is running in it. Never force removal. Keep the branch.
- Don't leave a new plan or handoff beside an old one for the same work; update or archive the old one.

## Product

WriterOS is the home for a project's canon and its script. It sits between Story-drive (where story decisions are made) and Front Lot (where the film is produced). Morgan, the writing partner, writes prose pages (Synopsis, Treatment, Outline, Story Bible) from canon when the writer asks. Canon changes only with the writer's explicit yes.

Before product or surface work, read [`PRODUCT.md`](PRODUCT.md) and `docs/product/README.md`. Where an older PRD disagrees with them, they win.

## Shape of the repo

- `client/` — React + Vite frontend (`client/src/App.tsx` is the entry).
- `server/` — Express server. `server/routes.ts` registers the routes; the big areas are `projectMemory/` (the canon ledger), `room/` (Writers' Room), `morganHost/` (Morgan's hosted session), `projectLibrary/` (project folders and Story-drive links), `appeals/` and `looks/`.
- `shared/` — types and schemas used by both sides.
- `tests/` — Vitest, mirroring the source folders.
- `docs/` — product docs, plans, runbooks. `docs/superpowers/` and anything in `docs/archive/` are history, not guidance.

The app runs live on port 5177 from `~/WriterOS-Prod`. Projects are folder packages under `~/WriterOS Projects`.

## Constraints that are not obvious

1. The canon system is established and must not change behaviour: the project memory ledger and promote / ratify / lock, appeals to Story-drive, beat sheet sync, look drafting and promotion, and the wayfinder import. UI may change around it.
2. Keep Writing Partner and Writer's Room transcripts separate. `agents.writingPartner.transcript` is only for the left rail host conversation. `agents.sam/casey/oliver/maya/zoe/alex.transcript` are only for Writer's Room specialist sessions.
3. Keep `/api/wp-chat` a thin adapter over `OpenAIService.generatePersonaResponse`.
4. Do not reintroduce Replit, Drizzle, Neon, Passport or session scaffolding unless Ben explicitly asks for a backend persistence project.
5. Never use Ben's story or character names in code, tests or fixtures.
6. Writer-facing words are plain language. The apps are called WriterOS, Story-drive, Front Lot and Morgan. Never show "Backlot", "wayfinder", hashes, ids, file paths or commands on screen.
7. Never run destructive or irreversible commands without explicit permission: no `git push --force`, no `git reset --hard`, no broad file deletion. Do not merge or deploy until Ben says so for that piece of work.
8. Do not use stale scaffold-era files (`CLAUDE 2.md`, old Replit or prototype handoffs) as guidance.

## Verification

Run after meaningful changes: `npm run test:run`, `npm run check`, `npm run build`. For UI changes, also look at the result in a browser; do not rely on reading the code.

Full working rules are in [`CLAUDE.md`](CLAUDE.md).

## opensrc — dependency source truth

When implementing a feature that depends on an npm package or upstream repo:

1. Prefer reading **actual source**, not guessed APIs.
2. Run `npm run opensrc:fetch -- <package>` or `opensrc path <package>` (global CLI).
3. Optional vendor for `@` mentions: `npm run opensrc:vendor -- <package>` → under `repos/`.
4. In prompts: **reference the vendored path or `$(opensrc path <pkg>)` output** — find the exact function; do not invent signatures.
