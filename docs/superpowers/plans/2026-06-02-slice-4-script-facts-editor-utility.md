# Slice 4 — Script Facts Editor Utility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Script Facts panel useful in the editor — clearer near-match warnings, click-to-navigate to a fact's occurrences, and an assisted-manual merge stepper — without mutating the script or persisting aliases.

**Architecture:** A new pure module (`scriptFactNavigation.ts`) resolves a fact to ProseMirror positions by walking the *live* editor document at click time (never cached `blockIndices`), reusing the existing derivation normalizers so keying cannot drift. `ScriptFactsPanel` renders fact rows / warnings as interactive controls only when the cache is `Current`. `ScriptTab` bridges panel clicks to `editor.chain().setTextSelection().scrollIntoView()` with occurrence cycling and a transient inline highlight.

**Tech Stack:** React 18 + TypeScript, TipTap/ProseMirror editor, Vitest + jsdom + @testing-library/react.

**Design spec:** `docs/superpowers/specs/2026-06-02-script-facts-editor-utility-design.md`

---

## File Structure

**Create:**
- `client/src/lib/scriptFactNavigation.ts` — pure resolution of a fact → live ProseMirror positions. Exports `liveScriptBlocksFromDoc`, `resolveFactOccurrences`, types `LiveScriptBlock`, `FactNavigationTarget`.
- `tests/lib/scriptFactNavigation.test.ts` — unit tests incl. the required empty-paragraph safety test.
- `tests/components/ScriptFactsPanel.test.tsx` — panel interactivity / gating / warning-reason tests.

**Modify:**
- `client/src/lib/scriptFacts.ts` — add `export` to the three existing keying normalizers (`normalizeCharacterCue`, `normalizeFactKey`, `extractSceneTimes`). No behavior change.
- `client/src/components/writing/ScriptFactsPanel.tsx` — interactive fact rows, warning reasons + step button, "Rebuild to navigate" hint.
- `client/src/components/writing/ScriptTab.tsx` — navigate + merge-step handlers, occurrence cycling, transient highlight; pass handlers to panel.
- `tests/components/ScriptTab.test.tsx` — integration tests for navigate, cycle, empty-paragraph safety, merge step.

**Key invariant (from spec):** navigation reads only the live document. `ScriptFactEntry.blockIndices` is never an input to navigation — empty-paragraph churn does not change the content hash, so cached indices can be silently off while the cache reads `Current`.

---

## Task 1: Export derivation keying normalizers

Make the three normalizers reusable so navigation keys identically to derivation. These functions already exist in `scriptFacts.ts`; we only add `export`.

**Files:**
- Modify: `client/src/lib/scriptFacts.ts`
- Test: `tests/lib/scriptFacts.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/scriptFacts.test.ts`. Add the imports to the existing top-of-file import from `scriptFacts` (extend the named import list with `normalizeCharacterCue, normalizeFactKey, extractSceneTimes`):

```ts
import {
  normalizeCharacterCue,
  normalizeFactKey,
  extractSceneTimes,
} from '../../client/src/lib/scriptFacts'

describe('scriptFacts keying normalizers (exported for navigation reuse)', () => {
  it('normalizeCharacterCue strips cue decorations and uppercases', () => {
    expect(normalizeCharacterCue("ISAIAH (CONT'D)")).toBe('ISAIAH')
    expect(normalizeCharacterCue('  isaiah  ')).toBe('ISAIAH')
  })

  it('normalizeFactKey folds punctuation/case to a stable key', () => {
    expect(normalizeFactKey('Int. Safehouse - Night')).toBe('INT SAFEHOUSE NIGHT')
  })

  it('extractSceneTimes returns recognized trailing time labels', () => {
    expect(extractSceneTimes('INT. SAFEHOUSE - NIGHT')).toEqual(['NIGHT'])
    expect(extractSceneTimes('EXT. FREEWAY - DAWN')).toEqual(['DAWN'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/scriptFacts.test.ts -t "keying normalizers"`
Expected: FAIL — `normalizeCharacterCue is not exported` (or `is not a function`).

