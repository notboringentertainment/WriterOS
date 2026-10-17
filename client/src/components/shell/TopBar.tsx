import React, { useEffect, useRef, useState } from 'react'
import './phase1.css'
import { getDisplayProjectTitle, normalizeProjectTitle } from '../../lib/projectIdentity'
import type { ProjectSummary } from '../../lib/projectLibrary'
import { ProjectMenu } from './ProjectMenu'
import type { ActiveRitual } from '../../lib/shellState'

type WritingTab = 'script' | 'story-bible' | 'outline' | 'treatment' | 'synopsis' | 'whats-standing'


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
  onSaveProject?: () => void | boolean | Promise<void | boolean>
  saveError?: string | null
  onDeleteProject?: () => void
  onExportSeed?: () => void
  onHome?: () => void
  onTabChange: (tab: WritingTab) => void
  onWritersRoom: () => void
  onVoiceProfile: () => void
  voiceProfileOpen: boolean
  ritual?: ActiveRitual
  onProjectMeeting?: () => void
  onOpenMemory?: () => void
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
  saveError,
  onDeleteProject,
  onExportSeed,
  onHome,
  onTabChange,
  onWritersRoom,
  onVoiceProfile,
  voiceProfileOpen,
  ritual = null,
  onProjectMeeting,
  onOpenMemory,
}: TopBarProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [canonOpen, setCanonOpen] = useState(false)
  const canonRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!canonOpen) return
    const close = (event: MouseEvent) => { if (!canonRef.current?.contains(event.target as Node)) setCanonOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCanonOpen(false) }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape) }
  }, [canonOpen])
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  // "Saved 3:41" belongs to the project it was saved on.
  useEffect(() => { setSavedAt(null); setSaveFailed(false) }, [activeProjectId])
  const cancelingTitleEditRef = useRef(false)
  const displayTitle = getDisplayProjectTitle(projectTitle)
  const canSwitchProjects = projectSummaries.length > 1 && activeProjectId && onProjectChange
  const showProjectMenu = Boolean(onSaveProject || onDeleteProject || onProjectTitleChange || onExportSeed)

  async function handleSaveProject() {
    if (!onSaveProject || saving) return
    setSaving(true)
    setSaveFailed(false)
    setSavedAt(null)
    try {
      if (await onSaveProject() === false) setSaveFailed(true)
      else setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
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

  const pagesActive = activeTab === 'treatment' || activeTab === 'synopsis'
  return (
    <header className="phase1-top">
      <button className="phase1-brand" onClick={onHome}>WriterOS</button>
      <div className="phase1-project">
        {editingTitle ? (
          <input aria-label="Project title" autoFocus value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)} onBlur={handleTitleBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit() }
              if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit() }
            }} />
        ) : <button aria-label={`Project title: ${displayTitle}`} onClick={startTitleEdit}>{displayTitle}</button>}
      </div>
      <nav role="tablist" aria-label="Writing places" className="phase1-tabs">
        {([{ id: 'script', label: 'Script' }, { id: 'outline', label: 'Beat Sheet' },
          { id: 'pages', label: 'Pages' }, { id: 'story-bible', label: 'Story Bible' }] as const).map(tab => {
          const selected = !homeActive && !writersRoomActive && !ritual &&
            (tab.id === 'pages' ? pagesActive : activeTab === tab.id)
          return <button key={tab.id} role="tab" aria-selected={selected}
            aria-current={selected ? 'page' : undefined}
            onClick={() => onTabChange(tab.id === 'pages' ? (pagesActive ? activeTab : 'treatment') : tab.id)}>
            {tab.label}
          </button>
        })}
      </nav>
      <div className="phase1-tools">
        {saveError || saveFailed
          ? <span role="alert" className="phase1-save">{saveError || 'Could not save. Try again.'}</span>
          : saving ? <span role="status" className="phase1-save">Saving…</span>
          : savedAt ? <span role="status" className="phase1-save" aria-label={`Saved ${savedAt}`} title={`Saved ${savedAt}`}><i /><span className="phase1-save-text">Saved {savedAt}</span></span> : null}
        <button className="phase1-tool" aria-label="Writer" title="Writer" aria-pressed={writersRoomActive && !ritual} onClick={onWritersRoom}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
          <span className="phase1-tool-label">Writer</span>
        </button>
        <div className="phase1-canon" ref={canonRef}>
          <button className="phase1-tool" aria-label="Canon" title="Canon" aria-haspopup="menu" aria-expanded={canonOpen}
            aria-pressed={ritual === 'memory' || activeTab === 'whats-standing'}
            onClick={() => setCanonOpen(v => !v)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z" /><path d="M9 10h6M9 14h6" /></svg>
            <span className="phase1-tool-label">Canon</span>
          </button>
          {canonOpen && <div role="menu" className="phase1-menu">
            <button role="menuitem" onClick={() => { setCanonOpen(false); onOpenMemory?.() }}>Memory</button>
            <button role="menuitem" onClick={() => { setCanonOpen(false); onTabChange('whats-standing') }}>What's Standing</button>
          </div>}
        </div>
        {showProjectMenu && <ProjectMenu onSave={handleSaveProject} onRename={startTitleEdit}
          onDelete={handleDeleteProject} onExportSeed={onExportSeed} onProjectMeeting={onProjectMeeting} />}
      </div>
    </header>
  )
}
