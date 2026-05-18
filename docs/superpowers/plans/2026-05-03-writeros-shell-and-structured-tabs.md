# WriterOS Shell + Structured Tabs — Implementation Plan (Part 1 of 3)

> **Historical note (2026-05-18):** This plan records the initial shell and structured-tab implementation. Do not use its Synopsis, Outline, or Story Bible form-field instructions as current product requirements. Current non-script surface intent is plain-language story assessment with hidden professional structure; see `docs/product/README.md` and `docs/product/outline-story-coach-redesign-prd.md`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Night Desk shell (top nav, collapsible left rail, focus mode), ProjectState with schema versioning, and the three structured document tabs (Synopsis, Outline, Story Bible).

**Architecture:** React + Vite app. A `useShellState` hook drives layout mode. A `useProjectState` hook owns all document state with localStorage persistence and schemaVersion-based migration. Structured tabs are controlled form components — no editor library needed. Script tab is a placeholder in this plan; implemented in Plan 2.

**Tech Stack:** React 18, Vite, Vitest + @testing-library/react, Google Fonts (Fraunces, DM Mono, Lora, Courier Prime)

**Spec:** `docs/superpowers/specs/2026-05-03-writeros-ui-design.md`

---

## Prerequisites

- [ ] Clone repo: `git clone https://github.com/notboringentertainment/WriterOS.git && cd WriterOS`
- [ ] Install deps: `npm install`
- [ ] Verify existing app runs: `npm run dev` — should open on localhost

---

## File Map

```
src/
  lib/
    projectState.js         NEW — ProjectState shape, defaults, migration, save/load
    shellState.js           NEW — ShellState shape, defaults, useShellState hook
    useProjectState.js      NEW — React hook wrapping projectState with typed updaters
  styles/
    globals.css             MODIFY — Night Desk CSS vars, font imports
  components/
    shell/
      TopBar.jsx            NEW — logo, writing tabs, project title, Writer's Room, ⌘K
      LeftRail.jsx          NEW — collapsed (48px) / expanded (300px) Writing Partner rail
      Shell.jsx             NEW — root layout: TopBar + LeftRail + center content
    writing/
      SynopsisTab.jsx       NEW — 6-section guided synopsis form
      OutlineTab.jsx        NEW — Save the Cat beat sheet, drag handles, linked scenes
      StoryBibleTab.jsx     NEW — Characters, World, Themes, Tone, Rules sections
    shared/
      GuidedSection.jsx     NEW — label + collapsible guidance note + textarea
      BeatCard.jsx          NEW — individual beat row in outline
      CharacterCard.jsx     NEW — individual character block in story bible
  App.jsx                   MODIFY — wire Shell + tab routing
tests/
  lib/
    projectState.test.js    NEW
    shellState.test.js      NEW
  components/
    TopBar.test.jsx         NEW
    LeftRail.test.jsx       NEW
    SynopsisTab.test.jsx    NEW
    OutlineTab.test.jsx     NEW
    StoryBibleTab.test.jsx  NEW
```

---

## Task 1: Test Infrastructure

**Files:**
- Modify: `vite.config.js`
- Modify: `package.json`
- Create: `tests/setup.js`

- [ ] **Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Update `vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
})
```

- [ ] **Create `tests/setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Add test script to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Verify test runner works**

```bash
npm run test:run
```
Expected: "No test files found" (not an error — just no tests yet)

- [ ] **Commit**

```bash
git add vite.config.js package.json tests/setup.js package-lock.json
git commit -m "chore: add vitest + testing-library test infrastructure"
```

---

## Task 2: ProjectState — Shape, Defaults, Migration

**Files:**
- Create: `src/lib/projectState.js`
- Create: `tests/lib/projectState.test.js`

- [ ] **Write failing tests**

```js
// tests/lib/projectState.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  defaultProjectState,
  migrateState,
  saveProjectState,
  loadProjectState,
} from '../../src/lib/projectState.js'

