import { useState, useCallback } from 'react'

type WritingTab = 'script' | 'story-bible' | 'outline' | 'treatment' | 'synopsis'
type PanelByTab = Record<WritingTab, boolean>
export type StoryBibleSection = 'characters' | 'world' | 'themes' | 'tone' | 'rules'

export function useShellState() {
  const [homeActive, setHomeActive] = useState(true)
  const [activeTab, setActiveTabRaw] = useState<WritingTab>('script')
  const [writersRoomActive, setWritersRoomActive] = useState(false)
  const [panelByTab, setPanelByTab] = useState<PanelByTab>({
    script: false,
    'story-bible': false,
    outline: false,
    treatment: false,
    synopsis: false,
  })
  const [focusMode, setFocusMode] = useState(false)
  const [storyBibleSection, setStoryBibleSectionRaw] = useState<StoryBibleSection | null>(null)
  const [voiceProfileOpen, setVoiceProfileOpen] = useState(false)

  const panelOpen = panelByTab[activeTab]

  const setActiveTab = useCallback((tab: WritingTab) => {
    setHomeActive(false)
    setActiveTabRaw(tab)
    setFocusMode(false)
  }, [])

  const openHome = useCallback(() => {
    setHomeActive(true)
    setWritersRoomActive(false)
    setFocusMode(false)
  }, [])

  const openProjectWorkspace = useCallback(() => {
    setHomeActive(false)
    setWritersRoomActive(false)
    setFocusMode(false)
  }, [])

  const togglePanel = useCallback(() => {
    setPanelByTab(prev => ({ ...prev, [activeTab]: !prev[activeTab] }))
  }, [activeTab])

  const enterWritersRoom = useCallback(() => {
    setHomeActive(false)
    setPanelByTab(prev => ({ ...prev, [activeTab]: false }))
    setFocusMode(false)
    setWritersRoomActive(true)
  }, [activeTab])

  const exitWritersRoom = useCallback(() => {
    setWritersRoomActive(false)
  }, [])

  const toggleWritersRoom = useCallback(() => {
    setHomeActive(false)
    setPanelByTab(prev => ({ ...prev, [activeTab]: false }))
    setFocusMode(false)
    setWritersRoomActive(prev => !prev)
  }, [activeTab])

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => !prev)
  }, [])

  const setStoryBibleSection = useCallback((section: StoryBibleSection) => {
    setStoryBibleSectionRaw(section)
  }, [])

  const toggleVoiceProfile = useCallback(() => {
    setVoiceProfileOpen(prev => !prev)
  }, [])

  const closeVoiceProfile = useCallback(() => {
    setVoiceProfileOpen(false)
  }, [])

  return {
    homeActive,
    activeTab,
    writersRoomActive,
    panelOpen,
    focusMode,
    storyBibleSection,
    voiceProfileOpen,
    setActiveTab,
    openHome,
    openProjectWorkspace,
    togglePanel,
    enterWritersRoom,
    exitWritersRoom,
    toggleWritersRoom,
    toggleFocusMode,
    setStoryBibleSection,
    toggleVoiceProfile,
    closeVoiceProfile,
  }
}
