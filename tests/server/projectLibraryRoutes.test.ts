import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { registerProjectLibraryRoutes } from '../../server/projectLibrary/routes'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'

const servers: Server[] = []
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function makeProject(title = 'The Salt Line'): StoredProject {
  const state = defaultProjectState()
  state.meta.title = title
  state.script.rawHtml = '<p data-element-type="scene-heading">INT. WRITERS ROOM - DAY</p>'
  return {
    id: 'route-project-1234',
    createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
    state,
  }
}

function config(overrides: Partial<ProjectLibraryConfig> = {}): ProjectLibraryConfig {
  return {
    enabled: true,
    rootPath: '/secret/WriterOS Projects',
    label: 'WriterOS Projects',
    sessionToken: 'test-session-token',
    allowedOrigins: new Set(['http://127.0.0.1:5177']),
    ...overrides,
  }
}

async function startApp(routeConfig: ProjectLibraryConfig, store: ProjectLibraryStore | null) {
  const app = express()
  app.use(express.json({ limit: WRITEROS_JSON_BODY_LIMIT }))
  registerProjectLibraryRoutes(app, routeConfig, store)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

function requestJson(port: number, requestPath: string, options: RequestOptions = {}) {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; json: any; text: string }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: options.method ?? 'GET',
      headers: {
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
        } : {}),
        ...options.headers,
      },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          text,
          json: text ? JSON.parse(text) : undefined,
        })
      })
    })
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

const sameOriginHeaders = {
  Origin: 'http://127.0.0.1:5177',
  'X-WriterOS-Session': 'test-session-token',
}

describe('project library HTTP routes', () => {
  it('returns disabled bootstrap without revealing filesystem paths', async () => {
    const port = await startApp(config({ enabled: false, rootPath: null, label: null }), null)

    const response = await requestJson(port, '/api/project-library/bootstrap', {
      headers: { Origin: 'http://127.0.0.1:5177' },
    })

    expect(response.status).toBe(200)
    expect(response.json).toEqual({ enabled: false })
    expect(response.text).not.toContain('/secret/')
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('returns label and token but never root path in enabled bootstrap', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const port = await startApp(config({ rootPath: root }), store)

    const response = await requestJson(port, '/api/project-library/bootstrap', {
      headers: { Origin: 'http://127.0.0.1:5177' },
    })

    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      enabled: true,
      label: 'WriterOS Projects',
      sessionToken: 'test-session-token',
    })
    expect(response.text).not.toContain(root)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rejects cross-site, missing-origin, and invalid-token data requests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const port = await startApp(config({ rootPath: root }), await createProjectLibraryStore(root))

    const missingOrigin = await requestJson(port, '/api/project-library/projects', {
      headers: { 'X-WriterOS-Session': 'test-session-token' },
    })
    const foreignOrigin = await requestJson(port, '/api/project-library/projects', {
      headers: { Origin: 'https://evil.example', 'X-WriterOS-Session': 'test-session-token' },
    })
    const wrongToken = await requestJson(port, '/api/project-library/projects', {
      headers: { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'wrong' },
    })

    expect(missingOrigin.status).toBe(403)
    expect(foreignOrigin.status).toBe(403)
    expect(wrongToken.status).toBe(401)
  })

  it('accepts browser same-origin fetch metadata when GET omits Origin', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const port = await startApp(config({ rootPath: root }), await createProjectLibraryStore(root))

    const response = await requestJson(port, '/api/project-library/projects', {
      headers: {
        Host: '127.0.0.1:5177',
        'Sec-Fetch-Site': 'same-origin',
        'X-WriterOS-Session': 'test-session-token',
      },
    })

    expect(response.status).toBe(200)
  })

  it('lists, creates, reads, and updates projects through authenticated requests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const port = await startApp(config({ rootPath: root }), await createProjectLibraryStore(root))
    const project = makeProject()

    const empty = await requestJson(port, '/api/project-library/projects', { headers: sameOriginHeaders })
    const created = await requestJson(port, `/api/project-library/projects/${project.id}`, {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project },
    })
    const listed = await requestJson(port, '/api/project-library/projects', { headers: sameOriginHeaders })
    const read = await requestJson(port, `/api/project-library/projects/${project.id}`, { headers: sameOriginHeaders })
    const updatedProject = makeProject('Salt Line Revised')
    updatedProject.updatedAt += 5_000
    const updated = await requestJson(port, `/api/project-library/projects/${project.id}`, {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project: updatedProject },
    })

    expect(empty).toMatchObject({ status: 200, json: { entries: [] } })
    expect(created).toMatchObject({ status: 200, json: { ref: { id: project.id, kind: 'server' } } })
    expect(listed.json.entries[0]).toMatchObject({ status: 'ready', ref: { id: project.id } })
    expect(read).toMatchObject({ status: 200, json: { result: { ok: true, project: { id: project.id } } } })
    expect(updated.json.ref).toMatchObject({
      id: project.id,
      packageName: 'Salt Line Revised (routepro).writeros',
    })
    expect(updated.headers['cache-control']).toBe('no-store')
  })

  it('rejects malformed bodies, id mismatches, and unknown projects without leaking paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const port = await startApp(config({ rootPath: root }), await createProjectLibraryStore(root))
    const project = makeProject()

    const malformed = await requestJson(port, `/api/project-library/projects/${project.id}`, {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project: { id: project.id, createdAt: 1, updatedAt: 2, state: [] }, path: '/etc' },
    })
    const mismatch = await requestJson(port, '/api/project-library/projects/another-id', {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project },
    })
    const unsafeProject = { ...project, id: '../../../../tmp/victim' }
    const unsafeId = await requestJson(port, '/api/project-library/projects/..%2F..%2F..%2F..%2Ftmp%2Fvictim', {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project: unsafeProject },
    })
    const missing = await requestJson(port, '/api/project-library/projects/missing', {
      headers: sameOriginHeaders,
    })

    expect(malformed.status).toBe(400)
    expect(mismatch.status).toBe(400)
    expect(unsafeId.status).toBe(400)
    expect(missing.status).toBe(404)
    expect(malformed.text + mismatch.text + missing.text).not.toContain(root)
  })

  it('accepts project saves larger than Express default body limit', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const port = await startApp(config({ rootPath: root }), await createProjectLibraryStore(root))
    const project = makeProject()
    ;(project.state as unknown as Record<string, unknown>).largePayload = 'x'.repeat(200_000)

    const response = await requestJson(port, `/api/project-library/projects/${project.id}`, {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project },
    })

    expect(response.status).toBe(200)
  })

  it('rejects package-name collisions with conflict status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const first = makeProject('Collision')
    await store.writeProject(first)
    const second = makeProject('Collision')
    second.id = 'route-project-9999'
    await mkdir(path.join(root, 'unrelated'), { recursive: true })
    const port = await startApp(config({ rootPath: root }), store)

    const response = await requestJson(port, `/api/project-library/projects/${second.id}`, {
      method: 'PUT',
      headers: sameOriginHeaders,
      body: { project: second },
    })

    expect(response.status).toBe(409)
    expect(response.json).toEqual({ error: 'name-collision', message: 'A WriterOS project package with this name already exists.' })
  })
})