describe('defaultProjectState', () => {
  it('has schemaVersion equal to CURRENT_SCHEMA_VERSION', () => {
    expect(defaultProjectState().schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('has all required top-level keys', () => {
    const state = defaultProjectState()
    expect(state).toMatchObject({
      meta: expect.any(Object),
      script: expect.any(Object),
      outline: expect.any(Object),
      synopsis: expect.any(Object),
      storyBible: expect.any(Object),
      agents: expect.any(Object),
      memory: expect.any(Object),
    })
  })

  it('outline has 15 save-the-cat beats by default', () => {
    expect(defaultProjectState().outline.beats).toHaveLength(15)
  })
})

describe('migrateState', () => {
  it('returns default state for null input', () => {
    const result = migrateState(null)
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('returns default state for empty object', () => {
    const result = migrateState({})
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('passes through valid state at current version', () => {
    const state = defaultProjectState()
    state.meta.title = 'My Script'
    const result = migrateState(state)
    expect(result.meta.title).toBe('My Script')
  })
})

describe('saveProjectState / loadProjectState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips state through localStorage', () => {
    const state = defaultProjectState()
    state.meta.title = 'Test Script'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.meta.title).toBe('Test Script')
  })

  it('loadProjectState returns default state when nothing stored', () => {
    const loaded = loadProjectState()
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/projectState.test.js
```
Expected: FAIL — "Cannot find module '../../src/lib/projectState.js'"

- [ ] **Create `src/lib/projectState.js`**

```js
export const CURRENT_SCHEMA_VERSION = 1
const STORAGE_KEY = 'writeros_project_state'

const SAVE_THE_CAT_BEATS = [
  { id: 'opening-image',   name: 'Opening Image',       description: 'A single scene that captures the "before" state of your story — tone, mood, world.' },
  { id: 'theme-stated',    name: 'Theme Stated',         description: 'Someone (often not the hero) states what the story is really about. The hero doesn\'t get it yet.' },
  { id: 'set-up',          name: 'Set-Up',               description: 'Introduce the hero in their world. Establish what needs fixing — their flaw, their need.' },
  { id: 'catalyst',        name: 'Catalyst',             description: 'The inciting incident. Something happens that disrupts the hero\'s world. No going back.' },
  { id: 'debate',          name: 'Debate',               description: 'The hero hesitates. Should they take the leap? Internal or external conflict about crossing the threshold.' },
  { id: 'break-into-two',  name: 'Break into Two',       description: 'The hero makes a choice and enters Act Two. The new world begins. Thesis vs. antithesis.' },
  { id: 'b-story',         name: 'B Story',              description: 'A new character or relationship is introduced. Often the love story; always carries the theme.' },
  { id: 'fun-and-games',   name: 'Fun and Games',        description: 'The promise of the premise. What the audience came to see. The hero tests the new world.' },
  { id: 'midpoint',        name: 'Midpoint',             description: 'A false victory or false defeat. Stakes are raised. Hero commits fully — no more playing around.' },
  { id: 'bad-guys-close',  name: 'Bad Guys Close In',    description: 'Internal and external forces push back against the hero. Team starts to fall apart.' },
  { id: 'all-is-lost',     name: 'All Is Lost',          description: 'The opposite of the Midpoint. The hero\'s lowest point. Often a death — literal or symbolic.' },
  { id: 'dark-night',      name: 'Dark Night of the Soul', description: 'The hero wallows. Where did I go wrong? The darkest moment before the dawn.' },
  { id: 'break-into-three', name: 'Break into Three',    description: 'The solution. Hero synthesizes A Story and B Story lessons to find the answer.' },
  { id: 'finale',          name: 'Finale',               description: 'Hero executes the plan, defeats antagonist, changes the world. The thesis wins.' },
  { id: 'final-image',     name: 'Final Image',          description: 'Mirror of the Opening Image. Prove the world has changed — and so has the hero.' },
]

export function defaultProjectState() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { title: 'Untitled Project', genre: '', format: 'feature', wordCount: 0, pageCount: 0 },
    script: { scenes: [], elements: [], revisionHistory: [] },
    outline: {
      beatType: 'save-the-cat',
      beats: SAVE_THE_CAT_BEATS.map(b => ({ ...b, notes: '', linkedSceneIds: [] })),
    },
    synopsis: {
      logline: '',
      sections: { setup: '', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
    },
    storyBible: {
      characters: [],
      world: { setting: '', toneAnchors: '', voiceNotes: '' },
      themes: '',
      rules: '',
    },
    agents: {
      writingPartner: { transcript: [], lastActive: null },
      sam:    { transcript: [], lastTouched: null },
      casey:  { transcript: [], lastTouched: null },
      oliver: { transcript: [], lastTouched: null },
      maya:   { transcript: [], lastTouched: null },
      zoe:    { transcript: [], lastTouched: null },
      marcus: { transcript: [], lastTouched: null },
    },
    memory: { decisions: [], flags: [], handoffs: [] },
  }
}

export function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return defaultProjectState()
  const version = raw.schemaVersion ?? 0
  let state = { ...raw }
  // future migrations go here:
  // if (version < 2) state = migrateV1toV2(state)
  state.schemaVersion = CURRENT_SCHEMA_VERSION
  // merge any missing top-level keys from default (safe forward compat)
  const defaults = defaultProjectState()
  for (const key of Object.keys(defaults)) {
    if (!(key in state)) state[key] = defaults[key]
  }
  return state
}

export function saveProjectState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadProjectState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return migrateState(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultProjectState()
  }
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/projectState.test.js
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/lib/projectState.js tests/lib/projectState.test.js
git commit -m "feat: ProjectState shape, defaults, migration, localStorage persistence"
```

---

## Task 3: useProjectState Hook

**Files:**
- Create: `src/lib/useProjectState.js`

- [ ] **Write failing tests**

```js
// tests/lib/useProjectState.test.js (add to existing file or new)
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectState } from '../../src/lib/useProjectState.js'

beforeEach(() => localStorage.clear())

describe('useProjectState', () => {
  it('returns state with default title on first load', () => {
    const { result } = renderHook(() => useProjectState())
    expect(result.current.state.meta.title).toBe('Untitled Project')
  })

  it('setMeta updates meta fields', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setMeta({ title: 'My Film' }))
    expect(result.current.state.meta.title).toBe('My Film')
  })

  it('setSynopsisSection updates one synopsis section', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisSection('logline', 'A hero rises.'))
    expect(result.current.state.synopsis.logline).toBe('A hero rises.')
  })

  it('setBeat updates a single beat by id', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setBeat('midpoint', { notes: 'Hero wins battle, loses war' }))
    const midpoint = result.current.state.outline.beats.find(b => b.id === 'midpoint')
    expect(midpoint.notes).toBe('Hero wins battle, loses war')
  })

  it('addCharacter appends to storyBible.characters', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.addCharacter({ name: 'Alex', role: 'Protagonist', wound: '', want: '', need: '', arc: '' }))
    expect(result.current.state.storyBible.characters).toHaveLength(1)
    expect(result.current.state.storyBible.characters[0].name).toBe('Alex')
  })

  it('persists state to localStorage on update', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setMeta({ title: 'Persisted' }))
    const stored = JSON.parse(localStorage.getItem('writeros_project_state'))
    expect(stored.meta.title).toBe('Persisted')
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/useProjectState.test.js
```
Expected: FAIL — module not found

- [ ] **Create `src/lib/useProjectState.js`**

```js
import { useState, useCallback } from 'react'
import { loadProjectState, saveProjectState } from './projectState.js'

export function useProjectState() {
  const [state, setState] = useState(() => loadProjectState())

  const update = useCallback((updater) => {
    setState(prev => {
      const next = updater(prev)
      saveProjectState(next)
      return next
    })
  }, [])

  const setMeta = useCallback((patch) => {
    update(s => ({ ...s, meta: { ...s.meta, ...patch } }))
  }, [update])

  const setSynopsisSection = useCallback((key, value) => {
    update(s => ({
      ...s,
      synopsis: {
        ...s.synopsis,
        ...(key === 'logline'
          ? { logline: value }
          : { sections: { ...s.synopsis.sections, [key]: value } }),
      },
    }))
  }, [update])

  const setBeat = useCallback((beatId, patch) => {
    update(s => ({
      ...s,
      outline: {
        ...s.outline,
        beats: s.outline.beats.map(b => b.id === beatId ? { ...b, ...patch } : b),
      },
    }))
  }, [update])

  const reorderBeats = useCallback((fromIndex, toIndex) => {
    update(s => {
      const beats = [...s.outline.beats]
      const [moved] = beats.splice(fromIndex, 1)
      beats.splice(toIndex, 0, moved)
      return { ...s, outline: { ...s.outline, beats } }
    })
  }, [update])

  const addCharacter = useCallback((character) => {
    update(s => ({
      ...s,
      storyBible: {
        ...s.storyBible,
        characters: [...s.storyBible.characters, { id: crypto.randomUUID(), ...character }],
      },
    }))
  }, [update])

  const updateCharacter = useCallback((id, patch) => {
    update(s => ({
      ...s,
      storyBible: {
        ...s.storyBible,
        characters: s.storyBible.characters.map(c => c.id === id ? { ...c, ...patch } : c),
      },
    }))
  }, [update])

  const setWorld = useCallback((patch) => {
    update(s => ({
      ...s,
      storyBible: { ...s.storyBible, world: { ...s.storyBible.world, ...patch } },
    }))
  }, [update])

  const setThemes = useCallback((value) => {
    update(s => ({ ...s, storyBible: { ...s.storyBible, themes: value } }))
  }, [update])

  const setRules = useCallback((value) => {
    update(s => ({ ...s, storyBible: { ...s.storyBible, rules: value } }))
  }, [update])

  return {
    state,
    setMeta,
    setSynopsisSection,
    setBeat,
    reorderBeats,
    addCharacter,
    updateCharacter,
    setWorld,
    setThemes,
    setRules,
  }
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/useProjectState.test.js
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/lib/useProjectState.js tests/lib/useProjectState.test.js
git commit -m "feat: useProjectState hook with typed updaters and localStorage persistence"
```

---

## Task 4: ShellState Hook

**Files:**
- Create: `src/lib/shellState.js`
- Create: `tests/lib/shellState.test.js`

- [ ] **Write failing tests**

```js
// tests/lib/shellState.test.js
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShellState } from '../../src/lib/shellState.js'

