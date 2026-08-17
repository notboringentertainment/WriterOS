# Task 7 Report — Ground every WriterOS agent in project memory

## Status

Complete. WriterOS now builds unified project memory once at a server-owned `ProjectMemoryProvider` boundary, passes that exact immutable context through every story-content agent path, validates returned memory citations, and returns deterministic receipts tied to the revision the model actually received.

## Scope delivered

- Added one shared agent-context boundary for folder resolution, snapshot retrieval, authority rendering, safe unavailable/disabled classification, returned-citation filtering, and exact receipts.
- Added migration-compatible `projectId` fields to generic chat, OpenSwarm, persona-capability, synopsis, and every compose variant.
- Grounded native chat, WP chat, Morgan and her specialists, OpenSwarm Writing Partner, persona-capability research and synthesis, compose, synopsis assistance, Writers' Room specialist turns and Casey digest work, the scheduler, and Project Meeting start.
- Kept voice-profile synthesis explicitly outside project memory and covered the exclusion.
- Removed WP chat's direct Supabase shared-block lookup while preserving its existing `StoryMemory -> generatePersonaResponse` shape.
- Persisted agent-message receipts in Writers' Room rows via the additive `memory_receipt` JSONB migration.
- Preserved byte-identical prompt behavior when memory is disabled. Missing `projectId`, a server with no folder library, and an unlinked/browser-only project disclose `status: disabled`; linked corrupt, unreadable, swapped, or oversized memory fails closed with a safe repair response before any model or upstream request.

## Authority and safety contract

- Active canon is rendered as binding and cannot be silently contradicted or replaced.
- Document facts are current-document evidence, not canon mutations; development records are advisory.
- Every supplied unresolved, non-spoiler conflict is named in the prompt and exact receipt.
- Memory is structurally fenced as untrusted data, and all record/source/conflict text is escaped before interpolation.
- Only citation IDs present in the exact non-spoiler context are allowed. Invented and hidden IDs are removed recursively from returned text and structured results.
- The provider resolves and reads once per context build. Responses are finalized from that same object, so project swaps and revision changes cannot cause receipt drift.
- Request schemas discard client-provided memory prompts, blocks, and receipts; those values never become authority.

## RED / GREEN evidence

The work proceeded in isolated behavior cycles:

- Provider boundary RED: the new module and contract did not exist. GREEN added one-read folder retrieval, exact project identity checking, disabled versus unavailable states, fenced authority rendering, spoiler-safe visible citations/conflicts, and deterministic finalization.
- Native HTTP RED: chat returned no receipt and passed no server memory to the model. GREEN grounded chat with one exact context and filtered invented citations.
- HTTP parity RED: WP chat, OpenSwarm, persona capability, compose, and synopsis had no unified provider path. GREEN covered prompt injection, receipts, optional-project migration behavior, and fail-closed pre-model handling for all six story-content endpoints.
- Voice/WP compatibility RED: WP chat still queried Supabase shared blocks and the memory exclusion was not asserted. GREEN removed that dependency, retained the existing persona call path, and proved voice-profile synthesis never consults the provider.
- Room turn RED: specialist prompts and stored messages had no unified context/receipt. GREEN injects the provider into the room prompt, validates returned citations, and stores the exact receipt.
- Scheduler/digest RED: scheduled specialist and Casey paths did not carry the provider or retry corrupt unified memory. GREEN threads the provider through both modes, preserves completed-speaker progress, and requeues memory-unavailable work without calling the model.
- Project Meeting RED: interview start neither preflighted folder memory nor returned/stored a receipt. GREEN retrieves before session mutation, attaches the exact receipt to Morgan's audit message and response, and converts unavailable memory to the safe room 503 contract.
- Security/compatibility GREEN coverage explicitly proves an unlinked project is disabled, hostile source text cannot close the data fence, client memory fields are ignored, hidden citations/conflicts remain absent, revision-swap failures do not drift, and every corrupt HTTP path avoids model/upstream calls.

## Final verification

