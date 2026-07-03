import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TreatmentDocumentView } from '../../client/src/components/writing/treatment/TreatmentDocumentView'
import { buildSyntheticTreatment, syntheticTreatment } from '../fixtures/treatment/syntheticTreatment'
import { computeTreatmentSourceHash } from '../../shared/compose/treatmentSourceHash'
import { getTreatmentRecipe } from '../../shared/compose/treatmentRecipe'
import { createEmptyTreatmentContent } from '../../shared/documents'
import type { ComposedDocument } from '../../shared/compose/types'

const identity = { title: 'Tidewrack', genre: 'Thriller' }
const hash = computeTreatmentSourceHash(syntheticTreatment, 'feature', identity)
const composed: ComposedDocument = {
  schemaVersion: 1, generatedAt: '2026-06-12T00:00:00.000Z', model: 'm',
  recipeVersion: getTreatmentRecipe('feature').recipeVersion, composerVersion: 1,
  sourceHash: hash, format: 'feature',
  blocks: [
    { type: 'heading', text: 'Logline' },
    { type: 'logline', text: 'Mara Voss dives a drowned city and surfaces with proof of murder.', sourceFieldIds: ['logline'] },
    { type: 'heading', text: 'The Story' },
    { type: 'paragraph', text: 'Mara finds the engineer zip-tied to the bell cage at dawn.', sourceFieldIds: ['prose.opening'] },
  ],
  fidelity: { status: 'clean', warnings: [] },
}

const baseProps = {
  content: syntheticTreatment, format: 'feature' as const, identity,
  composed, isComposing: false, onCompose: vi.fn(), error: null,
}

describe('TreatmentDocumentView — composed contract', () => {
  it('renders composed treatment prose, not labeled answer rows', () => {
    render(<TreatmentDocumentView {...baseProps} />)
    expect(screen.getByText('Mara finds the engineer zip-tied to the bell cage at dawn.')).toBeInTheDocument()
    // Edit View questions never appear in the professional body.
    expect(screen.queryByText('What is the story in one sentence?')).not.toBeInTheDocument()
    expect(screen.queryByText('How does the story open on screen?')).not.toBeInTheDocument()
  })

  it('NEVER leaks sourceFieldIds, schema paths, or recipe keys into the body', () => {
    const { container } = render(<TreatmentDocumentView {...baseProps} />)
    expect(container.textContent).not.toContain('sourceFieldIds')
    expect(container.textContent).not.toContain('prose.opening')
    expect(container.textContent).not.toContain('treatmentBody')
  })

  it('shows the Compose CTA when ready and uncomposed', () => {
    render(<TreatmentDocumentView {...baseProps} composed={undefined} />)
    expect(screen.getByRole('button', { name: /compose this treatment/i })).toBeEnabled()
  })

  it('disables Compose when below readiness (empty content)', () => {
    render(<TreatmentDocumentView {...baseProps} content={createEmptyTreatmentContent()} composed={undefined} />)
    expect(screen.getByRole('button', { name: /compose this treatment/i })).toBeDisabled()
    expect(screen.getByText(/add a few more answers before composing your treatment/i)).toBeInTheDocument()
  })

  it('shows an answer-stale banner when answers changed', () => {
    const changed = buildSyntheticTreatment()
    changed.prose.actTwo = 'A different middle.'
    render(<TreatmentDocumentView {...baseProps} content={changed} />)
    expect(screen.getByText(/your answers changed — recompose/i)).toBeInTheDocument()
  })

  it('shows a recipe-stale banner for an older recipe version', () => {
    render(<TreatmentDocumentView {...baseProps} composed={{ ...composed, recipeVersion: 0 }} />)
    expect(screen.getByText(/a newer document format is available — recompose/i)).toBeInTheDocument()
  })

  it('labels a flagged artifact structure-checked, not meaning-verified', () => {
    render(
      <TreatmentDocumentView
        {...baseProps}
        composed={{ ...composed, fidelity: { status: 'flagged', warnings: [{ kind: 'coverage', message: 'x' }] } }}
      />,
    )
    expect(screen.getByText(/structure-checked, not meaning-verified/i)).toBeInTheDocument()
  })

  it('names the missing ending in the missing-context state', () => {
    const content = buildSyntheticTreatment()
    content.prose.actThree = ''
    const stillCurrent = { ...composed, sourceHash: computeTreatmentSourceHash(content, 'feature', identity) }
    render(<TreatmentDocumentView {...baseProps} content={content} composed={stillCurrent} />)
    expect(screen.getByText(/composed from what you’ve answered so far/i)).toBeInTheDocument()
    expect(screen.getByText(/the ending isn’t answered yet/i)).toBeInTheDocument()
  })

  it('shows error/retry alongside the Compose CTA when uncomposed and errored', () => {
    render(<TreatmentDocumentView {...baseProps} composed={undefined} error="WriterOS could not compose this document right now." />)
    expect(screen.getByText(/could not compose/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders the title and metadata outside the composed body, with format from the prop authority', () => {
    const content = buildSyntheticTreatment()
    content.header = { title: 'Tidewrack', writer: 'Ben', format: 'feature', genre: 'Thriller', version: 'Draft 2', date: 'June 2026' }
    const stillCurrent = { ...composed, sourceHash: computeTreatmentSourceHash(content, 'feature', identity) }
    render(<TreatmentDocumentView {...baseProps} content={content} composed={stillCurrent} format="feature" />)
    expect(screen.getByRole('heading', { name: 'Tidewrack' })).toBeInTheDocument()
    expect(screen.getByText('Ben')).toBeInTheDocument()
    expect(screen.getByText('Draft 2')).toBeInTheDocument()
  })

  it('uses the format prop as authority, not a stale header.format mirror', () => {
    const content = buildSyntheticTreatment()
    content.header = { ...content.header, title: 'Tidewrack', format: 'series' }
    const stillCurrent = { ...composed, sourceHash: computeTreatmentSourceHash(content, 'feature', identity) }
    render(<TreatmentDocumentView {...baseProps} content={content} composed={stillCurrent} format="feature" />)
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.queryByText('series')).not.toBeInTheDocument()
  })

  it('shows Composing… while a request is in flight', () => {
    render(<TreatmentDocumentView {...baseProps} isComposing />)
    expect(screen.getByText('Composing…')).toBeInTheDocument()
  })
})
