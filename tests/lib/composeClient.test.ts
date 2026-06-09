import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestOutlineCompose } from '../../client/src/lib/composeClient'
import { computeOutlineSourceHash } from '../../shared/compose/sourceHash'
import { getOutlineRecipe } from '../../shared/compose/recipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'

const identity = { title: 'T', genre: 'Drama' }

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
