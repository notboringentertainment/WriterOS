import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { registerRoutes } from '../../server/routes'
import { OpenAIService } from '../../server/ai/openaiService'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import type { StoryMemory } from '../../shared/schema'

afterEach(() => {
  vi.restoreAllMocks()
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

describe('/api/wp-chat synopsis story-coach context', () => {
  it('sends Sam active Feature synopsis document content instead of stale header format', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.format = 'feature'
    state.documents.synopsis.content.header.format = 'series'
    state.documents.synopsis.content.logline.text = 'A medic exposes a rescue conspiracy before her brother vanishes.'
    state.documents.synopsis.content.prose.opening = 'A medic hears a missing patient on the emergency line.'
    state.documents.synopsis.content.prose.resolution = 'She exposes the network and saves her brother.'
    state.documents.synopsis.content.series = {
      seriesType: 'ongoing',
      episodeLength: 'hour',
      showOverview: 'Inactive show overview.',
      pilot: { logline: '', prose: '' },
      seasonOneArc: '',
      futureSeasons: [],
      characters: [],
      compsAndWhyThisShowNow: '',
    }

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Review the synopsis.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.project.format).toBe('feature')
      expect(storyMemory.project.logline).toBe('A medic exposes a rescue conspiracy before her brother vanishes.')
      expect(storyMemory.project.synopsis).toContain('Feature logline: A medic exposes')
      expect(storyMemory.project.synopsis).toContain('Opening: A medic hears a missing patient')
      expect(storyMemory.project.synopsis).toContain('Resolution: She exposes the network')
      expect(storyMemory.project.synopsis).not.toContain('Inactive show overview')
    } finally {
      server.close()
    }
  })

  it('sends Sam active Series synopsis document content when project format is Series', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.synopsis.content.header.format = 'feature'
    state.documents.synopsis.content.prose.opening = 'Inactive feature prose.'
    state.synopsis.sections.setup = 'Legacy setup remains available.'
    state.documents.synopsis.content.series = {
      seriesType: 'limited',
      episodeLength: 'hour',
      showOverview: 'A renewable conflict in a sealed city.',
      pilot: {
        logline: 'A runner takes the wrong rescue call.',
        prose: 'The pilot traps the team inside the system they serve.',
      },
      seasonOneArc: 'The team learns the rescue network is choosing who lives.',
      futureSeasons: [{ id: 's2', label: 'Season 2', summary: 'The conspiracy moves outside the city.' }],
      characters: [{
        id: 'c1',
        name: 'Mara',
        role: 'Lead medic',
        bio: 'A disciplined medic with a personal stake.',
        arcPerSeason: ['Trusts no one'],
      }],
      compsAndWhyThisShowNow: 'Emergency procedural pressure with serialized civic paranoia.',
    }

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Review the series synopsis.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.project.format).toBe('series')
      expect(storyMemory.project.synopsis).toContain('Show Overview: A renewable conflict')
      expect(storyMemory.project.synopsis).toContain('Pilot logline: A runner takes the wrong rescue call.')
      expect(storyMemory.project.synopsis).toContain('Season One Arc: The team learns')
      expect(storyMemory.project.synopsis).toContain('Characters: Mara')
      expect(storyMemory.project.synopsis).not.toContain('Inactive feature prose')
      expect(storyMemory.project.synopsisSections?.setup).toBe('Legacy setup remains available.')
    } finally {
      server.close()
    }
  })
})
