import React, { useRef, useState } from 'react'
import { getDisplayProjectTitle, normalizeProjectTitle } from '../../lib/projectIdentity'
import type { ProjectSummary } from '../../lib/projectLibrary'
import { ProjectMenu } from './ProjectMenu'
import { SavedToast } from './SavedToast'

type WritingTab = 'script' | 'story-bible' | 'outline' | 'treatment' | 'synopsis'

const WRITING_TABS: { id: WritingTab; label: string }[] = [
  { id: 'script',      label: 'Script' },
  { id: 'story-bible', label: 'Story Bible' },
  { id: 'outline',     label: 'Outline' },
  { id: 'treatment',   label: 'Treatment' },
  { id: 'synopsis',    label: 'Synopsis' },
]

interface TopBarProps {
  homeActive?: boolean
  activeTab: WritingTab
  writersRoomActive: boolean
  projectTitle: string
  activeProjectId?: string
  projectSummaries?: ProjectSummary[]
  onProjectTitleChange?: (title: string) => void
  onProjectChange?: (projectId: string) => void
  onNewProject?: () => void
  onSaveProject?: () => void
  onDeleteProject?: () => void
  onExportSeed?: () => void
  onHome?: () => void
  onTabChange: (tab: WritingTab) => void
  onWritersRoom: () => void
  onVoiceProfile: () => void
  voiceProfileOpen: boolean
}

export function TopBar({
  homeActive = false,
  activeTab,
  writersRoomActive,
  projectTitle,
  activeProjectId,
  projectSummaries = [],
  onProjectTitleChange,
  onProjectChange,
  onNewProject,
  onSaveProject,
  onDeleteProject,
  onExportSeed,
  onHome,
  onTabChange,
  onWritersRoom,
  onVoiceProfile,
  voiceProfileOpen,
}: TopBarProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [savedToastNonce, setSavedToastNonce] = useState(0)
  const cancelingTitleEditRef = useRef(false)
  const displayTitle = getDisplayProjectTitle(projectTitle)
  const canSwitchProjects = projectSummaries.length > 1 && activeProjectId && onProjectChange
  const showProjectMenu = Boolean(onSaveProject || onDeleteProject || onProjectTitleChange)

  function handleSaveProject() {
    onSaveProject?.()
    setSavedToastNonce(n => n + 1)
  }

  function handleDeleteProject() {
    if (!onDeleteProject) return
    const confirmed = window.confirm(`Delete "${displayTitle}"? This cannot be undone.`)
    if (!confirmed) return
    onDeleteProject()
  }

  function startTitleEdit() {
    if (!onProjectTitleChange) return
    cancelingTitleEditRef.current = false
    setDraftTitle(normalizeProjectTitle(projectTitle))
    setEditingTitle(true)
  }

  function commitTitleEdit() {
    onProjectTitleChange?.(normalizeProjectTitle(draftTitle))
    setEditingTitle(false)
  }

  function cancelTitleEdit() {
    cancelingTitleEditRef.current = true
    setDraftTitle(normalizeProjectTitle(projectTitle))
    setEditingTitle(false)
  }

  function handleTitleBlur() {
    if (cancelingTitleEditRef.current) {
      cancelingTitleEditRef.current = false
      return
    }
    commitTitleEdit()
  }

  return (
    <header style={styles.bar}>
      <div style={styles.logo}>
        <span style={styles.logoText}>WriterOS</span>
      </div>

      {onHome && (
        <button
          type="button"
          aria-pressed={homeActive}
          style={{ ...styles.homeButton, ...(homeActive ? styles.homeButtonActive : {}) }}
          onClick={onHome}
        >
          Home
        </button>
      )}

      <nav role="tablist" style={styles.tabs}>
        {WRITING_TABS.map(tab => {
          const isActive = activeTab === tab.id && !writersRoomActive && !homeActive
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div style={styles.projectTitleSlot}>
        {canSwitchProjects && (
          <select
            aria-label="Project library"
            value={activeProjectId}
            onChange={e => onProjectChange(e.target.value)}
            style={styles.projectSelect}
          >
            {projectSummaries.map(summary => (
              <option key={summary.id} value={summary.id}>
                {formatProjectOptionLabel(summary, projectSummaries)}
              </option>
            ))}
          </select>
        )}

        {editingTitle ? (
          <input
            aria-label="Project title"
            name="projectTitle"
            autoComplete="off"
            autoFocus
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitTitleEdit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelTitleEdit()
              }
            }}
            style={styles.projectTitleInput}
          />
        ) : onProjectTitleChange ? (
          <button
            type="button"
            aria-label={`Project title: ${displayTitle}`}
            style={styles.projectTitleButton}
            onClick={startTitleEdit}
          >
            {displayTitle}
          </button>
        ) : (
          <div style={styles.projectTitleText}>{displayTitle}</div>
        )}

        {onNewProject && (
          <button
            type="button"
            aria-label="New script"
            title="Start a new saved script"
            style={styles.newProjectButton}
            onClick={onNewProject}
          >
            New script
          </button>
        )}

        {showProjectMenu && (
          <ProjectMenu
            onSave={handleSaveProject}
            onRename={startTitleEdit}
            onDelete={handleDeleteProject}
            onExportSeed={onExportSeed}
          />
        )}

        <SavedToast key={savedToastNonce} visible={savedToastNonce > 0} />
      </div>

      <div style={styles.rightZone}>
        <button
          type="button"
          aria-label="Voice Profile"
          aria-pressed={voiceProfileOpen}
          style={{ ...styles.cmdK, ...(voiceProfileOpen ? styles.voiceActive : {}) }}
          onClick={onVoiceProfile}
        >
          Voice
        </button>
        <button
          role="tab"
          aria-selected={writersRoomActive}
          style={{ ...styles.writersRoom, ...(writersRoomActive ? styles.writersRoomActive : {}) }}
          onClick={onWritersRoom}
        >
          Writer's Room
        </button>
      </div>
    </header>
  )
}

