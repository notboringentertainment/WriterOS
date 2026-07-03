# WriterOS Product / Architecture Handoff

- **Date:** 2026-05-08
- **Branch context:** `feature/screenplay-editor-core`
- **Related docs:** `docs/product/README.md`, `docs/product/agent-workflow-prd.md`, `docs/product/project-identity-script-context-prd.md`

WriterOS is a writing-first studio for screenplay development. It should work for novices and professionals alike: powerful enough for serious drafting, but legible enough that a new writer understands what each surface is for without reading documentation.

## Core Product Model

WriterOS is not a required pipeline. It is a flexible suite of writing surfaces:

- **Script:** screenplay pages and scene-level writing.
- **Synopsis:** reader/pitch-facing story summary.
- **Outline:** writer-facing structure, beats, escalation, and causality.
- **Story Bible:** character, world, rules, tone, and themes.
- **Treatment:** planned fifth surface for full-story cinematic prose before script drafting.

Each surface should feel like a real writing workspace, not just form fields around a chatbot. Current non-script surface direction: ask plain-language story questions in Edit View, map answers to professional structure behind the scenes, and render polished Document View artifacts suitable for serious development conversations.

## Agent Model

The left rail remains the persistent Writing Partner thread for the whole project.

However, it is surface-aware:

- Script: general Writing Partner unless a specialist is mentioned.
- Synopsis: Sam is the natural helper.
- Outline: Oliver is the natural helper.
- Story Bible: Casey handles character, theme, and psychology; Zoe handles world, rules, and tone anchors.
- Treatment: Alex is likely the natural helper.
- Manual mentions like `@Maya` or `@Casey` override the surface default.
- `@Partner` / `@WritingPartner` force the general partner.

Important: left-rail transcript stays separate from Writer's Room specialist transcripts. Writer's Room remains the direct specialist space.

The UI must make delegation visible:

- Assistant messages in the left rail should say `Writing Partner (@Sam)` and similar when routed.
- The input area should show an Active Helper hint before sending, such as `Writing Partner will ask @Sam`.
- Each surface should have subtle orientation copy explaining what the surface does and which agent helps there.

## Context / Retrieval Direction

A 120-page screenplay cannot be handled by a single first-500-word excerpt. Script context needs addressable retrieval:

- Script index.
- Page estimates.
- Scene windows.
- Cursor/selection focus.
- Speaker-scoped retrieval.
- Eventually broader summaries for wide questions.

Recent work started this by deriving script index/focus context from TipTap HTML and passing fresher editor snapshots into agent calls.

The current ceiling: retrieval still needs better page-range lookup, scene fuzzy match, broad-question summarization, and stronger current-focus UX.

## Storage Boundary

Do not rush backend persistence yet.

Persist authored/user-visible state:

- Project title.
- Synopsis.
- Outline.
- Story Bible.
- Script raw HTML/scenes.
- Eventually treatment.

Keep indexes, retrieval packs, and context summaries derived unless/until a storage PRD decides otherwise.

`localStorage` is acceptable short-term, but real multi-project storage/export/import needs a deliberate design pass.

## Document Preview Direction

For every non-script surface, add an eventual toggle:

- **Edit View:** structured writing workspace.
- **Document View:** clean formatted preview for sharing/export.

This is not PDF-first internally. Treat it as a document preview layer that can later export to PDF, DOCX, Markdown, and other formats.

Most important surfaces:

- Synopsis document preview.
- Outline / beat sheet document preview.
- Story Bible document preview.
- Treatment document preview.

Script already behaves more like a document/page surface.

## Treatment Surface

Treatment should probably be its own PRD or later phase, not jammed into the current script-context work.

Treatment is distinct from:

- Synopsis: shorter, reader/pitch-facing.
- Outline: structural beats.
- Script: formatted screenplay pages.
- Story Bible: reference material.

Treatment is full-story cinematic prose. It is likely where Alex becomes most useful.

## Design Principle

Expert power, beginner legibility.

The app should reveal its logic gently:

- What this surface is for.
- Who is helping.
- What document artifact this work can become.
- How agent context is being focused.

Avoid turning the UI into onboarding sludge. Use small, durable orientation cues.

## Current Implementation Notes

- Writing Partner and Writer's Room transcripts are intentionally separate in `ProjectState`.
- Left-rail routed responses are labeled as delegated Writing Partner responses, for example `Writing Partner (@Zoe)`.
- Story Bible routing should use message intent before falling back to focused section, so character psychology questions route to Casey even if the writer last touched World.
- Script context currently derives an index from raw TipTap HTML and can use live editor snapshots plus cursor/selection focus.
- Storage, Treatment, document preview, and broad script summarization should remain deliberate future phases rather than opportunistic add-ons.
