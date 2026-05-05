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
