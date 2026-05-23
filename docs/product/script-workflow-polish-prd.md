# Script Workflow Polish PRD

**Date:** 2026-05-23
**Status:** Approved next PRD scope; implementation waits until app foundation path is complete
**Branch context:** `main`
**Depends on:** `docs/product/app-home-import-storage-prd.md`
**Related docs:** `docs/product/project-identity-script-context-prd.md`, `docs/product/writeros-future-work-prd.md`

## Purpose

This PRD captures the next script-editor product layer approved after reviewing StudioBinder-style workflow ideas.

It is intentionally narrow. WriterOS should finish the current app foundation path first:

1. `.writeros` project package storage.
2. Home project folder viewer backed by real external project folders.
3. Final Draft `.fdx` import into the script editor.
4. localStorage migration into file-backed projects.

After that foundation is stable, the next script workflow slice should improve writer flow without turning the product into a production-management suite.

## Approved Scope

This PRD owns four features:

1. Script scratchpad sidebar.
2. Script locking/status flag.
3. Title page generator.
4. Character/location autocomplete.

These features are approved for the next script workflow PRD, not for immediate implementation ahead of app foundation.

## Current State

Current `main` has:

- A functional Script surface built on TipTap.
- Screenplay element types: scene heading, action, character, dialogue, parenthetical, transition.
- Basic screenplay formatting through CSS margins and Courier-style page layout.
- Keyboard flow for Tab, Shift-Tab, Enter, and Backspace element transitions.
- Scene extraction and script indexing for agent context.
- Home V0, still backed by browser-local project storage.

Current `main` does not have:

- Character or location autocomplete.
- Script scratchpad/sidebar notes.
- Script lock/readiness state.
- Title page metadata or export generation.
- File-backed project storage.
- Functional `.fdx` import.

## Product Principle

Function comes before form.

The Script surface should host the necessary writing workflow cleanly. Visual design can become more editorial later, but these features should first be implemented as direct, reliable controls that keep a writer in the script.

## Feature 1: Script Scratchpad Sidebar

The scratchpad is a persistent script-adjacent note surface.

It should let writers keep working notes beside the screenplay without leaving the Script tab.

V1 behavior:

- Opens as a right-side sidebar or docked panel from the Script surface.
- Persists per project.
- Supports plain rich text notes.
- Supports checkboxes for beat/task tracking.
- Supports simple bullet lists.
- Can optionally pin a note to the current scene.
- Does not alter screenplay content.
- Does not get sent to agents unless a later context rule explicitly includes it.

Out of scope for V1:

- Image embeds.
- Video embeds.
- Notion-style arbitrary block database.
- Collaboration comments.
- Project-wide asset management.

Reasoning:

The StudioBinder-style scratchpad is useful, but WriterOS should start with a durable writing aid, not a media-heavy sidebar. Image/video references should wait until `.writeros` storage has an asset model.

## Feature 2: Script Locking And Status

Script locking gives the project a clear readiness state.

V1 should not attempt full production draft locking. It should add a conservative status flag that can later feed breakdown, export, and version workflows.

Recommended states:

```text
draft
locked
ready_for_breakdown
```

V1 behavior:

- Writer can mark the script as locked.
- Writer can mark the script as ready for breakdown.
- Locking requires confirmation.
- Locked status is visible in Script and Home project metadata.
- Locked status does not prevent editing in V1 unless a later PRD explicitly adds hard edit protection.
- Agents may receive the status as project metadata.

Out of scope for V1:

- WGA revision colors.
- Locked pages.
- Production scene numbering.
- Multi-user approval workflow.
- Breakdown sheet generation.

Reasoning:

The useful near-term product idea is not production bureaucracy. It is a clear signal that the writer considers this draft stable enough for the next workflow.

## Feature 3: Title Page Generator

WriterOS should collect title page metadata before full PDF export exists, then use it when export arrives.

V1 metadata:

- project title
- writer name
- contact block
- draft label
- date
- WGA registration number, optional

V1 behavior:

- Title page fields live with the project.
- The Script surface exposes a simple title page settings panel or modal.
- Metadata can be previewed as a clean read-only title page.
- When PDF export exists, this metadata becomes the first page of exported scripts.

Out of scope for V1:

- Full PDF export engine if it does not already exist.
- Watermarks.
- Distribution tracking.
- Multiple title page templates.

Reasoning:

Title pages are low-complexity, high-legibility. They also make future PDF/export work easier because the metadata contract is decided early.

## Feature 4: Character And Location Autocomplete

Autocomplete should keep writers in flow while typing the script.

V1 character sources:

- Character cues already typed in the script.
- Story Bible character names when present.

V1 location sources:

- Scene headings already typed in the script.
- Previously used location segments from headings.

V1 behavior:

- Character autocomplete appears while typing character cues.
- Location autocomplete appears while typing scene headings.
- Suggestions are local and deterministic.
- Writer can ignore suggestions without UI friction.
- Selecting a suggestion preserves screenplay casing rules.
- No network or AI call is required.

Out of scope for V1:

- AI-generated character names or locations.
- Cross-project autocomplete.
- Aggressive auto-replacement.
- Full Final Draft parity.

Reasoning:

This is editor-flow polish that should happen after import/storage so imported scripts can seed useful suggestions immediately.

## Dependencies

Do not start this implementation before the current app foundation path is complete enough to support durable project data.

Minimum dependency checklist:

- `.writeros` project package read/write contract exists.
- Home reads real project folders or has an accepted file-system adapter path.
- `.fdx` import creates script content with correct screenplay block types.
- localStorage migration path is defined.

Feature-specific dependencies:

- Scratchpad persistence depends on file-backed project storage.
- Title page export depends on a later PDF/export pipeline.
- Autocomplete benefits from `.fdx` import because imported character cues and scene headings become seed data.
- Locking/status should be part of project metadata, not a UI-only flag.

## Implementation Sequence

After app foundation:

1. Add script status metadata and visible status controls.
2. Add deterministic character/location autocomplete from script index and Story Bible names.
3. Add scratchpad sidebar persistence and scene pinning.
4. Add title page metadata and read-only title page preview.
5. Connect title page metadata into export when export exists.

This order starts with state and editor-flow improvements before adding another persistent text surface.

## Acceptance Criteria

- A writer can see and change script status without leaving the Script surface.
- Locked/ready-for-breakdown status persists and appears in project metadata.
- Character autocomplete suggests names already present in script cues and Story Bible.
- Location autocomplete suggests locations already present in scene headings.
- Scratchpad notes persist with the project and do not modify screenplay text.
- A scratchpad item can be pinned to the current scene.
- Title page metadata persists with the project.
- Title page preview renders without requiring PDF export.

## Non-Goals

- Breakdown tagging.
- Elements Manager.
- Collaboration comments.
- Share links.
- Tasks assigned to collaborators.
- AV/two-column script mode.
- Script sides generator.
- WGA color revision system.
- Full PDF export.
- Watermarks.
- Call sheets or production scheduling.

Those may become separate PRDs later. They are not part of this approved next script workflow slice.

## Open Questions

These should be answered during implementation planning, not before app foundation work:

1. Should scratchpad notes live under `documents.scriptScratchpad`, `script.scratchpad`, or a separate project notes file inside `.writeros`?
2. Should locking/status live in `ProjectState.meta`, `ProjectState.script`, or a dedicated production metadata object?
3. Should title page metadata be shared with project identity fields, or kept as export-specific metadata?
4. Should autocomplete suggestions appear inline, in a small dropdown, or through an explicit keyboard command?
