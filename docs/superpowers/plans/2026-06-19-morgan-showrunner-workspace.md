# Morgan → Showrunner Workspace — Architecture & Implementation Plan

> **For agentic workers:** This is a multi-slice product/architecture plan. Each slice below is independently shippable (one branch → one PR) and ordered so value lands early and risk lands late. When a slice is executed, expand it into a bite-sized TDD plan via `superpowers:writing-plans`. Do **not** implement from this document directly — it is the design contract, not the per-task script.

**Goal:** Evolve Morgan from a thin client-routed right-rail dispatcher into a first-class Showrunner identity — a top-tier LLM operator with general knowledge, intentional web access, surface/document awareness, and a "last look" review role — without a destructive redesign and without granting silent document-edit power.

**Architecture:** Additive layers on the existing persona/`StoryMemory` boundary. Morgan stays the `writingPartner` persona id (load-bearing for storage/routing) but gains a distinct server-side identity, a declarative capability/skills registry, a web-access capability boundary, a read-only First-Draft review flow, and — gated behind the settled dependency line — a **Draft Patch Flow** over a **Morgan Working Draft** (a duplicate of the composed First Draft; patched on Accept, versioned, with form fields untouched and no silent recompose overwrite). UX evolves from rail-only toward a dedicated workspace with a side-by-side draft pane, keeping the rail as quick access.

**Tech Stack:** React + Vite client, Express server, shared TS contracts in `shared/`, Vitest. Dual model provider (`server/ai/modelProvider.ts`): OpenAI (`gpt-4o-mini` default) / Anthropic (`claude-sonnet-4-6`), Anthropic streaming path.

## Global Constraints

- **No silent edits.** Any agent-authored draft mutation requires ALL of: proposal schema + explicit Accept + a stale-write guard (shared logic, **client-committed**; server is a stateless validator), and targets the **Morgan Working Draft only** — never the form fields, never a recompose (§7/§8). None exist yet → editing is gated to Slice 8 (Draft Patch Flow).
- **State is client-owned.** ProjectState lives client-side (`useProjectState`/`projectStorage`); server routes are stateless adapters. No plan step may describe `routes.ts` as durably persisting project state unless server persistence is explicitly added (out of scope).
- **Dependency line (strict, settled):** read (shipped) → propose+approve+stale-guard (synchronous reviewable edits) → async/background. Do not skip a rung.
- **Read-only in Slices 1–6.** Morgan reads `ProjectState` / `StoryMemory` / composed artifacts; she never writes them. Slice 7 creates the Working Draft duplicate (a new artifact, not an edit of source/First Draft); only Slice 8 lets Morgan-proposed patches mutate the Working Draft, behind Accept.
- **Web access only through a capability/tool boundary** — never an unbounded client-driven or model-driven fetch. Intentional, validated, logged, attributed via `CapabilityReceipt`.
- **OpenSwarm stays optional/out of scope.** Reuse its *bridge pattern* as precedent if helpful; do not expand OpenSwarm agency or touch `/swarm` / Zoe paths without explicit reason.
- **Specialists remain craft lenses.** Morgan coordinates/researches/reviews/synthesizes; she does not replace Sam/Casey/Oliver/Maya/Zoe/Alex.
- **Additive, small slices.** The current rail is transitional, not sacred — but do not delete it mid-flight. No giant destructive redesign.
- **Do not copy** `ai-film-writing-templates/` content into the repo. Use it only as design inspiration for the capability/skills + review-rubric shape.
- **Keep `/api/wp-chat` a thin adapter** over `OpenAIService.generatePersonaResponse` (CLAUDE.md rule). New server logic lives in service/helper modules, not inflated route handlers.
- **Commits:** no `Co-Authored-By` trailer. One slice = one fresh branch off updated `main` = one PR. Verify (`npm run test:run` · `npm run check` · `npm run build`) before claiming done.

---

## 1. Product Thesis

Morgan is the **showrunner/operator** of the writing room — the person Ben actually talks to about the work as a whole. Specialists are craft lenses you visit for a specific problem; Morgan is the one who holds the project in her head, knows where every document stands, can answer a stray factual/film question without breaking flow, and gives the "last look" once a document is composed.

Today Morgan is a misnomer: on the main chat path she is rendered as "Showrunner" but executed as a generic specialist with an 800-token cap, no distinct prompt, no general-knowledge license, no web, and no awareness of composed outputs. The only place she has a real synthesis identity is the opt-in `/swarm` path.

This plan closes that gap in safe, additive increments:

1. **Identity** — give Morgan a real showrunner system prompt and the headroom to use it.
2. **Knowledge** — let her answer general/film/reference questions directly (model knowledge first, web second).
3. **Awareness** — let her see all surfaces *and* the state of every composed document (read-only).
4. **Capability** — a declarative skills registry so she knows what she can do and when.
5. **Web** — intentional, bounded factual lookup behind a capability boundary.
6. **Review** — a "last look" flow over the composed First Draft: critique, improvement, output strategy (advice-only; stepping stone).
7. **Workspace + Working Draft** — a dedicated Morgan page with side-by-side chat + draft review pane, holding the Morgan Working Draft (a duplicate of the composed First Draft).
8. **Draft Patch Flow (gated)** — Morgan proposes block-level edits; Ben Accepts/Rejects; Accept patches the Working Draft and saves the next draft version. Never touches fields, never recomposes.

The draft model in one line: **form fields → composed First Draft → duplicated into a Morgan Working Draft → patched (on Accept) into Draft 2, 3, … → the current authored draft.** Fields stay canonical and untouched; recompose only ever offers a new First Draft *candidate* (§7).