describe('useShellState', () => {
  it('starts on script tab with panel closed', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.activeTab).toBe('script')
    expect(result.current.panelOpen).toBe(false)
    expect(result.current.focusMode).toBe(false)
    expect(result.current.writersRoomActive).toBe(false)
  })

  it('setActiveTab switches tab and closes writersRoom', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setActiveTab('synopsis'))
    expect(result.current.activeTab).toBe('synopsis')
    expect(result.current.writersRoomActive).toBe(false)
  })

  it('entering writersRoom collapses the rail panel', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.togglePanel()) // open panel
    act(() => result.current.enterWritersRoom())
    expect(result.current.writersRoomActive).toBe(true)
    expect(result.current.panelOpen).toBe(false)
  })

  it('exitWritersRoom returns to last active writing tab', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setActiveTab('outline'))
    act(() => result.current.enterWritersRoom())
    act(() => result.current.exitWritersRoom())
    expect(result.current.writersRoomActive).toBe(false)
    expect(result.current.activeTab).toBe('outline')
  })

  it('togglePanel flips panel open state', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.panelOpen).toBe(false)
    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(true)
    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(false)
  })

  it('panel state is remembered per tab', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.togglePanel()) // open on script
    act(() => result.current.setActiveTab('synopsis')) // switch — synopsis starts closed
    expect(result.current.panelOpen).toBe(false)
    act(() => result.current.setActiveTab('script')) // back to script — still open
    expect(result.current.panelOpen).toBe(true)
  })

  it('toggleFocusMode flips focus mode', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(true)
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(false)
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/shellState.test.js
```
Expected: FAIL — module not found

- [ ] **Create `src/lib/shellState.js`**

```js
import { useState, useCallback } from 'react'

const WRITING_TABS = ['script', 'story-bible', 'outline', 'synopsis']

export function useShellState() {
  const [activeTab, setActiveTabRaw] = useState('script')
  const [writersRoomActive, setWritersRoomActive] = useState(false)
  const [panelByTab, setPanelByTab] = useState({ script: false, 'story-bible': false, outline: false, synopsis: false })
  const [focusMode, setFocusMode] = useState(false)

  const panelOpen = panelByTab[activeTab] ?? false

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab)
    setWritersRoomActive(false)
  }, [])

  const togglePanel = useCallback(() => {
    setPanelByTab(prev => ({ ...prev, [activeTab]: !prev[activeTab] }))
  }, [activeTab])

  const enterWritersRoom = useCallback(() => {
    setPanelByTab(prev => ({ ...prev, [activeTab]: false }))
    setWritersRoomActive(true)
  }, [activeTab])

  const exitWritersRoom = useCallback(() => {
    setWritersRoomActive(false)
  }, [])

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => !prev)
  }, [])

  return {
    activeTab,
    writersRoomActive,
    panelOpen,
    focusMode,
    setActiveTab,
    togglePanel,
    enterWritersRoom,
    exitWritersRoom,
    toggleFocusMode,
  }
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/shellState.test.js
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/lib/shellState.js tests/lib/shellState.test.js
git commit -m "feat: useShellState hook — tab routing, rail panel, focus mode, Writer's Room"
```

---

## Task 5: Night Desk Visual System

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `index.html`

- [ ] **Add Google Fonts to `index.html`**

In the `<head>` section, add before any existing style links:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@400&family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Lora:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Replace `src/styles/globals.css` content**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Night Desk color tokens */
  --bg:           hsl(220 13% 9%);
  --surface:      hsl(220 13% 12%);
  --surface-2:    hsl(220 13% 15%);
  --border:       hsl(220 13% 20%);
  --fg:           hsl(220 10% 88%);
  --fg-muted:     hsl(220 10% 50%);
  --fg-subtle:    hsl(220 10% 35%);

  /* Script page */
  --script-page:  #F5F2EC;
  --script-text:  #1a1814;

  /* Writing Partner */
  --wp-amber:     hsl(38 90% 68%);
  --wp-amber-dim: hsl(38 60% 45%);

  /* App primary */
  --primary:      hsl(260 100% 80%);
  --primary-dim:  hsl(260 60% 50%);

  /* Persona accents */
  --sam:    hsl(45 100% 75%);
  --casey:  hsl(200 100% 75%);
  --oliver: hsl(120 60% 70%);
  --maya:   hsl(330 80% 75%);
  --zoe:    hsl(270 70% 75%);
  --marcus: hsl(15 80% 70%);

  /* Typography */
  --font-display: 'Fraunces', Georgia, serif;
  --font-body:    'Lora', Georgia, serif;
  --font-mono:    'DM Mono', 'Courier New', monospace;
  --font-script:  'Courier Prime', 'Courier New', monospace;

  /* Layout */
  --topbar-height:     48px;
  --rail-collapsed:    48px;
  --rail-expanded:     300px;
  --rail-transition:   180ms ease-out;
  --tab-transition:    200ms ease-out;
}

html, body, #root {
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

/* Grain texture overlay */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}

button { cursor: pointer; }
textarea { resize: vertical; }
```

- [ ] **Start dev server and verify dark background loads**

```bash
npm run dev
```
Open browser. Expected: dark `hsl(220 13% 9%)` background, grain texture visible at low opacity.

- [ ] **Commit**

```bash
git add src/styles/globals.css index.html
git commit -m "feat: Night Desk CSS vars, font imports, grain texture overlay"
```

---

## Task 6: TopBar Component

**Files:**
- Create: `src/components/shell/TopBar.jsx`
- Create: `tests/components/TopBar.test.jsx`

- [ ] **Write failing tests**

```jsx
// tests/components/TopBar.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '../../src/components/shell/TopBar.jsx'

const defaultProps = {
  activeTab: 'script',
  writersRoomActive: false,
  projectTitle: 'The Long Hallway',
  onTabChange: vi.fn(),
  onWritersRoom: vi.fn(),
}

describe('TopBar', () => {
  it('renders all four writing tabs', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('Script')).toBeInTheDocument()
    expect(screen.getByText('Story Bible')).toBeInTheDocument()
    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByText('Synopsis')).toBeInTheDocument()
  })

  it('renders Writer\'s Room tab', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText("Writer's Room")).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    render(<TopBar {...defaultProps} activeTab="outline" />)
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Script' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabChange with tab id when writing tab clicked', () => {
    const onTabChange = vi.fn()
    render(<TopBar {...defaultProps} onTabChange={onTabChange} />)
    fireEvent.click(screen.getByText('Synopsis'))
    expect(onTabChange).toHaveBeenCalledWith('synopsis')
  })

  it('calls onWritersRoom when Writer\'s Room clicked', () => {
    const onWritersRoom = vi.fn()
    render(<TopBar {...defaultProps} onWritersRoom={onWritersRoom} />)
    fireEvent.click(screen.getByText("Writer's Room"))
    expect(onWritersRoom).toHaveBeenCalled()
  })

  it('shows project title', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('The Long Hallway')).toBeInTheDocument()
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/components/TopBar.test.jsx
```
Expected: FAIL — module not found

