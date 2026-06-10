# Treatment Composer Implementation PRD

**Date:** 2026-06-10
**Status:** Implementation PRD; ready for build after review
**Owner:** Ben
**Slice:** Treatment Composer (third Composer surface, after Outline and Synopsis)
**Mirrors:** Synopsis Composer (shipped, PR #25) over the Outline Slice 1 architecture (shipped, PR #24)
**Related docs:** `docs/product/document-composer-prd.md` (architecture authority), `docs/product/document-composer-surface-standards-prd.md` (surface standards), `docs/product/treatment-surface-prd.md` (Treatment surface canon), `docs/product/synopsis-composer-prd.md` (previous slice pattern), `docs/product/README.md`

## Summary

This PRD pins the concrete decisions and task breakdown for the Treatment Composer, the
next Composer slice after Synopsis. It is the per-surface implementation PRD the
surface-standards PRD requires before code: it resolves the standards-level open
questions for Treatment, pins concrete readiness thresholds, enumerates the real
fact-sheet field ids verified against `shared/documents.ts` (L265–357), and maps every
file the slice touches against the shipped Outline/Synopsis pattern.

Scope: compose authored Treatment answers (`documents.treatment.content`) into a saved,
read-only `documents.treatment.composed` artifact, with Compose/Recompose, tiered
readiness, deterministic fidelity warnings, and a composed Treatment Document View —
exactly mirroring the Outline/Synopsis pipeline.

Out of scope: Story Bible Composer, the entailment critic, a diagnostics mode, any new
`ComposedBlock` types, any Treatment Edit View / intake change, and any Treatment schema
expansion (standards L304–305: the first Treatment Composer learns how far the current
authored material goes when composed well).

## Architecture Inheritance (non-negotiable)

Inherited verbatim from `document-composer-prd.md`:

- `documents.treatment.content` stays the only canon. `documents.treatment.composed` is
  derived and read-only. The Composer never writes back into authored answers.
- `ProjectState.meta.format` is the only behavioral authority for Feature vs Series.
  `documents.treatment.content.header.format` is a display/export mirror only
  (`treatment-surface-prd.md` L51, L285).
- Composition is a single constrained call. No OpenSwarm, no orchestration, no
  conversational turns.
- Authored answers are fenced as untrusted source material inside `<source_facts>`.
- Deterministic fidelity first (provenance, coverage, entity diff, injection echo).
  Output is honestly labeled "structure-checked, not meaning-verified." Entailment
  critic stays deferred.
- Suspicious prompt-control echoes are flagged or fail the attempt, never silently
  stripped.
- Compose/Recompose are user-initiated only. No auto-compose on edit, reload, or tab
  switch.
- Staleness tracked by `sourceHash` plus `recipeVersion` and `composerVersion`, surfacing
  distinct answer-stale and recipe-stale states.

Known inherited limitation (do not fix in this slice): `derive*DocumentState` ignores
`composerVersion` (only `sourceHash` + `recipeVersion`), so prompt/contract changes do not
trigger a Recompose banner. Tracked as a Composer architecture cleanup; Treatment mirrors
the shipped behavior.

## Shared Architecture vs Surface-Specific Standard

Outline and Synopsis are the shipped foundation — but Treatment must not feel like
"Synopsis with more fields." The architecture is shared; the document standard is
surface-specific. The line is explicit:

**Reused from Outline/Synopsis (shared architecture — do not re-invent):**

- the compose route shape (`POST /api/compose-document`, single endpoint, discriminated
  request union),
- the `ComposedDocument` / `ComposedBlock` model and its Zod schemas,
- `sourceHash` + `recipeVersion` + `composerVersion` and the answer-stale / recipe-stale
  staleness states,
- the deterministic fidelity pipeline (provenance, coverage, entity diff, injection
  echo), including the `importantFieldPrefixes` coverage for dynamic-id sections shipped
  in the Synopsis slice, and the "structure-checked, not meaning-verified" labeling,
- the `PromptContract` registry in `server/compose/promptContracts.ts` (lens + style per
  surface over shared safety scaffolding),
- persistence into `documents.<surface>.composed`,
- the readiness tiering shape and the Document View / Tab UI state model
  (below-readiness, ready, fresh, missing-context, answer-stale, recipe-stale, flagged).

**Surface-specific to Treatment (must NOT inherit Outline's or Synopsis's standard):**

- **Not** the Oliver lens, and **not** the Synopsis coverage-editor lens. Treatment uses
  its own composing lens (a treatment writer), supplied as a per-surface prompt contract.
- **Not** the step-outline voice, scannable-beats mandate, bold beat-lead-ins, or the
  "terse, 1–2 sentence" per-beat rule (Outline). **Not** the compact 3–5 paragraph
  whole-story summary voice (Synopsis).
- Treatment voice is present-tense, third-person **cinematic prose** — longer and more
  vivid than a synopsis, less mechanically structured than an outline (standards
  L283–286). Vivid but controlled paragraphs emphasizing visible action, choices,
  consequences, images, turns, climax, and resolution (standards L362–364). It lets a
  reader experience the full story before script pages. It is not a beat sheet,
  screenplay, scriptment, pitch blurb, or story bible (standards L288–289).
- Treatment sections, readiness gates, recipe, and fact sheet are its own (defined
  below); they share the Outline/Synopsis *shapes* but none of their *content*.

Outline and Synopsis output must stay byte-identical: their contract strings are not
touched, and their golden/prompt tests stay green.

## Resolved Open Questions

1. **Format handling (`treatment-surface-prd.md` OQ4, L380): format-agnostic V1.**
   `TreatmentDocumentContent` has a single shape with no feature/series branch
   (`shared/documents.ts` L327–336). The Treatment recipe and readiness are identical for
   both formats; `getTreatmentRecipe(format)` carries the request `format` into the
   `Recipe` shape (the shared type requires it) but emits the same sections either way.
   `format` still participates in the source hash and the Document View metadata line, so
   a format flip surfaces as answer-stale and the displayed format stays correct. No
   series-specific Treatment prose prompts in this slice.
2. **Open questions addendum (standards OQ2, L611–612): keep them out entirely.**
   `openQuestions.*` are excluded from the fact sheet, so the model never sees them and
   cannot resolve them (standards L337–339: open questions are not source material). The
   composed Document View does not render an addendum in V1. A later PRD may add a
   development addendum.
3. **AI production implications: excluded.** `aiProductionImplications` never enters the
   fact sheet or the composed body (standards L366–368, L389: no AI production notes in
   story prose).
4. **Length enforcement: rubric-only, no hard word cap.** Same resolution as Synopsis
   OQ1: recipe-driven sectioning, deterministic `temperature: 0.2`, no truncation. A
   treatment is "longer and more vivid than a synopsis"; a cap risks truncating the
   ending the treatment must tell when supplied.
5. **No new block types.** Treatment reuses the existing union: `heading`, `subheading`,
   `meta`, `logline`, `paragraph`, `divider`, `leadInParagraph` (standards L541–542
   already confirm `subheading`/`divider` suffice). Body = `heading` + `paragraph`
   blocks; the lead line is a `logline` block. List/key-value/table blocks stay reserved
   for the Story Bible slice.
6. **Custom passages: integrated into the story body, not a separate section.** Standards
   L358 render them "where they support the story flow." They are coverage-checked via
   `importantFieldPrefixes` on the body section so the model cannot silently drop an
   answered passage.

## Pinned Readiness Thresholds

Readiness mirrors the shipped three tiers (`sparse` → below-readiness/hard-disable,
`partial` → missing-context, `rich` → full). The standards' core needs (L309–314): a
story engine, a meaningful character, enough flow to compose more than a synopsis, and a
known ending or an explicit missing-ending state. Concrete gates (one set; format does
not change them):

- **Hard-disable (`sparse`)** if either:
  - `logline` **and** `concept.premise` are both empty (no story engine to compose
    from), or
  - fewer than **two** of the four story movements (`prose.opening`, `prose.actOne`,
    `prose.actTwo`, `prose.actThree`) are present (not enough flow to compose more than
    a synopsis; `prose.customSections` do not count toward this gate — they are
    supplemental passages, not the spine).
- **Missing-context (`partial`)** if the core gate is met but any of:
  - `prose.actThree` is empty (ending not yet answered — compose proceeds from answered
    movements; the composer never supplies an ending, standards L345),
  - any of the four story movements is empty,
  - no main character has a non-empty `name` (a protagonist may exist only in the prose,
    which deterministic readiness cannot verify — so this softens to missing-context,
    never hard-disable).
- **Rich** if (`logline` or `concept.premise`) present, all four story movements present,
  and at least one `mainCharacters.<id>.name` present.

The story-engine core gate is a disjunction (`logline` OR `concept.premise`), which the
flat `coreRequiredFieldIds` list cannot express; `getTreatmentReadiness` implements it
directly (the same pattern as `getSynopsisReadiness`, which already owns custom
core/OR-group logic per format). `coreRequiredFieldIds` on the recipe is `[]`; readiness
messaging produces the human label ("a logline or premise") itself.

`concept.tone`, `concept.theme`, `concept.emotionalPromise`, all `visualAndTonal.*`
fields, and `prose.customSections` are never readiness-gated: omitted when empty, never
invented (standards L347: empty visual/tone fields mean clean prose, not added
atmosphere).

## Fact Sheet

New `buildTreatmentFactSheet(content, format)` mirrors `buildSynopsisFactSheet`: drop
empty/whitespace fields, stable-sort by id, no fencing here (fencing happens in the
prompt builder). Field ids below are the real schema paths verified against
`shared/documents.ts` L265–357.

### Fixed fields

| id | label | kind |
| --- | --- | --- |
| `logline` | Logline | prose |
| `concept.premise` | Premise | prose |
| `concept.tone` | Tone | prose |
| `concept.theme` | Theme | prose |
| `concept.emotionalPromise` | Emotional promise | prose |
| `prose.opening` | Opening | prose |
| `prose.actOne` | Act one | prose |
| `prose.actTwo` | Act two | prose |
| `prose.actThree` | Act three | prose |
| `visualAndTonal.overallTone` | Overall tone | prose |
| `visualAndTonal.visualWorld` | Visual world | prose |
| `visualAndTonal.recurringImagesOrMotifs` | Recurring images or motifs | prose |
| `visualAndTonal.musicOrSoundFeeling` | Music or sound feeling | prose |
| `visualAndTonal.pacing` | Pacing | prose |
| `visualAndTonal.genreRules` | Genre rules | prose |
| `visualAndTonal.compsAndReferences` | Comps and references | prose |

### Dynamic fields

| id | label | kind |
| --- | --- | --- |
| `mainCharacters.<id>.name` | Character name | name |
| `mainCharacters.<id>.role` | Character role | prose |
| `mainCharacters.<id>.externalWant` | Character external want | prose |
| `mainCharacters.<id>.internalNeed` | Character internal need | prose |
| `mainCharacters.<id>.flawOrWound` | Character flaw or wound | prose |
| `mainCharacters.<id>.secretOrContradiction` | Character secret or contradiction | prose |
| `mainCharacters.<id>.arc` | Character arc | prose |
| `mainCharacters.<id>.relationshipPressure` | Character relationship pressure | prose |
| `prose.customSections.<id>.body` | Story passage — `<heading>` | prose |

A custom section's `heading` is not a separate fact; it becomes the label of its `body`
fact (falling back to "Story passage" when the heading is empty). A custom section with
an empty/whitespace body is dropped entirely.

### Excluded from the fact sheet

- `openQuestions.*` — not source material (Resolved OQ2). The model never sees them.
- `aiProductionImplications.*` — production diagnostics, never story prose (Resolved
  OQ3).
- `header.*` — identity/metadata only (below), not composable facts.

### Identity for `sourceHash`

Reuse `ComposeIdentity = { title, genre }` from project meta (the same `pickIdentity`
wiring Outline and Synopsis use in `App.tsx`) plus `format`.
`computeTreatmentSourceHash(content, format, identity)` calls `buildTreatmentFactSheet`
then `stableHash({ factSheet, format, identity })`.

## Recipe

New `getTreatmentRecipe(format)` with `TREATMENT_RECIPE_VERSION = 1`, mirroring
`shared/compose/synopsisRecipe.ts`. One section list for both formats (Resolved OQ1).
Recipe headings are professional document headings, never Edit View question labels.

- `coreRequiredFieldIds: []` (the story-engine disjunction lives in
  `getTreatmentReadiness`; see Pinned Readiness Thresholds).
- Sections (each emits a `heading` plus its blocks; omittable ones omitted when empty):
  1. `logline` — style `prose`, `omittable: false`, important: `logline`. Emits a single
     `logline` block (the lead line). When `logline` is unanswered but `concept.premise`
     carries the engine, the lead line composes from the premise
     (important: `logline, concept.premise`).
  2. `concept` — heading "Concept", style `prose`, `omittable: true`, important:
     `concept.premise, concept.tone, concept.theme, concept.emotionalPromise`. A short
     overview paragraph; omitted when all four are empty.
  3. `mainCharacters` — heading "Main Characters", style `prose`, `omittable: true`,
     `importantFieldPrefixes: ['mainCharacters.']`. One brief, factual paragraph per
     character (name, role, want/need, flaw, arc, relationship pressure as answered).
     Thin character answers stay brief and factual (standards L346) — no invented
     psychology.
  4. `treatmentBody` — heading "The Story", style `prose`, `omittable: false`, important:
     `prose.opening, prose.actOne, prose.actTwo, prose.actThree`,
     `importantFieldPrefixes: ['prose.customSections.']`. The treatment spine: cinematic
     present-tense paragraphs walking the full known story in order, with authored custom
     passages integrated where they support the flow (Resolved OQ6). Empty movements are
     composed around, never filled (standards L343–344).
  5. `visualAndTonal` — heading "Visual and Tonal Language", style `prose`,
     `omittable: true`, important: the seven `visualAndTonal.*` fields. A separate
     closing section when authored (standards L359); omitted when all seven are empty.

## Composer Prompt

The `PromptContract` registry (`server/compose/promptContracts.ts`) gains a Treatment
contract: `getPromptContract('treatment')`. The Outline and Synopsis contract strings are
untouched — their golden and prompt tests must stay byte-green.

The Treatment lens/style contract states it is a **treatment** (not an outline, synopsis,
beat sheet, scriptment, or pitch), written by a treatment writer in present-tense,
third-person cinematic prose — vivid but controlled, emphasizing visible action, choices,
consequences, images, turns, climax, and resolution — telling the whole known story
including the ending **when supplied**, with the standards "Must Avoid" list (L382–390)
baked in:

- no beat outline with prettier sentences,
- no screenplay pages or scriptment formatting,
- no invented dialogue, scenes, motivations, endings, or relationship changes,
- no camera directions,
- no resolving open questions,
- no AI production notes in story prose,
- no generic sensory atmosphere unsupported by the writer's texture answers,
- and **no assistant-to-user framing or metacommentary** ("Based on what you have",
  "your answers", "you provided", "this draft will…") — the artifact must read as the
  treatment itself.

The generic scaffolding is shared and unchanged in behavior: inert fenced source facts,
no invented facts, every prose block carries `sourceFieldIds`, JSON-only `{ blocks }`
output, first-heading/no-preamble rule, block-type list, `temperature: 0.2`.

## Fidelity

Reuse `server/compose/entityInventory.ts` and `server/compose/runFidelityCheck.ts`
unchanged. The `importantFieldPrefixes` coverage shipped in the Synopsis slice already
handles Treatment's dynamic-id sections (`mainCharacters` → `mainCharacters.`,
`treatmentBody` → `prose.customSections.`), so the model cannot silently drop an answered
character or custom passage and still pass clean. Same five checks, same
"structure-checked, not meaning-verified" labeling, entailment critic deferred.

