import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'
import { defaultScratchpadState, type ScratchpadState } from '../../client/src/lib/scriptScratchpad'

const TWO_SCENES =
  "<p data-element-type='scene-heading'>INT. KITCHEN - DAY</p>" +
  "<p data-element-type='action'>She enters.</p>" +
  "<p data-element-type='scene-heading'>EXT. PARK - NIGHT</p>" +
  "<p data-element-type='action'>Later.</p>"

// jsdom does not implement scrollIntoView, so install a recording stub that
// captures the text of the element each call scrolls to.
function captureScrollTargets(): { targets: string[]; restore: () => void } {
  const targets: string[] = []
  const original = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    targets.push((this.textContent ?? '').trim())
  }
  return {
    targets,
    restore: () => {
      HTMLElement.prototype.scrollIntoView = original
    },
  }
}

function ScriptTabScratchpadHarness() {
  const [scratchpad, setScratchpad] = useState<ScratchpadState>(defaultScratchpadState)
  return (
    <ScriptTab
      initialScript="<p data-element-type='scene-heading'>INT. KITCHEN - DAY</p><p data-element-type='action'>She enters.</p>"
      scratchpad={scratchpad}
      onScratchpadChange={updater => setScratchpad(prev => updater(prev))}
    />
  )
}

describe('ScriptTab scratchpad integration', () => {
  it('renders the scratchpad panel when scratchpad props are provided', () => {
    render(<ScriptTabScratchpadHarness />)
    expect(screen.getByRole('complementary', { name: 'Script Scratchpad' })).toBeInTheDocument()
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })

  it('does not render the scratchpad panel without props', () => {
    render(<ScriptTab />)
    expect(screen.queryByRole('complementary', { name: 'Script Scratchpad' })).not.toBeInTheDocument()
  })

  it('adds and edits a note through project-state updates', () => {
    render(<ScriptTabScratchpadHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    const textbox = screen.getByRole('textbox', { name: 'Scratchpad note 1' })
    fireEvent.change(textbox, { target: { value: 'Reuse the cold open here' } })

    expect(screen.getByRole('textbox', { name: 'Scratchpad note 1' })).toHaveValue('Reuse the cold open here')
  })

  it('adds a task with a working checkbox', () => {
    render(<ScriptTabScratchpadHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('navigates a drifted pin to the heading, not the stale stored index', async () => {
    function PinnedHarness() {
      const [scratchpad, setScratchpad] = useState<ScratchpadState>(() => ({
        items: [
          {
            id: 'pin-1',
            type: 'text',
            text: 'Callback to the cold open',
            checked: false,
            // Pin was made when KITCHEN was scene 2; it is now scene 1.
            pinnedScene: { heading: 'INT. KITCHEN - DAY', index: 2 },
          },
        ],
      }))
      return (
        <ScriptTab
          initialScript={TWO_SCENES}
          scratchpad={scratchpad}
          onScratchpadChange={updater => setScratchpad(prev => updater(prev))}
        />
      )
    }

    render(<PinnedHarness />)

    // The scene gutter populates from the editor once it mounts.
    await screen.findByTitle('INT. KITCHEN - DAY')

    // Capture the live element each scroll targets (jsdom stubs scrollIntoView).
    const scroll = captureScrollTargets()

    try {
      // Following the pin: stored index is 2 (now PARK's slot), but resolution
      // must follow the heading text back to KITCHEN and scroll there.
      fireEvent.click(screen.getByRole('button', { name: 'Go to INT. KITCHEN - DAY' }))

      expect(scroll.targets).toHaveLength(1)
      expect(scroll.targets[0]).toContain('INT. KITCHEN - DAY')
      expect(scroll.targets[0]).not.toContain('EXT. PARK - NIGHT')
    } finally {
      scroll.restore()
    }
  })

  it('scrolls the live scene element when a scene gutter marker is clicked', async () => {
    render(<ScriptTabScratchpadHarness />)

    const sceneMarker = await screen.findByTitle('INT. KITCHEN - DAY')

    const scroll = captureScrollTargets()

    try {
      fireEvent.click(sceneMarker)
      expect(scroll.targets).toHaveLength(1)
      expect(scroll.targets[0]).toContain('INT. KITCHEN - DAY')
    } finally {
      scroll.restore()
    }
  })

  it('hides the scratchpad panel in focus mode', () => {
    function FocusHarness() {
      const [scratchpad, setScratchpad] = useState<ScratchpadState>(defaultScratchpadState)
      return (
        <ScriptTab
          focusMode
          scratchpad={scratchpad}
          onScratchpadChange={updater => setScratchpad(prev => updater(prev))}
        />
      )
    }
    render(<FocusHarness />)
    expect(screen.queryByRole('complementary', { name: 'Script Scratchpad' })).not.toBeInTheDocument()
  })
})
