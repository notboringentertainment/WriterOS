import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryContextPackage } from '../../shared/projectMemory'
import type { ProjectMemoryProvider } from '../../server/projectMemory/agentContext'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import * as modelProvider from '../../server/ai/modelProvider'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { registerLookbookRoutes } from '../../server/lookbook/lookbookRoutes'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'

const PROJECT_ID = 'lookbook-route-project-1234'
const BEAT = 'beat.the-dinner'
const servers: Server[] = []
const roots: string[] = []
let workspace: string
let store: ProjectLibraryStore
let port: number
let memoryProvider: ProjectMemoryProvider | null = null
let generate: ReturnType<typeof vi.fn>

const headers = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'test-session-token' }
const path_ = `/api/lookbook/${PROJECT_ID}/questions`

function config(): ProjectLibraryConfig {
  return {
    enabled: true,
    rootPath: workspace,
    label: 'WriterOS Projects',
    sessionToken: 'test-session-token',
    allowedOrigins: new Set(['http://127.0.0.1:5177']),
  }
}

function makeProject(): StoredProject {
  const state = defaultProjectState()
  state.meta.title = 'The Salt Line'
  state.documents.outline.content.units = [{
    id: BEAT, number: 1, actOrSequence: 'Movement one', title: 'The dinner.', location: '', characters: [],
    whatHappens: 'Two families sit down to eat and nobody mentions the empty chair.',
    conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '',
  }]
  state.documents.lookbook = {
    version: 1,
    beats: {
      [BEAT]: {
        titleAtAsk: 'The dinner.',
        questions: [
          { id: 'lb_1', prompt: 'What is on the table when the scene opens?', answer: '', askedBy: 'zoe', createdAt: '2026-09-01T00:00:00.000Z' },
          { id: 'lb_2', prompt: 'A dismissed question about the ceiling?', answer: '', askedBy: 'zoe', createdAt: '2026-09-01T00:00:00.000Z', dismissedAt: '2026-09-02T00:00:00.000Z' },
        ],
      },
    },
  }
  return { id: PROJECT_ID, createdAt: Date.parse('2026-08-01T12:00:00.000Z'), updatedAt: Date.parse('2026-08-02T12:00:00.000Z'), state }
}

function post(body: unknown, hdrs: Record<string, string> = headers) {
  const payload = JSON.stringify(body)
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: path_, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)), ...hdrs },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(Buffer.from(c)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : undefined })
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function tree(dir: string, root = dir): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(out, await tree(full, root))
    else if (!entry.name.endsWith('.lock')) out[path.relative(root, full)] = await readFile(full, 'utf8')
  }
  return out
}

const good = JSON.stringify({
  questions: [
    { prompt: 'What time of day is it at the table?' },
    { prompt: 'What is the light source in the room?' },
    { prompt: 'What does each guest wear to the dinner?' },
  ],
  nothingToSee: false,
})

function stub(responses: string[]) {
  const queue = [...responses]
  generate = vi.fn(async () => queue.shift() ?? '')
  vi.spyOn(modelProvider, 'createModelProvider').mockReturnValue({
    name: 'openai', model: 'test-model', isConfigured: () => true, generateResponse: generate,
  } as never)
}

async function startApp() {
  workspace = await mkdtemp(path.join(tmpdir(), 'writeros-lookbook-ws-'))
  roots.push(workspace)
  store = await createProjectLibraryStore(workspace)
  await store.writeProject(makeProject())
  const app = express()
  app.use(express.json({ limit: WRITEROS_JSON_BODY_LIMIT }))
  registerLookbookRoutes(app, config(), store, memoryProvider)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
}

