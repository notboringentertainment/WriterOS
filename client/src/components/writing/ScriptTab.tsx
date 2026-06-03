import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { ScreenplayEditor } from './screenplay/ScreenplayEditor'
import { ScreenplayToolbar } from './screenplay/ScreenplayToolbar'
import { SceneGutter } from './screenplay/SceneGutter'
import { TitlePagePanel } from './TitlePagePanel'
import { ScriptFactsPanel } from './ScriptFactsPanel'
import { ScriptScratchpadPanel } from './ScriptScratchpadPanel'
import { ElementType } from '../../lib/screenplay'
import type { ScriptScene, TitlePageMetadata } from '../../lib/projectState'
import type { ScriptFocusState } from '../../lib/scriptIndex'
import { stripScriptHtmlFallback } from '../../lib/scriptIndex'
import { hashScriptHtml } from '../../lib/scriptBlocks'
import type { ScriptFactsCache, ScriptFactSection, ScriptFactWarning } from '../../lib/scriptFacts'
import { liveScriptBlocksFromDoc, resolveFactOccurrences } from '../../lib/scriptFactNavigation'
import {
  addScratchpadItem,
  currentSceneFromHeadings,
  pinScratchpadItem,
  removeScratchpadItem,
  resolvePinnedSceneHeading,
  setScratchpadItemType,
  toggleScratchpadItem,
  unpinScratchpadItem,
  updateScratchpadItemText,
  type ScratchpadItemType,
  type ScratchpadPinnedScene,
  type ScratchpadState,
} from '../../lib/scriptScratchpad'
import type { ProjectFormat } from '@shared/projectFormat'

interface SceneHeading {
  index: number
  text: string
  nodePos: number
}

interface ScriptTabProps {
  focusMode?: boolean
  onToggleFocusMode?: () => void
  initialScript?: string
  projectTitle?: string
  projectFormat?: ProjectFormat
  titlePage?: TitlePageMetadata
  onProjectTitleChange?: (title: string) => void
  onTitlePageChange?: (patch: Partial<TitlePageMetadata>) => void
  onScriptChange?: (html: string, scenes: ScriptScene[]) => void
  onScriptSnapshotChange?: (snapshot: { rawHtml: string; scenes: ScriptScene[]; focus?: ScriptFocusState }) => void
  scriptFacts?: ScriptFactsCache
  onRebuildScriptFacts?: (snapshot: { rawHtml: string; scenes: ScriptScene[] }) => void
  scratchpad?: ScratchpadState
  onScratchpadChange?: (updater: (scratchpad: ScratchpadState) => ScratchpadState) => void
  onEditorReady?: (editor: Editor) => void
  onImportFdx?: (file: File) => void | Promise<void>
  onReplaceFdx?: (file: File) => void | Promise<void>
  importingFdx?: boolean
  importError?: string | null
  importWarnings?: string[]
}

