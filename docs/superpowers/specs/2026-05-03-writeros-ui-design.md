# WriterOS UI Design Spec
**Date:** 2026-05-03  
**Status:** Historical implementation spec; superseded for non-script surface product intent
**Repo:** https://github.com/notboringentertainment/WriterOS

> May 18 product alignment note: this spec is useful for shell, visual-system, Script, and early architecture context. Its Structured Document Tabs section reflects the original guided-form implementation and is no longer current product intent. For Synopsis, Outline, Story Bible, and Treatment, follow `docs/product/README.md`, `docs/product/project-wide-format-agent-context-prd.md`, `docs/product/outline-story-coach-redesign-prd.md`, and `docs/product/structured-writing-surfaces-prd.md`.

---

## Overview

WriterOS is a professional screenwriting application with an integrated multi-agent AI studio. The core principle: **this is a writing app first, an agent interaction app second.** The writing surface is the hero. Agents are the support crew.

The existing prototype established the agent workspace designs (6 specialist personas, shared ProjectState, design system). This spec adds what was explicitly missing: the writing surface, structured document tabs, and the Writing Partner — then integrates them with the existing Writer's Room.

---

## Navigation Shell

### Top Bar (always visible)

```
[WriterOS]  [Script | Story Bible | Outline | Synopsis]  [Project Title]  [Writer's Room]  [⌘K]
```

- Left: logo
- Left-center: four writing mode tabs — primary navigation
- Center: current project name (Fraunces, muted)
- Right: Writer's Room tab (distinct destination, not a writing mode)
- Far right: `⌘K` command palette trigger

Writing tabs and Writer's Room are visually distinct — writing tabs feel like document tabs, Writer's Room feels like a mode switch.

### Left Rail (always present)

