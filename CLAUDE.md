# WriterOS — Claude Code Context

This repo is now the clean WriterOS app, not the original Claude Design prototype bundle.

WriterOS is a writing-first studio for screenplay drafting, story structure, and AI-assisted development work. The script editor and structured writing surfaces are the primary product experience; agent chat exists to support the writing, not to replace it.

## Current Shape

- React + Vite frontend under `client/`
- Minimal Express server under `server/`
- Shared persona and story-memory types under `shared/`
- Specs and plans under `docs/superpowers/`
- Tests under `tests/`

## Operating Rules

1. Think before coding. State assumptions when they affect implementation choices.
2. If scope or intent is meaningfully ambiguous, present the options before implementing.
3. Convert tasks into verifiable goals. Know what success looks like before changing code.
4. Keep changes surgical. Touch only the files needed for the requested behavior.
5. Avoid unrelated refactors, formatting churn, and feature creep. Report incidental issues instead of fixing them unless asked.
6. Never run destructive or irreversible commands without explicit permission, including `git push --force`, `git reset --hard`, branch merges, and broad file deletion.

## Important Constraints

1. Preserve the writing-first product direction. The script editor and structured documents are the primary app surface.
2. Keep Writing Partner and Writer's Room transcripts separate:
   - `agents.writingPartner.transcript` is only for the left rail host conversation.
   - `agents.sam/casey/oliver/maya/zoe/alex.transcript` are only for Writer's Room specialist sessions.
3. Do not reintroduce Replit, Drizzle, Neon, Passport, or session scaffold unless the user explicitly asks for a backend persistence project.
4. Keep `/api/wp-chat` a thin adapter over `OpenAIService.generatePersonaResponse`.
5. Do not use stale scaffold-era files, including `CLAUDE 2.md` or old Replit/prototype handoff files, as product or architecture guidance.

## Product Direction Source Of Truth

Before product or surface implementation work, read `docs/product/README.md`.

That doc defines the current product north star, canonical PRD order, project-format authority, and the plain-language story-assessment standard for Synopsis, Outline, Story Bible, and future Treatment.

## Verification

Run these after meaningful changes:

1. `npm run test:run`
2. `npm run check`
3. `npm run build`

For UI changes, visually verify layout and interaction behavior with available browser tooling. Do not rely only on static code inspection when the change affects what the user sees or clicks.

## Useful Entry Points

- `client/src/App.tsx`
- `client/src/lib/projectState.ts`
- `client/src/lib/wpRouting.ts`
- `client/src/components/writing/ScriptTab.tsx`
- `client/src/components/writing/WritersRoom.tsx`
- `server/routes.ts`
- `server/ai/openaiService.ts`
