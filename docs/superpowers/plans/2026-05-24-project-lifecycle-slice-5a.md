# Slice 5a — Project Lifecycle (Archive + Delete cascade)

**Date:** 2026-05-24
**Status:** Planned, pre-implementation
**Branch context:** `main` after PR #7 (Slice C screenplay indent + casing)
**Owner PRD:** `docs/product/app-home-import-storage-prd.md` (Slice 5 — pulled forward)

## Product Framing

Home should become the primary project-lifecycle surface. A project card carries visible context — title, format, last-updated — before any destructive or organizational action runs. This matters because a project may look empty from Script but still hold synopsis, outline, story bible, treatment, transcripts, metadata, and view preferences inside the same `ProjectState`. Delete and archive must be unambiguously project-scoped, not surface-scoped.

The TopBar three-dot menu remains a convenience for the currently open project, but Home is where lifecycle decisions are made with full context.

## Goals

- A writer can delete an entire project (script + all documents + transcripts + metadata) from a Home card, with explicit confirmation that the whole project container is affected.
- A writer can archive a project (hide from Active list, keep restorable) from a Home card.
- Deletion of a file-backed project removes the on-disk `.writeros` folder; no silent orphan folders.
- A user clearing untitled cruft can do so without leaving Home.

## Non-Goals (V1)

- Multi-select / batch operations.
- Undo grace window or trash with auto-purge.
- Export-before-delete safety net.
- Rename rework or filesystem-name sanitization (unless existing Rename is broken).
- Concurrent multi-tab editing protection.
- Background migration of legacy localStorage projects (owned by Slice 4).

## Surface Decisions

### Home project cards (Active view)

Actions on each card:

```
Open · Rename · Archive · Delete
```

Card context (minimum, to reduce mistaken deletion of a project with non-script content):

- Project title
- Format badge (Feature / Series) when known
- Updated timestamp

Additional context if cheaply available (do not balloon the slice):

- Script presence and estimated page count
- Synopsis / Outline / Story Bible / Treatment presence indicators (e.g. small dots or labels)

If any of the above require new derivation passes, defer to a follow-up polish slice.

### Home Archive view

Toggle on Home: `Active | Archive (n)`. Archive cards expose:

```
Restore · Delete
```

(no Open, no Archive — already archived).

### TopBar three-dot menu (open project)

```
Save · Rename · Archive · Delete
```

`Save` remains TopBar/current-project only. It is not a Home card action.

### Confirm modals

All confirm modals show the exact project title and explicitly say the entire project container is affected.

Delete:

> Delete "<Project Title>"?
> This removes the script, synopsis, outline, story bible, treatment, and all transcripts for this project.
> For file-backed projects, the `.writeros` folder is removed from disk.
> This cannot be undone.
> [Cancel] [Delete]

Archive:

> Archive "<Project Title>"?
> It will be hidden from your project list but restorable from the Archive view.
> [Cancel] [Archive]

Restore: no confirm modal in V1 (non-destructive).

Standard confirm modal — no type-to-confirm in V1.

## Cascade Contract

Because all writing-surface state lives inside one `ProjectState` object, removing or moving the library entry cascades atomically across:

- script (rawHtml, indices, page metadata)
- synopsis (`documents.synopsis`)
- outline (`documents.outline`)
- story bible (`documents.storyBible`)
- treatment (`documents.treatment`)
- transcripts (`agents.writingPartner` and all specialists)
- view preferences
- metadata (title, format, ids, timestamps)

File-backed projects additionally cascade the `.writeros` folder on disk.

## Storage Decisions

### Library schema (additive)

```ts
interface StoredProject {
  id: string
  state: ProjectState
  archivedAt?: string  // ISO-8601; absent = active
}
```

Active vs Archive partition is derived from `archivedAt` presence. No separate archive store.

### File-backed adapter ops

- `removeProjectFolder(rootHandle, folderName)` — wraps `removeEntry(name, { recursive: true })`; checks/renews permission; returns explicit success/failure result.
- `archiveProjectFolder(rootHandle, folderName)` — ensures `Archive/` subdirectory exists, copies folder into it, removes original. (FSA has no native move.)
- `restoreProjectFolder(rootHandle, folderName)` — inverse of archive.

Archive subfolder is visible at `<WriterOS Projects>/Archive/`.

### `useProjectState.ts` additions

- `deleteProjectById(id)` — extends existing active-only `deleteProject`.
- `archiveProjectById(id)` (5a-2).
- `restoreProjectById(id)` (5a-2).

## Edge Cases

- **Folder already missing on disk:** proceed with library cleanup; treat as success.
- **Permission denied or revoked during disk op:** do not pretend the disk delete happened. Surface an explicit warning/error and abort the library cleanup so the deleted project does not vanish from the library while its folder remains on disk. The writer can retry after re-granting permission. Offering an optional library-only cleanup path (with a toast warning that the folder remains on disk) is a possible future enhancement; it is **not** implemented in 5a-1.
- **Browser-only mode (no folder selected):** delete and archive must still work via localStorage. No disk ops attempted.
- **Active project deleted:** clear active selection, route to Home empty state, do not auto-create a blank project.
- **Library empty after delete:** Home empty state with Create / Import CTAs.
- **Concurrent multi-tab editing:** out of scope; existing behavior.

