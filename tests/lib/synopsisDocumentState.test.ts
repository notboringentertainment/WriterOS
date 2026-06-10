import { describe, expect, it } from 'vitest'
import { deriveSynopsisDocumentState } from '../../client/src/lib/synopsisDocumentState'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'
import { createEmptySynopsisContent, type SynopsisDocumentContent } from '../../shared/documents'

const identity = { title: 'Tideline', genre: 'Thriller' }

function richFeature(): SynopsisDocumentContent {
  const c = createEmptySynopsisContent()
  c.logline = { text: 'A flood thriller.', protagonist: 'Mara', goal: 'Escape', obstacle: 'The tide', stakes: 'Her sister', hook: 'low tide' }
  c.prose = { opening: 'A morning.', escalation: 'It rises.', middle: 'She runs.', climax: 'It floods.', resolution: 'She lets go.' }
  return c
}

function composedFor(content: SynopsisDocumentContent, over: Partial<ComposedDocument> = {}): ComposedDocument {
  return {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: '2026-06-09T00:00:00.000Z',
    model: 'test-model',
    recipeVersion: getSynopsisRecipe('feature').recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash: computeSynopsisSourceHash(content, 'feature', identity),
    format: 'feature',
    blocks: [{ type: 'heading', text: 'Logline' }],
    fidelity: { status: 'clean', warnings: [] },
    ...over,
  }
}

describe('deriveSynopsisDocumentState', () => {
  it('below_readiness when uncomposed and no protagonist', () => {
    const content = createEmptySynopsisContent(); content.prose.opening = 'A morning.'
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed: undefined })
    expect(s.kind).toBe('below_readiness')
    expect(s.missingCoreLabels.length).toBeGreaterThan(0)
  })

  it('ready_uncomposed when partial and not yet composed', () => {
    const content = createEmptySynopsisContent()
    content.logline.protagonist = 'Mara'; content.prose.opening = 'A morning.'
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed: undefined })
    expect(s.kind).toBe('ready_uncomposed')
  })

  it('answer_stale when the source hash no longer matches', () => {
    const content = richFeature()
    const composed = composedFor(content, { sourceHash: 'stale' })
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed })
    expect(s.kind).toBe('answer_stale')
  })

  it('recipe_stale when answers match but the recipe version differs', () => {
    const content = richFeature()
    const composed = composedFor(content, { recipeVersion: getSynopsisRecipe('feature').recipeVersion + 1 })
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed })
    expect(s.kind).toBe('recipe_stale')
  })

  it('flagged when fidelity is flagged', () => {
    const content = richFeature()
    const composed = composedFor(content, { fidelity: { status: 'flagged', warnings: [] } })
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed })
    expect(s.kind).toBe('flagged')
  })

  it('missing_context with endingMissing when partial and the ending is unanswered', () => {
    const content = createEmptySynopsisContent()
    content.logline = { text: '', protagonist: 'Mara', goal: 'Escape', obstacle: 'The tide', stakes: 'Her sister', hook: '' }
    content.prose.opening = 'A morning.' // no resolution → partial + ending missing
    const composed = composedFor(content)
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed })
    expect(s.kind).toBe('missing_context')
    expect(s.endingMissing).toBe(true)
  })

  it('fresh when rich, hash matches, recipe current, and fidelity clean', () => {
    const content = richFeature()
    const composed = composedFor(content)
    const s = deriveSynopsisDocumentState({ content, format: 'feature', identity, composed })
    expect(s.kind).toBe('fresh')
    expect(s.endingMissing).toBe(false)
  })
})
