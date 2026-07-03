# WriterOS Product Doc Map

**Date:** 2026-06-10
**Status:** Canonical product-orientation map for current `main`
**Branch context:** `main` after PR #25 (`Synopsis Composer Slice 2`)

## Product North Star

WriterOS is a writing-first studio for screenplay and series development. It should feel powerful enough for serious writers and legible enough that a newer writer can start without decoding craft jargon.

The current surface standard:

> WriterOS writing surfaces ask plain-language story questions, translate the answers into professional structure behind the scenes, and render studio-presentable documents the writer can confidently share.

This standard applies to Synopsis, Outline, Treatment, and Story Bible. Script remains the formatted screenplay page surface.

## Current Canonical Rules

1. `ProjectState.meta.format` is the only behavioral authority for project format.
2. V1 project format values are `feature` and `series`.
3. Synopsis, Outline, and Story Bible may show the shared Feature/Series selector.
4. Script does not show the Feature/Series selector in V1.
5. Surface-local format fields are compatibility mirrors for headers/export, not behavioral authority.
6. Format flips must preserve authored content from both formats.
7. Edit View must use plain-language story-assessment questions as the primary writer-facing prompts. Professional structural labels are not allowed as Edit View headlines.
8. Professional terms may appear in hidden mappings, tests, developer docs, agent context, and Document View.
9. Document View is read-only in V1 unless a later PRD explicitly changes that.
10. Agents receive derived context. They must not silently mutate project format, canon, or authored surface content.

## Canonical Docs

- `docs/product/project-wide-format-agent-context-prd.md` is canonical for project format authority, shared Feature/Series selector behavior, Script no-toggle scope, and agent context format rules.
- `docs/product/synopsis-story-coach-redesign-prd.md` is canonical for the next Synopsis revision: plain-language story-assessment Edit View, hidden professional mapping, and studio-presentable Feature/Series Synopsis documents.
- `docs/product/story-bible-story-coach-redesign-prd.md` is canonical for the next Story Bible revision: plain-language Edit View on top of `documents.storyBible.content`, character story-coach interview cards, format-aware Feature/Series story-engine prompts, and a professional bible Document View. Casey and Zoe context migration is scoped inside the PRD.
- `docs/product/outline-story-coach-redesign-prd.md` is canonical for the Outline redesign and the broader surface standard: plain-language assessment in Edit View, professional structure underneath, polished document rendering.
- `docs/product/treatment-surface-prd.md` is canonical for Treatment: a first-class prose surface stored in `documents.treatment.content`, guided by plain-language questions, rendered through a read-only Document View, supported by Alex, and available to agents as authored full-story flow.
- `docs/product/document-composer-prd.md` is canonical for composing authored answers into professional, generated artifacts across Outline, Synopsis, Treatment, and Story Bible. It also makes the **Document Composer Agent** official as the bounded, non-chat, skill-trained composing role inside the Composer: each surface gets its own recipe, style contract, and quality rubric, grounded in professional film-writing document-type standards, while the Composer still runs as a single constrained call and never mutates canon. It redefines Document View: instead of re-rendering stored answers as labeled rows, Document View shows a saved composed artifact derived from the answers. Source-of-truth boundary is firm — `documents.<surface>.content` stays the only canon; composed output is stored separately as `documents.<surface>.composed`, is read-only, and never writes back to authored content. Composition is a single constrained call (no OpenSwarm, no autonomous orchestration) through the configured composition model, with a layered fidelity pass (deterministic provenance/coverage/entity checks first, an entailment critic later) and prompt-injection guardrails that treat answers as untrusted source. Staleness is tracked by a normalized source hash plus separate `recipeVersion`, surfacing answer-stale vs recipe-stale states; Compose/Recompose are user-initiated only in V1. Slice 1 scope is the Outline composer (feature/series), with Compose/Recompose, saved composed artifact, tiered readiness, deterministic fidelity warnings, persistence round-trip, and manual visual comparison against the local Bloodless benchmark. Where it touches Document View, it supersedes the older "re-render stored answers" rendering described in surface PRDs.
- `docs/product/document-composer-surface-standards-prd.md` is canonical for the planning standards for the remaining Composer surfaces after Outline Slice 1: Synopsis, Treatment, and Story Bible. It translates the film-writing skill-pack research into repo-local product requirements, defines each surface's professional job, Edit View intake needs, Composer inputs, Document View target, quality rubric, and anti-patterns, and recommends Synopsis Composer as the next implementation slice. It is planning-only and does not introduce runtime dependencies on the skill-pack files.
- `docs/product/synopsis-composer-prd.md` is canonical for the Synopsis Composer implementation slice — the first multi-surface expansion of the Document Composer after Outline. It resolves the surface-standards open questions for Synopsis (rubric-only length, missing-ending as missing-context, no new block types), pins concrete Feature/Series readiness thresholds, enumerates the real fact-sheet field ids and recipe sections, and gives the file-by-file task breakdown against the shipped Outline pattern. Shipped via PR #25; its build-reality deltas section records where implementation diverged from the plan.
- `docs/product/treatment-composer-prd.md` is canonical for the Treatment Composer implementation slice — the third Composer surface after Outline and Synopsis. It resolves the surface-standards open questions for Treatment (format-agnostic V1 recipe, open questions and AI production implications excluded entirely, rubric-only length, no new block types, custom passages integrated into the story body), pins concrete readiness thresholds including the logline-or-premise story-engine disjunction, enumerates the real fact-sheet field ids verified against `shared/documents.ts`, and maps every file against the shipped Outline/Synopsis pattern — recording up front that `TreatmentTab` and `TreatmentDocumentView` are edits to shipped files, not creates. Build only after review; one surface at a time.
- `docs/product/app-home-import-storage-prd.md` is canonical for the app foundation outside writing surfaces: Home, project folder viewer, Final Draft `.fdx` import, project package storage, and localStorage migration.
- `docs/product/project-vault-prd.md` is canonical for Project Vault and Workspace Vault: user-managed reference storage (DOCX, PDF, images, notes), agent-access rules, and lifecycle boundaries against Project Memory and Writer Memory. Planning-only; reserves `vault/` and `_vault/` paths ahead of Slice 4.
- `docs/product/script-workflow-polish-prd.md` is canonical for the approved post-foundation Script workflow polish slice: scratchpad sidebar, script status/locking flag, title page metadata/preview, and character/location autocomplete.
- `docs/product/structured-writing-surfaces-prd.md` remains canonical for the document taxonomy, `ProjectState.documents` direction, migration discipline, and the long-term surface suite. Where it conflicts with newer surface-specific PRDs, the newer format/story-coach decisions win.
- `docs/product/writeros-future-work-prd.md` remains current for future workstreams and the in-branch Save/Rename/Delete local project UX.
- `docs/product/writer-voice-profile-prd.md` remains current for writer-scoped profile work. Voice Profile is not project format, Story Bible canon, or project memory.
- `docs/product/agent-observability-provenance-prd.md` is canonical for under-the-hood agent traceability, admin/debug consult visibility, guardrail provenance, and the source-aware foundation future agent memory must use. It was created after Morgan M2 exposed that functional tool use is not enough if operators cannot verify what happened.
- `docs/product/persona-capability-layer-prd.md` and `docs/product/persona-capability-phase2-plan.md` remain current for persona capability routing and bounded OpenSwarm use.
- `docs/product/agent-workflow-prd.md` remains useful for persona roles and transcript boundaries, but older context-pack examples must be read through the project-format and document-state updates.
- `docs/product/project-identity-script-context-prd.md` remains useful for title identity and script retrieval. Its remaining future work is mostly tracked in `writeros-future-work-prd.md`.

