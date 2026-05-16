# Structured Writing Surfaces — Phase 1 Schema/Tech Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a forward-looking `ProjectState.documents` shape (Synopsis, Outline, Treatment, Story Bible) backed by deterministic adapters and Markdown emitters, while keeping legacy `synopsis`/`outline`/`storyBible` fields as the live source of truth so existing UI keeps rendering current user data with zero loss.

**Architecture:** Additive dual-shape migration. New document types and `AuthoredDocumentState<T>` wrapper live in `shared/documents.ts`. A `documentMigration.ts` adapter layer derives `documents` from legacy fields on load (and lets future surfaces write back). Schema version bumps `2 → 3`, with `migrateState` backfilling `documents` for any v2 (or older) state on hydrate. No UI components, no `wpRouting`, no consumer rewrites change in this phase — only types, adapters, migration, and Markdown emitters with full test coverage guarding data preservation.

**Tech Stack:** TypeScript, Zod (runtime validation, already in deps), Vitest (`npm run test:run`), `tsc` (`npm run check`), Vite (`npm run build`). All schema/storage code is client-side and serializes through `localStorage` keys `writeros_project_state` and `writeros_project_library`.

---

## Decisions This Phase Locks In

1. **`state.documents` is introduced immediately**, additively, alongside existing `synopsis`/`outline`/`storyBible` top-level fields.
2. **Legacy fields remain the source of truth for this phase.** `documents` is derived on every load via `legacyToDocuments(state)`. Surface redesign phases (2–5) will flip individual surfaces to write `documents` first.
3. **Treatment has no legacy mapping.** Default Treatment is an empty `AuthoredDocumentState` so storage and Markdown emit are uniform across all four surfaces.
4. **Markdown is the canonical export shape.** `documentToMarkdown` emitters are pure functions with stable section ordering. Empty optional sections are omitted, never rendered as empty headings.
5. **Schema version bumps `2 → 3`.** Older state passes through `migrateState` without data loss; new state round-trips through `localStorage`.

---

## File Structure

**Created:**
- `shared/documents.ts` — Document content types, `AuthoredDocumentState<T>` wrapper, `ProjectDocuments`, Zod schemas, helpers (`createEmptyDocuments`).
- `client/src/lib/documentMigration.ts` — Legacy ↔ documents adapters (`legacyToDocuments`, `documentsToLegacy`, per-surface helpers).
- `client/src/lib/documentMarkdown.ts` — Per-surface Markdown emitters (`synopsisToMarkdown`, `outlineToMarkdown`, `treatmentToMarkdown`, `storyBibleToMarkdown`, `documentsToMarkdown`).
- `tests/shared/documents.test.ts` — Type/Zod tests for `shared/documents.ts`.
- `tests/lib/documentMigration.test.ts` — Adapter + round-trip tests.
- `tests/lib/documentMarkdown.test.ts` — Markdown emitter tests.

**Modified:**
- `client/src/lib/projectState.ts` — Add `documents` field to `ProjectState`, bump `CURRENT_SCHEMA_VERSION 2 → 3`, hydrate `documents` inside `migrateState`, include `documents` in `defaultProjectState`.
- `tests/lib/projectState.test.ts` — Add v2-to-v3 migration tests and `documents` round-trip tests.
- `docs/product/structured-writing-surfaces-prd.md` — Record Phase 1 decisions inline in the Phase 1 section.

**Touched only by Task 0 (cleanup):**
- `docs/product/structured-writing-surfaces-prd.md` — commit existing untracked PRD.
- `docs/product/writeros-future-work-prd.md` — commit existing modification.
- `docs/superpowers/plans/2026-05-12-voice-profile-drawer.md` — commit (already-shipped slice plan, archive).

**Untouched in Phase 1 (deliberate):**
- `client/src/lib/wpRouting.ts`, `client/src/components/writing/*Tab.tsx`, `client/src/lib/useProjectState.ts`, `server/**` — All continue reading/writing legacy fields. Documents are derived, not authoritative, until Phase 2.

---

### Task 0: Commit Pending Plan Files

**Files:**
- Modify (commit): `docs/superpowers/plans/2026-05-12-voice-profile-drawer.md`
- Modify (commit): `docs/superpowers/plans/2026-05-15-structured-surfaces-phase-1.md`

Rationale: PRDs are already committed and pushed in `07f900c docs(structured-surfaces): add professional document surface PRD`. Only the two plan files remain untracked. The voice-profile drawer plan is stale (drawer/assessment/synthesis already shipped via `d9e2d44 → 3ef265f`) and this Phase 1 plan needs to land before code commits reference it.

- [ ] **Step 1: Confirm working tree state**

Run: `cd "/Users/ben/Desktop/AI Apps/WriterOS" && git status --short`
Expected output:

```
?? docs/superpowers/plans/2026-05-12-voice-profile-drawer.md
?? docs/superpowers/plans/2026-05-15-structured-surfaces-phase-1.md
```

- [ ] **Step 2: Stage and commit stale voice-profile plan**

```bash
git add docs/superpowers/plans/2026-05-12-voice-profile-drawer.md
git commit -m "docs(plans): archive voice-profile drawer plan"
```

- [ ] **Step 3: Stage and commit this Phase 1 plan**

```bash
git add docs/superpowers/plans/2026-05-15-structured-surfaces-phase-1.md
git commit -m "docs(plans): add Structured Surfaces Phase 1 schema plan"
```

- [ ] **Step 4: Verify clean tree**

Run: `git status --short`
Expected: empty output.

---

### Task 1: Synopsis Document Content Type + Zod Schema

**Files:**
- Create: `shared/documents.ts`
- Create: `tests/shared/documents.test.ts`

The Synopsis surface is the narrowest, so it lands first. The full type covers the PRD's V1 sections (header metadata, logline, paragraph builder, QA checklist, optional AI production implications).

- [ ] **Step 1: Write the failing test**

Create `tests/shared/documents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  SynopsisDocumentContentSchema,
  type SynopsisDocumentContent,
  createEmptySynopsisContent,
} from '../../shared/documents'

describe('SynopsisDocumentContent', () => {
  it('createEmptySynopsisContent returns a Zod-valid empty content object', () => {
    const empty = createEmptySynopsisContent()
    const result = SynopsisDocumentContentSchema.safeParse(empty)
    expect(result.success).toBe(true)
  })

  it('accepts a populated content object', () => {
    const populated: SynopsisDocumentContent = {
      header: {
        title: 'My Film',
        writer: 'Ben',
        format: 'feature',
        genre: 'drama',
        targetRuntime: '100m',
        comps: ['Heat', 'Manchester by the Sea'],
      },
      logline: {
        text: 'A widowed firefighter...',
        protagonist: 'Sara',
        goal: 'find her son',
        obstacle: 'a corrupt city',
        stakes: 'the boy dies',
        hook: 'told in reverse',
      },
      prose: {
        opening: 'A',
        escalation: 'B',
        middle: 'C',
        climax: 'D',
        resolution: 'E',
      },
      qa: {
        protagonistNamedEarly: true,
        goalClear: true,
        obstacleClear: true,
        stakesClear: true,
        endingRevealed: true,
        paragraphsConnectCausally: true,
        toneMatchesProject: true,
        noUnnecessarySubplot: true,
      },
      aiProductionImplications: {
        visuallyImportantSequences: 'climax fire',
        continuitySensitiveMoments: 'sister reveal',
        difficultWorldOrVfx: 'wall of fire',
        likelyReferenceImageNeeds: 'firehouse interior',
      },
    }
    const result = SynopsisDocumentContentSchema.safeParse(populated)
    expect(result.success).toBe(true)
  })

  it('rejects content with wrong types', () => {
    const broken = { header: { title: 123 }, logline: {}, prose: {}, qa: {} }
    const result = SynopsisDocumentContentSchema.safeParse(broken)
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: FAIL — module `../../shared/documents` not found.

- [ ] **Step 3: Write minimal implementation**

Create `shared/documents.ts`:

```ts
import { z } from 'zod'

export const SynopsisHeaderSchema = z.object({
  title: z.string(),
  writer: z.string(),
  format: z.string(),
  genre: z.string(),
  targetRuntime: z.string(),
  comps: z.array(z.string()),
})

export const SynopsisLoglineSchema = z.object({
  text: z.string(),
  protagonist: z.string(),
  goal: z.string(),
  obstacle: z.string(),
  stakes: z.string(),
  hook: z.string(),
})

export const SynopsisProseSchema = z.object({
  opening: z.string(),
  escalation: z.string(),
  middle: z.string(),
  climax: z.string(),
  resolution: z.string(),
})

