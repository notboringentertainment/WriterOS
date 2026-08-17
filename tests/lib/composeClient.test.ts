import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestOutlineCompose } from '../../client/src/lib/composeClient'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'

const identity = { title: 'T', genre: 'Drama' }
const memoryReceipt = { revision: 41, status: 'available' as const, citations: [], conflictIds: ['conflict-1'] }

function composed(): ComposedDocument {
  return {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: '2026-06-09T00:00:00.000Z',
    model: 'test-model',
    recipeVersion: getOutlineRecipe('feature').recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash: computeOutlineSourceHash(syntheticOutlineFeature, 'feature', identity),
    format: 'feature',
    blocks: [{ type: 'heading', text: 'Who We Follow' }],
    fidelity: { status: 'clean', warnings: [] },
  }
}

describe('requestOutlineCompose', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a parsed composed document for a valid success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ composed: composed() }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestOutlineCompose({
      content: syntheticOutlineFeature,
      format: 'feature',
      identity,
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.composed.blocks[0]).toEqual({ type: 'heading', text: 'Who We Follow' })
  })

  it('sends the folder project identity and retains the exact memory receipt on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ composed: composed(), memoryReceipt }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestOutlineCompose({
      projectId: 'folder-project-1', content: syntheticOutlineFeature, format: 'feature', identity,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).projectId).toBe('folder-project-1')
    expect(result).toMatchObject({ ok: true, memoryReceipt })
  })

  it('retains the exact memory receipt when composition soft-fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ reason: 'compose_failed', memoryReceipt }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestOutlineCompose({
      projectId: 'folder-project-1', content: syntheticOutlineFeature, format: 'feature', identity,
    })

    expect(result).toEqual({ ok: false, reason: 'compose_failed', memoryReceipt })
  })

  it('downgrades malformed success payloads to a client failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ composed: { blocks: [] } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestOutlineCompose({
      content: syntheticOutlineFeature,
      format: 'feature',
      identity,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_compose_response' })
  })
})
