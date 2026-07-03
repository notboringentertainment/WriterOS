# WorkspaceLocation (Location Packet Foundation) V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Writer's Room agents an honest, read-only, provenance-labeled statement of *where the writer is in the work*, attached to every wp-chat request and rendered into the persona prompt.

**Architecture:** A new `WorkspaceLocation` packet mirrors the existing `SurfaceAwareness` contract family — a Zod schema in `shared/`, assembled client-side, validated at the route, mapped onto `StoryMemory`, and rendered server-side by fixed provenance templates. It is pure read-only annotation: it does NOT alter retrieval, capture new focus on Outline/Synopsis/Treatment, touch the Spine, or enable any edits. The model fills template slots only; it never authors a location claim.

**Tech Stack:** TypeScript, Zod, React, Vitest. Path alias `@shared/*` → `shared/*`.

## Global Constraints

- **Mirror `SurfaceAwareness` exactly** (the precedent): schema in `shared/`, `.optional().catch(undefined)` at the route so a malformed packet degrades to no-block instead of 500ing, mapped onto `StoryMemory`, rendered in `createContextSummary`.
- **Generic single packet** — fields are `activeSurface`, `sourceKind`, `provenance`, optional `anchor {kind, stableId, label}`, optional `updatedAt`. NO per-provenance fields.
- **Invariant: `confirmed` ⟺ a concrete focus source** (`selected_text` or `editor_cursor`). No concrete signal → `sourceKind: 'none'`, never confirmed-with-null.
- **`anchor` present iff `sourceKind !== 'none'`.** `provenance === 'none'` iff `sourceKind === 'none'`.
- **`anchor.label` is client-resolved.** Server renderer is dumb — it slots `label`, never derives it.
- **Story Bible = `inferred` / `active_section` / "last working in"**, never confirmed-current. NO `updatedAt`-based freshness gating in V1.
- **Synthetic ↔ SurfaceAwareness strict split:** the location block carries only the provenance warning + the next-unanswered question's short label, pointing at the SAME `prompt.id` SurfaceAwareness uses. The full deck detail (counts, helper, question list) stays exclusively in SurfaceAwareness.
- **Forbidden prompt language** (must never appear in any template): "I can see you looking at…", "viewing your screen", "you are currently on X" for non-confirmed, card-level claims for `active_section`, "I made/updated/changed", "working on it / queued / in the background".
- **Out of scope:** RequestTarget (deferred); retrieval changes; active_card capture for Outline/Synopsis/Treatment; Spine navigation or Spine-id anchors; edits/proposals/autonomy; OpenSwarm changes (the OpenSwarm prompt builder `buildOpenSwarmWritingPartnerPrompt` is NOT touched).
- **Verify after meaningful changes:** `npm run test:run`, `npm run check`, `npm run build`. Commit per task. NO `Co-Authored-By` trailer.

---

## File Structure

- **Create `shared/workspaceLocation.ts`** — the Zod schema + inferred types + invariants. The single source of truth for the contract shape. Mirrors `shared/surfaceAwareness.ts`.
- **Create `client/src/lib/workspaceLocation.ts`** — `buildWorkspaceLocation(...)` plus helpers (`resolveScriptAnchor`, the Story Bible section-label map). Owns precedence resolution + client-side label resolution.
- **Modify `shared/schema.ts`** — add `location?: WorkspaceLocation` to `StoryMemory` (next to `surface?` at line 82).
- **Modify `server/ai/openaiService.ts`** — add `renderWorkspaceLocation(...)` next to `renderSurfaceAwareness` (line 489) and include its block in `createContextSummary` (line ~602).
- **Modify `server/routes.ts`** — add `location` to `projectContextSchema` (next to `surface` at line 263) and map it into `storyMemory` (next to line 928).
- **Modify `client/src/App.tsx`** — compute + attach `location` at the two wp-chat send sites (lines 638 and 657).
- **Create `tests/shared/workspaceLocation.test.ts`**, **`tests/lib/workspaceLocation.test.ts`** — unit tests. Extend **`tests/server/openaiService.test.ts`** (render) and **`tests/server/wpChatRoute.test.ts`** (route validation/mapping).

---

## Task 1: WorkspaceLocation shared contract + validation

**Files:**
- Create: `shared/workspaceLocation.ts`
- Test: `tests/shared/workspaceLocation.test.ts`

