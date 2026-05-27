# App Home, Screenplay Import, And Storage PRD

**Date:** 2026-05-22
**Last updated:** 2026-05-26 — Slice 4 merged; Slice 5 Show in Folder + Duplicate shipped; remaining storage work is export, backup/restore docs, and optional native-shell polish.
**Status:** Canonical for WriterOS app-shell foundation work not owned by a writing-surface PRD
**Branch context:** `main`
**Related docs:** `docs/product/README.md`, `docs/product/writeros-future-work-prd.md`, `docs/product/project-identity-script-context-prd.md`, `docs/product/structured-writing-surfaces-prd.md`

## Purpose

The existing product docs describe writing surfaces, agent context, and future storage concerns, but they do not give a single clear path for the app foundation a shipped WriterOS needs.

This PRD owns three must-have areas:

1. A Home surface with a project folder viewer.
2. Screenplay import, especially Final Draft `.fdx` files.
3. Durable external project storage for a shipped app.

Surface PRDs continue to own Synopsis, Outline, Treatment, Story Bible, and Script behavior after a project is open. This PRD owns how a writer gets into a project, where projects live, and how outside screenplay files enter WriterOS safely.

This is not a general future-work bucket. If a task does not directly serve Home, project storage, localStorage migration, or screenplay import/open behavior, it belongs in a different PRD.

## Current State

Current `main` has:

- A functional Home surface backed by the current browser-local project library.
- A tested `.writeros` package serialization/read contract with a File System Access adapter seam.
- A Home project-folder controller that can select, remember, and rescan a File System Access API folder.
- Home package discovery for ready and corrupt `.writeros` project folders.
- Home open/load wiring for ready `.writeros` project folders discovered through the selected external folder.
- File-backed save wiring for active folder projects, with browser-local storage retained as a cache/fallback.
- New projects created while an external folder is connected are written to the selected project folder.
- Home project search/sort, current-project open, project open, and new-project actions.
- Explicit Home storage status showing browser fallback, disconnected external folder, connected folder, permission-needed, and error states.
- A TopBar project switcher and project actions.
- Local project create/switch/save/rename/delete behavior.
- Auto-save through browser `localStorage`, retained only as a preview fallback / migration source.
- A Script editor that stores screenplay HTML in `ProjectState.script.rawHtml`.
- Script indexing, estimated page ranges, scene context, selected/focused text context, and agent retrieval.
- Functional Final Draft `.fdx` import via Home (new project) and Script (new project or explicit replace), with the original `.fdx` copied into the project package when file-backed storage is active.
- External-storage migration from `localStorage` into the selected project library folder, with active-project preservation and explicit writer confirmation (Slice 4).
- Project rename that retitles the on-disk `.writeros` package to match the new title.
- Home project-row actions: Open, Rename, Archive, Restore, Delete, Show in Folder, and Duplicate, with confirm modals where destructive.
- Active / Archive Home view toggle backed by an `Archive/` subfolder inside the selected library folder for file-backed projects.
- Binary-safe project duplication that copies arbitrary package contents (including non-text assets) byte-for-byte.

Current `main` does not have:

- Import from Fountain, PDF, DOCX, or other screenplay formats beyond `.fdx`.
- Export of a complete WriterOS project package (e.g. zip/share archive).
- Writer-facing backup/restore documentation.
- A native shell that presents `.writeros` as a single OS-level package rather than a directory.

## Product Decisions

WriterOS should become a local-first project app before it becomes a cloud app.

The shipped-app storage model should be:

- A user-selected project library folder, named however the writer wants.
- One `.writeros` folder/package per project.
- Project data stored inside that package as ordinary files that can be backed up, moved, and recovered.
- `localStorage` retained only as a browser-preview fallback and migration source.

WriterOS should not prescribe or foreground a default folder name. The writer can choose a folder such as `~/Ben's Projects`, `~/Studio Work`, or any other location that makes sense for their project library. The folder should not default to the repo directory.

Additional decisions:

