import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptTab } from '../../client/src/components/writing/ScriptTab'
import { defaultScratchpadState, type ScratchpadState } from '../../client/src/lib/scriptScratchpad'

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
