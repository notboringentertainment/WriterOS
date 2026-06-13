import { describe, expect, it } from 'vitest'
import { deriveTreatmentDocumentState } from '../../client/src/lib/treatmentDocumentState'
import { computeTreatmentSourceHash } from '../../shared/compose/treatmentSourceHash'
import { getTreatmentRecipe } from '../../shared/compose/treatmentRecipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'
import { createEmptyTreatmentContent, type TreatmentDocumentContent } from '../../shared/documents'
import { buildSyntheticTreatment } from '../fixtures/treatment/syntheticTreatment'

const identity = { title: 'Tidewrack', genre: 'Thriller' }

function composedFor(content: TreatmentDocumentContent, overrides: Partial<ComposedDocument> = {}): ComposedDocument {
  return {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: '2026-06-12T00:00:00.000Z',
    model: 'test-model',
    recipeVersion: getTreatmentRecipe('feature').recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash: computeTreatmentSourceHash(content, 'feature', identity),
    format: 'feature',
    blocks: [{ type: 'heading', text: 'Logline' }],
    fidelity: { status: 'clean', warnings: [] },
    ...overrides,
  }
}

describe('deriveTreatmentDocumentState', () => {
  it('below_readiness when sparse and uncomposed, carrying missing core labels', () => {
    const content = createEmptyTreatmentContent()
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed: undefined })
    expect(state.kind).toBe('below_readiness')
    expect(state.missingCoreLabels.length).toBeGreaterThan(0)
  })

  it('ready_uncomposed when readiness is met but nothing composed yet', () => {
    const content = buildSyntheticTreatment()
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed: undefined })
    expect(state.kind).toBe('ready_uncomposed')
  })

  it('fresh when composed matches the current hash, recipe, and rich readiness', () => {
    const content = buildSyntheticTreatment()
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed: composedFor(content) })
    expect(state.kind).toBe('fresh')
    expect(state.endingMissing).toBe(false)
  })

  it('answer_stale when an authored answer changes after composing', () => {
    const content = buildSyntheticTreatment()
    const composed = composedFor(content)
    content.prose.actTwo = 'A different middle.'
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed })
    expect(state.kind).toBe('answer_stale')
  })

  it('answer_stale when the project format flips (format participates in the hash)', () => {
    const content = buildSyntheticTreatment()
    const composed = composedFor(content)
    const state = deriveTreatmentDocumentState({ content, format: 'series', identity, composed })
    expect(state.kind).toBe('answer_stale')
  })

  it('recipe_stale when the composed artifact has an older recipe version', () => {
    const content = buildSyntheticTreatment()
    const composed = composedFor(content, { recipeVersion: 0 })
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed })
    expect(state.kind).toBe('recipe_stale')
  })

  it('flagged when fidelity is flagged', () => {
    const content = buildSyntheticTreatment()
    const composed = composedFor(content, { fidelity: { status: 'flagged', warnings: [{ kind: 'coverage', message: 'x' }] } })
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed })
    expect(state.kind).toBe('flagged')
  })

  it('missing_context with endingMissing when act three is empty', () => {
    const content = buildSyntheticTreatment()
    content.prose.actThree = ''
    const composed = composedFor(content)
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed })
    expect(state.kind).toBe('missing_context')
    expect(state.endingMissing).toBe(true)
  })

  it('missing_context without the ending note when only a named character is missing', () => {
    const content = buildSyntheticTreatment()
    content.mainCharacters = []
    const composed = composedFor(content)
    const state = deriveTreatmentDocumentState({ content, format: 'feature', identity, composed })
    expect(state.kind).toBe('missing_context')
    expect(state.endingMissing).toBe(false)
  })
})