function formatProjectOptionLabel(summary: ProjectSummary, summaries: ProjectSummary[]) {
  const title = getDisplayProjectTitle(summary.title)
  const duplicateTitles = summaries.filter(candidate => getDisplayProjectTitle(candidate.title) === title)
  if (duplicateTitles.length <= 1) return title

  const timestamp = formatProjectTimestamp(summary.updatedAt)
  const timestampLabel = `${title} · ${timestamp}`
  const duplicateTimestamps = duplicateTitles.filter(candidate => formatProjectTimestamp(candidate.updatedAt) === timestamp)
  if (duplicateTimestamps.length <= 1) return timestampLabel

  const duplicateIndex = duplicateTitles
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .findIndex(candidate => candidate.id === summary.id) + 1

  return `${timestampLabel} · #${duplicateIndex}`
}

function formatProjectTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 'var(--topbar-height)' as string,
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 16px',
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  logo: { flexShrink: 0, marginRight: 8 },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    fontSize: 15,
    color: 'var(--fg)',
    letterSpacing: '-0.02em',
  },
  homeButton: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  homeButtonActive: {
    color: 'var(--fg)',
    borderColor: 'var(--border)',
    background: 'var(--surface-2)',
  },
  tabs: { display: 'flex', gap: 2 },
  tab: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 400,
    padding: '4px 12px',
    cursor: 'pointer',
    transition: 'color 120ms, border-color 120ms',
  },
  tabActive: {
    color: 'var(--fg)',
    borderColor: 'var(--border)',
    background: 'var(--surface-2)',
  },
  projectTitleSlot: {
    flex: 1,
    textAlign: 'center',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  projectTitleText: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    color: 'var(--fg-muted)',
    fontStyle: 'italic',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectTitleButton: {
    maxWidth: '100%',
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontStyle: 'italic',
    padding: '3px 8px',
    cursor: 'text',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectTitleInput: {
    width: 'min(320px, 100%)',
    background: 'var(--surface-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '3px 8px',
    textAlign: 'center',
    outline: 'none',
  },
  projectSelect: {
    maxWidth: 240,
    background: 'var(--surface-2)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '3px 8px',
    outline: 'none',
  },
  newProjectButton: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    padding: '3px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  rightZone: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  writersRoom: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    padding: '4px 12px',
    cursor: 'pointer',
  },
  writersRoomActive: {
    color: 'var(--primary)',
    borderColor: 'var(--primary-dim)',
    background: 'hsla(260, 100%, 80%, 0.08)',
  },
  voiceActive: {
    color: 'var(--primary)',
    borderColor: 'var(--primary-dim)',
    background: 'hsla(260, 100%, 80%, 0.08)',
  },
  cmdK: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 6,
    color: 'var(--fg-subtle)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
  },
}
