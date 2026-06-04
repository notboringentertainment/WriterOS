import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScriptScratchpadPanel } from '../../client/src/components/writing/ScriptScratchpadPanel'
import { addScratchpadItem, type ScratchpadState } from '../../client/src/lib/scriptScratchpad'

function renderPanel(scratchpad: ScratchpadState, overrides: Record<string, unknown> = {}) {
  const handlers = {
    onAddItem: vi.fn(),
    onChangeItemText: vi.fn(),
    onChangeItemType: vi.fn(),
    onToggleItem: vi.fn(),
    onRemoveItem: vi.fn(),
    onPinItem: vi.fn(),
    onUnpinItem: vi.fn(),
    onGoToPinnedScene: vi.fn(),
  }
  render(
    <ScriptScratchpadPanel
      scratchpad={scratchpad}
      canPin
      {...handlers}
      {...overrides}
    />
  )
  return handlers
}

describe('ScriptScratchpadPanel', () => {
  it('shows an empty state when there are no items', () => {
    renderPanel({ items: [] })
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })

  it('adds items of the requested type', () => {
    const handlers = renderPanel({ items: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add bullet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    expect(handlers.onAddItem).toHaveBeenNthCalledWith(1, 'text')
    expect(handlers.onAddItem).toHaveBeenNthCalledWith(2, 'bullet')
    expect(handlers.onAddItem).toHaveBeenNthCalledWith(3, 'task')
  })

  it('scrolls and focuses a newly added item after it renders', async () => {
    const scrolledElements: HTMLElement[] = []
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolledElements.push(this)
    }

    function StatefulPanel() {
      const [scratchpad, setScratchpad] = useState<ScratchpadState>({
        items: [{ id: 'existing', type: 'text', text: 'existing note', checked: false, pinnedScene: null }],
      })
      return (
        <ScriptScratchpadPanel
          scratchpad={scratchpad}
          canPin
          onAddItem={type => setScratchpad(s => addScratchpadItem(s, type))}
          onChangeItemText={() => {}}
          onChangeItemType={() => {}}
          onToggleItem={() => {}}
          onRemoveItem={() => {}}
          onPinItem={() => {}}
          onUnpinItem={() => {}}
        />
      )
    }

    try {
      render(<StatefulPanel />)

      fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

      const addedTextbox = await screen.findByRole('textbox', { name: 'Scratchpad note 2' })
      await waitFor(() => expect(addedTextbox).toHaveFocus())

      expect(scrolledElements).toHaveLength(1)
      expect(scrolledElements[0]).toContainElement(addedTextbox)
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('edits note text', () => {
    const handlers = renderPanel({
      items: [{ id: 'a', type: 'text', text: 'hello', checked: false, pinnedScene: null }],
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Scratchpad note 1' }), {
      target: { value: 'hello world' },
    })
    expect(handlers.onChangeItemText).toHaveBeenCalledWith('a', 'hello world')
  })

  it('renders a checkbox for task items and toggles it', () => {
    const handlers = renderPanel({
      items: [{ id: 't', type: 'task', text: 'do it', checked: false, pinnedScene: null }],
    })

    const checkbox = screen.getByRole('checkbox', { name: /Toggle do it/ })
    expect(checkbox).toBeInTheDocument()
    fireEvent.click(checkbox)
    expect(handlers.onToggleItem).toHaveBeenCalledWith('t')
  })

  it('does not render a checkbox for text or bullet items', () => {
    renderPanel({
      items: [
        { id: 'a', type: 'text', text: 'note', checked: false, pinnedScene: null },
        { id: 'b', type: 'bullet', text: 'point', checked: false, pinnedScene: null },
      ],
    })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('cycles item type', () => {
    const handlers = renderPanel({
      items: [{ id: 'a', type: 'text', text: 'note', checked: false, pinnedScene: null }],
    })
    fireEvent.click(screen.getByRole('button', { name: /Change type for note/ }))
    expect(handlers.onChangeItemType).toHaveBeenCalledWith('a', 'bullet')
  })

  it('deletes an item', () => {
    const handlers = renderPanel({
      items: [{ id: 'a', type: 'text', text: 'note', checked: false, pinnedScene: null }],
    })
    fireEvent.click(screen.getByRole('button', { name: /Delete note/ }))
    expect(handlers.onRemoveItem).toHaveBeenCalledWith('a')
  })

  it('pins an item to the current scene when pinning is available', () => {
    const handlers = renderPanel({
      items: [{ id: 'a', type: 'text', text: 'note', checked: false, pinnedScene: null }],
    })
    fireEvent.click(screen.getByRole('button', { name: /Pin note to current scene/ }))
    expect(handlers.onPinItem).toHaveBeenCalledWith('a')
  })

  it('hides the pin button when no scene is available', () => {
    renderPanel(
      { items: [{ id: 'a', type: 'text', text: 'note', checked: false, pinnedScene: null }] },
      { canPin: false }
    )
    expect(screen.queryByRole('button', { name: /Pin note to current scene/ })).not.toBeInTheDocument()
  })

  it('shows the pinned scene and supports navigating to it and unpinning', () => {
    const handlers = renderPanel({
      items: [
        {
          id: 'a',
          type: 'text',
          text: 'note',
          checked: false,
          pinnedScene: { heading: 'INT. KITCHEN - DAY', index: 2 },
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to INT. KITCHEN - DAY' }))
    expect(handlers.onGoToPinnedScene).toHaveBeenCalledWith({ heading: 'INT. KITCHEN - DAY', index: 2 })

    fireEvent.click(screen.getByRole('button', { name: /Unpin note/ }))
    expect(handlers.onUnpinItem).toHaveBeenCalledWith('a')
  })
})