## Historical Docs

`docs/superpowers/specs/*` and `docs/superpowers/plans/*` are implementation records unless a current product PRD explicitly references them as active. They are valuable for code archaeology, but they should not override the current product rules above.

Especially stale for current product intent:

- `docs/superpowers/specs/2026-05-03-writeros-ui-design.md` still describes the first guided-section/tab implementation.
- `docs/superpowers/plans/2026-05-03-writeros-shell-and-structured-tabs.md` still describes the initial form-style Synopsis/Outline/Story Bible build.
- `docs/superpowers/plans/2026-05-16-synopsis-series-variant.md` documents the local Synopsis-format stepping stone. Its `header.format` behavior has been superseded by project-wide `ProjectState.meta.format` authority.

## Planning Sequence

Before more code, keep the product docs aligned in this order:

1. Preserve the product north star and project-format authority.
2. Rewrite active surface PRDs around the shared surface standard.
3. Keep stale implementation plans clearly marked as historical.
4. Create or update specific redesign PRDs before implementing major surface changes.
5. Update agent context docs whenever a surface changes source of truth.

## Follow-Up Ownership

| Follow-up | Owner document | Status |
| --- | --- | --- |
| Synopsis story-assessment revision | `docs/product/synopsis-story-coach-redesign-prd.md` | Canonical PRD written; use before further Synopsis implementation |
| Story Bible story-coach redesign | `docs/product/story-bible-story-coach-redesign-prd.md` | Canonical PRD written; use before further Story Bible implementation |
| Treatment surface design | `docs/product/treatment-surface-prd.md` | Implemented through read-only Document View; use Clear Path Ahead before further Treatment implementation |
| Composed professional artifacts from authored answers (new Document View meaning) | `docs/product/document-composer-prd.md` | Canonical PRD written; use before any compose/generate-from-answers implementation. Start with Slice 1 Outline composer |
| Remaining Composer surface standards | `docs/product/document-composer-surface-standards-prd.md` | Planning PRD written after Outline Slice 1; use before implementing Synopsis, Treatment, or Story Bible Composer. Next recommended slice: Synopsis Composer |
| Synopsis Composer implementation | `docs/product/synopsis-composer-prd.md` | Shipped via PR #25. Build-reality deltas recorded in the PRD |
| Treatment Composer implementation | `docs/product/treatment-composer-prd.md` | Implementation PRD written; ready to build after review. Mirrors Synopsis slice over shared Composer architecture. Story Bible Composer follows in a later slice |
| App Home, screenplay import, and storage | `docs/product/app-home-import-storage-prd.md` | Canonical PRD written; required before Home, `.fdx` import, or shipped-app storage implementation |
| Project Vault and Workspace Vault | `docs/product/project-vault-prd.md` | Canonical PRD written (planning only); read before Slice 4 lands so `vault/` and `_vault/` paths are reserved |
| Script workflow polish | `docs/product/script-workflow-polish-prd.md` | Approved next PRD scope; implement only after app foundation path |
| Agent context migration from legacy mirrors to `documents.*` | `docs/product/agent-workflow-prd.md` plus surface-specific PRDs | Update whenever a surface changes source of truth |
| Agent observability, consult traces, guardrail provenance, and future memory source records | `docs/product/agent-observability-provenance-prd.md` | Foundational Ultraplan PRD written after Morgan M2; first recommended slice is local Morgan trace logs |
