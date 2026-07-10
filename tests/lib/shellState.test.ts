import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShellState } from '../../client/src/lib/shellState'

describe('useShellState', () => {
  it('starts on Home with script as the first workspace tab', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.homeActive).toBe(true)
    expect(result.current.activeTab).toBe('script')
    expect(result.current.panelOpen).toBe(false)
    expect(result.current.focusMode).toBe(false)
    expect(result.current.writersRoomActive).toBe(false)
    expect(result.current.voiceProfileOpen).toBe(false)
  })

  it('storyBibleSection defaults to null', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.storyBibleSection).toBeNull()
  })

  it('setStoryBibleSection updates the section', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setStoryBibleSection('world'))
    expect(result.current.storyBibleSection).toBe('world')
    act(() => result.current.setStoryBibleSection('characters'))
    expect(result.current.storyBibleSection).toBe('characters')
  })

  it('setActiveTab switches tab without closing Writer Room', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.enterWritersRoom())
    act(() => result.current.setActiveTab('synopsis'))
    expect(result.current.homeActive).toBe(false)
    expect(result.current.activeTab).toBe('synopsis')
    expect(result.current.writersRoomActive).toBe(true)
  })

  it('setActiveTab exits focus mode', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.toggleFocusMode())
    act(() => result.current.setActiveTab('synopsis'))
    expect(result.current.focusMode).toBe(false)
  })

  it('enterWritersRoom collapses the panel and sets writersRoomActive', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.togglePanel())
    act(() => result.current.toggleFocusMode())
    act(() => result.current.enterWritersRoom())
    expect(result.current.homeActive).toBe(false)
    expect(result.current.writersRoomActive).toBe(true)
    expect(result.current.panelOpen).toBe(false)
    expect(result.current.focusMode).toBe(false)
  })

  it('exitWritersRoom returns to last active writing tab', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setActiveTab('outline'))
    act(() => result.current.enterWritersRoom())
    act(() => result.current.exitWritersRoom())
    expect(result.current.writersRoomActive).toBe(false)
    expect(result.current.activeTab).toBe('outline')
  })

  it('toggleWritersRoom opens and closes Writer Room explicitly', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.togglePanel())
    act(() => result.current.toggleWritersRoom())
    expect(result.current.homeActive).toBe(false)
    expect(result.current.writersRoomActive).toBe(true)
    expect(result.current.panelOpen).toBe(false)

    act(() => result.current.toggleWritersRoom())
    expect(result.current.writersRoomActive).toBe(false)
  })

  it('opens and leaves Home explicitly', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setActiveTab('outline'))
    expect(result.current.homeActive).toBe(false)

    act(() => result.current.openHome())
    expect(result.current.homeActive).toBe(true)
    expect(result.current.writersRoomActive).toBe(false)
    expect(result.current.focusMode).toBe(false)

    act(() => result.current.openProjectWorkspace())
    expect(result.current.homeActive).toBe(false)
  })

  it('togglePanel flips panel open state', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.panelOpen).toBe(false)
    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(true)
    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(false)
  })

  it('panel state is remembered per tab', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.togglePanel())         // open on script
    act(() => result.current.setActiveTab('synopsis')) // switch — synopsis starts closed
    expect(result.current.panelOpen).toBe(false)
    act(() => result.current.setActiveTab('script'))   // back — script still open
    expect(result.current.panelOpen).toBe(true)
  })

  it('toggleFocusMode flips focus mode', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(true)
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(false)
  })

  it('toggles and closes the Voice Profile drawer state', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.toggleVoiceProfile())
    expect(result.current.voiceProfileOpen).toBe(true)
    act(() => result.current.closeVoiceProfile())
    expect(result.current.voiceProfileOpen).toBe(false)
  })

  it('ritual starts null and opens/closes explicitly', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.ritual).toBeNull()
    act(() => result.current.openRitual('projectMeeting'))
    expect(result.current.ritual).toBe('projectMeeting')
    act(() => result.current.closeRitual())
    expect(result.current.ritual).toBeNull()
  })

  it('openRitual exits focus mode and closes the voice drawer', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.toggleFocusMode())
    act(() => result.current.toggleVoiceProfile())
    act(() => result.current.openRitual('voiceProfile'))
    expect(result.current.focusMode).toBe(false)
    expect(result.current.voiceProfileOpen).toBe(false)
    expect(result.current.ritual).toBe('voiceProfile')
  })

  it('navigation actions clear an active ritual', () => {
    const { result } = renderHook(() => useShellState())

    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.setActiveTab('outline'))
    expect(result.current.ritual).toBeNull()

    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.openHome())
    expect(result.current.ritual).toBeNull()

    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.openProjectWorkspace())
    expect(result.current.ritual).toBeNull()

    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.enterWritersRoom())
    expect(result.current.ritual).toBeNull()

    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.toggleWritersRoom())
    expect(result.current.ritual).toBeNull()

    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.toggleVoiceProfile())
    expect(result.current.ritual).toBeNull()
    expect(result.current.voiceProfileOpen).toBe(true)

    act(() => result.current.closeVoiceProfile())
    act(() => result.current.openRitual('projectMeeting'))
    act(() => result.current.toggleFocusMode())
    expect(result.current.ritual).toBeNull()
  })
})
