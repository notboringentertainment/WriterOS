import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProjectState } from '../../client/src/lib/useProjectState'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'

import { documentsToLegacy } from '../../client/src/lib/documentMigration'
import { normalizeProjectFormat } from '../../shared/projectFormat'

beforeEach(() => localStorage.clear())

describe('replaceOutlineDocument', () => {
  it('replaces the outline without bumping revision', () => {
    const { result } = renderHook(() => useProjectState())
    const current = result.current.state.documents.outline
    const doc = {
      ...current,
      revision: 7,
      updatedAt: '2026-09-29T17:42:00.000Z',
      content: {
        ...current.content,
        units: [{ ...createOutlineUnit('sample-beat'), title: 'Sample beat', whatHappens: 'Something happens.' }],
      },
    }

    act(() => result.current.replaceOutlineDocument(doc))

    expect(result.current.state.documents.outline).toEqual(doc)
    expect(result.current.state.documents.outline.revision).toBe(7)
    expect(result.current.state.documents.outline.updatedAt).toBe('2026-09-29T17:42:00.000Z')
    expect(result.current.state.outline).toEqual(
      documentsToLegacy(result.current.state.documents, {
        outlineFormat: normalizeProjectFormat(result.current.state.meta.format),
      }).outline,
    )
  })
})
