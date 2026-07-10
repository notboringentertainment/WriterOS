import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Shell } from '../../client/src/components/shell/Shell'

const defaultRailProps = {
  transcript: [],
  loading: false,
  onSend: vi.fn(),
}

function makeShellState(overrides = {}) {
  return {
    homeActive: false,
    activeTab: 'script' as const,
    writersRoomActive: false,
    panelOpen: false,
    focusMode: false,
    storyBibleSection: null,
    voiceProfileOpen: false,
    setActiveTab: vi.fn(),
    openHome: vi.fn(),
    openProjectWorkspace: vi.fn(),
    togglePanel: vi.fn(),
    enterWritersRoom: vi.fn(),
    exitWritersRoom: vi.fn(),
    toggleWritersRoom: vi.fn(),
    toggleFocusMode: vi.fn(),
    toggleVoiceProfile: vi.fn(),
    closeVoiceProfile: vi.fn(),
    ritual: null as import('../../client/src/lib/shellState').ActiveRitual,
    openRitual: vi.fn(),
    closeRitual: vi.fn(),
    ...overrides,
  }
}

describe('Shell', () => {
  it('hides the Morgan rail in focus mode', () => {
    const shellState = makeShellState({ focusMode: true })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)
    expect(screen.queryByTitle('Morgan')).not.toBeInTheDocument()
  })

  it('routes Cmd+1 through Cmd+5 to writing tabs', () => {
    const setActiveTab = vi.fn()
    const shellState = makeShellState({ setActiveTab })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.keyDown(window, { key: '1', metaKey: true })
    fireEvent.keyDown(window, { key: '2', metaKey: true })
    fireEvent.keyDown(window, { key: '3', metaKey: true })
    fireEvent.keyDown(window, { key: '4', metaKey: true })
    fireEvent.keyDown(window, { key: '5', metaKey: true })

    expect(setActiveTab).toHaveBeenNthCalledWith(1, 'script')
    expect(setActiveTab).toHaveBeenNthCalledWith(2, 'story-bible')
    expect(setActiveTab).toHaveBeenNthCalledWith(3, 'outline')
    expect(setActiveTab).toHaveBeenNthCalledWith(4, 'treatment')
    expect(setActiveTab).toHaveBeenNthCalledWith(5, 'synopsis')
  })

  it('routes Cmd+0 to Home', () => {
    const openHome = vi.fn()
    const shellState = makeShellState({ openHome })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.keyDown(window, { key: '0', metaKey: true })

    expect(openHome).toHaveBeenCalled()
  })

  it('hides the Morgan rail on Home', () => {
    const shellState = makeShellState({ homeActive: true, panelOpen: true })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    expect(screen.queryByTitle('Morgan')).not.toBeInTheDocument()
  })

  it('routes Home button to shell state', () => {
    const openHome = vi.fn()
    const shellState = makeShellState({ openHome })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))

    expect(openHome).toHaveBeenCalled()
  })

  it("routes Cmd+6 to Writer's Room", () => {
    const toggleWritersRoom = vi.fn()
    const shellState = makeShellState({ toggleWritersRoom })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.keyDown(window, { key: '6', metaKey: true })

    expect(toggleWritersRoom).toHaveBeenCalled()
  })

  it('routes Voice Profile button to shell state', () => {
    const toggleVoiceProfile = vi.fn()
    const shellState = makeShellState({ toggleVoiceProfile })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.click(screen.getByRole('button', { name: 'Voice Profile' }))

    expect(toggleVoiceProfile).toHaveBeenCalled()
  })

  it('closes Voice Profile on Escape before focus mode handling', () => {
    const closeVoiceProfile = vi.fn()
    const toggleFocusMode = vi.fn()
    const shellState = makeShellState({
      voiceProfileOpen: true,
      focusMode: true,
      closeVoiceProfile,
      toggleFocusMode,
    })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(closeVoiceProfile).toHaveBeenCalled()
    expect(toggleFocusMode).not.toHaveBeenCalled()
  })

  it('passes railProps through to LeftRail', () => {
    const onSend = vi.fn()
    const shellState = makeShellState({ panelOpen: true })
    render(
      <Shell shellState={shellState} projectTitle="Test" railProps={{ transcript: [], loading: false, onSend }}>
        Content
      </Shell>
    )
    const textarea = screen.getByPlaceholderText(/message/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('passes project title edits through TopBar', () => {
    const onProjectTitleChange = vi.fn()
    const shellState = makeShellState()
    render(
      <Shell
        shellState={shellState}
        projectTitle=""
        onProjectTitleChange={onProjectTitleChange}
        railProps={defaultRailProps}
      >
        Content
      </Shell>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Project title: Untitled Project' }))
    const input = screen.getByLabelText('Project title')
    fireEvent.change(input, { target: { value: 'Lifeline' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onProjectTitleChange).toHaveBeenCalledWith('Lifeline')
  })
})