- Home is a full first app route/surface, not a marketing page and not only a TopBar modal.
- Imported `.fdx` source files are copied into the project package by default when file-backed storage is active.
- localStorage migration requires explicit writer confirmation after a storage folder is selected.
- Home and Script both support import-as-new-project. The Script surface also owns explicit import/replace once a project is open.

Cloud sync, account storage, and collaboration are separate future decisions. The V1 shipped-app path is local-first, user-owned project folders.

## User-Facing Storage Model

The writer-facing mental model must stay simple:

```text
WriterOS Projects/
  My Movie.writeros
  Pilot Draft.writeros
  Archive/
```

The selected folder is a **project library**, not a single project. It is the place where WriterOS stores and discovers projects.

Each `.writeros` item is one project. A writer should be able to recognize, back up, move, archive, restore, and open projects by project name without understanding the internal storage layout.

The internal package contents are implementation details:

```text
My Movie.writeros/
  project.json
  script/
  documents/
  transcripts/
  assets/
```

Those internals exist so WriterOS can keep script text, structured documents, transcripts, imported sources, references, and future assets reliable and recoverable. They should not become the ordinary writer-facing UX.

Shipped-app expectations:

- Finder / file-browser presentation should make a `.writeros` project feel like one project file/package, not a loose folder the writer is expected to manage manually.
- Home should show one row/card per project, using package metadata and project title.
- Rename, archive, delete, duplicate, reveal, export, and restore should operate on the project package as a single unit.
- Project package internals may remain accessible for advanced recovery or support workflows, but WriterOS should not require normal users to inspect `project.json`, `documents/`, `script/`, or `transcripts/`.
- The app may maintain a recent-projects or package-index cache for speed, but the selected folder and `.writeros` packages must remain recoverable by scanning the filesystem.
- Browser/localStorage language should disappear from the normal shipped-app mental model. In the browser build, localStorage is a preview fallback and migration source only.
- Any future workspace-level `vault/` or project-level reference-file area must be presented as deliberate writer-owned reference storage, not as arbitrary package internals.

Current browser-build caveat:

The File System Access API exposes `.writeros` packages as ordinary directories in the selected folder. That is acceptable for the browser implementation slice, but it is not the desired end-state UX. The product target is an app-managed package/file experience where writers see projects by name and WriterOS manages the package contents safely.

## Home Surface

Home is the first app surface before a project is open and the return point from an open project.

Home must not be a marketing page. It is an operational project launcher.

Required Home jobs:

- Show the selected project library folder.
- Show projects discovered in that folder.
- Show recent projects.
- Open an existing project.
- Create a new project.
- Import a screenplay file as a new project.
- Surface recovery/migration from existing localStorage projects when present.
- Make storage status obvious: local browser storage, external folder selected, missing folder, or folder permission needed.

Useful Home elements:

- Project list or folder viewer.
- Search/filter by project title.
- Sort by last opened or modified.
- Format badge when known: Feature or Series.
- Last modified/opened timestamp.
- Warnings for missing/corrupt project files.
- Actions for rename, duplicate, archive/delete, and reveal in Finder once file storage exists.

Out of scope for the first Home slice:

- Marketing hero page.
- Team collaboration.
- Cloud account sign-in.
- Template marketplace.
- Full dashboard analytics.
- Visual redesign of every writing surface.

## Project Folder Format

Each WriterOS project is stored as a `.writeros` folder/package. The implementation can still refine exact JSON fields, but the product-level package contract is fixed here:

- A project package is the durable source of truth.
- The package should be treated as one project in all writer-facing UX.
- Each project has one manifest file.
- Script, structured documents, transcripts, and metadata are stored separately enough to avoid one giant fragile blob.
- Derived indexes and retrieval packs are rebuildable and should not be canonical.

Recommended shape:

```text
My Project.writeros/
  project.json
  script/
    script.writeros.html
    imported-source.fdx
  documents/
    synopsis.json
    outline.json
    treatment.json
    story-bible.json
  transcripts/
    writing-partner.json
    specialists.json
  exports/
  assets/
```

