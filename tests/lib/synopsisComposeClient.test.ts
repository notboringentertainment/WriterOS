import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestSynopsisCompose } from '../../client/src/lib/synopsisComposeClient'
import { computeSynopsisSourceHash } from '../../shared/compose/synopsisSourceHash'
import { getSynopsisRecipe } from '../../shared/compose/synopsisRecipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'
import { syntheticSynopsisFeature } from '../fixtures/synopsis/syntheticSynopsis'

const identity = { title: 'Tideline', genre: 'Thriller' }

function composed(): ComposedDocument {
  return {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: '2026-06-09T00:00:00.000Z',
    model: 'test-model',
    recipeVersion: getSynopsisRecipe('feature').recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash: computeSynopsisSourceHash(syntheticSynopsisFeature, 'feature', identity),
    format: 'feature',
    blocks: [{ type: 'heading', text: 'Logline' }],
    fidelity: { status: 'clean', warnings: [] },
  }
}

describe('requestSynopsisCompose', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('posts surface=synopsis and returns a parsed composed document', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: composed() }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestSynopsisCompose({ content: syntheticSynopsisFeature, format: 'feature', identity })

    expect(result.ok).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.surface).toBe('synopsis')
    if (result.ok) expect(result.composed.blocks[0]).toEqual({ type: 'heading', text: 'Logline' })
  })

  it('downgrades malformed success payloads to a client failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: { blocks: [] } }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestSynopsisCompose({ content: syntheticSynopsisFeature, format: 'feature', identity })
    expect(result).toEqual({ ok: false, reason: 'invalid_compose_response' })
  })

  it('surfaces a server reason on HTTP failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ reason: 'compose_failed' }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestSynopsisCompose({ content: syntheticSynopsisFeature, format: 'feature', identity })
    expect(result).toEqual({ ok: false, reason: 'compose_failed' })
  })
})