- Agent-context boundary: **1 file, 28 tests passed**.
- Review-round affected HTTP, capability, compose, UI, and Writers' Room suites: **23 files, 221 tests passed**.
- TypeScript validation (`npm run check`): **passed**.
- Whitespace validation (`git diff --check`): **passed**.
- Full suite (`npm run test:run`): **209 files passed, 2 skipped; 2,155 tests passed, 10 skipped**.
- Production build (`npm run build`): **passed**. The existing Vite large-chunk advisory remains informational.

## Review round 1 fixes

- RED proved the real App and compose component paths omitted stable folder-backed project identity; GREEN threads the active folder project ID through OpenSwarm, Zoe capability, outline, synopsis, and treatment requests while browser-only requests remain disabled and visibly disclose that status.
- RED proved Pitch Packet's alternate proposal model path bypassed unified memory; GREEN builds context once before room reads/model execution, fences it in the proposal prompt, filters proposal citations, safely rejects corrupt memory without a model call, and persists/returns the exact receipt.
- RED proved `remember` and `propose_field_write` could persist invented citations and lacked receipts; GREEN shared-finalizes model-authored values/rationales/pass reasons and attaches the exact receipt to private blocks, proposals, and proposal-reference messages. Casey's digest blocks now do the same.
- RED proved canon limits counted claims but not citation IDs, sources, conflicts, serialization, or rendered overhead; GREEN measures the complete canon-only JSON and literal Markdown representations and rejects oversized mandatory canon all-or-error.
- RED expanded citation syntax coverage across bracket whitespace, parentheses, bare IDs, and case variants. GREEN canonicalizes allowed labels, removes invented labels, and deduplicates receipt entries without changing ordinary non-citation text.
- RED exposed absolute, home, drive, UNC, control-character, private, and internal `.writeros` source paths in prompts/receipts. GREEN replaces them at the provider boundary with deterministic opaque `redacted-source` references while preserving safe workflow-relative and opaque URIs.
- RED proved post-context OpenSwarm and compose soft failures dropped the already-built receipt. GREEN returns the same receipt on safe failure bodies, and clients retain/display it.

## Self-review and concerns

- Error responses contain only stable safe messages; filesystem errors, package paths, and hidden source material are not returned.
- Project Meeting's initial audit is deterministic rather than model-generated. It still preflights the exact unified revision before mutation and records that revision on Morgan's audit message, which provides parity without inventing a redundant model call.
- Capability receipt parsing remains backward-compatible with pre-Task-7 stored receipts, while every new runtime response includes the memory receipt.
- The room migration is additive and nullable so existing writer/system messages and deployed rows remain valid.
- No voice-profile prompt or response contract was changed.

## Review round 2 fixes

- RED proved deferred OpenSwarm, Zoe, outline, synopsis, and treatment responses could land after a project swap. GREEN captures project identity plus a monotonic request generation, ignores every stale success/error/finally path, permits the new project's request immediately, and clears old output/receipt status on project change.
- RED proved room messages/proposals and Project Meeting/Pitch Packet flows retained no visible memory status. GREEN renders the shared disclosure for native rows, retains interview-start and Pitch Packet receipts in client state, and keeps the exact Pitch Packet receipt visible through later draft saves.
- RED proved Casey digest finalized the full model string and only then sliced persisted text, producing a receipt for citations that were never stored and leaving straddling citation fragments. GREEN caps raw text first, removes any complete citation crossing the boundary, then runs the shared finalizer on the exact persisted value.
- RED proved citation-shaped strings embedded in Unicode identifiers were rewritten and visually equivalent fullwidth/dash variants were missed. GREEN uses Unicode letter/number/mark/connector boundaries, candidate-local NFKC and dash normalization, canonical allowed labels, receipt deduplication, and a bounded 2,000-hex candidate scan without changing ordinary fullwidth prose.
- RED proved whitespace and percent encoding could hide local/private source locators. GREEN classifies a trimmed NFKC view through bounded repeated decoding, safely rejects malformed escapes, redacts encoded POSIX/home/drive/UNC/private/`.writeros`/`file:` locators, and preserves the original safe https, WriterOS, Story Wayfinder, relative, and opaque URI text.

