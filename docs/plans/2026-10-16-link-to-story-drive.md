# Link to Story-drive button

Date: 2026-10-16. Branch: `build/link-story-drive`. Claude builds, Codex reviews (same split as Phase 3).

## Problem

A WriterOS project gets its Beat Sheet, appeals and Morgan's canon import from a linked Story-drive folder. Linking is terminal-only today (`project-memory link-source --workflow wayfinder --from <abs path>`, audit F13). Since PR #89 the Beat Sheet shows Story-drive beats only, so an unlinked project shows an empty Beat Sheet with no way forward inside the app. Live today: only Bloodless is linked; Grave Affairs, Yes Chef and the rest are not.

## What Ben sees

On the Beat Sheet of an unlinked **server-library** project (beat-sheet status explicitly `not-linked`; browser-only and local-folder projects never see it, since they have no server project to link — R1 #6), under the existing message "No beat sheet yet. Beats come from this project's Story-drive beat sheet once the project is linked.", a **Link to Story-drive** button.

Clicking it opens an inline picker (no modal) listing the Story-drive projects WriterOS found, with the one whose folder name matches the project name already selected. One more click (**Link**) writes the link, brings the folder's Story-drive canon into WriterOS, and refreshes the Beat Sheet, so beats appear immediately if the beat sheet is ratified. The picker says this before the click: "Linking brings this folder's Story-drive decisions into WriterOS canon." Cancel closes the picker.

- Folders already linked to another WriterOS project are listed but disabled, with "linked to <project name>".
- If nothing is found, the picker says where it looked, in plain words.
- Errors show inline in plain language; no stack text.
- If the canon import fails, the link still stands and the message says so, with a **Try again** button that reruns only the import (R1 #1).
- If Morgan is open on this project, the result says: "Morgan is open on this project. Click New conversation in her panel so she works from the Story-drive folder." (R1 #2; the live session captured the unlinked paths, and ending a conversation without asking would lose it.)

Ben's steps: two clicks. No path typing.

## Server

### Where Story-drive projects are found

`storyDriveSearchRoot` = env `WRITEROS_STORY_DRIVE_ROOT` if set, else `~/Library/Mobile Documents/com~apple~CloudDocs/My Scripts` (the same folder `server/morganHost/launchArgs.ts` already treats as a read root).

A candidate is a direct, non-hidden child directory `X` of the search root where `X/wayfinder` is a real directory (not a symlink) containing a `tickets/` or `resolved/` directory — the same test appeal delivery uses (`appealOutbox.ts` `checkRoot`), so every offered folder can take appeals (R1 #7). A MAP-only folder is not offered. Symlinks at either level are skipped. Names starting with `.` or `_` are skipped. No recursion beyond that.

The link root written is `X/wayfinder` (canonical path), matching the existing Bloodless entry and what Morgan's canon import (`import --source wayfinder --from <root>`) is given today.

Path safety (R1 #5): the search root and the selected `X/wayfinder` both go through the existing `guardExistingPath` (every component checked, no symlinks, identity captured); the selected path must sit canonically inside the canonical search root; `verify()` runs on both immediately before the registry write, inside the lock. This is the same guard the CLI link uses.

Ownership compares effective roots (R1 #3): an existing registry entry `R` is normalized to `R/wayfinder` when that is a directory, else `R`, then canonicalized; the candidate's canonical `X/wayfinder` is compared against those. Used for both `linkedTo` and the 409 check. Entries that cannot be resolved (folder gone) are ignored for ownership. CLI behavior unchanged.

### Routes (both behind `sameOrigin` + `authenticated`, like the beat-sheet routes)

1. `GET /api/project-library/story-drive/folders` → `{ searchRoot, folders: [{ id, name, linkedTo: { projectId, title } | null }] }`. `id` is an opaque value (the folder name), never a path supplied back by the browser.
2. `POST /api/project-library/projects/:projectId/story-drive-link` body `{ folder: <id> }`:
   - Library enabled and `store.resolveProjectPackagePath(projectId)` succeeds, else 404/503 (R1 #4). A project deleted in the same instant can still leave a link entry; that orphan is harmless to other projects except that it holds the folder, and is logged as a known limit, not handled (single-user app).
   - Re-runs discovery and resolves `folder` against it; anything not in the list → 400. The browser can never name an arbitrary path.
   - Project already linked → 409 "already linked" (changing a link stays a terminal job, see Out of scope).
   - Folder already linked to another project → 409.
   - Writes via existing `writeStoryDriveLink(rootPath, projectId, { root })` (lock + atomic write already there). No `beatSheet` field: `locateDecision` auto-discovers the declared beat sheet.
   - Then runs the same canon import Morgan's after-turn hook runs (`import --source wayfinder --project <pkg> --from <root> --apply`, moved from `morganRoutes.ts` into a shared helper both use). Import failure does not undo the link.
   - Returns `{ link: { folderName }, canon: 'imported' | { error: string }, morganOpen: boolean }` (`morganOpen` = a live Morgan session for this project).
3. `POST /api/project-library/projects/:projectId/story-drive-link/import-canon` — reruns only the import for an already-linked project (the Try again button). 409 if not linked.

   The client then calls the existing `POST .../beat-sheet/refresh` and renders its status (updated / no-beat-sheet / ambiguous / malformed / unavailable) through the existing Beat Sheet status line.

The link check for "already linked" and the write happen under the registry lock to avoid two tabs double-linking. (Today `writeStoryDriveLink` reads inside the lock; add a `refuseIfLinked` option or a new `linkStoryDriveFolderOnce` helper that checks both conditions inside the same lock.)

### Consequences of linking

Existing behavior once linked: the Beat Sheet syncs on project open; appeals have a destination; a new Morgan session starts in the Story-drive folder, and after her turns a changed beat sheet re-imports canon. New: linking itself imports canon once (above), because otherwise canon only arrives after a later beat-sheet change (R1 #1). Ben's click on Link, with the stated consequence, is the approval, the same way his instruction to Morgan is the approval for the after-turn import.

## Client

- Server storage adapter (`projectStorage.ts`) gains `listStoryDriveFolders`, `linkStoryDrive`, `importStoryDriveCanon`, sending the session header like the beat-sheet calls. `App.tsx` passes an optional `storyDriveLinking` capability to `OutlineTab` only when the active project is a server-library project (R1 #6).
- `OutlineTab.tsx`: show the button + picker (`StoryDriveLinkPicker`) only when that capability is present **and** `beatSheetStatus?.kind === 'not-linked'`. Reuse existing button styles from the file.
- `isLinked` must flip after linking without a page reload: after the POST succeeds, call the existing beat-sheet refresh handler, which updates status and outline.
- Name match for preselect: lowercase, strip non-alphanumerics, compare WriterOS project title to folder name. Exact normalized match only; otherwise nothing preselected.

## Out of scope (and who owns it)

- Changing or removing a link: stays terminal (`link-source --workflow wayfinder` / `import --relink`), Claude runs it on Ben's ask. Rare; no project has needed it yet.
- Pointing at a Story-drive folder outside My Scripts: terminal, or `WRITEROS_STORY_DRIVE_ROOT`.
- A deletion racing a link (orphan entry): known limit, logged.
- Choosing a specific beat-sheet ticket: auto-discovery already handles it; an ambiguous folder shows the existing ambiguous message.
- Buzz linkage: untouched.
- Grave Affairs' beats: Ben resubmits through Story-drive (separate task). This button is how he then links it.

## Tests

- `tests/server/storyDriveLinks.test.ts`: link-once helper refuses already-linked project and already-taken folder; concurrent calls produce one link.
- New `tests/server/storyDriveFolderRoutes.test.ts`: discovery (valid, hidden, `_`-prefixed, symlinked search-root ancestor, symlinked parent, symlinked `wayfinder`, MAP-only rejected), `linkedTo` marking with registry roots in both `X` and `X/wayfinder` form, unknown project id → 404, canon import runs once on link (stubbed runner) and its failure keeps the link, import-canon retry route, `morganOpen` flag, POST rejects unknown id / path-like id (`../x`, absolute), 409 cases, origin/session guards.
- `tests/components/OutlineTab.test.tsx`: no button without the capability (browser / local-folder) or when status is null; unlinked server project shows button; picker lists folders with preselect; disabled taken folder; Link → POST then refresh; error message shown; linked project shows no button.
- No protected-test edits expected.

## Verify

Full suite, typecheck, build. Then a sandbox run (copy of `~/WriterOS Projects`, `WRITEROS_STORY_DRIVE_ROOT` pointed at a copy of My Scripts): link Grave Affairs from the browser, confirm the registry entry and that the Beat Sheet refreshes. Live registry untouched until Ben deploys.
