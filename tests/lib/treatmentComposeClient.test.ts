import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestTreatmentCompose } from '../../client/src/lib/treatmentComposeClient'
import { computeTreatmentSourceHash } from '../../shared/compose/treatmentSourceHash'
import { getTreatmentRecipe } from '../../shared/compose/treatmentRecipe'
import { COMPOSED_SCHEMA_VERSION, COMPOSER_VERSION, type ComposedDocument } from '../../shared/compose/types'
import { syntheticTreatment } from '../fixtures/treatment/syntheticTreatment'

const identity = { title: 'Tidewrack', genre: 'Thriller' }
const memoryReceipt = { revision: 43, status: 'available' as const, citations: [], conflictIds: [] }

function composed(): ComposedDocument {
  return {
    schemaVersion: COMPOSED_SCHEMA_VERSION,
    generatedAt: '2026-06-12T00:00:00.000Z',
    model: 'test-model',
    recipeVersion: getTreatmentRecipe('feature').recipeVersion,
    composerVersion: COMPOSER_VERSION,
    sourceHash: computeTreatmentSourceHash(syntheticTreatment, 'feature', identity),
    format: 'feature',
    blocks: [{ type: 'heading', text: 'Logline' }],
    fidelity: { status: 'clean', warnings: [] },
  }
}

describe('requestTreatmentCompose', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('posts surface=treatment and returns a parsed composed document', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: composed() }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestTreatmentCompose({ content: syntheticTreatment, format: 'feature', identity })

    expect(result.ok).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.surface).toBe('treatment')
    if (result.ok) expect(result.composed.blocks[0]).toEqual({ type: 'heading', text: 'Logline' })
  })

  it('sends its folder project identity and retains the exact memory receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: composed(), memoryReceipt }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestTreatmentCompose({
      projectId: 'folder-project-3', content: syntheticTreatment, format: 'feature', identity,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).projectId).toBe('folder-project-3')
    expect(result).toMatchObject({ ok: true, memoryReceipt })
  })

  it('downgrades malformed success payloads to a client failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ composed: { blocks: [] } }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestTreatmentCompose({ content: syntheticTreatment, format: 'feature', identity })
    expect(result).toEqual({ ok: false, reason: 'invalid_compose_response' })
  })

  it('surfaces a server reason on HTTP failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ reason: 'compose_failed' }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestTreatmentCompose({ content: syntheticTreatment, format: 'feature', identity })
    expect(result).toEqual({ ok: false, reason: 'compose_failed' })
  })
})