### Review round 2 RED / GREEN evidence

- Cross-project App and compose cycles: **5 files, 71 tests passed** after the original stale-completion failures.
- Receipt UI/client-state cycle: **4 files, 39 tests passed** after six original failures; self-review added a failing save-retention probe before the final fix.
- Digest cap cycle: the new crossing/beyond-cap probe failed with a partial citation and incorrect receipt, then **6 digest tests passed**.
- Citation and URI boundary cycles: the new Unicode tests failed in two cases and the encoded URI table failed in eleven cases, then **46 agent-context tests passed**.
- Combined affected regression gate: **11 files, 162 tests passed**.
- Expanded related route/room/UI gate: **58 files, 482 tests passed**.
- TypeScript validation (`npm run check`): **passed**.
- Whitespace validation (`git diff --check`): **passed**.
- Full suite (`npm run test:run`): **209 files passed, 2 skipped; 2,182 tests passed, 10 skipped**.
- Production build (`npm run build`): **passed** with the existing informational large-chunk advisory.

### Review round 2 self-review

- The request-generation check guards success, error, persistence callback, and loading cleanup; project identity is updated synchronously during render so an old completion cannot win the gap before effects run.
- Citation normalization is local to matched candidates. Source URI decoding is classification-only; safe values are returned byte-for-byte and unsafe hashes are derived without exposing the locator.
- Pitch Packet's top-level generation receipt remains authoritative for that generated draft and stays displayed even if a later save response omits its optional row copy.
- No voice-profile path, browser-only missing-project behavior, model prompt authority, or unrelated endpoint semantics changed in this round.

## Review round 3 fixes

- RED proved the composition guard still keyed browser projects on the optional memory `projectId`, making browser A and B both `undefined`, and proved the current request closure remained live after unmount. GREEN gives the three tabs an explicit UI project-scope key from the existing browser/folder library instance identity, keeps it distinct from the optional memory ID, resets on scope changes, and invalidates every request during effect cleanup.
- RED proved the citation regex missed NFKC-equivalent mathematical/circled glyphs and compatible brackets. GREEN replaces it with a shared linear span scanner that normalizes only candidate code points, recognizes compatibility M/hex/digit/bracket/dash forms, and applies raw plus normalized Unicode identifier boundaries without changing ordinary typography.
- RED proved a citation-shaped token longer than the prior 2,000-hex candidate limit could still be cut in half. GREEN uses the same unbounded-to-input, linear scanner for capping, while bounding canonical-label construction to the schema maximum; allowed, invented, unclosed, and overlong crossing tokens are never partially persisted, and finalization runs on the exact capped value.
- RED proved fixed-round URI decoding missed deeply encoded local paths while recursive handling rejected safe `%25` data and web dot paths. GREEN structurally allowlists safe absolute https/WriterOS/workflow schemes before decoding their payload, rejects trim mismatches, and decodes non-safe or encoded-scheme candidates until stable with iterations bounded by the original input length.

### Review round 3 RED / GREEN evidence

- UI scope/unmount RED: **4 expected failures** across the shared hook and outline/synopsis/treatment browser swaps; GREEN includes deferred stale success, stale error, current-B completion, and unmounted completion coverage.
- Citation/cap RED: mathematical/circled candidates were unchanged and an overlong crossing token was partially returned; GREEN covers compatibility forms, embedded Unicode identifiers, allowed/invented/unclosed/overlong cap spans, exact receipt semantics, and long hostile input.
- URI RED: **12 expected failures** covered trim mismatch, safe dot paths and `%25`, encoded safe scheme, eight-layer local paths, and percent-bomb handling; all are GREEN.
- Focused affected gate: **6 files, 130 tests passed** before the final added stale-error/unmount and compatibility-boundary probes.
- Expanded route/room/UI/retrieval gate: **60 files, 518 tests passed**.
- TypeScript validation (`npm run check`): **passed**.
- Whitespace validation (`git diff --check`): **passed**.
- Full suite (`npm run test:run`): **210 files passed, 2 skipped; 2,200 tests passed, 10 skipped**.
- Production build (`npm run build`): **passed** with the existing informational large-chunk advisory.

