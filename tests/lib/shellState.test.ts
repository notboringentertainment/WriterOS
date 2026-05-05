import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShellState } from '../../client/src/lib/shellState'

describe('useShellState', () => {
  it('starts on script tab with panel closed and no focus mode', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.activeTab).toBe('script')
    expect(result.current.panelOpen).toBe(false)
    expect(result.current.focusMode).toBe(false)
    expect(result.current.writersRoomActive).toBe(false)
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

  it('setActiveTab switches tab and clears writersRoom', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setActiveTab('synopsis'))
    expect(result.current.activeTab).toBe('synopsis')
    expect(result.current.writersRoomActive).toBe(false)
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
})
