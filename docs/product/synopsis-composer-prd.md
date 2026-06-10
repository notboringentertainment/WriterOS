# Synopsis Composer Implementation PRD

**Date:** 2026-06-09
**Status:** Implementation PRD; ready for build after review
**Owner:** Ben
**Slice:** Synopsis Composer (first multi-surface expansion of the Document Composer)
**Mirrors:** Outline Document Composer Slice 1 (shipped, PR #24)
**Related docs:** `docs/product/document-composer-prd.md` (architecture authority), `docs/product/document-composer-surface-standards-prd.md` (surface standards), `docs/product/synopsis-story-coach-redesign-prd.md` (Synopsis surface canon), `docs/product/README.md`

## Summary

This PRD pins the concrete decisions and task breakdown for the Synopsis Composer, the
next Composer slice after Outline. It is the per-surface implementation PRD that the
surface-standards PRD (L90) requires before code: it resolves the standards-level open
questions, pins concrete readiness thresholds, and maps every file the slice touches
against the shipped Outline pattern.

Scope: compose authored Synopsis answers (`documents.synopsis.content`) into a saved,
read-only `documents.synopsis.composed` artifact for both Feature and Series format,
with Compose/Recompose, tiered readiness, deterministic fidelity warnings, and a
read-only Synopsis Document View — exactly mirroring Outline.

Out of scope: Treatment Composer, Story Bible Composer, the entailment critic, a
diagnostics mode, and any new `ComposedBlock` types. No changes to authored Synopsis
Edit View intake.

## Architecture Inheritance (non-negotiable)

Inherited verbatim from `document-composer-prd.md`:

- `documents.synopsis.content` stays the only canon. `documents.synopsis.composed` is
  derived and read-only. The Composer never writes back into authored answers.
- `ProjectState.meta.format` is the only behavioral authority for Feature vs Series.
  `documents.synopsis.content.header.format` is a display/export mirror only.
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

## Resolved Open Questions

These resolve the standards PRD open questions for the Synopsis slice:

1. **Length enforcement (standards OQ1): rubric-only, no hard word cap.** The recipe and
   rubric target a compact body (Feature: roughly three to five paragraphs; Series: short
   sections). The composer must not enforce a max word range. Rationale: mirrors Outline
   (deterministic `temperature: 0.2`, recipe-driven sectioning, no length truncation); a
   hard cap risks truncating the ending, which a synopsis must reveal.
2. **Missing ending: missing-context state, never fabricated.** If `prose.resolution`
   (Feature) or `series.pilot.prose` (Series) is empty, the artifact composes from
   answered material and the Document View shows a missing-context note that the ending is
   not yet answered. The composer does not supply an ending.
3. **No new block types.** Synopsis reuses the existing union: `heading`, `subheading`,
   `meta`, `logline`, `paragraph`, `divider`, `leadInParagraph`. Feature body = `logline`
   + `paragraph` blocks. Series = `heading` + `paragraph` per section. This is sufficient;
   confirmed against `shared/compose/types.ts` L46–76.

## Pinned Readiness Thresholds

Readiness mirrors Outline's three tiers (`sparse` → below-readiness/hard-disable,
`partial` → missing-context, `rich` → full). Concrete per-field gates:

### Feature

- **Hard-disable (`sparse`)** if either:
  - `logline.protagonist` is empty (standards L224: no protagonist ⇒ hard-disable), or
  - zero of the five prose movements (`prose.opening`, `prose.escalation`, `prose.middle`,
    `prose.climax`, `prose.resolution`) is present (nothing to compose).
- **Missing-context (`partial`)** if protagonist and ≥1 movement are present but any of:
  `prose.resolution` empty (ending not yet answered), `logline.obstacle` empty, or
  `logline.stakes` empty. Compose proceeds; do not inflate vague pressure into a false
  antagonist (standards L222–223).
- **Rich** if protagonist, all five prose movements, and `logline.{goal,obstacle,stakes}`
  are present.

`coreRequiredFieldIds` (Feature): `['logline.protagonist']`.
OR-group: ≥1 of the five `prose.*` movement fields.

### Series

- **Hard-disable (`sparse`)** if either:
  - `series.showOverview` is empty (standards L224: no central show engine ⇒
    hard-disable), or
  - zero of `series.pilot.logline`, `series.pilot.prose`, `series.seasonOneArc` is present.
- **Missing-context (`partial`)** if `series.showOverview` is present but any of:
  `series.pilot.prose` empty (pilot ending not yet answered) or `series.seasonOneArc`
  empty.