`project.json` should include:

- schema version
- project id
- title
- format
- created/updated/opened timestamps
- source import metadata
- app version that last saved the project

Implementation may refine the internal layout, but it must preserve these product properties:

- one writer-facing project package per project
- human-ownable files
- safe backup/move behavior
- no silent dependence on browser storage
- clear migration path from localStorage
- clean handling when project files are missing or corrupted
- no normal-user requirement to inspect or manipulate internal package files

## Final Draft Import

Final Draft import is a must-have for the Script surface.

WriterOS must recognize `.fdx` files and import them into the screenplay editor without formatting damage to normal screenplay structure.

Required behavior:

- Accept `.fdx` through Home import.
- Accept `.fdx` from the Script surface as an import-as-new-project action.
- Accept `.fdx` from the Script surface as an explicit replace action.
- Recognize `.fdx` by file extension and validate that the file parses as Final Draft XML.
- Parse Final Draft XML rather than treating it as plain text.
- Convert Final Draft paragraph types into WriterOS screenplay element types.
- Preserve screenplay text order.
- Preserve standard screenplay block identity:
  - Scene Heading
  - Action
  - Character
  - Dialogue
  - Parenthetical
  - Transition
- Preserve blank-line intent where it affects readability.
- Preserve title when available.
- Store import source metadata.
- Keep the original `.fdx` file in the project folder when external storage is active.
- Create a new project from import unless the writer explicitly chooses to replace the current script.
- Require confirmation before replacing an existing script.
- Never partially overwrite the current project after a failed import.

Minimum parser expectations:

- Handles Final Draft XML entities and unicode text.
- Handles multiple `<Text>` nodes inside a paragraph.
- Handles empty paragraphs safely.
- Handles unknown paragraph types with a deterministic fallback.
- Reports clear errors for malformed XML or unsupported files.

V1 fallback mapping:

| Final Draft paragraph type | WriterOS element |
| --- | --- |
| Scene Heading | Scene Heading |
| Action | Action |
| Character | Character |
| Dialogue | Dialogue |
| Parenthetical | Parenthetical |
| Transition | Transition |
| Shot | Action |
| General | Action |
| unknown | Action |

Out of scope for first `.fdx` import:

- Perfect preservation of every Final Draft style run.
- Dual-dialogue layout fidelity.
- Revisions, locked pages, scene numbers, notes, bookmarks, title-page artwork, and production metadata.
- Import from old binary `.fdr`.
- Export back to `.fdx`.

Those may become later import/export slices, but the first requirement is that normal screenplay pages open in the editor with correct block structure and readable formatting.

## Other Screenplay Import Formats

`.fdx` remains the first required screenplay import format. Other formats should not be implemented ahead of `.fdx` unless this PRD is explicitly revised.

After `.fdx`, import priority is:

1. Fountain (`.fountain`)
   - Open, plain-text screenplay markup.
   - Best next import candidate because scene headings, action, character cues, dialogue, parentheticals, transitions, and notes can be parsed with relatively low ambiguity.
2. Plain text (`.txt`)
   - Useful for rough screenplay import when no structured source exists.
   - Must be clearly presented as heuristic/best-effort because block detection can be wrong.
3. Rich Text (`.rtf`)
   - Common screenwriting-app export format.
   - Better than PDF for text extraction, but style runs and screenplay block identity may still be inconsistent.
4. Word documents (`.docx`)
   - Useful because scripts are often exchanged as Word files.
   - Must be treated as best-effort unless the document contains recognizable screenplay styling.
5. PDF (`.pdf`)
   - Common delivery format, but poor editable-source format.
   - Should come later and include strong UX warnings about fidelity limits, especially around pagination, line breaks, dialogue blocks, headers, and OCR/scanned pages.
6. Final Draft templates (`.fdxt`)
   - Related to Final Draft, but should wait until WriterOS has a template workflow.
