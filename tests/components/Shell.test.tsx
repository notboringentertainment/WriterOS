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
    activeTab: 'script' as const,
    writersRoomActive: false,
    panelOpen: false,
    focusMode: false,
    storyBibleSection: null,
    setActiveTab: vi.fn(),
    togglePanel: vi.fn(),
    enterWritersRoom: vi.fn(),
    exitWritersRoom: vi.fn(),
    toggleFocusMode: vi.fn(),
    ...overrides,
  }
}

describe('Shell', () => {
  it('hides the Writing Partner rail in focus mode', () => {
    const shellState = makeShellState({ focusMode: true })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)
    expect(screen.queryByTitle('Writing Partner')).not.toBeInTheDocument()
  })

  it('routes Cmd+1 through Cmd+4 to writing tabs', () => {
    const setActiveTab = vi.fn()
    const shellState = makeShellState({ setActiveTab })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.keyDown(window, { key: '1', metaKey: true })
    fireEvent.keyDown(window, { key: '2', metaKey: true })
    fireEvent.keyDown(window, { key: '3', metaKey: true })
    fireEvent.keyDown(window, { key: '4', metaKey: true })

    expect(setActiveTab).toHaveBeenNthCalledWith(1, 'script')
    expect(setActiveTab).toHaveBeenNthCalledWith(2, 'story-bible')
    expect(setActiveTab).toHaveBeenNthCalledWith(3, 'outline')
    expect(setActiveTab).toHaveBeenNthCalledWith(4, 'synopsis')
  })

  it("routes Cmd+5 to Writer's Room", () => {
    const enterWritersRoom = vi.fn()
    const shellState = makeShellState({ enterWritersRoom })
    render(<Shell shellState={shellState} projectTitle="The Long Hallway" railProps={defaultRailProps}>Page</Shell>)

    fireEvent.keyDown(window, { key: '5', metaKey: true })

    expect(enterWritersRoom).toHaveBeenCalled()
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
