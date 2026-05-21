# WriterOS Screenplay Editor — Implementation Plan (Part 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ScriptTab placeholder with a fully functional Tiptap screenplay editor that passes all spec acceptance tests: element cycling via Tab/Shift+Tab, Enter creating next element type, uppercase on commit for scene headings and character names, backspace edge cases, left scene gutter, and element type toolbar.

**Architecture:** Tiptap stores all screenplay elements as paragraphs with a single `elementType` attribute (`"scene-heading" | "action" | "character" | "dialogue" | "parenthetical" | "transition"`). A custom Tiptap `Extension` intercepts Tab, Shift+Tab, Enter, and Backspace to implement screenplay formatting rules. Pure cycling logic lives in `client/src/lib/screenplay.ts` (unit-testable). The editor, toolbar, and scene gutter are separate components composed inside the existing `ScriptTab`.

**Tech Stack:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-document`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/extension-history`, Vitest + @testing-library/react

---

> **PATH RULES (critical for all subagents):**
> - All source files: `client/src/` with `.ts`/`.tsx` extensions
> - Tests: root `tests/` directory with `.ts`/`.tsx` extensions
> - Test imports: `../../client/src/...` (e.g. `../../client/src/lib/screenplay`)
> - CSS: import directly in component (e.g. `import './screenplay.css'`)
> - Vitest: run from worktree root with `npx vitest run`
> - Do NOT use shadcn/ui — custom styled components only
> - `@/` alias resolves to `client/src/` but prefer relative imports within `client/src/`

---

## File Map

```
client/src/
  lib/
    screenplay.ts                          NEW — ElementType, cycling tables, pure helper fns
  components/
    writing/
      screenplay/
        ScreenplayExtension.ts             NEW — Tiptap Extension (elementType attr + keyboard)
        ScreenplayEditor.tsx               NEW — Tiptap useEditor wrapper + page render
        ScreenplayToolbar.tsx              NEW — element picker, word/page count, focus btn
        SceneGutter.tsx                    NEW — scene numbers left of page, click-to-scroll
        screenplay.css                     NEW — per-element WGA indentation + ProseMirror base
      ScriptTab.tsx                        MODIFY — wire ScreenplayEditor + toolbar + gutter
tests/
  lib/
    screenplay.test.ts                     NEW — unit tests for all pure cycling logic
  components/
    ScreenplayToolbar.test.tsx             NEW — toolbar render tests
    SceneGutter.test.tsx                   NEW — gutter render tests
```

---

## Task 1: Install Tiptap + Pure Screenplay Logic

**Files:**
- Modify: `package.json` (install deps)
- Create: `client/src/lib/screenplay.ts`
- Create: `tests/lib/screenplay.test.ts`

- [ ] **Install Tiptap packages**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/extension-document @tiptap/extension-paragraph @tiptap/extension-text @tiptap/extension-history
```

Expected: packages added to `node_modules`, no errors.

- [ ] **Write failing tests**

Create `tests/lib/screenplay.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getTabNext,
  getTabPrev,
  getEnterNext,
  shouldUppercase,
  countWords,
  estimatePageCount,
  ELEMENT_LABELS,
} from '../../client/src/lib/screenplay'

describe('getTabNext — Tab cycles to next element', () => {
  it('scene-heading → action', () => expect(getTabNext('scene-heading')).toBe('action'))
  it('action → character', () => expect(getTabNext('action')).toBe('character'))
  it('character → dialogue', () => expect(getTabNext('character')).toBe('dialogue'))
  it('dialogue → parenthetical', () => expect(getTabNext('dialogue')).toBe('parenthetical'))
  it('parenthetical → dialogue', () => expect(getTabNext('parenthetical')).toBe('dialogue'))
  it('transition → scene-heading', () => expect(getTabNext('transition')).toBe('scene-heading'))
})