## Document View

`client/src/components/writing/treatment/TreatmentDocumentView.tsx` **already exists** as
a stored-answer renderer; per `document-composer-prd.md` (composed artifact supersedes
re-render-stored-answers), it is **replaced** with composed-artifact rendering driven by
a new `deriveTreatmentDocumentState` mirroring `synopsisDocumentState.ts`, with the same
state kinds: `below_readiness`, `ready_uncomposed`, `fresh`, `missing_context`,
`answer_stale`, `recipe_stale`, `flagged`. Same button copy contract:

- answer-stale: "Your answers changed — Recompose."
- recipe-stale: "A newer document format is available — Recompose."
- missing-context: "Composed from what you've answered so far…" plus a named note when
  the ending is absent ("The ending isn't answered yet." when `prose.actThree` is empty).
- flagged: "Structure-checked, not meaning-verified."

Renders: title + metadata line (format from `ProjectState.meta.format` authority, per
`treatment-surface-prd.md` L285), the `logline` lead block, then the composed sections
(Concept, Main Characters, The Story, Visual and Tonal Language) as `heading` +
`paragraph` groups with empty omittable sections absent. Open questions and AI production
implications never appear in the composed body (Resolved OQ2/OQ3). The professional body
never shows Edit View questions, schema paths, `sourceFieldIds`, fidelity internals,
recipe keys, or placeholders.

