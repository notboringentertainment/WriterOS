# Treatment Surface PRD

**Date:** 2026-05-22
**Status:** Canonical for the implemented Treatment surface and next Treatment slices
**Branch context:** `main` after PR #4 (`Add Treatment Document View`)
**Related docs:** `docs/product/README.md`, `docs/product/structured-writing-surfaces-prd.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/outline-story-coach-redesign-prd.md`, `docs/product/agent-workflow-prd.md`, `docs/product/persona-capability-layer-prd.md`, `references/treatment-best-practices-template.md`

> Product alignment note: this PRD formalizes Treatment after the Outline/Treatment split. Treatment is now a first-class writing surface, not a renamed Outline. The former rich Outline story-coach material is copied into Treatment as starter authored material only when Treatment is empty. Outline remains the structural blueprint.

## Context

WriterOS originally had no dedicated Treatment surface, so full-story prose planning was pulled into Synopsis or Outline. That made both surfaces do too much:

- Synopsis became too long when asked to carry the whole story.
- Outline became too prose-heavy when asked to feel like the movie.
- Agents could know that a treatment existed without receiving the actual authored story flow.

Treatment solves that by becoming the readable full-story prose surface. It tells the story before or alongside the script, with enough vividness for a producer, collaborator, studio reader, or AI specialist to understand the dramatic flow, tone, character movement, major turns, and ending.

## Treatment Definition

A treatment is a prose document that tells the full story in cinematic present tense. It is longer and more vivid than a synopsis, but less mechanically structured than an outline. It should reveal the major turns and ending instead of hiding them.

WriterOS keeps the four planning surfaces distinct:

| Surface | Job |
| --- | --- |
| Synopsis | The short pitch. |
| Outline | The structural blueprint: what happens, in order, and why the next beat follows. |
| Treatment | The readable movie or pilot: the full story as cinematic prose. |
| Story Bible | The canon and reference system: world, characters, rules, continuity, and story engine. |

## Product Principle

Treatment follows the WriterOS surface standard:

> Ask plain-language story questions, translate the answers into professional structure behind the scenes, and render useful authored documents.

The Edit View must not expose industry beat-sheet jargon as writer-facing prompts. Terms like "inciting incident," "midpoint," "all is lost," "dark night of the soul," and named beat-sheet systems stay hidden in mappings, tests, docs, and agent context when useful. Save the Cat is only one possible craft source, not the product standard.

## V1 Design Decisions

These decisions are locked for the current Treatment surface.

| # | Decision | Why |
| --- | --- | --- |
| 1 | Treatment is a first-class tab/surface. | It has a different professional job than Synopsis, Outline, Story Bible, or Script. |
| 2 | Alex is the primary Treatment helper. | Treatment bridges concept, story flow, draft readiness, process, and next-page strategy. |
| 3 | Treatment content lives in `ProjectState.documents.treatment.content`. | Canonical document storage keeps agents and UI away from stale legacy mirrors. |
| 4 | There is no legacy Treatment mirror. | Treatment did not have an older authored surface to preserve. |
| 5 | `ProjectState.meta.format` is the behavioral authority. | Treatment mirrors format in `content.header.format` only for document/export metadata. |
| 6 | Treatment is prose-first. | Structured fields scaffold the prose, but the prose passages are the document. |
| 7 | The main flow uses four plain-language prompts. | Internal field names may be `opening`, `actOne`, `actTwo`, and `actThree`; the UI asks what opens, what pulls them in, how pressure builds, and how it resolves. |
| 8 | "The promise" and "Texture" must not repeat the same feeling question. | Promise is story identity and emotional payoff. Texture is the sensory/cinematic expression of that promise. |
| 9 | Story passages are optional focused prose sections. | They let writers add character, place/world, major-turn, sequence, side-thread, or free passages without bloating the main flow. |
| 10 | Passage template guidance is placeholder text, not authored content. | Inserted passages persist a heading and an empty body. Placeholder prose never exports, never enters agent context, and never counts as writer-authored material. |
| 11 | Empty passages and characters can be removed immediately; authored ones require confirmation. | Deletion is ergonomic while protecting real content. |
| 12 | Treatment Document View is read-only. Passage reorder, QA view, and per-passage auto-routing stay out of the current implemented surface. | Document View gives writers a studio-presentable read without expanding editing behavior or routing complexity. |

## V1 Writer-Facing Shape

Treatment Edit View should use this plain-language structure:

1. **Logline**
   - Prompt: "What is the story in one sentence?"
   - Helper: protagonist, goal, pressure, stakes, and hook.

2. **The promise**
   - "What is the premise?"
   - "What kind of story is this?"
   - "What truth is underneath it?"
   - "What should the audience feel by the end?"

3. **Who carries it**
   - Character name.
   - Role.
   - What they want.
   - What they need.
   - How they change.

