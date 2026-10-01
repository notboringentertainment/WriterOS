import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { registerProjectLibraryRoutes } from '../../server/projectLibrary/routes'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'
import type { LooksDocument } from '../../shared/looks'

const PROJECT_ID = 'looks-route-project-1234'
const headers = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'test-session-token' }
const base = `/api/project-library/projects/${PROJECT_ID}`
const servers: Server[] = []
const roots: string[] = []
let workspace: string
let store: ProjectLibraryStore
let packagePath: string
let port: number

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5 })))
})

function config(): ProjectLibraryConfig {
  return { enabled: true, rootPath: workspace, label: 'WriterOS Projects', sessionToken: 'test-session-token', allowedOrigins: new Set(['http://127.0.0.1:5177']) }
}

function makeProject(): StoredProject {
  const state = defaultProjectState()
  state.meta.title = 'Vector Show'
  return { id: PROJECT_ID, createdAt: Date.parse('2026-09-01T12:00:00.000Z'), updatedAt: Date.parse('2026-09-02T12:00:00.000Z'), state }
}

function looks(): LooksDocument {
  return { version: 1, drafts: { 'character:vector-engineer': {
    sessionId: 's1', entityKind: 'character', entityName: 'Vector Engineer', reference: 'unasked',
    spec: { hair: 'cropped ash-blond' }, fieldSources: { hair: 'writer' }, citedRecordIds: [], updatedAt: '2026-09-30T12:00:00.000Z',
  } } }
}

function requestJson(requestPath: string, options: { method?: string; body?: unknown } = {}) {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method: options.method ?? 'GET',
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}), ...headers } },
    res => { const c: Buffer[] = []; res.on('data', d => c.push(Buffer.from(d))); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); resolve({ status: res.statusCode ?? 0, json: t ? JSON.parse(t) : undefined }) }) })
    req.on('error', reject)
    if (payload) req.write(payload)
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

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'writeros-looks-roundtrip-'))
  roots.push(workspace)
  store = await createProjectLibraryStore(workspace)
  await store.writeProject(makeProject())
  packagePath = await store.resolveProjectPackagePath(PROJECT_ID)
  const app = express()
  app.use(express.json({ limit: WRITEROS_JSON_BODY_LIMIT }))
  registerProjectLibraryRoutes(app, config(), store)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

describe('look drafts server round trip', () => {
  it('GET returns the stored drafts and saving them back leaves documents/looks.json byte-identical', async () => {
    const project = makeProject()
    project.state.documents.looks = looks()
    expect((await requestJson(base, { method: 'PUT', body: { project } })).status).toBe(200)
    const file = path.join(packagePath, 'documents/looks.json')
    const bytesBefore = await readFile(file, 'utf8')
    const got = await requestJson(base)
    expect(got.json.result.project.state.documents.looks).toEqual(looks())
    expect((await requestJson(base, { method: 'PUT', body: { project: got.json.result.project } })).status).toBe(200)
    expect(await readFile(file, 'utf8')).toBe(bytesBefore)
  })

  it('a save that never loaded drafts leaves the file present and identical', async () => {
    const project = makeProject()
    project.state.documents.looks = looks()
    expect((await requestJson(base, { method: 'PUT', body: { project } })).status).toBe(200)
    const file = path.join(packagePath, 'documents/looks.json')
    const bytesBefore = await readFile(file, 'utf8')
    const unaware = makeProject()
    unaware.state.meta.genre = 'Drama'
    expect((await requestJson(base, { method: 'PUT', body: { project: unaware } })).status).toBe(200)
    expect(await readFile(file, 'utf8')).toBe(bytesBefore)
  })

  it('a save carrying invalid drafts answers 400 invalid-looks and writes nothing', async () => {
    const before = await tree(packagePath)
    const project = makeProject()
    project.state.meta.title = 'Should not land'
    ;(project.state.documents as any).looks = { version: 1, drafts: { 'character:x': { spec: 'nope' } } }
    const put = await requestJson(base, { method: 'PUT', body: { project } })
    expect(put.status).toBe(400)
    expect(put.json).toEqual({ error: 'invalid-looks', message: 'The look drafts in this save are not valid; nothing was written.' })
    expect(await tree(packagePath)).toEqual(before)
  })
})
