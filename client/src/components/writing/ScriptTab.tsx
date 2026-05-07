import React, { useState, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { ScreenplayEditor } from './screenplay/ScreenplayEditor'
import { ScreenplayToolbar } from './screenplay/ScreenplayToolbar'
import { SceneGutter } from './screenplay/SceneGutter'
import { ElementType } from '../../lib/screenplay'
import type { ScriptScene } from '../../lib/projectState'
import type { ScriptFocusState } from '../../lib/scriptIndex'

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
}

export function ScriptTab({
  focusMode = false,
  onToggleFocusMode = () => {},
  initialScript,
  onScriptChange,
  onScriptSnapshotChange,
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

  return (
    <div style={styles.wrapper}>
      <div style={styles.pageWrapper}>
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
            onContentSnapshotChange={handleContentSnapshotChange}
          />
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100%',
    background: 'var(--bg)',
    overflowX: 'auto',   // horizontal scroll on narrow viewports instead of clipping
    padding: '0 24px 80px',
  },
  pageWrapper: {
    width: 'fit-content', // exactly as wide as toolbar+row content (>=856px)
    margin: '0 auto',     // centers on desktop; left-anchors for horizontal scroll
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
}
