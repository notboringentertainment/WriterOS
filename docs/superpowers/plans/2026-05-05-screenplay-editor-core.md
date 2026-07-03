# Screenplay Editor Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the screenplay editor genuinely usable — persistent script content, toolbar-to-editor element type control, tested TipTap extension commands, and scene extraction wired through ProjectState/localStorage.

**Architecture:** `ProjectState.script` gains a typed `rawHtml: string` field (TipTap HTML, stored directly in localStorage) and `scenes: ScriptScene[]` (derived headings for AI context). `ScreenplayEditor` gains `initialContent`, `onContentChange` (debounced 500ms), and `onEditorReady` props. `ScriptTab` holds a `useRef<Editor>` populated via `onEditorReady` so the toolbar dropdown calls `editor.commands.setElementType(type)` directly on the TipTap instance — not just local React state. App.tsx passes `project.state.script.rawHtml` as `initialScript` and `project.updateScript` as `onScriptChange`.

**Tech Stack:** TipTap v3 (`@tiptap/core ^3.22.5`), Vitest 4 + jsdom 29, React Testing Library, TypeScript, existing `useProjectState` mutation pattern.

**Out of scope:** import/export (Fountain, FDX), revision history, character autocomplete, print-to-PDF, pagination engine. This plan ships the minimum to make the editor genuinely usable.

---

## File Map

```
client/src/lib/
  projectState.ts              MODIFY — add ScriptScene type, retype script field, add updateScript mutation
  useProjectState.ts           MODIFY — expose updateScript in returned actions

client/src/components/writing/screenplay/
  ScreenplayEditor.tsx         MODIFY — add initialContent, onContentChange (debounced 500ms), onEditorReady props

client/src/components/writing/
  ScriptTab.tsx                MODIFY — hold editorRef via onEditorReady, toolbar calls setElementType on editor,
                                        accept initialScript + onScriptChange props

client/src/
  App.tsx                      MODIFY — pass initialScript + onScriptChange to ScriptTab

tests/lib/
  projectState.test.ts         MODIFY — ScriptScene type check + updateScript mutation tests
  useProjectState.test.ts      MODIFY — add updateScript hook test

tests/components/
  ScreenplayExtension.test.ts  NEW — TipTap command tests: setElementType, uppercaseCurrentBlock,
                                     command chains that mirror Tab/Enter shortcut logic
  ScriptTab.test.tsx           NEW — toolbar renders, onEditorReady callback, script prop acceptance
```

---

### Task 1: Type the script model and add updateScript mutation

**Files:**
- Modify: `client/src/lib/projectState.ts`
- Modify: `client/src/lib/useProjectState.ts`
- Modify: `tests/lib/projectState.test.ts`
- Modify: `tests/lib/useProjectState.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/lib/projectState.test.ts` (after existing imports and tests):

```typescript
import type { ScriptScene } from '../../client/src/lib/projectState'

describe('script field — typed shape', () => {
  it('defaultProjectState has rawHtml empty string', () => {
    const state = defaultProjectState()
    expect(state.script.rawHtml).toBe('')
  })

  it('defaultProjectState has empty scenes array', () => {
    const state = defaultProjectState()
    expect(state.script.scenes).toEqual([])
  })

  it('migrateState converts old unknown[] shape to new shape', () => {
    const old = {
      schemaVersion: 1,
      script: { scenes: [], elements: [], revisionHistory: [] },
    }
    const migrated = migrateState(old)
    expect(migrated.script.rawHtml).toBe('')
    expect(Array.isArray(migrated.script.scenes)).toBe(true)
  })

  it('migrateState preserves existing rawHtml', () => {
    const old = { schemaVersion: 1, script: { rawHtml: '<p>hello</p>', scenes: [] } }
    const migrated = migrateState(old)
    expect(migrated.script.rawHtml).toBe('<p>hello</p>')
  })
})
```

Add to `tests/lib/useProjectState.test.ts` (after existing imports and tests; import `act` and `renderHook` from `@testing-library/react` — they are already imported in the file):

