// Task 12 — End-to-End Migration, Failure Tests, and Release Gate.
//
// Proves the whole Unified Project Memory V1 loop end to end, using real
// production components wherever a project fixture can stand in for a real
// external workflow: real adapters (server/projectMemory/adapters/*), the
// real ledger/store (server/projectMemory/store.ts), the real CLI
// (server/projectMemory/cli.ts), the real agent-context boundary
// (server/projectMemory/agentContext.ts) wired into the real HTTP routes
// (server/routes.ts), the real WriterOS document-save observer
// (server/projectMemory/writerOSObserver.ts), and the real room bridge
// (server/projectMemory/roomBridge.ts). Only the outermost leaf calls (the
// actual OpenAI/Anthropic/OpenSwarm network calls) are stubbed — everything
// in between is production code running against a real `.writeros` package
// on a real temporary filesystem.
//
// All fixture content below is generic and invented — no character, place,
// or story names from any real project.

import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { registerRoutes } from '../../server/routes'
import { OpenAIService } from '../../server/ai/openaiService'
import * as modelProviderModule from '../../server/ai/modelProvider'
import type { ModelProvider } from '../../server/ai/modelProvider'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { serializeWriterOSProjectPackage } from '../../client/src/lib/projectPackage'
import { syntheticOutlineFeature } from '../fixtures/outline/syntheticOutline'
import { setOutlinePath } from '../../client/src/lib/outlineDeck'
import { createEmptySynopsisContent } from '../../shared/documents'

import { runProjectMemoryCli } from '../../server/projectMemory/cli'
import {
  createProjectMemoryStore,
  projectMemoryStore,
  type ProjectMemoryStore,
} from '../../server/projectMemory/store'
import { buildMemoryContext } from '../../server/projectMemory/retrieval'
import { citationLabelsForRecords } from '../../server/projectMemory/retrieval'
import {
  buildAgentMemoryContext,
  createProjectMemoryProvider,
  type ProjectMemoryProvider,
} from '../../server/projectMemory/agentContext'
import { wayfinderMemorySourceAdapter } from '../../server/projectMemory/adapters/wayfinder'
import { buzzMemorySourceAdapter } from '../../server/projectMemory/adapters/buzz'
import {
  bridgeMeetingBankToMemory,
} from '../../server/projectMemory/roomBridge'
import {
  observeWriterOSSave,
  readAnalysisQueue,
} from '../../server/projectMemory/writerOSObserver'
import { applyMemoryGroundedPatch, parsePatchProposal } from '../../client/src/lib/memoryPatch'
import type { MemoryGroundedPatchProposal } from '../../shared/memoryPatches'
import type { PublishMemoryInput } from '../../shared/projectMemory'

// ---------------------------------------------------------------------------
// Fixture plumbing
// ---------------------------------------------------------------------------

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

interface Fixture {
  workspaceRoot: string
  library: ProjectLibraryStore
  projectId: string
  projectPath: string
}

/** Builds one folder-backed `.writeros` project with a stable, opaque project id. */
async function createFixtureProject(projectId = 'e2e-harbor-project'): Promise<Fixture> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'writeros-e2e-'))
  temporaryRoots.push(workspaceRoot)
  const library = await createProjectLibraryStore(workspaceRoot)
  const state = defaultProjectState()
  state.meta.title = 'The Harbor Fixture'
  await library.writeProject({
    id: projectId,
    createdAt: Date.parse('2026-08-01T00:00:00.000Z'),
    updatedAt: Date.parse('2026-08-01T00:00:00.000Z'),
    state,
  })
  const projectPath = await library.resolveProjectPackagePath(projectId)
  return { workspaceRoot, library, projectId, projectPath }
}

async function writeFileDeep(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

/** A resolved Wayfinder ticket at `type: grill, mode: hitl` — the canon predicate. */
const WAYFINDER_GRILL_TICKET = `# Harbor curfew
type: grill
mode: hitl
created: 2026-08-01
resolved: 2026-08-01

## Question

When does the harbor close?

## Answer

The harbor closes at midnight.
`

/** A resolved Wayfinder ticket at `type: homework, mode: hitl` — must import
 * as development, never canon, even though `mode: hitl` matches. */
const WAYFINDER_HOMEWORK_TICKET = `# Harbor timeline workshop
type: homework
mode: hitl
created: 2026-08-01
resolved: 2026-08-01

## Question

Should the harbor timeline be workshopped further?

## Answer

Draft three versions of the timeline before locking any of it.
`

async function writeWayfinderFixture(sourceRoot: string): Promise<void> {
  await writeFileDeep(path.join(sourceRoot, 'resolved', 'harbor-curfew.md'), WAYFINDER_GRILL_TICKET)
  await writeFileDeep(path.join(sourceRoot, 'resolved', 'harbor-timeline-workshop.md'), WAYFINDER_HOMEWORK_TICKET)
  await mkdir(path.join(sourceRoot, 'tickets'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'assets'), { recursive: true })
}

/** Synthetic PitchStudio export generated from PATTERN.md:212-234's required
 * header + section shape (Ben's PitchStudio project, read for its documented
 * export contract only — no real run content is used here). */
const PITCHSTUDIO_EXPORT = `---
source: PitchStudio v2.1
run_date: 2026-08-02
run_mode: room
incoming_frame: none
concept_file: concepts/harbor-pilot.md
status: unratified
---

## Departures from the incoming frame

None.

## Decisions made in this run

1. The lighthouse keeper's identity is revealed in episode three.
2. The town council votes to sell the harbor rights.
`

async function writePitchStudioFixture(sourceRoot: string): Promise<void> {
  await writeFileDeep(
    path.join(sourceRoot, 'notes', '2026-08-02-pitchstudio-harbor-table.md'),
    PITCHSTUDIO_EXPORT,
  )
}

function buzzAtomFixture(input: {
  title: string
  claim: string
  status: 'canon' | 'provisional' | 'rejected'
  linkedSourceId: string
  eventId: string
}): string {
  const dateField = input.status === 'canon' ? 'canon-at: 2026-08-04' : ''
  return `# ${input.title}
type: atom
status: ${input.status}
source: room-session ${input.linkedSourceId}/evt-100
created: 2026-08-03
${dateField}
evidence: [${input.eventId}]

## Decision

${input.claim}
`
}

const BUZZ_EVENT_ID = 'a'.repeat(64)

function fakeModelProvider(responses: string[]): ModelProvider {
  const queue = [...responses]
  return {
    name: 'openai',
    model: 'test-model',
    isConfigured: () => true,
    generateResponse: vi.fn(async () => queue.shift() ?? JSON.stringify({ records: [] })),
  }
}

async function waitForQueueSettled(projectPath: string, timeoutMs = 2_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const items = await readAnalysisQueue(projectPath)
    if (items.length > 0 && items.every(item => item.status === 'done' || item.status === 'failed')) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for analysis queue to settle.')
}

async function startApp(provider: ProjectMemoryProvider) {
  const app = express()
  const server = await registerRoutes(app, { projectMemoryProvider: provider })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port }
}

