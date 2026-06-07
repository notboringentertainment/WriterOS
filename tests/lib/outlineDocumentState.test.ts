import { describe, expect, it } from 'vitest'
import { deriveOutlineDocumentState } from '../../client/src/lib/outlineDocumentState'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'
import { createEmptyOutlineContent } from '../../shared/documents'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import type { ComposedDocument } from '../../shared/compose/types'

const identity = { title: 'T', genre: 'Drama' }
const composedFor = (sourceHash: string, recipeVersion = 1): ComposedDocument => ({
  schemaVersion: 1, generatedAt: '2026-06-06T00:00:00.000Z', model: 'm', recipeVersion,
  composerVersion: 1, sourceHash, format: 'feature', blocks: [{ type: 'heading', text: 'X' }],
  fidelity: { status: 'clean', warnings: [] },
})

describe('deriveOutlineDocumentState', () => {
  it('below-readiness when sparse and never composed', () => {
    const s = deriveOutlineDocumentState({ content: createEmptyOutlineContent(), format: 'feature', identity, composed: undefined })
    expect(s.kind).toBe('below_readiness')
  })
  it('ready-uncomposed when rich and never composed', () => {
    const s = deriveOutlineDocumentState({ content: syntheticOutlineFeature, format: 'feature', identity, composed: undefined })
    expect(s.kind).toBe('ready_uncomposed')
  })
  it('answer-stale when hash differs', () => {
    const s = deriveOutlineDocumentState({ content: syntheticOutlineFeature, format: 'feature', identity, composed: composedFor('stale-hash') })
    expect(s.kind).toBe('answer_stale')
  })
  it('recipe-stale when hash matches but recipeVersion differs', () => {
    const h = computeOutlineSourceHash(syntheticOutlineFeature, 'feature', identity)
    const s = deriveOutlineDocumentState({ content: syntheticOutlineFeature, format: 'feature', identity, composed: composedFor(h, 0) })
    expect(s.kind).toBe('recipe_stale')
  })
  it('fresh when hash and recipeVersion match and fidelity clean', () => {
    const h = computeOutlineSourceHash(syntheticOutlineFeature, 'feature', identity)
    const s = deriveOutlineDocumentState({ content: syntheticOutlineFeature, format: 'feature', identity, composed: composedFor(h, 1) })
    expect(s.kind).toBe('fresh')
  })
})
