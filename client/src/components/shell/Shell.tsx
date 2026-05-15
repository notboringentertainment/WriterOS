import React, { useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import { VoiceProfileDrawer } from './VoiceProfileDrawer'
import type { TranscriptMessage } from '../../lib/projectState'
import { getDisplayProjectTitle } from '../../lib/projectIdentity'
import type { ProjectSummary } from '../../lib/projectLibrary'
import type { ActiveTab } from '../../lib/wpRouting'
import type { StoryBibleSection } from '../../lib/shellState'

interface ShellState {
  activeTab: ActiveTab
  writersRoomActive: boolean
  panelOpen: boolean
  focusMode: boolean
  storyBibleSection: StoryBibleSection | null
  voiceProfileOpen: boolean
  setActiveTab: (tab: ActiveTab) => void
  togglePanel: () => void
  enterWritersRoom: () => void
  exitWritersRoom: () => void
  toggleFocusMode: () => void
  toggleVoiceProfile: () => void
  closeVoiceProfile: () => void
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
  activeProjectId?: string
  projectSummaries?: ProjectSummary[]
  onProjectTitleChange?: (title: string) => void
  onProjectChange?: (projectId: string) => void
  onNewProject?: () => void
  railProps: RailProps
  children: React.ReactNode
}

export function Shell({
  shellState,
  projectTitle,
  activeProjectId,
  projectSummaries,
  onProjectTitleChange,
  onProjectChange,
  onNewProject,
  railProps,
  children,
}: ShellProps) {
  const {
    activeTab, writersRoomActive, panelOpen, focusMode,
    storyBibleSection, voiceProfileOpen,
    setActiveTab, togglePanel, enterWritersRoom, exitWritersRoom, toggleFocusMode,
    toggleVoiceProfile, closeVoiceProfile,
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
        const tabs: ActiveTab[] = ['script', 'story-bible', 'outline', 'synopsis']
        const tab = tabs[Number(e.key) - 1]
        if (tab) setActiveTab(tab)
        else enterWritersRoom()
      }
      if (e.key === 'Escape' && voiceProfileOpen) {
        closeVoiceProfile()
        return
      }
      if (e.key === 'Escape' && focusMode) {
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePanel, setActiveTab, enterWritersRoom, focusMode, toggleFocusMode, voiceProfileOpen, closeVoiceProfile])

  const handleWritersRoom = () => {
    if (writersRoomActive) exitWritersRoom()
    else enterWritersRoom()
  }
  const displayProjectTitle = getDisplayProjectTitle(projectTitle)

  return (
    <div style={styles.root}>
      {!focusMode && (
        <TopBar
          activeTab={activeTab}
          writersRoomActive={writersRoomActive}
          projectTitle={projectTitle}
          activeProjectId={activeProjectId}
          projectSummaries={projectSummaries}
          onProjectTitleChange={onProjectTitleChange}
          onProjectChange={onProjectChange}
          onNewProject={onNewProject}
          onTabChange={setActiveTab}
          onWritersRoom={handleWritersRoom}
          onVoiceProfile={toggleVoiceProfile}
          voiceProfileOpen={voiceProfileOpen}
        />
      )}
      <div style={styles.body}>
        {!writersRoomActive && !focusMode && (
          <LeftRail
            open={panelOpen}
            onToggle={togglePanel}
            projectTitle={displayProjectTitle}
            activeTab={activeTab}
            storyBibleSection={storyBibleSection}
            {...railProps}
          />
        )}
        <main style={styles.center}>
          {children}
        </main>
      </div>
      <VoiceProfileDrawer open={voiceProfileOpen} onClose={closeVoiceProfile} />
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
