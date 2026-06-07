import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OutlineDocumentView } from '../../client/src/components/writing/outline/OutlineDocumentView'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import type { ComposedDocument } from '../../shared/compose/types'

const identity = { title: 'T', genre: 'Drama' }
const hash = computeOutlineSourceHash(syntheticOutlineFeature, 'feature', identity)
const composed: ComposedDocument = {
  schemaVersion: 1, generatedAt: '2026-06-06T00:00:00.000Z', model: 'm', recipeVersion: 1,
  composerVersion: 1, sourceHash: hash, format: 'feature',
  blocks: [
    { type: 'heading', text: 'Who We Follow' },
    { type: 'paragraph', text: 'Vera Solano fights The Meridian Group.', sourceFieldIds: ['spine.protagonist', 'spine.centralOpposition'] },
  ],
  fidelity: { status: 'clean', warnings: [] },
}

const baseProps = {
  content: syntheticOutlineFeature, format: 'feature' as const, identity,
  composed, isComposing: false, onCompose: vi.fn(), error: null,
}

describe('OutlineDocumentView', () => {
  it('renders composed prose, not labeled answer rows', () => {
    render(<OutlineDocumentView {...baseProps} />)
    expect(screen.getByText('Who We Follow')).toBeInTheDocument()
    expect(screen.getByText(/Vera Solano fights The Meridian Group/)).toBeInTheDocument()
  })
  it('NEVER renders sourceFieldIds, recipe labels, or fidelity internals in the body', () => {
    const { container } = render(<OutlineDocumentView {...baseProps} />)
    expect(container.textContent).not.toContain('spine.protagonist')
    expect(container.textContent).not.toContain('sourceFieldIds')
    expect(container.textContent).not.toContain('whatHappens')
  })
  it('shows Compose CTA when ready and uncomposed', () => {
    render(<OutlineDocumentView {...baseProps} composed={undefined} />)
    expect(screen.getByRole('button', { name: /compose/i })).toBeEnabled()
  })
  it('disables Compose when below readiness', () => {
    render(<OutlineDocumentView {...baseProps} composed={undefined} content={({ ...syntheticOutlineFeature, spine: { protagonist: '', externalGoal: '', internalNeed: '', centralOpposition: '', coreStakes: '', theme: '', ending: '' }, units: [] } as never)} />)
    expect(screen.getByRole('button', { name: /compose/i })).toBeDisabled()
  })
  it('shows an answer-stale banner when answers changed', () => {
    render(<OutlineDocumentView {...baseProps} composed={{ ...composed, sourceHash: 'stale' }} />)
    expect(screen.getByText(/answers changed/i)).toBeInTheDocument()
  })
})