### Review round 3 self-review

- The App scope key uses the existing library project instance ID and storage kind, never mutable title text. Direct tab callers receive a stable component-instance fallback, while legacy folder-ID callers still invalidate correctly.
- Request guards cover success, catch, callback/persistence, and finally branches. Cleanup makes stale closures false before an unmounted completion can update UI or persistence.
- The scanner walks UTF-16 safely by code point, advances monotonically, and bounds only canonical-label allocation; overlong citation-shaped spans remain visible to cap protection without ReDoS behavior.
- Safe source URI decoding is classification-only. Allowlisted values retain their original representation, encoded safe schemes stop once structurally recognized, and unsafe hashes never expose decoded or original path material.

## Review round 4 fixes

- RED proved RoomChannel history/proposal success, send failure recovery, and proposal adoption could mutate the next project after a UI-scope switch. GREEN threads the stable App project-scope key into the room and Project Meeting, resets room state on scope changes, and guards every post-await success/error/finally branch plus stream/event callbacks against scope, generation, and unmount changes. The initial room-load cancellation flag now guards success as well as failure.
- RED proved Project Meeting start and every Pitch Packet mutation could complete into a newer project. GREEN gives status/start/Pitch work independent monotonic request guards, checks both awaits in approval, prevents stale export/re-download browser downloads, and preserves current-scope behavior and receipts.
- RED proved deleting an invented wrapped citation could join words, combining marks, or a high/low surrogate pair. GREEN reconstructs finalized text by code unit and inserts a visible space only when removal would join identifier/surrogate token edges; existing whitespace and punctuation remain unchanged and no zero-width channel is introduced.
- RED proved malformed citation-like runs such as `[M-ABCD-ZZZ…` could still be sliced at the digest cap, including immediately before a closing wrapper. GREEN recognizes standalone/wrapped valid heads with malformed, nonhex, unclosed, or overlong runs, includes a present wrapper close in the protected span, and retains Unicode-aware embedded-identifier boundaries with linear scanning.
- RED proved raw HTTPS values with interior whitespace, malformed percent syntax, or invalid/incomplete UTF-8 escapes were accepted by URL normalization. GREEN validates the raw representation before allowlisting while preserving valid `%25`, dot paths, normal HTTPS/workflow URIs, and the existing deep-decoding redaction for encoded local/private locators.

### Review round 4 RED / GREEN evidence

- Agent-context RED: **7 expected failures** for delimiter, malformed cap, and raw HTTPS probes; self-review added one expected failure at the malformed closing-wrapper boundary. GREEN: **69 agent-context tests passed** and **75 agent-context/digest tests passed** after the closing-wrapper refinement.
- Room/UI RED: **2 expected failures** proved stale room history did not trigger a current load and stale send/resolve mutated the next scope. GREEN: the room component suite passed.
- Interview/Pitch RED: **4 expected failures** proved stale start, draft/save, between-await approval, and export/re-download mutation. GREEN: combined room and interview suites passed **29 tests**.
- Expanded related route/room/UI/retrieval gate: **54 files, 505 tests passed**.
- TypeScript validation (`npm run check`): **passed**.
- Whitespace validation (`git diff --check`): **passed**.
- Full suite (`npm test -- --run`): **210 files passed, 2 skipped; 2,214 tests passed, 10 skipped**.
- Production build (`npm run build`): **passed** with the existing informational large-chunk advisory.

### Review round 4 self-review

- Scope identity remains distinct from optional memory identity: the App supplies the existing stable browser/folder project instance key, while direct legacy callers fall back to the memory project ID. Generation refs update during render, so stale closures are invalid before effects run; cleanup invalidates them on unmount.
- Pitch Packet uses one generation across all mutually exclusive packet mutations, so a newer packet action invalidates an older one. Approval checks after save and approval separately; export and re-download check before any state or download side effect.
- Citation deletion never normalizes ordinary output. It inspects only the two preserved edges around a removed complete citation and preserves the original surrounding UTF-16 code units.
- Malformed citation cap scanning requires a standalone or explicitly wrapped normalized `M-` plus four hex characters and a second dash; prose and identifier-embedded `M-hyphen` text therefore remains outside the protected candidate contract.
- HTTPS percent validation is classification-only and returns safe source URIs byte-for-byte. Unsafe source hashes continue to derive from the original value without exposing it in prompts, receipts, or errors.