## Task Breakdown

### Edit (widen shared surface seams)

- `shared/compose/types.ts` — widen `ComposeSurface` to
  `'outline' | 'synopsis' | 'treatment'`.
- `shared/compose/requestSchema.ts` — add the `surface: 'treatment'` branch to the
  discriminated union with `TreatmentDocumentContentSchema`.
- `server/compose/index.ts` — dispatch `surface: 'treatment'` to the treatment fact-sheet
  builder, recipe, source-hash fn, and readiness; Outline and Synopsis paths unchanged.
- `server/compose/promptContracts.ts` — add the Treatment contract to the registry;
  Outline/Synopsis strings untouched.
- `server/routes.ts` — `POST /api/compose-document` accepts `surface: 'treatment'`.
  Single endpoint, no new route.
- `client/src/lib/useProjectState.ts` — widen `setComposedDocument` surface param to
  include `'treatment'`.
- `client/src/App.tsx` — wire `identity` (via `pickIdentity`) and
  `onComposed={(composed) => project.setComposedDocument('treatment', composed)}` into
  `TreatmentTab`.
- `client/src/components/writing/TreatmentTab.tsx` — **edit existing tab** (shipped
  surface, mirrors the Synopsis build-reality delta): add optional `identity`/`onComposed`
  props (optional so existing Edit View tests keep compiling), the compose handler with
  `isComposing` state plus `isComposingRef` guard (`if (isComposingRef.current) return`)
  — the double-submit guard lives in the tab handler, not the client — and pass
  `isComposing`/`onCompose` down to the Document View. The Clear button is already hidden
  outside Edit view (`activeView === 'edit'` condition exists); keep that behavior.
