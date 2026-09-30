# Look Sessions Implementation Plan

_Reviewed by Codex (gpt-5.5) in 3 rounds on 2026-09-30, verdict APPROVED; the argument is in `2026-09-30-look-sessions-review-log.md` beside this file._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer decides what a character or location looks like inside WriterOS, with Zoe asking one question at a time, a typed look block filling in beside the chat, and an explicit Promote click that writes a canon record and an export file OpenMontage's `look_lock` gate ratifies. Story-drive stops creating look tickets.

**Architecture:** WriterOS gains a typed `look_spec` payload on memory records, a canonical-JSON hash that matches OpenMontage byte for byte, a promote route that publishes the record and writes `memory/exports/look-locks-<revision>.json`, a draft document `documents/looks.json`, a Look panel (Zoe chat + draft form) and a look contract appended to Zoe's prompt in look sessions. OpenMontage's `look_ingest` gains a second source (the WriterOS export) feeding the same `look_lock` gate, with schema 1.1 adding a WriterOS dependency reference. The wayfinder skill stops creating look tickets.

**Tech Stack:** TypeScript/React/Express/zod/vitest (WriterOS); Python 3 with jsonschema and pytest (OpenMontage, branch `authored-film`); Markdown (skill).

**Spec:** `docs/superpowers/specs/2026-09-30-look-sessions-design.md` (decisions L1–L10). The D10 plan it amends: `/Users/ben/Projects/OpenMontage/docs/plans/2026-08-26-look-lock-D10.md`.

**Sequencing:** Depends on the Beat Sheet and Lookbook branch (`feat/beat-sheet-lookbook`) for the Lookbook entry point and the `documents/lookbook.json` pattern. Cut `feat/look-sessions` from that branch, or from main after it merges. Task 0 (OpenMontage, vectors only) comes first; Tasks 1–7 are WriterOS, 8–10 OpenMontage, 11 the skill, 12 the dry run. WriterOS tasks 1–5 can ship without Tasks 8–10; the export is inert until Task 9 lands.

---

## Part A — Answers for Ben

### A1. The plan in plain English

