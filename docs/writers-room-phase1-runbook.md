# Writers' Room Phase 1 — Acceptance Test Runbook

This is the active "is it alive" test. It should feel like using the room, not
setting up fake form data.

## Prerequisites

`.env` must contain (all server-side; never shipped to the client bundle):

```env
ANTHROPIC_API_KEY=...        # room turns
SUPABASE_URL=...             # room persistence (writeros-room project)
SUPABASE_ANON_KEY=...
ANTHROPIC_DIGEST_MODEL=      # optional; defaults to claude-haiku-4-5
```

Start a fresh dev server after checking out the branch:

```bash
npm run dev
```

Look for `[room] scheduler started (5s tick)` in the server log. If you see
`[room] scheduler not started`, an env var is missing.

## Active Acceptance Test

1. Open any active project in WriterOS. The Story Bible does not need to be
   filled out.
2. Open the Writer's Room dock with Cmd+6, or the top-right Writer's Room
   button. The dock opens on **The Room**.
3. In the room message box, ask Casey for character-field help:

```text
Casey, help me figure out my lead character's want. I only know this: they are chasing the wrong thing because of an old wound.
```

4. Watch the channel. Within roughly 5-60s, Casey's typing indicator should
   appear and her answer should stream live.
5. Casey should either:
   - give a concrete, field-ready `want` value, or
   - ask one sharp next question needed to make the `want` field usable.

That is the core Phase 1 pass: writer speaks in the room, Casey wakes without a
manual Story Bible setup, and the room helps create pertinent field material.

## Proposal Path

If the project already has a Story Bible character card, ask with that name:

```text
Casey, help me sharpen <CharacterName>'s want into a Story Bible field value.
```

Expected stronger pass:

1. Casey wakes because the message names a character or directly asks for Casey.
2. Casey uses the visible character card id sent by the client.
3. Casey files a proposal card for `storyBible → characters[<id>].want`, or
   explains what missing input blocks a useful proposal.
4. Adopt writes the field into the Story Bible. Reject leaves the document alone.

## What This Proves

- writer_message event persists
- scheduler wakes Morgan and Casey correctly
- Casey can respond before forms are complete
- Anthropic stream drives the live typing bubble
- room channel receives the final message
- proposal cards work when an exact character field exists
- pass remains valid when Casey has nothing useful to add

## Optional Plumbing Smoke

The old field-change path still exists for ambient behavior: changing an existing
Story Bible character `want` / `need` / `flaw` / `secret` / `arc` emits
`doc_field_changed` and can wake Casey unprompted. That is an engineering smoke,
not the product acceptance path.

## Troubleshooting

- **Nothing happens:** restart the dev server; confirm `[room] scheduler started
  (5s tick)` appears.
- **Room entry missing:** no active project id, or room API returned 503 because
  env vars are missing.
- **Casey never wakes:** include `Casey` plus a character-psychology word like
  `want`, `need`, `flaw`, `secret`, `arc`, `lead`, or `motivation`.
- **Proposal does not appear:** no exact Story Bible character card exists, or
  Casey chose to ask a clarifying question instead. This is valid for incomplete
  projects.
- **Ledger check:** `select agent_id, action, input_tokens, output_tokens,
  created_at from agent_turn_ledger order by created_at desc limit 10;`

## Not Production-Safe

RLS is disabled on all six room tables and the server uses the anon key.
Local spike posture only — harden before any deploy (DECISIONS.md D2).
