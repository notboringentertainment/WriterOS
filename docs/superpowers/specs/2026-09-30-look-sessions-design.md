# Look sessions in WriterOS — design

Written 30 September 2026 from Ben's direction in conversation. Supersedes one line of the D10 ruling (OpenMontage `docs/plans/2026-08-26-look-lock-D10.md`, "D10 Wayfinder owns looks"): **WriterOS owns the look interview and the look record; OpenMontage still ratifies; Story-drive no longer creates look tickets.** Everything else in D10 (D11 one strict shape, D12 ratification is a signed OpenMontage receipt, D13–D18) stands.

## Ben's direction, in his words

Story-drive was the logical place for looks because it produces story canon, but it has always felt premature. Its "session" is a Claude Code terminal running a skill; the app is a read-only board. Paperclip is now the studio for production, but it is not a canon store. WriterOS already has the in-app conversation with the model (Zoe in the Writers' Room), project memory with explicit approval and hashes, and now the per-beat Lookbook. So the look machinery we built, almost to a fault, to lock looks and prevent drift, should move into WriterOS. Nothing already ratified moves.

## What a look session is

One entity per session (a character or a location), started by the writer, run with Zoe in the app, converging on a draft look-spec block that the writer fills in, closed by an explicit **Promote** click. Promotion writes a canon record in project memory carrying the typed block, and writes an export file that OpenMontage's `look_lock` gate reads. Ben still approves the ratification from a terminal in OpenMontage; that signed receipt is the only proof of ratification, exactly as today.

## Ground rules (carried over, now enforced in WriterOS)

- **No agent drafts a look.** Zoe asks; the writer types every value. Zoe never proposes a field value, never fills a field, never infers heritage. In WriterOS this is a UI invariant (the form is the only writer) plus an audit (every field carries writer provenance that promote checks); it is not a cryptographic proof.
- **One question at a time.** Same discipline as the wayfinder skill's grill.
- **Reference-image firewall.** The writer's answer is part of the promote request and is enforced server-side (face vocabulary and distinguishing marks refused under casting-inspiration); it is stored beside the block in the export so the gate can show it, never inside the block. Before grilling, Zoe asks "Do you have a reference image for this character/location?" and records the answer as `none | generated-elsewhere | casting-inspiration`. WriterOS never receives the image. For `casting-inspiration` (a real person) the writer types only the allowlisted type fields (`age_band`, `build`, `era_and_class_signals`, `hair` as a category); no facial descriptors, ever, and Zoe stops the writer if they start describing the face. For a fictional subject with no casting image, Zoe must reach face-level detail (eye colour, eyewear, complexion) because a generator will otherwise invent it.
- **Attestations are direct questions.** `fictional_subject_attestation`, `minor`, `spoiler` are asked and recorded; the block cannot promote on `minor: true` or attestation `false`.
- **`depends_on` is derived, never typed.** It lists the canon records Zoe's answers cited during the session (the citation ids the memory context authorised), always as `{writeros_record_id, content_hash}`, whatever the cited record's own origin.
- **The block has no self-attestation.** No status, hash, receipt or supersedes inside it.
- **Promotion is explicit and is not ratification.** A promoted look is active canon in WriterOS memory (explicit approval, the click). It becomes a ratified look only when OpenMontage's `look_lock` receipt exists for its `look_hash`.
- **Reopening is expensive by design.** Promoting a new look for the same entity supersedes the old record in WriterOS and, once ratified, invalidates sheets and shots downstream, as today.
- **One direction between systems.** WriterOS writes its export; OpenMontage reads it. WriterOS never reads OpenMontage receipts (Front Lot shows ratification), and nothing here writes to Story-drive.

## Decisions

- **L1 Where.** A Look panel opened from a beat's Lookbook ("Start a look for …") or from a Story Bible character card. It holds the Zoe chat on one side and the draft block on the other. The chat runs through the existing specialist path (`/api/wp-chat`, `personaId: 'zoe'`) with a `lookSession` context that appends the look contract to Zoe's prompt; the transcript stays in `agents.zoe.transcript`.
- **L2 Record.** A memory record of kind `canon`, workflow `writeros`, `approval: 'explicit'`, active on promotion, with a typed `payload: { kind: 'look_spec', version: '1.1', spec }`. `claim` is a one-line rendering ("Look: <entity> — <first sentence of prompt_safe_description>"); `detail` the full block as YAML; `entities: [entity name]`. A new look for the same `(entity_kind, entity_id)` supersedes the prior look record.
- **L3 Hash.** `look_hash` = sha256 of the RFC 8785 canonical JSON of the validated block, byte-identical to OpenMontage's `record_sha256`. WriterOS gets a canonical-JSON implementation tested against OpenMontage's own vectors. The record id already binds to content; `look_hash` is stored on the record and in the export.
- **L4 Schema version 1.1.** Same fields as 1.0, plus a third `depends_on` item form `{writeros_record_id: 'mem_…', content_hash: <64 hex>}`, and `source_ticket_ref` stays optional (it is never set for WriterOS looks). OpenMontage's `look_spec.schema.json` becomes the source of truth for 1.1; WriterOS mirrors it in zod and a test pins the two in step.
- **L5 Export.** On promotion the server writes `<package>/memory/exports/look-locks-<revision>.json` atomically: `{ version: 1, memory_revision, project_id, looks: [{ entity_kind, entity_id, look_spec, look_hash, promotion_id (record id), promoted_at }] }` with every currently active look. OpenMontage ingests that file as a look source alongside wayfinder tickets, verifies the hash by recomputing it, and the gate envelope carries `promotion_refs: [{ system: 'writeros', record_id, memory_revision }]`.
- **L6 Drafts.** An unpromoted draft lives in the package as `documents/looks.json` (working notes, same rules as `documents/lookbook.json`: optional file, never analysed, written through the normal save, never deleted by a client that never loaded it). One draft per entity key.
- **L7 Entities.** WriterOS has characters (with ids) and no locations collection. `entity_id` is a slug the writer confirms in the panel (pre-filled from the character name or the Lookbook mention); it is stored in the block and is what OpenMontage keys on. Building a locations collection is not part of this work.
- **L8 Beats show ratified state.** A beat whose Lookbook answers name an entity with a promoted look shows "Look promoted: <entity>" read-only, and Zoe's Lookbook contract is told not to ask about anything a promoted look already covers.
- **L9 Story-drive.** The wayfinder skill stops creating look tickets and points writers to WriterOS; the `revisit: look` register stays as a list of candidates; existing look tickets remain readable and valid; the skill's rubric is updated. Story-drive's app code is untouched.
- **L10 Bloodless.** Nothing migrates. Ivy, Ace, Alyssa and the other ratified looks keep their wayfinder tickets and receipts. Only new looks go the WriterOS way.

## What this replaces and what it keeps

| Piece | Today | After |
|---|---|---|
| Interview | Claude Code session running the wayfinder skill | Zoe in the WriterOS Look panel |
| Record | `## Look spec` block in a resolved wayfinder ticket | typed payload on a WriterOS canon record |
| Blockers | `blocked-by` ticket titles → derived `depends_on` | canon citations from the session → derived `depends_on` |
| Firewall and attestations | skill text, graded by the rubric | Zoe's look contract, graded by tests on the prompt and the promote validator |
| Ratification | OpenMontage `look_lock` receipt, Ben in a terminal | unchanged |
| Supersession and invalidation | unchanged | unchanged |
| Where the look is displayed | Front Lot | Front Lot, plus a read-only line on the beat in WriterOS |

## Out of scope

Migrating ratified looks; a locations collection in the Story Bible; WriterOS reading OpenMontage receipts; image import into WriterOS; Paperclip involvement beyond what it already does with agents and tickets.
