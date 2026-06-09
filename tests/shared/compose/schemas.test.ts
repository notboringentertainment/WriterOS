import { describe, expect, it } from 'vitest'
import { ComposedDocumentSchema } from '../../../shared/compose/schemas'

const valid = {
  schemaVersion: 1, generatedAt: '2026-06-06T00:00:00.000Z', model: 'test-model',
  recipeVersion: 1, composerVersion: 1, sourceHash: 'abc', format: 'feature' as const,
  blocks: [
    { type: 'heading', text: 'Who We Follow' },
    { type: 'paragraph', text: 'A woman returns home.', sourceFieldIds: ['spine.protagonist'] },
  ],
  fidelity: { status: 'clean' as const, warnings: [] },
}

describe('ComposedDocumentSchema', () => {
  it('accepts a valid composed document', () => {
    expect(ComposedDocumentSchema.parse(valid)).toMatchObject({ format: 'feature' })
  })
  it('rejects a prose block missing sourceFieldIds', () => {
    const bad = { ...valid, blocks: [{ type: 'paragraph', text: 'x' }] }
    expect(() => ComposedDocumentSchema.parse(bad)).toThrow()
  })
  it('rejects an unknown block type', () => {
    const bad = { ...valid, blocks: [{ type: 'nope', text: 'x' }] }
    expect(() => ComposedDocumentSchema.parse(bad)).toThrow()
  })
})
