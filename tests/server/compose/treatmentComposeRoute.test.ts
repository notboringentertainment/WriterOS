import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { registerRoutes } from '../../../server/routes'
import * as modelProvider from '../../../server/ai/modelProvider'
import { syntheticTreatment } from '../../fixtures/treatment/syntheticTreatment'

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
  const generateResponse = vi.fn(async (_req: { systemPrompt: string; maxTokens: number }) => calls.shift() ?? '')
  vi.spyOn(modelProvider, 'createModelProvider').mockReturnValue({
    name: 'test', model: 'test-model', isConfigured: () => true, generateResponse,
  } as never)
  return { generateResponse }
}

// Cite every answered important field so the citation-coverage check stays clean.
// Capitalized tokens stay limited to entities present in the fixture (Mara Voss, Oren Halle).
const goodBlocks = JSON.stringify({ blocks: [
  { type: 'heading', text: 'Logline' },
  { type: 'logline', text: 'Mara Voss dives a drowned city and surfaces with proof its flood was murder.', sourceFieldIds: ['logline', 'concept.premise'] },
  { type: 'heading', text: 'Concept' },
  { type: 'paragraph', text: 'Mara maps ruins under cold patient dread, where what was buried returns as weather.', sourceFieldIds: ['concept.premise', 'concept.tone', 'concept.theme', 'concept.emotionalPromise'] },
  { type: 'heading', text: 'Main Characters' },
  { type: 'paragraph', text: 'Mara Voss salvages alone, blaming herself for staying ashore, hiding the survey she sold.', sourceFieldIds: ['mainCharacters.mara.name', 'mainCharacters.mara.role', 'mainCharacters.mara.externalWant', 'mainCharacters.mara.internalNeed', 'mainCharacters.mara.flawOrWound', 'mainCharacters.mara.secretOrContradiction', 'mainCharacters.mara.arc', 'mainCharacters.mara.relationshipPressure'] },
  { type: 'paragraph', text: 'Oren Halle keeps the city under water and the salvage rights his.', sourceFieldIds: ['mainCharacters.oren.name', 'mainCharacters.oren.role', 'mainCharacters.oren.externalWant'] },
  { type: 'heading', text: 'The Story' },
  { type: 'paragraph', text: 'Mara finds the engineer dead in the bell cage and follows the zip ties to the water authority.', sourceFieldIds: ['prose.opening', 'prose.actOne'] },
  { type: 'paragraph', text: 'Mara survives a cut air line, hears the bell toll underwater, and stops trusting the surface.', sourceFieldIds: ['prose.actTwo', 'prose.customSections.bellscene.body'] },
  { type: 'paragraph', text: 'Mara floods the archive on her own timer, takes the admission, and the city begins to drain.', sourceFieldIds: ['prose.actThree'] },
  { type: 'heading', text: 'Visual and Tonal Language' },
  { type: 'paragraph', text: 'Rooftops stand as islands over streetlights still burning, scored by hydrophone hum and regulator breath.', sourceFieldIds: ['visualAndTonal.overallTone', 'visualAndTonal.visualWorld', 'visualAndTonal.recurringImagesOrMotifs', 'visualAndTonal.musicOrSoundFeeling', 'visualAndTonal.pacing', 'visualAndTonal.genreRules', 'visualAndTonal.compsAndReferences'] },
]})

const identity = { title: 'Tidewrack', genre: 'Thriller' }

describe('POST /api/compose-document — treatment', () => {
  it('returns a clean composed treatment for a rich fixture', async () => {
    stubProvider([goodBlocks])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'treatment', format: 'feature', content: syntheticTreatment, identity,
      })
      expect(res.status).toBe(200)
      expect(res.json.composed.blocks.length).toBeGreaterThan(0)
      expect(res.json.composed.format).toBe('feature')
      expect(res.json.composed.fidelity.status).toBe('clean')
      expect(res.json.composed.sourceHash).toMatch(/^[0-9a-f]{64}$/)
    } finally { await stopServer(server) }
  })

  it('routes the treatment surface to the treatment recipe (treatment headings in output)', async () => {
    const { generateResponse } = stubProvider([goodBlocks])
    const { server, port } = await startApp()
    try {
      await postJson(port, '/api/compose-document', {
        surface: 'treatment', format: 'feature', content: syntheticTreatment, identity,
      })
      const sent = generateResponse.mock.calls[0][0]
      expect(sent.systemPrompt).toContain('treatment')
      expect(sent.systemPrompt).not.toContain('Oliver')
      expect(sent.systemPrompt).toContain('The Story')
      expect(sent.maxTokens).toBe(6000)
    } finally { await stopServer(server) }
  })

  it('returns 422 soft-fail on invalid model JSON', async () => {
    stubProvider(['nope', 'nope'])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'treatment', format: 'feature', content: syntheticTreatment, identity,
      })
      expect(res.status).toBe(422)
      expect(res.json.reason).toBe('compose_failed')
    } finally { await stopServer(server) }
  })

  it('returns 400 on a malformed treatment request', async () => {
    stubProvider([goodBlocks])
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/compose-document', {
        surface: 'treatment', format: 'feature', content: { logline: 'no header' }, identity,
      })
      expect(res.status).toBe(400)
      expect(res.json.error).toBe('invalid_request')
    } finally { await stopServer(server) }
  })
})
