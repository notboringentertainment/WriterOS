import { useState, useCallback } from 'react'

type WritingTab = 'script' | 'story-bible' | 'outline' | 'synopsis'
type PanelByTab = Record<WritingTab, boolean>
export type StoryBibleSection = 'characters' | 'world' | 'themes' | 'tone' | 'rules'

export function useShellState() {
  const [activeTab, setActiveTabRaw] = useState<WritingTab>('script')
  const [writersRoomActive, setWritersRoomActive] = useState(false)
  const [panelByTab, setPanelByTab] = useState<PanelByTab>({
    script: false,
    'story-bible': false,
    outline: false,
    synopsis: false,
  })
  const [focusMode, setFocusMode] = useState(false)
  const [storyBibleSection, setStoryBibleSectionRaw] = useState<StoryBibleSection | null>(null)

  const panelOpen = panelByTab[activeTab]

  const setActiveTab = useCallback((tab: WritingTab) => {
    setActiveTabRaw(tab)
    setWritersRoomActive(false)
    setFocusMode(false)
  }, [])

  const togglePanel = useCallback(() => {
    setPanelByTab(prev => ({ ...prev, [activeTab]: !prev[activeTab] }))
  }, [activeTab])

  const enterWritersRoom = useCallback(() => {
    setPanelByTab(prev => ({ ...prev, [activeTab]: false }))
    setFocusMode(false)
    setWritersRoomActive(true)
  }, [activeTab])

  const exitWritersRoom = useCallback(() => {
    setWritersRoomActive(false)
  }, [])

  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => !prev)
  }, [])

  const setStoryBibleSection = useCallback((section: StoryBibleSection) => {
    setStoryBibleSectionRaw(section)
  }, [])

  return {
    activeTab,
    writersRoomActive,
    panelOpen,
    focusMode,
    storyBibleSection,
    setActiveTab,
    togglePanel,
    enterWritersRoom,
    exitWritersRoom,
    toggleFocusMode,
    setStoryBibleSection,
  }
}