7. Native proprietary app formats
   - Fade In, Celtx, Movie Magic Screenwriter, WriterDuet/WriterSolo, and similar native project files should not be first-class import targets unless their format is stable, documented, and demanded by real usage.
   - Prefer importing those apps through their `.fdx`, `.fountain`, `.rtf`, `.txt`, or `.pdf` exports.

The first non-`.fdx` implementation slice should be `.fountain`, not PDF. PDF import is valuable for recovery and reference, but it should not define WriterOS screenplay import architecture.

## Storage And Import Migration

The first external-storage implementation must include a migration path:

- Detect existing localStorage projects.
- Offer to migrate them into the selected folder after explicit confirmation.
- Preserve project ids where safe.
- Preserve active project selection.
- Preserve project title, format, script, structured documents, transcripts, and view preferences.
- Leave localStorage untouched until migration succeeds.
- After migration, mark migrated projects so the user is not repeatedly prompted.

Failure behavior:

- Failed writes must not corrupt existing project folders.
- Failed imports must leave the current project untouched.
- Missing project folders should produce a recoverable folder-selection state, not a blank reset.

## Agent Context Requirements

Storage and import must not weaken existing agent behavior.

After opening or importing a project:

- Script index and scene retrieval rebuild from imported/opened script content.
- Writing Partner receives project title and format.
- Script context packs retain page/scene/focus behavior.
- Structured documents remain canonical under `ProjectState.documents`.
- Imported `.fdx` screenplay content is treated like authored script content after conversion.

Agents should not read from the original `.fdx` directly. They should read from WriterOS canonical script/editor state after import.

## Clear Path Ahead

The next implementation track should be this PRD, not more Treatment polish or another open-ended future-work sweep.

Build order:

1. Lock the `.writeros` project package reader/writer and user-chosen folder behavior.
2. Add Home as the app entry surface with project folder selection, project list, recent projects, create/open, and migration visibility.
3. Add `.fdx` parser/import support and wire it first to import-as-new-project from Home.
4. Add Script import-as-new-project and explicit replace with confirmation and no partial overwrite on failure.
5. Migrate existing localStorage projects into `.writeros` packages once file-backed storage is stable.

This sequence gives WriterOS a shippable app foundation before expanding more writing-surface polish.

## Implementation Slices

### Slice 1: Project Folder Contract

**Status:** Package contract and File System Access adapter seam implemented. Home still uses the browser-local project library until Slice 2 wiring.

- Implement `.writeros` project package folder behavior.
- Define manifest and file layout.
- Add read/write adapter interfaces.
- Keep current localStorage path working.
- Add tests for project package serialization and corruption handling.

### Slice 2: Home Surface

**Status:** Home, folder selection, persisted folder handle support, `.writeros` package discovery, file-backed open/load, external-folder new-project creation, and active file-backed save wiring are implemented. localStorage migration visibility is still pending.

- Add Home route/shell state as the first surface before opening a project.
- Show project folder selection/status.
- Show project list from the selected folder.
- Support new/open/recent project flows.
- Show localStorage migration prompt when applicable.

### Slice 3: Final Draft Import

**Status:** Implemented on the Final Draft import slice branch. The parser converts `.fdx` screenplay paragraphs into Script HTML/state, Home and Script import create a new project, explicit Script replace requires confirmation, import source metadata is stored, and file-backed packages copy the original `.fdx` source when available.

- Add `.fdx` parser with fixtures.
- Convert parsed screenplay paragraphs into Script editor HTML/state.
- Add Home import flow that creates a new project.
- Add Script import-as-new-project and explicit replace flow with confirmation.
- Verify imported script indexing, scene extraction, and dialogue context.

### Slice 4: External Storage Migration

**Status:** Shipped in PR #11. localStorage projects can be migrated into the selected project folder with explicit writer confirmation; active project selection is preserved; folder-permission recovery is wired into Home storage status.

- Migrate localStorage project library into project folders.
- Preserve active project.
- Add recovery behavior for missing folder permissions.
- Confirm localStorage fallback still works in browser-preview mode.

### Slice 5: Storage Polish

