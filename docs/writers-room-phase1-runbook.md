# Writers' Room Phase 1 — Acceptance Test Runbook

The §14 "is it alive" test: open a project, change a lead character's `want`
field, and within a minute Casey speaks unprompted in the channel, referencing
BOTH the change AND something from a previous session, then files a proposal
or a pass.

## Prerequisites

`.env` must contain (all server-side; never shipped to the client bundle):

```
ANTHROPIC_API_KEY=...        # room turns
SUPABASE_URL=...             # room persistence (writeros-room project)
SUPABASE_ANON_KEY=...
ANTHROPIC_DIGEST_MODEL=      # optional; defaults to claude-haiku-4-5
```

## Step 1 — Find your project id

Open WriterOS in the browser, DevTools console:

```js
localStorage.getItem('writeros_active_project_id')
```

Copy the id (call it `PROJECT_ID`). Also note your lead character's **name**
and, for nicer seeded notes, their character **id**:

```js
JSON.parse(localStorage.getItem('writeros_project_library'))
  .find(p => p.id === localStorage.getItem('writeros_active_project_id'))
  ?.state.documents.storyBible.content.characters.map(c => ({ id: c.id, name: c.name }))
```

## Step 2 — Seed the "previous session"

```bash
npx tsx scripts/seedWritersRoom.ts <PROJECT_ID> "<CharacterName>" [<characterId>]
```

This creates: a backdated (~2 days ago) channel conversation where Casey
analyzed that character's want/need split, Casey's private `lane_notes` +
`writer_rapport` carrying the same thread, and the standard shared blocks
attached to Morgan and Casey. Idempotent — safe to re-run; the backdated
transcript only inserts into an empty channel.

## Step 3 — Start the dev server (fresh — server/* changed)

```bash
npm run dev
```

Look for `[room] scheduler started (5s tick)` in the server log. If you see
`[room] scheduler not started`, an env var is missing.

## Step 4 — Run the moment

1. Open the project in the browser.
2. Open the Writer's Room dock (top-right button, or Cmd+6). The dock opens on
   **The Room** — you should see the seeded previous-session conversation.
3. Switch to the **Story Bible** tab (keep the dock open), go to Characters,
   and change the lead character's **want** field to something meaningfully
   different. The event fires immediately on the first change (leading-edge
   debounce) — no need to stop typing.
4. Watch the channel. Within ~5–60s (scheduler tick + generation): Casey's
   typing indicator appears, her message **streams live**, and it should
   reference both the want change and the previous session's thread. She then
   files a proposal card (adopt/reject buttons) or passes (check
   `agent_turn_ledger` if silent — a pass is a logged success, not a bug).
5. If she filed a proposal: **Adopt** writes the field into the Story Bible
   with provenance logged to the channel; **Reject** just resolves the card.

## What "alive" looks like

Casey enters mid-thought, no greeting, e.g. referencing "when we dug into her
want/need split" AND the concrete new value you typed. If her message would
not change what you do next, she should have passed instead — that's the value
gate working, also a pass.

## Troubleshooting

- **Nothing happens:** dev server restarted after the checkout? (stale-server
  trap). Scheduler line present? `select * from room_events order by
  created_at desc limit 5;` — is the event queued/processed?
- **Casey speaks but no memory reference:** check the seed ran against the
  SAME project id the browser is using.
- **Room entry missing in the dock:** no active project id, or the room API
  returned 503 (env vars).
- **Ledger check:** `select agent_id, action, input_tokens, output_tokens,
  created_at from agent_turn_ledger order by created_at desc limit 10;`

## Not production-safe

RLS is disabled on all six room tables and the server uses the anon key.
Local spike posture only — harden before any deploy (DECISIONS.md D2).
