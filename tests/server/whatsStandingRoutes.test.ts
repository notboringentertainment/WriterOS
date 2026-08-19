import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import {
  createNonProjectMemoryBodyParser,
  createProjectMemoryJsonParser,
  projectMemoryJsonErrorBoundary,
  registerProjectMemoryRoutes,
  registerProjectMemorySecurityBoundary,
} from '../../server/projectMemory/routes'
import { projectMemoryStore } from '../../server/projectMemory/store'
import { WhatsStandingPayloadSchema } from '../../shared/whatsStandingPanel'

const servers: Server[] = []
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
  })))
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function startMemoryApp(config: ProjectLibraryConfig, store: ProjectLibraryStore) {
  const app = express()
  registerProjectMemorySecurityBoundary(app, config)
  app.use(createProjectMemoryJsonParser(WRITEROS_JSON_BODY_LIMIT))
  app.use(createNonProjectMemoryBodyParser(express.json({ limit: WRITEROS_JSON_BODY_LIMIT })))
  app.use(createNonProjectMemoryBodyParser(express.urlencoded({ extended: false })))
  app.use(projectMemoryJsonErrorBoundary)
  registerProjectMemoryRoutes(app, config, store)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function getJson(port: number, requestPath: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; text: string; json: any }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'GET',
      headers,
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        resolve({ status: response.statusCode ?? 0, text, json })
      })
    })
    request.on('error', reject)
    request.end()
  })
}

function postJson(
  port: number,
  requestPath: string,
  body: unknown,
  headers: Record<string, string>,
) {
  const payload = JSON.stringify(body)
  return new Promise<{ status: number; text: string; json: any }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
        ...headers,
      },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        resolve({ status: response.statusCode ?? 0, text, json })
      })
    })
    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

async function seedProject(root: string) {
  const store = await createProjectLibraryStore(root)
  const project = {
    id: 'whats-standing-panel-project',
    createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
    state: defaultProjectState(),
  }
  await store.writeProject(project)
  const projectPath = await store.resolveProjectPackagePath(project.id)
  // A claim carrying a reference cue ("Superseded by…") so the report has one pending
  // question for the answer-endpoint tests to exercise.
  await projectMemoryStore.publish(projectPath, {
    projectId: project.id,
    dedupeKey: 'whats-standing-panel-canon',
    kind: 'canon',
    requestedStatus: 'active',
    claim: 'Second decision. Superseded by beats 9-11.',
    source: {
      workflow: 'writeros',
      sourceId: 'whats-standing-panel-source',
      sourceUri: 'writeros://canon/whats-standing-panel-source',
      sourceHash: 'whats-standing-panel-hash',
      capturedAt: '2026-08-02T12:00:00.000Z',
      approval: 'explicit',
    },
  })
  return { store, project }
}

describe('what\'s standing panel HTTP routes', () => {
  it('serves the report with questions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-whats-standing-routes-'))
    temporaryRoots.push(root)
    const { store, project } = await seedProject(root)
    const config: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const port = await startMemoryApp(config, store)
    const authHeaders = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' }

    const res = await getJson(port, `/api/projects/${project.id}/memory/whats-standing`, authHeaders)

    expect(res.status).toBe(200)
    expect(WhatsStandingPayloadSchema.safeParse(res.json).success).toBe(true)
    expect(res.json.questions.length).toBeGreaterThan(0)
  })

  it('answers a question and returns the regenerated report', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-whats-standing-routes-'))
    temporaryRoots.push(root)
    const { store, project } = await seedProject(root)
    const config: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const port = await startMemoryApp(config, store)
    const authHeaders = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' }

    const before = await getJson(port, `/api/projects/${project.id}/memory/whats-standing`, authHeaders)
    const q = before.json.questions[0]
    const res = await postJson(
      port,
      `/api/projects/${project.id}/memory/whats-standing/answer`,
      { annotationId: q.annotationId, questionVersion: q.questionVersion, answer: { kind: 'decline' } },
      authHeaders,
    )

    expect(res.status).toBe(200)
    expect(WhatsStandingPayloadSchema.safeParse(res.json).success).toBe(true)
    expect(res.json.questions.map((x: { annotationId: string }) => x.annotationId)).not.toContain(q.annotationId)
  })

  it('rejects a stale questionVersion with 409 and leaves the log unchanged', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-whats-standing-routes-'))
    temporaryRoots.push(root)
    const { store, project } = await seedProject(root)
    const config: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const port = await startMemoryApp(config, store)
    const authHeaders = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' }

    const before = await getJson(port, `/api/projects/${project.id}/memory/whats-standing`, authHeaders)
    const q = before.json.questions[0]
    const res = await postJson(
      port,
      `/api/projects/${project.id}/memory/whats-standing/answer`,
      { annotationId: q.annotationId, questionVersion: 'f'.repeat(64), answer: { kind: 'decline' } },
      authHeaders,
    )

    expect(res.status).toBe(409)
    const again = await getJson(port, `/api/projects/${project.id}/memory/whats-standing`, authHeaders)
    expect(again.json.questions.length).toBe(before.json.questions.length)
  })

  it('rejects an unknown question with 404, a bad body with 400, and no session with the boundary error', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-whats-standing-routes-'))
    temporaryRoots.push(root)
    const { store, project } = await seedProject(root)
    const config: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const port = await startMemoryApp(config, store)
    const authHeaders = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' }

    const bad = await postJson(
      port,
      `/api/projects/${project.id}/memory/whats-standing/answer`,
      { annotationId: 'ann_missing', questionVersion: 'a'.repeat(64), answer: { kind: 'decline' } },
      authHeaders,
    )
    expect(bad.status).toBe(404)

    const invalid = await postJson(
      port,
      `/api/projects/${project.id}/memory/whats-standing/answer`,
      { nonsense: true },
      authHeaders,
    )
    expect(invalid.status).toBe(400)

    const unauthed = await getJson(port, `/api/projects/${project.id}/memory/whats-standing`)
    expect(unauthed.status).toBeGreaterThanOrEqual(400)
  })
})
