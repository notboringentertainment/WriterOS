# Plan Review Log: Look sessions in WriterOS
Started 2026-09-30 morning. MAX_ROUNDS=5. Codex model: gpt-5.5 (pinned with -m for this review), read-only every round.

## Round 1 — Codex (gpt-5.5)

Material problems found:

- High: `depends_on` is not stable across the two systems. The design says WriterOS look dependencies are cited canon records as `{writeros_record_id, content_hash}` ([design](</Users/ben/Projects/WriterOS/docs/superpowers/specs/2026-09-30-look-sessions-design.md:19>)), but Task 3 maps wayfinder-sourced memory back into ticket refs ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:185>)). OpenMontage derives ticket deps from `blocked-by` and exact ticket bytes ([look_ingest.py](</Users/ben/Projects/OpenMontage/lib/look_ingest.py:403>)), so this can change `record_sha256` or encode unverifiable pseudo-ticket lineage. Fix: always derive WriterOS citations as the new 1.1 `writeros_ref` form, and test the final promoted spec hash against OpenMontage after dependency derivation.

- High: the casting-inspiration firewall is only client/prompt-enforced. The promote request has `spec`, `sessionId`, and citations, but no trusted `reference` value ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:171>)); yet the safety rule depends on whether the writer selected `casting-inspiration` ([design](</Users/ben/Projects/WriterOS/docs/superpowers/specs/2026-09-30-look-sessions-design.md:17>)). A direct POST can include face descriptors and still validate. Fix: send and server-validate the reference mode, or store it in the draft/session server-side and reject disallowed fields at promote.

- High: promote and export are not one atomic operation. Task 3 publishes memory, then writes/removes export files afterward ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:187>), [PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:188>)); `memoryStore.publish` takes its own lock and returns after writing projections ([store.ts](</Users/ben/Projects/WriterOS/server/projectMemory/store.ts:1117>)). A crash or concurrent promotion can leave active canon with no matching current export, or delete a newer export. Fix: hold the package lock across publish plus export, or add a store transaction/hook that writes the export from the exact committed snapshot before releasing the lock.

- High: the WriterOS gate envelope is internally inconsistent. Task 9 says writeros `look_lock_request` writes `source_ticket_ref: None` ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:272>)), but the test expects “no `source_ticket_ref`” ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:277>)). Gate hint equality is exact ([gate_approve.py](</Users/ben/Projects/OpenMontage/scripts/gate_approve.py:1438>)), so null versus absent will refuse approval. Fix: choose one wire form, preferably omit `source_ticket_ref` for WriterOS, and pin request, constructor, receipt, and tests to that exact shape.

- Medium: canonical JSON is described as RFC 8785, but OpenMontage’s implementation has repo-specific behavior. It sorts NFC keys by UTF-16 and normalizes strings ([canonical_json.py](</Users/ben/Projects/OpenMontage/lib/canonical_json.py:100>), [canonical_json.py](</Users/ben/Projects/OpenMontage/lib/canonical_json.py:115>)), but Python ints outside JS safe range serialize as plain digits ([canonical_json.py](</Users/ben/Projects/OpenMontage/lib/canonical_json.py:96>)). A JS implementation using `Number.prototype.toString` cannot generally match that. Fix: define the WriterOS function as “OpenMontage-compatible JCS subset,” reject unsafe numeric values, and generate vectors from OpenMontage’s actual `canonical_bytes`.

- Medium: `source_ticket_ref` validation remains too weak for the new envelope. Receipts only check `promotion_refs` is a list ([receipts.py](</Users/ben/Projects/OpenMontage/lib/receipts.py:390>)); the plan says to type-check items, but not to enforce `system === 'writeros'`, record id shape, memory revision integer, or absence on wayfinder receipts. Fix: add exact discriminated validation for WriterOS `promotion_refs` and source forms in `validate_envelope`.

