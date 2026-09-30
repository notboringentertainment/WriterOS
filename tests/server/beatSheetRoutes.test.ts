import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultProjectState, migrateState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { registerProjectLibraryRoutes } from '../../server/projectLibrary/routes'
import { keepServerOwnedBeatFields, registerBeatSheetRoutes } from '../../server/projectLibrary/beatSheetRoutes'
import { writeStoryDriveLink } from '../../server/projectLibrary/storyDriveLinks'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { readAnalysisQueue } from '../../server/projectMemory/writerOSObserver'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'

const FIXTURE = path.resolve(__dirname, '../fixtures/beatSheet/synthetic-beat-sheet.md')
const DECISION = 'wayfinder/resolved/synthetic-beat-sheet.md'
const PROJECT_ID = 'beat-route-project-1234'

const servers: Server[] = []
const roots: string[] = []
let workspace: string
let drive: string
let store: ProjectLibraryStore
let port: number
let packagePath: string

const headers = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'test-session-token' }
const base = `/api/project-library/projects/${PROJECT_ID}`

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

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
  return {
    id: PROJECT_ID,
    createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
    state,
  }
}

function requestJson(requestPath: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: options.method ?? 'GET',
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
        ...(options.headers ?? headers),
      },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: response.statusCode ?? 0, json: text ? JSON.parse(text) : undefined })
      })
    })
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
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

const outlinePath = () => path.join(packagePath, 'documents/outline.json')
const readOutline = async () => JSON.parse(await readFile(outlinePath(), 'utf8'))

async function link() {
  await writeStoryDriveLink(workspace, PROJECT_ID, { root: drive, beatSheet: 'resolved/synthetic-beat-sheet.md' })
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'writeros-beat-routes-ws-'))
  drive = await mkdtemp(path.join(tmpdir(), 'writeros-beat-routes-drive-'))
  roots.push(workspace, drive)
  store = await createProjectLibraryStore(workspace)
  await store.writeProject(makeProject())
  packagePath = await store.resolveProjectPackagePath(PROJECT_ID)
  await mkdir(path.join(drive, 'wayfinder/resolved'), { recursive: true })
  await writeFile(path.join(drive, DECISION), await readFile(FIXTURE, 'utf8'), 'utf8')

  const app = express()
  app.use(express.json({ limit: WRITEROS_JSON_BODY_LIMIT }))
  registerProjectLibraryRoutes(app, config(), store)
  registerBeatSheetRoutes(app, config(), store)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

describe('beat sheet on project open', () => {
  it('GET project returns beatSheet.kind not-linked for an unregistered package and leaves files untouched', async () => {
    const before = await tree(workspace)
    const response = await requestJson(base)
    expect(response.status).toBe(200)
    expect(response.json.beatSheet).toEqual({ kind: 'not-linked' })
    expect(response.json.result.ok).toBe(true)
    expect(await tree(workspace)).toEqual(before)
  })

  it('GET project syncs a registered package before returning it (units keyed by title in the response)', async () => {
    await link()
    const response = await requestJson(base)
    expect(response.status).toBe(200)
    expect(response.json.beatSheet.kind).toBe('updated')
    const units = response.json.result.project.state.documents.outline.content.units
    expect(units.map((u: { id: string }) => u.id)).toEqual(['beat.cold-open-the-harbour', 'beat.the-dinner', 'beat.the-second-dinner'])
  })

  it('GET project returns the project even when the Story-drive folder is missing (kind unavailable)', async () => {
    await writeStoryDriveLink(workspace, PROJECT_ID, { root: path.join(drive, 'nope'), beatSheet: 'resolved/synthetic-beat-sheet.md' })
    const response = await requestJson(base)
    expect(response.status).toBe(200)
    expect(response.json.beatSheet.kind).toBe('unavailable')
    expect(response.json.result.ok).toBe(true)
  })

  it('GET project still answers 404 for an unknown project', async () => {
    const response = await requestJson('/api/project-library/projects/no-such-project')
    expect(response.status).toBe(404)
  })
})

describe('beat sheet refresh and status routes', () => {
  it('POST refresh returns the outline it wrote, and a second call returns unchanged with outline null', async () => {
    await link()
    const first = await requestJson(`${base}/beat-sheet/refresh`, { method: 'POST' })
    expect(first.status).toBe(200)
    expect(first.json.beatSheet.kind).toBe('updated')
    expect(first.json.outline).toEqual(await readOutline())
    const second = await requestJson(`${base}/beat-sheet/refresh`, { method: 'POST' })
    expect(second.json.beatSheet.kind).toBe('unchanged')
    expect(second.json.outline).toBeNull()
  })

  it('GET status reports updated without writing when the decision changed on disk', async () => {
    await link()
    await requestJson(`${base}/beat-sheet/refresh`, { method: 'POST' })
    await writeFile(path.join(drive, DECISION), (await readFile(FIXTURE, 'utf8')).replace('Night. A ferry docks late.', 'Dawn. A ferry docks early.'), 'utf8')
    const before = await tree(workspace)
    const response = await requestJson(`${base}/beat-sheet/status`)
    expect(response.status).toBe(200)
    expect(response.json.beatSheet.kind).toBe('updated')
    expect(response.json.beatSheet.changed).toEqual(['beat.cold-open-the-harbour'])
    expect(await tree(workspace)).toEqual(before)
  })

  it('refresh and status require the session header (401 without it)', async () => {
    const noSession = { Origin: 'http://127.0.0.1:5177' }
    expect((await requestJson(`${base}/beat-sheet/refresh`, { method: 'POST', headers: noSession })).status).toBe(401)
    expect((await requestJson(`${base}/beat-sheet/status`, { headers: noSession })).status).toBe(401)
  })
})

