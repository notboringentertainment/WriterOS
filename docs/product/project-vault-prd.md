# Project Vault And Workspace Vault PRD

**Date:** 2026-05-25
**Status:** Planning only. No implementation in this PRD.
**Relationship:** Storage addendum that sits ahead of Slice 4 (`docs/product/app-home-import-storage-prd.md`) and clarifies a boundary that is not yet defined in `docs/product/persona-capability-layer-prd.md` §5 (Asset And Document Storage) or in any current Memory PRD.

## Purpose

WriterOS needs a controlled, inspectable place for writers to drop reference material — DOCX briefs, PDF research, images, rough outlines, client notes, old drafts — so personas and OpenSwarm capabilities can use that material when explicitly useful, without that material polluting working canon (Script, Synopsis, Outline, Story Bible, Treatment) and without it leaking through agent memory after the writer has deleted a project.

This PRD names that surface **Vault** and defines its scope, file layout, agent-access rules, and lifecycle boundaries before Slice 4 hardens the on-disk storage contract.

## Non-Goals

- Cloud sync, sharing, or collaborative Vault.
- Auto-ingest from email, Drive, Dropbox, or other connectors.
- Full-text vector indexing at the application layer in V1.
- A surfaced Vault UI in this PRD. The UX surface is deferred until storage and access rules are settled.
- Replacing or restructuring `documents.*` working surfaces. Vault is reference, not canon.
- Replacing Voice Profile or any future Writer Memory PRD. Vault is files, not learned behavior.

## Memory And Storage Boundaries

WriterOS has three distinct persistence kinds. Vault must not collapse with the other two.

| Kind | Owner | Contents | Lifecycle |
| --- | --- | --- | --- |
| **Writer Memory** | Writer-scoped (cross-project) | Voice Profile, preferences, working process, learned behavior | Survives project delete. Survives workspace switch. Controlled by writer profile settings. |
| **Project Memory** | Project-scoped | `ProjectState` (script + documents + transcripts + metadata + view prefs) | Deleted with project. Archived with project. Authoritative working canon. |
| **Vault** | Project-scoped OR Workspace-scoped | User-managed reference files (DOCX, PDF, images, rough notes, prior drafts, client briefs) | Project Vault deleted with project. Workspace Vault survives project delete. |

A file in Vault is reference material, not canon. Promoting Vault content into Story Bible, Outline, Synopsis, or Treatment must be an explicit writer action, not a silent agent rewrite.

## Project Vault vs Workspace Vault

Both surfaces exist. They serve different writer intent and must stay separate in storage.

### Project Vault

- Lives inside the project package: `My Project.writeros/vault/`.
- Scope: reference material specific to this one project (client brief, location photos for this script, research PDF tied to this story).
- Lifecycle: deleted when the project is deleted. Archived when the project is archived (moves with `My Project.writeros/` into `Archive/`).
- Default expectation: every project may have zero or more Vault files. Empty Vault is normal and must not produce noisy UI.

### Workspace Vault