- [ ] **Step 3: Add the export keyword**

In `client/src/lib/scriptFacts.ts`, change these three function declarations from `function` to `export function` (leave bodies untouched):

```ts
export function stripCharacterCueDecorations(value: string): string {
```
```ts
export function normalizeCharacterCue(value: string): string {
```
```ts
export function normalizeFactKey(value: string): string {
```
```ts
export function extractSceneTimes(sceneHeading: string): string[] {
```

(`stripCharacterCueDecorations` is exported too because `normalizeCharacterCue` is the only consumer we need, but exporting it costs nothing and documents intent; if a lint rule forbids unused exports, drop it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/scriptFacts.test.ts`
Expected: PASS (all existing derivation tests + the 3 new cases).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/scriptFacts.ts tests/lib/scriptFacts.test.ts
git commit -m "refactor: export script facts keying normalizers for navigation reuse"
```

---

## Task 2: Live fact-occurrence resolver

Pure module that turns the live editor document + a target fact into ordered ProseMirror positions. This is the safety-critical piece — it must read live positions and filter empty paragraphs exactly as derivation does.

**Files:**
- Create: `client/src/lib/scriptFactNavigation.ts`
- Test: `tests/lib/scriptFactNavigation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/scriptFactNavigation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  liveScriptBlocksFromDoc,
  resolveFactOccurrences,
  type DocLike,
} from '../../client/src/lib/scriptFactNavigation'

// Minimal fake of a ProseMirror doc: forEach(node, offset).
// `pos` values are supplied explicitly so we can simulate empty paragraphs
// occupying earlier positions (which shifts later blocks' live positions).
function fakeDoc(
  nodes: Array<{ elementType?: string; text: string; pos: number; name?: string }>,
): DocLike {
  return {
    forEach(cb) {
      for (const n of nodes) {
        cb(
          { type: { name: n.name ?? 'paragraph' }, attrs: { elementType: n.elementType }, textContent: n.text },
          n.pos,
        )
      }
    },
  }
}

describe('liveScriptBlocksFromDoc', () => {
  it('skips empty paragraphs and preserves live positions of later blocks', () => {
    const doc = fakeDoc([
      { elementType: 'action', text: '', pos: 0 },
      { elementType: 'character', text: 'ISAIAH', pos: 2 },
    ])
    expect(liveScriptBlocksFromDoc(doc)).toEqual([{ type: 'character', text: 'ISAIAH', pos: 2 }])
  })

  it('ignores non-paragraph nodes', () => {
    const doc = fakeDoc([{ name: 'horizontal_rule', text: '', pos: 0, elementType: undefined }])
    expect(liveScriptBlocksFromDoc(doc)).toEqual([])
  })
})

describe('resolveFactOccurrences', () => {
  const doc = fakeDoc([
    { elementType: 'scene-heading', text: 'INT. SAFEHOUSE - NIGHT', pos: 0 },
    { elementType: 'character', text: "ISAIAH (CONT'D)", pos: 30 },
    { elementType: 'dialogue', text: 'Still here.', pos: 50 },
    { elementType: 'scene-heading', text: 'INT. SAFEHOUSE - DAY', pos: 70 },
    { elementType: 'character', text: 'ISAIAH', pos: 100 },
    { elementType: 'transition', text: 'CUT TO:', pos: 120 },
  ])
  const blocks = liveScriptBlocksFromDoc(doc)

  it('matches a character across cue decorations, in document order', () => {
    expect(resolveFactOccurrences(blocks, { section: 'characters', label: 'ISAIAH' })).toEqual([30, 100])
  })

  it('matches a location by folded key', () => {
    expect(resolveFactOccurrences(blocks, { section: 'locations', label: 'INT. SAFEHOUSE - NIGHT' })).toEqual([0])
  })

  it('matches a time against scene headings that contain it', () => {
    expect(resolveFactOccurrences(blocks, { section: 'times', label: 'NIGHT' })).toEqual([0])
  })

  it('matches a transition', () => {
    expect(resolveFactOccurrences(blocks, { section: 'transitions', label: 'CUT TO:' })).toEqual([120])
  })

  it('returns empty for a label not present live', () => {
    expect(resolveFactOccurrences(blocks, { section: 'characters', label: 'DANTE' })).toEqual([])
  })

  // REQUIRED (design spec): empty paragraph before a fact must not misdirect navigation.
  it('lands on the correct live position when an empty paragraph precedes the fact', () => {
    const shifted = liveScriptBlocksFromDoc(
      fakeDoc([
        { elementType: 'action', text: '', pos: 0 },
        { elementType: 'character', text: 'ISAIAH', pos: 2 },
      ]),
    )
    expect(resolveFactOccurrences(shifted, { section: 'characters', label: 'ISAIAH' })).toEqual([2])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/scriptFactNavigation.test.ts`
Expected: FAIL — cannot find module `scriptFactNavigation`.

- [ ] **Step 3: Write the module**

Create `client/src/lib/scriptFactNavigation.ts`:

```ts
import type { ElementType } from './screenplay'
import { normalizeElementType } from './screenplay'
import {
  extractSceneTimes,
  normalizeCharacterCue,
  normalizeFactKey,
  type ScriptFactSection,
} from './scriptFacts'

export interface LiveScriptBlock {
  type: ElementType
  text: string
  pos: number
}

export interface FactNavigationTarget {
  section: ScriptFactSection
  label: string
}

// Structural subset of a ProseMirror node/doc — keeps this module editor-agnostic
// and unit-testable without instantiating TipTap.
interface NodeLike {
  type: { name: string }
  attrs: { elementType?: unknown }
  textContent: string
}

export interface DocLike {
  forEach(callback: (node: NodeLike, offset: number) => void): void
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// Walk the live document in document order, capturing each non-empty paragraph
// with its live ProseMirror position. Empty paragraphs are filtered exactly as
// parseScriptBlocks filters them, so positions stay aligned with derivation.
export function liveScriptBlocksFromDoc(doc: DocLike): LiveScriptBlock[] {
  const blocks: LiveScriptBlock[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    const text = normalizeWhitespace(node.textContent ?? '')
    if (!text) return
    blocks.push({
      type: normalizeElementType(node.attrs.elementType),
      text,
      pos: offset,
    })
  })
  return blocks
}

function matchesTarget(block: LiveScriptBlock, target: FactNavigationTarget): boolean {
  switch (target.section) {
    case 'characters':
      return (
        block.type === 'character' &&
        normalizeCharacterCue(block.text) === normalizeCharacterCue(target.label)
      )
    case 'locations':
      return block.type === 'scene-heading' && normalizeFactKey(block.text) === normalizeFactKey(target.label)
    case 'transitions':
      return block.type === 'transition' && normalizeFactKey(block.text) === normalizeFactKey(target.label)
    case 'times':
      return (
        block.type === 'scene-heading' &&
        extractSceneTimes(block.text).some(time => normalizeFactKey(time) === normalizeFactKey(target.label))
      )
    default:
      return false
  }
}

// Resolve a fact target to ordered live positions. Reads only `blocks`
// (built from the live document) — never cached blockIndices.
export function resolveFactOccurrences(
  blocks: readonly LiveScriptBlock[],
  target: FactNavigationTarget,
): number[] {
  if (!normalizeFactKey(target.label)) return []
  const positions: number[] = []
  for (const block of blocks) {
    if (matchesTarget(block, target)) positions.push(block.pos)
  }
  return positions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/scriptFactNavigation.test.ts`
Expected: PASS (all cases incl. the empty-paragraph case).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/scriptFactNavigation.ts tests/lib/scriptFactNavigation.test.ts
git commit -m "feat: resolve script fact occurrences from live editor document"
```

---

## Task 3: Interactive Script Facts panel

Add interactivity to the panel: fact rows become buttons when `Current`, warnings gain a plain-language reason + a "Step through" button, and a "Rebuild to navigate" hint shows when not `Current`.

**Files:**
- Modify: `client/src/components/writing/ScriptFactsPanel.tsx`
- Test: `tests/components/ScriptFactsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ScriptFactsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScriptFactsPanel } from '../../client/src/components/writing/ScriptFactsPanel'
import { rebuildScriptFactsCache } from '../../client/src/lib/scriptFacts'

