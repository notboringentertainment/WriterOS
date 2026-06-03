import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScriptFactsPanel } from '../../client/src/components/writing/ScriptFactsPanel'
import { defaultScriptFactsCache, rebuildScriptFactsCache } from '../../client/src/lib/scriptFacts'

// Two near-matched characters → produces an edit-distance warning.
const HTML = [
  '<p data-element-type="character">SARA</p>',
  '<p data-element-type="dialogue">One.</p>',
  '<p data-element-type="character">SARAH</p>',
  '<p data-element-type="dialogue">Two.</p>',
].join('')

function currentFacts() {
  return rebuildScriptFactsCache(HTML, '2026-06-02T10:00:00.000Z')
}

describe('ScriptFactsPanel interactivity', () => {
  it('shows the scan state as a toggle-style control before scanning', () => {
    const onRebuild = vi.fn()
    render(
      <ScriptFactsPanel
        facts={defaultScriptFactsCache()}
        currentContentHash="empty"
        onRebuild={onRebuild}
      />,
    )

    const scanToggle = screen.getByRole('button', { name: 'Scan current script for Script Facts' })
    expect(scanToggle).toHaveTextContent('Not scanned')
    expect(scanToggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(scanToggle)
    expect(onRebuild).toHaveBeenCalledTimes(1)
  })

  it('renders fact rows as buttons when current and calls onNavigateFact', () => {
    const facts = currentFacts()
    const onNavigateFact = vi.fn()
    render(
      <ScriptFactsPanel
        facts={facts}
        currentContentHash={facts.contentHash}
        onRebuild={() => {}}
        onNavigateFact={onNavigateFact}
        onStepWarning={() => {}}
      />,
    )
    const scanToggle = screen.getByRole('button', { name: 'Script Facts scanned; scan again' })
    expect(scanToggle).toHaveTextContent('Scanned')
    expect(scanToggle).toHaveAttribute('aria-pressed', 'true')

    const saraButton = screen.getByRole('button', { name: /^SARA$/ })
    fireEvent.click(saraButton)
    expect(onNavigateFact).toHaveBeenCalledWith('characters', 'SARA')
  })

  it('shows a plain-language reason and a step button for near-match warnings', () => {
    const facts = currentFacts()
    const onStepWarning = vi.fn()
    render(
      <ScriptFactsPanel
        facts={facts}
        currentContentHash={facts.contentHash}
        onRebuild={() => {}}
        onNavigateFact={() => {}}
        onStepWarning={onStepWarning}
      />,
    )
    expect(screen.getByText(/possible typo/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /step through/i }))
    expect(onStepWarning).toHaveBeenCalledTimes(1)
  })

  it('disables interactivity and shows a scan hint when stale', () => {
    const facts = currentFacts()
    render(
      <ScriptFactsPanel
        facts={facts}
        currentContentHash="deadbeef"
        onRebuild={() => {}}
        onNavigateFact={() => {}}
        onStepWarning={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Script changed; scan Script Facts again' })).toHaveTextContent('Needs scan')
    expect(screen.queryByRole('button', { name: /^SARA$/ })).toBeNull()
    expect(screen.getByText(/scan again to navigate/i)).toBeInTheDocument()
  })
})