```typescript
import type { ScriptScene } from '../../client/src/lib/projectState'

it('updateScript stores rawHtml and scenes', () => {
  const { result } = renderHook(() => useProjectState())
  const scenes: ScriptScene[] = [{ id: 's1', heading: 'INT. ROOM - DAY', index: 1 }]
  act(() => result.current.updateScript('<p>hello</p>', scenes))
  expect(result.current.state.script.rawHtml).toBe('<p>hello</p>')
  expect(result.current.state.script.scenes).toEqual(scenes)
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm run test:run -- tests/lib/projectState.test.ts tests/lib/useProjectState.test.ts
```

Expected: FAIL — `ScriptScene` not exported, `script.rawHtml` doesn't exist, `updateScript` not defined.

- [ ] **Step 3: Add ScriptScene type and update projectState.ts**

In `client/src/lib/projectState.ts`:

Add `ScriptScene` interface (place it after the `TranscriptMessage` interface):

```typescript
export interface ScriptScene {
  id: string
  heading: string
  index: number
}
```

Update the `script` field in the `ProjectState` interface:

```typescript
script: { rawHtml: string; scenes: ScriptScene[]; revisionHistory: unknown[] }
```

Update `defaultProjectState()` — change the script field:

```typescript
script: { rawHtml: '', scenes: [], revisionHistory: [] },
```

In `migrateState`, add a script migration block. Place it after the existing `for (const key of Object.keys(defaults) as (keyof ProjectState)[])` loop:

```typescript
// Migrate script field from unknown[] shape to typed shape
const rawScript =
  state.script && typeof state.script === 'object'
    ? (state.script as Record<string, unknown>)
    : {}
state.script = {
  rawHtml: typeof rawScript.rawHtml === 'string' ? rawScript.rawHtml : '',
  scenes: Array.isArray(rawScript.scenes) ? (rawScript.scenes as ScriptScene[]) : [],
  revisionHistory: Array.isArray(rawScript.revisionHistory) ? rawScript.revisionHistory : [],
}
```

- [ ] **Step 4: Add updateScript to useProjectState.ts**

In `client/src/lib/useProjectState.ts`, add `ScriptScene` to the existing import from `./projectState`:

```typescript
import {
  type ScriptScene,
  loadProjectState,
  saveProjectState,
  type ProjectState,
  type AgentId,
  type TranscriptMessage,
} from './projectState'
```

Inside the hook body, add `updateScript` alongside the existing `addMessage` mutation:

```typescript
const updateScript = useCallback((rawHtml: string, scenes: ScriptScene[]) => {
  setState(prev => {
    const next = { ...prev, script: { ...prev.script, rawHtml, scenes } }
    saveProjectState(next)
    return next
  })
}, [])
```

Add `updateScript` to the return object — add it to the existing return, do not remove other fields:

```typescript
return { state, addMessage, updateScript, /* ...keep all other existing fields */ }
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm run test:run -- tests/lib/projectState.test.ts tests/lib/useProjectState.test.ts
```

Expected: all new tests PASS.

- [ ] **Step 6: Full suite + typecheck**

```bash
npm run test:run && npm run check
```

Expected: all tests pass, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/projectState.ts client/src/lib/useProjectState.ts \
        tests/lib/projectState.test.ts tests/lib/useProjectState.test.ts
git commit -m "feat: add ScriptScene type and updateScript mutation to ProjectState"
```

---

### Task 2: Add initialContent, onContentChange, and onEditorReady to ScreenplayEditor

**Files:**
- Modify: `client/src/components/writing/screenplay/ScreenplayEditor.tsx`

- [ ] **Step 1: Write smoke-test to verify ScreenplayExtension imports in a bare Editor**

Create `tests/components/ScreenplayExtension.test.ts` (the full tests come in Task 3 — this just confirms the TipTap Editor can be instantiated in jsdom before we invest in more tests):

```typescript
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { ScreenplayExtension } from '../../client/src/components/writing/screenplay/ScreenplayExtension'