/** Starts the app with NO provider override, so `registerRoutes` builds its
 * real project-library store and agent memory provider from
 * `WRITEROS_PROJECTS_ROOT` — the same env-driven wiring server/index.ts uses
 * in production. Passing `projectMemoryProvider: null` (instead of omitting
 * the option) would disable memory outright, which is not what these tests
 * want. */
async function startRealApp() {
  const app = express()
  const server = await registerRoutes(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port }
}

function getJson(
  port: number,
  requestPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port, path: requestPath, method: 'GET', headers,
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: response.statusCode ?? 0, json })
      })
    })
    request.on('error', reject)
    request.end()
  })
}

function postJson(port: number, requestPath: string, body: unknown): Promise<{ status: number; json: any; text: string }> {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: response.statusCode ?? 0, json, text })
      })
    })
    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function putJson(
  port: number,
  requestPath: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: response.statusCode ?? 0, json })
      })
    })
    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function genericChatBody(projectId: string) {
  const userProfile = {
    entryState: 'idea_only', existingWork: [], immediateNeed: 'shape the harbor',
    feedbackStyle: 'direct', writerName: 'Test Writer',
  }
  return {
    projectId, personaId: 'sam', message: 'What do we know about the harbor?', userProfile,
    storyMemory: {
      project: {}, characters: {}, outline: { acts: 3, beats: [] }, worldRules: {},
      dialogue: {}, userProfile, decisions: [],
    },
    conversationHistory: [],
  }
}

async function runCli(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = []
  const stderr: string[] = []
  const exitCode = await runProjectMemoryCli(argv, {
    stdout: value => stdout.push(value),
    stderr: value => stderr.push(value),
  })
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') }
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryRoots.push(dir)
  return dir
}

// ---------------------------------------------------------------------------
// 1. Fixture project + stable project id
// ---------------------------------------------------------------------------

describe('fixture project identity', () => {
  it('identifies the same project by project.json.projectId across the library store, the CLI, and the memory store', async () => {
    const { projectId, projectPath, library } = await createFixtureProject('e2e-identity-project')

    const viaLibrary = await library.resolveProjectPackagePath(projectId)
    expect(viaLibrary).toBe(projectPath)

    const context = await runCli(['context', '--project', projectPath, '--query', 'harbor', '--format', 'json'])
    expect(context.exitCode).toBe(0)
    expect(JSON.parse(context.stdout).projectId).toBe(projectId)

    const snapshot = await projectMemoryStore.readSnapshot(projectPath)
    expect(snapshot.projectId).toBe(projectId)
  })
})

// ---------------------------------------------------------------------------
// 2. Historical imports: Wayfinder canon predicate, PitchStudio advisory-only,
//    Buzz candidate with absent provisional/rejected directories.
// ---------------------------------------------------------------------------