| Step | What it does | Where |
|---|---|---|
| 1 | Teach WriterOS the look block's exact shape and the exact hash OpenMontage uses | WriterOS shared code, tested against OpenMontage's own hash vectors |
| 2 | Let a memory record carry a typed look block, and render it in canon.md | WriterOS memory schema, store, projections |
| 3 | Promote: one route that validates the block, publishes the canon record (superseding the entity's prior look), and writes the export file | WriterOS server |
| 4 | Zoe's look contract: the interview rules, firewall and attestations, appended to her prompt only in a look session; citations from her answers become the block's dependencies | WriterOS server prompt |
| 5 | Drafts: an unpromoted block lives in the package as working notes | WriterOS package, same rules as the Lookbook file |
| 6 | The Look panel: chat beside the draft form, entry from a beat or a character, Promote button, "Look promoted" line on the beat | WriterOS client |
| 7 | Tests that pin the firewall and the never-draft rule | WriterOS |
| 8 | Schema 1.1 in OpenMontage: a WriterOS dependency form; `source_ticket_ref` optional in the packet | OpenMontage schemas |
| 9 | Ingest the WriterOS export as a look source; the gate accepts it; `look_run --source writeros` | OpenMontage lib, gate, script |
| 10 | Contract text and directors updated: a cast entity needs a ratified look, from either source | OpenMontage docs and pipeline defs |
| 11 | The wayfinder skill stops creating look tickets and says where looks are decided now | `~/.claude/skills/story-wayfinder` |
| 12 | Dry run on a synthetic project end to end: promote in WriterOS, ingest and ratify in OpenMontage from a terminal, supersede once | Both, on copies |

### A2. What this does to each system

- **WriterOS:** new panel, new route, one new optional package file (`documents/looks.json`), one new export folder (`memory/exports/`), one new optional field on memory records. Existing packages parse unchanged. Nothing runs on open.
- **OpenMontage / Front Lot:** the `look_lock` gate accepts a WriterOS export as well as a wayfinder ticket. Receipts, supersession, invalidation, headshots and sheets are unchanged; they never read the source reference. Bloodless's ratified looks are untouched.
- **Story-drive:** the skill stops making look tickets; its app code is untouched and still reads the existing ones.
- **Paperclip:** nothing. It can assign "do the look for X" to an agent as it does with any ticket; the record lives in WriterOS.

### A3. What still needs Ben in a terminal

Ratification. Promote in WriterOS is a click; the signed `look_lock` receipt is minted only by `gate_approve.py` from a terminal, as today. That is deliberate (D12): WriterOS promotion carries no signature OpenMontage can verify.

### A4. Rollback

WriterOS: branch revert; the new files are optional and ignored by an older build (a record with a `payload` field parses under the current non-strict record schema; confirm in Task 2). OpenMontage: the export source is additive; a project without `writeros_package` in `project.yaml` behaves exactly as today. Skill: the edit is a Markdown change with a backup file beside it, as before.

### A5. Where this plan makes a call you may want to change

- **L4, schema 1.1:** adding a third `depends_on` form means OpenMontage must accept 1.0 and 1.1 blocks. The alternative, encoding WriterOS records as `{path, content_sha256}` pseudo-tickets, would lie about what they are. Chosen: 1.1.
- **L7, entity ids:** a slug the writer confirms, not a Story Bible id, because locations have no ids in WriterOS. Cheap now; a locations collection later can alias to it (D10 Slice C).
- **L1, transcript:** the look conversation lives in Zoe's specialist transcript, not a separate one, to respect the CLAUDE.md transcript rule. The panel filters that transcript to the current session by a `lookSessionId` tag on the messages.
- **Casting-inspiration images never enter WriterOS.** The panel records the writer's answer as a word, never a file. If you want image import later, it goes through OpenMontage's `reference_import` gate as today.

---

## Global Constraints

- No agent drafts a look. This is a UI invariant plus an audit, not a cryptographic guarantee: the Look panel's form is the only code path that writes draft fields; every field write records `fieldSources[path] = 'writer'`; the promote request carries that provenance and the server refuses a spec whose provenance is missing or names any source other than `writer`. Tests assert the prompt tells Zoe never to propose values, that a model reply never reaches the form, and that promote refuses a field without writer provenance.
- `look_hash` in WriterOS must equal OpenMontage's `record_sha256` for the same block. WriterOS implements the OpenMontage-compatible subset of RFC 8785 (NFC strings, UTF-16 code-unit key sort, ES6 number formatting for finite safe numbers only; any number outside the JS safe-integer range or non-finite is refused before hashing). The vector file is generated by OpenMontage's own `canonical_bytes`/`record_sha256` (Task 8 step 2) and committed in both repos; Task 1 consumes it.
- Promotion is explicit (`approval: 'explicit'`, active on publish) and is not ratification; no field inside the block asserts status, hash, receipt or supersedes.
- The reference-image mode (`none | generated-elsewhere | casting-inspiration`) is part of the promote request and is stored beside the block; when it is `casting-inspiration` the server refuses `distinguishing_marks` other than `[]` and refuses face vocabulary in `prompt_safe_description`, `continuity_risks`, `negative_lines` and `props` (word list in `shared/lookSpec.ts`: eye, eyes, nose, jaw, lips, mouth, cheek, cheekbones, chin, brow, eyebrow, face, facial, smile, teeth, complexion, skin, freckle, scar on the face, dimple, wrinkle), with a plain sentence.
- `depends_on` is derived from the session's authorised citations, never typed, always in the `{writeros_record_id, content_hash}` form (never mapped back to wayfinder ticket refs); `fictional_subject_attestation` must be `true` and `minor` must be `false` to promote; `spoiler` must have been answered.
- `documents/looks.json` follows the Lookbook file rules: optional, written only when defined, never removed by a save that lacks it, never analysed by the memory observer, invalid → 400 on save.
- One direction: WriterOS writes exports; OpenMontage reads them; nothing writes to Story-drive; WriterOS never reads OpenMontage receipts.
- Tests and fixtures never use Ben's story or character names.
- OpenMontage changes land on `authored-film` with the full pytest suite green; nothing under `projects/bloodless` is modified.

## Review Focus

1. **A look block whose prompt_safe_description contains a real person's name or an injection-shaped line** must be refused at Promote with a plain sentence (Task 3 validator reuses the vendored patterns; test).
2. **Promoting a second look for the same entity** must supersede the first record and produce an export where only the new one is active (Task 3 test) and, in OpenMontage, an activate receipt naming `supersedes_look_hash` (Task 12).
3. **A stale export** (memory revision moved on since the file was written) must be refused by OpenMontage ingest with "re-export" (Task 9 test).
4. **Zoe replying with a field value** ("her hair is grey") must not land in the draft; the form only changes when the writer types (Task 6 test: model reply containing YAML-like text leaves the draft untouched).
5. **A casting-inspiration answer** must make the form hide face-level fields and the prompt tell Zoe never to ask for them (Task 4 prompt test + Task 6 form test).

---

## File map

**WriterOS — create**
- `shared/canonicalJson.ts` — RFC 8785 canonical bytes + `sha256Hex`; `lookHash(spec)`.
- `shared/lookSpec.ts` — zod mirror of `look_spec` 1.1 (character/location branches, dependency ref forms), `LookSpecPayloadSchema`, `validateLookSpecForPromotion` (word count 20–80, ≤600 chars, injection scan, attestation/minor/spoiler rules).
- `shared/looks.ts` — `LooksDocumentSchema` (drafts), `LookSessionContextSchema` (what the client sends wp-chat in a look session), `LookPromoteRequestSchema`/`ResponseSchema`.
- `server/looks/lookPromote.ts` — validate → publish record → write export.
- `server/looks/lookRoutes.ts` — `POST /api/looks/:projectId/promote`, `GET /api/looks/:projectId/export` (returns the current export contents).
- `server/looks/buildLookContract.ts` — Zoe's look-session prompt section.
- `client/src/components/writing/looks/LookPanel.tsx`, `LookDraftForm.tsx`, `LookEntryButton.tsx`, `client/src/lib/looksClient.ts`, `client/src/lib/lookDraftEdits.ts`.
- `tests/fixtures/lookSpec/` — vectors and synthetic blocks; `tests/shared/canonicalJson.test.ts`, `tests/shared/lookSpec.test.ts`, `tests/server/lookPromote.test.ts`, `tests/server/lookRoutes.test.ts`, `tests/server/lookContract.test.ts`, `tests/components/LookPanel.test.tsx`, `tests/lib/projectPackageLooks.test.ts`.

**WriterOS — modify**
- `shared/projectMemory.ts` — `MemoryPayloadSchema` (discriminated on `kind`, first variant `look_spec`), optional `payload` on `ProjectMemoryRecordSchema` and `PublishMemoryInputSchema`.
- `server/projectMemory/store.ts` — carry `payload` through publish/replay/snapshot; `projections.ts` renders a look block in canon.md.
- `server/routes.ts` — `wpChatSchema` gains optional `lookSession`; handler passes it to `createPersonaSystemPrompt`; register look routes.
- `server/ai/openaiService.ts` — Zoe case appends `buildLookContract(lookSession)` when present.
- `server/lookbook/buildLookbookPrompt.ts` — "do not ask about anything a promoted look covers" + the promoted looks list in the user message.
- `client/src/lib/projectPackage.ts`, `projectState.ts`, `useProjectState.ts`, `server/projectLibrary/routes.ts` (400 on invalid looks doc), `client/src/App.tsx`, `WritersRoom.tsx` (look-session tag on messages), `BeatSheetView.tsx` (Look promoted line), `StoryBibleCharacterCard` (entry button).

**OpenMontage — modify** (`/Users/ben/Projects/OpenMontage`, branch `authored-film`)
- `schemas/look_spec.schema.json` — version `"1.0" | "1.1"`; `$defs/writeros_ref {writeros_record_id, content_hash}`; `resolved_ticket_ref` gains it; `source_ticket_ref` stays optional.
- `schemas/artifacts/look_packet.schema.json` — `source_ticket_ref` optional; add `source_ref` `{system: 'writeros', record_id, memory_revision}`.
- `schemas/project_config.schema.json`, `lib/project_config.py` — optional `writeros_package` (absolute path to a `.writeros` package).
- `lib/look_ingest.py` — `parse_writeros_export(path, expected_project_id)`, `ingest_writeros_looks(project)`, `IngestedLook.source_ref`; `look_lock_request` takes either `ticket_path` or `export_path + promotion_id`.
- `lib/receipts.py` — `ENVELOPE_FIELDS['look_lock']` documents `promotion_refs`; `validate_envelope` type-checks `source_ticket_ref` (existing form) and `promotion_refs` items.
- `scripts/gate_approve.py` — `_construct_look_lock` accepts `source_export_path` + `promotion_id` (mutually exclusive with `source_ticket_path`), confines the path under `writeros_package`, re-parses the export, rebuilds the envelope with `promotion_refs`.
- `scripts/look_run.py` — `--source wayfinder|writeros` (default: auto — writeros if `writeros_package` is set and the export names the entity, else wayfinder).
- `backlot/state.py` — `_render_look_lock` shows the WriterOS source.
- Docs/contracts: `pipeline_defs/authored-film@1.5.yaml` line ~167 wording; `skills/pipelines/authored-film/look-lock-director.md`, `WORKFLOW.md`; `docs/plans/2026-08-26-look-lock-D10.md` gets a dated amendment note at the top.
- Tests: `tests/lib/test_look_ingest.py` (new export cases), `tests/lib/test_canonical_vectors.py` (emits the shared vector file), `tests/schemas/test_look_lock_schemas.py`, `tests/lib/test_gate_approve_selection.py`.

**Skill — modify** (`~/.claude/skills/story-wayfinder/`)
- `SKILL.md` lines 236–292 ("Look tickets…" through "e. Supersession") replaced by a short "Looks are decided in WriterOS" section; `revisit: look` register kept; a backup `SKILL.md.bak-2026-09-30` written first.
- `tests/rubric.md` and `tests/HARNESS.md`: look-ticket grading items retired or redirected.

---

### Task 0: Canonical-JSON vectors (OpenMontage, prerequisite for Task 1)

**Repo:** `/Users/ben/Projects/OpenMontage`, branch `authored-film`, worktree `feat/writeros-look-source`.
**Files:** create `tests/lib/test_canonical_vectors.py`, `tests/fixtures/canonical_vectors.json`.

- [ ] `test_canonical_vectors.py` builds the inputs (nested objects with non-ASCII keys, NFC and NFD forms of the same string, numbers `1`, `1.0`, `1e21`, `-0`, `0.1`, `9007199254740991`, arrays, booleans, null, and two synthetic look blocks: one character, one location, both valid 1.1) and, with `--regenerate`, writes `tests/fixtures/canonical_vectors.json` as `[{ "name", "input", "canonical", "sha256" }]` using the real `lib/canonical_json.canonical_bytes` and `record_sha256`. Without the flag it asserts the committed file still matches, and asserts the file's own sha256 against `CANONICAL_VECTORS_SHA256` in the test.
- [ ] Run `pytest tests/lib/test_canonical_vectors.py`; commit `test(canonical): shared canonical-JSON vectors for WriterOS`. Copy the file and the constant into WriterOS in Task 1.

---

### Task 1: Canonical JSON and the look-spec schema (WriterOS shared)

**Files:** create `shared/canonicalJson.ts`, `shared/lookSpec.ts`, `tests/shared/canonicalJson.test.ts`, `tests/shared/lookSpec.test.ts`, `tests/fixtures/lookSpec/vectors.json`, `tests/fixtures/lookSpec/synthetic-character.json`, `tests/fixtures/lookSpec/synthetic-location.json`.

**Interfaces (produces):**
```ts
// shared/canonicalJson.ts
export function canonicalJson(value: unknown): string   // RFC 8785 text
export function lookHash(validatedSpec: unknown): string // sha256Hex(canonicalJson(spec))
// shared/lookSpec.ts
export const LOOK_SPEC_VERSIONS = ['1.0', '1.1'] as const
export const LookSpecSchema: z.ZodType<LookSpec>          // discriminated on entity_kind; strict on both branches
export type LookSpec = CharacterLookSpec | LocationLookSpec
export const WriterOSDependencyRefSchema = z.object({ writeros_record_id: z.string().regex(/^mem_[0-9a-f]{32}$/), content_hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
export type LookSpecProblem = { path: string; message: string }
export function validateLookSpecForPromotion(spec: unknown): { ok: true; spec: LookSpec } | { ok: false; problems: LookSpecProblem[] }
```
Rules in `validateLookSpecForPromotion` beyond the schema: `prompt_safe_description` 20–80 words and ≤600 chars; every string leaf scanned with the injection patterns from `server/projectMemory/importer.ts` (move the pattern list to `shared/injectionPatterns.ts` so both sides import it; keep the hash test OpenMontage pins); `fictional_subject_attestation === true`; `minor === false`; `age_band` not `child`/`teen`; `shape_only` allowed (promotable, never generation-sufficient — that is OpenMontage's rule).

- [ ] **Step 1: Vectors (prerequisite: Task 0 has run).** Copy `/Users/ben/Projects/OpenMontage/tests/fixtures/canonical_vectors.json`, generated by Task 0 with OpenMontage's real `canonical_bytes` and `record_sha256`, into `tests/fixtures/lookSpec/vectors.json` here, unchanged, and copy `CANONICAL_VECTORS_SHA256` into the test so both repos pin the same bytes. Vectors cover: nested objects with non-ASCII keys, NFC and NFD forms of the same string, numbers `1`, `1.0`, `1e21`, `-0`, `0.1`, `9007199254740991`, arrays, booleans, null, plus the two synthetic look blocks. WriterOS's `canonicalJson` refuses non-finite numbers and integers outside the JS safe range with a thrown error (OpenMontage serialises big ints as digits; WriterOS never produces them).
- [ ] **Step 2: Failing tests.** `canonicalJson.test.ts`: every vector's `canonical` and `sha256` match. `lookSpec.test.ts`: the synthetic character and location blocks parse; a block with both branches' fields is rejected; a 1.1 `depends_on` with a `writeros_record_id` form parses; `validateLookSpecForPromotion` refuses: 19-word description, `minor: true`, attestation false, an injection line ("ignore previous instructions"), a description naming a known real-person pattern (reuse OpenMontage's `prompt_builder` name patterns if they are a simple list; otherwise skip this one and note it).
- [ ] **Step 3: Implement.** Canonical JSON, OpenMontage-compatible subset: NFC-normalise every string (keys and values) first; sort keys by UTF-16 code units; serialise strings with the JCS escape rules; numbers via `Number.prototype.toString` after refusing non-finite and unsafe integers; no whitespace. Assert every vector byte for byte before the hash check. Schema mirrors `schemas/look_spec.schema.json` field for field, including enums and array bounds.
- [ ] **Step 4: Run** `npx vitest run tests/shared/canonicalJson.test.ts tests/shared/lookSpec.test.ts`; then `npm run check`.
- [ ] **Step 5: Commit** `feat(looks): look-spec 1.1 schema and RFC 8785 look hash matching OpenMontage`.

---

### Task 2: Typed payload on memory records

**Files:** modify `shared/projectMemory.ts` (~104–138 record, ~163–213 publish input, snapshot types), `server/projectMemory/store.ts` (publish, replay, snapshot, `recordCanPromote` unchanged), `server/projectMemory/projections.ts` (canon.md rendering); tests `tests/server/projectMemoryStore.test.ts` (extend), `tests/server/projectMemoryProjections.test.ts` (extend or create).

**Interfaces:**
```ts
export const MemoryPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('look_spec'), version: z.enum(LOOK_SPEC_VERSIONS), spec: LookSpecSchema, lookHash: z.string().regex(/^[0-9a-f]{64}$/),
    reference: z.enum(['none', 'generated-elsewhere', 'casting-inspiration']) }).strict(),   // reference lives beside spec, never inside it, so it is persisted with the record and never enters lookHash
])
// ProjectMemoryRecordSchema and PublishMemoryInputSchema gain: payload: MemoryPayloadSchema.optional()
```
- [ ] Failing tests: publish with a `look_spec` payload (including `reference`) → record carries it after snapshot round trip; ledger replay keeps it; the export regenerated from `memory/snapshot.json` alone (no request state) lists each look's `reference`; `canon.md` renders `Look — <entity_id> (<entity_kind>) · look_hash <first 12>` and the YAML block under the claim; a record without payload is unchanged byte for byte in canon.md (regression on an existing fixture).
- [ ] Implement; `lookHash` is recomputed at publish and must equal the supplied one (else `invalid-payload`).
- [ ] Run `npx vitest run tests/server/projectMemory*`; `npm run check`. Commit `feat(memory): typed look_spec payload on records`.

---

### Task 3: Promote route and export file

**Files:** create `server/looks/lookPromote.ts`, `server/looks/lookRoutes.ts`, `shared/looks.ts` (request/response schemas), tests `tests/server/lookPromote.test.ts`, `tests/server/lookRoutes.test.ts`; modify `server/routes.ts` (register after `registerLookbookRoutes`).

**Interfaces:**
```ts
// shared/looks.ts
export const LookPromoteRequestSchema = z.object({
  spec: z.unknown(),                 // validated server-side
  entityName: z.string().min(1),     // for `entities`
  sessionId: z.string().min(1),      // ties to the draft/transcript tag
  citedRecordIds: z.array(z.string()).max(24),  // from the session's memory receipts; server derives depends_on from these
  reference: z.enum(['none', 'generated-elsewhere', 'casting-inspiration']),
  fieldSources: z.record(z.string(), z.literal('writer')),   // provenance for every field path present in spec
  expectedRevision: z.number().int().nonnegative(),
}).strict()
export const LookPromoteResponseSchema = z.object({ recordId, lookHash, memoryRevision, exportPath, supersededRecordId: z.string().nullable() }).strict()
// export file
export const LookLocksExportSchema = z.object({ version: z.literal(1), project_id, memory_revision, written_at,
  looks: z.array(z.object({ entity_kind, entity_id, look_spec: LookSpecSchema, look_hash, promotion_id, promoted_at, reference: z.enum(['none','generated-elsewhere','casting-inspiration']) }).strict()) }).strict()
// `reference` sits beside the block, never inside it, so it does not enter look_hash; the gate shows it to Ben.
```
Behaviour:
1. Same-origin + session; 503 when the library is disabled; the package is read (`store.readProject`) for the manifest and to confirm the project id.
2. `depends_on` is derived: for each `citedRecordId`, look up the ACTIVE record in the snapshot and emit `{ writeros_record_id: record.id, content_hash: record.source.sourceHash }`, sorted by record id, de-duplicated; unknown or inactive ids → 400 `unknown-citation`. Never mapped back to wayfinder ticket refs, whatever the record's origin. The client-supplied `spec.depends_on` is ignored and replaced (derived, never typed). The hash is computed AFTER derivation, and Task 12 checks that OpenMontage recomputes the same hash from the export.
3. Provenance and firewall: every field path present in `spec` must appear in `fieldSources` with value `writer`, else 400 `unattributed-field`; with `reference: 'casting-inspiration'`, the face-vocabulary and `distinguishing_marks` rules from Global Constraints apply, else 400 `firewall`. Then `validateLookSpecForPromotion` → 400 `{ error: 'invalid-look', problems }` with plain sentences.
4. Publish and export atomically. `memoryStore.publish` gains an optional `afterCommit(snapshot, revision)` hook that runs INSIDE the store's package lock after the ledger append and projections are written and before the lock is released; the promote route passes a hook that writes `memory/exports/look-locks-<revision>.json` from that committed snapshot (temp + fsync + rename) and removes older `look-locks-*.json`. A hook failure is logged, the publish still stands, and `GET /api/looks/:projectId/export` repairs: if no export exists or its `memory_revision` differs from the snapshot's, it regenerates the file under the lock before returning it. Publish via `memoryStore.publish` with `kind: 'canon'`, `requestedStatus: 'active'`, `source: { workflow: 'writeros', sourceId: 'looks/<entity_kind>/<entity_id>', sourceUri: 'writeros:looks/<entity_kind>/<entity_id>', sourceHash: lookHash, capturedAt: now, approval: 'explicit' }`, `dedupeKey: 'writeros:look:<entity_kind>:<entity_id>:<lookHash>'`, `payload`, `entities: [entityName]`, `spoiler: spec.spoiler`, `supersedes: [prior active look record id for the same key]`, `expectedRevision`. A revision conflict → 409.
5. The export lists every active `look_spec` record with the `reference` stored on its payload (so a repair or a restart regenerates it faithfully); the current revision's file is the only valid one (OpenMontage refuses a stale revision anyway).
6. Return the response. Nothing else in the package is touched; `documents/looks.json` is the client's to update (Task 6 removes the draft after a successful promote).

- [ ] Failing tests (route level, real temp package): promote a synthetic character look → record active with payload, export file lists it with `reference`; promote again with a changed hair line → first record superseded, export lists only the second, `supersededRecordId` set; the exported `look_hash` equals `lookHash(exportedSpec)` recomputed from the file; 400 on `minor: true`, on an injection line, on an unknown or inactive citation, on a field missing from `fieldSources`, on `casting-inspiration` with `distinguishing_marks` or the word "eyes" in the description; 409 on a wrong `expectedRevision`; two concurrent promotes for different entities both land and the final export lists both at the final revision; a hook that throws leaves the record active and `GET …/export` regenerates a file at the snapshot revision; the package tree is byte-identical except `memory/*`; session header required.
- [ ] Implement, run `npx vitest run tests/server/look*`, `npm run check`. Commit `feat(looks): promote a look into canon and export it for the look_lock gate`.

---

### Task 4: Zoe's look contract in wp-chat

**Files:** create `server/looks/buildLookContract.ts`; modify `server/routes.ts` (`wpChatSchema` gains `lookSession?: LookSessionContextSchema`; handler threads it), `server/ai/openaiService.ts` (Zoe case appends the contract; `createPersonaSystemPrompt` gains an optional `lookSession` argument), `shared/looks.ts` (`LookSessionContextSchema`); tests `tests/server/lookContract.test.ts`, extend `tests/server/wpChatRoute.test.ts`.

**Interfaces:**
```ts
export const LookSessionContextSchema = z.object({
  sessionId: z.string().min(1),
  entityKind: z.enum(['character', 'location']),
  entityId: z.string().regex(/^[a-z0-9-]+$/).max(96),
  entityName: z.string().min(1),
  reference: z.enum(['unasked', 'none', 'generated-elsewhere', 'casting-inspiration']),
  filledFields: z.array(z.string()).max(64),    // field paths the writer has filled, so Zoe moves on
  draftSummary: z.string().max(4000),           // the current draft rendered as YAML, for Zoe to read back
}).strict()
export function buildLookContract(ctx: LookSessionContext): string
```
Contract text (verbatim in the file, tests assert the sentences): one question at a time; never propose a value, never fill a field, never infer heritage; ask the reference-image question first if `reference === 'unasked'`, in these words: "Do you have a reference image for this character/location?"; when `casting-inspiration`: only the allowlisted type fields, no facial descriptors, and stop the writer if they describe the face; when fictional with no casting image: reach eye colour, eyewear, complexion; ask `fictional_subject_attestation`, `minor`, `spoiler` as direct questions; before the writer promotes, read back the draft and name the writer-stated-only fields (`heritage_note`, face detail not yet given) as "yours to state if you want them; I won't ask"; reply JSON `{message, suggestions}` as today, where `suggestions` are at most three next questions, never values.

- [ ] Failing tests: contract contains each sentence; wp-chat with `lookSession` includes the contract in the system prompt for `personaId: 'zoe'` and not for `sam`; wp-chat without `lookSession` is byte-identical to today (snapshot of the prompt for a fixed context).
- [ ] Implement; keep `/api/wp-chat` a thin adapter (the only change is passing one optional argument through). Run `npx vitest run tests/server/wpChatRoute.test.ts tests/server/lookContract.test.ts`; commit `feat(looks): Zoe look contract in look sessions`.

---

### Task 5: Draft document `documents/looks.json`

**Files:** modify `shared/looks.ts` (`LooksDocumentSchema`), `client/src/lib/projectPackage.ts` (`WRITEROS_LOOKS_PATH`), `client/src/lib/projectState.ts` (`documents.looks?`), `client/src/lib/useProjectState.ts` (`setLooks(updater)`), `server/projectLibrary/store.ts` (`PACKAGE_TEXT_PATHS`), `server/projectLibrary/routes.ts` (400 `invalid-looks`), `server/projectMemory/writerOSObserver.ts` (comment); tests `tests/lib/projectPackageLooks.test.ts`, extend `tests/server/beatSheetRoutes.test.ts` round-trip test to cover looks.

```ts
export const LookDraftSchema = z.object({ sessionId, entityKind, entityName, reference: LookSessionContextSchema.shape.reference, spec: z.record(z.unknown()), fieldSources: z.record(z.string(), z.literal('writer')), citedRecordIds: z.array(z.string()).max(24), updatedAt }).strict()
export const LooksDocumentSchema = z.object({ version: z.literal(1), drafts: z.record(z.string(), LookDraftSchema) }).strict()   // key `${entityKind}:${entityId}`
```
- [ ] Mirror the Lookbook file's tests exactly (written when defined, kept when absent, invalid → 400, server round trip byte-identical, `migrateState` and browser save carry it). Commit `feat(looks): draft looks document`.

---

### Task 6: The Look panel

**Files:** create `client/src/components/writing/looks/LookPanel.tsx`, `LookDraftForm.tsx`, `LookEntryButton.tsx`, `client/src/lib/looksClient.ts`, `client/src/lib/lookDraftEdits.ts`; modify `client/src/App.tsx` (a `'look'` ritual/pane like `'memory'`, opened with `{entityKind, entityId, entityName}`), `client/src/components/writing/WritersRoom.tsx` (messages tagged `lookSessionId` shown only in the panel's chat, hidden from the normal Zoe tab), `client/src/components/writing/outline/LookbookBeat.tsx` (entry: "Start a look for …" when a Lookbook answer names a character/location — the writer picks the entity from a small list built from Story Bible characters plus a free-text location name), `client/src/components/writing/storyBible/StoryBibleCharacterCard.tsx` (entry button), `client/src/components/writing/outline/BeatSheetView.tsx` ("Look promoted: <name>" read-only line when an active look record's entity name appears in the beat's Lookbook answers or beat text), `server/lookbook/buildLookbookPrompt.ts` (pass promoted looks; "do not ask about anything a promoted look already covers"); tests `tests/components/LookPanel.test.tsx`, `tests/components/LookDraftForm.test.tsx`, extend `tests/components/BeatSheetView.test.tsx`.

Panel behaviour:
- Left: the Zoe chat for this session (send goes through `handleSpecialistSend('zoe', text)` with `lookSession` context; messages tagged with `sessionId`). Right: `LookDraftForm`, one control per schema field for the chosen branch, values typed by the writer only; `reference` is a three-way choice recorded as a word; choosing `casting-inspiration` hides face-level free text and shows the firewall sentence; `entity_id` pre-filled from the name (slugged), editable, confirmed once.
- Live validation runs `validateLookSpecForPromotion` on every change and lists problems in plain sentences; the hash preview shows `look_hash` when valid.
- `citedRecordIds` accumulate from each Zoe reply's `memoryReceipt.citations`.
- **Promote** is enabled only when validation passes; it posts `LookPromoteRequest` with the session's `expectedRevision` (from `useProjectMemory`), on success removes the draft, shows "Promoted · look_hash … · awaiting Front Lot ratification", and refreshes memory. A 409 shows "Memory moved on; reload and try again." A 400 lists the problems.
- Model text never touches the form: the only writers to `setLooks` are the form's `onChange` (which also records `fieldSources[path] = 'writer'`) and the promote success path. Promote sends `reference` and `fieldSources` from the draft.

- [ ] Tests: form fields per branch; casting-inspiration hides face fields and shows the firewall line; typing updates `documents.looks` through `setLooks`; a Zoe reply containing `hair: grey` leaves the draft unchanged; Promote disabled until valid; Promote success removes the draft and shows the promoted line; 400 problems rendered; beat shows "Look promoted" line for a matching entity; Lookbook prompt test asserts the promoted-look instruction.
- [ ] Run `npx vitest run tests/components tests/lib`, `npm run check`; commit `feat(looks): Look panel with Zoe chat, writer-typed draft, and Promote`.

---

### Task 7: Firewall and never-draft tests, full verification

- [ ] `tests/server/lookContract.test.ts` and `tests/components/LookPanel.test.tsx` cover Review Focus 4 and 5; `tests/server/lookPromote.test.ts` covers 1 and 2. Add the CLAUDE.md verification: `npm run test:run`, `npm run check`, `npm run build`; visual check of the panel in the test app on port 5199 (screenshots saved to the scratchpad and named in the report).
- [ ] Commit any test-only additions `test(looks): firewall and never-draft guards`.

---

### Task 8: OpenMontage schema 1.1 and canonical vectors

**Repo:** `/Users/ben/Projects/OpenMontage`, branch `authored-film`; work in a worktree `feat/writeros-look-source`.

- [ ] `schemas/look_spec.schema.json`: `version` enum `["1.0","1.1"]`; `$defs/writeros_ref`; `resolved_ticket_ref` oneOf gains it; the two branches' `properties` unchanged otherwise. `schemas/artifacts/look_packet.schema.json`: `source_ticket_ref` optional, `source_ref` added. `lib/look_spec.py`: accept both versions.
- [ ] Vectors already exist from Task 0; confirm `tests/lib/test_canonical_vectors.py` passes unchanged after the schema edits (the two synthetic blocks in the fixture are 1.1 blocks).
- [ ] `pytest tests/lib/test_look_spec.py tests/schemas tests/lib/test_canonical_vectors.py`; commit `feat(look): look_spec 1.1 with a WriterOS dependency reference; canonical vectors`.

---

### Task 9: Ingest the WriterOS export; gate and look_run accept it

**Files:** `lib/look_ingest.py`, `lib/receipts.py`, `scripts/gate_approve.py`, `scripts/look_run.py`, `lib/project_config.py`, `schemas/project_config.schema.json`, `backlot/state.py`; tests `tests/lib/test_look_ingest.py` (new cases), `tests/lib/test_gate_approve_selection.py`, `tests/backlot/test_gates_state.py`.

Behaviour:
- `project.yaml` optional `writeros_package: /abs/path/to/Show (id).writeros` (absolute, exists, no symlinks, confined like `wayfinder_root`).
- `parse_writeros_export(path, project_id)`: JSON per `LookLocksExportSchema`; `project_id` must match; each look's `look_spec` validated (1.0 or 1.1); `record_sha256(look_spec) == look_hash` else `LookIngestError("export hash mismatch; re-export from WriterOS")`; `memory_revision` must equal the revision in `<package>/memory/snapshot.json` else `LookIngestError("export is stale; re-export from WriterOS")`; returns `IngestedLook(..., source_ticket_ref=None, source_ref={"system":"writeros","record_id":promotion_id,"memory_revision":..., "reference": <none|generated-elsewhere|casting-inspiration>})`; `reference` is required in the export entry and refused if missing or not one of the three words.
- `look_lock_request(..., export_path=..., promotion_id=...)` writes `source_export_path` + `promotion_id` instead of `source_ticket_path`. Wire form, pinned everywhere (request hint, `_construct_look_lock`, receipt, tests): the envelope has `promotion_refs: [{"system": "writeros", "record_id": "mem_<32hex>", "memory_revision": <int>}]` and NO `source_ticket_ref` key at all (absent, not null). A wayfinder request keeps `source_ticket_ref` and has no `promotion_refs` key.
- `gate_approve._construct_look_lock`: if the request has `source_export_path`, confine under `writeros_package`, parse the export, select the look by `promotion_id`, build record + envelope; `construct()`'s hint-equality check unchanged. The gate's human-facing evidence block for a WriterOS look prints `Source: WriterOS promotion <record_id> (memory revision N) · Reference image: <reference>` alongside the existing attestation line, so Ben sees the reference mode before approving. `reference` is display evidence only: not in the record, not in the envelope. `validate_envelope` gains exact discriminated checks: `source_ticket_ref`, when present, must be `{id: wf-8hex}` or `{path, content_sha256: 64hex}` and `promotion_refs` must be absent; `promotion_refs`, when present, must be a non-empty list of `{system: 'writeros', record_id: ^mem_[0-9a-f]{32}$, memory_revision: int ≥ 0}` and `source_ticket_ref` must be absent; anything else raises.
- `look_run --source writeros|wayfinder|auto`; `_start_look` and `_republish` branch on the source; `_finish_look` puts `source_ref` into the packet.
- `active_looks`, `verify_look_refs`, invalidation, headshots: untouched (they key on hash).

- [ ] Tests: export ingest happy path; hash mismatch refused; stale revision refused; project id mismatch refused; symlinked package refused; gate constructs a receipt from an export whose envelope carries `promotion_refs` and has no `source_ticket_ref` key (hint equality passes with the request written by `look_lock_request`); the gate's evidence output for a WriterOS look contains the reference mode (test captures the printed evidence); an export entry without `reference` is refused; `validate_envelope` rejects a null `source_ticket_ref`, a wayfinder envelope with `promotion_refs`, and a `promotion_refs` item with a bad record id; supersession from a wayfinder-ratified look to a WriterOS-promoted one for the same entity produces an activate receipt with `supersedes_look_hash` and invalidates headshots onward (existing invalidation test extended); backlot renders the WriterOS source.
- [ ] Full suite `pytest`; commit `feat(look): WriterOS export as a look source for the look_lock gate`.

---

### Task 10: Contract text

- [ ] `pipeline_defs/authored-film@1.5.yaml` (~line 167): "Every entity in proposal_packet.cast has a ratified look, from a resolved wayfinder look ticket or a WriterOS promotion export." Same wording in `look-lock-director.md`, `WORKFLOW.md`, `executive-producer.md`, `headshots-director.md`. Top of `docs/plans/2026-08-26-look-lock-D10.md`: a dated note "Amended 2026-09-30: WriterOS owns the look interview and record (see WriterOS docs/superpowers/specs/2026-09-30-look-sessions-design.md); D10's 'Wayfinder owns looks' is retired for new looks." Commit `docs(look): looks may come from WriterOS`.

---

### Task 11: The wayfinder skill

- [ ] Back up `SKILL.md` to `SKILL.md.bak-2026-09-30`. Replace lines 236–292 with a section "Looks are decided in WriterOS" (about 12 lines): charting still registers `revisit: look` candidates; the skill never creates `look-*` tickets; when a writer asks for a look, say that looks are asked, answered and promoted in WriterOS's Look panel and ratified in Front Lot; existing `area: look` tickets stay valid and are never edited. Keep the `id:` rule and the legacy-ticket rule untouched. Rewrite, not trim, the harness: `tests/HARNESS.md` sessions 5–6 (the look-ticket sessions) become a "looks redirect" session (the writer asks for a look; the skill registers the candidate and points to WriterOS; it must not create a ticket) and a "legacy look ticket" session (an existing `area: look` ticket is read, never edited); `tests/rubric.md` items 29–42 (look tickets, YAML spec, reference paths, closing rules) are replaced by items grading the redirect and the legacy read-only rule, and item ~172's graduation rule no longer requires resolved look tickets.
- [ ] Sanity: `grep -n "look-character\|look-location\|Cast for production" SKILL.md` returns nothing outside the new section.

---

### Task 12: Dry run, end to end, on copies

- [ ] WriterOS test server on port 5199 against a copy of the projects folder (as for the Beat Sheet dry run). In a throwaway package (not a real show), run a look session for a synthetic character, promote, confirm the export file and the canon record.
- [ ] OpenMontage: a temporary project under `/private/tmp/...` with `writeros_package` pointing at that throwaway package; `look_run --source writeros --entity character:<id>`; Ben approves in a terminal (`gate_approve.py`) — the one step that needs him; confirm `active_looks` shows the hash; promote a second version in WriterOS, re-run, confirm `supersedes_look_hash` and invalidation.
- [ ] Record hashes and receipt ids in the ledger. Nothing under `projects/bloodless` or `~/WriterOS Projects` is touched.

---

## Self-review

- **Spec coverage:** L1 → Tasks 4, 6; L2 → 2, 3; L3 → 1 (+8 vectors); L4 → 1, 8; L5 → 3, 9; L6 → 5; L7 → 6 (slug); L8 → 6; L9 → 11; L10 → 9 (untouched), 12 (throwaway project only). Ground rules: never-draft → 4, 6, 7; firewall → 4, 6; attestations → 1, 3; depends_on derived → 3; no self-attestation → 1; promotion ≠ ratification → 3, 9, A3; one direction → 3, 9.
- **Placeholders:** Task 1 step 1 names the vector generation with a fallback; Task 9 behaviour is fully specified; UI tasks list concrete assertions.
- **Type consistency:** `LookSpecSchema`/`lookHash` (Task 1) used by 2, 3, 6; `LookSessionContextSchema` (4) used by 6; `LookLocksExportSchema` (3) mirrored by Task 9's parser; `promotion_id` = WriterOS record id everywhere.
- **Round 2 (Codex) changes:** Task 0 generates the vectors in OpenMontage before WriterOS Task 1 (circular sequencing removed); `reference` persisted on `MemoryPayloadSchema` beside `spec` so a regenerated export keeps it; OpenMontage's parsed source object and the gate's evidence carry `reference`, with tests.
- **Round 1 (Codex) changes:** dependencies always `writeros_ref`; `reference` + `fieldSources` in the promote request with server-side firewall and provenance checks; publish+export atomic via an in-lock `afterCommit` hook with a repairing GET; WriterOS envelope omits `source_ticket_ref`; exact `validate_envelope`; canonical JSON declared an OpenMontage-compatible subset with vectors generated by OpenMontage; harness sessions 5–6 and rubric 29–42 rewritten.
- **Review Focus:** 1 → Task 3; 2 → Tasks 3 and 9/12; 3 → Task 9; 4 → Task 6; 5 → Tasks 4 and 6.
