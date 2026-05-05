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