- Medium: Task 11 will leave the story-wayfinder harness contradictory unless it rewrites more than “look-ticket creation” items. Current rubric 31-42 still grades look tickets, YAML specs, reference paths, and closing rules ([rubric.md](</Users/ben/.claude/skills/story-wayfinder/tests/rubric.md:100>), [rubric.md](</Users/ben/.claude/skills/story-wayfinder/tests/rubric.md:145>)), and graduation still requires resolved look tickets ([rubric.md](</Users/ben/.claude/skills/story-wayfinder/tests/rubric.md:172>)). Fix: rewrite HARNESS sessions 5-6 and rubric 29-42 around “register candidates and redirect to WriterOS,” with legacy ticket behavior tested separately if needed.

- Medium: the “writer typed every value” invariant is not actually observable server-side. Tests only prove a Zoe reply does not auto-update the form ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:241>)), but promote accepts arbitrary `spec` JSON ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:172>)). Fix: either weaken the claim to a UI invariant, or add per-field provenance/audit in `documents/looks.json` and reject fields last written by anything other than form input.

VERDICT: REVISE

### Claude's response to Round 1

Accepted all 8:
1. depends_on stability → always `{writeros_record_id, content_hash}` from the ACTIVE cited record, sorted, de-duplicated; never mapped to ticket refs; hash computed after derivation; Task 12 cross-checks the hash in OpenMontage.
2. Firewall client-only → `reference` is in the promote request and the export (beside the block, not in the hash); server refuses `distinguishing_marks` and a face-vocabulary list under casting-inspiration.
3. Promote/export not atomic → `memoryStore.publish` gains an in-lock `afterCommit(snapshot, revision)` hook that writes the export from the committed snapshot; `GET …/export` repairs a missing/stale file under the lock; tests for a throwing hook and concurrent promotes.
4. Envelope null vs absent → WriterOS envelope has NO `source_ticket_ref` key; pinned in request, constructor, receipt and tests.
5. Canonical JSON claims → declared an OpenMontage-compatible subset; unsafe/non-finite numbers refused; vectors generated by OpenMontage's real functions (Task 8 step 2 precedes Task 1).
6. Envelope validation weak → exact discriminated `validate_envelope` for both forms, mutually exclusive.
7. Harness contradiction → HARNESS sessions 5–6 and rubric 29–42 rewritten (redirect + legacy read-only), graduation rule updated.
8. "Writer typed every value" unobservable → restated as UI invariant + audit; `fieldSources` provenance recorded by the form, sent with promote, checked server-side (`unattributed-field`).

Rejected: none.

## Round 2 — Codex (gpt-5.5)

Round 1 fixes most of the Round 0 blockers, but I still see material problems.

- High: the canonical-vector sequencing is circular. The plan says Tasks 1-7 are WriterOS and OpenMontage starts at Task 8 ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:14>)), but Task 1 now requires “Task 8 step 2 has run” ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:140>)), while Task 8 says the vector file is “the same file WriterOS committed in Task 1” ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:264>)). Fix: split vector generation into a Task 0/OpenMontage prerequisite, or move Task 8’s vector step before WriterOS Task 1 and make both repos consume that single generated fixture.

- High: `reference` is required in the export but has nowhere durable to live. The promote request/export add `reference` ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:177>), [PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:184>)), and the export is generated from every active `look_spec` record in the snapshot ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:192>)); however the memory payload schema stores only `{ kind, version, spec, lookHash }` ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:154>)). After a restart or repair export, older active looks have lost their reference mode. Fix: persist `reference` in `MemoryPayloadSchema` outside `spec`, and test export regeneration from `memory/snapshot.json` without request-local state.

- Medium: the gate-visible reference promise is underspecified on the OpenMontage side. The plan says `reference` sits beside the block so the gate can show it ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:185>)), but `parse_writeros_export`/`IngestedLook` behavior only mentions `source_ref` ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:275>)) and `_construct_look_lock` only says build record + envelope ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:277>)). Fix: add `reference` to the parsed WriterOS source object and gate evidence, with a test asserting `gate_approve` displays it for WriterOS looks.