Success test (north-star vignette): Ben finishes the Outline form and composes it — that produces the **First Draft**. He opens it in Morgan; Morgan duplicates it into a **Working Draft** in the draft pane, critiques it against the outline rubric, and proposes block-level edits with before/after/reason. Ben Accepts a few — they patch the Working Draft immediately and save **Draft 2**; his form answers are untouched. Later he tweaks an answer and recomposes: a new First Draft candidate appears *beside* his Working Draft, which is not overwritten. Separately, Ben asks "what's that movie — Tommy Lee Jones as a marshal chasing a doctor falsely accused of killing his wife?" and Morgan answers "The Fugitive (1993)" without derailing.

## 2. Proposed UX Shape

**Component reality (corrected):** The Morgan chat host is **`client/src/components/shell/LeftRail.tsx`** (title "Morgan", "Message Morgan…", `agents.writingPartner.transcript`), mounted via `Shell.tsx`. **`WritersRoom.tsx` is the *specialist* dock** (Sam/Casey/Oliver/Maya/Zoe/Alex). These are two different surfaces — do not conflate them.

**Principle: Morgan rail stays quick-access; Morgan workspace becomes the full view.** The LeftRail remains the always-available Morgan quick-access surface. Morgan gains a *promotable* full workspace — she is not retrofitted as a specialist peer inside the WritersRoom nav.

Phased UX:

- **Now → Slice 1–6 (rail-first):**
  - The LeftRail already gives Morgan a first-class, always-present presence (she defaults to herself on every surface — see Slice 1 baseline). Keep it as the quick-access entry. **Do not add Morgan as another specialist peer in the WritersRoom nav** — if a "Showrunner" entry there is ever wanted, design it deliberately, not as a side effect.
  - When a document is composed and review-ready, the document view shows a quiet affordance — e.g. "Ask Morgan for a last look" — that opens **Morgan's LeftRail thread** (`agents.writingPartner.transcript`) pre-seeded with a document-scoped review request. Reuse the Morgan send path, **not** the specialist send path (see §6).
  - Capability/skills surface as lightweight, surface-aware suggestion chips in the LeftRail composer (driven by the registry), not a heavy UI.

- **Slice 7 (workspace + draft pane):**
  - A dedicated Morgan workspace/route (e.g. a `morgan` shell view) that is *not* docked beside a surface: **side-by-side Morgan chat + a draft review pane**, plus a left index of project documents + their readiness and draft/version status. This is the "full view" promotion of the Morgan rail and the home of the **Morgan Working Draft** (§7).
  - "Open in Morgan" duplicates the composed First Draft into a Working Draft shown in the pane (display in Slice 7; Accept/Reject patching arrives in Slice 8).
  - The LeftRail deep-links into this workspace ("open full").

**Non-destructive guarantee:** every UX addition is additive. The LeftRail (Morgan) and WritersRoom (specialists) both stay. Morgan's transcript stays `agents.writingPartner.transcript`; specialist transcripts stay separate (CLAUDE.md invariant).

## 3. Architecture Shape

Seven additive seams, all hanging off the existing persona/`StoryMemory` boundary:

1. **Morgan identity seam (server).** A dedicated branch in `createPersonaSystemPrompt` (`server/ai/openaiService.ts`) for `writingPartner`, producing a showrunner/operator prompt instead of the generic specialist prompt. Morgan-specific `maxTokens` headroom and (optionally) a stronger model tier via `modelProvider`. `/api/wp-chat` stays a thin adapter.

2. **Awareness seam (shared contract).** Extend the read-only context Morgan receives so it includes **document review state** — per-surface `kind` (`fresh`/`missing_context`/`answer_stale`…), `readiness.tier`, `fidelity` warnings, and the **current authored document** per the §7 precedence invariant: when a Morgan Working Draft exists it is supplied as the document Morgan answers from, with the composed First Draft labeled a superseded baseline; otherwise the composed `blocks` stand in. This rides the existing `StoryMemory` packet (`shared/schema.ts`) and `createContextSummary` (`server/ai/openaiService.ts`), gated by `PERSONA_CONTEXT_ORDER` so only Morgan (and intentionally chosen specialists) get the heavier document-state block. **Shared-safety constraint:** the document-state derivation helpers (`deriveSynopsis/Outline/TreatmentDocumentState`) currently live under `client/src/lib/*DocumentState.ts`. The server must **not** import client code. So Slice 3 first extracts the shared-safe derivation logic into `shared/` (e.g. `shared/documentReviewState.ts`) — or, if extraction is too invasive, defines a serialized read-only document-state summary that the client computes and passes through `buildProjectContext` → `StoryMemory`, with the server only reading the serialized summary. Decide extract-vs-serialize at slice time; either way, no `server`→`client` or `shared`→`client` import.

3. **Capability/skills registry seam (shared, declarative).** A new `shared/capabilities/` registry describing what Morgan can do, each entry surface-scoped and trigger-described (inspired by the skill-metadata shape in `ai-film-writing-templates`). Pure data + selectors; no execution coupling. Morgan's prompt enumerates the applicable skills for the current surface so she advertises real capability.

4. **Capability boundary seam (server).** A single server-side executor that turns a validated capability request (e.g. `web_lookup`) into a result + `CapabilityReceipt`. This is the *only* place outbound web access happens. **New/generalized types, not the Zoe path:** the existing `shared/personaCapability.ts` + `server/persona-capability/*` are world-context/research-shaped for Zoe — do **not** cram Morgan web lookup into them. Introduce a fresh `morganCapability` contract (or first generalize the capability types into a shared base both can extend). Use the OpenSwarm bridge only as a *structural precedent* (bounded request → executor → receipt), not as the type home. Envelope-strong, content-limited, WriterOS-owned.