**Interfaces:**
- Produces: `WorkspaceLocationSchema` (Zod), `type WorkspaceLocation`, and the enums `LocationSurfaceSchema`, `LocationSourceKindSchema`, `LocationProvenanceSchema`, `LocationAnchorKindSchema`. `WorkspaceLocation` fields: `{ activeSurface: 'script'|'outline'|'synopsis'|'treatment'|'story-bible'; sourceKind: 'selected_text'|'editor_cursor'|'active_section'|'first_unanswered'|'none'; provenance: 'confirmed'|'inferred'|'synthetic'|'none'; anchor?: { kind: 'block'|'scene'|'section'|'question'; stableId: string; label: string }; updatedAt?: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/shared/workspaceLocation.test.ts
import { describe, it, expect } from 'vitest'
import { WorkspaceLocationSchema } from '../../shared/workspaceLocation'

const confirmedSelection = {
  activeSurface: 'script', sourceKind: 'selected_text', provenance: 'confirmed',
  anchor: { kind: 'block', stableId: 'block:4', label: 'I can still hear the line breathing.' },
  updatedAt: 1,
}

describe('WorkspaceLocationSchema', () => {
  it('accepts a confirmed selection packet', () => {
    expect(WorkspaceLocationSchema.safeParse(confirmedSelection).success).toBe(true)
  })

  it('accepts an inferred active_section packet', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'story-bible', sourceKind: 'active_section', provenance: 'inferred',
      anchor: { kind: 'section', stableId: 'world', label: 'Premise & World' },
    }).success).toBe(true)
  })

  it('accepts a synthetic first_unanswered packet', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'outline', sourceKind: 'first_unanswered', provenance: 'synthetic',
      anchor: { kind: 'question', stableId: 'feature.incitingIncident', label: 'The inciting incident' },
    }).success).toBe(true)
  })

  it('accepts a none packet with no anchor', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script', sourceKind: 'none', provenance: 'none',
    }).success).toBe(true)
  })

  it('rejects confirmed provenance without a concrete focus source', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'outline', sourceKind: 'first_unanswered', provenance: 'confirmed',
      anchor: { kind: 'question', stableId: 'q1', label: 'x' },
    }).success).toBe(false)
  })

  it('rejects an anchor when sourceKind is none', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script', sourceKind: 'none', provenance: 'none',
      anchor: { kind: 'block', stableId: 'block:0', label: 'x' },
    }).success).toBe(false)
  })

  it('rejects a missing anchor when sourceKind is not none', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script', sourceKind: 'editor_cursor', provenance: 'confirmed',
    }).success).toBe(false)
  })

  it('rejects provenance/sourceKind none mismatch', () => {
    expect(WorkspaceLocationSchema.safeParse({
      activeSurface: 'script', sourceKind: 'none', provenance: 'synthetic',
    }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/workspaceLocation.test.ts`
Expected: FAIL — cannot resolve `../../shared/workspaceLocation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/workspaceLocation.ts
import { z } from 'zod'

// WorkspaceLocation — a read-only, provenance-labeled snapshot of WHERE the writer is in
// the work. Sibling to SurfaceAwareness (which is intake/completeness progress). Assembled
// client-side, validated here, rendered server-side by fixed provenance templates.

export const LocationSurfaceSchema = z.enum(['script', 'outline', 'synopsis', 'treatment', 'story-bible'])
export type LocationSurface = z.infer<typeof LocationSurfaceSchema>

export const LocationSourceKindSchema = z.enum(['selected_text', 'editor_cursor', 'active_section', 'first_unanswered', 'none'])
export type LocationSourceKind = z.infer<typeof LocationSourceKindSchema>

export const LocationProvenanceSchema = z.enum(['confirmed', 'inferred', 'synthetic', 'none'])
export type LocationProvenance = z.infer<typeof LocationProvenanceSchema>

export const LocationAnchorKindSchema = z.enum(['block', 'scene', 'section', 'question'])

export const LocationAnchorSchema = z.object({
  kind: LocationAnchorKindSchema,
  stableId: z.string(),
  label: z.string(),
})
export type LocationAnchor = z.infer<typeof LocationAnchorSchema>

export const WorkspaceLocationSchema = z.object({
  activeSurface: LocationSurfaceSchema,
  sourceKind: LocationSourceKindSchema,
  provenance: LocationProvenanceSchema,
  anchor: LocationAnchorSchema.optional(),
  updatedAt: z.number().int().optional(),
}).superRefine((v, ctx) => {
  // anchor present iff sourceKind !== 'none'
  if (v.sourceKind === 'none' && v.anchor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['anchor'], message: 'anchor must be absent when sourceKind is none' })
  }
  if (v.sourceKind !== 'none' && !v.anchor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['anchor'], message: 'anchor required when sourceKind is not none' })
  }
  // confirmed requires a concrete focus source
  if (v.provenance === 'confirmed' && v.sourceKind !== 'selected_text' && v.sourceKind !== 'editor_cursor') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['provenance'], message: 'confirmed requires selected_text or editor_cursor' })
  }
  // provenance 'none' iff sourceKind 'none'
  if ((v.provenance === 'none') !== (v.sourceKind === 'none')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['provenance'], message: 'provenance none iff sourceKind none' })
  }
})
export type WorkspaceLocation = z.infer<typeof WorkspaceLocationSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/workspaceLocation.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/workspaceLocation.ts tests/shared/workspaceLocation.test.ts
git commit -m "feat(location): add WorkspaceLocation shared contract + validation"
```

