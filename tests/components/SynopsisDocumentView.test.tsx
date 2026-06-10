import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SynopsisDocumentView } from '../../client/src/components/writing/synopsis/SynopsisDocumentView'
import { syntheticSynopsisFeature } from '../fixtures/synopsis/syntheticSynopsis'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import { syntheticSynopsisSeries } from '../fixtures/synopsis/syntheticSynopsis'
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

  it('renders the title and useful metadata outside the composed body (feature)', () => {
    render(<SynopsisDocumentView {...baseProps} />)
    // Title is a top-level heading sourced from header, not a composed block.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tideline')
    expect(screen.getByText('B. Vance')).toBeInTheDocument()
    expect(screen.getByText('Thriller')).toBeInTheDocument()
  })

  it('uses the format prop as authority, not a stale header.format mirror', () => {
    const content = { ...syntheticSynopsisFeature, header: { ...syntheticSynopsisFeature.header, format: 'series' } }
    render(<SynopsisDocumentView {...baseProps} content={content} />)
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.queryByText('series')).not.toBeInTheDocument()
  })

  it('renders series metadata rows and hides the runtime row in series mode', () => {
    const seriesIdentity = { title: 'Reset Crew', genre: 'Heist' }
    const content = { ...syntheticSynopsisSeries, header: { ...syntheticSynopsisSeries.header, targetRuntime: '30m' } }
    const seriesComposed: ComposedDocument = {
      ...composed, format: 'series',
      recipeVersion: getSynopsisRecipe('series').recipeVersion,
      sourceHash: computeSynopsisSourceHash(content, 'series', seriesIdentity),
      blocks: [{ type: 'heading', text: 'Logline' }, { type: 'paragraph', text: 'the crew resets weekly', sourceFieldIds: ['logline.text'] }],
    }
    render(
      <SynopsisDocumentView
        content={content} format="series" identity={seriesIdentity}
        composed={seriesComposed} isComposing={false} onCompose={vi.fn()} error={null}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reset Crew')
    expect(screen.getByText(/ongoing/i)).toBeInTheDocument()
    expect(screen.getByText(/hour/i)).toBeInTheDocument()
    expect(screen.queryByText('30m')).not.toBeInTheDocument()
  })

  it('renders metadata rows even when title and writer are blank', () => {
    const content = { ...syntheticSynopsisFeature, header: { title: '', writer: '', format: '', genre: 'Thriller', targetRuntime: '100', comps: ['Heat'] } }
    render(<SynopsisDocumentView {...baseProps} content={content} />)
    expect(screen.getByText('GENRE')).toBeInTheDocument()
    expect(screen.getByText('Heat')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
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
