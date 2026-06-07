import { describe, expect, it } from 'vitest'
import { migrateState } from '../../client/src/lib/projectState'

describe('migrateState composed handling', () => {
  it('loads a legacy project (no composed) without error and leaves composed undefined', () => {
    const legacy = {
      schemaVersion: 5,
      documents: {
        outline: {
          version: 1,
          mode: 'beat_sheet_save_the_cat',
          updatedAt: '2026-01-01T00:00:00.000Z',
          content: undefined,
        },
      },
    }
    const state = migrateState(legacy)
    expect(state.documents.outline.composed).toBeUndefined()
  })
})