VERDICT: REVISE

### Claude's response to Round 2

Accepted all 3: (1) new Task 0 in OpenMontage generates the vector file first; Task 1 copies it; Task 8 only re-runs the test. (2) `reference` persisted on `MemoryPayloadSchema` beside `spec`; export regenerated from the snapshot alone carries it (test). (3) OpenMontage `source_ref` carries `reference`, the export refuses a missing one, and the gate prints it as evidence (test captures the printed block). Rejected: none.

## Round 3 — Codex (gpt-5.5)

Findings: no material blockers remain.

Round 2 closes the prior issues cleanly: Task 0 now generates OpenMontage vectors before WriterOS consumes them ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:121>)); `reference` is durable in `MemoryPayloadSchema` and export regeneration is tested from snapshot-only state ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:164>), [PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:170>)); and OpenMontage parsing/gate evidence now carries and displays the reference mode without putting it into the signed record/envelope ([PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:286>), [PLAN.md](</Users/ben/Projects/WriterOS/PLAN.md:288>)).

Residual risks are implementation risks, not plan blockers: the existing OpenMontage code is still ticket-shaped today, and `fieldSources` remains an audit/UI invariant rather than cryptographic proof, but the plan names those constraints and includes the right focused tests.

VERDICT: APPROVED

## Outcome (superseded by Round 4)

APPROVED after 3 rounds (2 REVISE, 1 APPROVED). No code written. Residual (implementation, not plan): OpenMontage code is ticket-shaped today; fieldSources is an audit, not proof.

## Round 4 — Claude code check, then Codex (gpt-5.5), 2026-09-30 afternoon

Claude checked the approved plan against the code and found F1 (rollback false: record and ledger schemas are strict), F2 (export refused after any unrelated memory write because ingest required revision equality), F3 (stale Task 8 / RFC 8785 references; real-person check optional), F4 (stacked on an unmerged branch). Codex, read-only, confirmed F1 and F3, confirmed the F2 failure path (corrected "almost always" to "one unrelated write suffices"), rated F4 partly (stacking fine if the parent lands first), and added three findings. Claude verified each new one in code before accepting:

- A → B → A returns the superseded A: confirmed, `store.ts:1133` dedupes on key + sourceHash across all history before revision/supersession.
- `1e21` must match yet must be refused: confirmed, OpenMontage emits `1e+21`, and the plan refuses unsafe integers.
- Universal envelope discrimination breaks retirement: confirmed, `gate_approve.py:352` builds `{action, entity_kind, look_hash}`. Also `IngestedLook` requires `source_ticket_ref` and has no `source_ref` (`look_ingest.py:63`).

### Claude's response to Round 4

Accepted all. Task 2 deploys alone as the rollback floor; freshness checked per record against `snapshot.json` with Codex's stronger binding (active canon, look_spec payload, recomputed hash, spec and reference equal, single active look per entity) and a stated local-trust assumption; `promotionOpId` per click as the dedupe key; vectors split into `match` and `refuse`; real-person patterns ported from `tools/prompt_builder.py` and described as documented patterns only; activate-only envelope checks with retire untouched; `IngestedLook` fields optional, exactly one set; parent branch lands first, then rebase and re-verify. Rejected: none. Not re-reviewed yet.

## Round 5 — Codex (gpt-5.5), then Claude code check

Codex: REVISE. OK on rollback floor (the reader release must include Task 1's schema), vectors, activate-only envelope checks, prompt_builder source. PROBLEM on: export completeness (an A-only export stays valid after B's export hook fails); promotionOpId binding (same op id with a different hash republishes; changed reference silently returns the old record; a retry fails `unknown-citation` if a cited record went inactive, because citations are checked before dedupe); `build_look_packet` emits a null `source_ticket_ref` for WriterOS looks. Fallout: test helper `activate_look` passes `promotion_refs: []` + `source_ticket_ref: None`; vector wording still says "every vector"; Review Focus 1 overpromises.