describe('getTabPrev — Shift+Tab reverses', () => {
  it('action → scene-heading', () => expect(getTabPrev('action')).toBe('scene-heading'))
  it('scene-heading → transition', () => expect(getTabPrev('scene-heading')).toBe('transition'))
  it('character → action', () => expect(getTabPrev('character')).toBe('action'))
  it('dialogue → character', () => expect(getTabPrev('dialogue')).toBe('character'))
  it('parenthetical → dialogue', () => expect(getTabPrev('parenthetical')).toBe('dialogue'))
  it('transition → parenthetical', () => expect(getTabPrev('transition')).toBe('parenthetical'))
})

describe('getEnterNext — Enter creates next element', () => {
  it('scene-heading → action', () => expect(getEnterNext('scene-heading')).toBe('action'))
  it('action → action', () => expect(getEnterNext('action')).toBe('action'))
  it('character → dialogue', () => expect(getEnterNext('character')).toBe('dialogue'))
  it('dialogue → action', () => expect(getEnterNext('dialogue')).toBe('action'))
  it('parenthetical → dialogue', () => expect(getEnterNext('parenthetical')).toBe('dialogue'))
  it('transition → scene-heading', () => expect(getEnterNext('transition')).toBe('scene-heading'))
})

describe('shouldUppercase', () => {
  it('scene-heading → true', () => expect(shouldUppercase('scene-heading')).toBe(true))
  it('character → true', () => expect(shouldUppercase('character')).toBe(true))
  it('action → false', () => expect(shouldUppercase('action')).toBe(false))
  it('dialogue → false', () => expect(shouldUppercase('dialogue')).toBe(false))
  it('parenthetical → false', () => expect(shouldUppercase('parenthetical')).toBe(false))
  it('transition → false', () => expect(shouldUppercase('transition')).toBe(false))
})

describe('countWords', () => {
  it('empty string = 0', () => expect(countWords('')).toBe(0))
  it('whitespace only = 0', () => expect(countWords('   ')).toBe(0))
  it('single word = 1', () => expect(countWords('INT.')).toBe(1))
  it('counts words in scene heading', () => expect(countWords('INT. THE ROOM - DAY')).toBe(4))
})

describe('estimatePageCount', () => {
  it('0 words = 1 page', () => expect(estimatePageCount(0)).toBe(1))
  it('250 words ≈ 1 page', () => expect(estimatePageCount(250)).toBe(1))
  it('500 words ≈ 2 pages', () => expect(estimatePageCount(500)).toBe(2))
  it('1250 words ≈ 5 pages', () => expect(estimatePageCount(1250)).toBe(5))
})