- [ ] **Create `src/components/shell/TopBar.jsx`**

```jsx
const WRITING_TABS = [
  { id: 'script',      label: 'Script' },
  { id: 'story-bible', label: 'Story Bible' },
  { id: 'outline',     label: 'Outline' },
  { id: 'synopsis',    label: 'Synopsis' },
]

export function TopBar({ activeTab, writersRoomActive, projectTitle, onTabChange, onWritersRoom }) {
  return (
    <header style={styles.bar}>
      <div style={styles.logo}>
        <span style={styles.logoText}>WriterOS</span>
      </div>

      <nav role="tablist" style={styles.tabs}>
        {WRITING_TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id && !writersRoomActive}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id && !writersRoomActive ? styles.tabActive : {}),
            }}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div style={styles.projectTitle}>
        {projectTitle}
      </div>

      <div style={styles.rightZone}>
        <button
          role="tab"
          aria-selected={writersRoomActive}
          style={{ ...styles.writersRoom, ...(writersRoomActive ? styles.writersRoomActive : {}) }}
          onClick={onWritersRoom}
        >
          Writer's Room
        </button>
        <button style={styles.cmdK} title="⌘K">⌘K</button>
      </div>
    </header>
  )
}

const styles = {
  bar: {
    height: 'var(--topbar-height)',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 16px',
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  logo: { flexShrink: 0, marginRight: 8 },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    fontSize: 15,
    color: 'var(--fg)',
    letterSpacing: '-0.02em',
  },
  tabs: { display: 'flex', gap: 2 },
  tab: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 400,
    padding: '4px 12px',
    cursor: 'pointer',
    transition: 'color 120ms, border-color 120ms',
  },
  tabActive: {
    color: 'var(--fg)',
    borderColor: 'var(--border)',
    background: 'var(--surface-2)',
  },
  projectTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    pointerEvents: 'none',
  },
  rightZone: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  writersRoom: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '4px 12px',
    cursor: 'pointer',
  },
  writersRoomActive: {
    color: 'var(--primary)',
    borderColor: 'var(--primary-dim)',
    background: 'hsla(260 100% 80% / 0.08)',
  },
  cmdK: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
  },
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/components/TopBar.test.jsx
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/shell/TopBar.jsx tests/components/TopBar.test.jsx
git commit -m "feat: TopBar component — writing tabs, Writer's Room, project title, ⌘K"
```

---

## Task 7: LeftRail Component

**Files:**
- Create: `src/components/shell/LeftRail.jsx`
- Create: `tests/components/LeftRail.test.jsx`

- [ ] **Write failing tests**

```jsx
// tests/components/LeftRail.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeftRail } from '../../src/components/shell/LeftRail.jsx'

const defaultProps = {
  open: false,
  onToggle: vi.fn(),
  projectTitle: 'The Long Hallway',
  activeTab: 'script',
}

describe('LeftRail', () => {
  it('renders Writing Partner avatar in collapsed state', () => {
    render(<LeftRail {...defaultProps} open={false} />)
    expect(screen.getByTitle('Writing Partner')).toBeInTheDocument()
  })

  it('calls onToggle when avatar clicked', () => {
    const onToggle = vi.fn()
    render(<LeftRail {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByTitle('Writing Partner'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('shows chat panel when open', () => {
    render(<LeftRail {...defaultProps} open={true} />)
    expect(screen.getByText('Writing Partner')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument()
  })

  it('does not show chat panel when closed', () => {
    render(<LeftRail {...defaultProps} open={false} />)
    expect(screen.queryByPlaceholderText(/message/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/components/LeftRail.test.jsx
```
Expected: FAIL — module not found

- [ ] **Create `src/components/shell/LeftRail.jsx`**

```jsx
import { useState, useEffect } from 'react'

export function LeftRail({ open, onToggle, projectTitle, activeTab }) {
  const [hasProactive, setHasProactive] = useState(false)

  // Pulse after 20 min of no toggle — placeholder for real idle detection
  useEffect(() => {
    const timer = setTimeout(() => setHasProactive(true), 20 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <aside
      style={{
        ...styles.rail,
        width: open ? 'var(--rail-expanded)' : 'var(--rail-collapsed)',
      }}
    >
      {/* Avatar button — always visible */}
      <button
        title="Writing Partner"
        onClick={onToggle}
        style={styles.avatar}
      >
        <span style={styles.avatarInner}>WP</span>
        {hasProactive && !open && (
          <span style={styles.pulse} aria-hidden="true" />
        )}
        {!open && (
          <span style={styles.shortcutHint}>⌘\</span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Writing Partner</span>
            <span style={styles.contextChip}>{projectTitle}</span>
          </div>
          <div style={styles.transcript} aria-label="Writing Partner conversation">
            <p style={styles.emptyState}>
              Ask anything about your project, or <code>@Oliver</code>, <code>@Sam</code>, <code>@Maya</code>…
            </p>
          </div>
          <div style={styles.inputRow}>
            <textarea
              placeholder="Message Writing Partner…"
              style={styles.input}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  // Writing Partner send — wired in Plan 3
                }
              }}
            />
          </div>
        </div>
      )}
    </aside>
  )
}

const styles = {
  rail: {
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: `width var(--rail-transition)`,
    overflow: 'hidden',
    position: 'relative',
  },
  avatar: {
    width: 'var(--rail-collapsed)',
    height: 48,
    background: 'none',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    cursor: 'pointer',
  },
  avatarInner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--wp-amber)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: '#1a1200',
  },
  pulse: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--wp-amber)',
    animation: 'wp-pulse 3s ease-in-out infinite',
  },
  shortcutHint: {
    position: 'absolute',
    bottom: 4,
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--fg-subtle)',
    pointerEvents: 'none',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    paddingTop: 0,
  },
  panelHeader: {
    padding: '12px 16px 8px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  panelTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--wp-amber)',
  },
  contextChip: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
  },
  transcript: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  emptyState: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    lineHeight: 1.6,
    fontStyle: 'italic',
  },
  inputRow: {
    padding: '8px 12px 12px',
    borderTop: '1px solid var(--border)',
  },
  input: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    lineHeight: 1.5,
  },
}
```

Add the pulse animation to `globals.css` (append):