describe('historical imports', () => {
  it('imports a resolved Wayfinder grill/hitl ticket as active canon and a resolved homework/hitl ticket as development, never canon', async () => {
    const { projectPath } = await createFixtureProject('e2e-wayfinder-project')
    const sourceRoot = await tempDir('wayfinder-source-')
    await writeWayfinderFixture(sourceRoot)

    const dryRun = await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--dry-run'])
    expect(dryRun.exitCode).toBe(0)
    const preview = JSON.parse(dryRun.stdout)
    expect(preview.counts.activeCanon).toBe(1)
    expect(preview.counts.development).toBe(1)

    const apply = await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])
    expect(apply.exitCode).toBe(0)
    expect(JSON.parse(apply.stdout).applied).toBe(2)

    const snapshot = await projectMemoryStore.readSnapshot(projectPath)
    const canon = snapshot.records.find(record => record.kind === 'canon' && record.status === 'active')
    expect(canon?.claim).toBe('The harbor closes at midnight.')
    expect(canon?.source.authority).toEqual({ ticketType: 'grill', mode: 'hitl' })

    const homework = snapshot.records.find(record => record.claim.includes('Draft three versions'))
    expect(homework).toMatchObject({ kind: 'development', status: 'active' })
    // Acceptance criterion: resolved homework/hitl remains development and
    // never becomes canon, under any record in the snapshot.
    expect(snapshot.records.some(record => (
      record.kind === 'canon' && record.claim.includes('Draft three versions')
    ))).toBe(false)
  })

  it('imports the synthetic PitchStudio export (PATTERN.md:212-234 shape) as advisory decisions, never canon', async () => {
    const { projectPath } = await createFixtureProject('e2e-pitchstudio-project')
    const sourceRoot = await tempDir('pitchstudio-source-')
    await writePitchStudioFixture(sourceRoot)

    const apply = await runCli(['import', '--project', projectPath, '--source', 'pitchstudio', '--from', sourceRoot, '--apply'])
    expect(apply.exitCode).toBe(0)
    const result = JSON.parse(apply.stdout)
    expect(result.applied).toBe(2)
    expect(result.counts.activeCanon).toBe(0)

    const snapshot = await projectMemoryStore.readSnapshot(projectPath)
    expect(snapshot.records).toHaveLength(2)
    expect(snapshot.records.every(record => record.kind === 'decision')).toBe(true)
    expect(snapshot.records.some(record => record.kind === 'canon')).toBe(false)
    expect(snapshot.records.map(record => record.claim).sort()).toEqual([
      "The lighthouse keeper's identity is revealed in episode three.",
      'The town council votes to sell the harbor rights.',
    ])
  })

  it('imports a Buzz canon atom as a review candidate while the provisional/rejected directories are absent', async () => {
    const { projectPath } = await createFixtureProject('e2e-buzz-import-project')
    const sourceRoot = await tempDir('buzz-source-')
    const linkedSourceId = 'harbor-channel-1'
    await writeFileDeep(
      path.join(sourceRoot, 'atoms', 'canon', 'harbor-name.md'),
      buzzAtomFixture({
        title: 'Harbor name', claim: 'The harbor is named Blackwater Sound.',
        status: 'canon', linkedSourceId, eventId: BUZZ_EVENT_ID,
      }),
    )
    // atoms/provisional and atoms/rejected are intentionally absent.

    const link = await runCli(['link-source', '--project', projectPath, '--workflow', 'buzz', '--source-id', linkedSourceId])
    expect(link.exitCode).toBe(0)

    const dryRun = await runCli(['import', '--project', projectPath, '--source', 'buzz', '--from', sourceRoot, '--dry-run'])
    expect(dryRun.exitCode).toBe(0)
    const preview = JSON.parse(dryRun.stdout)
    expect(preview.warnings.some((warning: string) => warning.includes('provisional') && warning.includes('absent'))).toBe(true)
    expect(preview.warnings.some((warning: string) => warning.includes('rejected') && warning.includes('absent'))).toBe(true)
    expect(preview.counts.candidates).toBe(1)
    expect(preview.counts.activeCanon).toBe(0)

    const apply = await runCli(['import', '--project', projectPath, '--source', 'buzz', '--from', sourceRoot, '--apply'])
    expect(apply.exitCode).toBe(0)

    const snapshot = await projectMemoryStore.readSnapshot(projectPath)
    const candidate = snapshot.records.find(record => record.source.workflow === 'buzz')
    expect(candidate).toMatchObject({ kind: 'canon', status: 'candidate' })
    // Buzz's native auto-win rule does not apply: nothing is active yet.
    expect(snapshot.records.some(record => record.kind === 'canon' && record.status === 'active')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Canon reaches every agent path; voice-profile stays memory-free.
// ---------------------------------------------------------------------------

describe('canon reaches every agent path', () => {
  it('threads real imported canon through chat, wp-chat, openswarm, persona-capability, compose-document, synopsis-assist, and the Writer\'s Room/Project Meeting bridge — voice-profile stays memory-free', async () => {
    const { projectId, projectPath, library } = await createFixtureProject('e2e-allpaths-project')
    const sourceRoot = await tempDir('wayfinder-allpaths-')
    await writeWayfinderFixture(sourceRoot)
    const apply = await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])
    expect(apply.exitCode).toBe(0)

    const CANON_CLAIM = 'The harbor closes at midnight.'
    const provider = createProjectMemoryProvider({ projectLibraryStore: library })

    const personaSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse')
      .mockResolvedValue({ message: 'ok', suggestions: [] })
    const synopsisSpy = vi.spyOn(OpenAIService.prototype, 'generateSynopsisAssistance')
      .mockResolvedValue({ feedback: 'ok', suggestions: [] })
    vi.spyOn(OpenAIService.prototype, 'synthesizePersonaCapabilityResponse')
      .mockResolvedValue({ finalMessage: 'ok', citedLabels: [] })
    const voiceSpy = vi.spyOn(OpenAIService.prototype, 'synthesizeVoiceProfile')
      .mockResolvedValue({} as never)
    const fetchSpy = vi.fn(async (_url: string, _init?: { body?: string }) => new Response(
      JSON.stringify({ response: JSON.stringify({ findings: [], sources: [], missing: [], unverified: [] }) }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchSpy)
    const composeGenerateResponse = vi.fn(async (_input: { systemPrompt: string; messages: unknown[] }) => JSON.stringify({
      blocks: [{ type: 'heading', text: 'Harbor' }],
    }))
    vi.spyOn(modelProviderModule, 'createModelProvider').mockReturnValue({
      name: 'openai', model: 'test-model', isConfigured: () => true, generateResponse: composeGenerateResponse,
    } as never)

    const { server, port } = await startApp(provider)
    try {
      const context = buildProjectContext(defaultProjectState())

      const chat = await postJson(port, '/api/chat', genericChatBody(projectId))
      expect(chat.status).toBe(200)
      expect(personaSpy.mock.calls[0][6]?.prompt).toContain(CANON_CLAIM)

      const wpChat = await postJson(port, '/api/wp-chat', {
        projectId, personaId: 'sam', message: 'Review the harbor.', projectContext: context, conversationHistory: [],
      })
      expect(wpChat.status).toBe(200)
      expect(personaSpy.mock.calls[1][6]?.prompt).toContain(CANON_CLAIM)

      const openswarm = await postJson(port, '/api/openswarm/writing-partner', {
        projectId, message: 'Review the harbor.', projectContext: context,
      })
      expect(openswarm.status).toBe(200)
      expect(JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body).message).toContain(CANON_CLAIM)

      const personaCapability = await postJson(port, '/api/persona-capability/run', {
        projectId, personaId: 'zoe', taskKind: 'research_world_context', message: 'Research the harbor.',
        projectContext: context, sourceSurface: 'writingPartner', clientRequestId: 'req-e2e-1',
      })
      expect(personaCapability.status).toBe(200)
      expect(JSON.parse((fetchSpy.mock.calls[1][1] as { body: string }).body).message).toContain(CANON_CLAIM)

      const compose = await postJson(port, '/api/compose-document', {
        projectId, surface: 'outline', format: 'feature', content: syntheticOutlineFeature,
        identity: { title: 'Harbor', genre: 'Drama' },
      })
      expect(compose.status).toBe(200)
      const composeCall = composeGenerateResponse.mock.calls[0][0]
      expect(`${composeCall.systemPrompt}\n${JSON.stringify(composeCall.messages)}`).toContain(CANON_CLAIM)

      const profile = genericChatBody(projectId).userProfile
      const synopsisAssist = await postJson(port, '/api/synopsis-assist', {
        projectId, userInput: 'Review the harbor.', currentLogline: '', currentSynopsis: '',
        projectDetails: {}, userProfile: profile,
      })
      expect(synopsisAssist.status).toBe(200)
      expect(synopsisSpy.mock.calls[0][5]?.prompt).toContain(CANON_CLAIM)

      // Voice profile synthesis never consults project memory.
      const providerContextSpy = vi.spyOn(provider, 'context')
      const voice = await postJson(port, '/api/voice-profile/synthesize', { answers: { intro: 'a plain answer' } })
      expect(voice.status).toBe(200)
      expect(voiceSpy).toHaveBeenCalledTimes(1)
      expect(providerContextSpy).not.toHaveBeenCalled()
    } finally {
      server.close()
    }

    // Writer's Room / Project Meeting: real production bridge functions
    // (server/projectMemory/roomBridge.ts) publish into the same real ledger
    // at their documented milestones, with the identical injectable-deps
    // seam the Room/Meeting callers use (no ambient Supabase needed here —
    // Supabase itself is out of scope for this sandbox, see report). The
    // resulting canon is then read back through the exact
    // buildAgentMemoryContext call shape server/room/runRoomTurn.ts uses for
    // a live agent turn (surface: 'writers-room').
    const bankOutcome = await bridgeMeetingBankToMemory({
      projectId,
      conceptSeed: 'A lighthouse keeper confronts a stranger.',
      storyLocks: 'The harbor gate stays locked after curfew.',
      openQuestions: 'Who else knows the harbor schedule?',
      decisions: [],
    }, { memoryStore: projectMemoryStore, resolveProjectPath: async () => projectPath })
    expect(bankOutcome.status).toBe('synced')
    expect(bankOutcome.publishedCount).toBeGreaterThan(0)

    const roomMemory = await buildAgentMemoryContext(provider, projectId, {
      message: 'What are the current story locks?', surface: 'writers-room', personaId: 'sam',
    })
    expect(roomMemory.prompt).toContain(CANON_CLAIM)
    // The bridged story-locks record's claim (what the agent prompt actually
    // renders for active canon) is this fixed summary; the full lock text
    // lives in the record's `detail`, which activeCanon rendering
    // deliberately omits (server/projectMemory/retrieval.ts
    // contextRecordProjection(record, includeDetail=false)) to keep canon
    // prompt-sized. Confirm both: the summarized claim reaches the agent,
    // and the full lock text is durably in the ledger record itself.
    expect(roomMemory.prompt).toContain('Room story locks are in force for this project.')
    const roomSnapshot = await projectMemoryStore.readSnapshot(projectPath)
    const storyLocksRecord = roomSnapshot.records.find(record => record.source.sourceId === 'story_locks')
    expect(storyLocksRecord?.detail).toBe('The harbor gate stays locked after curfew.')
  })
})

// ---------------------------------------------------------------------------
// 4. Retrieval changes with query/surface; citations resolve to the correct
//    workflow record.
// ---------------------------------------------------------------------------

describe('retrieval by surface and query, and citation resolution', () => {
  it('surfaces PitchStudio and Wayfinder material only when the query/surface/entities actually match, and every citation resolves to its real source record', async () => {
    const { projectPath } = await createFixtureProject('e2e-retrieval-project')

    const wayfinderRoot = await tempDir('wayfinder-retrieval-')
    await writeWayfinderFixture(wayfinderRoot)
    await writeFileDeep(
      path.join(wayfinderRoot, 'atoms', 'atoms.jsonl'),
      `${JSON.stringify({
        id: 'ATM-0001',
        claim: 'Who keeps the lighthouse key overnight?',
        entities: ['Lighthouse'],
        canon_status: 'open',
      })}\n`,
    )
    expect((await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', wayfinderRoot, '--apply'])).exitCode).toBe(0)

    const pitchstudioRoot = await tempDir('pitchstudio-retrieval-')
    await writePitchStudioFixture(pitchstudioRoot)
    expect((await runCli(['import', '--project', projectPath, '--source', 'pitchstudio', '--from', pitchstudioRoot, '--apply'])).exitCode).toBe(0)

    const snapshot = await projectMemoryStore.readSnapshot(projectPath)
    const lighthouseQuestion = snapshot.records.find(record => record.claim.includes('lighthouse key overnight'))
    const decision = snapshot.records.find(record => record.claim.includes('town council votes'))
    expect(lighthouseQuestion).toBeDefined()
    expect(decision).toBeDefined()

    // Baseline query: nothing overlaps entities, tags, surface, or message.
    const baseline = buildMemoryContext(snapshot, { message: 'Discuss the weather.', surface: 'unrelated-surface' })
    expect(baseline.relevant.some(record => record.id === lighthouseQuestion!.id)).toBe(false)
    expect(baseline.relevant.some(record => record.id === decision!.id)).toBe(false)

    // Entity-driven Wayfinder relevance: currentEntities matching the atom's
    // own entities brings the open question into `relevant`.
    const entityMatch = buildMemoryContext(snapshot, {
      message: 'Discuss the weather.', surface: 'unrelated-surface', currentEntities: ['Lighthouse'],
    })
    expect(entityMatch.relevant.some(record => record.id === lighthouseQuestion!.id)).toBe(true)

    // Surface-driven PitchStudio relevance: the adapter tags every decision
    // `pitchstudio:status:unratified`, so a surface token of "unratified"
    // brings the decision into `relevant` with no entity overlap needed.
    const surfaceMatch = buildMemoryContext(snapshot, { message: 'Discuss the weather.', surface: 'unratified' })
    expect(surfaceMatch.relevant.some(record => record.id === decision!.id)).toBe(true)

    // Message-driven PitchStudio relevance via the same tag, from the
    // writer's own words rather than the surface field.
    const messageMatch = buildMemoryContext(snapshot, { message: 'Summarize the harbor decision.', surface: 'unrelated-surface' })
    expect(messageMatch.relevant.some(record => record.id === decision!.id)).toBe(true)

    // Citations resolve to the correct workflow record.
    const labels = citationLabelsForRecords([lighthouseQuestion!, decision!])
    const questionLabel = labels.get(lighthouseQuestion!.id) as string
    const decisionLabel = labels.get(decision!.id) as string
    expect(entityMatch.citationMap[questionLabel]).toMatchObject({
      workflow: 'story-wayfinder',
      sourceUri: lighthouseQuestion!.source.sourceUri,
    })
    expect(surfaceMatch.citationMap[decisionLabel]).toMatchObject({
      workflow: 'pitchstudio',
      sourceUri: decision!.source.sourceUri,
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Conflicts: PitchStudio-vs-canon stays informational; Buzz-vs-canon stays
//    open for Ben's arbitration and never auto-supersedes; explicit
//    supersession preserves history and propagates to every reader.
// ---------------------------------------------------------------------------

function pitchstudioDecisionInput(projectId: string, conflictsWith: string[]): PublishMemoryInput {
  return {
    projectId,
    dedupeKey: `import:pitchstudio:${projectId}:conflicting-table-ruling`,
    kind: 'decision',
    requestedStatus: 'active',
    claim: 'The lighthouse actually stays lit past midnight.',
    tags: ['pitchstudio:decision'],
    source: {
      workflow: 'pitchstudio',
      sourceId: 'notes/2026-08-05-pitchstudio-conflict.md#decision-1',
      sourceUri: 'pitchstudio:notes/2026-08-05-pitchstudio-conflict.md#decision-1',
      sourceHash: 'sha256:conflicting-decision',
      capturedAt: '2026-08-05T00:00:00.000Z',
      approval: 'none',
    },
    evidence: [{ excerpt: 'The lighthouse actually stays lit past midnight.' }],
    safety: 'clear',
    spoiler: false,
    conflictsWith,
  }
}

describe('conflict handling', () => {
  it('a conflicting PitchStudio decision leaves active canon untouched and opens an informational conflict', async () => {
    const { projectId, projectPath } = await createFixtureProject('e2e-pitchstudio-conflict-project')
    const sourceRoot = await tempDir('wayfinder-pitchstudio-conflict-')
    await writeWayfinderFixture(sourceRoot)
    expect((await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])).exitCode).toBe(0)

    const before = await projectMemoryStore.readSnapshot(projectPath)
    const canon = before.records.find(record => record.kind === 'canon' && record.status === 'active')!
    expect(canon.claim).toBe('The harbor closes at midnight.')

    const published = await projectMemoryStore.publish(projectPath, pitchstudioDecisionInput(projectId, [canon.id]))
    expect(published.record.status).toBe('active')
    expect(published.record.kind).toBe('decision')

    const after = published.snapshot
    const stillCanon = after.records.find(record => record.id === canon.id)!
    expect(stillCanon).toMatchObject({ status: 'active', supersedes: [] })
    expect(stillCanon.claim).toBe('The harbor closes at midnight.')

    const openConflict = after.conflicts.find(conflict => (
      conflict.status === 'open' && [conflict.leftRecordId, conflict.rightRecordId].includes(canon.id)
    ))
    expect(openConflict).toBeDefined()
    expect([openConflict!.leftRecordId, openConflict!.rightRecordId].sort()).toEqual([canon.id, published.record.id].sort())
  })

  it('a conflicting Buzz canon candidate stays open for Ben arbitration and never auto-supersedes; explicit supersession then propagates to every workflow context export', async () => {
    const { projectId, projectPath, library } = await createFixtureProject('e2e-buzz-conflict-project')
    const sourceRoot = await tempDir('wayfinder-buzz-conflict-')
    await writeWayfinderFixture(sourceRoot)
    expect((await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])).exitCode).toBe(0)

    const beforeImport = await projectMemoryStore.readSnapshot(projectPath)
    const oldCanon = beforeImport.records.find(record => record.kind === 'canon' && record.status === 'active')!
    expect(oldCanon.claim).toBe('The harbor closes at midnight.')

    // Real Buzz adapter parsing, then the import step flags the conflict
    // against existing archive canon explicitly (V1 has no automatic
    // same-claim detection across workflows — see importer/adapters).
    const buzzRoot = await tempDir('buzz-conflict-source-')
    const linkedSourceId = 'harbor-channel-conflict'
    await writeFileDeep(
      path.join(buzzRoot, 'atoms', 'canon', 'harbor-curfew.md'),
      buzzAtomFixture({
        title: 'Harbor curfew (room ruling)', claim: 'The harbor never actually closes.',
        status: 'canon', linkedSourceId, eventId: BUZZ_EVENT_ID,
      }),
    )
    const buzzPreview = await buzzMemorySourceAdapter.preview({ projectId, sourceRoot: buzzRoot, linkedSourceId })
    expect(buzzPreview.records).toHaveLength(1)
    const buzzCandidateInput: PublishMemoryInput = { ...buzzPreview.records[0], conflictsWith: [oldCanon.id] }
    const buzzPublished = await projectMemoryStore.publish(projectPath, buzzCandidateInput)
    expect(buzzPublished.record.status).toBe('candidate')
    const buzzCandidateId = buzzPublished.record.id

    let snapshot = buzzPublished.snapshot
    expect(snapshot.records.find(record => record.id === oldCanon.id)).toMatchObject({ status: 'active', supersedes: [] })
    const openConflict = snapshot.conflicts.find(conflict => (
      conflict.status === 'open' && [conflict.leftRecordId, conflict.rightRecordId].includes(buzzCandidateId)
    ))!
    expect(openConflict).toBeDefined()

    // Buzz's native auto-win rule does not apply: neither promoting the raw
    // candidate nor resolving the conflict in its favor is possible while it
    // still carries Buzz's un-ratified `approval: 'none'` provenance.
    await expect(projectMemoryStore.applyAction(projectPath, {
      type: 'promote', recordId: buzzCandidateId, expectedRevision: snapshot.revision, supersedes: [oldCanon.id],
    })).rejects.toMatchObject({ code: 'invalid-action' })
    await expect(projectMemoryStore.applyAction(projectPath, {
      type: 'resolve-conflict', conflictId: openConflict.id, expectedRevision: snapshot.revision,
      resolution: openConflict.rightRecordId === buzzCandidateId ? 'right' : 'left',
    })).rejects.toMatchObject({ code: 'invalid-action' })

    snapshot = await projectMemoryStore.readSnapshot(projectPath)
    expect(snapshot.records.find(record => record.id === buzzCandidateId)?.status).toBe('candidate')
    expect(snapshot.records.find(record => record.id === oldCanon.id)?.status).toBe('active')
    expect(snapshot.conflicts.find(conflict => conflict.id === openConflict.id)?.status).toBe('open')

    // Ben's arbitration: he explicitly ratifies the room's claim himself,
    // re-publishing it with `approval: 'explicit'` — a genuinely new
    // eligible candidate, not a promotion of Buzz's own un-ratified record.
    const ratified = await projectMemoryStore.publish(projectPath, {
      projectId,
      dedupeKey: `arbitration:buzz:${projectId}:harbor-curfew`,
      kind: 'canon',
      requestedStatus: 'active',
      claim: 'The harbor never actually closes.',
      tags: ['buzz:status:canon', 'ben-arbitration'],
      source: {
        workflow: 'buzz',
        sourceId: 'atoms/canon/harbor-curfew.md#ben-arbitration',
        sourceUri: `buzz:${linkedSourceId}/atoms/canon/harbor-curfew.md#ben-arbitration`,
        sourceHash: 'sha256:ben-arbitration-harbor-curfew',
        capturedAt: '2026-08-06T00:00:00.000Z',
        approval: 'explicit',
      },
      evidence: [{ excerpt: 'The harbor never actually closes.' }],
      safety: 'clear',
      spoiler: false,
      conflictsWith: [oldCanon.id],
    })
    expect(ratified.record.status).toBe('candidate') // still blocked while the conflict is unresolved
    const ratifiedId = ratified.record.id
    snapshot = ratified.snapshot
    const arbitrationConflict = snapshot.conflicts.find(conflict => (
      conflict.status === 'open' && [conflict.leftRecordId, conflict.rightRecordId].includes(ratifiedId)
    ))!
    expect(arbitrationConflict).toBeDefined()

    const resolved = await projectMemoryStore.applyAction(projectPath, {
      type: 'resolve-conflict',
      conflictId: arbitrationConflict.id,
      expectedRevision: snapshot.revision,
      resolution: arbitrationConflict.rightRecordId === ratifiedId ? 'right' : 'left',
    })
    const newCanon = resolved.records.find(record => record.id === ratifiedId)!
    const oldCanonAfter = resolved.records.find(record => record.id === oldCanon.id)!
    expect(newCanon).toMatchObject({ status: 'active', kind: 'canon' })
    expect(oldCanonAfter).toMatchObject({ status: 'superseded' })
    expect(newCanon.supersedes).toContain(oldCanon.id)

    // Every workflow context export receives the new canon: check several
    // distinct surfaces/personas through the real retrieval function, plus
    // one full HTTP agent round trip through the real provider.
    for (const query of [
      { message: 'harbor status', surface: 'chat' },
      { message: 'harbor status', surface: 'synopsis', personaId: 'sam' },
      { message: 'harbor status', surface: 'outline', personaId: 'casey' },
    ]) {
      const context = buildMemoryContext(resolved, query)
      expect(context.activeCanon.map(record => record.claim)).toContain('The harbor never actually closes.')
      expect(context.activeCanon.map(record => record.claim)).not.toContain('The harbor closes at midnight.')
    }

    const provider = createProjectMemoryProvider({ projectLibraryStore: library })
    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({ message: 'ok', suggestions: [] })
    const { server, port } = await startApp(provider)
    try {
      const response = await postJson(port, '/api/chat', genericChatBody(projectId))
      expect(response.status).toBe(200)
      const call = vi.mocked(OpenAIService.prototype.generatePersonaResponse).mock.calls[0][6]
      expect(call?.prompt).toContain('The harbor never actually closes.')
      expect(call?.prompt).not.toContain('The harbor closes at midnight.')
    } finally {
      server.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Outline patch: request -> preview -> apply -> save -> WriterOS document
//    fact appears, with no automatic canon rewrite.
// ---------------------------------------------------------------------------

describe('outline patch preview/apply/save', () => {
  it('requests a structured outline patch, previews and applies it, saves the project, and the resulting WriterOS document fact appears without rewriting canon', async () => {
    const workspaceRoot = await tempDir('writeros-outline-patch-')
    const library = await createProjectLibraryStore(workspaceRoot)
    const projectId = 'e2e-outline-patch-project'
    const priorState = defaultProjectState()
    priorState.meta.title = 'The Harbor Fixture'
    priorState.documents.outline = { ...priorState.documents.outline, revision: 5, content: syntheticOutlineFeature }
    const priorStoredProject = {
      id: projectId,
      createdAt: Date.parse('2026-08-01T00:00:00.000Z'),
      updatedAt: Date.parse('2026-08-01T00:00:00.000Z'),
      state: priorState,
    }
    await library.writeProject(priorStoredProject)
    const projectPath = await library.resolveProjectPackagePath(projectId)

    const sourceRoot = await tempDir('wayfinder-outline-patch-')
    await writeWayfinderFixture(sourceRoot)
    expect((await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])).exitCode).toBe(0)
    const beforeSnapshot = await projectMemoryStore.readSnapshot(projectPath)
    const canonBefore = beforeSnapshot.records.filter(record => record.kind === 'canon' && record.status === 'active')
    expect(canonBefore).toHaveLength(1)

    // 1. Request: /api/wp-chat with a fill/rewrite-intent message against the
    // outline surface, backed by the real folder project (real baseVersion).
    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({ message: 'Casey response.', suggestions: [] })
    const proposedContent = setOutlinePath(syntheticOutlineFeature, 'spine.ending', 'Vera walks away and never looks back.')
    vi.spyOn(OpenAIService.prototype, 'generateStructuredDocumentPatch').mockResolvedValue({
      status: 'generated',
      proposal: {
        patch: {
          kind: 'structured-document', surface: 'outline', baseVersion: 5,
          proposedContent, changedPaths: ['spine.ending'], memoryIds: [],
        },
        rationale: 'Tightened the ending per the writer request.',
        canonConflicts: [],
        citations: [],
      },
    })
    // Real env-driven wiring (matches structuredDocumentPatch.test.ts):
    // attemptStructuredDocumentPatch reads the document snapshot straight off
    // the folder-backed package via the project library store registerRoutes
    // builds internally from WRITEROS_PROJECTS_ROOT.
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', workspaceRoot)
    const { server, port } = await startRealApp()
    let patchProposal: MemoryGroundedPatchProposal | undefined
    try {
      const outlineSurface = {
        kind: 'intake' as const, surface: 'outline' as const, surfaceTitle: 'Outline', format: 'feature' as const,
        questions: [], nextQuestion: null, selectionSource: 'first_unanswered' as const,
        answeredCount: 0, totalCount: 0, nextRecommendedAction: 'all_answered' as const,
      }
      const response = await postJson(port, '/api/wp-chat', {
        projectId, personaId: 'casey', message: 'Please rewrite the outline ending for me.',
        projectContext: { ...buildProjectContext(priorState), surface: outlineSurface }, conversationHistory: [],
      })
      expect(response.status).toBe(200)
      expect(response.json.patchFailure).toBeUndefined()
      expect(response.json.patch).toBeDefined()
      patchProposal = parsePatchProposal(response.json.patch)
      expect(patchProposal).toBeDefined()
    } finally {
      server.close()
    }

    // 2. Preview + apply: the same client-side pure function App.tsx uses,
    // against a minimal setter that records the applied content.
    let appliedContent: typeof syntheticOutlineFeature | undefined
    const applyResult = applyMemoryGroundedPatch(patchProposal!.patch, priorState.documents, {
      synopsis: () => {},
      outline: updater => { appliedContent = updater(priorState.documents.outline.content) },
      treatment: () => {},
      storyBible: () => {},
    })
    expect(applyResult).toEqual({ ok: true })
    expect(appliedContent).toBeDefined()
    expect(appliedContent!.spine.ending).toBe('Vera walks away and never looks back.')

    // 3. Save: persist through the same package writer the HTTP save route
    // uses, then diff prior/current files exactly as
    // server/projectLibrary/routes.ts does before calling the observer.
    const updatedState = {
      ...priorState,
      documents: {
        ...priorState.documents,
        outline: { ...priorState.documents.outline, content: appliedContent!, revision: priorState.documents.outline.revision + 1 },
      },
    }
    const updatedStoredProject = { ...priorStoredProject, updatedAt: Date.parse('2026-08-01T00:05:00.000Z'), state: updatedState }
    const priorFiles = serializeWriterOSProjectPackage(priorStoredProject).files
    await library.writeProject(updatedStoredProject)
    const currentFiles = serializeWriterOSProjectPackage(updatedStoredProject).files

    // The background analyzer (Task 8's sanctioned direct-invocation seam —
    // the real HTTP save route always constructs a live network provider
    // with no injection point) reports the new ending as a document fact.
    const analysisProvider = fakeModelProvider([JSON.stringify({
      records: [{
        kind: 'document_fact',
        claim: 'The outline ending now has Vera walking away and never looking back.',
        tags: ['outline', 'ending'],
        entities: ['Vera'],
        evidenceExcerpt: 'Vera walks away and never looks back.',
        conflictsWith: [],
        safety: 'clear',
      }],
    })])
    const { queuedCount } = await observeWriterOSSave(
      { projectId, projectPath, priorFiles, currentFiles },
      { memoryStore: projectMemoryStore, provider: analysisProvider },
    )
    expect(queuedCount).toBeGreaterThan(0)
    await waitForQueueSettled(projectPath)

    const afterSnapshot = await projectMemoryStore.readSnapshot(projectPath)
    const fact = afterSnapshot.records.find(record => record.kind === 'document_fact')
    expect(fact).toMatchObject({ status: 'active', source: { workflow: 'writeros' } })
    expect(fact?.claim).toContain('walking away')

    // No automatic canon rewrite: active canon is exactly what it was before
    // the save (same records, same claims, same supersedes lineage).
    const canonAfter = afterSnapshot.records.filter(record => record.kind === 'canon' && record.status === 'active')
    expect(canonAfter.map(record => record.id).sort()).toEqual(canonBefore.map(record => record.id).sort())
    expect(canonAfter.map(record => record.claim)).toEqual(canonBefore.map(record => record.claim))
  })
})

// ---------------------------------------------------------------------------
// 7. Concurrency: a WriterOS save and a memory publish racing through the
//    same project-scoped package lock (Task 2) lose no event and no file.
// ---------------------------------------------------------------------------

describe('concurrency', () => {
  it('a WriterOS save and a memory publish running concurrently lose no event and no workflow file', async () => {
    const { projectId, projectPath, library } = await createFixtureProject('e2e-concurrency-project')
    const read = await library.readProject(projectId)
    if (!read.ok) throw new Error('fixture project unexpectedly missing')
    const changed = {
      ...read.project,
      updatedAt: read.project.updatedAt + 5_000,
      state: {
        ...read.project.state,
        script: { ...read.project.state.script, rawHtml: '<p>Concurrent WriterOS save.</p>' },
      },
    }

    const publishInput: PublishMemoryInput = {
      projectId,
      dedupeKey: `concurrency:${projectId}:publish-1`,
      kind: 'development',
      requestedStatus: 'active',
      claim: 'The harbor scene needs a rewrite pass.',
      source: {
        workflow: 'writeros',
        sourceId: 'concurrency-test',
        sourceUri: 'writeros://concurrency/test',
        sourceHash: 'sha256:concurrency-test',
        capturedAt: '2026-08-07T00:00:00.000Z',
        approval: 'explicit',
      },
      evidence: [{ excerpt: 'The harbor scene needs a rewrite pass.' }],
    }

    const [, publishResult] = await Promise.all([
      library.writeProject(changed),
      projectMemoryStore.publish(projectPath, publishInput),
    ])
    expect(publishResult.published).toBe(true)

    const readBack = await library.readProject(projectId)
    expect(readBack.ok && readBack.project.state.script.rawHtml).toBe('<p>Concurrent WriterOS save.</p>')

    const snapshot = await projectMemoryStore.readSnapshot(projectPath)
    expect(snapshot.records.some(record => record.claim === 'The harbor scene needs a rewrite pass.')).toBe(true)

    // No lost workflow file: both the WriterOS-owned package and the memory
    // ledger survive the race intact and readable.
    await expect(readFile(path.join(projectPath, 'project.json'), 'utf8')).resolves.toContain(projectId)
    const ledgerText = await readFile(path.join(projectPath, 'memory', 'ledger.jsonl'), 'utf8')
    expect(ledgerText.trim().split('\n').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 8. Corruption drills: a corrupt snapshot projection rebuilds cleanly from
//    the ledger; a corrupt ledger fails an agent turn visibly (503 + repair
//    message) while direct document editing keeps working.
// ---------------------------------------------------------------------------

describe('corruption drills', () => {
  it('rebuilds a corrupted snapshot projection from the ledger', async () => {
    const { projectPath } = await createFixtureProject('e2e-corrupt-snapshot-project')
    const sourceRoot = await tempDir('wayfinder-corrupt-snapshot-')
    await writeWayfinderFixture(sourceRoot)
    expect((await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])).exitCode).toBe(0)
    const before = await projectMemoryStore.readSnapshot(projectPath)

    const snapshotPath = path.join(projectPath, 'memory', 'snapshot.json')
    await writeFile(snapshotPath, 'not valid json at all {{{', 'utf8')

    const rebuilt = await projectMemoryStore.rebuild(projectPath)
    expect(rebuilt.revision).toBe(before.revision)
    expect(rebuilt.records.map(record => record.id).sort()).toEqual(before.records.map(record => record.id).sort())

    const repairedSnapshotText = await readFile(snapshotPath, 'utf8')
    expect(() => JSON.parse(repairedSnapshotText)).not.toThrow()
    expect(JSON.parse(repairedSnapshotText).revision).toBe(before.revision)
  })

  it('fails an agent turn visibly on a corrupt ledger (503 + repair message) while direct document editing remains available', async () => {
    const workspaceRoot = await tempDir('writeros-corrupt-ledger-')
    const library = await createProjectLibraryStore(workspaceRoot)
    const projectId = 'e2e-corrupt-ledger-project'
    const state = defaultProjectState()
    state.meta.title = 'The Harbor Fixture'
    await library.writeProject({
      id: projectId,
      createdAt: Date.parse('2026-08-01T00:00:00.000Z'),
      updatedAt: Date.parse('2026-08-01T00:00:00.000Z'),
      state,
    })
    const projectPath = await library.resolveProjectPackagePath(projectId)

    const sourceRoot = await tempDir('wayfinder-corrupt-ledger-source-')
    await writeWayfinderFixture(sourceRoot)
    expect((await runCli(['import', '--project', projectPath, '--source', 'wayfinder', '--from', sourceRoot, '--apply'])).exitCode).toBe(0)

    const ledgerPath = path.join(projectPath, 'memory', 'ledger.jsonl')
    const ledgerBefore = await readFile(ledgerPath, 'utf8')
    await writeFile(ledgerPath, `${ledgerBefore}not a valid ledger line\n`, 'utf8')

    // Same env-driven wiring server/index.ts uses in production: one
    // WRITEROS_PROJECTS_ROOT backs both the project library save route and
    // the agent memory provider, so this exercises the real integration
    // rather than two independently constructed stores.
    vi.stubEnv('WRITEROS_PROJECTS_ROOT', workspaceRoot)
    const { server, port } = await startRealApp()
    try {
      const response = await postJson(port, '/api/chat', genericChatBody(projectId))
      expect(response.status).toBe(503)
      expect(response.json).toEqual({
        error: 'project-memory-unavailable',
        message: 'Project memory is unavailable and needs repair.',
      })

      // Direct document editing survives: WriterOS never blocks creative
      // document edits on a broken memory ledger.
      const read = await library.readProject(projectId)
      if (!read.ok) throw new Error('fixture project unexpectedly missing')
      const changed = {
        ...read.project,
        updatedAt: read.project.updatedAt + 1_000,
        state: { ...read.project.state, meta: { ...read.project.state.meta, title: 'Edited despite a corrupt ledger' } },
      }
      const bootstrap = await getJson(port, '/api/project-library/bootstrap', { Origin: 'http://127.0.0.1:5000' })
      const sessionHeaders = { Origin: 'http://127.0.0.1:5000', 'X-WriterOS-Session': bootstrap.json.sessionToken as string }
      const save = await putJson(port, `/api/project-library/projects/${projectId}`, { project: changed }, sessionHeaders)
      expect(save.status).toBe(200)

      const readBack = await library.readProject(projectId)
      expect(readBack.ok && readBack.project.state.meta.title).toBe('Edited despite a corrupt ledger')
    } finally {
      server.close()
    }
  })
})