describe('ELEMENT_LABELS', () => {
  it('has label for all 6 element types', () => {
    expect(ELEMENT_LABELS['scene-heading']).toBe('Scene Heading')
    expect(ELEMENT_LABELS['action']).toBe('Action')
    expect(ELEMENT_LABELS['character']).toBe('Character')
    expect(ELEMENT_LABELS['dialogue']).toBe('Dialogue')
    expect(ELEMENT_LABELS['parenthetical']).toBe('Parenthetical')
    expect(ELEMENT_LABELS['transition']).toBe('Transition')
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npx vitest run tests/lib/screenplay.test.ts
```

Expected: FAIL — "Cannot find module '../../client/src/lib/screenplay'"

- [ ] **Create `client/src/lib/screenplay.ts`**

```typescript
export type ElementType =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'

export const ELEMENT_LABELS: Record<ElementType, string> = {
  'scene-heading':  'Scene Heading',
  'action':         'Action',
  'character':      'Character',
  'dialogue':       'Dialogue',
  'parenthetical':  'Parenthetical',
  'transition':     'Transition',
}

// Tab → next element type
const TAB_NEXT: Record<ElementType, ElementType> = {
  'scene-heading':  'action',
  'action':         'character',
  'character':      'dialogue',
  'dialogue':       'parenthetical',
  'parenthetical':  'dialogue',
  'transition':     'scene-heading',
}

// Shift+Tab → previous element type
const TAB_PREV: Record<ElementType, ElementType> = {
  'scene-heading':  'transition',
  'action':         'scene-heading',
  'character':      'action',
  'dialogue':       'character',
  'parenthetical':  'dialogue',
  'transition':     'parenthetical',
}

// Enter → type of the NEW paragraph created below
const ENTER_NEXT: Record<ElementType, ElementType> = {
  'scene-heading':  'action',
  'action':         'action',
  'character':      'dialogue',
  'dialogue':       'action',
  'parenthetical':  'dialogue',
  'transition':     'scene-heading',
}

// Elements whose text is uppercased when Tab or Enter is pressed
const UPPERCASE_ELEMENTS = new Set<ElementType>(['scene-heading', 'character'])

export function getTabNext(type: ElementType): ElementType {
  return TAB_NEXT[type]
}

export function getTabPrev(type: ElementType): ElementType {
  return TAB_PREV[type]
}

export function getEnterNext(type: ElementType): ElementType {
  return ENTER_NEXT[type]
}

export function shouldUppercase(type: ElementType): boolean {
  return UPPERCASE_ELEMENTS.has(type)
}

/** Word count from plain text. Returns 0 for empty/whitespace-only strings. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/**
 * Approximate screenplay page count.
 * Industry rule of thumb: ~250 words per page.
 * Returns at least 1.
 */
export function estimatePageCount(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 250))
}
```

- [ ] **Run tests to verify they pass**

```bash
npx vitest run tests/lib/screenplay.test.ts
```

Expected: 29 tests PASS

- [ ] **Run full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing 51 + 29 new = 80 tests PASS

- [ ] **Commit**

```bash
git add client/src/lib/screenplay.ts tests/lib/screenplay.test.ts package.json package-lock.json
git commit -m "feat: screenplay element cycling logic + Tiptap install"
```

---

## Task 2: Screenplay CSS

**Files:**
- Create: `client/src/components/writing/screenplay/screenplay.css`

No tests — visual. Verify in dev server after Task 7.

- [ ] **Create `client/src/components/writing/screenplay/screenplay.css`**

```css
/* ============================================================
   Screenplay CSS — WGA-standard element indentation
   All measurements relative to ProseMirror content area.
   Page padding: left 144px (1.5"), right 96px (1"), top/bottom 96px (1")
   ============================================================ */

/* ProseMirror editor resets */
.ProseMirror {
  outline: none;
  caret-color: #333;
  /* page padding = WGA margins */
  padding: 96px 96px 96px 144px;
  min-height: 1056px; /* 11" at 96dpi */
  box-sizing: border-box;
}

/* All screenplay paragraphs */
.ProseMirror p {
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 12pt;   /* 16px at standard 96dpi */
  line-height: 1;    /* single-spaced */
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--script-text, #1a1814);
}

/* One blank line before scene headings (except the first) */
.ProseMirror p + [data-element-type="scene-heading"] {
  margin-top: 16px;
}

/* ---- Element-specific indentation ---- */

/* Scene Heading: left margin, bold */
[data-element-type="scene-heading"] {
  margin-left: 0;
  margin-right: 0;
  font-weight: 700;
}

/* Action: left margin (no extra indent) */
[data-element-type="action"] {
  margin-left: 0;
  margin-right: 0;
}

/* Character: ~2.2" from content left = 211px */
[data-element-type="character"] {
  margin-left: 211px;
  margin-right: 0;
  text-transform: uppercase;
}

/* Dialogue: 1" left = 96px, 1.5" right = 144px */
[data-element-type="dialogue"] {
  margin-left: 96px;
  margin-right: 144px;
}

/* Parenthetical: 1.5" left = 144px, 2" right = 192px */
[data-element-type="parenthetical"] {
  margin-left: 144px;
  margin-right: 192px;
}

/* Transition: flush right, uppercase */
[data-element-type="transition"] {
  text-align: right;
  margin-left: 0;
  margin-right: 0;
  text-transform: uppercase;
}

/* Scene heading placeholder */
[data-element-type="scene-heading"].is-empty::before {
  content: 'INT./EXT. LOCATION — DAY/NIGHT';
  color: hsl(220 10% 65%);
  pointer-events: none;
  float: left;
  height: 0;
  font-weight: 400;
}

/* ProseMirror placeholder for action line */
[data-element-type="action"].is-empty::before {
  content: 'Action…';
  color: hsl(220 10% 65%);
  pointer-events: none;
  float: left;
  height: 0;
}

/* Selection highlight */
.ProseMirror ::selection {
  background: hsla(220, 60%, 70%, 0.25);
}
```

- [ ] **Commit**

```bash
git add client/src/components/writing/screenplay/screenplay.css
git commit -m "feat: screenplay CSS — WGA element indentation, Courier Prime, placeholder hints"
```

---

## Task 3: ScreenplayExtension

**Files:**
- Create: `client/src/components/writing/screenplay/ScreenplayExtension.ts`

No separate test file — behavior is tested via integration (keyboard events in ScreenplayEditor tests are unreliable in jsdom; the pure logic in `screenplay.ts` is already unit-tested).

- [ ] **Create `client/src/components/writing/screenplay/ScreenplayExtension.ts`**

```typescript
import { Extension } from '@tiptap/core'
import {
  ElementType,
  getTabNext,
  getTabPrev,
  getEnterNext,
  shouldUppercase,
} from '../../../lib/screenplay'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    screenplay: {
      setElementType: (type: ElementType) => ReturnType
      uppercaseCurrentBlock: () => ReturnType
    }
  }
}