---

## Task 2: Add `location` to StoryMemory

**Files:**
- Modify: `shared/schema.ts:82`

**Interfaces:**
- Consumes: `WorkspaceLocation` from Task 1.
- Produces: `StoryMemory['location']` field of type `WorkspaceLocation | undefined`.

- [ ] **Step 1: Add the import and field**

At the top of `shared/schema.ts`, alongside the existing `SurfaceAwareness` import, add:

```ts
import type { WorkspaceLocation } from './workspaceLocation'
```

Then in the `StoryMemory` interface, directly under `surface?: SurfaceAwareness` (line 82), add:

```ts
  location?: WorkspaceLocation
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run check`
Expected: PASS (no type errors; the field is optional and not yet referenced).

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(location): add optional location field to StoryMemory"
```

---

## Task 3: Client packet assembly (`buildWorkspaceLocation`)

**Files:**
- Create: `client/src/lib/workspaceLocation.ts`
- Test: `tests/lib/workspaceLocation.test.ts`

**Interfaces:**
- Consumes: `WorkspaceLocation` (Task 1); `SurfaceAwareness` from `@shared/surfaceAwareness`; `ScriptFocusState`, `buildScriptIndex`, `getFocusContext` from `./scriptIndex`; `StoryBibleSection` from `./shellState`.
- Produces: `buildWorkspaceLocation(input: BuildLocationInput): WorkspaceLocation` where `BuildLocationInput = { activeTab: LocationSurface; scriptRawHtml: string; scriptFocus?: ScriptFocusState; storyBibleSection: StoryBibleSection | null; surface: SurfaceAwareness }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/workspaceLocation.test.ts
import { describe, it, expect } from 'vitest'
import { buildWorkspaceLocation } from '../../client/src/lib/workspaceLocation'
import type { SurfaceAwareness } from '../../shared/surfaceAwareness'

const noneSurface: SurfaceAwareness = { kind: 'none' }

const intakeSurface: SurfaceAwareness = {
  kind: 'intake', surface: 'outline', surfaceTitle: 'Outline', format: 'feature',
  questions: [
    { id: 'feature.openingNormalWorld', label: 'Opening / normal world', helper: 'h', status: 'answered' },
    { id: 'feature.incitingIncident', label: 'The inciting incident', helper: 'h', status: 'unanswered' },
  ],
  nextQuestion: { id: 'feature.incitingIncident', label: 'The inciting incident', helper: 'h', status: 'unanswered' },
  selectionSource: 'first_unanswered', answeredCount: 1, totalCount: 2, nextRecommendedAction: 'answer_next_question',
}

// A minimal screenplay HTML with one scene heading + one action line. Real element types
// (data-element-type) so buildScriptIndex parses a scene-heading block — plain <p> parses as a
// generic action block and never exercises the current-scene path this test asserts.
// (Parser: scriptBlocks.ts:20,25 query `[data-element-type], p`; scriptIndex keys on block.type === 'scene-heading'.)
const SCRIPT_HTML = '<p data-element-type="scene-heading">INT. DINER - NIGHT</p><p data-element-type="action">Dante slides the file across the table.</p>'

