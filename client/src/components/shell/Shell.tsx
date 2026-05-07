import React, { useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import type { TranscriptMessage } from '../../lib/projectState'

type WritingTab = 'script' | 'story-bible' | 'outline' | 'synopsis'

interface ShellState {
  activeTab: WritingTab
  writersRoomActive: boolean
  panelOpen: boolean
  focusMode: boolean
  setActiveTab: (tab: WritingTab) => void
  togglePanel: () => void
  enterWritersRoom: () => void
  exitWritersRoom: () => void
  toggleFocusMode: () => void
}

interface RailProps {
  transcript: TranscriptMessage[]
  loading: boolean
  onSend: (text: string) => void
  onClearTranscript?: () => void
}

interface ShellProps {
  shellState: ShellState
  projectTitle: string
  railProps: RailProps
  children: React.ReactNode
}

export function Shell({ shellState, projectTitle, railProps, children }: ShellProps) {
  const {
    activeTab, writersRoomActive, panelOpen, focusMode,
    setActiveTab, togglePanel, enterWritersRoom, exitWritersRoom, toggleFocusMode,
  } = shellState

  // Shell keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        togglePanel()
      }
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        const tabs: WritingTab[] = ['script', 'story-bible', 'outline', 'synopsis']
        const tab = tabs[Number(e.key) - 1]
        if (tab) setActiveTab(tab)
        else enterWritersRoom()
      }
      if (e.key === 'Escape' && focusMode) {
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePanel, setActiveTab, enterWritersRoom, focusMode, toggleFocusMode])

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
        {!writersRoomActive && !focusMode && (
          <LeftRail
            open={panelOpen}
            onToggle={togglePanel}
            projectTitle={projectTitle}
            activeTab={activeTab}
            {...railProps}
          />
        )}
        <main style={styles.center}>
          {children}
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