```css
@keyframes wp-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%       { opacity: 1;   transform: scale(1.1);  }
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/components/LeftRail.test.jsx
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/shell/LeftRail.jsx tests/components/LeftRail.test.jsx src/styles/globals.css
git commit -m "feat: LeftRail component — collapsed avatar, expanded Writing Partner panel, amber pulse"
```

---

## Task 8: Shell Layout

**Files:**
- Create: `src/components/shell/Shell.jsx`

- [ ] **Create `src/components/shell/Shell.jsx`**

No tests needed for pure layout — verify visually in dev server.

```jsx
import { useEffect } from 'react'
import { TopBar } from './TopBar.jsx'
import { LeftRail } from './LeftRail.jsx'

export function Shell({ shellState, projectTitle, children }) {
  const {
    activeTab, writersRoomActive, panelOpen, focusMode,
    setActiveTab, togglePanel, enterWritersRoom, exitWritersRoom, toggleFocusMode,
  } = shellState

  // ⌘\ keyboard shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        togglePanel()
      }
      if (e.key === 'Escape' && focusMode) {
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePanel, focusMode, toggleFocusMode])

  const handleWritersRoom = () => {
    if (writersRoomActive) exitWritersRoom()
    else enterWritersRoom()
  }

  return (
    <div style={styles.root}>
      {!focusMode && (
        <TopBar
          activeTab={activeTab}
          writersRoomActive={writersRoomActive}
          projectTitle={projectTitle}
          onTabChange={setActiveTab}
          onWritersRoom={handleWritersRoom}
        />
      )}
      <div style={styles.body}>
        {!writersRoomActive && (
          <LeftRail
            open={panelOpen}
            onToggle={togglePanel}
            projectTitle={projectTitle}
            activeTab={activeTab}
          />
        )}
        <main style={styles.center}>
          {children}
        </main>
      </div>
    </div>
  )
}

const styles = {
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
  },
}
```

- [ ] **Verify in dev server: run app, confirm topbar + rail render**

```bash
npm run dev
```
Navigate to localhost. Expected: dark background, topbar with tabs, collapsed left rail with WP avatar.

- [ ] **Commit**

```bash
git add src/components/shell/Shell.jsx
git commit -m "feat: Shell layout — topbar + left rail + center, keyboard shortcuts ⌘\ and Esc"
```

---

## Task 9: GuidedSection Primitive

**Files:**
- Create: `src/components/shared/GuidedSection.jsx`
- Create: `tests/components/GuidedSection.test.jsx`

- [ ] **Write failing tests**

```jsx
// tests/components/GuidedSection.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedSection } from '../../src/components/shared/GuidedSection.jsx'

describe('GuidedSection', () => {
  it('renders the label', () => {
    render(<GuidedSection label="Logline" guidance="1-2 sentences" value="" onChange={vi.fn()} />)
    expect(screen.getByText('Logline')).toBeInTheDocument()
  })

  it('renders guidance text', () => {
    render(<GuidedSection label="Logline" guidance="1-2 sentences, character-driven" value="" onChange={vi.fn()} />)
    expect(screen.getByText('1-2 sentences, character-driven')).toBeInTheDocument()
  })

  it('calls onChange when textarea changes', () => {
    const onChange = vi.fn()
    render(<GuidedSection label="Logline" guidance="guidance" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A hero rises.' } })
    expect(onChange).toHaveBeenCalledWith('A hero rises.')
  })

  it('shows current value in textarea', () => {
    render(<GuidedSection label="Logline" guidance="guidance" value="A hero rises." onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('A hero rises.')
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/components/GuidedSection.test.jsx
```
Expected: FAIL — module not found

- [ ] **Create `src/components/shared/GuidedSection.jsx`**

```jsx
export function GuidedSection({ label, guidance, value, onChange, placeholder = '' }) {
  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
      </div>
      {guidance && (
        <p style={styles.guidance}>{guidance}</p>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || `Write your ${label.toLowerCase()}…`}
        style={styles.textarea}
        rows={4}
      />
    </div>
  )
}

const styles = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--fg)',
  },
  guidance: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  textarea: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.7,
    padding: '10px 14px',
    outline: 'none',
    transition: 'border-color 120ms',
  },
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/components/GuidedSection.test.jsx
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/shared/GuidedSection.jsx tests/components/GuidedSection.test.jsx
git commit -m "feat: GuidedSection primitive — label, guidance note, controlled textarea"
```

---

## Task 10: SynopsisTab

**Files:**
- Create: `src/components/writing/SynopsisTab.jsx`
- Create: `tests/components/SynopsisTab.test.jsx`

- [ ] **Write failing tests**

```jsx
// tests/components/SynopsisTab.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SynopsisTab } from '../../src/components/writing/SynopsisTab.jsx'

const defaultSynopsis = {
  logline: '',
  sections: { setup: '', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
}

describe('SynopsisTab', () => {
  it('renders all six section labels', () => {
    render(<SynopsisTab synopsis={defaultSynopsis} onUpdate={vi.fn()} />)
    expect(screen.getByText('Logline')).toBeInTheDocument()
    expect(screen.getByText('Setup')).toBeInTheDocument()
    expect(screen.getByText('Act One Break')).toBeInTheDocument()
    expect(screen.getByText('Midpoint')).toBeInTheDocument()
    expect(screen.getByText('Act Two Break')).toBeInTheDocument()
    expect(screen.getByText('Resolution')).toBeInTheDocument()
  })

  it('calls onUpdate with logline key when logline textarea changes', () => {
    const onUpdate = vi.fn()
    render(<SynopsisTab synopsis={defaultSynopsis} onUpdate={onUpdate} />)
    const textareas = screen.getAllByRole('textbox')
    fireEvent.change(textareas[0], { target: { value: 'A hero rises.' } })
    expect(onUpdate).toHaveBeenCalledWith('logline', 'A hero rises.')
  })

  it('shows existing synopsis values', () => {
    const synopsis = {
      logline: 'A detective confronts her past.',
      sections: { setup: 'Set in 1970s Chicago.', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
    }
    render(<SynopsisTab synopsis={synopsis} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('A detective confronts her past.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Set in 1970s Chicago.')).toBeInTheDocument()
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/components/SynopsisTab.test.jsx
```
Expected: FAIL — module not found

- [ ] **Create `src/components/writing/SynopsisTab.jsx`**

