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
    // changedPaths here is server-derived from the actual diff, not the
    // model's claim above — it happens to agree in this fixture because only
    // logline.text actually differs (see the dedicated undeclared-change
    // test below for the case where it does not agree).
    expect(result.proposal.patch.changedPaths).toEqual(['logline.text'])
    // The invented id is dropped from both memoryIds and citations.
    expect(result.proposal.patch.memoryIds).toEqual(['[M-REAL-0001]'])
    expect(result.proposal.citations).toEqual([{ id: '[M-REAL-0001]', workflow: 'writeros', sourceUri: 'writeros://project/1' }])
    expect(result.proposal.rationale).toBe('Tightened the logline per the writer request.')
    expect(provider.generateResponse).toHaveBeenCalledTimes(1)
  })

  // Review Important 3: changedPaths must never be trusted from the model.
  // Here the model declares only one changed path but the proposedContent it
  // actually returned changed two fields — the derived list must show both,
  // proving an undeclared change can never hide behind a short preview list.
  it('derives changedPaths from an actual diff, surfacing an undeclared change the model never mentioned', async () => {
    const currentContent = fixtureSynopsisContent()
    const proposedContent = fixtureSynopsisContent({
      logline: { text: 'Revised logline.', protagonist: 'Keeper', goal: 'protect the coast', obstacle: 'the stranger', stakes: 'the town', hook: 'told over one storm' },
      prose: { opening: 'A silently rewritten opening.', escalation: 'Escalation.', middle: 'Middle.', climax: 'Climax.', resolution: 'Resolution.' },
    })
    const raw = JSON.stringify({
      proposedContent,
      // The model claims only the logline changed.
      changedPaths: ['logline.text'],
      memoryIds: [],
      canonConflicts: [],
      rationale: 'Tightened the logline.',
    })
    const provider = fakeProvider([raw])

    const result = await service.generateStructuredDocumentPatch({
      surface: 'synopsis',
      currentContent,
      baseVersion: 0,
      userMessage: 'Please rewrite the synopsis logline.',
      agentMemory: fakeAgentMemory(),
      provider: provider as never,
    })

    expect(result.status).toBe('generated')
    if (result.status !== 'generated') throw new Error('expected generated')
    // Both actually-changed fields are present — not just the one the model
    // declared.
    expect(result.proposal.patch.changedPaths).toEqual(['logline.text', 'prose.opening'])
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
  // No outer express.json() here: registerRoutes wires up its own body
  // parser at WRITEROS_JSON_BODY_LIMIT (10mb), matching production
  // (server/index.ts calls registerRoutes with no extra parser in front of
  // it). An outer express.json() here would default to express's 100kb
  // limit and reject anything larger before registerRoutes' own parser (and
  // this file's own oversized-content size-bound tests) ever see it.
  const server = await registerRoutes(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function postJson(port: number, body: unknown): Promise<{ status: number; json: any; text: string }> {
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
        // Never let a non-JSON error response (e.g. a stray 413/500 HTML
        // page) hang the test forever inside an unhandled callback
        // exception — resolve with json: undefined and the raw text instead.
        let json: any
        try {
          json = text ? JSON.parse(text) : undefined
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode ?? 0, json, text })
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
      message: 'Please rewrite the synopsis logline for me.',
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
    expect(call.userMessage).toBe('Please rewrite the synopsis logline for me.')
  })

  // Review Important 4: the folder autosave is debounced (~600ms), so the
  // package on disk can lag the writer's live browser state. Simulate that
  // lag directly — disk still says revision 3 (and stale content) while the
  // client's own in-memory state has already moved to revision 5 with newer
  // content — and prove the server uses the CLIENT's snapshot, not the
  // stale disk read, for both baseVersion and currentContent. Without the
  // fix this would attribute baseVersion 3, and the writer's later Apply
  // (compared against their real in-memory revision 5) would refuse as
  // stale even though they made no edits after asking for the rewrite.
  it('uses the client-supplied documentSnapshot instead of a lagging disk revision (debounce-lag case)', async () => {
    const { root, state } = await seedFolderProject(3)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'generated',
      proposal: {
        patch: {
          kind: 'structured-document',
          surface: 'synopsis',
          baseVersion: 5,
          proposedContent: fixtureSynopsisContent(),
          changedPaths: [],
          memoryIds: [],
        },
        rationale: 'R',
        canonConflicts: [],
        citations: [],
      },
    })

    const liveContent = fixtureSynopsisContent({
      logline: { text: 'A newer, unsaved logline.', protagonist: 'Keeper', goal: 'protect the coast', obstacle: 'the stranger', stakes: 'the town', hook: 'told over one storm' },
    })

    const port = await startApp()
    const response = await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite the synopsis logline for me.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      documentSnapshot: { surface: 'synopsis', revision: 5, content: liveContent },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(patchSpy).toHaveBeenCalledTimes(1)
    const call = patchSpy.mock.calls[0][0]
    // Not 3 (the seeded disk revision) — the client's own in-memory revision.
    expect(call.baseVersion).toBe(5)
    // Not the seeded disk content — the client's own in-memory content.
    expect(call.currentContent).toEqual(liveContent)
  })

  it('falls back to the disk revision/content when the documentSnapshot names a different surface than the current one', async () => {
    const { root, state } = await seedFolderProject(5)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'generated',
      proposal: {
        patch: {
          kind: 'structured-document',
          surface: 'synopsis',
          baseVersion: 5,
          proposedContent: fixtureSynopsisContent(),
          changedPaths: [],
          memoryIds: [],
        },
        rationale: 'R',
        canonConflicts: [],
        citations: [],
      },
    })

    const port = await startApp()
    await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite the synopsis logline for me.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      // Mismatched surface — must never be trusted for the synopsis request.
      documentSnapshot: { surface: 'outline', revision: 999, content: { bogus: true } },
      conversationHistory: [],
    })

    expect(patchSpy).toHaveBeenCalledTimes(1)
    const call = patchSpy.mock.calls[0][0]
    expect(call.baseVersion).toBe(5)
    expect(call.currentContent).toEqual(fixtureSynopsisContent())
  })

  // Review round 2 (Important): documentSnapshot.content is untrusted
  // request input — previously currentContent always came off disk,
  // guaranteed schema-valid by ProjectDocumentsSchema. A snapshot that fails
  // the exact surface content schema must fall back to the disk read rather
  // than reaching the model prompt unvalidated.
  it('falls back to the disk revision/content when the documentSnapshot content fails the exact surface schema', async () => {
    const { root, state } = await seedFolderProject(5)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'generated',
      proposal: {
        patch: {
          kind: 'structured-document',
          surface: 'synopsis',
          baseVersion: 5,
          proposedContent: fixtureSynopsisContent(),
          changedPaths: [],
          memoryIds: [],
        },
        rationale: 'R',
        canonConflicts: [],
        citations: [],
      },
    })

    const port = await startApp()
    await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite the synopsis logline for me.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      // Right surface, but content that is not a valid synopsis at all.
      documentSnapshot: { surface: 'synopsis', revision: 999, content: { not: 'a synopsis' } },
      conversationHistory: [],
    })

    expect(patchSpy).toHaveBeenCalledTimes(1)
    const call = patchSpy.mock.calls[0][0]
    // Not 999 (the invalid snapshot's claimed revision) — the seeded disk revision.
    expect(call.baseVersion).toBe(5)
    expect(call.currentContent).toEqual(fixtureSynopsisContent())
  })

  // Review round 2 (Important): a schema-valid but implausibly huge snapshot
  // (e.g. one field padded far past what a real document could be) must
  // also fall back to disk rather than being trusted verbatim into the
  // model prompt with no size bound beyond the blanket request body limit.
  it('falls back to the disk revision/content when the documentSnapshot content is oversized', async () => {
    const { root, state } = await seedFolderProject(5)
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', root)

    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const patchSpy = vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'generated',
      proposal: {
        patch: {
          kind: 'structured-document',
          surface: 'synopsis',
          baseVersion: 5,
          proposedContent: fixtureSynopsisContent(),
          changedPaths: [],
          memoryIds: [],
        },
        rationale: 'R',
        canonConflicts: [],
        citations: [],
      },
    })

    // Schema-valid shape (still a well-formed synopsis), but one field is
    // padded to comfortably exceed the size bound.
    const oversizedContent = fixtureSynopsisContent({
      prose: {
        opening: 'x'.repeat(250_000),
        escalation: 'Escalation.',
        middle: 'Middle.',
        climax: 'Climax.',
        resolution: 'Resolution.',
      },
    })

    const port = await startApp()
    await postJson(port, {
      projectId: 'test-project',
      personaId: 'sam',
      message: 'Please rewrite the synopsis logline for me.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      documentSnapshot: { surface: 'synopsis', revision: 999, content: oversizedContent },
      conversationHistory: [],
    })

    expect(patchSpy).toHaveBeenCalledTimes(1)
    const call = patchSpy.mock.calls[0][0]
    expect(call.baseVersion).toBe(5)
    expect(call.currentContent).toEqual(fixtureSynopsisContent())
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

  // Review Important 2: a trigger verb with nothing to do with a document
  // must not spend a model call, even while the writer is on a matching
  // structured surface.
  it('does not attempt a patch when a trigger verb appears with no document reference at all', async () => {
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
      message: 'Should I apply to that fellowship?',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.patch).toBeUndefined()
    expect(patchSpy).not.toHaveBeenCalled()
  })

  // Review Important 2's cross-surface case: the writer is on the Synopsis
  // tab (surfaceAwareness IS 'intake'/'synopsis'), but the message names the
  // script ("this scene"), not the synopsis and not generic document deixis.
  it('does not attempt a patch when the message names something other than the current surface', async () => {
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
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.patch).toBeUndefined()
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
      message: 'Please rewrite the synopsis logline.',
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
      message: 'Please rewrite the synopsis logline.',
      projectContext: { ...buildProjectContext(state), surface: synopsisIntakeSurface },
      conversationHistory: [],
    })

    expect(response.status).toBe(200)
    expect(response.json.patch).toBeUndefined()
    expect(response.json.patchFailure).toBeUndefined()
    expect(patchSpy).not.toHaveBeenCalled()
  })
})