describe('server-owned beat fields on save', () => {
  async function syncedAndStalePut(mutate?: (project: StoredProject) => void) {
    // A browser opened the project before the sync: it holds the template units.
    const staleProject = makeProject()
    staleProject.state = migrateState(staleProject.state)
    await link()
    const opened = await requestJson(base) // sync writes 3 beats, revision 1
    expect(opened.json.beatSheet.kind).toBe('updated')
    const synced = await readOutline()
    mutate?.(staleProject)
    return { synced, staleProject }
  }

  it('a stale client PUT after a sync keeps the on-disk units and beatSheetSource, and the analysis queue stays empty', async () => {
    const { synced, staleProject } = await syncedAndStalePut()
    expect(staleProject.state.documents.outline.content.units).not.toEqual(synced.content.units)
    expect(staleProject.state.documents.outline.content.beatSheetSource).toBeUndefined()

    const put = await requestJson(base, { method: 'PUT', body: { project: staleProject } })
    expect(put.status).toBe(200)

    expect(await readOutline()).toEqual(synced)
    const queue = await readAnalysisQueue(packagePath)
    expect(queue.filter(item => item.surface === 'outline')).toEqual([])
  })

  it('a PUT that edits the spine AND carries stale beats keeps the disk beats, keeps the spine edit, bumps revision to max, and queues one outline analysis', async () => {
    const { synced, staleProject } = await syncedAndStalePut(project => {
      project.state.documents.outline.content.spine.theme = 'Belonging is a debt.'
    })

    const put = await requestJson(base, { method: 'PUT', body: { project: staleProject } })
    expect(put.status).toBe(200)

    const onDisk = await readOutline()
    expect(onDisk.content.units).toEqual(synced.content.units)
    expect(onDisk.content.beatSheetSource).toEqual(synced.content.beatSheetSource)
    expect(onDisk.content.spine.theme).toBe('Belonging is a debt.')
    expect(onDisk.revision).toBe(Math.max(staleProject.state.documents.outline.revision, synced.revision))
    const queue = await readAnalysisQueue(packagePath)
    expect(queue.filter(item => item.surface === 'outline')).toHaveLength(1)
  })
})

describe('keepServerOwnedBeatFields', () => {
  it('returns the incoming project unchanged when the package has no beatSheetSource', () => {
    const prior = makeProject()
    prior.state = migrateState(prior.state)
    const incoming = makeProject()
    incoming.state = migrateState(incoming.state)
    incoming.state.documents.outline.content.spine.theme = 'Changed.'
    const result = keepServerOwnedBeatFields(prior, incoming)
    expect(result.project).toBe(incoming)
    expect(result.replaced).toBe(false)
    expect(keepServerOwnedBeatFields(null, incoming)).toEqual({ project: incoming, replaced: false })
  })
})

describe('lookbook server round trip', () => {
  it('GET returns the stored lookbook and saving it back leaves documents/lookbook.json byte-identical', async () => {
    const project = makeProject()
    project.state.documents.lookbook = {
      version: 1,
      beats: { 'beat.the-dinner': { titleAtAsk: 'The dinner.', questions: [
        { id: 'lb_1', prompt: 'What is on the table when the scene opens?', answer: 'Bread and a lamp.', askedBy: 'zoe', createdAt: '2026-09-01T00:00:00.000Z' },
      ] } },
    }
    const put1 = await requestJson(base, { method: 'PUT', body: { project } })
    expect(put1.status).toBe(200)
    const lookbookFile = path.join(packagePath, 'documents/lookbook.json')
    const bytesBefore = await readFile(lookbookFile, 'utf8')

    const got = await requestJson(base)
    expect(got.status).toBe(200)
    const returned = got.json.result.project
    expect(returned.state.documents.lookbook.beats['beat.the-dinner'].questions[0].answer).toBe('Bread and a lamp.')

    const put2 = await requestJson(base, { method: 'PUT', body: { project: returned } })
    expect(put2.status).toBe(200)
    expect(await readFile(lookbookFile, 'utf8')).toBe(bytesBefore)
  })

  it('a PUT with no lookbook key after a save that had one leaves the file present and identical', async () => {
    const project = makeProject()
    project.state.documents.lookbook = {
      version: 1,
      beats: { 'beat.the-dinner': { titleAtAsk: 'The dinner.', questions: [
        { id: 'lb_1', prompt: 'What is on the table?', answer: 'Bread.', askedBy: 'zoe', createdAt: '2026-09-01T00:00:00.000Z' },
      ] } },
    }
    expect((await requestJson(base, { method: 'PUT', body: { project } })).status).toBe(200)
    const lookbookFile = path.join(packagePath, 'documents/lookbook.json')
    const bytesBefore = await readFile(lookbookFile, 'utf8')

    const unaware = makeProject()
    unaware.state.meta.genre = 'Drama'
    expect((await requestJson(base, { method: 'PUT', body: { project: unaware } })).status).toBe(200)
    expect(await readFile(lookbookFile, 'utf8')).toBe(bytesBefore)
  })

  it('a PUT carrying an invalid lookbook answers 400 invalid-lookbook and writes nothing', async () => {
    const before = await tree(packagePath)
    const project = makeProject()
    project.state.meta.title = 'Should not land'
    ;(project.state.documents as any).lookbook = { version: 2, beats: 'nope' }
    const put = await requestJson(base, { method: 'PUT', body: { project } })
    expect(put.status).toBe(400)
    expect(put.json).toEqual({
      error: 'invalid-lookbook',
      message: 'The Lookbook in this save is not valid; nothing was written.',
    })
    expect(await tree(packagePath)).toEqual(before)
  })
})