// Two near-matched characters → produces an edit-distance warning.
const HTML = [
  '<p data-element-type="character">SARA</p>',
  '<p data-element-type="dialogue">One.</p>',
  '<p data-element-type="character">SARAH</p>',
  '<p data-element-type="dialogue">Two.</p>',
].join('')

function currentFacts() {
  return rebuildScriptFactsCache(HTML, '2026-06-02T10:00:00.000Z')
}

describe('ScriptFactsPanel interactivity', () => {
  it('renders fact rows as buttons when current and calls onNavigateFact', () => {
    const facts = currentFacts()
    const onNavigateFact = vi.fn()
    render(
      <ScriptFactsPanel
        facts={facts}
        currentContentHash={facts.contentHash}
        onRebuild={() => {}}
        onNavigateFact={onNavigateFact}
        onStepWarning={() => {}}
      />,
    )
    const saraButton = screen.getByRole('button', { name: /^SARA$/ })
    fireEvent.click(saraButton)
    expect(onNavigateFact).toHaveBeenCalledWith('characters', 'SARA')
  })

  it('shows a plain-language reason and a step button for near-match warnings', () => {
    const facts = currentFacts()
    const onStepWarning = vi.fn()
    render(
      <ScriptFactsPanel
        facts={facts}
        currentContentHash={facts.contentHash}
        onRebuild={() => {}}
        onNavigateFact={() => {}}
        onStepWarning={onStepWarning}
      />,
    )
    expect(screen.getByText(/possible typo/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /step through/i }))
    expect(onStepWarning).toHaveBeenCalledTimes(1)
  })

  it('disables interactivity and shows a rebuild hint when stale', () => {
    const facts = currentFacts()
    render(
      <ScriptFactsPanel
        facts={facts}
        currentContentHash="deadbeef"
        onRebuild={() => {}}
        onNavigateFact={() => {}}
        onStepWarning={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /^SARA$/ })).toBeNull()
    expect(screen.getByText(/rebuild to navigate/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ScriptFactsPanel.test.tsx`
Expected: FAIL — facts are plain text (no buttons), no reason/hint text.

- [ ] **Step 3: Update the panel**

Edit `client/src/components/writing/ScriptFactsPanel.tsx`. Replace the import, props interface, component body, the `FactSection` component, and add a `warningReason` helper + styles. Full replacements:

Import line (add `ScriptFactSection`):

```tsx
import type { ScriptFactEntry, ScriptFactSection, ScriptFactsCache, ScriptFactWarning } from '../../lib/scriptFacts'
```

Props interface:

```tsx
interface ScriptFactsPanelProps {
  facts: ScriptFactsCache
  currentContentHash: string
  onRebuild: () => void
  onNavigateFact?: (section: ScriptFactSection, label: string) => void
  onStepWarning?: (warning: ScriptFactWarning) => void
}
```

Component body (replace the existing `export function ScriptFactsPanel(...) { ... }` through its closing brace):

```tsx
export function ScriptFactsPanel({
  facts,
  currentContentHash,
  onRebuild,
  onNavigateFact,
  onStepWarning,
}: ScriptFactsPanelProps) {
  const status = statusForFacts(facts, currentContentHash)
  const interactive = status.label === 'Current'

  return (
    <aside aria-label="Script Facts" style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Script Facts</h2>
          <span style={{ ...styles.status, color: status.color }}>{status.label}</span>
        </div>
        <button
          type="button"
          aria-label="Rebuild Script Facts"
          style={styles.rebuildButton}
          onClick={onRebuild}
        >
          Rebuild
        </button>
      </div>

      {facts.rebuiltAt && (
        <div style={styles.rebuiltAt}>Rebuilt {formatTimestamp(facts.rebuiltAt)}</div>
      )}

      {!interactive && (
        <div style={styles.navHint}>Rebuild to navigate</div>
      )}

      {facts.warnings.length > 0 && (
        <section style={styles.section} aria-label="Script Facts warnings">
          <h3 style={styles.sectionTitle}>Warnings</h3>
          <ul style={styles.warningList}>
            {facts.warnings.map(warning => (
              <li key={warningKey(warning)} style={styles.warningItem}>
                <span>
                  {warning.labels[0]} / {warning.labels[1]} — {warningReason(warning)}
                </span>
                {interactive && onStepWarning && (
                  <button
                    type="button"
                    style={styles.stepButton}
                    onClick={() => onStepWarning(warning)}
                  >
                    Step through
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <FactSection title="Characters" section="characters" entries={facts.characters} interactive={interactive} onNavigate={onNavigateFact} />
      <FactSection title="Locations" section="locations" entries={facts.locations} interactive={interactive} onNavigate={onNavigateFact} />
      <FactSection title="Times" section="times" entries={facts.times} interactive={interactive} onNavigate={onNavigateFact} />
      <FactSection title="Transitions" section="transitions" entries={facts.transitions} interactive={interactive} onNavigate={onNavigateFact} />
    </aside>
  )
}

function warningReason(warning: ScriptFactWarning): string {
  return warning.reason === 'edit-distance' ? 'possible typo' : 'one name contains the other'
}
```

`FactSection` (replace the existing function):

```tsx
function FactSection({
  title,
  section,
  entries,
  interactive,
  onNavigate,
}: {
  title: string
  section: ScriptFactSection
  entries: ScriptFactEntry[]
  interactive: boolean
  onNavigate?: (section: ScriptFactSection, label: string) => void
}) {
  return (
    <section style={styles.section} aria-label={`Script Facts ${title}`}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {entries.length === 0 ? (
        <div style={styles.empty}>None</div>
      ) : (
        <ul style={styles.factList}>
          {entries.map(entry => (
            <li key={entry.label} style={styles.factItem}>
              {interactive && onNavigate ? (
                <button
                  type="button"
                  style={styles.factButton}
                  onClick={() => onNavigate(section, entry.label)}
                >
                  {entry.label}
                </button>
              ) : (
                <span style={styles.factLabel}>{entry.label}</span>
              )}
              <span style={styles.count}>{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

Add these style keys to the `styles` object (alongside the existing keys):

```tsx
  navHint: {
    marginBottom: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-subtle)',
  },
  factButton: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    lineHeight: 1.35,
  },
  stepButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: '2px 6px',
    cursor: 'pointer',
  },
```

Also update the existing `warningItem` style to stack the reason and button:

```tsx
  warningItem: {
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--fg)',
    fontSize: 12,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ScriptFactsPanel.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/writing/ScriptFactsPanel.tsx tests/components/ScriptFactsPanel.test.tsx
git commit -m "feat: make script facts panel rows and warnings interactive"
```

---

## Task 4: Wire navigation + merge stepper in ScriptTab

Bridge panel clicks to the live editor: resolve occurrences, move the selection, scroll, briefly highlight, and cycle through occurrences on repeated clicks. The merge stepper walks both warning labels in document order.

**Files:**
- Modify: `client/src/components/writing/ScriptTab.tsx`
- Test: `tests/components/ScriptTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/components/ScriptTab.test.tsx` (the file already imports `render`, `fireEvent`, `waitFor`, `screen`, `rebuildScriptFactsCache`, and `Editor`):

```tsx
describe('ScriptTab script facts navigation', () => {
  const noop = () => {}

  async function mountWithFacts(html: string) {
    const facts = rebuildScriptFactsCache(html, '2026-06-02T10:00:00.000Z')
    let editor: Editor | null = null
    render(
      <ScriptTab
        initialScript={html}
        scriptFacts={facts}
        onRebuildScriptFacts={noop}
        onEditorReady={(e) => { editor = e }}
      />,
    )
    await waitFor(() => expect(editor).toBeTruthy())
    return { editor: editor as unknown as Editor }
  }

  it('navigates the editor selection to a clicked fact occurrence', async () => {
    const { editor } = await mountWithFacts(
      '<p data-element-type="character">ISAIAH</p><p data-element-type="dialogue">Hi.</p>',
    )
    fireEvent.click(await screen.findByRole('button', { name: /^ISAIAH$/ }))
    expect(editor.state.selection.$from.parent.textContent).toBe('ISAIAH')
  })

  // REQUIRED (design spec): empty paragraph before a fact, cache still current,
  // navigation must land on the real occurrence — not the empty paragraph.
  it('lands on the correct occurrence when an empty paragraph precedes it', async () => {
    const { editor } = await mountWithFacts(
      '<p data-element-type="action"></p><p data-element-type="character">ISAIAH</p>',
    )
    fireEvent.click(await screen.findByRole('button', { name: /^ISAIAH$/ }))
    expect(editor.state.selection.$from.parent.textContent).toBe('ISAIAH')
  })

  it('cycles through repeated occurrences on repeated clicks', async () => {
    const { editor } = await mountWithFacts(
      '<p data-element-type="scene-heading">INT. ROOM - DAY</p>' +
      '<p data-element-type="action">Beat.</p>' +
      '<p data-element-type="scene-heading">INT. ROOM - DAY</p>',
    )
    const button = await screen.findByRole('button', { name: /^INT\. ROOM - DAY$/ })
    fireEvent.click(button)
    const first = editor.state.selection.from
    fireEvent.click(button)
    const second = editor.state.selection.from
    expect(second).not.toBe(first)
  })

  it('steps through both labels of a near-match warning in document order', async () => {
    const { editor } = await mountWithFacts(
      '<p data-element-type="character">SARA</p>' +
      '<p data-element-type="dialogue">One.</p>' +
      '<p data-element-type="character">SARAH</p>',
    )
    const stepButton = await screen.findByRole('button', { name: /step through/i })
    fireEvent.click(stepButton)
    expect(editor.state.selection.$from.parent.textContent).toBe('SARA')
    fireEvent.click(stepButton)
    expect(editor.state.selection.$from.parent.textContent).toBe('SARAH')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ScriptTab.test.tsx -t "script facts navigation"`
Expected: FAIL — the fact buttons do nothing (no `onNavigateFact`/`onStepWarning` wired), selection does not move.

- [ ] **Step 3: Implement the wiring**

Edit `client/src/components/writing/ScriptTab.tsx`.

(a) Extend imports. Update the `scriptFacts` type import and add the navigation module + section/warning types:

```tsx
import type { ScriptFactsCache, ScriptFactSection, ScriptFactWarning } from '../../lib/scriptFacts'
import { liveScriptBlocksFromDoc, resolveFactOccurrences } from '../../lib/scriptFactNavigation'
```

(b) Add a cycling cursor ref next to the other refs (after `scriptHashTimerRef`):

```tsx
  const navCursorRef = useRef<{ key: string; index: number } | null>(null)
```

(c) Add helpers and handlers. Insert after `handleRebuildScriptFacts` (before `handleSceneClick`):

```tsx
  const focusEditorPosition = useCallback((editor: Editor, pos: number) => {
    editor.chain().setTextSelection(pos + 1).scrollIntoView().focus().run()
    highlightEditorPosition(editor, pos)
  }, [])

  const cycleToPositions = useCallback(
    (key: string, positions: number[]) => {
      const editor = editorRef.current
      if (!editor || positions.length === 0) return

      const cursor = navCursorRef.current
      const index = cursor && cursor.key === key ? (cursor.index + 1) % positions.length : 0
      navCursorRef.current = { key, index }
      focusEditorPosition(editor, positions[index])
    },
    [focusEditorPosition]
  )

  const handleNavigateFact = useCallback(
    (section: ScriptFactSection, label: string) => {
      const editor = editorRef.current
      if (!editor) return
      const blocks = liveScriptBlocksFromDoc(editor.state.doc)
      const positions = resolveFactOccurrences(blocks, { section, label })
      cycleToPositions(`fact:${section}:${label}`, positions)
    },
    [cycleToPositions]
  )

  const handleStepWarning = useCallback(
    (warning: ScriptFactWarning) => {
      const editor = editorRef.current
      if (!editor) return
      const blocks = liveScriptBlocksFromDoc(editor.state.doc)
      const positions = [
        ...resolveFactOccurrences(blocks, { section: warning.section, label: warning.labels[0] }),
        ...resolveFactOccurrences(blocks, { section: warning.section, label: warning.labels[1] }),
      ].sort((a, b) => a - b)
      cycleToPositions(`warning:${warning.section}:${warning.labels.join('|')}`, positions)
    },
    [cycleToPositions]
  )
```

(d) Add the transient highlight helper at module scope (after the `scriptScenesFromHeadings` function near the bottom of the file):

```tsx
function highlightEditorPosition(editor: Editor, pos: number): void {
  const dom = editor.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return
  dom.style.transition = 'background-color 0.6s ease'
  dom.style.backgroundColor = 'var(--accent-soft, rgba(47, 143, 91, 0.18))'
  window.setTimeout(() => {
    dom.style.backgroundColor = ''
  }, 1200)
}
```

(e) Pass the handlers to the panel. Update the `<ScriptFactsPanel ... />` usage:

```tsx
          {scriptFacts && onRebuildScriptFacts && !focusMode && (
            <ScriptFactsPanel
              facts={scriptFacts}
              currentContentHash={currentScriptHash}
              onRebuild={handleRebuildScriptFacts}
              onNavigateFact={handleNavigateFact}
              onStepWarning={handleStepWarning}
            />
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/ScriptTab.test.tsx`
Expected: PASS (existing ScriptTab tests + the 4 new navigation cases).

If `editor.chain().scrollIntoView()` throws in jsdom (it should not — it is a ProseMirror command, not DOM `Element.scrollIntoView`), confirm `tests/setup` mocks `Element.prototype.scrollIntoView`; the existing `handleSceneClick` DOM path already relies on it. If missing, add to the test setup file:
```ts
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/writing/ScriptTab.tsx tests/components/ScriptTab.test.tsx
git commit -m "feat: navigate and step through script facts from the editor panel"
```

---

## Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Type check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test:run`
Expected: all files pass (previous baseline 72 files / 1022 tests, plus the new cases).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Whitespace check**

Run: `git diff --check`
Expected: no output.

- [ ] **Step 5: Manual browser QA**

Run the app, open a script with repeated/near-match character cues:
- Click a fact → editor jumps and briefly highlights the occurrence.
- Click the same fact again → advances to the next occurrence.
- Insert a blank line above a fact (status stays `Current`) → clicking still lands on the real occurrence.
- Edit the script so status goes `Stale` → fact rows become plain text, "Rebuild to navigate" shows; Rebuild restores interactivity.
- A near-match warning shows a reason; "Step through" walks both spellings.

---

## Self-Review

**Spec coverage:**
- Clearer near-match warnings → Task 3 (`warningReason`, reason text rendered, tested).
- Click-to-navigate → Task 2 (resolver) + Task 4 (wiring), tested incl. document-order.
- Step-through merge (assisted-manual, no mutation) → Task 4 `handleStepWarning`, tested; no editor writes anywhere.
- Stale fully gates affordances → Task 3 (`interactive = status === Current`, rebuild hint), tested.
- Live-resolution / no cached `blockIndices` → Task 2 module reads only `LiveScriptBlock[]`; required empty-paragraph test in Task 2 (pure) and Task 4 (integration).
- No alias persistence / no Vault / no AI-context change → nothing in any task writes cache, alias store, or server context.
- Repeated-click cycles → Task 4 `cycleToPositions`, tested.

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `LiveScriptBlock`, `FactNavigationTarget`, `DocLike` defined in Task 2 and used unchanged in Task 4. `resolveFactOccurrences(blocks, target)` and `liveScriptBlocksFromDoc(doc)` signatures match across tasks. `ScriptFactSection` imported from `scriptFacts` in Tasks 3 and 4. Panel props (`onNavigateFact(section, label)`, `onStepWarning(warning)`) match the ScriptTab handlers exactly.