5. **Review flow seam (client + prompt).** A read-only "last look" path over the composed **First Draft**: a document-scoped review request that packages the composed artifact + readiness/fidelity + the relevant review rubric, routed to Morgan via the **Morgan/LeftRail send path** (`App.tsx:~595-648` → `writingPartner` transcript → `/api/wp-chat`), **not** `handleSpecialistSend`. No new endpoint required for Slices 1–6. This is the stepping stone to the Draft Patch seam.

6. **Draft surface seam (Slice 7, client).** The Morgan workspace gains a **draft review pane** beside the chat, holding the **Morgan Working Draft** — a duplicate of the composed First Draft taken when Ben opens it in Morgan (§7). Slice 7 stands up the artifact + pane (display); no agent-driven edits yet.

7. **Draft patch seam (Slice 8).** The Working Draft becomes mutable via `DraftEditProposal` + Accept/Reject + a **shared stale-write guard** + versioning, with the **client committing** the new version into client-owned ProjectState (server stays a stateless validator — §8). Patches target the Working Draft only — never fields, never the composed First Draft. Requires first removing the dead `storyUpdates` path so there is exactly one, well-guarded write channel.

What we explicitly do **not** add: new model orchestration frameworks, server-side auto-routing between personas (routing stays client-side in `wpRouting.ts`), OpenSwarm expansion, reverse-sync from drafts into fields, or any silent mutation channel.

## 4. Capability / Skills Registry Idea

**Shape (inspired by, not copied from, `ai-film-writing-templates`):** each capability is a declarative record the model is *told about*, not a hardcoded behavior.

```ts
// shared/capabilities/types.ts (illustrative shape)
interface MorganCapability {
  id: string;                       // 'review.outline', 'lookup.web', 'reference.film'
  title: string;                    // 'Outline last-look review'
  description: string;              // one line, model-facing
  whenToUse: string;               // trigger description, model-facing
  surfaceScope: SurfaceKind[] | 'any';  // which surfaces this applies to
  kind: 'reasoning' | 'review' | 'web';  // reasoning = no boundary; web = must route through boundary
  rubricKey?: string;              // points at a review rubric (Slice 6)
}
```

Registry content (V1):
- `reference.film`, `reference.general` — **reasoning** capabilities: answer factual/reference questions from model knowledge. No boundary. (The Fugitive case.)
- `review.synopsis` / `review.outline` / `review.treatment` — **review** capabilities over composed First Drafts, surface-scoped, each with a `rubricKey`. `review.storyBible` is **structured-state review only** (no composed First Draft today) until a Story Bible composer exists.
- `lookup.web` — **web** capability: must route through the capability boundary (Slice 5). Never executed inline.
- `coordinate.specialist` — **reasoning**: recommend the right specialist (Morgan stays advisory; actual routing remains client-side and user-initiated).

Selectors: `capabilitiesForSurface(surface)` and `webCapabilities()`. The Morgan prompt builder renders the applicable subset so Morgan's self-description matches reality. The composer can render the same subset as suggestion chips.

This keeps capability declarative and testable, and gives a clean home for the "what good looks like" rubric authority distilled from the inspiration templates (synopsis/outline/treatment/story-bible best-practice structure + QA checklists) — adapted, not copied.

## 5. Web Access Design

**One boundary, server-owned, intentional.**

- A single new endpoint/executor (e.g. `server/capabilities/webLookup.ts` behind a **new** `/api/morgan-capability/run`) accepts a **validated** request: `{ capabilityId: 'lookup.web', query: string, reason: string }`. Do not extend the Zoe-shaped `/api/persona-capability/run` — fresh `morganCapability` types per §3-Architecture-seam-4.
- The boundary is **envelope-strong, content-limited**: it validates the request shape, enforces query length/rate caps, performs the lookup via an allowed mechanism (a single configured search/fetch provider, or the OpenSwarm research bridge if that is the chosen mechanism — decided at slice time), and returns a bounded, attributed result.
- Result is returned to the client as a `CapabilityReceipt` (the transcript model already carries `capabilityReceipt?` on `TranscriptMessage`), so every web-derived claim is visibly sourced and auditable.
- **Model does not free-fetch.** Morgan's prompt instructs her to *request* a web lookup (surface it as a suggested action), not to assert live facts she cannot have. The client mediates the actual call to the boundary. This preserves the dependency-line philosophy: capability is granted through a contract, not assumed.
- **Failure is honest:** if the boundary can't retrieve, Morgan says so (mirroring the inspiration skill's "do not pretend to have read a file" rule) rather than hallucinating.
- **Default off / config-gated:** web lookup is behind a server config flag and an API-key presence check, so it degrades cleanly when unconfigured (no hard dependency for the rest of the plan).

Distinction enforced in the registry: `reference.*` (model knowledge, no boundary) vs `lookup.web` (boundary-only). General film identification is `reference.*` and needs no web; web is for fresh/verifiable facts.

## 6. Document-Output Review Flow ("Last Look")

**Read-only critique + output strategy over the composed First Draft, gated on composed state.** This is a deliberate **stepping stone** toward the Draft Patch Flow (§8): same review intelligence, but advice-only — it reviews the First Draft and does not yet open or mutate a Working Draft.

**Surface scope:** full composed-First-Draft review applies to **Synopsis, Outline, Treatment** — the surfaces with a compose flow, document view, and `deriveXDocumentState` today. **Story Bible is structured-state review only** (it has structured fields + `storyBibleReadiness` but no composed artifact, no `StoryBibleDocumentView`, no state deriver): Morgan can review its structured answers/readiness but there is no First Draft to critique or duplicate until a Story Bible First Draft composer exists (see Slice 7 prerequisite).