- `client/src/components/writing/treatment/TreatmentDocumentView.tsx` — **replace** the
  stored-answer rendering with composed-artifact rendering via
  `deriveTreatmentDocumentState`; presentational, receives `isComposing` + `onCompose` as
  props. Its existing component test is rewritten to the composed contract.

### Create (surface-specific)

- `shared/compose/treatmentFactSheet.ts` — `buildTreatmentFactSheet`.
- `shared/compose/treatmentRecipe.ts` — `getTreatmentRecipe`, `TREATMENT_RECIPE_VERSION`.
- `shared/compose/treatmentSourceHash.ts` — `computeTreatmentSourceHash`.
- `shared/compose/treatmentReadiness.ts` — `getTreatmentReadiness` (owns the
  story-engine disjunction and movement OR-group; same per-surface pattern as
  `synopsisReadiness.ts`).
- `client/src/lib/treatmentComposeClient.ts` — `requestTreatmentCompose` mirroring
  `synopsisComposeClient.ts`: validates the request payload and validates the response
  with `ComposedDocumentSchema.safeParse`. No double-submit guard here.
- `client/src/lib/treatmentDocumentState.ts` — `deriveTreatmentDocumentState`.
- `tests/fixtures/treatment/syntheticTreatment.ts` — synthetic fixture (no external
  template files committed).