- Lives at the workspace root (the user-selected WriterOS projects folder), not inside any one project.
- Path: `<workspace>/_vault/` (leading underscore so it is visually distinct in Finder and groups away from `.writeros` project bundles; Finder's default Name sort usually places `_`-prefixed names after alphabetical entries, not before).
- Scope: reference material the writer wants available across projects (recurring research, personal craft notes, market/genre references, ongoing client style guides).
- Lifecycle: survives project delete. Survives project archive. Removed only when the writer explicitly deletes Workspace Vault files or switches workspaces.
- Optional in V1: a workspace may have no Workspace Vault. The folder is created lazily on first add.

### Why Both

Project Vault keeps story-specific references attached to the story so they archive and delete cleanly. Workspace Vault prevents the writer from re-uploading the same craft reference into every new project.

## File-Backed Folder Layout

This extends the package contract in `app-home-import-storage-prd.md` (Project Folder Format). The product properties already required there — human-ownable files, safe backup/move, no silent browser-storage dependence — apply unchanged.

```text
<workspace>/                       # user-selected WriterOS projects folder
  _vault/                          # Workspace Vault (lazy-created)
    references/
    images/
    notes/
    vault-index.json               # workspace-scoped manifest
  My Project.writeros/
    project.json
    script/
    documents/
    transcripts/
    exports/
    assets/
    vault/                         # Project Vault (lazy-created)
      references/
      images/
      notes/
      vault-index.json             # project-scoped manifest
  Another Project.writeros/
    ...
  Archive/
    Archived Project.writeros/
      vault/                       # Project Vault travels with the project
        ...
```

### Subfolder Conventions

- `references/` — DOCX, PDF, plain text, markdown, FDX (later).
- `images/` — PNG, JPG, WebP, GIF.
- `notes/` — `.md` and `.txt` writer-authored notes that are not canon.

Subfolders are conventions, not validation gates. A flat Vault is acceptable; subfolders exist so writers and Finder users can keep large Vaults legible.

### `vault-index.json`

A small manifest per Vault (project and workspace). Required so agent access can be evaluated without re-scanning the filesystem on every turn, and so a missing/renamed file produces a clear error rather than a silent miss.

Minimum fields per entry:

- `id` — stable id, not the file path.
- `relativePath` — path under the Vault root.
- `displayName` — original filename, writer-editable later.
- `kind` — `reference | image | note`.
- `mimeType` — detected.
- `addedAt`, `updatedAt`.
- `sizeBytes`.
- `contentHash` — SHA-256 of the file bytes at last index/update; used to detect outside edits and stale agent receipts.
- `agentAccess` — `allow | ask | deny` (default `ask` in V1; see Agent Access Rules).
- `tags` — optional writer-supplied tags.

The manifest is rebuildable from the filesystem if lost, but is canonical for the `agentAccess` field. Rebuild resets all `agentAccess` values to the default `ask`; previously set `deny` entries are not recoverable from the filesystem alone. WriterOS must warn before any rebuild that per-file access settings will be cleared.

## Supported File Types

**V1 (when implemented):** DOCX, PDF, plain text, markdown, PNG, JPG, WebP, GIF.

**Later:** FDX (treat as reference, not as Script import — `.fdx` already has an import path that creates a project; Vault FDX is for old drafts kept as reference).

**Out of scope for V1 Vault:** audio, video, archive files (`.zip`), executable formats.

Unsupported types must be rejected with a clear message rather than silently stored.

## Agent Access Rules

Vault is opt-in for agents and always inspectable by the writer. No silent reads.

### Default Posture

- Per file `agentAccess` defaults to `ask` in V1. Agents may surface "I'd like to read `client-brief.pdf` from Vault — allow?" and proceed only on explicit writer approval.
- Writer can change a file to `allow` (auto-include when relevant) or `deny` (never include).
- Whole-Vault default posture (`allow | ask | deny`) is configurable later; V1 ships per-file `ask` until UX is designed.

### Inclusion Discipline

- Vault content must enter a capability packet through an explicit retrieval step, not by default-attaching every Vault file to every prompt.
- A capability call that read Vault files must produce a **receipt** listing the file `id`s and `displayName`s used. This matches the citation discipline already required in `persona-capability-layer-prd.md` §7.
- Final persona responses that rely on Vault content must cite or summarize the source file, not present it as Story Bible canon.

### Project Vault vs Workspace Vault Access

- A project session may read its own Project Vault and the Workspace Vault.
- A project session must not read another project's Project Vault. Cross-project reference belongs in Workspace Vault.

### OpenSwarm Boundary

OpenSwarm capabilities receive Vault file content through the WriterOS persona path, not by direct filesystem access. WriterOS owns the read, the access decision, and the receipt. OpenSwarm sees only the file bytes plus a content descriptor for the files the writer authorized.

## Delete, Archive, And Privacy Lifecycle

These rules extend Slice 5a (Project Lifecycle) and Slice 4 (storage migration) without requiring either slice to reopen.

### Project Delete

- Deleting a project deletes its `vault/` subfolder along with the rest of the `.writeros` package. No Vault content survives project delete.
- The Delete confirm modal must mention Vault when the Project Vault is non-empty ("This will delete the project, including N Vault file(s).").
- Workspace Vault is not touched by project delete.

### Project Archive

- Archiving a project moves the `.writeros` package — including its `vault/` — into `Archive/`. Vault travels with the project.
- Restoring a project restores its Vault.

### Workspace Switch / Workspace Delete

- Switching workspace folders changes which Workspace Vault is visible. The previous Workspace Vault is not copied or migrated automatically.
- Workspace Vault removal is an explicit writer action against `<workspace>/_vault/`. WriterOS does not auto-delete Workspace Vault.

### Privacy Boundary

Deleted project content (Project Memory or Project Vault) must not remain reachable through agent memory. Specifically:

- Agent transcripts and any derived agent memory must not retain Vault file content after the source project is deleted.
- Content the writer wants to keep past project delete must be explicitly promoted: copied into Workspace Vault, written into Voice Profile, or saved to a separate project.
- A future Agent Memory PRD must respect this boundary; this PRD defines it as a hard rule.

## Interaction With Slice 4

Slice 4 ("External Storage Migration") migrates localStorage projects into project folders. Vault changes nothing about that scope, but Slice 4 must:

- Reserve the `vault/` subfolder name inside the `.writeros` package so a future Vault implementation does not collide.
- Reserve `_vault/` at the workspace root for the same reason.
- Tolerate the presence of `vault/` and `_vault/` (do not delete or rewrite them) if a Vault prototype lands before the full Vault implementation.
- Continue to surface clear errors when project folders are missing or corrupted, including the Vault subfolder when present.

No Vault read/write code is required in Slice 4. The reservation is the only ask.

## UX Surface

Deferred. A future PRD will define:

- Home / project-level Vault entry.
- File upload, drag-and-drop, and rename UX.
- `agentAccess` controls per file and per Vault.
- Receipts UI for "Vault files used in this response".
- Workspace Vault management UX.

This PRD intentionally does not specify the visual surface. Storage contract and lifecycle rules must land first so the UX can be designed against a stable spec.

## Open Questions

These do not block this PRD but should be resolved before Vault implementation begins.

1. Should `agentAccess` default change from `ask` to `allow` once writers have UX to set per-file posture, or should `ask` remain the safe default?
2. Should Workspace Vault be visible to every persona, or gated per persona (e.g., Zoe research vs. Maya dialogue)?
3. Should Vault entries support writer-authored summaries that agents can read instead of full file content for large PDFs?
4. Should `vault-index.json` be authoritative for `displayName` and `tags`, or should the filesystem filename remain canonical?
5. Should "promote Vault to canon" be a first-class action (e.g., a Vault note becomes a Story Bible entry) with an audit trail, or remain a manual copy/paste?

## Acceptance Criteria For This PRD

This is a planning doc. Acceptance is documentation alignment, not code.

- Vault is named and scoped: Project Vault and Workspace Vault, with distinct lifecycles.
- File layout sits cleanly inside the existing `.writeros` package contract and the user-selected workspace folder.
- Agent access rules name explicit retrieval, per-file posture, and receipts.
- Delete / Archive / Workspace switch behaviors are stated, including the privacy boundary against agent memory.
- Slice 4 has a one-line reservation requirement (`vault/` and `_vault/` subfolders).
- `docs/product/README.md` lists this PRD as canonical for the Vault surface.
