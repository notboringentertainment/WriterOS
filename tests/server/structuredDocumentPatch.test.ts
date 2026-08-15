import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { registerRoutes } from '../../server/routes'
import { OpenAIService } from '../../server/ai/openaiService'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import { createEmptySynopsisContent, type SynopsisDocumentContent } from '../../shared/documents'
import type { AgentMemoryContext } from '../../server/projectMemory/agentContext'
import type { MemorySource } from '../../shared/projectMemory'

// Generic invented fixture content only — no story/character names from any
// real project.
function fixtureSynopsisContent(overrides: Partial<SynopsisDocumentContent> = {}): SynopsisDocumentContent {
  return {
    ...createEmptySynopsisContent(),
    header: { title: 'A Quiet Harbor', writer: 'Test Writer', format: 'feature', genre: 'drama', targetRuntime: '95m', comps: [] },
    logline: { text: 'A lighthouse keeper confronts a stranger.', protagonist: 'Keeper', goal: 'protect the coast', obstacle: 'the stranger', stakes: 'the town', hook: 'told over one storm' },
    prose: { opening: 'Opening.', escalation: 'Escalation.', middle: 'Middle.', climax: 'Climax.', resolution: 'Resolution.' },
    ...overrides,
  }
}

function fakeSource(overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    workflow: 'writeros',
    sourceId: 'source-1',
    sourceUri: 'writeros://project/1',
    sourceHash: 'hash-1',
    capturedAt: '2026-08-01T00:00:00.000Z',
    approval: 'explicit',
    ...overrides,
  } as MemorySource
}

function fakeAgentMemory(allowedCitations: ReadonlyMap<string, MemorySource> = new Map()): AgentMemoryContext {
  return {
    prompt: '<project_memory_data>\n[M-REAL-0001] Some canon fact.\n</project_memory_data>',
    receipt: { revision: 1, status: 'available', citations: [], conflictIds: [] },
    allowedCitations,
  }
}

function fakeProvider(responses: string[]) {
  const queue = [...responses]
  return {
    name: 'test' as const,
    model: 'test-model',
    isConfigured: () => true,
    generateResponse: vi.fn(async () => queue.shift() ?? ''),
  }
}