export const ScreenplayExtension = Extension.create({
  name: 'screenplay',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          elementType: {
            default: 'action' as ElementType,
            parseHTML: el =>
              (el.getAttribute('data-element-type') as ElementType) ?? 'action',
            renderHTML: attrs => ({
              'data-element-type': attrs.elementType as string,
            }),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setElementType:
        (type: ElementType) =>
        ({ commands }) => {
          return commands.updateAttributes('paragraph', { elementType: type })
        },

      uppercaseCurrentBlock:
        () =>
        ({ state, tr }) => {
          const { $anchor } = state.selection
          const node = $anchor.parent
          if (node.type.name !== 'paragraph') return false
          const text = node.textContent
          if (!text || text === text.toUpperCase()) return true
          const from = $anchor.start()
          const to = $anchor.end()
          tr.replaceRangeWith(from, to, state.schema.text(text.toUpperCase()))
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType
        const nextType = getTabNext(currentType)

        if (shouldUppercase(currentType)) {
          editor.chain().uppercaseCurrentBlock().setElementType(nextType).run()
        } else {
          editor.commands.setElementType(nextType)
        }
        return true // prevent browser tab focus-move
      },

      'Shift-Tab': ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType
        const prevType = getTabPrev(currentType)

        if (shouldUppercase(currentType)) {
          editor.chain().uppercaseCurrentBlock().setElementType(prevType).run()
        } else {
          editor.commands.setElementType(prevType)
        }
        return true
      },

      Enter: ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        // Only handle Enter at end of paragraph — let default handle mid-paragraph splits
        if ($anchor.parentOffset !== node.content.size) return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType
        const nextType = getEnterNext(currentType)

        if (shouldUppercase(currentType)) {
          editor
            .chain()
            .uppercaseCurrentBlock()
            .splitBlock()
            .setElementType(nextType)
            .run()
        } else {
          editor.chain().splitBlock().setElementType(nextType).run()
        }
        return true
      },

      Backspace: ({ editor }) => {
        const { $anchor } = editor.state.selection
        const node = $anchor.parent
        if (node.type.name !== 'paragraph') return false

        // Only intercept backspace on empty paragraphs
        if (node.content.size !== 0) return false

        const currentType = (node.attrs.elementType ?? 'action') as ElementType

        // Empty Dialogue → Character (change type, do NOT delete paragraph)
        if (currentType === 'dialogue') {
          editor.commands.setElementType('character')
          return true
        }

        // Empty Character → Action (change type, do NOT delete paragraph)
        if (currentType === 'character') {
          editor.commands.setElementType('action')
          return true
        }

        // Default behavior for all other types
        return false
      },
    }
  },
})
```

- [ ] **Run full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 80 tests PASS (no new tests, no regressions)

- [ ] **Commit**

```bash
git add client/src/components/writing/screenplay/ScreenplayExtension.ts
git commit -m "feat: ScreenplayExtension — elementType attr, Tab/Enter cycling, Backspace edge cases"
```

---

## Task 4: ScreenplayEditor Component

**Files:**
- Create: `client/src/components/writing/screenplay/ScreenplayEditor.tsx`

- [ ] **Create `client/src/components/writing/screenplay/ScreenplayEditor.tsx`**

```tsx
import React, { useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import { ScreenplayExtension } from './ScreenplayExtension'
import { ElementType, countWords } from '../../../lib/screenplay'
import './screenplay.css'

interface ScreenplayEditorProps {
  onWordCountChange?: (count: number) => void
  onPageCountChange?: (count: number) => void
  onElementTypeChange?: (type: ElementType) => void
  onSceneHeadingsChange?: (headings: Array<{ index: number; text: string; nodePos: number }>) => void
}

export function ScreenplayEditor({
  onWordCountChange,
  onPageCountChange,
  onElementTypeChange,
  onSceneHeadingsChange,
}: ScreenplayEditorProps) {
  const editorDivRef = useRef<HTMLDivElement>(null)

  const updatePageCount = useCallback(() => {
    if (!editorDivRef.current) return
    const pageHeightPx = 11 * 96 // 11" at 96dpi
    const pages = Math.max(1, Math.round(editorDivRef.current.scrollHeight / pageHeightPx))
    onPageCountChange?.(pages)
  }, [onPageCountChange])

  const editor = useEditor({
    extensions: [Document, Paragraph, Text, History, ScreenplayExtension],
    content: '<p data-element-type="scene-heading"></p>',

    onUpdate: ({ editor }) => {
      // Word count
      onWordCountChange?.(countWords(editor.getText()))

      // Page count (DOM height)
      updatePageCount()

      // Scene headings list for gutter
      const headings: Array<{ index: number; text: string; nodePos: number }> = []
      let sceneIndex = 0
      editor.state.doc.forEach((node, offset) => {
        if (
          node.type.name === 'paragraph' &&
          node.attrs.elementType === 'scene-heading'
        ) {
          headings.push({ index: sceneIndex + 1, text: node.textContent, nodePos: offset })
          sceneIndex++
        }
      })
      onSceneHeadingsChange?.(headings)
    },

    onSelectionUpdate: ({ editor }) => {
      const { $anchor } = editor.state.selection
      const node = $anchor.parent
      if (node.type.name === 'paragraph') {
        onElementTypeChange?.((node.attrs.elementType as ElementType) ?? 'action')
      }
    },
  })

  return (
    <div ref={editorDivRef} style={styles.page}>
      <EditorContent editor={editor} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: 816,
    minHeight: 1056,
    background: 'var(--script-page)',
    boxShadow: `
      0 0 0 1px hsla(38, 30%, 60%, 0.08),
      0 8px 48px hsla(38, 60%, 50%, 0.12),
      0 32px 96px hsla(38, 40%, 40%, 0.08)
    `,
    animation: 'script-appear 300ms ease-out',
    flexShrink: 0,
  },
}
```

- [ ] **Run full suite**

```bash
npx vitest run
```

Expected: 80 tests PASS

- [ ] **Commit**

```bash
git add client/src/components/writing/screenplay/ScreenplayEditor.tsx
git commit -m "feat: ScreenplayEditor — Tiptap editor with screenplay extension, page glow, scene tracking"
```

---

## Task 5: ScreenplayToolbar

**Files:**
- Create: `client/src/components/writing/screenplay/ScreenplayToolbar.tsx`
- Create: `tests/components/ScreenplayToolbar.test.tsx`

- [ ] **Write failing tests**

Create `tests/components/ScreenplayToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScreenplayToolbar } from '../../client/src/components/writing/screenplay/ScreenplayToolbar'