export const SynopsisQaSchema = z.object({
  protagonistNamedEarly: z.boolean(),
  goalClear: z.boolean(),
  obstacleClear: z.boolean(),
  stakesClear: z.boolean(),
  endingRevealed: z.boolean(),
  paragraphsConnectCausally: z.boolean(),
  toneMatchesProject: z.boolean(),
  noUnnecessarySubplot: z.boolean(),
})

export const SynopsisAiProductionSchema = z.object({
  visuallyImportantSequences: z.string(),
  continuitySensitiveMoments: z.string(),
  difficultWorldOrVfx: z.string(),
  likelyReferenceImageNeeds: z.string(),
})

export const SynopsisDocumentContentSchema = z.object({
  header: SynopsisHeaderSchema,
  logline: SynopsisLoglineSchema,
  prose: SynopsisProseSchema,
  qa: SynopsisQaSchema,
  aiProductionImplications: SynopsisAiProductionSchema.optional(),
})

export type SynopsisDocumentContent = z.infer<typeof SynopsisDocumentContentSchema>

export function createEmptySynopsisContent(): SynopsisDocumentContent {
  return {
    header: { title: '', writer: '', format: '', genre: '', targetRuntime: '', comps: [] },
    logline: { text: '', protagonist: '', goal: '', obstacle: '', stakes: '', hook: '' },
    prose: { opening: '', escalation: '', middle: '', climax: '', resolution: '' },
    qa: {
      protagonistNamedEarly: false,
      goalClear: false,
      obstacleClear: false,
      stakesClear: false,
      endingRevealed: false,
      paragraphsConnectCausally: false,
      toneMatchesProject: false,
      noUnnecessarySubplot: false,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: PASS, 3 passing.

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/documents.ts tests/shared/documents.test.ts
git commit -m "feat(documents): add Synopsis document content type and Zod schema"
```

---

### Task 2: Outline Document Content Type

**Files:**
- Modify: `shared/documents.ts`
- Modify: `tests/shared/documents.test.ts`

PRD requires multi-mode outline (beat sheet / sequence / scene-by-scene / episode / season / custom), shared spine, structure model, rich units (number, act, title, location, characters, what happens, conflict, turn, consequence, why next, linked scene ids, draft notes), optional AI production columns.

- [ ] **Step 1: Append failing tests**

Append to `tests/shared/documents.test.ts`:

```ts
import {
  OutlineDocumentContentSchema,
  type OutlineDocumentContent,
  createEmptyOutlineContent,
} from '../../shared/documents'

describe('OutlineDocumentContent', () => {
  it('createEmptyOutlineContent returns a Zod-valid empty content object', () => {
    const empty = createEmptyOutlineContent()
    const result = OutlineDocumentContentSchema.safeParse(empty)
    expect(result.success).toBe(true)
  })

  it('createEmptyOutlineContent defaults mode to beat_sheet_save_the_cat', () => {
    expect(createEmptyOutlineContent().mode).toBe('beat_sheet_save_the_cat')
  })

  it('accepts a populated outline with units', () => {
    const populated: OutlineDocumentContent = {
      mode: 'scene_by_scene',
      structureModel: 'three_act',
      spine: {
        protagonist: 'Sara',
        externalGoal: 'find her son',
        internalNeed: 'forgive herself',
        centralOpposition: 'the city',
        coreStakes: 'the boy dies',
        theme: 'mercy under pressure',
        ending: 'she lets go',
      },
      units: [
        {
          id: 'u1',
          number: 1,
          actOrSequence: 'Act 1',
          title: 'Opening',
          location: 'Firehouse',
          characters: ['Sara'],
          whatHappens: 'Sara is paged.',
          conflict: 'She is hung over.',
          turn: 'She goes anyway.',
          consequence: 'She finds the note.',
          whyNext: 'The note names the son.',
          linkedSceneIds: ['scene-1'],
          draftNotes: '',
        },
      ],
      aiProductionColumns: {
        enabled: false,
      },
    }
    const result = OutlineDocumentContentSchema.safeParse(populated)
    expect(result.success).toBe(true)
  })

  it('rejects an outline with unknown mode', () => {
    const broken = { ...createEmptyOutlineContent(), mode: 'not_a_real_mode' }
    expect(OutlineDocumentContentSchema.safeParse(broken).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: FAIL — `OutlineDocumentContentSchema` not exported.

- [ ] **Step 3: Append implementation**

Append to `shared/documents.ts`:

```ts
export const OutlineModeSchema = z.enum([
  'beat_sheet_save_the_cat',
  'feature_sequence',
  'scene_by_scene',
  'episode',
  'season_serialized',
  'custom',
])
export type OutlineMode = z.infer<typeof OutlineModeSchema>

export const OutlineStructureModelSchema = z.enum([
  'three_act',
  'five_act',
  'eight_sequence',
  'save_the_cat',
  'episode_acts',
  'custom',
])

export const OutlineSpineSchema = z.object({
  protagonist: z.string(),
  externalGoal: z.string(),
  internalNeed: z.string(),
  centralOpposition: z.string(),
  coreStakes: z.string(),
  theme: z.string(),
  ending: z.string(),
})

export const OutlineUnitSchema = z.object({
  id: z.string(),
  number: z.number(),
  actOrSequence: z.string(),
  title: z.string(),
  location: z.string(),
  characters: z.array(z.string()),
  whatHappens: z.string(),
  conflict: z.string(),
  turn: z.string(),
  consequence: z.string(),
  whyNext: z.string(),
  linkedSceneIds: z.array(z.string()),
  draftNotes: z.string(),
  aiProduction: z
    .object({
      productionDifficulty: z.string(),
      requiredReferences: z.string(),
      continuityRisks: z.string(),
      promptNotes: z.string(),
      assetStatus: z.string(),
    })
    .optional(),
})
export type OutlineUnit = z.infer<typeof OutlineUnitSchema>

export const OutlineDocumentContentSchema = z.object({
  mode: OutlineModeSchema,
  structureModel: OutlineStructureModelSchema,
  spine: OutlineSpineSchema,
  units: z.array(OutlineUnitSchema),
  aiProductionColumns: z.object({ enabled: z.boolean() }),
})
export type OutlineDocumentContent = z.infer<typeof OutlineDocumentContentSchema>

export function createEmptyOutlineContent(): OutlineDocumentContent {
  return {
    mode: 'beat_sheet_save_the_cat',
    structureModel: 'save_the_cat',
    spine: {
      protagonist: '',
      externalGoal: '',
      internalNeed: '',
      centralOpposition: '',
      coreStakes: '',
      theme: '',
      ending: '',
    },
    units: [],
    aiProductionColumns: { enabled: false },
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: PASS, all Outline tests green.

- [ ] **Step 5: Commit**

```bash
git add shared/documents.ts tests/shared/documents.test.ts
git commit -m "feat(documents): add Outline document content type and Zod schema"
```

---

### Task 3: Treatment Document Content Type

**Files:**
- Modify: `shared/documents.ts`
- Modify: `tests/shared/documents.test.ts`

Treatment has no legacy mapping; the type exists so storage and Markdown emit are uniform. Per PRD: header metadata, logline, concept (premise/tone/theme/emotional promise), main characters, treatment prose sections, visual/tonal language, open questions, optional AI production implications.

- [x] **Step 1: Append failing tests**

```ts
import {
  TreatmentDocumentContentSchema,
  type TreatmentDocumentContent,
  createEmptyTreatmentContent,
} from '../../shared/documents'

describe('TreatmentDocumentContent', () => {
  it('createEmptyTreatmentContent returns a Zod-valid empty content object', () => {
    const empty = createEmptyTreatmentContent()
    expect(TreatmentDocumentContentSchema.safeParse(empty).success).toBe(true)
  })

  it('accepts a populated treatment', () => {
    const populated: TreatmentDocumentContent = {
      header: { title: 'X', writer: 'Y', format: 'feature', genre: 'drama', version: '1', date: '2026-05-15' },
      logline: 'A widow returns home.',
      concept: { premise: 'p', tone: 't', theme: 'th', emotionalPromise: 'e' },
      mainCharacters: [
        {
          id: 'c1',
          name: 'Sara',
          role: 'Protagonist',
          externalWant: 'home',
          internalNeed: 'forgiveness',
          flawOrWound: 'guilt',
          secretOrContradiction: 'killed her sister',
          arc: 'guilt -> mercy',
          relationshipPressure: 'distant father',
        },
      ],
      prose: { opening: 'a', actOne: 'b', actTwo: 'c', actThree: 'd', customSections: [] },
      visualAndTonal: {
        overallTone: '',
        visualWorld: '',
        recurringImagesOrMotifs: '',
        musicOrSoundFeeling: '',
        pacing: '',
        genreRules: '',
        compsAndReferences: '',
      },
      openQuestions: { story: [], character: [], worldOrMythology: [], production: [] },
    }
    expect(TreatmentDocumentContentSchema.safeParse(populated).success).toBe(true)
  })
})
```

- [x] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: FAIL — `TreatmentDocumentContentSchema` not exported.

- [x] **Step 3: Append implementation**

```ts
export const TreatmentHeaderSchema = z.object({
  title: z.string(),
  writer: z.string(),
  format: z.string(),
  genre: z.string(),
  version: z.string(),
  date: z.string(),
})

export const TreatmentConceptSchema = z.object({
  premise: z.string(),
  tone: z.string(),
  theme: z.string(),
  emotionalPromise: z.string(),
})

export const TreatmentMainCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  externalWant: z.string(),
  internalNeed: z.string(),
  flawOrWound: z.string(),
  secretOrContradiction: z.string(),
  arc: z.string(),
  relationshipPressure: z.string(),
})

export const TreatmentProseSchema = z.object({
  opening: z.string(),
  actOne: z.string(),
  actTwo: z.string(),
  actThree: z.string(),
  customSections: z.array(z.object({ id: z.string(), heading: z.string(), body: z.string() })),
})

export const TreatmentVisualAndTonalSchema = z.object({
  overallTone: z.string(),
  visualWorld: z.string(),
  recurringImagesOrMotifs: z.string(),
  musicOrSoundFeeling: z.string(),
  pacing: z.string(),
  genreRules: z.string(),
  compsAndReferences: z.string(),
})

export const TreatmentOpenQuestionsSchema = z.object({
  story: z.array(z.string()),
  character: z.array(z.string()),
  worldOrMythology: z.array(z.string()),
  production: z.array(z.string()),
})

export const TreatmentAiProductionSchema = z.object({
  visualSequenceRisks: z.string(),
  characterContinuityRisks: z.string(),
  locationContinuityRisks: z.string(),
  vfxOrGenerationChallenges: z.string(),
  referenceAssetsNeeded: z.string(),
})

export const TreatmentDocumentContentSchema = z.object({
  header: TreatmentHeaderSchema,
  logline: z.string(),
  concept: TreatmentConceptSchema,
  mainCharacters: z.array(TreatmentMainCharacterSchema),
  prose: TreatmentProseSchema,
  visualAndTonal: TreatmentVisualAndTonalSchema,
  openQuestions: TreatmentOpenQuestionsSchema,
  aiProductionImplications: TreatmentAiProductionSchema.optional(),
})
export type TreatmentDocumentContent = z.infer<typeof TreatmentDocumentContentSchema>

export function createEmptyTreatmentContent(): TreatmentDocumentContent {
  return {
    header: { title: '', writer: '', format: '', genre: '', version: '', date: '' },
    logline: '',
    concept: { premise: '', tone: '', theme: '', emotionalPromise: '' },
    mainCharacters: [],
    prose: { opening: '', actOne: '', actTwo: '', actThree: '', customSections: [] },
    visualAndTonal: {
      overallTone: '',
      visualWorld: '',
      recurringImagesOrMotifs: '',
      musicOrSoundFeeling: '',
      pacing: '',
      genreRules: '',
      compsAndReferences: '',
    },
    openQuestions: { story: [], character: [], worldOrMythology: [], production: [] },
  }
}
```

- [x] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add shared/documents.ts tests/shared/documents.test.ts
git commit -m "feat(documents): add Treatment document content type and Zod schema"
```

---

### Task 4: Story Bible Document Content Type

**Files:**
- Modify: `shared/documents.ts`
- Modify: `tests/shared/documents.test.ts`

PRD calls for cover/identity, one-page pitch, tone & style, premise & world, characters with detailed sheets, story engine, episode/sequence/chapter map. Legacy fields cover only a thin slice.

- [x] **Step 1: Append failing tests**

```ts
import {
  StoryBibleDocumentContentSchema,
  type StoryBibleDocumentContent,
  createEmptyStoryBibleContent,
} from '../../shared/documents'

describe('StoryBibleDocumentContent', () => {
  it('createEmptyStoryBibleContent returns a Zod-valid empty content object', () => {
    expect(StoryBibleDocumentContentSchema.safeParse(createEmptyStoryBibleContent()).success).toBe(true)
  })

  it('accepts a populated story bible with one character', () => {
    const populated: StoryBibleDocumentContent = {
      cover: { title: 't', writer: 'w', format: 'feature', genre: 'drama', version: '1', dateUpdated: '2026-05-15', status: 'development' },
      onePagePitch: { logline: '', inANutshell: '', whyThisMatters: '', corePromise: '', centralQuestion: '', whatMakesItDifferent: '' },
      toneAndStyle: {
        toneWords: [],
        comps: [],
        antiComps: [],
        pacingRules: '',
        humorRules: '',
        violenceOrIntensityRules: '',
        dialogueStyle: '',
        visualStyle: '',
        soundOrMusicStyle: '',
        mustNeverFeelLike: '',
      },
      premiseAndWorld: { premise: '', worldRules: '', publicHistory: '', hiddenHistory: '', mythologyReveals: '' },
      characters: [
        {
          id: 'c1',
          name: 'Sara',
          role: 'Protagonist',
          want: '',
          need: '',
          flaw: '',
          secret: '',
          contradiction: '',
          arc: '',
          relationshipPressure: '',
          behavioralAnchors: '',
          speechPatterns: '',
          neverWriteThemAs: '',
          continuityFacts: '',
        },
      ],
      storyEngine: { featurePropulsion: '', seriesEngine: '', pilotEngine: '', seasonArc: '', futureSeasonPotential: '', whatKeepsThePremiseAlive: '' },
      episodeOrSequenceMap: [],
    }
    expect(StoryBibleDocumentContentSchema.safeParse(populated).success).toBe(true)
  })
})
```

- [x] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: FAIL — `StoryBibleDocumentContentSchema` not exported.

- [x] **Step 3: Append implementation**

```ts
export const StoryBibleStatusSchema = z.enum(['pitch', 'development', 'production', 'living_canon'])

export const StoryBibleCoverSchema = z.object({
  title: z.string(),
  writer: z.string(),
  format: z.string(),
  genre: z.string(),
  version: z.string(),
  dateUpdated: z.string(),
  status: StoryBibleStatusSchema,
})

export const StoryBibleOnePagePitchSchema = z.object({
  logline: z.string(),
  inANutshell: z.string(),
  whyThisMatters: z.string(),
  corePromise: z.string(),
  centralQuestion: z.string(),
  whatMakesItDifferent: z.string(),
})

export const StoryBibleToneAndStyleSchema = z.object({
  toneWords: z.array(z.string()),
  comps: z.array(z.string()),
  antiComps: z.array(z.string()),
  pacingRules: z.string(),
  humorRules: z.string(),
  violenceOrIntensityRules: z.string(),
  dialogueStyle: z.string(),
  visualStyle: z.string(),
  soundOrMusicStyle: z.string(),
  mustNeverFeelLike: z.string(),
})

export const StoryBiblePremiseAndWorldSchema = z.object({
  premise: z.string(),
  worldRules: z.string(),
  publicHistory: z.string(),
  hiddenHistory: z.string(),
  mythologyReveals: z.string(),
})

export const StoryBibleCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  want: z.string(),
  need: z.string(),
  flaw: z.string(),
  secret: z.string(),
  contradiction: z.string(),
  arc: z.string(),
  relationshipPressure: z.string(),
  behavioralAnchors: z.string(),
  speechPatterns: z.string(),
  neverWriteThemAs: z.string(),
  continuityFacts: z.string(),
})
export type StoryBibleCharacter = z.infer<typeof StoryBibleCharacterSchema>

export const StoryBibleStoryEngineSchema = z.object({
  featurePropulsion: z.string(),
  seriesEngine: z.string(),
  pilotEngine: z.string(),
  seasonArc: z.string(),
  futureSeasonPotential: z.string(),
  whatKeepsThePremiseAlive: z.string(),
})

export const StoryBibleMapEntrySchema = z.object({
  id: z.string(),
  unit: z.string(),
  title: z.string(),
  storyEvents: z.string(),
})

export const StoryBibleDocumentContentSchema = z.object({
  cover: StoryBibleCoverSchema,
  onePagePitch: StoryBibleOnePagePitchSchema,
  toneAndStyle: StoryBibleToneAndStyleSchema,
  premiseAndWorld: StoryBiblePremiseAndWorldSchema,
  characters: z.array(StoryBibleCharacterSchema),
  storyEngine: StoryBibleStoryEngineSchema,
  episodeOrSequenceMap: z.array(StoryBibleMapEntrySchema),
})
export type StoryBibleDocumentContent = z.infer<typeof StoryBibleDocumentContentSchema>

export function createEmptyStoryBibleContent(): StoryBibleDocumentContent {
  return {
    cover: { title: '', writer: '', format: '', genre: '', version: '', dateUpdated: '', status: 'development' },
    onePagePitch: { logline: '', inANutshell: '', whyThisMatters: '', corePromise: '', centralQuestion: '', whatMakesItDifferent: '' },
    toneAndStyle: {
      toneWords: [], comps: [], antiComps: [],
      pacingRules: '', humorRules: '', violenceOrIntensityRules: '',
      dialogueStyle: '', visualStyle: '', soundOrMusicStyle: '', mustNeverFeelLike: '',
    },
    premiseAndWorld: { premise: '', worldRules: '', publicHistory: '', hiddenHistory: '', mythologyReveals: '' },
    characters: [],
    storyEngine: { featurePropulsion: '', seriesEngine: '', pilotEngine: '', seasonArc: '', futureSeasonPotential: '', whatKeepsThePremiseAlive: '' },
    episodeOrSequenceMap: [],
  }
}
```

- [x] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add shared/documents.ts tests/shared/documents.test.ts
git commit -m "feat(documents): add Story Bible document content type and Zod schema"
```

---

### Task 5: AuthoredDocumentState Wrapper And ProjectDocuments Aggregate

**Files:**
- Modify: `shared/documents.ts`
- Modify: `tests/shared/documents.test.ts`

Wrap each content type in `AuthoredDocumentState<T>` providing `version`, `mode`, `updatedAt`, `content`, `viewPreferences`, `qa.warnings`. Aggregate into `ProjectDocuments` for ProjectState.

- [x] **Step 1: Append failing tests**

```ts
import {
  AuthoredDocumentStateSchema,
  ProjectDocumentsSchema,
  createEmptyDocuments,
  type ProjectDocuments,
} from '../../shared/documents'

describe('AuthoredDocumentState wrapper', () => {
  it('createEmptyDocuments returns a Zod-valid ProjectDocuments', () => {
    const empty = createEmptyDocuments()
    expect(ProjectDocumentsSchema.safeParse(empty).success).toBe(true)
  })

  it('each surface wrapper has version 1 and an updatedAt ISO string', () => {
    const empty = createEmptyDocuments()
    for (const surface of ['synopsis', 'outline', 'treatment', 'storyBible'] as const) {
      expect(empty[surface].version).toBe(1)
      expect(typeof empty[surface].updatedAt).toBe('string')
      expect(empty[surface].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('viewPreferences.activeView accepts edit or document', () => {
    const empty = createEmptyDocuments()
    const docs: ProjectDocuments = {
      ...empty,
      synopsis: { ...empty.synopsis, viewPreferences: { activeView: 'document' } },
    }
    expect(ProjectDocumentsSchema.safeParse(docs).success).toBe(true)
  })

  it('AuthoredDocumentState rejects negative version', () => {
    const empty = createEmptyDocuments()
    const bad = { ...empty.synopsis, version: -1 }
    expect(AuthoredDocumentStateSchema(SynopsisDocumentContentSchema).safeParse(bad).success).toBe(false)
  })
})
```

- [x] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: FAIL — `AuthoredDocumentStateSchema`, `ProjectDocumentsSchema`, `createEmptyDocuments` not exported.

- [x] **Step 3: Append implementation**

```ts
export const DocumentWarningSchema = z.object({
  id: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warn', 'error']),
})

export const DocumentViewPreferencesSchema = z.object({
  activeView: z.enum(['edit', 'document']).optional(),
  collapsedSections: z.array(z.string()).optional(),
  visibleDepth: z.enum(['core', 'advanced', 'continuity', 'ai_production']).optional(),
})

export function AuthoredDocumentStateSchema<TContent extends z.ZodTypeAny>(content: TContent) {
  return z.object({
    version: z.number().int().nonnegative(),
    mode: z.string(),
    updatedAt: z.string(),
    content,
    viewPreferences: DocumentViewPreferencesSchema.optional(),
    qa: z
      .object({
        lastCheckedAt: z.string().optional(),
        warnings: z.array(DocumentWarningSchema),
      })
      .optional(),
  })
}

export interface AuthoredDocumentState<TContent> {
  version: number
  mode: string
  updatedAt: string
  content: TContent
  viewPreferences?: z.infer<typeof DocumentViewPreferencesSchema>
  qa?: { lastCheckedAt?: string; warnings: z.infer<typeof DocumentWarningSchema>[] }
}

export const ProjectDocumentsSchema = z.object({
  synopsis: AuthoredDocumentStateSchema(SynopsisDocumentContentSchema),
  outline: AuthoredDocumentStateSchema(OutlineDocumentContentSchema),
  treatment: AuthoredDocumentStateSchema(TreatmentDocumentContentSchema),
  storyBible: AuthoredDocumentStateSchema(StoryBibleDocumentContentSchema),
})

export interface ProjectDocuments {
  synopsis: AuthoredDocumentState<SynopsisDocumentContent>
  outline: AuthoredDocumentState<OutlineDocumentContent>
  treatment: AuthoredDocumentState<TreatmentDocumentContent>
  storyBible: AuthoredDocumentState<StoryBibleDocumentContent>
}

export const DOCUMENT_SCHEMA_VERSION = 1

export function createEmptyDocuments(now: () => string = () => new Date().toISOString()): ProjectDocuments {
  const ts = now()
  return {
    synopsis:   { version: DOCUMENT_SCHEMA_VERSION, mode: 'prose',                 updatedAt: ts, content: createEmptySynopsisContent() },
    outline:    { version: DOCUMENT_SCHEMA_VERSION, mode: 'beat_sheet_save_the_cat', updatedAt: ts, content: createEmptyOutlineContent() },
    treatment:  { version: DOCUMENT_SCHEMA_VERSION, mode: 'three_act_prose',       updatedAt: ts, content: createEmptyTreatmentContent() },
    storyBible: { version: DOCUMENT_SCHEMA_VERSION, mode: 'development',           updatedAt: ts, content: createEmptyStoryBibleContent() },
  }
}
```

- [x] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- tests/shared/documents.test.ts`
Expected: PASS — all wrapper tests green.

- [x] **Step 5: Run type check**

Run: `npm run check`
Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add shared/documents.ts tests/shared/documents.test.ts
git commit -m "feat(documents): add AuthoredDocumentState wrapper and ProjectDocuments aggregate"
```

---

### Task 6: Legacy → Documents Migration Adapter

**Files:**
- Create: `client/src/lib/documentMigration.ts`
- Create: `tests/lib/documentMigration.test.ts`

Map current `synopsis`/`outline`/`storyBible` into the new document shapes. Treatment is not derivable — return empty. Each adapter is pure and deterministic; pass `now()` as a parameter so tests are reproducible.

- [x] **Step 1: Write the failing test**

Create `tests/lib/documentMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { legacyToDocuments } from '../../client/src/lib/documentMigration'

const FIXED_TS = '2026-05-15T00:00:00.000Z'
const now = () => FIXED_TS

describe('legacyToDocuments — synopsis', () => {
  it('maps legacy logline to documents.synopsis.content.logline.text', () => {
    const legacy = defaultProjectState()
    legacy.synopsis.logline = 'A widow returns home.'
    const docs = legacyToDocuments(legacy, now)
    expect(docs.synopsis.content.logline.text).toBe('A widow returns home.')
  })

  it('maps legacy sections to prose paragraphs in fixed order', () => {
    const legacy = defaultProjectState()
    legacy.synopsis.sections.setup = 'OPENING'
    legacy.synopsis.sections.act1Break = 'ESCALATION'
    legacy.synopsis.sections.midpoint = 'MIDDLE'
    legacy.synopsis.sections.act2Break = 'CLIMAX'
    legacy.synopsis.sections.resolution = 'RESOLUTION'
    const docs = legacyToDocuments(legacy, now)
    expect(docs.synopsis.content.prose).toEqual({
      opening: 'OPENING',
      escalation: 'ESCALATION',
      middle: 'MIDDLE',
      climax: 'CLIMAX',
      resolution: 'RESOLUTION',
    })
  })

  it('stamps updatedAt from the now() argument', () => {
    const legacy = defaultProjectState()
    expect(legacyToDocuments(legacy, now).synopsis.updatedAt).toBe(FIXED_TS)
  })
})

describe('legacyToDocuments — outline', () => {
  it('preserves beat type as outline mode', () => {
    const legacy = defaultProjectState()
    const docs = legacyToDocuments(legacy, now)
    expect(docs.outline.mode).toBe('beat_sheet_save_the_cat')
    expect(docs.outline.content.mode).toBe('beat_sheet_save_the_cat')
  })

  it('maps every legacy beat into an outline unit by id', () => {
    const legacy = defaultProjectState()
    legacy.outline.beats[0].notes = 'Hook in the cold open.'
    legacy.outline.beats[0].linkedSceneIds = ['scene-1']
    const docs = legacyToDocuments(legacy, now)
    const first = docs.outline.content.units[0]
    expect(first.id).toBe(legacy.outline.beats[0].id)
    expect(first.title).toBe(legacy.outline.beats[0].name)
    expect(first.whatHappens).toBe(legacy.outline.beats[0].description)
    expect(first.draftNotes).toBe('Hook in the cold open.')
    expect(first.linkedSceneIds).toEqual(['scene-1'])
    expect(first.number).toBe(1)
  })
})

describe('legacyToDocuments — storyBible', () => {
  it('maps legacy world fields to premiseAndWorld and toneAndStyle', () => {
    const legacy = defaultProjectState()
    legacy.storyBible.world.setting = 'A sealed city'
    legacy.storyBible.world.toneAnchors = 'Chinatown meets Nope'
    legacy.storyBible.world.voiceNotes = 'Spare and cold'
    legacy.storyBible.themes = 'Mercy under pressure'
    legacy.storyBible.rules = 'No one leaves after sunset'
    const docs = legacyToDocuments(legacy, now)
    expect(docs.storyBible.content.premiseAndWorld.premise).toBe('A sealed city')
    expect(docs.storyBible.content.premiseAndWorld.worldRules).toBe('No one leaves after sunset')
    expect(docs.storyBible.content.toneAndStyle.comps).toEqual(['Chinatown meets Nope'])
    expect(docs.storyBible.content.toneAndStyle.dialogueStyle).toBe('Spare and cold')
    expect(docs.storyBible.content.onePagePitch.whyThisMatters).toBe('Mercy under pressure')
  })

  it('maps each legacy character into a story bible character', () => {
    const legacy = defaultProjectState()
    legacy.storyBible.characters.push({
      id: 'c1', name: 'Sara', role: 'Protagonist',
      wound: 'killed her sister', want: 'home', need: 'forgive herself', arc: 'guilt -> mercy',
    })
    const docs = legacyToDocuments(legacy, now)
    const c = docs.storyBible.content.characters[0]
    expect(c.id).toBe('c1')
    expect(c.name).toBe('Sara')
    expect(c.role).toBe('Protagonist')
    expect(c.want).toBe('home')
    expect(c.need).toBe('forgive herself')
    expect(c.arc).toBe('guilt -> mercy')
    expect(c.flaw).toBe('killed her sister')
  })
})

describe('legacyToDocuments — treatment', () => {
  it('returns an empty treatment document (no legacy source)', () => {
    const legacy = defaultProjectState()
    const docs = legacyToDocuments(legacy, now)
    expect(docs.treatment.content.logline).toBe('')
    expect(docs.treatment.content.prose.opening).toBe('')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/lib/documentMigration.test.ts`
Expected: FAIL — `documentMigration` module not found.

- [x] **Step 3: Write implementation**

Create `client/src/lib/documentMigration.ts`:

```ts
import type { ProjectState } from './projectState'
import {
  createEmptyDocuments,
  createEmptyOutlineContent,
  createEmptyStoryBibleContent,
  createEmptySynopsisContent,
  createEmptyTreatmentContent,
  DOCUMENT_SCHEMA_VERSION,
  type ProjectDocuments,
  type SynopsisDocumentContent,
  type OutlineDocumentContent,
  type TreatmentDocumentContent,
  type StoryBibleDocumentContent,
} from '@shared/documents'

type NowFn = () => string

function synopsisLegacyToContent(legacy: ProjectState['synopsis']): SynopsisDocumentContent {
  const content = createEmptySynopsisContent()
  content.logline.text = legacy.logline
  content.prose = {
    opening: legacy.sections.setup,
    escalation: legacy.sections.act1Break,
    middle: legacy.sections.midpoint,
    climax: legacy.sections.act2Break,
    resolution: legacy.sections.resolution,
  }
  return content
}

function outlineLegacyToContent(legacy: ProjectState['outline']): OutlineDocumentContent {
  const content = createEmptyOutlineContent()
  content.mode = 'beat_sheet_save_the_cat'
  content.units = legacy.beats.map((beat, index) => ({
    id: beat.id,
    number: index + 1,
    actOrSequence: '',
    title: beat.name,
    location: '',
    characters: [],
    whatHappens: beat.description,
    conflict: '',
    turn: '',
    consequence: '',
    whyNext: '',
    linkedSceneIds: [...beat.linkedSceneIds],
    draftNotes: beat.notes,
  }))
  return content
}

function storyBibleLegacyToContent(legacy: ProjectState['storyBible']): StoryBibleDocumentContent {
  const content = createEmptyStoryBibleContent()
  content.premiseAndWorld.premise = legacy.world.setting
  content.premiseAndWorld.worldRules = legacy.rules
  content.toneAndStyle.comps = legacy.world.toneAnchors ? [legacy.world.toneAnchors] : []
  content.toneAndStyle.dialogueStyle = legacy.world.voiceNotes
  content.onePagePitch.whyThisMatters = legacy.themes
  content.characters = legacy.characters.map(char => ({
    id: char.id,
    name: char.name,
    role: char.role,
    want: char.want,
    need: char.need,
    flaw: char.wound,
    secret: '',
    contradiction: '',
    arc: char.arc,
    relationshipPressure: '',
    behavioralAnchors: '',
    speechPatterns: '',
    neverWriteThemAs: '',
    continuityFacts: '',
  }))
  return content
}

function treatmentLegacyToContent(): TreatmentDocumentContent {
  return createEmptyTreatmentContent()
}

export function legacyToDocuments(state: ProjectState, now: NowFn = () => new Date().toISOString()): ProjectDocuments {
  const ts = now()
  return {
    synopsis:   { version: DOCUMENT_SCHEMA_VERSION, mode: 'prose',                 updatedAt: ts, content: synopsisLegacyToContent(state.synopsis) },
    outline:    { version: DOCUMENT_SCHEMA_VERSION, mode: 'beat_sheet_save_the_cat', updatedAt: ts, content: outlineLegacyToContent(state.outline) },
    treatment:  { version: DOCUMENT_SCHEMA_VERSION, mode: 'three_act_prose',       updatedAt: ts, content: treatmentLegacyToContent() },
    storyBible: { version: DOCUMENT_SCHEMA_VERSION, mode: 'development',           updatedAt: ts, content: storyBibleLegacyToContent(state.storyBible) },
  }
}

export function createDocumentsForNewProject(now: NowFn = () => new Date().toISOString()): ProjectDocuments {
  return createEmptyDocuments(now)
}
```

Note: Add `@shared/*` path alias if not present. Verify via:

```bash
grep -n '@shared' "/Users/ben/Desktop/AI Apps/WriterOS/tsconfig.json" "/Users/ben/Desktop/AI Apps/WriterOS/vite.config.ts" "/Users/ben/Desktop/AI Apps/WriterOS/vitest.config.ts" 2>/dev/null
```

If `@shared` alias is missing for any of `tsconfig.json` / `vite.config.ts` / `vitest.config.ts`, replace the import in `documentMigration.ts` with the relative path:

```ts
} from '../../../shared/documents'
```

(Confirmed working pattern based on existing `import type { CapabilityReceipt } from '@shared/personaCapability'` in `projectState.ts` — alias is set; relative fallback is only if alias is missing.)

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/lib/documentMigration.test.ts`
Expected: PASS, all migration tests green.

- [x] **Step 5: Run type check**

Run: `npm run check`
Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add client/src/lib/documentMigration.ts tests/lib/documentMigration.test.ts
git commit -m "feat(documents): add legacyToDocuments adapter for Synopsis, Outline, Story Bible, Treatment"
```

---

### Task 7: Round-Trip Safety — Documents → Legacy For Shared Fields

**Files:**
- Modify: `client/src/lib/documentMigration.ts`
- Modify: `tests/lib/documentMigration.test.ts`

The reverse path matters for the future surface phases. For Phase 1, define it for the subset of fields that exist on both sides and prove round-trip preserves data. Anything that exists only in the new document model (header.targetRuntime, treatment, story bible extended sections) is intentionally lost when writing back to legacy.

- [ ] **Step 1: Append failing tests**

```ts
import { documentsToLegacy } from '../../client/src/lib/documentMigration'

describe('documentsToLegacy round-trip', () => {
  it('synopsis: legacy -> documents -> legacy preserves logline and all five sections', () => {
    const original = defaultProjectState()
    original.synopsis.logline = 'A widow returns home.'
    original.synopsis.sections.setup = 'OPENING'
    original.synopsis.sections.act1Break = 'ESCALATION'
    original.synopsis.sections.midpoint = 'MIDDLE'
    original.synopsis.sections.act2Break = 'CLIMAX'
    original.synopsis.sections.resolution = 'RESOLUTION'

    const docs = legacyToDocuments(original, now)
    const reverted = documentsToLegacy(docs)
    expect(reverted.synopsis).toEqual(original.synopsis)
  })

  it('outline: legacy -> documents -> legacy preserves beat ids, notes, and links', () => {
    const original = defaultProjectState()
    original.outline.beats[0].notes = 'Hook the audience.'
    original.outline.beats[0].linkedSceneIds = ['scene-1']

    const docs = legacyToDocuments(original, now)
    const reverted = documentsToLegacy(docs)
    expect(reverted.outline.beatType).toBe(original.outline.beatType)
    expect(reverted.outline.beats.map(b => b.id)).toEqual(original.outline.beats.map(b => b.id))
    expect(reverted.outline.beats[0].notes).toBe('Hook the audience.')
    expect(reverted.outline.beats[0].linkedSceneIds).toEqual(['scene-1'])
  })

  it('storyBible: legacy -> documents -> legacy preserves characters, world, themes, rules', () => {
    const original = defaultProjectState()
    original.storyBible.world.setting = 'A sealed city'
    original.storyBible.world.toneAnchors = 'Chinatown meets Nope'
    original.storyBible.world.voiceNotes = 'Spare and cold'
    original.storyBible.themes = 'Mercy under pressure'
    original.storyBible.rules = 'No one leaves after sunset'
    original.storyBible.characters.push({
      id: 'c1', name: 'Sara', role: 'Protagonist',
      wound: 'guilt', want: 'home', need: 'forgive', arc: 'guilt -> mercy',
    })

    const docs = legacyToDocuments(original, now)
    const reverted = documentsToLegacy(docs)
    expect(reverted.storyBible).toEqual(original.storyBible)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- tests/lib/documentMigration.test.ts`
Expected: FAIL — `documentsToLegacy` not exported.

- [ ] **Step 3: Append implementation**

Append to `client/src/lib/documentMigration.ts`:

```ts
import type { Beat, Character } from './projectState'

export interface LegacyProjectSlice {
  synopsis: ProjectState['synopsis']
  outline: ProjectState['outline']
  storyBible: ProjectState['storyBible']
}

export function documentsToLegacy(docs: ProjectDocuments): LegacyProjectSlice {
  const synopsis: ProjectState['synopsis'] = {
    logline: docs.synopsis.content.logline.text,
    sections: {
      setup: docs.synopsis.content.prose.opening,
      act1Break: docs.synopsis.content.prose.escalation,
      midpoint: docs.synopsis.content.prose.middle,
      act2Break: docs.synopsis.content.prose.climax,
      resolution: docs.synopsis.content.prose.resolution,
    },
  }

  const beats: Beat[] = docs.outline.content.units.map(unit => ({
    id: unit.id,
    name: unit.title,
    description: unit.whatHappens,
    notes: unit.draftNotes,
    linkedSceneIds: [...unit.linkedSceneIds],
  }))
  const outline: ProjectState['outline'] = {
    beatType: 'save-the-cat',
    beats,
  }

  const characters: Character[] = docs.storyBible.content.characters.map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    wound: c.flaw,
    want: c.want,
    need: c.need,
    arc: c.arc,
  }))
  const storyBible: ProjectState['storyBible'] = {
    characters,
    world: {
      setting: docs.storyBible.content.premiseAndWorld.premise,
      toneAnchors: docs.storyBible.content.toneAndStyle.comps[0] ?? '',
      voiceNotes: docs.storyBible.content.toneAndStyle.dialogueStyle,
    },
    themes: docs.storyBible.content.onePagePitch.whyThisMatters,
    rules: docs.storyBible.content.premiseAndWorld.worldRules,
  }

  return { synopsis, outline, storyBible }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- tests/lib/documentMigration.test.ts`
Expected: PASS — round-trip tests green.

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/documentMigration.ts tests/lib/documentMigration.test.ts
git commit -m "feat(documents): add documentsToLegacy round-trip adapter"
```

---

### Task 8: Markdown Emitters Per Surface

**Files:**
- Create: `client/src/lib/documentMarkdown.ts`
- Create: `tests/lib/documentMarkdown.test.ts`

Pure functions. Deterministic. Stable section ordering. Empty optional sections skip entirely (no empty headings).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/documentMarkdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  createEmptyDocuments,
  createEmptySynopsisContent,
  createEmptyOutlineContent,
  createEmptyStoryBibleContent,
  createEmptyTreatmentContent,
} from '../../shared/documents'
import {
  synopsisToMarkdown,
  outlineToMarkdown,
  storyBibleToMarkdown,
  treatmentToMarkdown,
  documentsToMarkdown,
} from '../../client/src/lib/documentMarkdown'

const FIXED_TS = '2026-05-15T00:00:00.000Z'
const now = () => FIXED_TS

describe('synopsisToMarkdown', () => {
  it('emits a header followed by logline and prose when populated', () => {
    const content = createEmptySynopsisContent()
    content.header.title = 'My Film'
    content.logline.text = 'A widow returns home.'
    content.prose.opening = 'Sara is paged.'
    const md = synopsisToMarkdown({ version: 1, mode: 'prose', updatedAt: FIXED_TS, content })
    expect(md).toContain('# Synopsis — My Film')
    expect(md).toContain('## Logline')
    expect(md).toContain('A widow returns home.')
    expect(md).toContain('## Synopsis')
    expect(md).toContain('Sara is paged.')
  })

  it('skips empty optional sections', () => {
    const content = createEmptySynopsisContent()
    const md = synopsisToMarkdown({ version: 1, mode: 'prose', updatedAt: FIXED_TS, content })
    expect(md).not.toContain('## Logline')
    expect(md).not.toContain('## Synopsis')
    expect(md).not.toContain('## AI Production Implications')
  })

  it('output is deterministic across two calls with the same input', () => {
    const content = createEmptySynopsisContent()
    content.logline.text = 'a'
    const doc = { version: 1 as const, mode: 'prose', updatedAt: FIXED_TS, content }
    expect(synopsisToMarkdown(doc)).toBe(synopsisToMarkdown(doc))
  })
})

describe('outlineToMarkdown', () => {
  it('emits a unit per outline unit', () => {
    const content = createEmptyOutlineContent()
    content.units = [
      { id: 'u1', number: 1, actOrSequence: 'Act 1', title: 'Opening', location: '', characters: [], whatHappens: 'A', conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' },
      { id: 'u2', number: 2, actOrSequence: 'Act 1', title: 'Catalyst', location: '', characters: [], whatHappens: 'B', conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' },
    ]
    const md = outlineToMarkdown({ version: 1, mode: 'beat_sheet_save_the_cat', updatedAt: FIXED_TS, content })
    expect(md).toMatch(/1\. Opening[\s\S]+2\. Catalyst/)
  })

  it('skips unit subfields that are empty', () => {
    const content = createEmptyOutlineContent()
    content.units = [
      { id: 'u1', number: 1, actOrSequence: '', title: 'Opening', location: '', characters: [], whatHappens: '', conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' },
    ]
    const md = outlineToMarkdown({ version: 1, mode: 'beat_sheet_save_the_cat', updatedAt: FIXED_TS, content })
    expect(md).not.toContain('Conflict:')
    expect(md).not.toContain('Turn:')
  })
})

describe('storyBibleToMarkdown', () => {
  it('emits cover and a character section when populated', () => {
    const content = createEmptyStoryBibleContent()
    content.cover.title = 'My Film'
    content.characters.push({
      id: 'c1', name: 'Sara', role: 'Protagonist',
      want: 'home', need: 'forgive', flaw: 'guilt', secret: '', contradiction: '',
      arc: 'guilt -> mercy', relationshipPressure: '', behavioralAnchors: '',
      speechPatterns: '', neverWriteThemAs: '', continuityFacts: '',
    })
    const md = storyBibleToMarkdown({ version: 1, mode: 'development', updatedAt: FIXED_TS, content })
    expect(md).toContain('# Story Bible — My Film')
    expect(md).toContain('### Sara')
  })
})

describe('treatmentToMarkdown', () => {
  it('returns a header even when empty (so emit is uniform)', () => {
    const content = createEmptyTreatmentContent()
    const md = treatmentToMarkdown({ version: 1, mode: 'three_act_prose', updatedAt: FIXED_TS, content })
    expect(md).toContain('# Treatment')
  })
})

describe('documentsToMarkdown', () => {
  it('returns one Markdown string per surface in stable order', () => {
    const docs = createEmptyDocuments(now)
    const bundle = documentsToMarkdown(docs)
    expect(Object.keys(bundle)).toEqual(['synopsis', 'outline', 'treatment', 'storyBible'])
    for (const md of Object.values(bundle)) {
      expect(typeof md).toBe('string')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/lib/documentMarkdown.test.ts`
Expected: FAIL — `documentMarkdown` module not found.

- [ ] **Step 3: Write implementation**

Create `client/src/lib/documentMarkdown.ts`:

```ts
import type {
  AuthoredDocumentState,
  ProjectDocuments,
  SynopsisDocumentContent,
  OutlineDocumentContent,
  TreatmentDocumentContent,
  StoryBibleDocumentContent,
} from '@shared/documents'

function lines(...xs: (string | undefined | false)[]): string {
  return xs.filter(Boolean).join('\n')
}

function section(heading: string, body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed) return undefined
  return `${heading}\n\n${trimmed}\n`
}

export function synopsisToMarkdown(doc: AuthoredDocumentState<SynopsisDocumentContent>): string {
  const c = doc.content
  const titleSuffix = c.header.title ? ` — ${c.header.title}` : ''
  return lines(
    `# Synopsis${titleSuffix}`,
    section('## Logline', c.logline.text),
    section('## Synopsis', [c.prose.opening, c.prose.escalation, c.prose.middle, c.prose.climax, c.prose.resolution].filter(Boolean).join('\n\n')),
  ).trim() + '\n'
}

export function outlineToMarkdown(doc: AuthoredDocumentState<OutlineDocumentContent>): string {
  const c = doc.content
  const unitBlocks = c.units.map(unit => {
    const lineParts = [`### ${unit.number}. ${unit.title || '(untitled)'}`]
    if (unit.actOrSequence) lineParts.push(`*${unit.actOrSequence}*`)
    if (unit.whatHappens) lineParts.push(unit.whatHappens)
    if (unit.conflict) lineParts.push(`Conflict: ${unit.conflict}`)
    if (unit.turn) lineParts.push(`Turn: ${unit.turn}`)
    if (unit.consequence) lineParts.push(`Consequence: ${unit.consequence}`)
    if (unit.whyNext) lineParts.push(`Why next: ${unit.whyNext}`)
    if (unit.draftNotes) lineParts.push(`Notes: ${unit.draftNotes}`)
    return lineParts.join('\n\n')
  })
  return lines(
    `# Outline`,
    unitBlocks.length ? unitBlocks.join('\n\n') : undefined,
  ).trim() + '\n'
}

export function treatmentToMarkdown(doc: AuthoredDocumentState<TreatmentDocumentContent>): string {
  const c = doc.content
  const titleSuffix = c.header.title ? ` — ${c.header.title}` : ''
  return lines(
    `# Treatment${titleSuffix}`,
    section('## Logline', c.logline),
    section('## Premise', c.concept.premise),
    section('## Opening', c.prose.opening),
    section('## Act One', c.prose.actOne),
    section('## Act Two', c.prose.actTwo),
    section('## Act Three', c.prose.actThree),
  ).trim() + '\n'
}

export function storyBibleToMarkdown(doc: AuthoredDocumentState<StoryBibleDocumentContent>): string {
  const c = doc.content
  const titleSuffix = c.cover.title ? ` — ${c.cover.title}` : ''
  const characterBlocks = c.characters.map(ch => {
    const parts = [`### ${ch.name || '(unnamed)'}`]
    if (ch.role) parts.push(`*${ch.role}*`)
    if (ch.want) parts.push(`Want: ${ch.want}`)
    if (ch.need) parts.push(`Need: ${ch.need}`)
    if (ch.flaw) parts.push(`Flaw: ${ch.flaw}`)
    if (ch.arc) parts.push(`Arc: ${ch.arc}`)
    return parts.join('\n\n')
  })
  return lines(
    `# Story Bible${titleSuffix}`,
    section('## Premise', c.premiseAndWorld.premise),
    section('## World Rules', c.premiseAndWorld.worldRules),
    characterBlocks.length ? `## Characters\n\n${characterBlocks.join('\n\n')}\n` : undefined,
  ).trim() + '\n'
}

export function documentsToMarkdown(docs: ProjectDocuments): Record<keyof ProjectDocuments, string> {
  return {
    synopsis: synopsisToMarkdown(docs.synopsis),
    outline: outlineToMarkdown(docs.outline),
    treatment: treatmentToMarkdown(docs.treatment),
    storyBible: storyBibleToMarkdown(docs.storyBible),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/lib/documentMarkdown.test.ts`
Expected: PASS — all Markdown tests green.

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/documentMarkdown.ts tests/lib/documentMarkdown.test.ts
git commit -m "feat(documents): add per-surface Markdown emitters"
```

---

### Task 9: Wire `documents` Into ProjectState And Migration

**Files:**
- Modify: `client/src/lib/projectState.ts`
- Modify: `tests/lib/projectState.test.ts`

Add `documents` to `ProjectState`, bump `CURRENT_SCHEMA_VERSION 2 → 3`, hydrate `documents` from legacy inside `migrateState` whenever it is missing or schema is below 3, include `documents` in `defaultProjectState`.

**Important: this is the single most data-sensitive task.** The order is: write the failing test that proves no user data is lost when an existing v2 state is loaded, then implement the migration.

- [ ] **Step 1: Append failing test for v2-to-v3 migration**

Append to `tests/lib/projectState.test.ts`:

```ts
import { legacyToDocuments } from '../../client/src/lib/documentMigration'

describe('migrateState — v2 to v3 hydrates documents', () => {
  it('populates documents from legacy synopsis/outline/storyBible when documents are absent', () => {
    const v2 = defaultProjectState() as any
    v2.schemaVersion = 2
    v2.synopsis.logline = 'A widow returns home.'
    v2.synopsis.sections.setup = 'OPENING'
    delete v2.documents

    const migrated = migrateState(v2)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.documents.synopsis.content.logline.text).toBe('A widow returns home.')
    expect(migrated.documents.synopsis.content.prose.opening).toBe('OPENING')
    // legacy fields remain intact
    expect(migrated.synopsis.logline).toBe('A widow returns home.')
    expect(migrated.synopsis.sections.setup).toBe('OPENING')
  })

  it('does not overwrite existing documents on already-v3 state', () => {
    const v3 = defaultProjectState() as any
    v3.documents.synopsis.content.logline.text = 'EXISTING'
    v3.synopsis.logline = 'LEGACY'

    const migrated = migrateState(v3)

    expect(migrated.documents.synopsis.content.logline.text).toBe('EXISTING')
    expect(migrated.synopsis.logline).toBe('LEGACY')
  })

  it('round-trips v3 state through localStorage', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'persisted logline'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.logline.text).toBe('persisted logline')
  })

  it('defaultProjectState includes documents matching legacyToDocuments(defaultProjectState())', () => {
    const state = defaultProjectState()
    // Both should produce equivalent content even though timestamps may differ
    const fromLegacy = legacyToDocuments(state, () => state.documents.synopsis.updatedAt)
    expect(state.documents.synopsis.content).toEqual(fromLegacy.synopsis.content)
    expect(state.documents.outline.content).toEqual(fromLegacy.outline.content)
    expect(state.documents.storyBible.content).toEqual(fromLegacy.storyBible.content)
    expect(state.documents.treatment.content).toEqual(fromLegacy.treatment.content)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:run -- tests/lib/projectState.test.ts`
Expected: FAIL — `documents` is not a property of `ProjectState`, `CURRENT_SCHEMA_VERSION` is 2 not 3, etc.

- [ ] **Step 3: Edit `client/src/lib/projectState.ts` — bump schema version**

Change:

```ts
export const CURRENT_SCHEMA_VERSION = 2
```

to:

```ts
export const CURRENT_SCHEMA_VERSION = 3
```

- [ ] **Step 4: Edit `client/src/lib/projectState.ts` — add imports and documents to interface**

Add near the existing imports at the top:

```ts
import type { ProjectDocuments } from '@shared/documents'
import { legacyToDocuments } from './documentMigration'
```

Add `documents: ProjectDocuments` to the `ProjectState` interface. Final shape:

```ts
export interface ProjectState {
  schemaVersion: number
  meta: { title: string; genre: string; format: string; wordCount: number; pageCount: number }
  script: { rawHtml: string; scenes: ScriptScene[]; revisionHistory: unknown[] }
  outline: { beatType: string; beats: Beat[] }
  synopsis: { logline: string; sections: { setup: string; act1Break: string; midpoint: string; act2Break: string; resolution: string } }
  storyBible: { characters: Character[]; world: { setting: string; toneAnchors: string; voiceNotes: string }; themes: string; rules: string }
  documents: ProjectDocuments
  agents: {
    writingPartner: { transcript: TranscriptMessage[]; lastActive: number | null }
    sam:    { transcript: TranscriptMessage[]; lastTouched: number | null }
    casey:  { transcript: TranscriptMessage[]; lastTouched: number | null }
    oliver: { transcript: TranscriptMessage[]; lastTouched: number | null }
    maya:   { transcript: TranscriptMessage[]; lastTouched: number | null }
    zoe:    { transcript: TranscriptMessage[]; lastTouched: number | null }
    alex:   { transcript: TranscriptMessage[]; lastTouched: number | null }
  }
  memory: { decisions: unknown[]; flags: unknown[]; handoffs: unknown[] }
}
```

- [ ] **Step 5: Edit `defaultProjectState` to include documents**

Inside `defaultProjectState()`, **after** the `storyBible` field literal is built but before the `agents` field, you need a value derivable from the rest of the state. The clean pattern: build the legacy slice first, then call `legacyToDocuments`. Restructure `defaultProjectState` to:

```ts
export function defaultProjectState(): ProjectState {
  const base = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { title: '', genre: '', format: 'feature', wordCount: 0, pageCount: 0 },
    script: { rawHtml: '', scenes: [], revisionHistory: [] },
    outline: {
      beatType: 'save-the-cat',
      beats: DEFAULT_SAVE_THE_CAT_BEATS.map(beat => ({ ...beat, notes: '', linkedSceneIds: [] })),
    },
    synopsis: { logline: '', sections: { setup: '', act1Break: '', midpoint: '', act2Break: '', resolution: '' } },
    storyBible: { characters: [], world: { setting: '', toneAnchors: '', voiceNotes: '' }, themes: '', rules: '' },
    agents: {
      writingPartner: { transcript: [], lastActive: null },
      sam:    { transcript: [], lastTouched: null },
      casey:  { transcript: [], lastTouched: null },
      oliver: { transcript: [], lastTouched: null },
      maya:   { transcript: [], lastTouched: null },
      zoe:    { transcript: [], lastTouched: null },
      alex:   { transcript: [], lastTouched: null },
    },
    memory: { decisions: [], flags: [], handoffs: [] },
  } as Omit<ProjectState, 'documents'>

  const documents = legacyToDocuments(base as ProjectState)
  return { ...base, documents }
}
```

Note: This refactor pulls the existing beats literal into a named constant `DEFAULT_SAVE_THE_CAT_BEATS` if not already extracted. If the current `defaultProjectState` inlines the array of beats, leave it inline inside the `outline` literal — the only required change is splitting the object construction so `documents` can be derived from the rest.

- [ ] **Step 6: Edit `migrateState` to hydrate documents**

Inside `migrateState`, **after** all the existing field migrations (meta, agents, script) and **immediately before** `return state as unknown as ProjectState`, add:

```ts
const rawDocuments = (raw as Record<string, unknown>).documents
if (!rawDocuments || typeof rawDocuments !== 'object') {
  ;(state as Record<string, unknown>).documents = legacyToDocuments(state as ProjectState)
} else {
  ;(state as Record<string, unknown>).documents = rawDocuments
}
```

Verify the existing `state.schemaVersion = CURRENT_SCHEMA_VERSION` line stays in place — that handles the version bump for both empty and partial state.

- [ ] **Step 7: Run tests, verify they pass**

Run: `npm run test:run -- tests/lib/projectState.test.ts tests/lib/documentMigration.test.ts tests/shared/documents.test.ts`
Expected: PASS — all new migration tests green, existing project-state tests still green.

- [ ] **Step 8: Run full type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/projectState.ts tests/lib/projectState.test.ts
git commit -m "feat(documents): wire documents into ProjectState (schema v3) with legacy hydration"
```

---

### Task 10: Full Test Suite And Type Check — Verify No Consumer Breakage

**Files:** None modified. Verification only.

Existing consumers (`wpRouting.ts`, all tab components, `useProjectState`, server tests) read legacy fields. They should be unaffected because `documents` is purely additive. Confirm by running the full suite.

- [ ] **Step 1: Run full unit test suite**

Run: `npm run test:run`
Expected: ALL tests pass. Note pre-existing pass count from session memory: 338+ tests. Expected after this plan: 338 + (~3 from synopsis + ~3 from outline + ~2 from treatment + ~2 from storyBible + ~4 from wrapper + ~9 from migration + ~7 from markdown + ~4 from projectState additions) ≈ 372 passing.

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: clean build, no warnings about unresolved imports.

- [ ] **Step 4: Manual smoke test localStorage migration**

Run: `npm run dev:writeros`
In a separate terminal: open the app in a browser tab, then in browser devtools console:

```js
JSON.parse(localStorage.getItem('writeros_project_state'))?.schemaVersion
```

Expected: `3`

```js
JSON.parse(localStorage.getItem('writeros_project_state'))?.documents?.synopsis?.content?.logline?.text
```

Expected: string (likely empty for a fresh project, or matches whatever logline was in the legacy synopsis before migration).

Then mutate the synopsis logline through the UI, refresh the browser, and verify the legacy field still drives the displayed value (proof that `documents` did not break or override existing behavior).

- [ ] **Step 5: No commit (verification-only task)**

If any test fails or the build is dirty, stop and fix before continuing to Task 11. The migration must produce a clean tree.

---

### Task 11: Record Phase 1 Decisions In PRD

**Files:**
- Modify: `docs/product/structured-writing-surfaces-prd.md`

Update the Phase 1 section to record the concrete decisions this plan locked in, plus the success criteria evidence.

- [ ] **Step 1: Edit the Phase 1 section**

Find this block in `docs/product/structured-writing-surfaces-prd.md`:

```markdown
### Phase 1: Structured Surface Schema PRD/Tech Spec

Goal: define exact TypeScript state shapes and migration path.

Tasks:

- Draft document state interfaces.
- Map legacy state to new document state.
- Decide whether to introduce `state.documents` immediately or evolve top-level fields first.
- Define import/export-ready Markdown shapes.
- Define tests for data preservation.

Success criteria:

- No user data loss.
- Existing app can still render current data.
- New shapes support Document View and future export.
```

Replace it with:

```markdown
### Phase 1: Structured Surface Schema PRD/Tech Spec

Goal: define exact TypeScript state shapes and migration path.

Status: **Implemented** in `2026-05-15-structured-surfaces-phase-1` plan.

Tasks:

- Draft document state interfaces — done in `shared/documents.ts`.
- Map legacy state to new document state — done in `client/src/lib/documentMigration.ts`.
- Decide whether to introduce `state.documents` immediately or evolve top-level fields first — decided: **introduce `state.documents` immediately, dual-shape, legacy remains source of truth this phase**.
- Define import/export-ready Markdown shapes — done in `client/src/lib/documentMarkdown.ts`.
- Define tests for data preservation — `tests/shared/documents.test.ts`, `tests/lib/documentMigration.test.ts`, `tests/lib/documentMarkdown.test.ts`, plus v2→v3 migration tests in `tests/lib/projectState.test.ts`.

Decisions locked in:

- Schema version bumps `2 → 3`. `migrateState` hydrates `documents` from legacy fields when absent or pre-v3.
- Treatment has no legacy mapping; default Treatment is an empty `AuthoredDocumentState` so storage and Markdown emit stay uniform across all four surfaces.
- Markdown emitters skip empty optional sections; never render empty headings.
- No UI components, `wpRouting`, or server code change in this phase. Surface redesign phases (2–5) will flip individual surfaces to write `documents` first.

Success criteria — evidence:

- No user data loss — round-trip tests in `tests/lib/documentMigration.test.ts` cover synopsis, outline, story bible.
- Existing app can still render current data — `npm run test:run` includes the existing 338+ tests untouched, plus new schema tests.
- New shapes support Document View and future export — `documentsToMarkdown(state.documents)` returns one Markdown string per surface in stable order.
```

- [ ] **Step 2: Commit**

```bash
git add docs/product/structured-writing-surfaces-prd.md
git commit -m "docs(structured-surfaces): record Phase 1 decisions and implementation status"
```

---

## Summary

After all tasks the working tree is clean. Commits added since the start of this plan (PRD baseline is `07f900c`, already on the branch):

1. `docs(plans): archive voice-profile drawer plan`
2. `docs(plans): add Structured Surfaces Phase 1 schema plan`
3. `feat(documents): add Synopsis document content type and Zod schema`
4. `feat(documents): add Outline document content type and Zod schema`
5. `feat(documents): add Treatment document content type and Zod schema`
6. `feat(documents): add Story Bible document content type and Zod schema`
7. `feat(documents): add AuthoredDocumentState wrapper and ProjectDocuments aggregate`
8. `feat(documents): add legacyToDocuments adapter for Synopsis, Outline, Story Bible, Treatment`
9. `feat(documents): add documentsToLegacy round-trip adapter`
10. `feat(documents): add per-surface Markdown emitters`
11. `feat(documents): wire documents into ProjectState (schema v3) with legacy hydration`
12. `docs(structured-surfaces): record Phase 1 decisions and implementation status`

The next plan in the Phase 2–5 sequence redesigns the Synopsis surface first per the PRD's recommended surface order, switching its source-of-truth from the legacy field to `state.documents.synopsis`.