// ---------------------------------------------------------------------------
// Unit-level: OpenAIService.generateStructuredDocumentPatch (model call +
// bounded retry + exact-surface Zod validation + citation filtering).
// Mirrors server/compose/composeDocument.test.ts's fakeProvider pattern.
// ---------------------------------------------------------------------------
describe('OpenAIService.generateStructuredDocumentPatch', () => {
  const service = new OpenAIService()

  it('generates a schema-valid patch on the first attempt, filters citations against the supplied memory context, and sets baseVersion from the caller (never the model)', async () => {
    const proposedContent = fixtureSynopsisContent({ logline: { text: 'Revised logline.', protagonist: 'Keeper', goal: 'protect the coast', obstacle: 'the stranger', stakes: 'the town', hook: 'told over one storm' } })
    const raw = JSON.stringify({
      proposedContent,
      changedPaths: ['logline.text'],
      memoryIds: ['[M-REAL-0001]', '[M-INVENTED-9999]'],
      canonConflicts: [],
      rationale: 'Tightened the logline per the writer request.',
    })
    const provider = fakeProvider([raw])
    const allowedCitations = new Map([['[M-REAL-0001]', fakeSource()]])

    const result = await service.generateStructuredDocumentPatch({
      surface: 'synopsis',
      currentContent: fixtureSynopsisContent(),
      baseVersion: 7,
      userMessage: 'Please rewrite the logline.',
      agentMemory: fakeAgentMemory(allowedCitations),
      provider: provider as never,
    })

    expect(result.status).toBe('generated')
    if (result.status !== 'generated') throw new Error('expected generated')
    expect(result.proposal.patch.kind).toBe('structured-document')
    expect(result.proposal.patch.surface).toBe('synopsis')
    expect(result.proposal.patch.baseVersion).toBe(7)
    expect(result.proposal.patch.proposedContent).toEqual(proposedContent)
    expect(result.proposal.patch.changedPaths).toEqual(['logline.text'])
    // The invented id is dropped from both memoryIds and citations.
    expect(result.proposal.patch.memoryIds).toEqual(['[M-REAL-0001]'])
    expect(result.proposal.citations).toEqual([{ id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' }])
    expect(result.proposal.rationale).toBe('Tightened the logline per the writer request.')
    expect(provider.generateResponse).toHaveBeenCalledTimes(1)
  })

  it('retries once on invalid JSON, then fails without a usable patch', async () => {
    const provider = fakeProvider(['not json', 'still not json'])

    const result = await service.generateStructuredDocumentPatch({
      surface: 'synopsis',
      currentContent: fixtureSynopsisContent(),
      baseVersion: 0,
      userMessage: 'Please rewrite the logline.',
      agentMemory: fakeAgentMemory(),
      provider: provider as never,
    })

    expect(result.status).toBe('failed')
    expect(provider.generateResponse).toHaveBeenCalledTimes(2)
  })

  it('fails (after the bounded retry) when proposedContent does not match the exact surface schema', async () => {
    const bad = JSON.stringify({
      proposedContent: { not: 'a synopsis' },
      changedPaths: ['logline.text'],
      memoryIds: [],
      canonConflicts: [],
      rationale: 'R',
    })
    const provider = fakeProvider([bad, bad])

    const result = await service.generateStructuredDocumentPatch({
      surface: 'synopsis',
      currentContent: fixtureSynopsisContent(),
      baseVersion: 0,
      userMessage: 'Please rewrite the logline.',
      agentMemory: fakeAgentMemory(),
      provider: provider as never,
    })

    expect(result.status).toBe('failed')
    expect(provider.generateResponse).toHaveBeenCalledTimes(2)
  })

  it('recovers on the second attempt when the first provider call throws', async () => {
    const proposedContent = fixtureSynopsisContent()
    const raw = JSON.stringify({ proposedContent, changedPaths: [], memoryIds: [], canonConflicts: [], rationale: 'R' })
    const provider = {
      name: 'test' as const,
      model: 'test-model',
      isConfigured: () => true,
      generateResponse: vi.fn()
        .mockRejectedValueOnce(new Error('provider hiccup'))
        .mockResolvedValueOnce(raw),
    }

    const result = await service.generateStructuredDocumentPatch({
      surface: 'synopsis',
      currentContent: fixtureSynopsisContent(),
      baseVersion: 2,
      userMessage: 'Please rewrite the logline.',
      agentMemory: fakeAgentMemory(),
      provider: provider as never,
    })

    expect(result.status).toBe('generated')
    expect(provider.generateResponse).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Route-level: /api/wp-chat gating (attemptStructuredDocumentPatch). The
// underlying model-call/validation logic is covered above, so these mock
// OpenAIService.prototype.generateStructuredDocumentPatch directly and prove
// the routing decision: intent + surface + folder-backed project.
// ---------------------------------------------------------------------------
const servers: http.Server[] = []
const temporaryRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function startApp() {
  const app = express()
  app.use(express.json())
  const server = await registerRoutes(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function postJson(port: number, body: unknown): Promise<{ status: number; json: any }> {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/wp-chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
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

async function seedFolderProject(revision: number) {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-structured-patch-'))
  temporaryRoots.push(root)
  const store = await createProjectLibraryStore(root)
  const state = defaultProjectState()
  state.documents.synopsis = { ...state.documents.synopsis, revision, content: fixtureSynopsisContent() }
  await store.writeProject({
    id: 'test-project',
    createdAt: Date.parse('2026-08-01T00:00:00.000Z'),
    updatedAt: Date.parse('2026-08-01T00:00:00.000Z'),
    state,
  })
  return { root, state }
}

const synopsisIntakeSurface = {
  kind: 'intake' as const,
  surface: 'synopsis' as const,
  surfaceTitle: 'Synopsis',
  format: 'feature' as const,
  questions: [],
  nextQuestion: null,
  selectionSource: 'first_unanswered' as const,
  answeredCount: 0,
  totalCount: 0,
  nextRecommendedAction: 'all_answered' as const,
}

describe('/api/wp-chat structured-document patch attachment', () => {
  it('(a) a fill/rewrite-intent request with a folder-backed project yields a schema-valid patch with filtered citations and the project\'s real baseVersion', async () => {
    const { root, state } = await seedFolderProject(5)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const proposedContent = fixtureSynopsisContent({ logline: { text: 'Revised logline.', protagonist: 'Keeper', goal: 'protect the coast', obstacle: 'the stranger', stakes: 'the town', hook: 'told over one storm' } })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'generated',
      proposal: {
        patch: {
          kind: 'structured-document',
          surface: 'synopsis',
          baseVersion: 5,
          proposedContent,
          changedPaths: ['logline.text'],
          memoryIds: ['[M-REAL-0001]'],
        },
        rationale: 'Tightened the logline.',
        canonConflicts: [],
        citations: [{ id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' }],
      },
    })

    const port = await startApp()
    const response = await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite the logline for me.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.message).toBe('Sam response.')
    expect(response.json.patchFailure).toBeUndefined()
    expect(response.json.patch).toBeDefined()
    expect(response.json.patch.patch.surface).toBe('synopsis')
    expect(response.json.patch.patch.baseVersion).toBe(5)
    expect(response.json.patch.patch.proposedContent).toEqual(proposedContent)
    expect(response.json.patch.citations).toEqual([{ id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' }])

    // Prove the routing plumbing itself, not just the mocked return value:
    // the service was called with the surface/baseVersion/content read from
    // the real folder-backed package on disk (revision 5, the seeded
    // synopsis content), not anything derived from the client's own request
    // payload.
    expect(patchSpy).toHaveBeenCalledTimes(1)
    const call = patchSpy.mock.calls[0][0]
    expect(call.surface).toBe('synopsis')
    expect(call.baseVersion).toBe(5)
    expect(call.currentContent).toEqual(fixtureSynopsisContent())
    expect(call.userMessage).toBe('Please rewrite the logline for me.')
  })

  it('(b) a non-intent request yields no patch (and no failure marker) even with a matching folder-backed project and surface', async () => {
    const { root, state } = await seedFolderProject(0)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch')

    const port = await startApp()
    const response = await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'What do you think of this logline?',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.patch).toBeUndefined()
    expect(response.json.patchFailure).toBeUndefined()
    expect(patchSpy).not.toHaveBeenCalled()
  })

  it('never attempts a patch for the script surface, even with fill/rewrite intent', async () => {
    const { root, state } = await seedFolderProject(0)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch')

    const port = await startApp()
    const response = await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite this scene.',
      projectContext: buildProjectContext(state), // no surface -> kind: undefined (never 'intake')
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.patch).toBeUndefined()
    expect(patchSpy).not.toHaveBeenCalled()
  })

  it('(c) an invalid model proposal yields no patch and a visible failure marker, while the chat response still succeeds', async () => {
    const { root, state } = await seedFolderProject(0)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'failed',
      reason: 'invalid model JSON',
    })

    const port = await startApp()
    const response = await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite the logline.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.message).toBe('Sam response.')
    expect(response.json.patch).toBeUndefined()
    expect(response.json.patchFailure).toEqual({ reason: 'invalid model JSON' })
  })

  it('does not attempt a patch for a browser-only project id (no folder-backed package to read)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-structured-patch-'))
    temporaryRoots.push(root)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch')
    const state = defaultProjectState()

    const port = await startApp()
    const response = await postJson(port, {
      projectId: 'browser-only-project',
      personaId: 'sam',
      message: 'Please rewrite the logline.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.patch).toBeUndefined()
    expect(response.json.patchFailure).toBeUndefined()
    expect(patchSpy).not.toHaveBeenCalled()
  })
})