### Reuse unchanged (no edits)

`server/compose/composeDocument.ts`, `server/compose/buildComposePrompt.ts` (already
contract-driven), `server/compose/entityInventory.ts`,
`server/compose/runFidelityCheck.ts`, `shared/compose/schemas.ts`,
`shared/compose/stableHash.ts`, `shared/compose/factSheet.ts`,
`shared/compose/recipe.ts`, `shared/compose/sourceHash.ts`,
`shared/compose/readiness.ts` (Outline), all Synopsis modules.

### Persistence

`documents.treatment.composed` already exists in `shared/documents.ts`
(`AuthoredDocumentStateSchema` applies `composed` to all four surfaces, L549). No schema
change needed.

## Tests

Mirror the Synopsis test suite, one Treatment analog each (TDD: failing test first, one
layer at a time — shared → server → client libs → client UI):

- `tests/shared/compose/treatmentFactSheet.test.ts` (fixed + dynamic ids, custom-section
  labels, openQuestions/aiProduction exclusion)
- `tests/shared/compose/treatmentRecipe.test.ts`
- `tests/shared/compose/treatmentReadiness.test.ts` (the pinned thresholds above,
  including the story-engine disjunction and the <2-movements hard-disable)
- `tests/shared/compose/treatmentSourceHash.test.ts`
- `tests/server/compose/treatmentComposeRoute.test.ts` (clean fixture, soft-fail,
  invalid-request, surface routing)
