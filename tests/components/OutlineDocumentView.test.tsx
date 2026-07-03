import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OutlineDocumentView } from '../../client/src/components/writing/outline/OutlineDocumentView'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { createEmptyOutlineContent } from '../../shared/documents'
import { setOutlinePath } from '../../client/src/lib/outlineDeck'
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

  it('shows error/retry UI when ready_uncomposed and a compose error is present', () => {
    render(<OutlineDocumentView {...baseProps} composed={undefined} error="WriterOS could not compose this document right now." />)
    expect(screen.getByText(/could not compose/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    // Compose CTA still available alongside the error.
    expect(screen.getByRole('button', { name: /compose this outline/i })).toBeEnabled()
  })

  it('does not double punctuation when a leadInParagraph lead ends with punctuation', () => {
    const withLead: ComposedDocument = {
      ...composed,
      blocks: [
        { type: 'leadInParagraph', lead: 'Where We Begin.', text: 'A ledger entry surfaces.', sourceFieldIds: ['spine.protagonist'] },
      ],
    }
    const { container } = render(<OutlineDocumentView {...baseProps} composed={withLead} />)
    expect(container.textContent).toContain('Where We Begin.')
    expect(container.textContent).not.toContain('Where We Begin..')
  })

  it('omits the "add ... for a fuller document" clause when nothing is omitted', () => {
    // Partial tier with no omitted sections: core met, every omittable section has
    // a field present, but a non-omittable section important field is unanswered.
    let partial = createEmptyOutlineContent()
    partial = setOutlinePath(partial, 'spine.protagonist', 'Vera Solano')
    partial = setOutlinePath(partial, 'spine.internalNeed', 'to trust people again')
    partial = setOutlinePath(partial, 'spine.centralOpposition', 'The Meridian Group')
    partial = setOutlinePath(partial, 'spine.coreStakes', 'her freedom')
    partial = setOutlinePath(partial, 'units[id=feature.incitingIncident].whatHappens', 'A ledger entry surfaces.')
    const h = computeOutlineSourceHash(partial, 'feature', identity)
    const partialComposed: ComposedDocument = { ...composed, sourceHash: h }
    const { container } = render(
      <OutlineDocumentView {...baseProps} content={partial} composed={partialComposed} />,
    )
    expect(container.textContent).toContain('Composed from what you’ve answered so far.')
    expect(container.textContent).not.toMatch(/add\s+for a fuller document/i)
  })
})