Trigger conditions (all derivable from existing state, no new flags):
- A composed artifact exists (`ProjectState.documents.<surface>.composed !== undefined`), AND
- `deriveXDocumentState(...).kind` ∈ {`fresh`, `missing_context`} (review-ready) — or `answer_stale`/`recipe_stale` (Morgan flags staleness and recommends recompose before review).

Flow:
1. Document view shows an affordance ("Ask Morgan for a last look") when review-ready.
2. Client builds a **review request packet** (read-only): the composed `blocks`, `fidelity.warnings`, readiness `tier`, `missingCoreLabels`/`omittedSectionHeadings`, plus the document type. Routed to Morgan via the **Morgan/LeftRail send path** (the `App.tsx:~595–648` handler that writes `agents.writingPartner.transcript`) with `personaId='writingPartner'` → `/api/wp-chat`. **Do NOT use `handleSpecialistSend`** (`App.tsx:~654–677`) — that writes specialist transcripts and would break the Morgan-thread invariant. The review lives in Morgan's canonical thread.
3. Server, in the Morgan prompt branch, injects the matching **review rubric** (the `rubricKey` from the capability registry — adapted from the inspiration best-practice templates' structure + QA checklist) so Morgan critiques against an explicit standard, not vibes.
4. Morgan returns: a structural assessment (against the rubric), concrete, plain-language improvement suggestions, gap callouts (using the doc's own `missing*` labels), and an **output strategy** (what this document is for, who it's for, what to do with it next — distilled from the inspiration templates' purpose/length/format guidance).
5. **No mutation.** Suggestions are advice. Applying them is manual until Slice 8.

This reuses the read-only awareness seam (Slice 3) for the heavy document-state context and the registry (Slice 4) for rubrics — so the review flow is mostly composition, not new infrastructure.

## 7. First Draft → Morgan Working Draft

This is the concrete draft-editing model — the spine of the whole plan. It defines the artifact lifecycle, where edits are seen, exactly what "Approve" does, and how recompose behaves. Slices 6–8 implement it directly.

**The lifecycle — five artifacts, in order:**

1. **Structured source answers** — the form fields / intake question answers (`ProjectState.documents.<surface>.content`). Canonical input; the writer's authored decisions. Morgan never edits them and nothing reverse-syncs into them.
2. **Composed First Draft** — Compose transforms the answers into the rough/first draft (a `ComposedDocument`: `blocks`, `sourceHash`, `generatedAt`, `recipeVersion`, `fidelity`). It is a *generated baseline*, not a verbatim field render, and **not edited in place** as "the form." It is a regenerate-only candidate.
3. **Morgan Working Draft** — when Ben takes the First Draft to Morgan, Morgan opens a **duplicate of that composed output** as a working draft in the Morgan surface. This duplicate — not the First Draft, not the fields — is what gets marked up. It is writer-owned and lives independent of the regenerate path.
4. **Draft versions (Draft 2, Draft 3, …)** — each accepted batch of changes saves a **new version** of the Working Draft. History is retained so the writer can compare/roll back.
5. **Current authored draft** — the latest Working Draft version. This is "the draft" Ben is actually authoring once the First Draft baseline exists.

**Where edits are seen:** in Morgan's dedicated surface/workspace (Slice 7), ideally **side-by-side — Morgan chat + a draft review pane**. V1 uses **block-level proposed edits**: each proposal is `{ before, after, reason }` with **Accept / Reject** controls in the pane. A later iteration can upgrade to true inline diff markup.

**What "Approve" (Accept) means — precise:**
- Applies the proposal's **patch operation(s) to the Morgan Working Draft, immediately**.
- **Saves a new draft version** (Draft N → Draft N+1) — durable, not just a chat suggestion.
- Does **NOT** update the structured source form fields.
- Does **NOT** recompose from fields.
- This is **patch/edit application to the duplicated draft**, never a recompose. Reject discards the proposal and the Working Draft is unchanged.

**Recompose behavior — precise:**
- Recompose runs from the **form fields** and produces a **new First Draft candidate** (a fresh `ComposedDocument`).
- It does **NOT** overwrite the current Morgan Working Draft. The candidate is offered *alongside* the existing draft.
- Adopting it (replace / merge / keep current) is an **explicit writer choice** — never silent, never automatic. Morgan can advise on the choice; she cannot make it.

**Document authority / context precedence (invariant):** these artifacts have a strict precedence for *which one is "the document"* at any moment:
- **Structured source fields** remain the canonical *input for recomposition* — the writer's decisions.
- **Composed First Draft** remains a generated *baseline / candidate*, not the authored document.
- **Once a Morgan Working Draft exists, it is the current authored document** for all agent discussion, review, and Q&A about that document.
- Therefore **all relevant agent context must expose and prefer the current Working Draft over the (now stale) composed First Draft** when answering questions about the document. The awareness seam (§3.2 / Slice 3) carries the Working Draft when present and labels the First Draft as a superseded baseline; Morgan answers from the current draft.
- Recompose may create a new First Draft candidate but **cannot silently demote or replace the current Working Draft** — adoption is the writer's explicit choice (above).

**Surface scope:** this draft lifecycle applies to surfaces that have a **composed First Draft today — Synopsis, Outline, Treatment.** Story Bible has structured fields but no compose/document-view path yet, so it is **structured-state review only** until a Story Bible First Draft composer exists (see §6 and Slice 7 prerequisites). The Script surface has its own editor and is out of this draft model.

**Why this shape:** the fields stay the writer's protected source of truth; the First Draft stays a disposable generated baseline; the Working Draft is the real, durable, agent-improvable authored document — patched, not regenerated. "No silent edits," "no silent overwrite," and "answer from the current draft" are all expressed structurally, not just as prose rules.

## 8. Draft Patch Flow (Slice 8 — gated)

The mechanism that lets Morgan propose, and Ben apply, changes to the **Morgan Working Draft** (§7 artifact 3). Gated behind the settled dependency line. The read-only last-look (§6) is the stepping stone; this is where edits become real and durable.

Required, in order:
1. **Remove the dead `storyUpdates` path** (parsed at `openaiService`, stripped at `routes.ts`, never applied; plus the uncalled `extractStoryUpdates`) so there is exactly one well-guarded write channel.
2. **Working Draft artifact + versions** — a stored, versioned Working Draft on `ProjectState.documents.<surface>` (a duplicate of the composed First Draft taken at the moment Ben opens it in Morgan), with a version list (Draft 2, Draft 3, …) and its own `draftHash`. Distinct from `content` (fields) and `composed` (First Draft candidate).
3. **Proposal schema** (`shared/`): a typed, validated `DraftEditProposal` targeting the **Working Draft only** — `{ anchor (block id), before, after, reason, baseDraftHash }`. It can never target the source fields or the composed First Draft.
4. **Approval UI** (client): Morgan emits block-level proposals into the draft review pane; Ben Accepts/Rejects each; nothing changes until Accept.
5. **Apply + version on Accept** (shared pure logic; **client commits**): a **shared** pure module applies the patch, runs the **stale-write guard** (re-check the Working Draft's current `draftHash` vs the proposal's `baseDraftHash`), computes the new `draftHash`, and produces the next draft version. The server **may** validate the proposal and return the patched draft (stateless adapter, exactly like today's `/api/compose-document`), but it does **not** durably persist project state. The **client commits** the new Working Draft version into client-owned ProjectState. Fields untouched; no recompose triggered; no reverse-sync.

**Persistence reality (important):** ProjectState is **client-owned/local** today (`useProjectState`, `projectStorage`, `useWriterOSProjectsFolder`); server routes are **stateless adapters** (`/api/compose-document` returns `{ composed }`, the client stores it). The V1 Draft Patch Flow follows the same shape: shared patch/validate/version logic + optional server validation/return + **client commit**. Do **not** describe `routes.ts` as durably writing project state. Introducing real server-side persistence is a separate, explicitly out-of-scope decision.

Only after these exist may Morgan mutate a draft — only the Working Draft, only on explicit Accept, only synchronously. Recompose remains a separate, writer-initiated action that produces a candidate and cannot silently replace the Working Draft (§7). Async/background editing is a further rung beyond this and out of scope.

## 9. Phased Implementation Slices

Each slice = one branch off updated `main` = one PR. Ordered for early value, late risk. Slices 1–6 are read-only / advice-only; Slice 7 stands up the Morgan Working Draft surface (duplicate + pane, display only); Slice 8 adds agent-proposed patching with approval + versioning. All additive.

### Slice 1 — Morgan distinct showrunner identity (server prompt)
**Goal:** On `/api/wp-chat`, `writingPartner` gets a real showrunner/operator system prompt (triage, synthesis, big-picture, room-aware) instead of generic specialist treatment, with token headroom to use it.
- **Baseline assumption (current behavior):** the Morgan rail (`LeftRail`) already defaults to Morgan herself on *every* surface — the send handler defaults `personaId='writingPartner'` (a `@mention` overrides to a specialist, but the message still lands in `agents.writingPartner.transcript`). `getDefaultPersona` (per-surface map) is **display-only** (feeds the `leftZone.ts` console hint), **not** the Morgan send path. Slice 1 builds on "Morgan answers as Morgan everywhere," not the older "Morgan will hand off to @Sam" assumption.
- Add a Morgan branch in `createPersonaSystemPrompt` (`server/ai/openaiService.ts:~806-850`).
- Give Morgan a larger `maxTokens` than the 800 specialist default in `generatePersonaResponse` (`~974-1021`) — Morgan-specific, not global.
- Keep `writingPartner` → `DEFAULT_CONTEXT_ORDER` (already so) so she sees all surfaces.
- `/api/wp-chat` unchanged in shape (thin adapter preserved).
**Why first:** highest value/lowest risk; everything else composes on a real identity.

### Slice 2 — General-knowledge / factual register
**Goal:** Morgan answers film/reference/general questions directly from model knowledge without derailing the writing task (The Fugitive case).
- Extend the Morgan prompt (Slice 1) to license general-knowledge answering, with a "stay brief, return to the work" guardrail.
- Optionally select a stronger model tier for Morgan via `modelProvider` config (decided at slice time; default provider still works).
- No web yet; this is model knowledge only.

### Slice 3 — Document-state awareness (read-only context)
**Goal:** Morgan sees the *state* of every document (readiness `kind`, `tier`, `fidelity`, composed `blocks` when present), not just raw content.
- **Shared-safety first:** the derivation helpers live in `client/src/lib/*DocumentState.ts`; server cannot import them. Extract shared-safe logic into `shared/documentReviewState.ts` **or** have the client compute a serialized read-only state summary and pass it through. No `server`→`client` / `shared`→`client` imports.
- Render a document-state block in `createContextSummary` (`server/ai/openaiService.ts:~550-649`), gated by `PERSONA_CONTEXT_ORDER` so only Morgan (and intentionally chosen specialists) receive the heavier block.
- Client passes the needed state through the existing `buildProjectContext`/`StoryMemory` path; no new endpoint.

### Slice 4 — Capability / skills registry (declarative)
**Goal:** A surface-scoped registry of what Morgan can do; her prompt advertises the applicable subset.
- `shared/capabilities/` (types + registry + selectors) per §4.
- Morgan prompt renders `capabilitiesForSurface(surface)`.
- No execution coupling yet (web capability is declared but routed only in Slice 5).

### Slice 5 — Web access capability boundary
**Goal:** Intentional, bounded, attributed web lookup behind a server boundary.
- **New `morganCapability` types + new `/api/morgan-capability/run` route** — do not reuse the Zoe-shaped `personaCapability` types or `/api/persona-capability/run` (generalize first if sharing is desired).
- Server executor + route per §5; validates request, enforces caps, returns `CapabilityReceipt`.
- Client mediates the call; Morgan *requests* lookups, never free-fetches.
- Config/API-key gated; degrades cleanly when off.

### Slice 6 — First-Draft "last look" review (read-only, stepping stone)
**Goal:** Read-only critique + output strategy on the composed First Draft, against an explicit rubric. Advice-only; the stepping stone to Slice 8.
- Review rubrics (adapted from inspiration templates) keyed by `rubricKey` in the registry.
- Document-view affordance ("Ask Morgan for a last look") gated on review-ready state.
- Client builds the read-only review packet and routes it through the **Morgan/LeftRail send path** into `agents.writingPartner.transcript` — **not** `handleSpecialistSend`. Morgan prompt injects the rubric. No Working Draft, no mutation.
- **Scope:** composed-First-Draft review for Synopsis/Outline/Treatment; Story Bible is structured-state review only (no composed artifact yet).

### Slice 7 — Morgan workspace + draft pane (Working Draft surface)
**Goal:** Dedicated Morgan workspace with **side-by-side chat + draft review pane**; introduce the **Morgan Working Draft** as a duplicate of the composed First Draft (display only — no agent edits yet). Rail preserved as quick entry.
- New shell view/route for Morgan; left document/draft index (readiness + draft version status); chat pane + draft review pane.
- "Open in Morgan" duplicates the composed First Draft into a stored Working Draft artifact (§7) and shows it in the pane.
- **Scope / prerequisite:** Working Draft duplication applies to surfaces with a composed First Draft (Synopsis/Outline/Treatment). **Story Bible requires a prerequisite slice** that builds a Story Bible First Draft composer + document view + `deriveStoryBibleDocumentState` before it can have a Working Draft. Until then Story Bible stays structured-state review only (§6).
- Recompose stays separate and produces a First Draft candidate that **cannot silently replace** the Working Draft (writer chooses replace/merge/keep).
- Rail "open full" deep-links into it. Additive; rail, WritersRoom, and transcript isolation untouched.

### Slice 8 — Draft Patch Flow (gated)
**Goal:** Synchronous, reviewable, stale-guarded **patches to the Morgan Working Draft only** (§7 artifact 3 / §8) — Accept applies the patch + saves the next draft version; never touches form fields, never recomposes, no reverse-sync. Requires the §8 five-step sequence, starting with removing dead `storyUpdates`.
- `DraftEditProposal` (block anchor + before/after/reason + `baseDraftHash`); Accept/Reject in the draft pane.
- Shared pure logic applies the patch behind the stale-write guard and produces the next draft version; the **client commits** it to client-owned ProjectState. Server may validate/return the patched draft but does not persist.

## 10. Files Likely Touched per Slice

> Paths from the codebase maps; confirm exact line ranges at execution time — they drift.

- **Slice 1:** `server/ai/openaiService.ts` (`createPersonaSystemPrompt` ~806-850; `generatePersonaResponse` ~974-1021), `shared/personas.ts` (Morgan room/identity copy). No routing change needed — Morgan already defaults to herself via the LeftRail handler (`client/src/App.tsx:~595-648`); `getDefaultPersona`/`leftZone.ts` stay untouched (display-only). Tests: `tests/` openaiService persona-prompt suite.
- **Slice 2:** `server/ai/openaiService.ts` (Morgan prompt branch), `server/ai/modelProvider.ts` (optional Morgan model tier). Tests: openaiService prompt suite.
- **Slice 3:** `shared/schema.ts` (StoryMemory ~46-109, add serialized doc-state field), new `shared/documentReviewState.ts` (extracted shared-safe derivation **or** serialized-summary type), `server/ai/openaiService.ts` (`createContextSummary` ~550-649, `PERSONA_CONTEXT_ORDER` ~454-462), `client/src/lib/wpRouting.ts` (`buildProjectContext` ~456-608) which reads `client/src/lib/*DocumentState.ts` + `shared/compose/readiness.ts` **client-side** and passes the serialized result through. **No server/shared → client import.** Tests: selector unit, context-summary, route mapping, import-direction guard.
- **Slice 4:** new `shared/capabilities/{types,registry,selectors}.ts`, `server/ai/openaiService.ts` (prompt renders capabilities), optional `client/src/components/shell/LeftRail.tsx` (suggestion chips in the Morgan composer). Tests: registry shape + selectors + prompt inclusion.
- **Slice 5:** new `shared/morganCapability.ts` (fresh types — **not** `shared/personaCapability.ts`), new `server/capabilities/webLookup.ts`, `server/routes.ts` (new `/api/morgan-capability/run`, keep handler thin), `client/src/lib/` Morgan capability client (reuse existing `CapabilityReceipt`). Tests: boundary validation, mock execution, receipt shape, "no inline fetch on chat endpoints" guard.
- **Slice 6:** new `shared/capabilities/rubrics/` (adapted rubrics), `server/ai/openaiService.ts` (inject rubric in Morgan branch), composed document views (`SynopsisDocumentView.tsx`, `OutlineDocumentView.tsx`, `TreatmentDocumentView.tsx`) for the First-Draft review affordance, optional `StoryBibleTab.tsx` affordance only for structured-state review (no composed artifact), `client/src/App.tsx` **Morgan/LeftRail send handler (~595-648)** for the review packet (**not** `handleSpecialistSend` ~654-677). Tests: rubric selection, review-ready/structured-state gating, packet assembly, transcript-target assertion (lands in `writingPartner`).
- **Slice 7:** `client/src/App.tsx` + `client/src/components/shell/Shell.tsx` (new full Morgan shell view/route), new `client/src/components/shell/MorganWorkspace.tsx` (chat + draft review pane), new `client/src/components/shell/DraftReviewPane.tsx`, `shared/workingDraft.ts` (Working Draft + version types) + `ProjectState.documents.<surface>` extension for the stored Working Draft, `client/src/lib/projectState.ts` (duplicate-First-Draft-into-Working-Draft action), `client/src/components/shell/LeftRail.tsx` (deep-link "open full"). WritersRoom untouched. Tests: workspace render, duplicate creates Working Draft from composed First Draft, recompose-cannot-silently-replace.
- **Slice 8 (gated):** remove dead `storyUpdates` (`server/ai/openaiService.ts`, `server/routes.ts`, `extractStoryUpdates`), new `shared/draftEditProposal.ts` (`DraftEditProposal` targets the Working Draft only), new `shared/draftPatch.ts` (**pure** apply + `draftHash` + version + stale-write guard), client commit of the new version in `client/src/lib/projectState.ts`, Accept/Reject UI in `DraftReviewPane.tsx`, optional `server/routes.ts` stateless validate/return endpoint (**no persistence**). Tests: proposal validation, pure-patch/stale-guard unit tests, Accept-required-before-commit, stale-write rejection on `draftHash` drift, **source `content` and composed First Draft byte-identical before/after an applied patch (no reverse-sync, no recompose)**.

## 11. Tests / Verification per Slice

Every slice ends green on `npm run test:run` · `npm run check` · `npm run build`. UI slices also browser-verified (don't trust static read — CLAUDE.md).

- **Slice 1:** assert Morgan's system prompt contains showrunner/triage framing and differs from the generic specialist prompt; assert Morgan's `maxTokens` > specialist default; assert `writingPartner` still receives all context sections.
- **Slice 2:** assert Morgan prompt permits general-knowledge answering + carries the "return to the work" guardrail; smoke test with a mocked provider (LLM output is non-deterministic — assert prompt construction, not the literal "The Fugitive" string).
- **Slice 3:** unit-test the doc-state selector against fixtures for each `kind` and `tier`; assert the context-summary block renders only for Morgan (and chosen specialists) per `PERSONA_CONTEXT_ORDER`; route test asserts state maps end-to-end.
- **Slice 4:** registry shape validation; `capabilitiesForSurface`/`webCapabilities` selector tests; assert Morgan prompt enumerates the surface-applicable subset and omits others.
- **Slice 5:** boundary rejects malformed/oversized requests; mock-executes a valid request and returns a well-formed `CapabilityReceipt`; assert no inline `fetch` exists on the chat endpoints (guard test); config-off path degrades cleanly.
- **Slice 6:** correct `rubricKey` selected per surface; affordance gated strictly on review-ready state; review packet contains composed blocks + fidelity + readiness and is read-only (no state mutation in the path).
- **Slice 7:** workspace renders chat + draft review pane; "Open in Morgan" duplicates the composed First Draft into a stored Working Draft; recompose produces a candidate that does **not** replace the current Working Draft without an explicit writer choice; rail deep-link opens workspace; rail/WritersRoom/transcript isolation unaffected.
- **Slice 8 (gated):** dead-path removal leaves suite green; `DraftEditProposal` validation; **`shared/draftPatch.ts` is pure and unit-tested** (apply, hash, version, stale-write guard); Accept required before the client commits; stale-write guard rejects when the Working Draft `draftHash` drifted; the **client** commits the new draft version (server, if used, only validates/returns — no persistence); **structured source `content` and the composed First Draft are byte-identical before/after an applied patch** (no reverse-sync, no recompose, per §7).

## 12. Risks & Non-Goals

**Risks**
- **Token/cost creep** from a heavier Morgan context (doc-state + composed blocks + rubric). Mitigate: gate the heavy blocks by persona via `PERSONA_CONTEXT_ORDER`; cap composed-block inclusion; keep specialist context lean.
- **Prompt-path divergence.** Two Morgan paths exist today (`/api/wp-chat` generic vs `/swarm` synthesis). Slice 1 must not create a *third* inconsistent identity — converge on one canonical Morgan prompt the wp-chat path uses; leave `/swarm` alone unless explicitly unifying later.
- **Web boundary as an injection/exfil surface.** Mitigate: server-owned, validated, length/rate-capped, single allowed provider, config-gated, receipts for audit. Never model-driven free fetch.
- **Awareness vs honesty regression.** Morgan must not claim to have read more than she has (recurring context-awareness failure mode in this repo). Mitigate: prompt instructs explicit "I can see X, not Y" honesty; reuse the truncation-metadata discipline already in the context path.
- **UX scope creep** in Slice 7. Mitigate: rail-first through Slice 6; workspace + draft pane are additive and late.
- **Artifact confusion: form fields vs composed First Draft vs current Morgan Working Draft.** Three coexisting representations of "the document" risk the writer (or the agent) editing/trusting the wrong one. Mitigate: label each explicitly in the UI; the draft pane always shows *which* artifact and *which* draft version; Morgan's prompt states which artifact she is reviewing/patching; recompose results are clearly marked as *candidates*, not the current draft.

**Non-Goals**
- No silent edits. No agent editing at all in Slices 1–6; Slice 7 only *creates* the Working Draft duplicate (no agent edits); agent-proposed patches begin in Slice 8, behind Accept.
- **No source-field reverse-sync, ever.** Morgan never rewrites structured source form fields; draft patches never auto-propagate back into the answer layer (§7). Patches target the Morgan Working Draft only.
- **No silent overwrite of the Morgan Working Draft by recompose.** Recompose produces a First Draft *candidate*; replacing/merging the current Working Draft is always an explicit writer choice.
- **No edit-in-place of the composed First Draft as "the form."** The First Draft is a regenerate-only baseline; durable edits live on the Working Draft.
- No OpenSwarm expansion; no new OpenSwarm agency; no touching `/swarm` / Zoe paths without reason.
- No server-side auto-routing between personas — routing stays client-side and user-initiated.
- No replacement of specialists; Morgan coordinates, she doesn't absorb craft lenses.
- No copying `ai-film-writing-templates/` content into the repo.
- No giant destructive redesign; no removal of the rail.
- No async/background agency (that rung is beyond even Slice 8).

---

## Codex Review Checklist

Hand this plan to Codex and ask it to verify, before any implementation:

1. **Grounding accuracy.** Do the cited files/symbols/line ranges still exist and mean what the plan says? Spot-check: **`LeftRail.tsx` = Morgan host vs `WritersRoom.tsx` = specialist dock** (not conflated); the **Morgan send handler** (`App.tsx:~595-648`, writes `writingPartner` transcript) vs `handleSpecialistSend` (`~654-677`); `getDefaultPersona` is display-only (`leftZone.ts`); `createPersonaSystemPrompt`, `generatePersonaResponse`, `createContextSummary`, `PERSONA_CONTEXT_ORDER` (`server/ai/openaiService.ts`); `/api/wp-chat` (`server/routes.ts`); `writingPartner` persona (`shared/personas.ts`); `deriveX DocumentState` (client-only) + `readiness.tier` + `ComposedDocument`; `StoryMemory.surface`/`.location` (`shared/schema.ts`); `TranscriptMessage.capabilityReceipt`; Zoe-shaped `shared/personaCapability.ts`.
2. **Dependency-line conformance.** Confirm Slices 1–6 are strictly read-only, Slice 7 only creates the Working Draft duplicate (no agent edits), and no draft-mutation capability leaks in before Slice 8's five-step gate (storyUpdates removal → Working Draft artifact+versions → proposal schema → Accept/Reject → stale-write guard + apply/version).
3. **Thin-adapter rule.** Confirm new server logic lands in service/capability modules, not inflated into the `/api/wp-chat` handler.
4. **Web boundary safety.** Confirm web access is server-owned, validated, capped, config-gated, receipt-attributed, and that the plan forbids model-driven/inline fetch on chat endpoints.
5. **Persona-gating.** Confirm the heavy doc-state/rubric context is gated via `PERSONA_CONTEXT_ORDER` and won't bloat specialist prompts or costs.
6. **Prompt-path convergence.** Confirm Slice 1 does not create a third inconsistent Morgan identity alongside `/api/wp-chat` and `/swarm`.
7. **Transcript invariants.** Confirm Morgan's `agents.writingPartner.transcript` stays separate from specialist transcripts throughout (incl. Slice 6 review flow and Slice 7 workspace) — and that the review flow routes through the Morgan send path, never `handleSpecialistSend`.
8. **Shared-safety.** Confirm no `server`→`client` or `shared`→`client` imports are introduced (esp. Slice 3 document-state derivation); confirm the extract-vs-serialize choice keeps the server reading only shared/serialized data.
9. **First Draft → Morgan Working Draft lifecycle (§7/§8).** Confirm the five-artifact lifecycle is explicit (source answers → composed First Draft → duplicated Working Draft → draft versions → current authored draft). Confirm **Accept patches the Working Draft and saves a new version — never the form fields and never a recompose**. Confirm **recompose produces a First Draft candidate that cannot silently overwrite the current Working Draft** (writer chooses replace/merge/keep). Confirm no reverse-sync into source fields, and that the three artifacts are clearly distinguished (no edit-in-place of the First Draft as "the form").
10. **Document authority / context precedence (§7 + §3.2).** Confirm that once a Working Draft exists it is treated as the current authored document, and that the awareness seam exposes and **prefers the Working Draft over the stale composed First Draft** when Morgan answers about the document; the First Draft is labeled a superseded baseline; fields stay canonical input for recompose only.
11. **Persistence reality (§8).** Confirm the plan treats ProjectState as client-owned (`useProjectState`/`projectStorage`) and the server as a stateless validator; the Draft Patch Flow uses **shared pure patch/hash/version logic with a client commit**; no step claims `routes.ts` durably persists project state (server persistence is out of scope).
12. **Story Bible scope (§6/§7).** Confirm Story Bible is treated as structured-state review only (no composed First Draft / document view / state deriver today), and that Working Draft duplication/editing for Story Bible is gated behind an explicit prerequisite slice (Story Bible First Draft composer) — not silently assumed.
13. **Dead-code handling.** Confirm `storyUpdates`/`extractStoryUpdates` removal is sequenced first in Slice 8 and not relied on earlier.
14. **Inspiration boundary.** Confirm rubrics/registry are *adapted*, with no verbatim copying of `ai-film-writing-templates/` into the repo.
15. **Slice independence.** Confirm each slice is independently shippable, testable, and reversible — and flag any hidden cross-slice coupling.
16. **Test sufficiency.** For each slice, confirm the listed tests actually prove the slice's goal (esp. non-deterministic LLM slices testing prompt construction, not output strings).
17. **Missing risks.** Name anything the Risks/Non-Goals section omits.
