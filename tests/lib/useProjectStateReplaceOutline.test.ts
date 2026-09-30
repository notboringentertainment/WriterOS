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

    expect(result.current.state.documents.outline).toEqual({ ...doc, revision: 7 })
    expect(result.current.state.documents.outline.revision).toBe(7)
    expect(result.current.state.documents.outline.updatedAt).toBe('2026-09-29T17:42:00.000Z')
    expect(result.current.state.outline).toEqual(
      documentsToLegacy(result.current.state.documents, {
        outlineFormat: normalizeProjectFormat(result.current.state.meta.format),
      }).outline,
    )
  })

  it('keeps the current spine and takes the server units and beatSheetSource', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setOutlineDocument(c => ({ ...c, spine: { ...c.spine, theme: 'Just typed.' } })))
    const current = result.current.state.documents.outline
    const source = { ticket: 'resolved/x.md', sourceHash: 'abc', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1, label: 'pilot' }
    const doc = {
      ...current,
      revision: current.revision + 3,
      updatedAt: '2026-09-29T17:42:00.000Z',
      content: {
        ...current.content,
        spine: { ...current.content.spine, theme: 'Older server value.' },
        units: [{ ...createOutlineUnit('beat.a'), title: 'A', whatHappens: 'Something.' }],
        beatSheetSource: source,
      },
    }

    act(() => result.current.replaceOutlineDocument(doc))

    const after = result.current.state.documents.outline
    expect(after.content.spine.theme).toBe('Just typed.')
    expect(after.content.units.map(u => u.id)).toEqual(['beat.a'])
    expect(after.content.beatSheetSource).toEqual(source)
    expect(after.revision).toBe(doc.revision)
    expect(after.updatedAt).toBe(doc.updatedAt)
  })

  it('never lets a writer rewrite units or beatSheetSource once a beat sheet is synced, but applies other changes', () => {
    const { result } = renderHook(() => useProjectState())
    const source = { ticket: 'resolved/x.md', sourceHash: 'abc', syncedAt: '2026-09-29T17:42:00.000Z', beatCount: 1, label: 'pilot' }
    const current = result.current.state.documents.outline
    act(() => result.current.replaceOutlineDocument({
      ...current,
      content: { ...current.content, units: [{ ...createOutlineUnit('beat.a'), title: 'A' }], beatSheetSource: source },
    }))
    const synced = result.current.state.documents.outline.content

    act(() => result.current.setOutlineDocument(c => ({
      ...c, units: [], beatSheetSource: undefined, spine: { ...c.spine, theme: 'Kept change.' },
    })))

    const after = result.current.state.documents.outline.content
    expect(after.units).toEqual(synced.units)
    expect(after.beatSheetSource).toEqual(source)
    expect(after.spine.theme).toBe('Kept change.')
  })
})
