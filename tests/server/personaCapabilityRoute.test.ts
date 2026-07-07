import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const { runNativeResearchTool } = vi.hoisted(() => ({
  runNativeResearchTool: vi.fn(),
}))

vi.mock('../../server/ai/agentRuntime/tools/research', () => ({
  runNativeResearchTool,
}))

import { registerRoutes } from '../../server/routes'
import { OpenAIService } from '../../server/ai/openaiService'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  runNativeResearchTool.mockReset()
})

async function startApp() {
  const app = express()
  app.use(express.json())
  const server = await registerRoutes(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return { server, port: address.port }
}

function postJson(port: number, path: string, body: unknown): Promise<{ status: number; json: any; text: string }> {
  const payload = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: res.statusCode ?? 0,
          text,
          json: text ? JSON.parse(text) : undefined,
        })
      })
    })

    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

describe('/api/persona-capability/run', () => {
  it('returns synthesized Zoe response and receipt without raw upstream task body', async () => {
    runNativeResearchTool.mockResolvedValue({
      taskResult: {
        findings: [
          { claim: 'Raw upstream historical note that should stay out of HTTP response.', sourceLabel: 'Archive', verified: true },
        ],
        sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
        missing: [],
        unverified: [],
      },
      citedSourceUrls: [],
    })
    vi.spyOn(OpenAIService.prototype, 'synthesizePersonaCapabilityResponse').mockResolvedValue({
      finalMessage: 'Zoe synthesized answer. [Archive]',
      citedLabels: ['Archive'],
    })

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/persona-capability/run', {
        personaId: 'zoe',
        taskKind: 'research_world_context',
        message: 'research the construction period',
        projectContext: buildProjectContext(defaultProjectState()),
        sourceSurface: 'writingPartner',
        clientRequestId: 'req-1',
      })

      expect(response.status).toBe(200)
      expect(response.json.finalMessage).toBe('Zoe synthesized answer. [Archive]')
      expect(response.json.status).toBe('ok')
      expect(response.json.receipt.sources).toEqual([
        { label: 'Archive', url: 'https://example.com/archive', citedInFinal: true },
      ])
      expect(response.text).not.toContain('Raw upstream historical note')
    } finally {
      server.close()
    }
  })

  it('passes a route abort signal into the native research tool', async () => {
    runNativeResearchTool.mockResolvedValue({
      taskResult: { findings: [], sources: [], missing: [], unverified: [] },
      citedSourceUrls: [],
    })
    vi.spyOn(OpenAIService.prototype, 'synthesizePersonaCapabilityResponse').mockResolvedValue({
      finalMessage: 'Zoe synthesized answer.',
      citedLabels: [],
    })

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/persona-capability/run', {
        personaId: 'zoe',
        taskKind: 'research_world_context',
        message: 'research the construction period',
        projectContext: buildProjectContext(defaultProjectState()),
        sourceSurface: 'writingPartner',
        clientRequestId: 'req-1',
      })

      expect(response.status).toBe(200)
      expect(runNativeResearchTool).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
        signal: expect.any(AbortSignal),
      }))
    } finally {
      server.close()
    }
  })

  it('rejects disallowed persona capability requests', async () => {
    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/persona-capability/run', {
        personaId: 'sam',
        taskKind: 'research_world_context',
        message: 'research this',
        projectContext: buildProjectContext(defaultProjectState()),
        sourceSurface: 'writingPartner',
        clientRequestId: 'req-1',
      })

      expect(response.status).toBe(400)
      expect(response.json.error).toBe('Invalid persona capability request')
    } finally {
      server.close()
    }
  })
})
