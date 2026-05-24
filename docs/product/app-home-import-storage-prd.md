# App Home, Screenplay Import, And Storage PRD

**Date:** 2026-05-22
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
- Auto-save through browser `localStorage`.
- A Script editor that stores screenplay HTML in `ProjectState.script.rawHtml`.
- Script indexing, estimated page ranges, scene context, selected/focused text context, and agent retrieval.

Current `main` does not have:

- A fully primary external-storage mode after app reload without reopening/selecting the external package.
- Functional import from Final Draft `.fdx`.
- Import from Fountain, PDF, DOCX, or other screenplay formats.
- Export/import of complete WriterOS projects.
- A migration path from localStorage projects to external project folders.

## Product Decisions

WriterOS should become a local-first project app before it becomes a cloud app.

The shipped-app storage model should be:

- A user-selected **WriterOS Projects** folder.
- One `.writeros` folder/package per project.
- Project data stored as ordinary files that can be backed up, moved, and inspected.
- `localStorage` retained only as a browser-preview fallback and migration source.

Default suggested folder:

```text
~/WriterOS Projects
```

The app may suggest this path, but the writer must be able to choose another folder. The folder should not default to the repo directory or to an iCloud-synced Desktop path.

Additional decisions:

- Home is a full first app route/surface, not a marketing page and not only a TopBar modal.
- Imported `.fdx` source files are copied into the project package by default when file-backed storage is active.
- localStorage migration requires explicit writer confirmation after a storage folder is selected.
- The Script surface owns import/replace once a project is open; Home owns import-as-new-project.

Cloud sync, account storage, and collaboration are separate future decisions. The V1 shipped-app path is local-first, user-owned project folders.

## Home Surface

Home is the first app surface before a project is open and the return point from an open project.

Home must not be a marketing page. It is an operational project launcher.

Required Home jobs:

- Show the selected WriterOS Projects folder.
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

- A project folder is the durable source of truth.
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

- human-ownable files
- safe backup/move behavior
- no silent dependence on browser storage
- clear migration path from localStorage
- clean handling when project files are missing or corrupted

## Final Draft Import

Final Draft import is a must-have for the Script surface.

WriterOS must recognize `.fdx` files and import them into the screenplay editor without formatting damage to normal screenplay structure.

Required behavior:

- Accept `.fdx` through Home import.
- Accept `.fdx` from the Script surface as an import/replace action.
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
- Offer to migrate them into the selected WriterOS Projects folder after explicit confirmation.
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

1. Lock the `.writeros` project package reader/writer and default `~/WriterOS Projects` folder behavior.
2. Add Home as the app entry surface with project folder selection, project list, recent projects, create/open, and migration visibility.
3. Add `.fdx` parser/import support and wire it first to import-as-new-project from Home.
4. Add Script import/replace with confirmation and no partial overwrite on failure.
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

- Add `.fdx` parser with fixtures.
- Convert parsed screenplay paragraphs into Script editor HTML/state.
- Add Home import flow that creates a new project.
- Add Script import/replace flow with confirmation.
- Verify imported script indexing, scene extraction, and dialogue context.

### Slice 4: External Storage Migration

- Migrate localStorage project library into project folders.
- Preserve active project.
- Add recovery behavior for missing folder permissions.
- Confirm localStorage fallback still works in browser-preview mode.

### Slice 5: Storage Polish

- Reveal project in Finder.
- Duplicate/archive/delete project folders.
- Export complete project package.
- Add backup/restore documentation.

## Acceptance Criteria

- A writer can launch WriterOS into Home without an already-open project.
- A writer can choose a WriterOS Projects folder.
- A writer can see and open projects from that folder.
- A writer can create a new project from Home.
- A writer can import a `.fdx` file from Home and land in Script with correct screenplay block formatting.
- A writer can import/replace a `.fdx` file from Script only after confirmation.
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
- Script import/replace requires confirmation.
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