- Reveal project in Finder. *(Shipped as "Show in Folder" in PR #13.)*
- Duplicate project folder. *(Shipped in PR #13; uses `arrayBuffer()` round-trip so binary package contents are preserved byte-for-byte.)*
- Rename project package on disk to match the new title. *(Shipped in PR #12.)*
- Archive/Restore project folder. *(Shipped via Slice 5a-2; see below.)*
- Delete project folder with full `ProjectState` cascade. *(Shipped via Slice 5a-1; see below.)*
- Export complete project package. *(Remaining; not started.)*
- Add backup/restore documentation. *(Remaining; not started.)*

**Status:** Slice 5 is functionally complete for in-app package management. The only remaining storage work in this PRD is (a) an export-complete-project flow, (b) writer-facing backup/restore documentation, and (c) optional native-shell polish so `.writeros` reads as a single OS-level package rather than a directory. Archive + Delete were pulled forward into Slice 5a (Project Lifecycle) ahead of Slice 4 due to acute need for whole-project cleanup. See `docs/superpowers/plans/2026-05-24-project-lifecycle-slice-5a.md`.

### Slice 5a: Project Lifecycle (Archive + Delete cascade)

**Status:** Slice 5a-1 (Delete cascade) shipped in PR #8. Slice 5a-2 (Archive + Restore with Active/Archive Home view) shipped in PR #9.

- Home project cards expose project-scoped actions (Open, Rename, Archive, Delete) with confirm modals that auto-populate the project title.
- Delete cascades the entire `ProjectState` (script + synopsis + outline + story bible + treatment + transcripts + metadata + view prefs) and removes the on-disk `.writeros` folder when file-backed.
- Permission denial on disk delete surfaces an explicit warning and aborts cleanup; folder-already-missing proceeds with library cleanup.
- Empty library after delete returns the writer to Home with explicit Create / Import CTAs (no silent auto-creation of a blank project).
- Archive (5a-2) ships after Delete (5a-1) with a Home `Active | Archive` toggle and a visible `Archive/` subfolder inside the selected folder for file-backed projects.

## Acceptance Criteria

- A writer can launch WriterOS into Home without an already-open project.
- A writer can choose a folder for their project library.
- A writer can see and open projects from that folder.
- A writer can create a new project from Home.
- A writer can import a `.fdx` file from Home and land in Script with correct screenplay block formatting.
- A writer can import a `.fdx` file from Script and see it reflected as a new project.
- A writer can replace the current Script from a `.fdx` file only after confirmation.
- Malformed or unsupported imports fail without altering the current project.
- Existing localStorage projects can be migrated to external project folders.
- Agent script context still works after opening or importing a project.
- The shipped app does not depend on browser localStorage as the primary storage path.

## Test Plan

Required tests:

- Project package manifest parse/write.
- Project package missing/corrupt file handling.
- localStorage-to-folder migration.
- `.fdx` parser fixture for standard screenplay pages.
- `.fdx` parser fixture for unknown paragraph types.
- `.fdx` parser fixture for XML entities/unicode.
- `.fdx` import creates a project.
- Script import creates a project.
- Script replace requires confirmation.
- Failed import does not mutate existing script.
- Imported script feeds scene index and agent context.

Manual QA:

- Import a real Final Draft `.fdx` screenplay.
- Check scene headings, action, character cues, dialogue, parentheticals, and transitions in the editor.
- Save, close, reopen from project folder.
- Confirm the same project appears in Home recents.
- Confirm agent questions about scene/page/dialogue work after import.

## Non-Goals

- Cloud sync.
- Collaboration.
- Account system.
- Mobile file-provider integration.
- PDF screenplay import.
- `.fdx` export.
- Print-perfect pagination.
- Full design system redesign.

## Open Questions

These should not block Slice 1 implementation:

1. Should the shipped app register `.writeros` with the operating system as a package/document type, or treat it as a normal folder in V1?
2. Should Final Draft template files (`.fdxt`) be accepted by the same parser later, or left out until template workflows exist?
3. Should localStorage migration allow per-project deselection in V1, or migrate all detected projects after confirmation?
