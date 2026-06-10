import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SynopsisDocumentView } from '../../client/src/components/writing/synopsis/SynopsisDocumentView'
import { syntheticSynopsisFeature } from '../fixtures/synopsis/syntheticSynopsis'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import { createEmptySynopsisContent } from '../../shared/documents'
import type { ComposedDocument } from '../../shared/compose/types'

const identity = { title: 'Tideline', genre: 'Thriller' }
const hash = computeSynopsisSourceHash(syntheticSynopsisFeature, 'feature', identity)
const composed: ComposedDocument = {
  schemaVersion: 1, generatedAt: '2026-06-09T00:00:00.000Z', model: 'm',
  recipeVersion: getSynopsisRecipe('feature').recipeVersion, composerVersion: 1,
  sourceHash: hash, format: 'feature',
  blocks: [
    { type: 'heading', text: 'Logline' },
    { type: 'logline', text: 'Vera races a rising flood to expose Meridian.', sourceFieldIds: ['logline.text', 'logline.protagonist'] },
    { type: 'heading', text: 'Synopsis' },
    { type: 'paragraph', text: 'Vera reconciles audits as the water climbs.', sourceFieldIds: ['prose.opening'] },
  ],
  fidelity: { status: 'clean', warnings: [] },
}

const baseProps = {
  content: syntheticSynopsisFeature, format: 'feature' as const, identity,
  composed, isComposing: false, onCompose: vi.fn(), error: null,
}

describe('SynopsisDocumentView', () => {
  it('renders composed synopsis prose, not labeled answer rows', () => {
    render(<SynopsisDocumentView {...baseProps} />)
    expect(screen.getByText('Logline')).toBeInTheDocument()
    expect(screen.getByText('Synopsis')).toBeInTheDocument()
    expect(screen.getByText(/Vera reconciles audits as the water climbs/)).toBeInTheDocument()
  })

  it('NEVER leaks sourceFieldIds or schema paths into the body', () => {
    const { container } = render(<SynopsisDocumentView {...baseProps} />)
    expect(container.textContent).not.toContain('logline.protagonist')
    expect(container.textContent).not.toContain('sourceFieldIds')
    expect(container.textContent).not.toContain('prose.opening')
  })

  it('shows the Compose CTA when ready and uncomposed', () => {
    render(<SynopsisDocumentView {...baseProps} composed={undefined} />)
    expect(screen.getByRole('button', { name: /compose/i })).toBeEnabled()
  })

  it('disables Compose when below readiness (no protagonist)', () => {
    render(<SynopsisDocumentView {...baseProps} composed={undefined} content={createEmptySynopsisContent()} />)
    expect(screen.getByRole('button', { name: /compose/i })).toBeDisabled()
  })

  it('shows an answer-stale banner when answers changed', () => {
    render(<SynopsisDocumentView {...baseProps} composed={{ ...composed, sourceHash: 'stale' }} />)
    expect(screen.getByText(/answers changed/i)).toBeInTheDocument()
  })

  it('shows error/retry alongside the Compose CTA when uncomposed and errored', () => {
    render(<SynopsisDocumentView {...baseProps} composed={undefined} error="WriterOS could not compose this document right now." />)
    expect(screen.getByText(/could not compose/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compose/i })).toBeEnabled()
  })

  it('names the missing ending in the missing-context state', () => {
    const partial = createEmptySynopsisContent()
    partial.logline = { text: '', protagonist: 'Mara', goal: 'Escape', obstacle: 'The tide', stakes: 'Her sister', hook: '' }
    partial.prose.opening = 'A morning.' // no resolution → partial + ending missing
    const partialComposed: ComposedDocument = { ...composed, sourceHash: computeSynopsisSourceHash(partial, 'feature', identity) }
    render(<SynopsisDocumentView {...baseProps} content={partial} composed={partialComposed} />)
    expect(screen.getByText(/ending/i)).toBeInTheDocument()
  })
})