- **Rich** if `series.showOverview`, `series.pilot.{logline,prose}`, `series.seasonOneArc`
  are all present.

`coreRequiredFieldIds` (Series): `['series.showOverview']`.
OR-group: ≥1 of `series.pilot.logline`, `series.pilot.prose`, `series.seasonOneArc`.

`series.futureSeasons`, `series.characters`, and `series.compsAndWhyThisShowNow` are
omittable: their sections are omitted when empty, never invented.

## Fact Sheet

New `buildSynopsisFactSheet(content, format)` mirrors `buildOutlineFactSheet`
(`shared/compose/factSheet.ts`): drop empty/whitespace fields, stable-sort by id, fence
nothing here (fencing happens in the prompt builder). Field ids below are the real schema
paths verified against `shared/documents.ts` L42–128.

### Feature fields

| id | label | kind |
| --- | --- | --- |
| `logline.text` | Logline | prose |
| `logline.protagonist` | Protagonist | name |
| `logline.goal` | Goal | prose |
| `logline.obstacle` | Obstacle | prose |
| `logline.stakes` | Stakes | prose |
| `logline.hook` | Hook | prose |
| `prose.opening` | Opening | prose |
| `prose.escalation` | Escalation | prose |
| `prose.middle` | Middle | prose |
| `prose.climax` | Climax | prose |
| `prose.resolution` | Resolution | prose |

### Series fields

| id | label | kind |
| --- | --- | --- |
| `logline.text` | Series logline | prose |
| `series.showOverview` | Show overview | prose |
| `series.pilot.logline` | Pilot logline | prose |
| `series.pilot.prose` | Pilot synopsis | prose |
| `series.seasonOneArc` | Season one arc | prose |
| `series.futureSeasons.<id>.summary` | Where it goes — `<label>` | prose |
| `series.characters.<id>.name` | Character name | name |
| `series.characters.<id>.role` | Character role | prose |
| `series.characters.<id>.bio` | Character bio | prose |
| `series.characters.<id>.arcPerSeason` | Character arc per season | prose |
| `series.compsAndWhyThisShowNow` | Comps and why this show now | prose |

`series.characters[].arcPerSeason` is a `string[]` in the schema. The fact-sheet builder
must join non-empty entries into a single stable prose value (preserving order) under the
`series.characters.<id>.arcPerSeason` id rather than dropping it; the per-season arc is
authored canon the synopsis should be able to draw on.

`series.seriesType` and `series.episodeLength` are header/metadata, not fact-sheet prose
fields; they render in the Document View metadata line, not as composable facts.

### Identity for `sourceHash`

Reuse `ComposeIdentity = { title, genre }` (from `header.title`, `header.genre`) plus
`format`, exactly as Outline. `computeSynopsisSourceHash(content, format, identity)` calls
`buildSynopsisFactSheet` then `stableHash({ factSheet, format, identity })`.

## Recipe

New `getSynopsisRecipe(format)` with `SYNOPSIS_RECIPE_VERSION = 1`, mirroring
`shared/compose/recipe.ts`. Recipe output uses professional headings, never Edit View
question labels.

### Feature recipe

- `coreRequiredFieldIds: ['logline.protagonist']`
- Sections:
  1. `logline` — style `prose`, `omittable: false`, important:
     `logline.text, logline.protagonist, logline.goal, logline.obstacle, logline.stakes`.
     Emits a single `logline` block (the lead line).
  2. `synopsisBody` — style `prose`, `omittable: false`, important:
     `prose.opening, prose.escalation, prose.middle, prose.climax, prose.resolution`.
     Emits the compact causal body (≈3–5 `paragraph` blocks). Present-tense, third-person,
     causal, names only essential characters, makes the therefore/but chain legible.

### Series recipe

- `coreRequiredFieldIds: ['series.showOverview']`
- Sections (each a `heading` + `paragraph`; omittable ones omitted when empty):
  1. `seriesLogline` — `prose`, `omittable: false`, important: `logline.text`.
  2. `showOverview` — `prose`, `omittable: false`, important: `series.showOverview`.
  3. `pilotSynopsis` — `prose`, `omittable: false`, important:
     `series.pilot.logline, series.pilot.prose`.
  4. `seasonOneArc` — `prose`, `omittable: true`, important: `series.seasonOneArc`.
  5. `whereItGoes` — `prose`, `omittable: true`, important: `series.futureSeasons.*`.
  6. `characters` — `prose`, `omittable: true`, important:
     `series.characters.<id>.{name, role, bio, arcPerSeason}`.
  7. `compsWhyNow` — `prose`, `omittable: true`, important: `series.compsAndWhyThisShowNow`.