export function ScriptTab({
  focusMode = false,
  onToggleFocusMode = () => {},
  initialScript,
  projectTitle = '',
  projectFormat = 'feature',
  titlePage,
  onProjectTitleChange,
  onTitlePageChange,
  onScriptChange,
  onScriptSnapshotChange,
  scriptFacts,
  onRebuildScriptFacts,
  scratchpad,
  onScratchpadChange,
  onEditorReady,
  onImportFdx,
  onReplaceFdx,
  importingFdx = false,
  importError = null,
  importWarnings = [],
}: ScriptTabProps) {
  const [elementType, setElementType] = useState<ElementType>('scene-heading')
  const [wordCount, setWordCount] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [scenes, setScenes] = useState<SceneHeading[]>([])
  const [titlePageOpen, setTitlePageOpen] = useState(false)
  const [currentScriptHash, setCurrentScriptHash] = useState(() => hashScriptHtml(initialScript ?? ''))

  const editorRef = useRef<Editor | null>(null)
  const scenesRef = useRef<SceneHeading[]>([])
  const scriptHashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navCursorRef = useRef<{ key: string; index: number } | null>(null)
  const importFdxInputRef = useRef<HTMLInputElement>(null)
  const replaceFdxInputRef = useRef<HTMLInputElement>(null)

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      onEditorReady?.(editor)
    },
    [onEditorReady]
  )

  useEffect(() => {
    return () => {
      if (scriptHashTimerRef.current) clearTimeout(scriptHashTimerRef.current)
    }
  }, [])

  const scheduleCurrentScriptHash = useCallback((html: string) => {
    if (!scriptFacts || !onRebuildScriptFacts) return
    if (scriptHashTimerRef.current) clearTimeout(scriptHashTimerRef.current)

    scriptHashTimerRef.current = setTimeout(() => {
      setCurrentScriptHash(hashScriptHtml(html))
      scriptHashTimerRef.current = null
    }, 500)
  }, [onRebuildScriptFacts, scriptFacts])

  // Toolbar dropdown → update React display state AND the TipTap block type
  const handleToolbarElementTypeChange = useCallback((type: ElementType) => {
    setElementType(type)
    editorRef.current?.commands.setElementType(type)
  }, [])

  const handleSceneHeadingsChange = useCallback((headings: SceneHeading[]) => {
    scenesRef.current = headings
    setScenes(headings)
  }, [])

  const currentScriptScenes = useCallback((): ScriptScene[] => {
    return editorRef.current
      ? scriptScenesFromEditor(editorRef.current)
      : scriptScenesFromHeadings(scenesRef.current)
  }, [])

  const handleContentChange = useCallback(
    (html: string) => {
      onScriptChange?.(html, currentScriptScenes())
    },
    [currentScriptScenes, onScriptChange]
  )

  const handleContentSnapshotChange = useCallback(
    (snapshot: { html: string; focus?: ScriptFocusState }) => {
      scheduleCurrentScriptHash(snapshot.html)
      onScriptSnapshotChange?.({
        rawHtml: snapshot.html,
        scenes: currentScriptScenes(),
        focus: snapshot.focus,
      })
    },
    [currentScriptScenes, onScriptSnapshotChange, scheduleCurrentScriptHash]
  )

  const handleRebuildScriptFacts = useCallback(() => {
    const rawHtml = editorRef.current?.getHTML() ?? initialScript ?? ''
    setCurrentScriptHash(hashScriptHtml(rawHtml))
    onRebuildScriptFacts?.({
      rawHtml,
      scenes: currentScriptScenes(),
    })
  }, [currentScriptScenes, initialScript, onRebuildScriptFacts])

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

  const handleSceneClick = useCallback((nodePos: number) => {
    const el = document.querySelector(`[data-node-pos="${nodePos}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const resolveCurrentScene = useCallback((): ScratchpadPinnedScene | null => {
    const headings = scenesRef.current
    if (headings.length === 0) return null
    const cursorPos = editorRef.current?.state.selection.from ?? 0
    return (
      currentSceneFromHeadings(headings, cursorPos) ??
      { heading: headings[0].text, index: headings[0].index }
    )
  }, [])

  const handleAddScratchpadItem = useCallback(
    (type: ScratchpadItemType) => onScratchpadChange?.(s => addScratchpadItem(s, type)),
    [onScratchpadChange]
  )

  const handleChangeScratchpadItemText = useCallback(
    (id: string, text: string) => onScratchpadChange?.(s => updateScratchpadItemText(s, id, text)),
    [onScratchpadChange]
  )

  const handleChangeScratchpadItemType = useCallback(
    (id: string, type: ScratchpadItemType) => onScratchpadChange?.(s => setScratchpadItemType(s, id, type)),
    [onScratchpadChange]
  )

  const handleToggleScratchpadItem = useCallback(
    (id: string) => onScratchpadChange?.(s => toggleScratchpadItem(s, id)),
    [onScratchpadChange]
  )

  const handleRemoveScratchpadItem = useCallback(
    (id: string) => onScratchpadChange?.(s => removeScratchpadItem(s, id)),
    [onScratchpadChange]
  )

  const handlePinScratchpadItem = useCallback(
    (id: string) => {
      const scene = resolveCurrentScene()
      if (!scene) return
      onScratchpadChange?.(s => pinScratchpadItem(s, id, scene))
    },
    [onScratchpadChange, resolveCurrentScene]
  )

  const handleUnpinScratchpadItem = useCallback(
    (id: string) => onScratchpadChange?.(s => unpinScratchpadItem(s, id)),
    [onScratchpadChange]
  )

  const handleGoToPinnedScene = useCallback(
    (scene: ScratchpadPinnedScene) => {
      const heading = resolvePinnedSceneHeading(scenesRef.current, scene)
      if (heading) handleSceneClick(heading.nodePos)
    },
    [handleSceneClick]
  )

  const handleImportFdxFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !onImportFdx) return

    void onImportFdx(file)
  }, [onImportFdx])

  const handleReplaceFdxFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !onReplaceFdx) return

    const currentScriptHtml = editorRef.current?.getHTML() ?? initialScript ?? ''
    const hasExistingScript = stripScriptHtmlFallback(currentScriptHtml).length > 0
    if (
      hasExistingScript &&
      !window.confirm('Replace the current script with this Final Draft import? This cannot be undone.')
    ) {
      return
    }

    void onReplaceFdx(file)
  }, [initialScript, onReplaceFdx])

  const canEditTitlePage = Boolean(titlePage && onProjectTitleChange && onTitlePageChange)

  return (
    <div data-testid="script-tab-surface" style={styles.wrapper}>
      <div style={styles.pageWrapper}>
        {!focusMode && (
          <p style={styles.surfaceNote}>
            Script pages are for formatted scenes and line-level craft. Writing Partner stays primary here; mention @Maya for dialogue and voice.
          </p>
        )}
        <ScreenplayToolbar
          elementType={elementType}
          wordCount={wordCount}
          pageCount={pageCount}
          focusMode={focusMode}
          onElementTypeChange={handleToolbarElementTypeChange}
          onToggleFocusMode={onToggleFocusMode}
          onOpenTitlePage={canEditTitlePage ? () => setTitlePageOpen(true) : undefined}
          onImportFdx={onImportFdx ? () => importFdxInputRef.current?.click() : undefined}
          onReplaceFdx={onReplaceFdx ? () => replaceFdxInputRef.current?.click() : undefined}
          importingFdx={importingFdx}
        />
        <input
          ref={importFdxInputRef}
          data-testid="script-fdx-import-input"
          type="file"
          accept=".fdx,application/xml,text/xml"
          style={styles.hiddenInput}
          onChange={handleImportFdxFile}
        />
        <input
          ref={replaceFdxInputRef}
          data-testid="script-fdx-replace-input"
          type="file"
          accept=".fdx,application/xml,text/xml"
          style={styles.hiddenInput}
          onChange={handleReplaceFdxFile}
        />
        {(importError || importWarnings.length > 0) && (
          <div style={styles.importNotice} role="status">
            {importError ? (
              <span>{importError}</span>
            ) : (
              <>
                <strong style={styles.importNoticeTitle}>
                  {formatImportWarningCount(importWarnings.length)}
                </strong>
                {importWarnings.map(warning => (
                  <span key={warning} style={styles.importNoticeLine}>{warning}</span>
                ))}
              </>
            )}
          </div>
        )}

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
            onContentSnapshotChange={handleContentSnapshotChange}
          />
          {scriptFacts && onRebuildScriptFacts && !focusMode && (
            <ScriptFactsPanel
              facts={scriptFacts}
              currentContentHash={currentScriptHash}
              onRebuild={handleRebuildScriptFacts}
              onNavigateFact={handleNavigateFact}
              onStepWarning={handleStepWarning}
            />
          )}
          {scratchpad && onScratchpadChange && !focusMode && (
            <ScriptScratchpadPanel
              scratchpad={scratchpad}
              canPin={scenes.length > 0}
              onAddItem={handleAddScratchpadItem}
              onChangeItemText={handleChangeScratchpadItemText}
              onChangeItemType={handleChangeScratchpadItemType}
              onToggleItem={handleToggleScratchpadItem}
              onRemoveItem={handleRemoveScratchpadItem}
              onPinItem={handlePinScratchpadItem}
              onUnpinItem={handleUnpinScratchpadItem}
              onGoToPinnedScene={handleGoToPinnedScene}
            />
          )}
        </div>
      </div>

      {titlePageOpen && titlePage && onProjectTitleChange && onTitlePageChange && (
        <TitlePagePanel
          projectTitle={projectTitle}
          projectFormat={projectFormat}
          titlePage={titlePage}
          onProjectTitleChange={onProjectTitleChange}
          onTitlePageChange={onTitlePageChange}
          onClose={() => setTitlePageOpen(false)}
        />
      )}
    </div>
  )
}

function formatImportWarningCount(count: number) {
  return count === 1 ? '1 import warning' : `${count} import warnings`
}

function scriptScenesFromEditor(editor: Editor): ScriptScene[] {
  const scenes: ScriptScene[] = []

  editor.state.doc.forEach((node) => {
    if (node.type.name !== 'paragraph' || node.attrs.elementType !== 'scene-heading') return

    scenes.push({
      id: `scene-${scenes.length}`,
      heading: node.textContent,
      index: scenes.length + 1,
    })
  })

  return scenes
}

function scriptScenesFromHeadings(headings: SceneHeading[]): ScriptScene[] {
  return headings.map((h, i) => ({
    id: `scene-${i}`,
    heading: h.text,
    index: i + 1,
  }))
}

function highlightEditorPosition(editor: Editor, pos: number): void {
  const dom = editor.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return
  dom.style.transition = 'background-color 0.6s ease'
  dom.style.backgroundColor = 'var(--accent-soft, rgba(47, 143, 91, 0.18))'
  window.setTimeout(() => {
    dom.style.backgroundColor = ''
  }, 1200)
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100%',
    background: 'var(--bg)',
    padding: '0 24px 80px',
  },
  pageWrapper: {
    width: 'fit-content', // exactly as wide as toolbar+row content (>=856px)
    margin: '0 auto',     // centers on desktop; left-anchors for horizontal scroll
  },
  surfaceNote: {
    width: 816,
    margin: '16px 0 4px',
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    lineHeight: 1.5,
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  importNotice: {
    width: 816,
    margin: '-20px 0 16px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    background: 'var(--surface-2)',
    color: 'var(--fg-muted)',
    fontSize: 13,
    padding: '9px 12px',
  },
  importNoticeTitle: {
    display: 'block',
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    marginBottom: 4,
  },
  importNoticeLine: {
    display: 'block',
    marginTop: 3,
  },
  hiddenInput: {
    display: 'none',
  },
}