describe('ScreenplayToolbar', () => {
  const defaultProps = {
    elementType: 'action' as const,
    wordCount: 0,
    pageCount: 1,
    focusMode: false,
    onElementTypeChange: vi.fn(),
    onToggleFocusMode: vi.fn(),
  }

  it('renders the current element type label', () => {
    render(<ScreenplayToolbar {...defaultProps} elementType="character" />)
    expect(screen.getByDisplayValue('Character')).toBeInTheDocument()
  })

  it('renders word count and page count', () => {
    render(<ScreenplayToolbar {...defaultProps} wordCount={500} pageCount={2} />)
    expect(screen.getByText(/500 words/i)).toBeInTheDocument()
    expect(screen.getByText(/2 pages/i)).toBeInTheDocument()
  })

  it('calls onElementTypeChange when select changes', () => {
    const onElementTypeChange = vi.fn()
    render(<ScreenplayToolbar {...defaultProps} onElementTypeChange={onElementTypeChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dialogue' } })
    expect(onElementTypeChange).toHaveBeenCalledWith('dialogue')
  })

  it('calls onToggleFocusMode when Focus button clicked', () => {
    const onToggleFocusMode = vi.fn()
    render(<ScreenplayToolbar {...defaultProps} onToggleFocusMode={onToggleFocusMode} />)
    fireEvent.click(screen.getByText('Focus'))
    expect(onToggleFocusMode).toHaveBeenCalled()
  })

  it('hides when focusMode is true', () => {
    const { container } = render(<ScreenplayToolbar {...defaultProps} focusMode={true} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npx vitest run tests/components/ScreenplayToolbar.test.tsx
```

Expected: FAIL — module not found

- [ ] **Create `client/src/components/writing/screenplay/ScreenplayToolbar.tsx`**

```tsx
import React from 'react'
import { ElementType, ELEMENT_LABELS } from '../../../lib/screenplay'

const ELEMENT_TYPES: ElementType[] = [
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
]

interface ScreenplayToolbarProps {
  elementType: ElementType
  wordCount: number
  pageCount: number
  focusMode: boolean
  onElementTypeChange: (type: ElementType) => void
  onToggleFocusMode: () => void
}

export function ScreenplayToolbar({
  elementType,
  wordCount,
  pageCount,
  focusMode,
  onElementTypeChange,
  onToggleFocusMode,
}: ScreenplayToolbarProps) {
  if (focusMode) return null

  return (
    <div style={styles.toolbar}>
      <select
        value={elementType}
        onChange={e => onElementTypeChange(e.target.value as ElementType)}
        style={styles.select}
        aria-label="Element type"
      >
        {ELEMENT_TYPES.map(type => (
          <option key={type} value={type}>
            {ELEMENT_LABELS[type]}
          </option>
        ))}
      </select>

      <span style={styles.counts}>
        {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {wordCount} words
      </span>

      <button style={styles.focusBtn} onClick={onToggleFocusMode}>
        Focus
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    width: 816,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    marginBottom: 32,
    flexShrink: 0,
  },
  select: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
    outline: 'none',
  },
  counts: {
    flex: 1,
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
}
```

- [ ] **Run tests to verify they pass**

```bash
npx vitest run tests/components/ScreenplayToolbar.test.tsx
```

Expected: 5 tests PASS

- [ ] **Run full suite**

```bash
npx vitest run
```

Expected: 85 tests PASS

- [ ] **Commit**

```bash
git add client/src/components/writing/screenplay/ScreenplayToolbar.tsx tests/components/ScreenplayToolbar.test.tsx
git commit -m "feat: ScreenplayToolbar — element picker, word/page count, focus mode toggle"
```

---

## Task 6: SceneGutter

**Files:**
- Create: `client/src/components/writing/screenplay/SceneGutter.tsx`
- Create: `tests/components/SceneGutter.test.tsx`

- [ ] **Write failing tests**

Create `tests/components/SceneGutter.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SceneGutter } from '../../client/src/components/writing/screenplay/SceneGutter'

const scene = (index: number, text: string, nodePos: number) => ({ index, text, nodePos })

describe('SceneGutter', () => {
  it('renders nothing when no scenes', () => {
    const { container } = render(<SceneGutter scenes={[]} onSceneClick={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders scene numbers', () => {
    const scenes = [scene(1, 'INT. OFFICE - DAY', 0), scene(2, 'EXT. STREET - NIGHT', 10)]
    render(<SceneGutter scenes={scenes} onSceneClick={vi.fn()} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onSceneClick with nodePos when scene number clicked', () => {
    const onSceneClick = vi.fn()
    const scenes = [scene(1, 'INT. OFFICE - DAY', 42)]
    render(<SceneGutter scenes={scenes} onSceneClick={onSceneClick} />)
    fireEvent.click(screen.getByText('1'))
    expect(onSceneClick).toHaveBeenCalledWith(42)
  })
})
```

- [ ] **Run tests to verify they fail**

```bash
npx vitest run tests/components/SceneGutter.test.tsx
```

Expected: FAIL — module not found

- [ ] **Create `client/src/components/writing/screenplay/SceneGutter.tsx`**

```tsx
import React from 'react'

interface Scene {
  index: number
  text: string
  nodePos: number
}

interface SceneGutterProps {
  scenes: Scene[]
  onSceneClick: (nodePos: number) => void
}

export function SceneGutter({ scenes, onSceneClick }: SceneGutterProps) {
  if (scenes.length === 0) return null

  return (
    <div style={styles.gutter} aria-label="Scene numbers">
      {scenes.map(scene => (
        <button
          key={scene.nodePos}
          style={styles.sceneNum}
          title={scene.text || `Scene ${scene.index}`}
          onClick={() => onSceneClick(scene.nodePos)}
        >
          {scene.index}
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  gutter: {
    width: 32,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    paddingTop: 96 + 32, // page top padding + toolbar height
    gap: 0,
    userSelect: 'none',
  },
  sceneNum: {
    background: 'none',
    border: 'none',
    color: 'hsl(220 13% 40%)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    lineHeight: '16px',
    padding: '0 6px',
    cursor: 'pointer',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
}
```

- [ ] **Run tests to verify they pass**

```bash
npx vitest run tests/components/SceneGutter.test.tsx
```

Expected: 3 tests PASS

- [ ] **Run full suite**

```bash
npx vitest run
```

Expected: 88 tests PASS

- [ ] **Commit**

```bash
git add client/src/components/writing/screenplay/SceneGutter.tsx tests/components/SceneGutter.test.tsx
git commit -m "feat: SceneGutter — scene number list with click-to-scroll"
```

---

## Task 7: Wire ScriptTab

**Files:**
- Modify: `client/src/components/writing/ScriptTab.tsx`

- [ ] **Read current `client/src/components/writing/ScriptTab.tsx`** to understand existing props interface before modifying.

- [ ] **Replace `client/src/components/writing/ScriptTab.tsx` content**

```tsx
import React, { useState, useCallback } from 'react'
import { ScreenplayEditor } from './screenplay/ScreenplayEditor'
import { ScreenplayToolbar } from './screenplay/ScreenplayToolbar'
import { SceneGutter } from './screenplay/SceneGutter'
import { ElementType } from '../../lib/screenplay'

interface SceneHeading {
  index: number
  text: string
  nodePos: number
}

interface ScriptTabProps {
  focusMode?: boolean
  onToggleFocusMode?: () => void
}

export function ScriptTab({ focusMode = false, onToggleFocusMode = () => {} }: ScriptTabProps) {
  const [elementType, setElementType] = useState<ElementType>('scene-heading')
  const [wordCount, setWordCount] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [scenes, setScenes] = useState<SceneHeading[]>([])

  const handleSceneClick = useCallback((nodePos: number) => {
    // Scroll the page div to the scene heading position
    const el = document.querySelector(`[data-node-pos="${nodePos}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div style={styles.wrapper}>
      <ScreenplayToolbar
        elementType={elementType}
        wordCount={wordCount}
        pageCount={pageCount}
        focusMode={focusMode}
        onElementTypeChange={setElementType}
        onToggleFocusMode={onToggleFocusMode}
      />

      <div style={styles.row}>
        <SceneGutter scenes={scenes} onSceneClick={handleSceneClick} />
        <ScreenplayEditor
          onWordCountChange={setWordCount}
          onPageCountChange={setPageCount}
          onElementTypeChange={setElementType}
          onSceneHeadingsChange={setScenes}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100%',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 24px 80px',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
}
```

- [ ] **Run full suite**

```bash
npx vitest run
```

Expected: 88 tests PASS (no regressions — ScriptTab has no new tests, existing tests unaffected)

- [ ] **Start dev server and verify visually**

```bash
npm run dev
```

Open localhost. On Script tab:

1. **Page renders:** warm-glow white page on dark background ✓
2. **Toolbar visible:** element type dropdown shows "Scene Heading" ✓
3. **Type in first paragraph:** it's a scene heading (bold, no indent)
4. **Press Tab:** element type changes to Action in dropdown, paragraph is no longer bold
5. **Press Tab again:** element type changes to Character (indented ~211px)
6. **Type a character name, press Tab:** text uppercases, switches to Dialogue
7. **Press Enter in Dialogue:** new paragraph created, element type = Action
8. **Type a scene heading, press Enter:** scene number "1" appears in left gutter
9. **Click Focus button:** toolbar hides, page fills screen
10. **Press Esc:** toolbar returns

- [ ] **Commit**

```bash
git add client/src/components/writing/ScriptTab.tsx
git commit -m "feat: wire ScriptTab — Tiptap screenplay editor, toolbar, scene gutter (Plan 2 complete)"
```

---

## Plan Complete

**Deliverable:** Fully functional Tiptap screenplay editor replacing the Plan 1 placeholder. All spec acceptance tests satisfied:

| Requirement | Implemented |
|---|---|
| Tab cycles element types | ✓ ScreenplayExtension Tab handler |
| Shift+Tab reverses | ✓ ScreenplayExtension Shift-Tab handler |
| Enter creates next element type | ✓ ScreenplayExtension Enter handler |
| Scene headings uppercase on commit | ✓ uppercaseCurrentBlock command |
| Character names uppercase on commit | ✓ uppercaseCurrentBlock command |
| Empty Dialogue → Character on Backspace | ✓ ScreenplayExtension Backspace handler |
| Empty Character → Action on Backspace | ✓ ScreenplayExtension Backspace handler |
| WGA indentation in CSS | ✓ screenplay.css |
| Scene number gutter | ✓ SceneGutter component |
| Element type picker (toolbar) | ✓ ScreenplayToolbar select |
| Word count + page count | ✓ ScreenplayToolbar display |
| Focus mode button | ✓ ScreenplayToolbar → Shell |

**Plan 3:** Writing Partner AI transcript + @mention routing to specialists + Writer's Room integration with existing workspace components.