## Composer Prompt

`server/compose/buildComposePrompt.ts` is **not** fully surface-generic today: it hardcodes
the Outline lens (the "Oliver" persona, L4) and Outline-specific style rules (L27). The
fact-fencing and hard-rule scaffolding it provides *are* generic, but the lens and style
are not.

The implementation must generalize the prompt builder to accept a surface-specific lens
and style contract — either by parameterizing `buildComposePrompt` with a
`{ persona, styleRules }` (or equivalent) contract selected by surface, or by routing to a
dedicated Synopsis prompt contract — while preserving the Outline output **exactly**
(extract the current Oliver/outline strings into the Outline contract so Outline golden
tests stay byte-stable).

The Synopsis lens/style contract instructs compact causal synopsis prose with the
standards "Must Avoid" list baked in: no hiding the ending, no poster copy, no
scene-by-scene outline, no camera directions, no unsupported theme/motive claims. The
generic scaffolding is shared and unchanged in behavior: inert fenced source facts, no
invented facts, every prose block carries `sourceFieldIds`, JSON-only `{ blocks }` output,
`temperature: 0.2`.

## Fidelity

Reuse `server/compose/runFidelityCheck.ts` and `server/compose/entityInventory.ts`
unchanged — both are surface-generic. Same five checks (missing_provenance,
dangling_source_id, coverage, entity_diff, injection_echo). Same "structure-checked, not
meaning-verified" labeling. Entailment critic stays deferred.

## Document View

New `SynopsisDocumentView.tsx` mirrors `OutlineDocumentView.tsx`, driven by a new
`deriveSynopsisDocumentState` mirroring `outlineDocumentState.ts` with the same state
kinds: `below_readiness`, `ready_uncomposed`, `fresh`, `missing_context`, `answer_stale`,
`recipe_stale`, `flagged`. Same button copy contract:

- answer-stale: "Your answers changed — Recompose."
- recipe-stale: "A newer document format is available — Recompose."
- missing-context: "Composed from what you've answered so far…" plus a named note when the
  ending is absent ("The ending isn't answered yet.").
- flagged: "Structure-checked, not meaning-verified."

Feature renders: title + metadata, `logline` lead block, compact body paragraphs, optional
missing-context note outside the professional body. Series renders the seven sections as
`heading` + `paragraph` groups, empty sections omitted. The professional body never shows
Edit View questions, schema paths, `sourceFieldIds`, fidelity internals, recipe keys, or
placeholders (standards L106–119).

## Task Breakdown

### Edit (widen shared surface seams)

- `shared/compose/types.ts` — widen `FactSheet.surface` and `Recipe.surface` from
  `'outline'` to `'outline' | 'synopsis'`.
- `shared/compose/requestSchema.ts` — `surface` from `z.literal('outline')` to a
  discriminated request: `surface: z.enum(['outline','synopsis'])` with the matching
  content schema (`SynopsisDocumentContentSchema` when surface is synopsis).
- `shared/compose/readiness.ts` — generalize `getOutlineReadiness` to accept the recipe's
  core/OR-group config (or add `getSynopsisReadiness`); keep the Outline path behavior
  identical.
- `server/compose/index.ts` — dispatch on `surface` to select the fact-sheet builder,
  recipe, source-hash fn, and readiness; keep `composeOutline` behavior unchanged.
- `server/compose/buildComposePrompt.ts` — generalize to accept a surface-specific
  lens/style contract (see Composer Prompt). Extract the current Oliver/outline strings
  into an Outline contract so Outline output stays byte-identical; add the Synopsis
  contract. Outline golden tests must stay green.
- `server/routes.ts` — `POST /api/compose-document` accepts `surface: 'synopsis'` and
  routes to the synopsis pipeline. Single endpoint, no new route.

### Create (surface-specific)

- `shared/compose/synopsisFactSheet.ts` — `buildSynopsisFactSheet`.
- `shared/compose/synopsisRecipe.ts` — `getSynopsisRecipe`, `SYNOPSIS_RECIPE_VERSION`.
- `shared/compose/synopsisSourceHash.ts` — `computeSynopsisSourceHash`.
- `server/compose/synopsisPromptContract.ts` (or a contract registry consumed by the
  generalized `buildComposePrompt`) — the Synopsis lens + style contract.