## Review round 5 fixes

- RED proved status, start, and Pitch Packet work used independent freshness clocks, allowing older same-project status/history/export/start/packet completions to overwrite newer operations. GREEN gives every state-mutating Project Meeting action one coherent last-started-wins operation generation and checks its mounted, project-bound scope token after every await, in every mutating error branch, between approval awaits, and before/between download side effects.
- RED proved reused and explicitly blank caller scope keys could preserve an old request across a real project change. GREEN derives effective scope identity from the exact `projectId` plus a nonempty caller UI-instance key or stable component fallback; interview, room, outline, synopsis, and treatment public optional contracts all use that binding, while browser-only projects remain separated by their UI instance keys.
- RED proved an old room stream event could visibly render during the next project's render-to-passive-cleanup window, and reused/blank keys allowed old pending room mutations to restore errors. GREEN adds a render-synchronous mounted/current-scope predicate to stream, session-open, and lock-sync callbacks in addition to effect cancellation and request generations. The scope-only stream predicate remains live across same-project memory retries.
- RED proved zero-tail and punctuation/nonhex citation-like candidates could be cut internally. GREEN treats standalone and wrapped normalized `M-` + four hex + second dash heads as citation-like even with no tail, scans monotonically through the candidate or wrapper to a delimiter, and cuts before `[M-ABCD-]`, `[M-ABCD-?]`, `[M-ABCD-Z?]`, and their standalone forms at every internal boundary without protecting identifier-embedded prose.
- RED proved raw HTTPS source locators containing C1 controls passed allowlisting. GREEN rejects C0, DEL, C1, and Unicode line/paragraph separators before URL parsing while preserving all prior safe URI probes byte-for-byte.

### Review round 5 RED / GREEN evidence

- Strict RED: interview and agent-context probes produced **10 expected failures** with 93 prior tests passing; room probes separately produced **3 expected failures** with 8 prior tests passing. Failures covered three same-project cross-operation orders, reused/blank project scope collisions, three exact citation-cap candidates, two C1 controls, two room scope collisions, and the render-to-cleanup stream window.
- Focused GREEN after the expanded deferred order matrix: **3 files, 120 tests passed**. The matrix covers status → start, nested history/export → start, start → packet, packet → start, and refresh → packet, plus project changes with reused and blank keys.
- Expanded related room, Project Meeting, compose, memory-route, retrieval, and server-room gate: **64 files, 607 tests passed**.
- TypeScript validation (`npm run check`): **passed**.
- Whitespace validation (`git diff --check`): **passed**.
- Full suite (`npm run test:run`): **210 files passed, 2 skipped; 2,236 tests passed, 10 skipped**.
- Production build (`npm run build`): **passed** with the existing informational large-chunk advisory.

### Review round 5 self-review

- One bound scope helper now owns the collision-resistant identity rule. The project identity is always present in the serialized tuple, caller whitespace-only keys fall back to a stable component instance, and a caller cannot bypass invalidation by reusing a public optional key.
- One interview generation owns all asynchronous state mutation, including preview/bank actions that previously had separate or no guards. Synchronous new-round preparation also advances the clock so an older continuation cannot repopulate cleared state.
- Room event freshness deliberately separates scope liveness from operation ordering: stream events use the render-time scope/mounted predicate, while loads, retries, sends, resolves, session-open, and lock-sync work retain operation tokens. This prevents stale cross-project events without silencing the current stream when a memory retry supersedes a load.
- Citation scanning remains linear: each code-point cursor advances monotonically, candidate-local normalization remains bounded to encountered characters, and cap protection does not authorize or remove malformed spans. URI classification remains non-mutating and safe source values are returned unchanged.