beforeEach(async () => {
  memoryProvider = null
  await startApp()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('POST /api/lookbook/:projectId/questions', () => {
  it('returns 3–5 prompts from a valid model reply and a receipt', async () => {
    stub([good])
    const before = await tree(workspace)
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-1' })
    expect(res.status).toBe(200)
    expect(res.json.nothingToSee).toBe(false)
    expect(res.json.questions).toHaveLength(3)
    expect(res.json.questions[0]).toEqual({ prompt: 'What time of day is it at the table?' })
    expect(res.json.memoryReceipt).toMatchObject({ status: 'disabled' })
    expect(await tree(workspace)).toEqual(before)
  })

  it('returns zero prompts with nothingToSee when the model says so', async () => {
    stub([JSON.stringify({ questions: [], nothingToSee: true })])
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-2' })
    expect(res.status).toBe(200)
    expect(res.json.questions).toEqual([])
    expect(res.json.nothingToSee).toBe(true)
  })

  it('422s when the model reply is not JSON twice, and writes nothing', async () => {
    stub(['sorry, no json here', 'still not json'])
    const before = await tree(workspace)
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-3' })
    expect(res.status).toBe(422)
    expect(res.json.error).toBe('lookbook_failed')
    expect(typeof res.json.reason).toBe('string')
    expect(generate).toHaveBeenCalledTimes(2)
    expect(await tree(workspace)).toEqual(before)
  })

  it('retries once when the first reply has fewer than 3 prompts', async () => {
    stub([JSON.stringify({ questions: [{ prompt: 'What is the light source?' }], nothingToSee: false }), good])
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-4' })
    expect(res.status).toBe(200)
    expect(res.json.questions).toHaveLength(3)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('builds the prompt from the on-disk unit, not from the request', async () => {
    stub([good])
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-5' })
    expect(res.status).toBe(200)
    const input = generate.mock.calls[0][0] as { systemPrompt: string; messages: Array<{ content: string }> }
    const user = JSON.parse(input.messages[0].content)
    expect(user.title).toBe('The dinner.')
    expect(user.body).toBe('Two families sit down to eat and nobody mentions the empty chair.')
    expect(user.movement).toBe('Movement one')
    expect(user.existingPrompts).toEqual(['What is on the table when the scene opens?'])
    expect(input.systemPrompt).toContain('Zoe')
    expect(input.systemPrompt).toContain('You write questions for a Lookbook')
    // the client cannot smuggle text in
    const smuggle = await post({ beatKey: BEAT, clientRequestId: 'req-6', title: 'Injected', whatHappens: 'Injected' })
    expect(smuggle.status).toBe(400)
  })

  it('404s for a beatKey that is not in the outline', async () => {
    stub([good])
    const res = await post({ beatKey: 'beat.nope', clientRequestId: 'req-7' })
    expect(res.status).toBe(404)
    expect(res.json).toEqual({ error: 'beat_not_found' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('requires the session header', async () => {
    stub([good])
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-8' }, { Origin: 'http://127.0.0.1:5177' })
    expect(res.status).toBe(401)
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('memory citations in Zoe prompts', () => {
  const allowed = '[M-64E3-00760069007300690062006C0065]'
  const invented = '[M-ABCD-0069006E00760065006E0074]'
  const source = {
    workflow: 'writeros' as const, sourceId: 'document:story-bible', sourceUri: 'writeros://documents/story-bible#harbour',
    sourceHash: 'sha256:source', capturedAt: '2026-08-14T12:00:00.000Z', approval: 'explicit' as const,
  }
  const context: MemoryContextPackage = {
    projectId: PROJECT_ID, revision: 3,
    activeCanon: [{
      id: 'visible', projectId: PROJECT_ID, kind: 'canon', status: 'active', claim: 'The harbour closes at midnight.',
      tags: [], entities: [], source, evidence: [], safety: 'clear', spoiler: false, supersedes: [],
      createdAt: '2026-08-14T12:00:00.000Z', updatedAt: '2026-08-14T12:00:00.000Z',
    }],
    relevant: [], conflicts: [], spoilerConflictIds: [], citationMap: { [allowed]: source },
  }

  async function restart() {
    await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))))
    memoryProvider = { context: async () => context }
    await startApp()
  }

  it('strips citation tokens from prompts, lists only authorised ones in the receipt', async () => {
    await restart()
    stub([JSON.stringify({
      questions: [
        { prompt: `What time of day is it at the table? ${allowed}` },
        { prompt: `What is the light source in the room? ${invented}` },
        { prompt: 'What does each guest wear to the dinner?' },
      ],
      nothingToSee: false,
    })])
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-c1' })
    expect(res.status).toBe(200)
    expect(res.json.questions.map((q: { prompt: string }) => q.prompt)).toEqual([
      'What time of day is it at the table?',
      'What is the light source in the room?',
      'What does each guest wear to the dinner?',
    ])
    expect(res.json.memoryReceipt.status).toBe('available')
    expect(res.json.memoryReceipt.citations.map((c: { id: string }) => c.id)).toEqual([allowed])
  })

  it('treats a prompt that falls out of range after stripping as invalid and retries', async () => {
    await restart()
    stub([
      JSON.stringify({ questions: [{ prompt: `${invented} Light?` }, { prompt: 'What is the light source in the room?' }, { prompt: 'What does each guest wear to the dinner?' }], nothingToSee: false }),
      good,
    ])
    const res = await post({ beatKey: BEAT, clientRequestId: 'req-c2' })
    expect(res.status).toBe(200)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(res.json.questions[0].prompt).toBe('What time of day is it at the table?')
  })
})