```jsx
import { GuidedSection } from '../shared/GuidedSection.jsx'

const SYNOPSIS_SECTIONS = [
  {
    key: 'logline',
    label: 'Logline',
    guidance: '1–2 sentences. Character + goal + obstacle + stakes. Present tense, third person.',
    placeholder: 'When [protagonist] discovers [inciting incident], they must [goal] before [stakes].',
  },
  {
    key: 'setup',
    label: 'Setup',
    guidance: 'Who is the protagonist? Where and when is this set? What is the inciting incident that disrupts their world?',
    placeholder: 'Establish the world and the protagonist\'s life before everything changes…',
  },
  {
    key: 'act1Break',
    label: 'Act One Break',
    guidance: 'The moment the protagonist commits to the journey. No going back. What is the decision, and what does it cost them?',
    placeholder: 'The protagonist chooses to…',
  },
  {
    key: 'midpoint',
    label: 'Midpoint',
    guidance: 'False victory or false defeat. Stakes escalate. The protagonist can no longer avoid the central conflict.',
    placeholder: 'Halfway through, it seems like…',
  },
  {
    key: 'act2Break',
    label: 'Act Two Break',
    guidance: 'All is lost. The protagonist\'s lowest moment — a death (literal or symbolic), a failure, a betrayal. How does it connect to their flaw?',
    placeholder: 'Everything falls apart when…',
  },
  {
    key: 'resolution',
    label: 'Resolution',
    guidance: 'How does the protagonist defeat the antagonist? How have they changed? What is the final image of the world?',
    placeholder: 'In the end…',
  },
]

export function SynopsisTab({ synopsis, onUpdate }) {
  const getValue = (key) =>
    key === 'logline' ? synopsis.logline : (synopsis.sections[key] ?? '')

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Synopsis</h2>
        <p style={styles.subtitle}>Industry standard: 1–3 pages, present tense, third person.</p>
      </div>
      <div style={styles.sections}>
        {SYNOPSIS_SECTIONS.map(section => (
          <GuidedSection
            key={section.key}
            label={section.label}
            guidance={section.guidance}
            placeholder={section.placeholder}
            value={getValue(section.key)}
            onChange={value => onUpdate(section.key, value)}
          />
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 24px 64px',
  },
  header: { marginBottom: 28 },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
  },
  sections: { display: 'flex', flexDirection: 'column', gap: 16 },
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/components/SynopsisTab.test.jsx
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/writing/SynopsisTab.jsx tests/components/SynopsisTab.test.jsx
git commit -m "feat: SynopsisTab — 6 guided sections with industry-standard guidance notes"
```

---

## Task 11: BeatCard + OutlineTab

**Files:**
- Create: `src/components/shared/BeatCard.jsx`
- Create: `src/components/writing/OutlineTab.jsx`
- Create: `tests/components/OutlineTab.test.jsx`

- [ ] **Write failing tests**

```jsx
// tests/components/OutlineTab.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutlineTab } from '../../src/components/writing/OutlineTab.jsx'
import { defaultProjectState } from '../../src/lib/projectState.js'

describe('OutlineTab', () => {
  const defaultOutline = defaultProjectState().outline

  it('renders all 15 Save the Cat beat names', () => {
    render(<OutlineTab outline={defaultOutline} onUpdateBeat={vi.fn()} onReorderBeats={vi.fn()} />)
    expect(screen.getByText('Opening Image')).toBeInTheDocument()
    expect(screen.getByText('Midpoint')).toBeInTheDocument()
    expect(screen.getByText('Final Image')).toBeInTheDocument()
  })

  it('calls onUpdateBeat when notes textarea changes', () => {
    const onUpdateBeat = vi.fn()
    render(<OutlineTab outline={defaultOutline} onUpdateBeat={onUpdateBeat} onReorderBeats={vi.fn()} />)
    const textareas = screen.getAllByRole('textbox')
    fireEvent.change(textareas[0], { target: { value: 'Hero is shown alone in rain.' } })
    expect(onUpdateBeat).toHaveBeenCalledWith('opening-image', { notes: 'Hero is shown alone in rain.' })
  })

  it('shows existing beat notes', () => {
    const outline = {
      ...defaultOutline,
      beats: defaultOutline.beats.map(b =>
        b.id === 'midpoint' ? { ...b, notes: 'Hero defeats henchman but loses ally.' } : b
      ),
    }
    render(<OutlineTab outline={outline} onUpdateBeat={vi.fn()} onReorderBeats={vi.fn()} />)
    expect(screen.getByDisplayValue('Hero defeats henchman but loses ally.')).toBeInTheDocument()
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/components/OutlineTab.test.jsx
```
Expected: FAIL — module not found

- [ ] **Create `src/components/shared/BeatCard.jsx`**

```jsx
export function BeatCard({ beat, onUpdate, index }) {
  return (
    <div style={styles.card}>
      <div style={styles.left}>
        <span style={styles.index}>{String(index + 1).padStart(2, '0')}</span>
        <div style={styles.drag} title="Drag to reorder" aria-hidden="true">⠿</div>
      </div>
      <div style={styles.body}>
        <div style={styles.beatName}>{beat.name}</div>
        <p style={styles.description}>{beat.description}</p>
        <textarea
          value={beat.notes}
          onChange={e => onUpdate(beat.id, { notes: e.target.value })}
          placeholder="Your notes for this beat…"
          style={styles.notes}
          rows={2}
        />
        {beat.linkedSceneIds.length > 0 && (
          <div style={styles.linkedScenes}>
            {beat.linkedSceneIds.map(id => (
              <span key={id} style={styles.sceneChip}>Scene {id}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px 16px 16px 8px',
    display: 'flex',
    gap: 12,
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    width: 28,
  },
  index: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  drag: {
    color: 'var(--fg-subtle)',
    fontSize: 14,
    cursor: 'grab',
    userSelect: 'none',
  },
  body: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },
  beatName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--fg)',
  },
  description: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  notes: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '8px 12px',
    lineHeight: 1.6,
    outline: 'none',
  },
  linkedScenes: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  sceneChip: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 6px',
    color: 'var(--fg-muted)',
  },
}
```

- [ ] **Create `src/components/writing/OutlineTab.jsx`**

```jsx
import { BeatCard } from '../shared/BeatCard.jsx'

export function OutlineTab({ outline, onUpdateBeat, onReorderBeats }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Outline</h2>
        <p style={styles.subtitle}>Save the Cat · 15 Beats</p>
      </div>
      <div style={styles.beats}>
        {outline.beats.map((beat, index) => (
          <BeatCard
            key={beat.id}
            beat={beat}
            index={index}
            onUpdate={onUpdateBeat}
          />
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 24px 64px',
  },
  header: { marginBottom: 28 },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--fg-muted)',
  },
  beats: { display: 'flex', flexDirection: 'column', gap: 12 },
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/components/OutlineTab.test.jsx
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/shared/BeatCard.jsx src/components/writing/OutlineTab.jsx tests/components/OutlineTab.test.jsx
git commit -m "feat: BeatCard + OutlineTab — 15-beat Save the Cat outline with notes and scene linking"
```

---

## Task 12: CharacterCard + StoryBibleTab

**Files:**
- Create: `src/components/shared/CharacterCard.jsx`
- Create: `src/components/writing/StoryBibleTab.jsx`
- Create: `tests/components/StoryBibleTab.test.jsx`

- [ ] **Write failing tests**

