import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CapabilityReceiptChip } from '../../client/src/components/transcript/CapabilityReceiptChip'
import type { CapabilityReceipt } from '@shared/personaCapability'

function makeReceipt(overrides: Partial<CapabilityReceipt> = {}): CapabilityReceipt {
  return {
    schemaVersion: 1,
    taskKind: 'research_world_context',
    personaId: 'zoe',
    startedAt: '2026-05-14T20:00:00.000Z',
    completedAt: '2026-05-14T20:00:02.000Z',
    durationMs: 2000,
    status: 'ok',
    contextChips: ['logline', 'storyBible'],
    voiceProfile: {
      included: true,
      slice: 'world_context',
    },
    missingSurfaces: ['characters'],
    sources: [
      { label: 'Britannica', url: 'https://example.com/gate', citedInFinal: true },
      { label: 'Archive note', citedInFinal: false },
    ],
    ...overrides,
  }
}

describe('CapabilityReceiptChip', () => {
  it('renders an accessible chip and opens the inspector', () => {
    render(<CapabilityReceiptChip receipt={makeReceipt()} />)

    const button = screen.getByRole('button', {
      name: /world-context research receipt, 2 sources, completed/i,
    })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveTextContent('Research · 2 sources · completed')

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Research receipt' })).toBeInTheDocument()
    expect(screen.getByText('World-context research')).toBeInTheDocument()
    expect(screen.getByText('Voice Profile (world-context slice)')).toBeInTheDocument()
    expect(screen.getByText('Britannica')).toBeInTheDocument()
    expect(screen.getByText('cited')).toBeInTheDocument()
  })

  it('closes the inspector without exposing raw Voice Profile content or implementation names', () => {
    const { container } = render(<CapabilityReceiptChip receipt={makeReceipt()} />)

    fireEvent.click(screen.getByRole('button', { name: /world-context research receipt/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close research receipt' }))

    expect(screen.queryByRole('dialog', { name: 'Research receipt' })).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent('subtext before explanation')
    expect(container).not.toHaveTextContent('OpenSwarm')
  })
})