describe('ScreenplayExtension — smoke', () => {
  it('Editor instantiates with ScreenplayExtension in jsdom', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, ScreenplayExtension],
      content: '<p data-element-type="action">Hello</p>',
    })
    expect(editor.state.doc.firstChild?.attrs.elementType).toBe('action')
    editor.destroy()
  })
})
```

```bash
npm run test:run -- tests/components/ScreenplayExtension.test.ts
```

Expected: PASS. If `new Editor(...)` throws, add `element: document.createElement('div')` to the options object — TipTap v3 may require a mount target even for headless use:

```typescript
const el = document.createElement('div')
document.body.appendChild(el)
const editor = new Editor({
  element: el,
  extensions: [Document, Paragraph, Text, ScreenplayExtension],
  content: '<p data-element-type="action">Hello</p>',
})
// ...
editor.destroy()
el.remove()
```

Fix until this test passes before continuing.

- [ ] **Step 2: Update ScreenplayEditorProps**

In `client/src/components/writing/screenplay/ScreenplayEditor.tsx`, add `Editor` type import:

```typescript
import type { Editor } from '@tiptap/core'
```

Replace the `ScreenplayEditorProps` interface with:

```typescript
interface ScreenplayEditorProps {
  initialContent?: string
  onContentChange?: (html: string) => void
  onEditorReady?: (editor: Editor) => void
  onWordCountChange?: (count: number) => void
  onPageCountChange?: (count: number) => void
  onElementTypeChange?: (type: ElementType) => void
  onSceneHeadingsChange?: (headings: Array<{ index: number; text: string; nodePos: number }>) => void
}
```

- [ ] **Step 3: Implement debounced onContentChange and onEditorReady**

Add `useRef` to the existing React import. Replace the full `ScreenplayEditor` function with:

```typescript
export function ScreenplayEditor({
  initialContent,
  onContentChange,
  onEditorReady,
  onWordCountChange,
  onPageCountChange,
  onElementTypeChange,
  onSceneHeadingsChange,
}: ScreenplayEditorProps) {
  const editorDivRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep a stable ref so the debounced callback always calls the latest prop value
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange

  const updatePageCount = useCallback(() => {
    if (!editorDivRef.current) return
    const pageHeightPx = 11 * 96
    const pages = Math.max(1, Math.round(editorDivRef.current.scrollHeight / pageHeightPx))
    onPageCountChange?.(pages)
  }, [onPageCountChange])

  const editor = useEditor({
    extensions: [Document, Paragraph, Text, History, ScreenplayExtension],
    content: initialContent || '<p data-element-type="scene-heading"></p>',

    onCreate({ editor }) {
      onEditorReady?.(editor)
    },

    onUpdate({ editor }) {
      onWordCountChange?.(countWords(editor.getText()))
      updatePageCount()

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onContentChangeRef.current?.(editor.getHTML())
      }, 500)

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

    onSelectionUpdate({ editor }) {
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
```

- [ ] **Step 4: Typecheck**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/writing/screenplay/ScreenplayEditor.tsx \
        tests/components/ScreenplayExtension.test.ts
git commit -m "feat: add initialContent, onContentChange, onEditorReady to ScreenplayEditor"
```

---

### Task 3: TipTap extension command tests

**Files:**
- Modify: `tests/components/ScreenplayExtension.test.ts`

**Context:** TipTap's keyboard shortcut handlers in `ScreenplayExtension.ts` call `editor.commands.setElementType`, `editor.commands.uppercaseCurrentBlock`, `editor.chain().splitBlock().setElementType(nextType).run()`, etc. These commands are already implemented. Testing them via `editor.commands.*` in a headless jsdom Editor verifies the extension logic without relying on keyboard event simulation (which is unreliable in jsdom / ProseMirror).

- [ ] **Step 1: Replace the smoke test with the full test suite**

Replace the full contents of `tests/components/ScreenplayExtension.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { ScreenplayExtension } from '../../client/src/components/writing/screenplay/ScreenplayExtension'
import type { ElementType } from '../../client/src/lib/screenplay'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mountEl: HTMLElement | undefined

function makeEditor(content: string): Editor {
  // Provide a real DOM element in case TipTap v3 requires one
  mountEl = document.createElement('div')
  document.body.appendChild(mountEl)
  return new Editor({
    element: mountEl,
    extensions: [Document, Paragraph, Text, ScreenplayExtension],
    content,
  })
}

function nodeType(editor: Editor, childIndex = 0): ElementType {
  return (editor.state.doc.child(childIndex).attrs.elementType ?? 'action') as ElementType
}

afterEach(() => {
  mountEl?.remove()
  mountEl = undefined
})

// ---------------------------------------------------------------------------
// setElementType command
// ---------------------------------------------------------------------------

describe('setElementType command', () => {
  let editor: Editor

  beforeEach(() => {
    editor = makeEditor('<p data-element-type="action">Hello</p>')
  })

  afterEach(() => editor.destroy())

  it('action → character', () => {
    editor.commands.setElementType('character')
    expect(nodeType(editor)).toBe('character')
  })

  it('action → scene-heading', () => {
    editor.commands.setElementType('scene-heading')
    expect(nodeType(editor)).toBe('scene-heading')
  })

  it('action → dialogue', () => {
    editor.commands.setElementType('dialogue')
    expect(nodeType(editor)).toBe('dialogue')
  })

  it('action → parenthetical', () => {
    editor.commands.setElementType('parenthetical')
    expect(nodeType(editor)).toBe('parenthetical')
  })

  it('action → transition', () => {
    editor.commands.setElementType('transition')
    expect(nodeType(editor)).toBe('transition')
  })
})

// ---------------------------------------------------------------------------
// uppercaseCurrentBlock command
// ---------------------------------------------------------------------------

describe('uppercaseCurrentBlock command', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('uppercases mixed-case text', () => {
    editor = makeEditor('<p data-element-type="action">hello world</p>')
    editor.commands.selectAll()
    editor.commands.uppercaseCurrentBlock()
    expect(editor.state.doc.firstChild?.textContent).toBe('HELLO WORLD')
  })

  it('no-ops on already-uppercase text', () => {
    editor = makeEditor('<p data-element-type="action">ALREADY</p>')
    editor.commands.uppercaseCurrentBlock()
    expect(editor.state.doc.firstChild?.textContent).toBe('ALREADY')
  })

  it('no-ops on empty block', () => {
    editor = makeEditor('<p data-element-type="action"></p>')
    editor.commands.uppercaseCurrentBlock()
    expect(editor.state.doc.firstChild?.textContent).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tab logic — command chains mirroring the Tab shortcut handler
// The handler does: getTabNext(current) then setElementType or
//                   chain().uppercaseCurrentBlock().setElementType().run()
// ---------------------------------------------------------------------------

describe('Tab shortcut logic (via command chains)', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('action → character (Tab cycles via setElementType)', () => {
    editor = makeEditor('<p data-element-type="action">Hello</p>')
    // getTabNext('action') = 'character'; shouldUppercase('action') = false
    editor.commands.setElementType('character')
    expect(nodeType(editor)).toBe('character')
  })

  it('scene-heading → uppercases text then cycles to action', () => {
    editor = makeEditor('<p data-element-type="scene-heading">int. room - day</p>')
    // getTabNext('scene-heading') = 'action'; shouldUppercase('scene-heading') = true
    editor.chain().uppercaseCurrentBlock().setElementType('action').run()
    expect(editor.state.doc.firstChild?.textContent).toBe('INT. ROOM - DAY')
    expect(nodeType(editor)).toBe('action')
  })

  it('character → uppercases then cycles to dialogue', () => {
    editor = makeEditor('<p data-element-type="character">alex</p>')
    // getTabNext('character') = 'dialogue'; shouldUppercase('character') = true
    editor.chain().uppercaseCurrentBlock().setElementType('dialogue').run()
    expect(editor.state.doc.firstChild?.textContent).toBe('ALEX')
    expect(nodeType(editor)).toBe('dialogue')
  })
})

// ---------------------------------------------------------------------------
// Enter logic — splitBlock then setElementType
// The handler only fires when cursor is at end of block.
// ---------------------------------------------------------------------------

describe('Enter shortcut logic (via splitBlock + setElementType chains)', () => {
  let editor: Editor

  afterEach(() => editor.destroy())

  it('character block → Enter → creates dialogue block', () => {
    editor = makeEditor('<p data-element-type="character">ALEX</p>')
    // Move cursor to end
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('character') = 'dialogue'; shouldUppercase('character') = true
    editor.chain().uppercaseCurrentBlock().splitBlock().setElementType('dialogue').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('dialogue')
  })

  it('action block → Enter → creates another action block', () => {
    editor = makeEditor('<p data-element-type="action">A hero walks in.</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('action') = 'action'; shouldUppercase('action') = false
    editor.chain().splitBlock().setElementType('action').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('action')
  })

  it('scene-heading → Enter → creates action block', () => {
    editor = makeEditor('<p data-element-type="scene-heading">INT. ROOM - DAY</p>')
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    // getEnterNext('scene-heading') = 'action'; shouldUppercase('scene-heading') = true
    editor.chain().uppercaseCurrentBlock().splitBlock().setElementType('action').run()
    expect(editor.state.doc.childCount).toBe(2)
    expect(nodeType(editor, 1)).toBe('action')
  })
})
```

- [ ] **Step 2: Run to confirm failures (implementation is in place — failures are setup issues only)**

```bash
npm run test:run -- tests/components/ScreenplayExtension.test.ts
```

Expected: tests should pass since `setElementType` and `uppercaseCurrentBlock` are already implemented. If any test fails with "not a function" or constructor errors, fix the Editor instantiation (see Task 2 Step 1 note about `element`). Do not change the extension implementation.

- [ ] **Step 3: Run full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/components/ScreenplayExtension.test.ts
git commit -m "test: TipTap extension command tests for setElementType and Enter/Tab logic"
```

---

### Task 4: Wire toolbar dropdown → editor via ScriptTab editorRef

**Files:**
- Modify: `client/src/components/writing/ScriptTab.tsx`

**Context:** Currently `ScriptTab` passes `onElementTypeChange={setElementType}` directly to the toolbar. The toolbar fires `onElementTypeChange` when the user picks a type from the dropdown, updating React display state — but `editor.commands.setElementType(type)` is never called, so the TipTap block type is unchanged. This task adds: `editorRef` populated via `onEditorReady`, and `handleToolbarElementTypeChange` that calls both `setElementType` (React display) and `editorRef.current?.commands.setElementType(type)` (TipTap editor).

- [ ] **Step 1: Write failing tests**

Create `tests/components/ScriptTab.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'

describe('ScriptTab', () => {
  it('renders element type toolbar', () => {
    render(<ScriptTab />)
    expect(screen.getByRole('combobox', { name: /element type/i })).toBeInTheDocument()
  })

  it('toolbar default value is scene-heading', async () => {
    render(<ScriptTab />)
    // Wait for TipTap onCreate to fire and onSelectionUpdate to reflect first block type
    await new Promise(r => setTimeout(r, 150))
    const select = screen.getByRole('combobox', { name: /element type/i }) as HTMLSelectElement
    expect(select.value).toBe('scene-heading')
  })

  it('accepts onEditorReady prop and calls it with editor', async () => {
    const onEditorReady = vi.fn()
    render(<ScriptTab onEditorReady={onEditorReady} />)
    await new Promise(r => setTimeout(r, 150))
    expect(onEditorReady).toHaveBeenCalledOnce()
    expect(onEditorReady.mock.calls[0][0]).toBeTruthy()
  })

  it('accepts initialScript and onScriptChange props without error', () => {
    const onScriptChange = vi.fn()
    expect(() =>
      render(
        <ScriptTab
          initialScript="<p data-element-type='action'>Test</p>"
          onScriptChange={onScriptChange}
        />
      )
    ).not.toThrow()
  })
})
```

```bash
npm run test:run -- tests/components/ScriptTab.test.tsx
```

Expected: FAIL — `onEditorReady`, `initialScript`, `onScriptChange` props don't exist on `ScriptTab`.

- [ ] **Step 2: Replace ScriptTab.tsx**

Replace the full contents of `client/src/components/writing/ScriptTab.tsx` with:

```typescript
import React, { useState, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { ScreenplayEditor } from './screenplay/ScreenplayEditor'
import { ScreenplayToolbar } from './screenplay/ScreenplayToolbar'
import { SceneGutter } from './screenplay/SceneGutter'
import { ElementType } from '../../lib/screenplay'
import type { ScriptScene } from '../../lib/projectState'

interface SceneHeading {
  index: number
  text: string
  nodePos: number
}

interface ScriptTabProps {
  focusMode?: boolean
  onToggleFocusMode?: () => void
  initialScript?: string
  onScriptChange?: (html: string, scenes: ScriptScene[]) => void
  onEditorReady?: (editor: Editor) => void
}

export function ScriptTab({
  focusMode = false,
  onToggleFocusMode = () => {},
  initialScript,
  onScriptChange,
  onEditorReady,
}: ScriptTabProps) {
  const [elementType, setElementType] = useState<ElementType>('scene-heading')
  const [wordCount, setWordCount] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [scenes, setScenes] = useState<SceneHeading[]>([])

  const editorRef = useRef<Editor | null>(null)
  const scenesRef = useRef<SceneHeading[]>([])

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      onEditorReady?.(editor)
    },
    [onEditorReady]
  )

  // Toolbar dropdown → sets React display state AND the TipTap block type
  const handleToolbarElementTypeChange = useCallback((type: ElementType) => {
    setElementType(type)
    editorRef.current?.commands.setElementType(type)
  }, [])

  const handleSceneHeadingsChange = useCallback((headings: SceneHeading[]) => {
    scenesRef.current = headings
    setScenes(headings)
  }, [])

  const handleContentChange = useCallback(
    (html: string) => {
      onScriptChange?.(
        html,
        scenesRef.current.map((h, i) => ({
          id: `scene-${i}`,
          heading: h.text,
          index: h.index,
        }))
      )
    },
    [onScriptChange]
  )

  const handleSceneClick = useCallback((nodePos: number) => {
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
        onElementTypeChange={handleToolbarElementTypeChange}
        onToggleFocusMode={onToggleFocusMode}
      />

      <div style={styles.row}>
        <SceneGutter scenes={scenes} onSceneClick={handleSceneClick} />
        <ScreenplayEditor
          initialContent={initialScript}
          onContentChange={handleContentChange}
          onEditorReady={handleEditorReady}
          onWordCountChange={setWordCount}
          onPageCountChange={setPageCount}
          onElementTypeChange={setElementType}
          onSceneHeadingsChange={handleSceneHeadingsChange}
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

- [ ] **Step 3: Run tests**

```bash
npm run test:run -- tests/components/ScriptTab.test.tsx
```

Expected: all PASS.

- [ ] **Step 4: Full suite + typecheck**

```bash
npm run test:run && npm run check
```

Expected: all tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/writing/ScriptTab.tsx tests/components/ScriptTab.test.tsx
git commit -m "feat: wire toolbar→editor setElementType and add script persistence props to ScriptTab"
```

---

### Task 5: Wire ScriptTab ↔ ProjectState in App.tsx

**Files:**
- Modify: `client/src/App.tsx`

**Context:** `ScriptTab` now accepts `initialScript` and `onScriptChange`. `useProjectState()` in `App.tsx` now returns `updateScript`. This task connects them so content persists through localStorage on every edit.

- [ ] **Step 1: Find the ScriptTab render in App.tsx**

```bash
grep -n 'ScriptTab' client/src/App.tsx
```

It currently renders approximately:
```tsx
<ScriptTab focusMode={shellState.focusMode} onToggleFocusMode={shellState.toggleFocusMode} />
```

- [ ] **Step 2: Add ScriptScene to the projectState import**

In `client/src/App.tsx`, locate the import from `'./lib/projectState'` and add `ScriptScene`:

```typescript
import type { TranscriptMessage, AgentId, ScriptScene } from './lib/projectState'
```

- [ ] **Step 3: Wire the script props**

Replace the `<ScriptTab .../>` render with:

```tsx
<ScriptTab
  focusMode={shellState.focusMode}
  onToggleFocusMode={shellState.toggleFocusMode}
  initialScript={project.state.script.rawHtml || undefined}
  onScriptChange={(html, scenes) => project.updateScript(html, scenes)}
/>
```

Passing `undefined` when `rawHtml` is `''` ensures `ScreenplayEditor` uses its default blank scene-heading paragraph rather than loading an empty HTML string.

- [ ] **Step 4: Typecheck**

```bash
npm run check
```

Expected: clean. If `project.updateScript` shows as "does not exist", verify Task 1 Step 4 added it to the `useProjectState` return object.

- [ ] **Step 5: Full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wire ScriptTab initialScript and onScriptChange to ProjectState"
```

---

### Task 6: Verify and push

**Files:** No new files.

- [ ] **Step 1: Full verification**

```bash
npm run test:run && npm run check && npm run build
```

Expected: all tests pass, typecheck clean, build clean.

- [ ] **Step 2: Smoke test persistence at http://127.0.0.1:5000**

1. Open `http://127.0.0.1:5000`
2. Navigate to Script tab
3. Type `INT. COFFEE SHOP - DAY` — confirm text becomes uppercase (scene-heading auto-uppercase)
4. Press Tab — confirm toolbar switches to `Action`
5. Type a line of action
6. Press Enter — confirm next block is also `Action`
7. Click "Character" in toolbar dropdown — confirm the current block switches to character CSS formatting
8. Refresh page — confirm all typed text is still present (localStorage persistence working)

If step 7 fails (toolbar doesn't change editor): `editorRef.current` may be null when `handleToolbarElementTypeChange` fires. Add `console.log('editorRef', editorRef.current)` in that callback to debug.

If step 8 fails (content lost on refresh): add `console.log('initialScript', project.state.script.rawHtml)` in App.tsx just before the ScriptTab render to verify it's non-empty after typing.

- [ ] **Step 3: Final commit for any bug fixes found during verification**

```bash
git add -p
git commit -m "fix: <describe specific issue found>"
```

- [ ] **Step 4: Push branch**

```bash
git push origin feature/screenplay-editor-core
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Script content persisted to ProjectState.script | T1 types it, T5 wires it |
| Toolbar picks set TipTap block type | T4 (handleToolbarElementTypeChange → editorRef.setElementType) |
| Tested keyboard formatting behavior | T3 (command chain tests mirroring Tab/Enter handlers) |
| Scene extraction | already in ScreenplayEditor; persisted to scenes[] in T4 handleContentChange |
| Save/load via ProjectState/localStorage | T5 (initialScript + onScriptChange → updateScript → saveProjectState) |

### Placeholder scan

No TBDs, no "similar to Task N", no steps without code, no missing type definitions.

### Type consistency

- `ScriptScene` — defined in T1 (`projectState.ts`), imported in T4 (`ScriptTab.tsx`), T5 (`App.tsx`). Same signature everywhere: `{ id, heading, index }`.
- `onEditorReady: (editor: Editor) => void` — `Editor` from `@tiptap/core` used consistently in `ScreenplayEditor.tsx` (T2), `ScriptTab.tsx` (T4).
- `updateScript(html: string, scenes: ScriptScene[])` — same signature in `useProjectState.ts` (T1) and called in `App.tsx` (T5).
- `handleContentChange` maps `scenesRef.current` (local `SceneHeading[]`) to `ScriptScene[]` inline — `ScriptScene` has no `nodePos`, which is correct (nodePos is ephemeral editor state, not persisted).