```jsx
// tests/components/StoryBibleTab.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryBibleTab } from '../../src/components/writing/StoryBibleTab.jsx'
import { defaultProjectState } from '../../src/lib/projectState.js'

describe('StoryBibleTab', () => {
  const defaultBible = defaultProjectState().storyBible

  const defaultProps = { onAddCharacter: vi.fn(), onUpdateCharacter: vi.fn(), onSetWorld: vi.fn(), onSetThemes: vi.fn(), onSetRules: vi.fn() }

  it('renders all five section headings', () => {
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} />)
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText('World')).toBeInTheDocument()
    expect(screen.getByText('Themes')).toBeInTheDocument()
    expect(screen.getByText('Tone & Voice')).toBeInTheDocument()
    expect(screen.getByText('Rules of the World')).toBeInTheDocument()
  })

  it('renders Add Character button', () => {
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} />)
    expect(screen.getByText('+ Add Character')).toBeInTheDocument()
  })

  it('calls onAddCharacter when button clicked', () => {
    const onAddCharacter = vi.fn()
    render(<StoryBibleTab storyBible={defaultBible} {...defaultProps} onAddCharacter={onAddCharacter} />)
    fireEvent.click(screen.getByText('+ Add Character'))
    expect(onAddCharacter).toHaveBeenCalledWith({ name: 'New Character', role: '', wound: '', want: '', need: '', arc: '' })
  })

  it('renders existing characters', () => {
    const bible = {
      ...defaultBible,
      characters: [{ id: '1', name: 'Elena', role: 'Protagonist', wound: 'Lost her daughter', want: 'Justice', need: 'Forgiveness', arc: 'Learns to let go' }],
    }
    render(<StoryBibleTab storyBible={bible} {...defaultProps} />)
    expect(screen.getByDisplayValue('Elena')).toBeInTheDocument()
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npm run test:run -- tests/components/StoryBibleTab.test.jsx
```
Expected: FAIL — module not found

- [ ] **Create `src/components/shared/CharacterCard.jsx`**

```jsx
export function CharacterCard({ character, onUpdate }) {
  const field = (key, label, placeholder) => (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      <input
        value={character[key]}
        onChange={e => onUpdate(character.id, { [key]: e.target.value })}
        placeholder={placeholder}
        style={styles.fieldInput}
      />
    </div>
  )

  return (
    <div style={styles.card}>
      <input
        value={character.name}
        onChange={e => onUpdate(character.id, { name: e.target.value })}
        style={styles.nameInput}
        placeholder="Character name"
      />
      <div style={styles.grid}>
        {field('role',  'Role',         'Protagonist, Antagonist, Ally…')}
        {field('wound', 'Wound',        'What broke them in the past?')}
        {field('want',  'Want',         'What do they think they need?')}
        {field('need',  'Need',         'What do they actually need?')}
        {field('arc',   'Arc',          'How do they change?')}
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
  },
  nameInput: {
    width: '100%',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 16,
    padding: '0 0 10px 0',
    marginBottom: 16,
    outline: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  fieldInput: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
  },
}
```

- [ ] **Create `src/components/writing/StoryBibleTab.jsx`**

```jsx
import { CharacterCard } from '../shared/CharacterCard.jsx'
import { GuidedSection } from '../shared/GuidedSection.jsx'

export function StoryBibleTab({ storyBible, onAddCharacter, onUpdateCharacter, onSetWorld, onSetThemes, onSetRules }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Story Bible</h2>
      </div>

      {/* Characters */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Characters</h3>
          <p style={styles.sectionHint}>Casey · Wound, Want, Need, Arc</p>
          <button
            style={styles.addBtn}
            onClick={() => onAddCharacter({ name: 'New Character', role: '', wound: '', want: '', need: '', arc: '' })}
          >
            + Add Character
          </button>
        </div>
        <div style={styles.cards}>
          {storyBible.characters.map(char => (
            <CharacterCard key={char.id} character={char} onUpdate={onUpdateCharacter} />
          ))}
        </div>
      </section>

      {/* World */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>World</h3>
          <p style={styles.sectionHint}>Zoe · Setting and tone anchors</p>
        </div>
        <GuidedSection
          label="Setting"
          guidance="Where and when does this story take place? What makes this world distinct?"
          value={storyBible.world.setting}
          onChange={v => onSetWorld({ setting: v })}
        />
        <GuidedSection
          label="Tone Anchors"
          guidance="2–4 comparable works that capture the tone. e.g. 'Chinatown meets No Country for Old Men.'"
          value={storyBible.world.toneAnchors}
          onChange={v => onSetWorld({ toneAnchors: v })}
        />
      </section>

      {/* Themes */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Themes</h3>
          <p style={styles.sectionHint}>Casey · What is this story really about?</p>
        </div>
        <GuidedSection
          label="Central Theme"
          guidance="One sentence. What truth does this story argue? What does the protagonist learn?"
          value={storyBible.themes}
          onChange={onSetThemes}
        />
      </section>

      {/* Tone & Voice */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Tone & Voice</h3>
          <p style={styles.sectionHint}>Casey · How does this story feel to read?</p>
        </div>
        <GuidedSection
          label="Voice Notes"
          guidance="Describe the narrative voice. Fast or slow? Spare or lush? Cold or warm? Any distinctive stylistic rules?"
          value={storyBible.world.voiceNotes}
          onChange={v => onSetWorld({ voiceNotes: v })}
        />
      </section>

      {/* Rules of the World */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Rules of the World</h3>
          <p style={styles.sectionHint}>Zoe · Internal logic and constraints</p>
        </div>
        <GuidedSection
          label="World Rules"
          guidance="List the rules that govern this world. For genre films: what can and can't happen? Violations break reader trust."
          value={storyBible.rules}
          onChange={onSetRules}
        />
      </section>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 24px 64px',
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
  },
  header: { marginBottom: 0 },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 24,
    color: 'var(--fg)',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 16 },
  sectionHeader: { display: 'flex', alignItems: 'baseline', gap: 12 },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 17,
    color: 'var(--fg)',
  },
  sectionHint: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-muted)',
    flex: 1,
  },
  addBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  cards: { display: 'flex', flexDirection: 'column', gap: 12 },
}
```

- [ ] **Run tests to verify they pass**

```bash
npm run test:run -- tests/components/StoryBibleTab.test.jsx
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/shared/CharacterCard.jsx src/components/writing/StoryBibleTab.jsx tests/components/StoryBibleTab.test.jsx
git commit -m "feat: CharacterCard + StoryBibleTab — Characters, World, Themes, Tone, Rules sections"
```

---

## Task 13: Script Placeholder Tab

Plan 2 implements the Tiptap screenplay editor. This task adds a placeholder so routing works end-to-end now.

**Files:**
- Create: `src/components/writing/ScriptTab.jsx`

- [ ] **Create `src/components/writing/ScriptTab.jsx`**

