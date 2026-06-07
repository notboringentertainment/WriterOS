import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectState } from '../../client/src/lib/useProjectState'
import type { ComposedDocument } from '../../shared/compose/types'

beforeEach(() => localStorage.clear())

const composed: ComposedDocument = {
  schemaVersion: 1,
  generatedAt: '2026-06-06T00:00:00.000Z',
  model: 'm',
  recipeVersion: 1,
  composerVersion: 1,
  sourceHash: 'h',
  format: 'feature',
  blocks: [{ type: 'heading', text: 'X' }],
  fidelity: { status: 'clean', warnings: [] },
}

describe('useProjectState composed', () => {
  it('sets and clears the composed outline artifact', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setComposedDocument('outline', composed))
    expect(result.current.state.documents.outline.composed?.sourceHash).toBe('h')
    act(() => result.current.clearOutline())
    expect(result.current.state.documents.outline.composed).toBeUndefined()
  })

  it('computes currentOutlineSourceHash from answers', () => {
    const { result } = renderHook(() => useProjectState())
    const h1 = result.current.currentOutlineSourceHash()
    act(() => result.current.setOutlineDocument(c => ({ ...c, spine: { ...c.spine, protagonist: 'Mara' } })))
    expect(result.current.currentOutlineSourceHash()).not.toBe(h1)
  })
})