Claude verified each in code (look_ingest.py:672, look_lock_helpers.py:153, store.ts:1133, store.ts:408–418) and found one more that neither round caught: all five Bloodless look_lock receipts, and today's builders (look_ingest.py:619, gate_approve.py:383), carry `promotion_refs: []` beside `source_ticket_ref`. The Round 4 rule "promotion_refs must be absent on a wayfinder envelope" would refuse the next wayfinder ratification. validate_envelope runs only at minting (receipts.py:296), so existing receipts are safe.

### Claude's response to Round 5

Accepted: export set must equal the active look set (highest-revision file read if two exist), with a Re-export button and `exportWritten: false` so the "stale" message has an action; retry lookup by op id before any other check, 409 `op-reused` on changed content; `build_look_packet` emits only the set source; helper fixed without weakening the rule; wording fixes. Changed: wayfinder wire form stays `source_ticket_ref` + `promotion_refs: []`, byte-identical to today. Declined: refusing looks with an open memory conflict; WriterOS treats them as active and Ben's terminal approval weighs it. Not re-reviewed.

## Task 12 — dry run through the real Look panel (2026-09-30, passed)

Scratch only: WriterOS test build on port 5198 against a scratch library (project "Vector Courier", invented character Mara Kell); OpenMontage worktree `feat/writeros-look-source` with its own projects and gates directories in the session scratchpad. Nothing under `projects/bloodless` or `~/WriterOS Projects` was touched.