describe('buildWorkspaceLocation', () => {
  it('script with a selection → confirmed selected_text', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'script', scriptRawHtml: SCRIPT_HTML,
      scriptFocus: { blockIndex: 1, selectedText: 'slides the file', updatedAt: 5 },
      storyBibleSection: null, surface: noneSurface,
    })
    expect(loc.provenance).toBe('confirmed')
    expect(loc.sourceKind).toBe('selected_text')
    expect(loc.anchor?.label).toContain('slides the file')
  })

  it('script with a cursor but no selection → confirmed editor_cursor', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'script', scriptRawHtml: SCRIPT_HTML,
      scriptFocus: { blockIndex: 0, updatedAt: 5 },
      storyBibleSection: null, surface: noneSurface,
    })
    expect(loc.provenance).toBe('confirmed')
    expect(loc.sourceKind).toBe('editor_cursor')
    expect(loc.anchor?.kind === 'scene' || loc.anchor?.kind === 'block').toBe(true)
  })

  it('script with no focus → none', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'script', scriptRawHtml: SCRIPT_HTML,
      scriptFocus: undefined, storyBibleSection: null, surface: noneSurface,
    })
    expect(loc.sourceKind).toBe('none')
    expect(loc.provenance).toBe('none')
    expect(loc.anchor).toBeUndefined()
  })

  it('story-bible with a last-focused section → inferred active_section', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'story-bible', scriptRawHtml: '', scriptFocus: undefined,
      storyBibleSection: 'world', surface: noneSurface,
    })
    expect(loc.provenance).toBe('inferred')
    expect(loc.sourceKind).toBe('active_section')
    expect(loc.anchor).toEqual({ kind: 'section', stableId: 'world', label: 'Premise & World' })
  })

  it('outline → synthetic first_unanswered pointing at the same prompt.id', () => {
    const loc = buildWorkspaceLocation({
      activeTab: 'outline', scriptRawHtml: '', scriptFocus: undefined,
      storyBibleSection: null, surface: intakeSurface,
    })
    expect(loc.provenance).toBe('synthetic')
    expect(loc.sourceKind).toBe('first_unanswered')
    expect(loc.anchor?.stableId).toBe('feature.incitingIncident')
    expect(loc.anchor?.label).toBe('The inciting incident')
  })

  it('story-bible with no section but an intake surface → synthetic first_unanswered', () => {
    const sb: SurfaceAwareness = { ...intakeSurface, surface: 'story-bible', surfaceTitle: 'Story Bible' }
    const loc = buildWorkspaceLocation({
      activeTab: 'story-bible', scriptRawHtml: '', scriptFocus: undefined,
      storyBibleSection: null, surface: sb,
    })
    expect(loc.sourceKind).toBe('first_unanswered')
    expect(loc.provenance).toBe('synthetic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/workspaceLocation.test.ts`
Expected: FAIL — cannot resolve `client/src/lib/workspaceLocation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/lib/workspaceLocation.ts
import type { WorkspaceLocation, LocationSurface } from '@shared/workspaceLocation'
import type { SurfaceAwareness } from '@shared/surfaceAwareness'
import type { ScriptFocusState } from './scriptIndex'
import { buildScriptIndex, getFocusContext } from './scriptIndex'
import type { StoryBibleSection } from './shellState'

const STORY_BIBLE_SECTION_LABELS: Record<StoryBibleSection, string> = {
  characters: 'Characters',
  world: 'Premise & World',
  themes: 'Themes',
  tone: 'Tone & Style',
  rules: 'Story Rules',
}

export interface BuildLocationInput {
  activeTab: LocationSurface
  scriptRawHtml: string
  scriptFocus?: ScriptFocusState
  storyBibleSection: StoryBibleSection | null
  surface: SurfaceAwareness
}

const NONE = (activeSurface: LocationSurface): WorkspaceLocation => ({
  activeSurface, sourceKind: 'none', provenance: 'none',
})

export function buildWorkspaceLocation(input: BuildLocationInput): WorkspaceLocation {
  if (input.activeTab === 'script') return buildScriptLocation(input)
  if (input.activeTab === 'story-bible' && input.storyBibleSection) {
    return buildSectionLocation('story-bible', input.storyBibleSection)
  }
  return buildSyntheticLocation(input.activeTab, input.surface)
}

function buildScriptLocation(input: BuildLocationInput): WorkspaceLocation {
  const focus = input.scriptFocus
  const hasSelection = Boolean(focus?.selectedText?.trim())
  const hasCursor = typeof focus?.blockIndex === 'number'
  if (!focus || (!hasSelection && !hasCursor)) return NONE('script')

  const index = buildScriptIndex(input.scriptRawHtml)
  const window = getFocusContext(index, focus)
  if (!window) return NONE('script')

  if (hasSelection) {
    const quote = focus!.selectedText!.trim().slice(0, 160)
    return {
      activeSurface: 'script', sourceKind: 'selected_text', provenance: 'confirmed',
      anchor: { kind: 'block', stableId: `block:${focus!.blockIndex ?? 'sel'}`, label: quote },
      updatedAt: focus!.updatedAt,
    }
  }
  const isScene = window.reason === 'current-scene'
  return {
    activeSurface: 'script', sourceKind: 'editor_cursor', provenance: 'confirmed',
    anchor: {
      kind: isScene ? 'scene' : 'block',
      stableId: `block:${focus!.blockIndex}`,
      label: window.label || 'the current script position',
    },
    updatedAt: focus!.updatedAt,
  }
}

function buildSectionLocation(activeSurface: LocationSurface, section: StoryBibleSection): WorkspaceLocation {
  return {
    activeSurface, sourceKind: 'active_section', provenance: 'inferred',
    anchor: { kind: 'section', stableId: section, label: STORY_BIBLE_SECTION_LABELS[section] },
  }
}

function buildSyntheticLocation(activeSurface: LocationSurface, surface: SurfaceAwareness): WorkspaceLocation {
  if (surface.kind !== 'intake' || !surface.nextQuestion) return NONE(activeSurface)
  return {
    activeSurface, sourceKind: 'first_unanswered', provenance: 'synthetic',
    anchor: { kind: 'question', stableId: surface.nextQuestion.id, label: surface.nextQuestion.label },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/workspaceLocation.test.ts`
Expected: PASS (6 tests). If `getFocusContext`'s `window.reason`/`window.label` differ from the assumptions, adjust the cursor-branch assertions to the actual returned shape (read `client/src/lib/scriptIndex.ts:545` `getFocusContext`); do NOT change the contract — only the label/kind mapping.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/workspaceLocation.ts tests/lib/workspaceLocation.test.ts
git commit -m "feat(location): client-side WorkspaceLocation packet assembly"
```

---

## Task 4: Server prompt rendering (`renderWorkspaceLocation`)

**Files:**
- Modify: `server/ai/openaiService.ts` (add function near line 489; wire into `createContextSummary` near line 602)
- Test: `tests/server/openaiService.test.ts` (extend)

**Interfaces:**
- Consumes: `StoryMemory['location']` (Task 2).
- Produces: `renderWorkspaceLocation(location: StoryMemory['location']): string` (returns `''` for absent/`none`). Rendered into `createContextSummary` output as a block placed immediately after the surface-awareness block.

- [ ] **Step 1: Write the failing test**

Add to `tests/server/openaiService.test.ts` inside the `createContextSummary` describe block:

```ts
  it('renders a confirmed script selection as a workspace-location block', () => {
    const summary = createContextSummary(storyMemory({
      location: {
        activeSurface: 'script', sourceKind: 'selected_text', provenance: 'confirmed',
        anchor: { kind: 'block', stableId: 'block:4', label: 'Everything in here is true.' },
      },
    }) as any)
    expect(summary).toContain('WORKSPACE LOCATION')
    expect(summary).toContain('The writer has text selected')
    expect(summary).toContain('Everything in here is true.')
    expect(summary).toContain('Do not describe visual appearance')
  })

  it('renders a synthetic location as an inferred warning, not as current focus', () => {
    const summary = createContextSummary(storyMemory({
      location: {
        activeSurface: 'outline', sourceKind: 'first_unanswered', provenance: 'synthetic',
        anchor: { kind: 'question', stableId: 'feature.incitingIncident', label: 'The inciting incident' },
      },
    }) as any)
    expect(summary).toContain('No confirmed location')
    expect(summary).toContain('not the writer\'s actual focus')
    // Must NOT phrase synthetic as real focus, and must not claim screen access.
    expect(summary).not.toContain('I can see')
    expect(summary).not.toContain('you are currently on')
  })

  it('renders a story-bible section as last-focus, never as confirmed current position', () => {
    const summary = createContextSummary(storyMemory({
      location: {
        activeSurface: 'story-bible', sourceKind: 'active_section', provenance: 'inferred',
        anchor: { kind: 'section', stableId: 'world', label: 'Premise & World' },
      },
    }) as any)
    expect(summary).toContain('was last working in the Premise & World section')
    expect(summary).toContain('not confirmed current position')
  })

  it('renders nothing for a none location', () => {
    const summary = createContextSummary(storyMemory({
      location: { activeSurface: 'script', sourceKind: 'none', provenance: 'none' },
    }) as any)
    expect(summary).not.toContain('WORKSPACE LOCATION')
  })
```

(The `storyMemory(...)` factory at the top of this test file builds a `StoryMemory`; `location` is an optional field, so passing it through is additive. `as any` avoids needing to widen the factory's param type.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/openaiService.test.ts -t "workspace-location"`
Expected: FAIL — no `WORKSPACE LOCATION` block in output.

- [ ] **Step 3: Write minimal implementation**

In `server/ai/openaiService.ts`, immediately after `renderSurfaceAwareness` (ends line 507), add:

```ts
// Renders WorkspaceLocation into a read-only prompt block via FIXED provenance templates.
// The model fills no part of this; it only reads it. Returns '' for absent/'none'.
function renderWorkspaceLocation(location: StoryMemory['location']): string {
  if (!location || location.sourceKind === 'none' || !location.anchor) return ''
  const surface = location.activeSurface
  const label = location.anchor.label
  let line: string
  switch (location.sourceKind) {
    case 'selected_text':
      line = `The writer has text selected in the ${surface} editor: "${label}".`
      break
    case 'editor_cursor':
      line = `The writer's cursor is in the ${surface} editor at ${label}.`
      break
    case 'active_section':
      line = `The writer was last working in the ${label} section of ${surface}. (Last focus — not confirmed current position.)`
      break
    case 'first_unanswered':
      line = `No confirmed location on ${surface}. By document completeness, the next unanswered item is "${label}" — inferred from what's filled in, not the writer's actual focus.`
      break
    default:
      return ''
  }
  return [
    `WORKSPACE LOCATION (where the writer is in the work — read-only app state, not a view of their screen):`,
    `- ${line}`,
    `- (Structured app state only. Do not describe visual appearance or claim to see the page.)`,
  ].join('\n')
}
```

Then in `createContextSummary`, find (line ~602):

```ts
  const surfaceBlock = renderSurfaceAwareness(storyMemory.surface)
  const allBlocks = surfaceBlock ? [surfaceBlock, ...orderedBlocks] : orderedBlocks
```

Replace with:

```ts
  const surfaceBlock = renderSurfaceAwareness(storyMemory.surface)
  const locationBlock = renderWorkspaceLocation(storyMemory.location)
  const leadingBlocks = [surfaceBlock, locationBlock].filter(Boolean)
  const allBlocks = leadingBlocks.length ? [...leadingBlocks, ...orderedBlocks] : orderedBlocks
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/openaiService.test.ts`
Expected: PASS (existing tests + 4 new). The existing "byte-identical when surface absent" guards still hold because `locationBlock` is `''` when `location` is absent.

- [ ] **Step 5: Commit**

```bash
git add server/ai/openaiService.ts tests/server/openaiService.test.ts
git commit -m "feat(location): render WorkspaceLocation block in persona context"
```

---

## Task 5: Route validation + StoryMemory mapping

**Files:**
- Modify: `server/routes.ts` (import; `projectContextSchema` at line 263; storyMemory map at line 928)
- Test: `tests/server/wpChatRoute.test.ts` (extend)

**Interfaces:**
- Consumes: `WorkspaceLocationSchema` (Task 1), `StoryMemory['location']` (Task 2).
- Produces: validated `data.projectContext.location` flowing into `storyMemory.location`. Malformed → `undefined` (no 500).

- [ ] **Step 1: Write the failing test**

Add to `tests/server/wpChatRoute.test.ts`, mirroring the existing **"passes a Surface Awareness Contract through to StoryMemory"** test (line 241) for imports/setup — it already does `vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse')` and reads `generateSpy.mock.calls[0][3] as StoryMemory` (the storyMemory arg; signature is `generatePersonaResponse(persona, message, userProfile, storyMemory, history)`, routes.ts:857-863). A plain `200` only proves the route *tolerated* the payload — assert the mapping:

```ts
  it('passes a valid location through to StoryMemory', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse')
      .mockResolvedValue({ message: 'ok', suggestions: [] } as any)

    const location = {
      activeSurface: 'script', sourceKind: 'selected_text', provenance: 'confirmed',
      anchor: { kind: 'block', stableId: 'block:1', label: 'a selected line' },
    }
    const res = await request(app).post('/api/wp-chat').send({
      ...baseBody,
      projectContext: { ...baseProjectContext, location },
    })

    expect(res.status).toBe(200)
    const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
    expect(storyMemory.location).toEqual(location)
    generateSpy.mockRestore()
  })

  it('degrades a malformed location to undefined instead of failing the request', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse')
      .mockResolvedValue({ message: 'ok', suggestions: [] } as any)

    const res = await request(app).post('/api/wp-chat').send({
      ...baseBody,
      projectContext: {
        ...baseProjectContext,
        location: { activeSurface: 'script', sourceKind: 'confirmed' /* invalid enum value */ },
      },
    })

    expect(res.status).toBe(200)
    const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
    expect(storyMemory.location).toBeUndefined()
    generateSpy.mockRestore()
  })
```

(`request(app)`, `baseBody`, `baseProjectContext`, `OpenAIService`, `StoryMemory` are all already imported/established by the line-241 test — reuse them verbatim. If a base-body helper has a different name in this suite, adapt the name only; the spy-assertion contract is the point.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/wpChatRoute.test.ts -t "location"`
Expected: FAIL — before the route change, `location` is stripped by `projectContextSchema` (unknown key), so `storyMemory.location` is `undefined` and the pass-through `toEqual(location)` assertion fails. (The degrade test goes green immediately — that's fine; the pass-through test is the real RED.)

- [ ] **Step 3: Write minimal implementation**

In `server/routes.ts`, extend the existing import (line 11):

```ts
import { SurfaceAwarenessSchema } from "@shared/surfaceAwareness";
import { WorkspaceLocationSchema } from "@shared/workspaceLocation";
```

In `projectContextSchema`, directly under `surface:` (line 263), add:

```ts
  // WorkspaceLocation — optional, advisory, read-only. Mirrors the `surface` safety rule:
  // a malformed packet degrades to undefined (no block) rather than 500ing the request.
  location: WorkspaceLocationSchema.optional().catch(undefined),
```

In the `storyMemory` object literal, directly under `surface: data.projectContext.surface,` (line 928), add:

```ts
        location: data.projectContext.location,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/wpChatRoute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts tests/server/wpChatRoute.test.ts
git commit -m "feat(location): validate + map WorkspaceLocation in wp-chat route"
```

---

## Task 6: Wire location into the client send sites

**Files:**
- Modify: `client/src/App.tsx` (import; both send sites — lines 638 and 657; `useCallback` deps)

**Interfaces:**
- Consumes: `buildWorkspaceLocation` (Task 3), `buildSurfaceAwareness` (existing), `latestScriptSnapshotRef` (existing, holds `{ rawHtml, scenes, focus }`), `shellState.activeTab`, `shellState.storyBibleSection` (existing).

- [ ] **Step 1: Add the import**

Near the other `@/lib` imports in `client/src/App.tsx`, add:

```ts
import { buildWorkspaceLocation } from './lib/workspaceLocation'
```

- [ ] **Step 2: Attach location at the Writing Partner send site**

Replace lines 637–638:

```ts
      const surface = buildSurfaceAwareness(shellState.activeTab, project.state)
      const response = await postWPChat({ personaId, message: messageToSend, projectContext: { ...projectContext, surface }, conversationHistory, voiceProfile: loadCompletedVoiceProfile() })
```

with:

```ts
      const surface = buildSurfaceAwareness(shellState.activeTab, project.state)
      const location = buildWorkspaceLocation({
        activeTab: shellState.activeTab,
        scriptRawHtml: latestScriptSnapshotRef.current.rawHtml,
        scriptFocus: shellState.activeTab === 'script' ? latestScriptSnapshotRef.current.focus : undefined,
        storyBibleSection: shellState.storyBibleSection,
        surface,
      })
      const response = await postWPChat({ personaId, message: messageToSend, projectContext: { ...projectContext, surface, location }, conversationHistory, voiceProfile: loadCompletedVoiceProfile() })
```

- [ ] **Step 3: Attach location at the specialist send site**

Replace lines 656–657 with the same pattern:

```ts
      const surface = buildSurfaceAwareness(shellState.activeTab, project.state)
      const location = buildWorkspaceLocation({
        activeTab: shellState.activeTab,
        scriptRawHtml: latestScriptSnapshotRef.current.rawHtml,
        scriptFocus: shellState.activeTab === 'script' ? latestScriptSnapshotRef.current.focus : undefined,
        storyBibleSection: shellState.storyBibleSection,
        surface,
      })
      const response = await postWPChat({ personaId: specialistId, message: text, projectContext: { ...projectContext, surface, location }, conversationHistory, voiceProfile: loadCompletedVoiceProfile() })
```

(`scriptFocus` is surface-scoped here — the same `activeTab === 'script'` gate the existing `buildFreshProjectContext` uses for `script.focus`, satisfying the V1 freshness rule.)

- [ ] **Step 4: Verify typecheck + existing app tests pass**

Run: `npm run check`
Then: `npx vitest run tests/components/AppSurfaceAwareness.test.tsx tests/components/AppOpenSwarm.test.tsx`
Expected: PASS — sends now include `location`; no existing assertion breaks (location is additive on the payload).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(location): attach WorkspaceLocation to wp-chat sends"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 2: Full test suite**

Run: `npm run test:run`
Expected: PASS — prior count + the new WorkspaceLocation tests; zero regressions.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual provenance sanity (optional, recommended)**

Start the dev server, open a project, and in the Writer's Room send the same question from (a) the Script tab with text selected, (b) the Story Bible tab after clicking into the World section, (c) the Outline tab. Confirm via server logs / response that the agent never claims to "see your screen," phrases Story Bible as "last working in," and phrases Outline as "no confirmed location / inferred." (No automated assertion — this is a human truthfulness check.)

---

## Self-Review

**Spec coverage:** WorkspaceLocation shared contract + validation (Task 1) ✓; client packet assembly incl. client-resolved `anchor.label` (Task 3) ✓; server fixed-template rendering (Task 4) ✓; Script confirmed focus (Tasks 3,4,6) ✓; Story Bible inferred last-focused section, no timestamp (Tasks 3,4) ✓; synthetic `first_unanswered` for Outline/Synopsis/Treatment, strict split from SurfaceAwareness via shared `prompt.id` (Tasks 3,4) ✓; route validation + degrade (Task 5) ✓; tests at every layer ✓. RequestTarget deferred — no task, intentional ✓. Retrieval untouched — no task modifies `extractScriptContext`/`buildProjectContext` retrieval logic ✓. OpenSwarm untouched — `buildOpenSwarmWritingPartnerPrompt` not in any task ✓. Spine untouched ✓.

**Placeholder scan:** All steps carry real code or exact commands. The two "adapt to this suite's helpers" notes (Tasks 3 Step 4, 5 Step 1) name the exact contract to preserve, not a TODO.

**Type consistency:** `WorkspaceLocation` field names (`activeSurface`/`sourceKind`/`provenance`/`anchor{kind,stableId,label}`/`updatedAt`) are identical across Task 1 (schema), Task 3 (builder return), Task 4 (renderer param via `StoryMemory['location']`), Task 5 (route map). `buildWorkspaceLocation` signature is identical in Task 3 (def) and Task 6 (call). `BuildLocationInput` fields match the Task 6 call sites. `STORY_BIBLE_SECTION_LABELS` keys match the `StoryBibleSection` enum (`shellState.ts:5`).

**Risks:**
1. **`getFocusContext` return shape** (Task 3) — the `window.reason`/`window.label` mapping assumes the values at `scriptIndex.ts:545`. If they differ, only the script cursor-branch label/kind needs adjusting; the contract and invariants do not change. Mitigation: the test asserts `kind === 'scene' || 'block'` loosely.
2. **Existing byte-identity guards** in `openaiService.test.ts` — Task 4 keeps `locationBlock = ''` when location is absent, so prompts stay byte-identical for all current tests (which pass no `location`). Verified by running the full file in Task 4 Step 4.
3. **wp-chat test harness** (Task 5) — confirmed: the suite spies `OpenAIService.prototype.generatePersonaResponse` and reads `mock.calls[0][3] as StoryMemory` (line 241 is the template). The pass-through test asserts `storyMemory.location` (mapping), not just status 200. Only a base-body helper name might differ — adapt the name, keep the spy assertion.
4. **Prompt bloat** — one short block; negligible. The synthetic block deliberately does not restate the deck (split rule), avoiding duplication with the surface block.
5. **`storyMemory()` test factory** (Task 4) — uses `as any` to pass `location` without widening the factory; acceptable for tests, or widen the factory's param type if the suite prefers.