4. **The story flow**
   - "How does the story open on screen?"
   - "What pulls them into the story?"
   - "How does the pressure build and turn?"
   - "How does it resolve?"

5. **Story passages**
   - Character passage.
   - Place or world passage.
   - Major turn.
   - Big sequence.
   - Side thread.
   - Free passage.

6. **Texture**
   - "What's the atmosphere from scene to scene?"
   - "What does the world look like?"
   - "What images or motifs keep returning?"
   - "What should it sound like?"
   - "How should the story move?"
   - "What genre promises or rules matter?"
   - "What does this remind people of?"

7. **Open questions**
   - Story decisions still needed.
   - Character decisions still needed.
   - World or mythology decisions still needed.
   - Production decisions still needed.

The UI should say "passage" or "section" for optional prose blocks. Do not introduce "movement" as a visible blank-section label unless product explicitly chooses that language later.

## Data Model

Canonical Treatment content is stored at:

```ts
ProjectState.documents.treatment.content
```

The current V1 content contract:

```ts
TreatmentDocumentContent {
  header: {
    title: string
    writer: string
    format: string
    genre: string
    version: string
    date: string
  }
  logline: string
  concept: {
    premise: string
    tone: string
    theme: string
    emotionalPromise: string
  }
  mainCharacters: Array<{
    id: string
    name: string
    role: string
    externalWant: string
    internalNeed: string
    flawOrWound: string
    secretOrContradiction: string
    arc: string
    relationshipPressure: string
  }>
  prose: {
    opening: string
    actOne: string
    actTwo: string
    actThree: string
    customSections: Array<{
      id: string
      heading: string
      body: string
    }>
  }
  visualAndTonal: {
    overallTone: string
    visualWorld: string
    recurringImagesOrMotifs: string
    musicOrSoundFeeling: string
    pacing: string
    genreRules: string
    compsAndReferences: string
  }
  openQuestions: {
    story: string[]
    character: string[]
    worldOrMythology: string[]
    production: string[]
  }
  aiProductionImplications?: {
    visualSequenceRisks: string
    characterContinuityRisks: string
    locationContinuityRisks: string
    vfxOrGenerationChallenges: string
    referenceAssetsNeeded: string
  }
}
```

### Passage Template Catalog

Passage templates live outside persisted document content:

```ts
TreatmentPassageTemplate {
  id: string
  label: string
  heading: string
  placeholder: string
  specialist: PersonaId
}
```

Insert behavior:

- Persist `heading`.
- Persist `body: ''`.
- Render `placeholder` through the textarea `placeholder` attribute.
- Do not persist placeholder text.
- Free passage uses heading `New passage` and an empty placeholder.

The template `specialist` field is a context hint, not V1 routing. Because custom sections only persist `heading` and `body`, later agent routing may either infer from heading/template catalog or add a persisted `kind` field through a schema migration.

## Migration And Compatibility

Treatment lands with project schema version 5.

Migration rules:

- Pre-document projects receive an empty Treatment document from `createEmptyTreatmentContent()`.
- Pre-v5 projects with an empty Treatment and rich Outline content copy relevant Outline material into Treatment.
- The copy is non-destructive. Outline content remains in `documents.outline.content`.
- Existing Treatment content wins. Migration must not overwrite an authored Treatment.
- Treatment format mirrors are normalized from `ProjectState.meta.format`.
- Save/load must preserve Treatment independently from Synopsis, Outline, and Story Bible.

The old rich Outline material is allowed to seed Treatment because it was treatment-like story-coach prose. It must not become a destructive move.

## Agent Context

Treatment context is canonical authored project memory.

Required behavior:

- `buildProjectContext()` includes authored Treatment content from `documents.treatment.content`.
- Server schemas accept Treatment context.
- OpenSwarm and `/api/wp-chat` can receive Treatment logline, concept, characters, prose, texture, and open questions.
- Alex receives Treatment early in context order.
- Casey receives Treatment character details and prose when character questions need them.
- Oliver may use Treatment to compare prose flow against Outline structure.
- Sam may compress Treatment into Synopsis or logline material.
- Zoe and Maya may use Treatment passages through world and scene lenses.

V1 does not silently route a passage to a specialist based on template selection. The specialist hint is used to keep the catalog intelligible and to prepare for later routing without overbuilding now.

Agents must not mutate Treatment without an explicit user action.

## Document View

Treatment includes a read-only Document View alongside the Edit View.

View mode is stored in:

```ts
documents.treatment.viewPreferences.activeView
```

The shared `DocumentViewToggle` switches between:

- `edit`: guided Treatment Edit View.
- `document`: polished Treatment Document View.

Treatment Document View renders:

- A clean readable treatment.
- No form chrome.
- No placeholder guidance.
- No AI production notes mixed into story prose.
- Professional headings are acceptable in Document View if they make the document clearer.

Current Document View sections:

- Title and metadata when authored.
- Logline.
- Promise.
- Characters.
- Story, including main flow and authored custom passages.
- Texture.
- Last edited date when valid.

Current Document View exclusions:

- Empty fields.
- Empty template passages.
- Placeholder text.
- Open questions.
- `aiProductionImplications`.

Format display must derive from `ProjectState.meta.format`, not from the Treatment header mirror.

## Out Of Scope For V1

- QA checklist.
- Passage reorder.
- Per-passage specialist auto-routing.
- AI production implications UI.
- Export polish beyond existing markdown/context serialization.
- Full screenplay generation from Treatment.

## Acceptance Criteria

V1 is acceptable when:

- Treatment appears as its own surface.
- Treatment writes to `documents.treatment.content`.
- Treatment survives save/load.
- Project format changes preserve authored Treatment content and sync only the header format mirror.
- Rich pre-v5 Outline content seeds empty Treatment without deleting Outline content.
- Treatment placeholders never persist as authored body text.
- Empty passages and characters can be removed without confirmation.
- Authored passages and characters require confirmation before removal.
- Texture fields are all visible.
- The phrase "What should it feel like?" is not duplicated across Promise and Texture.
- Treatment Document View renders clean authored content without edit controls.
- Treatment Document View excludes placeholders, open questions, and AI production notes.
- Treatment Document View uses project format authority for displayed format metadata.
- Alex receives actual authored Treatment context.
- Casey can receive Treatment character details and actual Outline context for character questions.
- Full test, typecheck, and build pass.

## Test Plan

Required coverage:

- `TreatmentDocumentContentSchema` accepts empty and populated content.
- `createEmptyTreatmentContent()` returns a valid object.
- Migration adds Treatment for older projects.
- Migration seeds empty Treatment from rich Outline content for pre-v5 projects.
- Migration does not overwrite authored Treatment.
- `setTreatmentDocument()` writes only Treatment.
- `clearTreatment()` resets only Treatment and preserves format mirror.
- Format switching does not mutate authored Treatment content.
- Treatment UI renders plain-language questions.
- Treatment UI has no duplicate generic feeling prompt.
- Every visual/texture field renders.
- Passage insertion persists heading plus empty body.
- Placeholder text renders as placeholder only.
- Free passage placeholder is empty.
- Typing into a passage is the only way body text enters Treatment content.
- Passage and character delete confirmation behavior is covered.
- Treatment Document View renders authored content.
- Treatment Document View omits form controls, placeholders, open questions, and AI production notes.
- Treatment view mode persists through `documents.treatment.viewPreferences.activeView`.
- `treatmentToMarkdown()` includes authored content and excludes placeholders.
- `/api/wp-chat` sends authored Treatment context to Alex.
- Casey route receives Treatment main-character details plus actual Outline content.
- OpenSwarm schema accepts Treatment context.

## Current Implementation Notes

Current `main` implements the Treatment surface:

- `shared/documents.ts` defines Treatment document schemas.
- `client/src/components/writing/TreatmentTab.tsx` renders Treatment Edit View.
- `client/src/components/writing/treatment/TreatmentDocumentView.tsx` renders Treatment Document View.
- `client/src/components/shared/DocumentViewToggle.tsx` owns the shared Edit/Document segmented control.
- `client/src/lib/useProjectState.ts` persists Treatment view mode through `setTreatmentViewPreferences()`.
- `client/src/lib/treatmentPassages.ts` owns passage template metadata.
- `client/src/lib/documentMigration.ts` normalizes Treatment and seeds empty Treatment from pre-v5 Outline content.
- `server/routes.ts` and `server/ai/openaiService.ts` include Treatment in agent context.
- Tests cover Treatment UI, Treatment Document View, view preference persistence, migration, markdown, and agent context.

## Clear Path Ahead

The next Treatment work should be chosen from these slices, in this order of prudence:

1. Keep Treatment stable while cross-surface agent context audit work lands.
2. Add Treatment QA/readiness only when there is a clear checklist contract.
3. Consider exposing deeper character fields already present in schema: flaw/wound, secret/contradiction, and relationship pressure.
4. Consider passage reorder after the surface has real usage.
5. Add persisted passage `kind` only if later routing needs it.

Known follow-ups:

- Consider exposing the deeper character fields already present in schema: flaw/wound, secret/contradiction, and relationship pressure.
- Consider adding persisted passage `kind` only if later routing needs it.
- Consider passage reorder after the surface has real usage.

## Open Questions

1. Should deeper character fields remain agent/migration fields, or become visible in Treatment V2?
2. Should passage `specialist` stay catalog-only, or become persisted metadata for routing?
3. Should AI production implications surface inside Treatment, or stay in a separate production/readiness annex?
4. Should Treatment eventually support feature/series-specific prose prompts, or should the current shared shape stay format-agnostic?
