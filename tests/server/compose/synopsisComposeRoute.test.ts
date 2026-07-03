import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { registerRoutes } from '../../../server/routes'
import * as modelProvider from '../../../server/ai/modelProvider'
import { syntheticSynopsisFeature } from '../../fixtures/synopsis/syntheticSynopsis'

afterEach(() => { vi.restoreAllMocks() })

async function startApp() {
  const app = express(); app.use(express.json({ limit: '4mb' }))
  await registerRoutes(app)
  const server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  return { server, port: (server.address() as AddressInfo).port }
}
async function stopServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => { server.close(err => (err ? reject(err) : resolve())) })
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

// Cite every answered important field (logline + body) so coverage stays clean.
// Keep capitalized tokens to entities present in the fixture (Vera, Meridian).
const goodBlocks = JSON.stringify({ blocks: [
  { type: 'heading', text: 'Logline' },
  { type: 'logline', text: 'Vera races a rising flood to expose Meridian and clear her name.', sourceFieldIds: ['logline.text', 'logline.protagonist', 'logline.goal', 'logline.obstacle', 'logline.stakes', 'logline.hook'] },
  { type: 'heading', text: 'Synopsis' },
  { type: 'paragraph', text: 'Vera reconciles audits as the water climbs and a deleted ledger surfaces.', sourceFieldIds: ['prose.opening', 'prose.escalation'] },
  { type: 'paragraph', text: 'Vera turns an insider, then testifies and loses everything but her integrity.', sourceFieldIds: ['prose.middle', 'prose.climax', 'prose.resolution'] },
]})

describe('POST /api/compose-document — synopsis', () => {
  it('returns a clean composed synopsis for a rich feature fixture', async () => {
    stubProvider([goodBlocks])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'synopsis', format: 'feature', content: syntheticSynopsisFeature, identity: { title: 'Tideline', genre: 'Thriller' },
      })
      expect(res.status).toBe(200)
      expect(res.json.composed.blocks.length).toBeGreaterThan(0)
      expect(res.json.composed.format).toBe('feature')
      expect(res.json.composed.fidelity.status).toBe('clean')
    } finally { await stopServer(server) }
  })

  it('returns 422 soft-fail on invalid model JSON', async () => {
    stubProvider(['nope', 'nope'])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'synopsis', format: 'feature', content: syntheticSynopsisFeature, identity: { title: 'Tideline', genre: 'Thriller' },
      })
      expect(res.status).toBe(422)
      expect(res.json.reason).toBe('compose_failed')
    } finally { await stopServer(server) }
  })
})
