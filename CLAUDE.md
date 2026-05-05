# WriterOS — Agent Context

This repo is now the clean WriterOS app, not the original Claude Design prototype bundle.

## Current Shape

- React + Vite frontend under `client/`
- Minimal Express server under `server/`
- Shared persona and story-memory types under `shared/`
- Specs and plans under `docs/superpowers/`
- Tests under `tests/`

## Important Constraints

1. Preserve the writing-first product direction. The script editor and structured documents are the primary app surface.
2. Keep Writing Partner and Writer's Room transcripts separate:
   - `agents.writingPartner.transcript` is only for the left rail host conversation.
   - `agents.sam/casey/oliver/maya/zoe/alex.transcript` are only for Writer's Room specialist sessions.
3. Do not reintroduce Replit, Drizzle, Neon, Passport, or session scaffold unless the user explicitly asks for a backend persistence project.
4. Keep `/api/wp-chat` a thin adapter over `OpenAIService.generatePersonaResponse`.
5. Run `npm run test:run`, `npm run check`, and `npm run build` after meaningful changes.

## Useful Entry Points

- `client/src/App.tsx`
- `client/src/lib/projectState.ts`
- `client/src/lib/wpRouting.ts`
- `client/src/components/writing/ScriptTab.tsx`
- `client/src/components/writing/WritersRoom.tsx`
- `server/routes.ts`
- `server/ai/openaiService.ts`
