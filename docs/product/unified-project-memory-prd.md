# Unified Project Memory V1 — Product Contract

**Status:** Canonical product contract for Unified Project Memory V1
**Scope:** Local, file-backed project memory inside an existing WriterOS project package
**Related docs:** `docs/product/README.md`, `docs/product/app-home-import-storage-prd.md`, `docs/product/project-vault-prd.md`, `docs/product/agent-observability-provenance-prd.md`

## 1. Product promise

Unified Project Memory gives a WriterOS project one durable, inspectable shared archive
for story knowledge, decisions, source evidence, and workflow handoffs. It makes the
project's working knowledge available to WriterOS and approved external workflows without
pretending that every draft statement is canon or that an agent may make creative authority
decisions for the writer.

The shared project home is the project's local `.writeros` package. Unified Project Memory
lives inside that package, remains file-backed and portable with it, and is append-only for
its historical records. It is not a cloud service, a global writer profile, or a replacement
for authored writing surfaces.

Project and product titles are record data only. In particular, **Bloodless** must never
become a workflow type, adapter name, schema value, or directory convention.

## 2. Record classes and source of truth

V1 maintains distinct record classes rather than flattening them into one ambiguous
"memory" value:

| Record class | Product job | Authority rule |
| --- | --- | --- |
| Source evidence | Preserves what an imported or connected source actually said, with provenance | Evidence is not canon merely because it was imported. |
| Document facts | Captures retrievable facts found in WriterOS documents | A document fact may contradict active canon and must remain visible; it is not blocked or rewritten solely for that reason. |
| Canon candidates and canon | Represents a proposed or accepted story truth | Only an eligible, explicitly approved candidate may become active canon. |
| Decisions and conflicts | Records choices, disagreement, and required human resolution | An open conflict stays open until its stated arbiter resolves it. |
| Workflow records | Records milestones, handoffs, reports, and failures | Workflow state records what occurred; it cannot silently promote itself to canon. |

The archive preserves provenance, source references, timestamps, and relationships needed to
explain a record. Derived retrieval indexes and summaries are rebuildable aids, never the
sole canonical copy of a record.

## 3. Canon authority and history

Writer authority is explicit. A proposed canon item becomes active only when it has passed
the required authority gate and the writer approves it through the applicable human-in-the-
loop action.

- Wayfinder canon requires **both** `type: grill` or `type: sketch` **and** `mode: hitl`.
  An AFK grill or sketch is development material, not Wayfinder canon.
- Active canon is never edited in place or erased by replacement. Every replacement creates
  a history-preserving supersession link from the former active record to the new one.
- Contradictory document facts remain searchable, labeled with their evidence and conflict
  state, and may inform review. They do not overwrite active canon or prevent a writer from
  continuing to draft.
- Agents can retrieve, compare, report, and propose; they do not silently settle canon,
  rewrite a source, or make a writer's creative choice.

## 4. Conflicts and arbitration

The system must surface material conflicts with the conflicting records, their provenance,
and the action needed to resolve them. It must not manufacture a winner through record order,
import order, or an external tool's default policy.

Buzz canon conflicts remain open for **Ben's arbitration**. Buzz's native auto-win rule does
not apply inside WriterOS. V1 records the conflict and its candidates, provides the evidence
needed for Ben to decide, and only changes active canon after the authorized resolution.

## 5. Sources, imports, and privacy

Source material is preserved as evidence with enough metadata to identify where it came
from and how it entered the project. Importers must retain source text/metadata and produce
warnings for ambiguous or unmapped material rather than silently discarding it.

- Legacy `atoms` import is read-only. It may create local memory records, but it never
  modifies the legacy source.
- An atom with an unmapped status must produce a visible warning; it must never be silently
  skipped.
- Cloud-synced sources are dry-run/import-only in V1. WriterOS must not write back to them.
- A Buzz bundle is local and manually supplied; V1 does not assume a live Buzz connection
  or automatic synchronization.
- External workflows access the shared archive through its stated contract. They read the
  shared archive instead of rummaging through one another's private files or directories.

Source access follows the project's local privacy boundary. No source, evidence excerpt, or
retrieval result may be sent outside the project or to an external workflow without the
writer's explicit action and the permissions of the receiving integration.

## 6. Retrieval and WriterOS reporting

Retrieval is evidence-aware. A result must carry enough identity and provenance for the
writer or agent to distinguish active canon, a document fact, a proposal, a conflict, and
source evidence. Retrieval ranks for relevance, but ranking is not an authority decision.

WriterOS reports should make the project's current state legible: active canon, unresolved
conflicts, supporting and contradictory evidence, recent changes, open questions, import
warnings, and workflow failures. A report must state uncertainty and missing evidence rather
than imply a resolved truth.

## 7. Workflow milestones and failure states

V1 records workflow milestones as durable events, including import requested, dry-run
completed, import completed, candidate proposed, canon approved or superseded, conflict
opened or resolved, and handoff/report produced. These records are append-only and are
auditable through their provenance.

Failures are first-class product states. Parse errors, unavailable sources, malformed input,
unmapped statuses, retrieval/index failures, and failed handoffs must be visible with their
scope and recovery action. A failure must not masquerade as an empty result, a successful
import, or a resolved conflict. Retry is explicit and must not create duplicate authority
events.

## 8. Writer experience

The UI presents memory as a calm project resource, not as a technical database. It lets the
writer inspect a record's origin, status, supporting/contradictory evidence, and history;
review proposed canon; resolve conflicts when they are the designated arbiter; review import
warnings; and request reports or workflow handoffs.

Approval and resolution controls must be deliberate and explain their result. The UI must
never imply that importing, viewing, or retrieving a record accepts it as canon. It must
make an unresolved Buzz conflict visibly awaiting Ben's decision.

## 9. V1 non-goals

V1 does not:

- create a cloud-backed shared database or automatically synchronize local memory;
- replace WriterOS authored documents, Project Vault, or Writer Memory;
- infer or auto-promote canon from a document, import, retrieval ranking, or agent output;
- apply Buzz's native auto-win behavior;
- write to legacy atoms or cloud-synced source material;
- require external workflows to inspect another workflow's private files;
- encode a project/product title, including Bloodless, as an implementation convention.

## 10. Contract precedence

This PRD is the product authority for Unified Project Memory V1. Later implementation plans
may define schemas, APIs, and UI details only when they preserve these authority, provenance,
privacy, and append-only-history rules. When an older product document conflicts with this
contract on Unified Project Memory behavior, this contract governs.
