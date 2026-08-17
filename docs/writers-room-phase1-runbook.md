# Writers' Room Phase 1 — Acceptance Test Runbook

This is the active "is it alive" test. It should feel like using the room, not
setting up fake form data.

## Prerequisites

`.env` must contain (all server-side; never shipped to the client bundle):

```env
ANTHROPIC_API_KEY=...        # room turns
SUPABASE_URL=...             # room persistence (writeros-room project)
SUPABASE_SERVICE_ROLE_KEY=... # required outside local spike databases
SUPABASE_ANON_KEY=...        # local fallback only
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

## Ambient Integration Check

This checks the ambient trigger without bringing back DevTools or fake seeded
memory.

1. In any project with a Story Bible character card, open **The Room**.
2. Keep the dock open, switch to Story Bible → Characters.
3. Edit that character's `want` / `need` / `flaw` / `secret` / `arc` field.
4. Casey should wake without a direct room prompt. A pass is valid only if the
   ledger records it; otherwise she should stream a useful response.

This proves the `doc_field_changed` path still works. The active room message
test above remains the product-value test.

## Project Meeting Revisions + Pitch Packet Smoke

The additive `20260714000001_meeting_revisions_pitch_packets.sql` migration must
already be applied to an authorized development Supabase. Do not apply it from
this runbook, do not target production, and do not continue if the environment
cannot be positively identified as development.

1. Start and bank Round 1 with at least two decisions, including one lock.
2. Start Round 2. Verify the standing recap shows Round 1 and that questions
   covered by the active direction are not asked again.
3. Revise one decision, retract one lock, choose **Ask me again** for one area,
   and answer that redirected question.
4. Open the readback. Compare **Exactly what this round changes** with the exact
   `concept_seed`, `story_locks`, and `open_questions` block values. They must
   describe the same active direction.
5. Bank Round 2 and reload. Verify the Round 1 transcript remains unchanged,
   while the active direction reflects the revision, retraction, and redirected
   answer.
6. Choose **Export to PitchStudio**. In **Pitch Packet review**, resolve one
   source conflict, edit and approve a writer field, and approve one AI-proposed
   field. Suggested values must remain visibly unapproved until that action.
7. Choose **Export Pitch Packet**. Verify the export completes before two files
   download, and inspect both `<title>-pitch-packet-v1-r<revision>.md` and the
   matching `.json`. The Markdown must contain the reviewed sections; the JSON
   must preserve field provenance and approvals.
8. Choose **Download again** and verify both files are rendered from the
   persisted exported packet without creating a new export.

The real-database suite has a second, explicit authorization gate because it
creates append-only ledger rows and immutable exported packets. Run it only on
a disposable migrated dev database:

```bash
WRITEROS_MEETING_DB_INTEGRATION=1 npm run test:run -- tests/integration/meetingRevisions.integration.test.ts
```

Reset that disposable dev database after the run. Without the flag, the suite
is skipped; that is the expected result before separate migration authorization.

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

## Production Posture

Room tables have RLS enabled with no permissive anon policies. Production room
access requires `SUPABASE_SERVICE_ROLE_KEY` on the server; `SUPABASE_ANON_KEY`
is local fallback only.