- `client/src/lib/synopsisComposeClient.ts` — `requestSynopsisCompose` mirroring
  `composeClient.ts`. The client validates the request payload and validates the response
  with `ComposedDocumentSchema.safeParse`. It does **not** own the double-submit guard.
- `client/src/components/writing/SynopsisTab.tsx` — owns the compose handler, mirroring
  `OutlineTab.tsx`: an `isComposing` state plus an `isComposingRef` guard
  (`if (isComposingRef.current) return`) so the guard lives in the tab/component handler,
  not the client. Passes `isComposing`/`onCompose` down to `SynopsisDocumentView`.
- `client/src/lib/synopsisDocumentState.ts` — `deriveSynopsisDocumentState`.
- `client/src/components/writing/synopsis/SynopsisDocumentView.tsx` — presentational;
  receives `isComposing` + `onCompose` as props, mirroring `OutlineDocumentView`.
- `tests/fixtures/synopsis/syntheticSynopsis.ts` — synthetic fixture (no external template
  files committed).

### Reuse unchanged (no edits)

`server/compose/composeDocument.ts`, `server/compose/entityInventory.ts`,
`server/compose/runFidelityCheck.ts`, `shared/compose/schemas.ts`
(ComposedDocument/Block validation), `shared/compose/stableHash.ts`.

(`server/compose/buildComposePrompt.ts` is **not** in this list — it is generalized under
Edit above.)

### Persistence

`documents.synopsis.composed` already exists in `shared/documents.ts` (the
`AuthoredDocumentStateSchema` `composed` field applies to all four surfaces). No schema
change needed.

## Tests

Mirror the Outline test suite, one Synopsis analog each:

- `tests/shared/compose/synopsisFactSheet.test.ts`
- `tests/shared/compose/synopsisRecipe.test.ts`
- `tests/shared/compose/synopsisReadiness.test.ts` (the pinned thresholds above)
- `tests/shared/compose/synopsisSourceHash.test.ts`
- `tests/server/compose/synopsisComposeRoute.test.ts` (clean fixture, soft-fail,
  invalid-request, surface routing)
- `tests/server/compose/synopsisGolden.test.ts` (full compose flow golden file)
- `tests/lib/synopsisComposeClient.test.ts` (request + response validation only)
- `tests/lib/synopsisDocumentState.test.ts` (answer-stale, recipe-stale, missing-ending)
- `tests/components/SynopsisDocumentView.test.tsx`
- `tests/components/SynopsisTab.test.tsx` (double-submit guard: a second compose call while
  one is in flight is ignored, mirroring the OutlineTab guard)

Regression: existing Outline tests must stay green after the shared-seam widening.

## Acceptance Criteria

- `POST /api/compose-document` accepts `surface: 'synopsis'` for Feature and Series and
  returns a valid `ComposedDocument`.
- Feature composes a `logline` lead + compact causal body; Series composes the seven
  sections with empty omittable sections omitted.
- The pinned readiness thresholds gate Compose exactly as specified; no-protagonist
  (Feature) and no-show-overview (Series) hard-disable.
- A missing ending yields a composed artifact plus a named missing-context note; no
  fabricated resolution.
- Deterministic fidelity warnings surface and the artifact is labeled structure-checked.
- `sourceHash`/`recipeVersion` drive answer-stale and recipe-stale states in the Document
  View, mirroring Outline.
- Composed output round-trips through `documents.synopsis.composed` and never writes back
  to `documents.synopsis.content`.
- Series `arcPerSeason` entries reach the fact sheet (joined, ordered) and are eligible for
  the characters section; they are not silently dropped.
- The double-submit guard lives in `SynopsisTab`'s compose handler (state + ref), not in
  `synopsisComposeClient`; a second compose while one is in flight is a no-op.
- The generalized `buildComposePrompt` leaves Outline output byte-identical (Outline golden
  tests green) while serving the Synopsis lens/style contract.
- No new `ComposedBlock` types; no changes to Synopsis Edit View intake.
- All Outline composer tests remain green.

## Out of Scope

- Treatment and Story Bible Composers (separate, later slices — one surface at a time).
- Entailment critic (Layer 3), diagnostics mode, hard word-count enforcement.
- New block types (list/key-value/table) — reserved for the Story Bible slice.
- Any Synopsis Edit View / intake change.
