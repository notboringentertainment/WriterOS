import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { registerRoutes } from '../../server/routes'
import * as modelProvider from '../../server/ai/modelProvider'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'

afterEach(() => { vi.restoreAllMocks() })

async function startApp() {
  const app = express(); app.use(express.json({ limit: '4mb' }))
  await registerRoutes(app)
  const server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  return { server, port: (server.address() as AddressInfo).port }
}
async function postJson(port: number, path: string, body: unknown) {
  const res = await fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: await res.json().catch(() => null) }
}
function stubProvider(responses: string[]) {
  const calls = [...responses]
  vi.spyOn(modelProvider, 'createModelProvider').mockReturnValue({
    name: 'test', model: 'test-model', isConfigured: () => true,
    generateResponse: vi.fn(async () => calls.shift() ?? ''),
  } as never)
}

const cleanSourceIds = [
  'spine.protagonist',
  'spine.externalGoal',
  'spine.internalNeed',
  'spine.centralOpposition',
  'spine.coreStakes',
  'feature.incitingIncident.whatHappens',
  'feature.midpoint.whatHappens',
  'feature.climax.whatHappens',
]
const goodBlocks = JSON.stringify({ blocks: [
  { type: 'heading', text: 'Who We Follow' },
  { type: 'paragraph', text: 'Vera Solano fights The Meridian Group.', sourceFieldIds: cleanSourceIds },
]})

describe('POST /api/compose-document', () => {
  it('returns a composed outline for a clean fixture', async () => {
    stubProvider([goodBlocks])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'outline', format: 'feature', content: syntheticOutlineFeature, identity: { title: 'T', genre: 'Drama' },
      })
      expect(res.status).toBe(200)
      expect(res.json.composed.blocks.length).toBeGreaterThan(0)
      expect(res.json.composed.fidelity.status).toBe('clean')
    } finally { server.close() }
  })
  it('returns 422 soft-fail on invalid model JSON', async () => {
    stubProvider(['nope', 'nope'])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'outline', format: 'feature', content: syntheticOutlineFeature, identity: { title: 'T', genre: 'Drama' },
      })
      expect(res.status).toBe(422)
    } finally { server.close() }
  })
  it('returns 400 on invalid request body', async () => {
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', { surface: 'synopsis' })
      expect(res.status).toBe(400)
    } finally { server.close() }
  })
})
