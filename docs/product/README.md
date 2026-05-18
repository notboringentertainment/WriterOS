# WriterOS Product Doc Map

**Date:** 2026-05-18
**Status:** Canonical product-orientation map for the current branch
**Branch context:** `feature/screenplay-editor-core`

## Product North Star

WriterOS is a writing-first studio for screenplay and series development. It should feel powerful enough for serious writers and legible enough that a newer writer can start without decoding craft jargon.

The current surface standard:

> WriterOS writing surfaces ask plain-language story questions, translate the answers into professional structure behind the scenes, and render studio-presentable documents the writer can confidently share.

This standard applies to Synopsis, Outline, Story Bible, and future Treatment. Script remains the formatted screenplay page surface.

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
- `docs/product/structured-writing-surfaces-prd.md` remains canonical for the document taxonomy, `ProjectState.documents` direction, migration discipline, and the long-term surface suite. Where it conflicts with the two docs above, the newer format/story-coach decisions win.
- `docs/product/writeros-future-work-prd.md` remains current for future workstreams and the in-branch Save/Rename/Delete local project UX.
- `docs/product/writer-voice-profile-prd.md` remains current for writer-scoped profile work. Voice Profile is not project format, Story Bible canon, or project memory.
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
4. Create specific redesign PRDs before implementing Story Bible or Treatment.
5. Update agent context docs whenever a surface changes source of truth.

## Follow-Up Ownership

| Follow-up | Owner document | Status |
| --- | --- | --- |
| Synopsis story-assessment revision | `docs/product/synopsis-story-coach-redesign-prd.md` | Canonical PRD written; use before further Synopsis implementation |
| Story Bible story-coach redesign | `docs/product/story-bible-story-coach-redesign-prd.md` | Canonical PRD written; use before further Story Bible implementation |
| Treatment surface design | `docs/product/treatment-surface-prd.md` | To be written before adding Treatment as a fifth surface |
| Agent context migration from legacy mirrors to `documents.*` | `docs/product/agent-workflow-prd.md` plus surface-specific PRDs | Update whenever a surface changes source of truth |