**Collapsed (48px wide, default):**
- Writing Partner avatar at top
- Breathing amber pulse dot when Writing Partner has something proactive to surface
- `⌘\` tooltip on hover
- Silent otherwise — does not intrude

**Expanded (300px, slides in):**
- Writing surface shifts right to accommodate — no overlap
- Full chat panel (see Writing Partner section)
- Each writing tab remembers its own open/closed state
- `⌘\` toggles

### Center

Full remaining width. Houses writing surface or Writer's Room depending on active tab.

---

## Script Tab

### The Page

The script page is the light source of the application. Everything else recedes.

- Centered white page (`#F5F2EC`, warm aged paper) on dark background
- Fixed width 816px (8.5" at 96dpi)
- Box shadow: `0 8px 48px hsla(38, 60%, 50%, 0.12)` — the page casts warm light onto the desk
- Courier Prime 12pt, line height 1.0
- WGA margins: left 1.5", right 1", top/bottom 1" (inset from page edge)
- Page appears on load via 300ms fade-up animation

### Auto-Formatting (acceptance tests)

The screenplay editor must pass these explicit tests — not "feel like Final Draft" but behave correctly per the following:

| Element | Tab behavior | Enter behavior |
|---|---|---|
| Scene Heading | Next: Action | Next: Action |
| Action | Next: Character | Next: Action |
| Character | Next: Dialogue | Next: Dialogue |
| Dialogue | Next: Parenthetical | Next: Action |
| Parenthetical | Next: Dialogue | Next: Dialogue |
| Transition | Next: Scene Heading | Next: Scene Heading |

- `Tab` advances to next element in sequence
- `Shift+Tab` reverses
- Scene Headings: text uppercases on `Enter` or `Tab` commit
- Character names: text uppercases on `Enter` or `Tab` commit
- INT./EXT. prompt offered if scene heading doesn't begin with either prefix
- Each element carries correct indentation defined in CSS — writer never touches a ruler
- Edge cases to test explicitly: backspace from empty Dialogue → returns to Character; backspace from empty Character → returns to Action; typing in middle of existing element doesn't re-trigger Tab behavior

### Left Gutter (outside page boundary)

- Scene numbers, `hsl(220 13% 40%)`, non-editable
- Click scene number → scroll-jumps to that scene
- Future: toggleable scene tree panel on far left

### Thin Toolbar (above page, below top bar)

- Element type picker (dropdown showing current element) — for mouse users
- Live page count · word count (DM Mono, muted). **Page count is approximate** — calculated as total element heights / 11" page at 72lpi, not true visual pagination. True page breaks with widow/orphan control are deferred (future feature).
- Focus mode button → hides top bar, collapses rail, pure page. `Esc` exits

---

## Structured Document Tabs

Story Bible, Outline, and Synopsis are **not blank pages**. Each is a guided structured document — the app knows what industry-standard looks like and presents it as sections to fill. Visual treatment: dark background, white cards per section (warmer than the script page), structured notes aesthetic.

### Synopsis Tab

Industry standard: 1–3 pages, present tense, third person. Sections:

1. **Logline** — 1–2 sentences, character + goal + obstacle + stakes. Guidance note shown grayed beneath label.
2. **Setup** — who, where, when, inciting incident
3. **Act One Break** — the protagonist commits
4. **Midpoint**
5. **Act Two Break / Dark Moment**
6. **Resolution**

Each section: label + collapsible industry guidance (grayed italic) + textarea. "Generate draft" button on each section triggers Sam (synopsis specialist) via Writing Partner to produce a draft based on ProjectState. Generated text is editable.

Default Writing Partner agent when this tab is active: **Sam**.

### Outline Tab

Three-act beat sheet. Default: Save the Cat (15 beats). Toggle to: Blake Snyder extended, Hero's Journey, Three-Act custom. Each beat:

- Beat name (e.g., "Midpoint") + standard description (collapsible, grayed)
- Writer's notes textarea
- Linked scenes chip — auto-populated when script scenes carry a `beatId`

Beats are reorderable (drag handle). Custom beats can be added between standard ones. Oliver is the default Writing Partner agent here.

### Story Bible Tab

Sectioned expandable document:

| Section | Key fields |
|---|---|
| Characters | Name, Role, Wound, Want, Need, Arc — from Casey's data model |
| World | Setting, rules, tone anchors |
| Themes | Central theme, supporting themes |
| Tone & Voice | Comparable titles, mood board notes |
| Rules of the World | Zoe's conflict-detected world rules |

Characters section auto-populates from ProjectState `storyBible.characters[]`. New characters added here appear as autocomplete options in the Script tab. Default Writing Partner agent is section-aware: Casey for Characters, Themes, and Tone & Voice sections; Zoe for World and Rules of the World sections.

---

## Writing Partner

### Identity

Writing Partner is the head writer over the specialist team — not a generic assistant, not a named persona. Warm, direct, contextually intelligent. In the chat it presents as "Writing Partner" with a distinct amber avatar. Its voice adapts per tab: script doctor on the Script tab, story editor on Outline, pitch consultant on Synopsis.

This maps to the existing "Triage" agent in the HANDOFF architecture. Same underlying agent, new product identity.

### Collapsed Rail

- Avatar + breathing amber pulse when proactive
- Proactive triggers: user has not written in 20+ minutes (gentle check-in), contradiction detected across tabs, an agent in Writer's Room has touched something relevant
- Never interrupts mid-keystroke

### Expanded Chat Panel (300px)

- Header: "Writing Partner" + context chip (e.g., "The Long Hallway · Act 2 · Scene 14")
- Full message thread — persists per project, not per session, stored in `ProjectState.agents.writingPartner.transcript`
- `@Sam`, `@Oliver`, `@Maya`, `@Casey`, `@Zoe`, `@Marcus` mentions pull that specialist inline
  - Specialist response rendered in their accent color with their voice
  - "Go to [agent]'s room →" link appears after specialist response
  - Writing Partner resumes conversation after specialist turn
- Input: plain textarea, `Enter` to send, `Shift+Enter` newline

### Context Awareness

Writing Partner always reads:
- Current active tab
- Current scene number / section
- Full `ProjectState` (script scenes, beats, characters, outline, synopsis)
- `memory.decisions[]` — key choices the writer has locked in

Contradiction detection: flags when Story Bible character data conflicts with script scenes (e.g., character marked dead in Act 1 appears in Act 2 scene). Surfaces as a non-blocking callout in the chat, not a modal.

---

## Writer's Room

### Entry

Top-right tab. Replaces center content entirely. Left rail auto-collapses on entry — you are in deep agent mode, not writing mode. "← Back to Writing" breadcrumb persists in top bar while in Writer's Room, returning to the last active writing tab.

### Layout

Preserves the existing prototype design exactly:

- Left sidebar: persona icons with accent colors, click to switch rooms
- Center: specialist workspace (Oliver's beat board, Maya's voiceprint comparator, Casey's wound/want/need, etc.)
- Right: specialist chat panel — full conversation history, agent voice, specialist tools

### Connection to Writing Surface

- **"Insert into [tab]"** action on any agent output — pushes beat to Outline, character note to Story Bible, revised line to Script
- Any change made in Writer's Room writes to `ProjectState` immediately — Writing Partner knows about it next session
- Handoffs logged to `memory.handoffs[]`: `{ agent, action, timestamp, summary }`

---

## Shared Context Layer (ProjectState)

```
ProjectState {
  meta: {
    title, genre, format, wordCount, pageCount
  },
  script: {
    scenes[],         // scene heading, action blocks, dialogue, beatId link
    elements[],       // flat ordered list of all screenplay elements
    revisionHistory[]
  },
  outline: {
    beatType,         // "save-the-cat" | "hero-journey" | "custom"
    beats[]           // { id, name, description, notes, linkedSceneIds[] }
  },
  synopsis: {
    logline,
    sections: { setup, act1Break, midpoint, act2Break, resolution }
  },
  storyBible: {
    characters[],     // { name, role, wound, want, need, arc }
    world: {},
    themes[],
    rules[]
  },
  agents: {
    writingPartner: { transcript[], lastActive },
    sam:            { transcript[], lastTouched },
    casey:          { transcript[], lastTouched },
    oliver:         { transcript[], lastTouched },
    maya:           { transcript[], lastTouched },
    zoe:            { transcript[], lastTouched },
    marcus:         { transcript[], lastTouched }
  },
  memory: {
    decisions[],      // { text, timestamp, tabContext }
    flags[],          // { type, description, resolved }
    handoffs[]        // { agent, action, timestamp, summary }
  }
}
```

**Cross-tab linkages:**
- Outline beats → Script scenes via `beatId`
- Story Bible characters → Script character name autocomplete
- Synopsis sections ← generated from Outline beats + Script scenes
- All agent workrooms read from same ProjectState slice, write back to it

**Persistence:** localStorage (matching existing prototype). Backend swap deferred to HANDOFF Phase 1.

**Schema versioning:** ProjectState must include `schemaVersion: number` (start at `1`) as a top-level field. On app load, compare stored `schemaVersion` to current. If lower, run a migration function before mounting. Pattern:

```ts
function migrateState(raw: unknown): ProjectState {
  const version = (raw as any)?.schemaVersion ?? 0
  let state = raw as any
  if (version < 1) state = migrateV0toV1(state)
  // if (version < 2) state = migrateV1toV2(state)
  return state
}
```

Add a migration step here every time the ProjectState shape changes. Never mutate stored data without bumping `schemaVersion`.

---

## Aesthetic Direction: "The Night Desk"

A writer at 2am. The script page is the light source.

### Typography

| Use | Font | Weight |
|---|---|---|
| Script content | Courier Prime | 400 |
| UI display / headers | Fraunces | 300–600 (variable) |
| Metadata / counts / labels | DM Mono | 400 |
| Chat / body copy | Lora | 400 |

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `hsl(220 13% 9%)` | App background |
| `--surface` | `hsl(220 13% 12%)` | Cards, panels |
| `--fg` | `hsl(220 10% 88%)` | Primary text |
| `--fg-muted` | `hsl(220 10% 50%)` | Secondary text |
| `--script-page` | `#F5F2EC` | Script page background |
| `--wp-amber` | `hsl(38 90% 68%)` | Writing Partner accent |
| `--primary` | `hsl(260 100% 80%)` | App primary (existing) |
| Persona accents | (existing) | Sam amber, Casey ocean, Oliver sage, etc. |

Grain texture overlay on `--bg`: SVG noise filter, 4% opacity. Adds depth without distraction.

### Motion

| Interaction | Animation |
|---|---|
| Tab switch | Script page slides in from right, 200ms ease-out |
| Writing Partner expand | Panel slides from left, surface pushes right, 180ms |
| Writing Partner collapse | Reverse, 150ms |
| Script page load | Fade up from transparent, 300ms |
| Pulse dot (idle Writing Partner) | Breathing scale + opacity, 3s loop, amber |
| Page glow | Static `box-shadow`, warm amber, not animated |

### The Unforgettable Detail

The script page casts warm light onto the dark background:
```css
box-shadow: 
  0 0 0 1px hsla(38, 30%, 60%, 0.08),
  0 8px 48px hsla(38, 60%, 50%, 0.12),
  0 32px 96px hsla(38, 40%, 40%, 0.08);
```
The page is the lamp. Everything else is the room.

---

## Implementation Notes

- Build on existing React + Vite stack (`src/` directory)
- Screenplay editor: **Tiptap** (recommended over ProseMirror — better DX, same power). Custom extension for screenplay element cycling.
- **Tiptap element storage: paragraph attributes, not custom node types.** All screenplay elements are paragraphs with an `elementType` attribute (`"scene-heading" | "action" | "character" | "dialogue" | "parenthetical" | "transition"`). Custom node types only if strict document semantics become necessary (e.g., node-specific marks or commands that differ per element type). For now, simpler is correct.
- Structured doc tabs: controlled form components, no editor library needed
- Writing Partner: uses existing `bridge.invoke()` pattern from `src/lib/bridge.js`
- Do NOT rewrite existing workspace components — Writer's Room wraps them as-is
- Keyboard shortcuts: `⌘\` (panel toggle), `⌘1-4` (writing tabs), `⌘5` (Writer's Room), `⌘K` (command palette), `Tab`/`Shift+Tab` (screenplay element cycling)

### Known Risks

**Risk 1 — Screenplay editor scope creep.** The Tiptap custom extension (element cycling, uppercase-on-commit, scene numbering, autocomplete, keyboard behavior) is the highest-complexity piece. Implement against acceptance tests above; don't gold-plate. Phase 3–4 per recommended phasing.

**Risk 2 — Shell state complexity.** Rail open/closed (per tab), focus mode, Writer's Room mode, and page-centered layout must be modeled in a single explicit shell state machine early. Define `ShellState { activeTab, writerRoomActive, panelOpen, focusMode }` before building individual components.

**Risk 3 — ProjectState coupling.** All tabs and agents writing directly to ProjectState will become brittle without disciplined update helpers. Define a `useProjectState` hook with typed update actions (not direct mutation) before any component reads/writes state.

---

## Out of Scope (this spec)

- Real LLM backend (HANDOFF Phase 1–2)
- Multi-project picker (HANDOFF Phase 6)
- Mobile / responsive (HANDOFF Phase 6)
- Light mode (HANDOFF Phase 6)
- Staged Reading, Voice War Room, other future modules (HANDOFF Phase 5)
