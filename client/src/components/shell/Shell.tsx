import React, { useEffect } from 'react'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import { ThreeZoneShell } from './ThreeZoneShell'
import { StructureSpine } from './StructureSpine'
import { ContextConsole } from './ContextConsole'
import { VoiceProfileDrawer } from './VoiceProfileDrawer'
import type { SurfaceStructure, ConsoleState } from '../../lib/leftZone'
import type { TranscriptMessage } from '../../lib/projectState'
import { getDisplayProjectTitle } from '../../lib/projectIdentity'
import type { ProjectSummary } from '../../lib/projectLibrary'
import type { ActiveTab } from '../../lib/wpRouting'
import type { StoryBibleSection } from '../../lib/shellState'

interface ShellState {
  homeActive: boolean
  activeTab: ActiveTab
  writersRoomActive: boolean
  panelOpen: boolean
  focusMode: boolean
  storyBibleSection: StoryBibleSection | null
  voiceProfileOpen: boolean
  setActiveTab: (tab: ActiveTab) => void
  openHome: () => void
  openProjectWorkspace: () => void
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
  onSaveProject?: () => void
  onDeleteProject?: () => void
  railProps: RailProps
  /** Real left-zone content for the workspace. When omitted, a lean placeholder is shown. */
  leftZone?: { structure: SurfaceStructure; state: ConsoleState }
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
  onSaveProject,
  onDeleteProject,
  railProps,
  leftZone,
  children,
}: ShellProps) {
  const {
    homeActive, activeTab, writersRoomActive, panelOpen, focusMode,
    storyBibleSection, voiceProfileOpen,
    setActiveTab, openHome, togglePanel, enterWritersRoom, exitWritersRoom, toggleFocusMode,
    toggleVoiceProfile, closeVoiceProfile,
  } = shellState

  // Shell keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        togglePanel()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        openHome()
      }
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault()
        const tabs: ActiveTab[] = ['script', 'story-bible', 'outline', 'treatment', 'synopsis']
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
  }, [togglePanel, openHome, setActiveTab, enterWritersRoom, focusMode, toggleFocusMode, voiceProfileOpen, closeVoiceProfile])

  const handleWritersRoom = () => {
    if (writersRoomActive) exitWritersRoom()
    else enterWritersRoom()
  }
  const displayProjectTitle = getDisplayProjectTitle(projectTitle)
  // Home and focus mode are full-bleed (no shell chrome). Workspace and Writer's Room both
  // flow through ThreeZoneShell so the paper subtree is never reparented across that toggle;
  // Writer's Room runs chromeless (zones hidden via CSS, paper stays mounted).
  const fullBleed = homeActive || focusMode

  const morganRail = (
    <LeftRail
      open={panelOpen}
      onToggle={togglePanel}
      projectTitle={displayProjectTitle}
      activeTab={activeTab}
      storyBibleSection={storyBibleSection}
      {...railProps}
    />
  )

  // Real left-zone content when provided by the host; otherwise a lean, generic placeholder.
  const spineContent = leftZone ? (
    <StructureSpine structure={leftZone.structure} />
  ) : (
    <div style={styles.spine}>
      <div style={styles.spineHeader}>Structure</div>
      <div style={styles.spineProject}>{displayProjectTitle}</div>
    </div>
  )
  const consoleContent = leftZone ? (
    <ContextConsole state={leftZone.state} />
  ) : (
    <div style={styles.console}>
      <span style={styles.consoleDot} aria-hidden="true" />
      <span style={styles.consoleLabel}>Surface</span>
      <span style={styles.consoleValue}>{activeTab}</span>
    </div>
  )

  return (
    <div style={styles.root}>
      {!focusMode && (
        <TopBar
          homeActive={homeActive}
          activeTab={activeTab}
          writersRoomActive={writersRoomActive}
          projectTitle={projectTitle}
          activeProjectId={activeProjectId}
          projectSummaries={projectSummaries}
          onProjectTitleChange={onProjectTitleChange}
          onProjectChange={onProjectChange}
          onNewProject={onNewProject}
          onSaveProject={onSaveProject}
          onDeleteProject={onDeleteProject}
          onHome={openHome}
          onTabChange={setActiveTab}
          onWritersRoom={handleWritersRoom}
          onVoiceProfile={toggleVoiceProfile}
          voiceProfileOpen={voiceProfileOpen}
        />
      )}
      <div style={styles.body}>
        {fullBleed ? (
          <main style={styles.center}>
            {children}
          </main>
        ) : (
          <ThreeZoneShell
            spine={spineContent}
            console={consoleContent}
            paper={children}
            morgan={morganRail}
            chromeless={writersRoomActive}
          />
        )}
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
  spine: {
    padding: '14px 16px',
  },
  spineHeader: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--fg-subtle)',
    marginBottom: 6,
  },
  spineProject: {
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    color: 'var(--fg)',
  },
  console: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--fg-muted)',
  },
  consoleDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--wp-amber)',
    flexShrink: 0,
  },
  consoleLabel: {
    color: 'var(--fg-subtle)',
    textTransform: 'uppercase',
  },
  consoleValue: {
    color: 'var(--fg)',
  },
}