```jsx
export function ScriptTab() {
  return (
    <div style={styles.wrapper}>
      <div style={styles.page}>
        <p style={styles.placeholder}>
          Screenplay editor coming in Plan 2.<br />
          Tiptap · Courier Prime · Full Final Draft behavior.
        </p>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    minHeight: '100%',
    background: 'var(--bg)',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 24px 80px',
  },
  page: {
    width: 816,
    minHeight: 1056,
    background: 'var(--script-page)',
    boxShadow: `
      0 0 0 1px hsla(38, 30%, 60%, 0.08),
      0 8px 48px hsla(38, 60%, 50%, 0.12),
      0 32px 96px hsla(38, 40%, 40%, 0.08)
    `,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'script-appear 300ms ease-out',
  },
  placeholder: {
    fontFamily: 'var(--font-script)',
    fontSize: 14,
    color: 'hsl(220 10% 60%)',
    textAlign: 'center',
    lineHeight: 2,
  },
}
```

Add to `globals.css`:

```css
@keyframes script-appear {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Commit**

```bash
git add src/components/writing/ScriptTab.jsx src/styles/globals.css
git commit -m "feat: ScriptTab placeholder — Night Desk page with warm glow, ready for Plan 2 Tiptap editor"
```

---

## Task 14: Wire Everything into App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Read current `src/App.jsx`** to understand what exists before modifying.

- [ ] **Replace `src/App.jsx` content**

```jsx
import { useShellState } from './lib/shellState.js'
import { useProjectState } from './lib/useProjectState.js'
import { Shell } from './components/shell/Shell.jsx'
import { ScriptTab } from './components/writing/ScriptTab.jsx'
import { SynopsisTab } from './components/writing/SynopsisTab.jsx'
import { OutlineTab } from './components/writing/OutlineTab.jsx'
import { StoryBibleTab } from './components/writing/StoryBibleTab.jsx'
import './styles/globals.css'

export default function App() {
  const shellState = useShellState()
  const project = useProjectState()

  const renderCenter = () => {
    if (shellState.writersRoomActive) {
      return (
        <div style={{ padding: 40, color: 'var(--fg-muted)', fontFamily: 'var(--font-display)' }}>
          Writer's Room — existing workspace components mount here (Plan 3)
        </div>
      )
    }
    switch (shellState.activeTab) {
      case 'script':
        return <ScriptTab />
      case 'synopsis':
        return (
          <SynopsisTab
            synopsis={project.state.synopsis}
            onUpdate={project.setSynopsisSection}
          />
        )
      case 'outline':
        return (
          <OutlineTab
            outline={project.state.outline}
            onUpdateBeat={project.setBeat}
            onReorderBeats={project.reorderBeats}
          />
        )
      case 'story-bible':
        return (
          <StoryBibleTab
            storyBible={project.state.storyBible}
            onAddCharacter={project.addCharacter}
            onUpdateCharacter={project.updateCharacter}
            onSetWorld={project.setWorld}
            onSetThemes={project.setThemes}
            onSetRules={project.setRules}
          />
        )
      default:
        return null
    }
  }

  return (
    <Shell shellState={shellState} projectTitle={project.state.meta.title}>
      {renderCenter()}
    </Shell>
  )
}
```

- [ ] **Start dev server and verify full app**

```bash
npm run dev
```

Check:
- Topbar renders: Script, Story Bible, Outline, Synopsis tabs + Writer's Room
- Click each writing tab — center content switches
- Left rail shows WP avatar; click → panel expands
- `⌘\` toggles panel
- Click Writer's Room → Writer's Room placeholder renders, rail hidden
- Refresh → tabs and state persist via localStorage

- [ ] **Run full test suite**

```bash
npm run test:run
```
Expected: All tests PASS

- [ ] **Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire Shell + all tabs into App.jsx — WriterOS writing surface complete (Plan 1)"
```

---

## Task 15: Focus Mode

**Files:**
- Modify: `src/components/shell/Shell.jsx`
- Modify: `src/components/writing/ScriptTab.jsx`

- [ ] **Verify focus mode is already wired in Shell.jsx**

`Shell.jsx` from Task 8 already hides TopBar when `focusMode` is true and responds to `Esc`. Confirm the focus mode button needs to be added to the Script tab toolbar.

- [ ] **Add focus mode button to ScriptTab**

In `src/components/writing/ScriptTab.jsx`, add the thin toolbar above the page:

```jsx
import { useShellState } from '../../lib/shellState.js'
// Note: ScriptTab needs focusMode + toggleFocusMode passed as props, not from hook directly

export function ScriptTab({ focusMode, onToggleFocusMode }) {
  return (
    <div style={styles.wrapper}>
      {!focusMode && (
        <div style={styles.toolbar}>
          <span style={styles.meta}>Page 1 · 0 words</span>
          <button style={styles.focusBtn} onClick={onToggleFocusMode} title="Focus mode (Esc to exit)">
            Focus
          </button>
        </div>
      )}
      <div style={styles.page}>
        <p style={styles.placeholder}>
          Screenplay editor coming in Plan 2.<br />
          Tiptap · Courier Prime · Full Final Draft behavior.
        </p>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    minHeight: '100%',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 24px 80px',
  },
  toolbar: {
    width: 816,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
    marginBottom: 32,
  },
  meta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--fg-subtle)',
  },
  focusBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 10px',
    cursor: 'pointer',
  },
  page: {
    width: 816,
    minHeight: 1056,
    background: 'var(--script-page)',
    marginTop: 0,
    boxShadow: `
      0 0 0 1px hsla(38, 30%, 60%, 0.08),
      0 8px 48px hsla(38, 60%, 50%, 0.12),
      0 32px 96px hsla(38, 40%, 40%, 0.08)
    `,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'script-appear 300ms ease-out',
  },
  placeholder: {
    fontFamily: 'var(--font-script)',
    fontSize: 14,
    color: 'hsl(220 10% 60%)',
    textAlign: 'center',
    lineHeight: 2,
  },
}
```

- [ ] **Update `App.jsx` to pass focus mode props to ScriptTab**

In `src/App.jsx`, update the `case 'script':` branch:

```jsx
case 'script':
  return (
    <ScriptTab
      focusMode={shellState.focusMode}
      onToggleFocusMode={shellState.toggleFocusMode}
    />
  )
```

- [ ] **Verify focus mode in dev server**

Click "Focus" in Script tab toolbar. Expected: topbar hides, rail hides, page fills screen. Press `Esc` — topbar returns.

- [ ] **Run full test suite**

```bash
npm run test:run
```
Expected: All PASS

- [ ] **Commit**

```bash
git add src/components/writing/ScriptTab.jsx src/App.jsx
git commit -m "feat: focus mode — hide chrome, pure page; Esc exits"
```

---

## Plan Complete

**Deliverable:** Working WriterOS app with Night Desk visual system, tab navigation, Writing Partner rail, and three fully functional structured document tabs (Synopsis, Outline, Story Bible). Script tab is a styled placeholder for Plan 2.

**Plan 2:** Tiptap screenplay editor — custom extension, element cycling, auto-uppercase, scene numbers, page count  
**Plan 3:** Writing Partner transcript + `@mention` routing, Writer's Room integration with existing workspace components
