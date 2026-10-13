import express from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { registerProjectMemoryRoutes, registerProjectMemorySecurityBoundary } from '../../server/projectMemory/routes'
import type { OutboxEntry } from '../../server/appeals/appealOutbox'

const servers: Server[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const entry = (overrides: Partial<OutboxEntry>): OutboxEntry => ({
  recordId: 'rec-1',
  lineageIds: ['rec-1'],
  fileName: 'appeal-1.md',
  ticket: '# ticket',
  status: 'pending',
  updatedAt: '2026-10-09T12:00:00.000Z',
  ...overrides,
})

async function setup(entries?: OutboxEntry[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'writeros-appeal-routes-'))
  roots.push(root)
  const store = await createProjectLibraryStore(root)
  const project = {
    id: 'appeal-routes-project',
    createdAt: Date.parse('2026-10-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-10-02T12:00:00.000Z'),
    state: defaultProjectState(),
  }
  await store.writeProject(project)
  if (entries) {
    const projectPath = await store.resolveProjectPackagePath(project.id)
    await mkdir(path.join(projectPath, 'memory'), { recursive: true })
    await writeFile(path.join(projectPath, 'memory', 'appeals-outbox.json'), JSON.stringify({ version: 1, entries }))
  }
  const config = {
    enabled: true,
    rootPath: root,
    label: 'Projects',
    sessionToken: 'route-session',
    allowedOrigins: new Set(['http://127.0.0.1:5177']),
  }
  const app = express()
  registerProjectMemorySecurityBoundary(app, config)
  registerProjectMemoryRoutes(app, config, store)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as AddressInfo).port, projectId: project.id }
}

function get(port: number, requestPath: string, headers: Record<string, string>) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: requestPath, headers }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: response.statusCode ?? 0, json })
      })
    }).on('error', reject)
  })
}

const authorized = { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' }

describe('GET /api/projects/:projectId/memory/appeals', () => {
  it('counts pending appeals and lists failed ones with their reasons, ignoring delivered', async () => {
    const { port, projectId } = await setup([
      entry({ recordId: 'a', fileName: 'appeal-a.md', status: 'pending' }),
      entry({ recordId: 'b', fileName: 'appeal-b.md', status: 'failed', error: "The Story-drive folder isn't there — it may have been moved or renamed, or iCloud is offline." }),
      entry({ recordId: 'c', fileName: 'appeal-c.md', status: 'delivered' }),
    ])
    const response = await get(port, `/api/projects/${projectId}/memory/appeals`, authorized)
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      pending: 1,
      failed: [{ fileName: 'appeal-b.md', error: "The Story-drive folder isn't there — it may have been moved or renamed, or iCloud is offline." }],
    })
  })

  it('reports nothing for a project with no outbox', async () => {
    const { port, projectId } = await setup()
    const response = await get(port, `/api/project-memory/${projectId}/appeals`, authorized)
    expect(response.status).toBe(200)
    expect(response.json).toEqual({ pending: 0, failed: [] })
  })

  it('refuses a request without the session header', async () => {
    const { port, projectId } = await setup([entry({})])
    const response = await get(port, `/api/projects/${projectId}/memory/appeals`, { Origin: 'http://127.0.0.1:5177' })
    expect(response.status).toBe(401)
    expect(response.json).not.toHaveProperty('pending')
  })
})
