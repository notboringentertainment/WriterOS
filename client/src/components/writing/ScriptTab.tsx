import React, { useState, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { ScreenplayEditor } from './screenplay/ScreenplayEditor'
import { ScreenplayToolbar } from './screenplay/ScreenplayToolbar'
import { SceneGutter } from './screenplay/SceneGutter'
import { ElementType } from '../../lib/screenplay'
import type { ScriptScene } from '../../lib/projectState'
import type { ScriptFocusState } from '../../lib/scriptIndex'
import { stripScriptHtmlFallback } from '../../lib/scriptIndex'

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
  onScriptSnapshotChange?: (snapshot: { rawHtml: string; scenes: ScriptScene[]; focus?: ScriptFocusState }) => void
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
  onScriptChange,
  onScriptSnapshotChange,
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

  const editorRef = useRef<Editor | null>(null)
  const scenesRef = useRef<SceneHeading[]>([])
  const importFdxInputRef = useRef<HTMLInputElement>(null)
  const replaceFdxInputRef = useRef<HTMLInputElement>(null)

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      onEditorReady?.(editor)
    },
    [onEditorReady]
  )

  // Toolbar dropdown → update React display state AND the TipTap block type
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

  const handleContentSnapshotChange = useCallback(
    (snapshot: { html: string; focus?: ScriptFocusState }) => {
      onScriptSnapshotChange?.({
        rawHtml: snapshot.html,
        scenes: scenesRef.current.map((h, i) => ({
          id: `scene-${i}`,
          heading: h.text,
          index: h.index,
        })),
        focus: snapshot.focus,
      })
    },
    [onScriptSnapshotChange]
  )

  const handleSceneClick = useCallback((nodePos: number) => {
    const el = document.querySelector(`[data-node-pos="${nodePos}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

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
        </div>
      </div>
    </div>
  )
}

function formatImportWarningCount(count: number) {
  return count === 1 ? '1 import warning' : `${count} import warnings`
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
