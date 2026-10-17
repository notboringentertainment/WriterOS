# Link to Story-drive button

Date: 2026-10-16. Branch: `build/link-story-drive`. Claude builds, Codex reviews (same split as Phase 3).

## Problem

A WriterOS project gets its Beat Sheet, appeals and Morgan's canon import from a linked Story-drive folder. Linking is terminal-only today (`project-memory link-source --workflow wayfinder --from <abs path>`, audit F13). Since PR #89 the Beat Sheet shows Story-drive beats only, so an unlinked project shows an empty Beat Sheet with no way forward inside the app. Live today: only Bloodless is linked; Grave Affairs, Yes Chef and the rest are not.

## What Ben sees

On the Beat Sheet of an unlinked project, under the existing message "No beat sheet yet. Beats come from this project's Story-drive beat sheet once the project is linked.", a **Link to Story-drive** button.

Clicking it opens an inline picker (no modal) listing the Story-drive projects WriterOS found, with the one whose folder name matches the project name already selected. One more click (**Link**) writes the link and refreshes the Beat Sheet, so beats appear immediately if the beat sheet is ratified. Cancel closes the picker.

- Folders already linked to another WriterOS project are listed but disabled, with "linked to <project name>".
- If nothing is found, the picker says where it looked, in plain words.
- Errors show inline in plain language; no stack text.

Ben's steps: two clicks. No path typing.

## Server

### Where Story-drive projects are found

`storyDriveSearchRoot` = env `WRITEROS_STORY_DRIVE_ROOT` if set, else `~/Library/Mobile Documents/com~apple~CloudDocs/My Scripts` (the same folder `server/morganHost/launchArgs.ts` already treats as a read root).

A candidate is a direct, non-hidden child directory `X` of the search root where `X/wayfinder` is a real directory (not a symlink) containing `MAP.md` or a `tickets/` directory. Symlinks at either level are skipped. Names starting with `.` or `_` are skipped. No recursion beyond that.

The link root written is `X/wayfinder` (canonical path), matching the existing Bloodless entry and what Morgan's canon import (`import --source wayfinder --from <root>`) is given today.

### Routes (both behind `sameOrigin` + `authenticated`, like the beat-sheet routes)

1. `GET /api/project-library/story-drive/folders` → `{ searchRoot, folders: [{ id, name, linkedTo: { projectId, title } | null }] }`. `id` is an opaque value (the folder name), never a path supplied back by the browser.
2. `POST /api/project-library/projects/:projectId/story-drive-link` body `{ folder: <id> }`:
   - Re-runs discovery and resolves `folder` against it; anything not in the list → 400. The browser can never name an arbitrary path.
   - Project already linked → 409 "already linked" (changing a link stays a terminal job, see Out of scope).
   - Folder already linked to another project → 409.
   - Writes via existing `writeStoryDriveLink(rootPath, projectId, { root })` (lock + atomic write already there). No `beatSheet` field: `locateDecision` auto-discovers the declared beat sheet.
   - Returns `{ link: { folderName } }`. The client then calls the existing `POST .../beat-sheet/refresh` and renders its status (updated / no-beat-sheet / ambiguous / malformed / unavailable) through the existing Beat Sheet status line.

The link check for "already linked" and the write happen under the registry lock to avoid two tabs double-linking. (Today `writeStoryDriveLink` reads inside the lock; add a `refuseIfLinked` option or a new `linkStoryDriveFolderOnce` helper that checks both conditions inside the same lock.)

### Consequences of linking (existing behavior, not new)

Once linked: the Beat Sheet syncs on project open; appeals have a destination; Morgan's session starts in the Story-drive folder and imports Story-drive canon on open (`morganRoutes.ts:206`). The button makes these reachable without a terminal; it does not change them.

## Client

- `OutlineTab.tsx`: in the `!isLinked` branch add the button + picker component (`StoryDriveLinkPicker`). Reuse existing button styles from the file.
- `isLinked` must flip after linking without a page reload: after the POST succeeds, call the existing beat-sheet refresh handler, which updates status and outline.
- Name match for preselect: lowercase, strip non-alphanumerics, compare WriterOS project title to folder name. Exact normalized match only; otherwise nothing preselected.

## Out of scope (and who owns it)

- Changing or removing a link: stays terminal (`link-source --workflow wayfinder` / `import --relink`), Claude runs it on Ben's ask. Rare; no project has needed it yet.
- Pointing at a Story-drive folder outside My Scripts: terminal, or `WRITEROS_STORY_DRIVE_ROOT`.
- Choosing a specific beat-sheet ticket: auto-discovery already handles it; an ambiguous folder shows the existing ambiguous message.
- Buzz linkage: untouched.
- Grave Affairs' beats: Ben resubmits through Story-drive (separate task). This button is how he then links it.

## Tests

- `tests/server/storyDriveLinks.test.ts`: link-once helper refuses already-linked project and already-taken folder; concurrent calls produce one link.
- New `tests/server/storyDriveFolderRoutes.test.ts`: discovery (valid, hidden, `_`-prefixed, symlinked parent, symlinked `wayfinder`, missing MAP/tickets), `linkedTo` marking, POST rejects unknown id / path-like id (`../x`, absolute), 409 cases, origin/session guards.
- `tests/components/OutlineTab.test.tsx`: unlinked shows button; picker lists folders with preselect; disabled taken folder; Link → POST then refresh; error message shown; linked project shows no button.
- No protected-test edits expected.

## Verify

Full suite, typecheck, build. Then a sandbox run (copy of `~/WriterOS Projects`, `WRITEROS_STORY_DRIVE_ROOT` pointed at a copy of My Scripts): link Grave Affairs from the browser, confirm the registry entry and that the Beat Sheet refreshes. Live registry untouched until Ben deploys.
