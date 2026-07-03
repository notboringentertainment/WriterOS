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
    paddingTop: 96 + 32,
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
