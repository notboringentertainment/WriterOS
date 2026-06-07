import { describe, expect, it } from 'vitest'
import {
  AuthoredDocumentStateSchema,
  DOCUMENT_SCHEMA_VERSION,
  OutlineDocumentContentSchema,
  createEmptyOutlineContent,
} from '../../shared/documents'
import type { ComposedDocument } from '../../shared/compose/types'

const composed: ComposedDocument = {
  schemaVersion: 1,
  generatedAt: '2026-06-06T00:00:00.000Z',
  model: 'm',
  recipeVersion: 1,
  composerVersion: 1,
  sourceHash: 'h',
  format: 'feature',
  blocks: [{ type: 'heading', text: 'Outline' }],
  fidelity: { status: 'clean', warnings: [] },
}

describe('AuthoredDocumentState.composed', () => {
  it('DOCUMENT_SCHEMA_VERSION is 2', () => {
    expect(DOCUMENT_SCHEMA_VERSION).toBe(2)
  })

  it('accepts an envelope without composed', () => {
    const schema = AuthoredDocumentStateSchema(OutlineDocumentContentSchema)
    const parsed = schema.parse({
      version: 1,
      mode: 'beat_sheet_save_the_cat',
      updatedAt: '2026-06-06T00:00:00.000Z',
      content: createEmptyOutlineContent(),
    })
    expect(parsed.composed).toBeUndefined()
  })

  it('accepts a composed outline artifact', () => {
    const schema = AuthoredDocumentStateSchema(OutlineDocumentContentSchema)
    const parsed = schema.parse({
      version: 2,
      mode: 'beat_sheet_save_the_cat',
      updatedAt: '2026-06-06T00:00:00.000Z',
      content: createEmptyOutlineContent(),
      composed,
    })
    expect(parsed.composed?.sourceHash).toBe('h')
  })
})
