# WriterOS

WriterOS is a professional screenwriting application with an integrated AI writing studio. The app is writing-first: the screenplay editor, structured story documents, and project state are the core experience; AI agents support the writer through the Writing Partner rail and Writer's Room.

## What Is In This Repo

This branch is a clean transplant of the useful WriterOS product work into the GitHub `WriterOS` repo. It intentionally avoids the older Replit/Drizzle/Neon scaffold that existed in a separate local copy.

Primary app code:

```text
client/
  src/components/shell/      Top bar, left Writing Partner rail, shell layout
  src/components/writing/    Script, Synopsis, Outline, Story Bible, Writer's Room
  src/lib/                   ProjectState, screenplay logic, shell state, WP routing
server/
  routes.ts                  Minimal Express API, including /api/wp-chat
  ai/openaiService.ts        OpenAI persona service
shared/
  personas.ts                Writing Partner and specialist personas
  schema.ts                  Shared TypeScript types only, no database ORM
tests/
  components/ and lib/       Vitest coverage for the app shell, editor, state, routing
docs/superpowers/
  specs/ and plans/          Product specs and implementation plans
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

This starts the full local development stack:

- WriterOS on `127.0.0.1:5177`
- OpenSwarm on `127.0.0.1:8080` when `/Users/ben/OpenSwarm` is present

Use `npm run dev:status` to check whether both services are already running.

The WriterOS app-only server is still available with:

```bash
npm run dev:writeros
```

Override WriterOS with `PORT` or `HOST` if needed. If OpenSwarm lives somewhere other than `/Users/ben/OpenSwarm`, set `OPENSWARM_DIR=/path/to/OpenSwarm`.

AI chat requires:

```bash
export OPENAI_API_KEY="..."
```

Without the key, the server still starts and `/api/health` reports `ai: false`.

## Verification

```bash
npm run test:run
npm run check
npm run build
```

## Architecture Notes

- `ProjectState` persists locally in `localStorage`.
- Writing Partner rail transcript lives at `projectState.agents.writingPartner.transcript`.
- Writer's Room specialist transcripts live at `projectState.agents[id].transcript`.
- These transcript stores do not duplicate or merge.
- `writingPartner` is a host persona for the rail, not a Writer's Room specialist.
- `/api/wp-chat` is a thin adapter over the existing OpenAI persona service.

## Intentional Non-Goals For This Branch

- No Supabase or Postgres persistence.
- No Replit runtime configuration.
- No Drizzle/Neon/auth/session scaffold.
- No production auth.