| Step | Result |
|---|---|
| Look panel: Zoe's first reply | "Do you have a reference image for this character?" |
| Promote v1 (all fields typed in the form) | `mem_21793b0872a3a91f5055dba6ca758599`, look_hash `83ce81e41751…` (equal to the panel's preview), export written |
| `look_run` (default `--source auto`) | picked WriterOS; gate evidence "Source: WriterOS promotion mem_21793b08… (memory revision 8) · Reference image: none" |
| Ben's approval 1 | receipt `9feae9e4-0fd9-42d8-869a-c5209d16cc60`; envelope `promotion_refs [{system: writeros, record_id: mem_21793b08…}]`, no `source_ticket_ref` key |
| Promote v2 (jacket → long oilskin coat) | `mem_eaa5e3413dc71bfa7949659382630a2b`, look_hash `828aa63c35b9…`; panel warned it replaces the promoted look |
| `look_run` without / with `--supersede` | refused / request written |
| Ben's approval 2 | receipt `c007b1af-ba48-4937-976e-a35265c9ccbf`, `supersedes_look_hash 83ce81e41751…` |
| After | active look `828aa63c35b9…` (wardrobe "long oilskin coat"); packet `source_ref {record_id: mem_eaa5e341…, memory_revision: 9, reference: none}`; the old look_hash refused by `verify_look_refs` |

## Follow-ups found during the build (not in this plan)

- **FIXED (same day): Changing a promoted look means retyping it.** The Look panel now offers "Start from the promoted look" on an empty draft; it copies the writer's own promoted answers and reference answer (writer provenance kept), carries only still-active citations, and blocks Promote while the draft is identical to the promoted look. Verified in the built app on Mara Kell: the copied draft hashed to the ratified look exactly (828aa63c35b9); one changed line unlocked Promote. Original note: Promote removes the draft, so reopening the Look panel for an entity with a promoted look starts from an empty form (found in the Task 12 dry run: changing one wardrobe line meant retyping every field). Likely fix: a "Start from the promoted look" action that copies the writer's own promoted values into a new draft, each still marked writer-typed. This does not break never-draft: the values are the writer's earlier answers, not a model's.

- **Background memory analysis raises false conflicts against promoted looks** (found 2026-09-30 in the Task 6 visual check). Naming a Story Bible character "Vector Courier" made the WriterOS observer publish the document fact "The character's name is now Vector Courier" with an open conflict against that character's promoted look record, though the two do not disagree. In a real project this is review noise sitting beside a look awaiting ratification (OpenMontage deliberately does not refuse a look with an open WriterOS conflict). Likely fix: the observer/analyzer should not name look_spec canon records as conflict targets, or should treat them as reference-only. Ben approved logging it; to be handled after Task 12.
- **Task 10 deviation: pinned manifests are frozen.** The plan said to edit `pipeline_defs/authored-film@1.5.yaml` (~line 167). That file's bytes are bound by signed `pipeline_migration` receipts (Bloodless pins 1.5 at `881e1f02…`), so any edit makes every pinned project refuse to run until the writer signs a new migration. The wording went into the director docs instead (OpenMontage `look-lock-director.md`, `WORKFLOW.md`), which tell directors to read the 1.5 review focus as "a wayfinder ticket or a WriterOS promotion"; the manifest wording waits for the next version.
- **Flaky test on the parent branch**: `tests/server/beatSheetRoutes.test.ts` "a PUT with no lookbook key…" fails about one full run in three with ENOTEMPTY on temp-dir cleanup (cleanup races a background memory write). Fix on feat/beat-sheet-lookbook before it merges.

## Codex code review of the WriterOS diff (2026-10-01) — verdict FIX FIRST

Each finding was checked against the code before any change.

| # | Finding | Outcome |
|---|---|---|
| 1 | Late Promote / Zoe reply edits a newer draft or another project | Real (worse than stated: a stale callback saves under the old project id). Fixed: panel ignores results after it closes; App checks the project key before acting; `removeDraft` and `applyZoeReplyToDraft` act only on the matching session id. |
| 2 | Stale client save erases newer look drafts | Not fixed. Same whole-package last-save-wins behaviour every document already has; only the client writes `looks.json`. A looks-only revision scheme is new design for a two-open-copies case. Deferred. |
| 3 | Casting firewall skips hair, build, wardrobe, era text | Real. Fixed: firewall covers every generator-read free-text field (heritage note left out on purpose: writer-stated, D16). |
| 4 | Concurrent reuse of one op id with different content | Not reachable from the app (Promote is disabled while sending; op ids are fresh UUIDs). Deferred. |
| 5 | Typing a wardrobe variant rewrites the text after one letter | Real ("wet: rain" became "w: et: rain"). Fixed: typed text kept while it still means the stored list. |
| 6 | Changed entity id lost after Promote (command and reopen) | Real. Fixed: command shows the promoted id; reopening finds the promoted look by id, else by name. |
| 7 | 25th citation dropped at the 24 cap | Real. Fixed: compares ids, not length. |
| 8 | Zero-width characters dodge the instruction check | Only deliberate odd input; OpenMontage still refuses it at render with a clear error. Deferred. |

Verification: `npm run test:run` 2861 passed / 10 skipped; `npm run check` clean; `npm run build` done.

## CodeRabbit review of PR #74 (2026-10-01)

| Comment | Outcome |
|---|---|
| Browser-folder adapter does not read lookbook/looks on reopen | Real (files stay on disk; drafts just don't load in that mode). Fixed: both paths read. |
| Casting firewall skips heritage_note | Real: OpenMontage renders it. Fixed (reverses the Codex-round exclusion). |
| `lookSending` cleared after a project switch | Skipped: only a spinner flag, worst case it clears a moment early. |
| Re-export error text from body | Skipped: wording only. |
| `filledFields` into Zoe's prompt | Skipped: field names from the writer's own authenticated client; Zoe's output never reaches the draft. |
| Retry returns revision 0 if export repair fails | Skipped: the client ignores that number and refreshes memory itself. |