- `tests/server/compose/treatmentPrompt.test.ts` (lens/style contract; no Oliver, no
  synopsis-coverage strings; must-avoid + anti-metacommentary present)
- `tests/server/compose/treatmentGolden.test.ts` (full compose flow golden file)
- `tests/server/compose/treatmentFidelityCoverage.test.ts` (prefix coverage flags a
  dropped answered character / custom passage)
- `tests/lib/treatmentComposeClient.test.ts` (request + response validation only)
- `tests/lib/treatmentDocumentState.test.ts` (answer-stale, recipe-stale, missing-ending)
- `tests/components/TreatmentDocumentView.test.tsx` (rewritten to the composed contract)
- `tests/components/TreatmentTab.test.tsx` (double-submit guard: a second compose call
  while one is in flight is ignored)

Regression: all existing Outline **and** Synopsis composer tests must stay green —
golden/prompt tests byte-identical after the `ComposeSurface` widening.

## Acceptance Criteria

- `POST /api/compose-document` accepts `surface: 'treatment'` and returns a valid
  `ComposedDocument`; the recipe and readiness are identical for Feature and Series.
- The artifact composes a `logline` lead, then Concept / Main Characters / The Story /
  Visual and Tonal Language sections with empty omittable sections omitted, in cinematic
  present-tense prose — not beats, not screenplay formatting, not synopsis compression.
- The pinned readiness thresholds gate Compose exactly as specified: no story engine
  (no logline **and** no premise) or fewer than two story movements hard-disable; missing
  act three, a missing movement, or no named character yield missing-context.
- A missing ending yields a composed artifact plus the named note "The ending isn't
  answered yet."; no fabricated resolution, ever.
- `openQuestions.*` and `aiProductionImplications.*` never reach the fact sheet, the
  prompt, or the composed body.
- Answered main characters and custom passages are coverage-checked via
  `importantFieldPrefixes`; silently dropping one produces a fidelity warning.
- Deterministic fidelity warnings surface and the artifact is labeled structure-checked.
- `sourceHash`/`recipeVersion` drive answer-stale and recipe-stale states; a project
  format flip surfaces as answer-stale via the hash.
- Composed output round-trips through `documents.treatment.composed` and never writes
  back to `documents.treatment.content`.
- The double-submit guard lives in `TreatmentTab`'s compose handler (state + ref), not in
  `treatmentComposeClient`; a second compose while one is in flight is a no-op.
- Composed blocks read as the treatment itself — no assistant-to-user framing or
  metacommentary anywhere, including the Visual and Tonal Language section.
- No new `ComposedBlock` types; no Treatment Edit View / intake / schema changes.
- All Outline and Synopsis composer tests remain green; their prompt output stays
  byte-identical.

## Out of Scope

- Story Bible Composer (separate, later slice — one surface at a time).
- Entailment critic (Layer 3), diagnostics mode, hard word-count enforcement.
- New block types (list/key-value/table) — reserved for the Story Bible slice.
- Format-specific (feature vs series) Treatment recipes or prompts.
- An open-questions development addendum in the composed Document View.
- Any Treatment Edit View, intake, or schema change.
- The `composerVersion` staleness gap (tracked as a separate Composer architecture
  cleanup).