## Implementation Order

Two PRs, sequential.

### PR 5a-1 — Delete Cascade

Branch: `slice-5a-1-project-delete`

Scope:

- Home project card with Open + Delete inline (and Rename if it reuses existing behavior cleanly — no expansion).
- Delete-by-id wiring in `useProjectState.ts` (not active-only).
- Confirm modal with exact title + cascade copy.
- File-backed `removeProjectFolder` adapter op with permission handling and explicit failure surface.
- Active-project delete clears selection and routes Home empty state.
- Library empty → Home empty state with Create / Import CTAs (fix current behavior that auto-creates a blank project).
- PRD note appended to `app-home-import-storage-prd.md` Slice 5 noting 5a pull-forward.

Out of scope for 5a-1:

- Archive schema, UI, or adapter ops.
- Archive view toggle.
- Rename refactor.
- Card substance indicators beyond title/format/updated.

### PR 5a-2 — Archive

Branch: `slice-5a-2-project-archive`

Scope:

- `archivedAt` added to `StoredProject`.
- `archiveProjectById` / `restoreProjectById` in `useProjectState.ts`.
- Home `Active | Archive` toggle.
- Archive view cards (Restore + Delete).
- File-backed `archiveProjectFolder` / `restoreProjectFolder` adapter ops.
- Archive subfolder created lazily under `<WriterOS Projects>/Archive/`.
- Confirm modal for Archive with exact title.

## Tests

### PR 5a-1

- `projectLibrary.test.ts`:
  - `deleteProjectFromLibrary` cascades and removes library entry.
  - Empty library after delete returns the empty-state sentinel (NOT a fresh blank project).
- `useProjectState.test.ts`:
  - `deleteProjectById` works for non-active project.
  - Deleting the active project clears `activeProjectId` and resets state to empty.
- `HomeSurface.test.tsx`:
  - Each project card renders Open + Delete (+ Rename if included).
  - Delete click opens confirm modal with the exact project title.
  - Confirm calls `deleteProjectById` for the right id.
  - Cancel does not delete.
  - After deleting last project, empty state with Create / Import CTAs renders.
- File-backed adapter tests:
  - `removeProjectFolder` happy path.
  - `removeProjectFolder` permission-denied path surfaces error, leaves disk untouched.
  - `removeProjectFolder` folder-missing path returns success.

### PR 5a-2

- `projectLibrary.test.ts`: archive sets `archivedAt`, restore clears, archive partition derives correctly.
- `useProjectState.test.ts`: archive/restore state transitions; archive of active project closes it.
- `HomeSurface.test.tsx`: Active/Archive toggle filters cards; Restore + Delete render in Archive view.
- File-backed adapter tests: `archiveProjectFolder` move semantics; `restoreProjectFolder` inverse; failed copy leaves source intact.

## Acceptance Criteria

### PR 5a-1

- A writer sees a Delete button on each Home project card, inline near Open.
- Clicking Delete opens a confirm modal showing the project title and explicit cascade copy.
- Confirming Delete removes the entire `ProjectState` for that project (script + all documents + transcripts + metadata).
- For file-backed projects, the `.writeros` folder is removed from disk on confirm; permission failures surface explicit errors.
- Deleting the active project returns the writer to Home with no project selected.
- Deleting the last project leaves Home empty with Create / Import CTAs — no auto-blank project.
- Browser-only mode (no external folder) still supports delete.

### PR 5a-2

- A writer sees an Archive button on each Home active-project card and on the TopBar menu for the open project.
- Archive moves a project to the Archive view; it disappears from the Active list.
- Archive view renders Restore + Delete on each card.
- Restore returns the project to the Active list.
- File-backed: archived project's `.writeros` folder is moved under `<WriterOS Projects>/Archive/`; restore moves it back.

## PRD Update

Append a note to `docs/product/app-home-import-storage-prd.md` Slice 5 ("Storage Polish") stating that Archive + Delete were pulled forward into Slice 5a (Project Lifecycle) due to acute need for whole-project cleanup, and that the remaining Slice 5 items (Reveal in Finder, Duplicate, Export complete project package, backup/restore docs) remain in Slice 5.

## Open Questions (deferred, not blocking)

1. Should Card substance indicators (synopsis/outline/story bible/treatment presence) ship in 5a-1 or be a polish follow-up?
2. Should the Archive subfolder be created eagerly when the Projects folder is selected, or lazily on first archive? (Plan assumes lazy.)
3. Should there be a "deleted projects" recovery view (sourced from a short-lived trash) before V2? (Out of scope.)
