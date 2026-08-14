import express, { type NextFunction, type Request, type Response } from 'express'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { deflateSync, gzipSync } from 'node:zlib'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { registerRoutes } from '../../server/routes'
import { WRITEROS_JSON_BODY_LIMIT } from '../../server/httpLimits'
import type { ProjectLibraryConfig } from '../../server/projectLibrary/config'
import { createProjectLibraryStore, type ProjectLibraryStore } from '../../server/projectLibrary/store'
import { ProjectLibraryStoreError } from '../../server/projectLibrary/store'
import {
  createProjectMemoryJsonParser,
  projectMemoryJsonErrorBoundary,
  registerProjectMemoryRoutes,
  registerProjectMemorySecurityBoundary,
} from '../../server/projectMemory/routes'
import { projectMemoryStore, type ProjectMemoryStore } from '../../server/projectMemory/store'

const servers: Server[] = []
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
  })))
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function startApp() {
  const app = express()
  app.use(express.json({ limit: WRITEROS_JSON_BODY_LIMIT }))
  const server = await registerRoutes(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function startMemoryApp(
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore,
  analyze?: (input: any) => Promise<unknown>,
  memoryStore: ProjectMemoryStore = projectMemoryStore,
) {
  const app = express()
  registerProjectMemorySecurityBoundary(app, config)
  app.use(createProjectMemoryJsonParser(WRITEROS_JSON_BODY_LIMIT))
  app.use(express.json({ limit: WRITEROS_JSON_BODY_LIMIT }))
  app.use(projectMemoryJsonErrorBoundary)
  const register = registerProjectMemoryRoutes as (...args: any[]) => void
  register(app, config, store, memoryStore, analyze)
  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function requestJson(port: number, requestPath: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; text: string; json: any }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
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
        resolve({
          status: response.statusCode ?? 0,
          text,
          json,
        })
      })
    })
    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function requestRaw(
  port: number,
  requestPath: string,
  options: {
    method: string
    headers?: Record<string, string>
    body?: string | Buffer
  },
) {
  const body = typeof options.body === 'string' ? Buffer.from(options.body) : options.body
  return new Promise<{ status: number; text: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: options.method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Length': String(body.byteLength) }),
        ...options.headers,
      },
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        text: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers,
      }))
    })
    request.on('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

describe('project memory HTTP routes', () => {
  it('authenticates the entire project memory prefix before parsing any request body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const routeConfig: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const port = await startMemoryApp(routeConfig, store)
    const prefix = '/api/projects/opaque-project/memory'
    const malformed = '{"claim":'

    const unauthenticatedMalformed = await requestRaw(port, `${prefix}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: malformed,
    })
    const authenticatedMalformed = await requestRaw(port, `${prefix}/actions`, {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:5177',
        'X-WriterOS-Session': 'route-session',
        'Content-Type': 'application/json',
      },
      body: malformed,
    })
    const unsupportedAlternateType = await requestRaw(port, `${prefix}/unknown`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: '/Users/writer/Secret.writeros',
    })
    const malformedEncodedId = await requestRaw(port, '/api/projects/%ZZ/memory/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: malformed,
    })
    const authenticatedMalformedEncodedId = await requestRaw(
      port,
      '/api/projects/%ZZ/memory/snapshot',
      {
        method: 'GET',
        headers: {
          Origin: 'http://127.0.0.1:5177',
          'X-WriterOS-Session': 'route-session',
        },
      },
    )
    const foreignPreflight = await requestRaw(port, prefix, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'X-WriterOS-Session': 'route-session',
      },
    })

    expect(unauthenticatedMalformed.status).toBe(403)
    expect(authenticatedMalformed.status).toBe(400)
    expect(JSON.parse(authenticatedMalformed.text)).toEqual({
      error: 'invalid-json',
      message: 'Project memory request body is invalid JSON.',
    })
    expect(unsupportedAlternateType.status).toBe(403)
    expect(malformedEncodedId.status).toBe(403)
    expect(authenticatedMalformedEncodedId.status).toBe(400)
    expect(JSON.parse(authenticatedMalformedEncodedId.text)).toEqual({
      error: 'invalid-project-id',
      message: 'Project memory requires a valid project id.',
    })
    expect(foreignPreflight.status).toBe(403)
    for (const response of [
      unauthenticatedMalformed,
      authenticatedMalformed,
      unsupportedAlternateType,
      malformedEncodedId,
      authenticatedMalformedEncodedId,
      foreignPreflight,
    ]) {
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.text).not.toContain('/Users/writer')
      expect(response.text).not.toContain('SyntaxError')
      expect(response.text).not.toContain('<!DOCTYPE')
    }
  })

  it('secures empty-id memory prefixes and returns safe parser and method errors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const routeConfig: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const port = await startMemoryApp(routeConfig, store)
    const malformed = '{"claim":'
    const authorized = {
      Origin: 'http://127.0.0.1:5177',
      'X-WriterOS-Session': 'route-session',
    }

    const canonicalUnauthenticated = await requestRaw(port, '/api/projects//memory/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: malformed,
    })
    const legacyMissingToken = await requestRaw(port, '/api/project-memory//actions', {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:5177',
        'Content-Type': 'application/json',
      },
      body: malformed,
    })
    const canonicalForeignOrigin = await requestRaw(port, '/api/projects//memory/actions', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'X-WriterOS-Session': 'route-session',
        'Content-Type': 'application/json',
      },
      body: malformed,
    })
    const authenticatedEmptyId = await requestRaw(port, '/api/projects//memory/actions', {
      method: 'POST',
      headers: { ...authorized, 'Content-Type': 'application/json' },
      body: malformed,
    })
    const oversized = await requestRaw(port, '/api/projects/opaque-project/memory/actions', {
      method: 'POST',
      headers: { ...authorized, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(10 * 1024 * 1024) }),
    })
    const unsupportedMethod = await requestRaw(port, '/api/projects/opaque-project/memory/actions', {
      method: 'PATCH',
      headers: { ...authorized, 'Content-Type': 'application/json' },
      body: malformed,
    })
    const unknownEndpoint = await requestRaw(port, '/api/project-memory/opaque-project/unknown', {
      method: 'POST',
      headers: { ...authorized, 'Content-Type': 'application/json' },
      body: malformed,
    })
    const unrelated = await requestRaw(port, '/api/projects/not-a-memory-prefix', { method: 'GET' })

    expect(canonicalUnauthenticated.status).toBe(403)
    expect(legacyMissingToken.status).toBe(401)
    expect(canonicalForeignOrigin.status).toBe(403)
    expect(authenticatedEmptyId.status).toBe(400)
    expect(JSON.parse(authenticatedEmptyId.text)).toEqual({
      error: 'invalid-project-id',
      message: 'Project memory requires a valid project id.',
    })
    expect(oversized.status).toBe(413)
    expect(JSON.parse(oversized.text)).toEqual({
      error: 'payload-too-large',
      message: 'Project memory request body exceeds the allowed size.',
    })
    expect(unsupportedMethod.status).toBe(405)
    expect(JSON.parse(unsupportedMethod.text)).toEqual({
      error: 'method-not-allowed',
      message: 'Project memory request method is not allowed.',
    })
    expect(unknownEndpoint.status).toBe(404)
    expect(JSON.parse(unknownEndpoint.text)).toEqual({
      error: 'not-found',
      message: 'Project memory endpoint was not found.',
    })
    expect(unrelated.status).toBe(404)

    for (const response of [
      canonicalUnauthenticated,
      legacyMissingToken,
      canonicalForeignOrigin,
      authenticatedEmptyId,
      oversized,
      unsupportedMethod,
      unknownEndpoint,
    ]) {
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.text).not.toContain(root)
      expect(response.text).not.toContain('Error')
      expect(response.text).not.toContain('<!DOCTYPE')
    }
  })

  it('returns safe JSON for authenticated unsupported body encodings and charsets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'body-parser-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)
    const authorized = {
      Origin: 'http://127.0.0.1:5177',
      'X-WriterOS-Session': 'route-session',
    }
    const body = JSON.stringify({ surface: 'synopsis', content: 'Changed synopsis.' })

    const unsupportedCharset = await requestRaw(
      port,
      `/api/projects/${project.id}/memory/analyze`,
      {
        method: 'POST',
        headers: {
          ...authorized,
          'Content-Type': 'application/json; charset=iso-8859-1',
        },
        body,
      },
    )
    const unsupportedEncoding = await requestRaw(
      port,
      `/api/project-memory/${project.id}/analyze`,
      {
        method: 'POST',
        headers: {
          ...authorized,
          'Content-Type': 'application/json',
          'Content-Encoding': 'compress',
        },
        body,
      },
    )
    const normalUtf8 = await requestRaw(
      port,
      `/api/projects/${project.id}/memory/analyze`,
      {
        method: 'POST',
        headers: {
          ...authorized,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body,
      },
    )

    for (const response of [unsupportedCharset, unsupportedEncoding]) {
      expect(response.status).toBe(415)
      expect(JSON.parse(response.text)).toEqual({
        error: 'unsupported-body',
        message: 'Project memory request body encoding or media type is unsupported.',
      })
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.text).not.toContain(root)
      expect(response.text).not.toContain('UnsupportedMediaTypeError')
      expect(response.text).not.toContain('<!DOCTYPE')
    }
    expect(normalUtf8.status).toBe(503)
    expect(JSON.parse(normalUtf8.text)).toEqual({
      error: 'analysis-unavailable',
      message: 'Project memory analysis is unavailable.',
    })
  })

  it('returns safe JSON for malformed supported compressed bodies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'compressed-body-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)
    const authorized = {
      Origin: 'http://127.0.0.1:5177',
      'X-WriterOS-Session': 'route-session',
      'Content-Type': 'application/json',
    }

    const malformedGzip = await requestRaw(
      port,
      `/api/projects/${project.id}/memory/analyze`,
      {
        method: 'POST',
        headers: { ...authorized, 'Content-Encoding': 'gzip' },
        body: Buffer.from('not-a-gzip-stream'),
      },
    )
    const malformedDeflate = await requestRaw(
      port,
      `/api/project-memory/${project.id}/analyze`,
      {
        method: 'POST',
        headers: { ...authorized, 'Content-Encoding': 'deflate' },
        body: Buffer.from('not-a-deflate-stream'),
      },
    )
    const validGzip = await requestRaw(
      port,
      `/api/projects/${project.id}/memory/analyze`,
      {
        method: 'POST',
        headers: { ...authorized, 'Content-Encoding': 'gzip' },
        body: gzipSync(JSON.stringify({ surface: 'synopsis', content: 'Compressed synopsis.' })),
      },
    )
    const validDeflate = await requestRaw(
      port,
      `/api/project-memory/${project.id}/analyze`,
      {
        method: 'POST',
        headers: { ...authorized, 'Content-Encoding': 'deflate' },
        body: deflateSync(JSON.stringify({ surface: 'synopsis', content: 'Compressed synopsis.' })),
      },
    )

    for (const response of [malformedGzip, malformedDeflate]) {
      expect(response.status).toBe(400)
      expect(JSON.parse(response.text)).toEqual({
        error: 'invalid-body',
        message: 'Project memory request body could not be read.',
      })
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.text).not.toContain(root)
      expect(response.text).not.toContain('<!DOCTYPE')
      expect(response.text).not.toMatch(/Z_(?:DATA|BUF|STREAM)_ERROR/)
    }
    for (const response of [validGzip, validDeflate]) {
      expect(response.status).toBe(503)
      expect(JSON.parse(response.text)).toEqual({
        error: 'analysis-unavailable',
        message: 'Project memory analysis is unavailable.',
      })
    }
  })

  it('does not classify an unrelated downstream error as a parser failure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const config: ProjectLibraryConfig = {
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }
    const spoofedError = Object.assign(new SyntaxError('spoofed parser error'), {
      status: 400,
      type: 'entity.parse.failed',
      code: 'Z_DATA_ERROR',
    })
    let observedError: unknown
    const app = express()
    registerProjectMemorySecurityBoundary(app, config)
    app.use(createProjectMemoryJsonParser(WRITEROS_JSON_BODY_LIMIT))
    app.use((_req, _res, next) => next(spoofedError))
    app.use(projectMemoryJsonErrorBoundary)
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      observedError = error
      res.status(418).json({ error: 'downstream-error' })
    })
    const server = http.createServer(app)
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    const response = await requestRaw(
      port,
      '/api/projects/spoof-error-project/memory/actions',
      {
        method: 'POST',
        headers: {
          Origin: 'http://127.0.0.1:5177',
          'X-WriterOS-Session': 'route-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'spoof' }),
      },
    )

    expect(response.status).toBe(418)
    expect(JSON.parse(response.text)).toEqual({ error: 'downstream-error' })
    expect(observedError).toBe(spoofedError)
  })

  it('rejects missing origin, wrong origin, and missing session token before project lookup', async () => {
    const port = await startApp()

    const missingOrigin = await requestJson(port, '/api/project-memory/opaque-project/snapshot')
    const wrongOrigin = await requestJson(port, '/api/project-memory/opaque-project/snapshot', {
      Origin: 'https://evil.example',
      'X-WriterOS-Session': 'stolen-or-guessed-token',
    })
    const missingToken = await requestJson(port, '/api/project-memory/opaque-project/snapshot', {
      Origin: `http://127.0.0.1:${process.env.PORT || '5000'}`,
    })

    expect(missingOrigin.status).toBe(403)
    expect(wrongOrigin.status).toBe(403)
    expect(missingToken.status).toBe(401)
  })

  it('returns an authenticated project snapshot without revealing its package path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const state = defaultProjectState()
    state.meta.title = 'Hidden Package Path'
    const project = {
      id: 'memory-route-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state,
    }
    await store.writeProject(project)
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)

    const response = await requestJson(
      port,
      `/api/project-memory/${project.id}/snapshot`,
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(200)
    expect(response.json.snapshot).toMatchObject({
      schemaVersion: 1,
      projectId: project.id,
      revision: 0,
      records: [],
      conflicts: [],
    })
    expect(response.text).not.toContain(root)
  })

  it('rejects a traversal-shaped URL project ID before resolving a package path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)

    const response = await requestJson(
      port,
      '/api/project-memory/..%2F..%2Fprivate/snapshot',
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(400)
    expect(response.json).toEqual({
      error: 'invalid-project-id',
      message: 'Project memory requires a valid project id.',
    })
    expect(response.text).not.toContain(root)
  })

  it('rejects a resolved package whose manifest project ID differs from the URL', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'manifest-project-id',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const projectPath = await store.resolveProjectPackagePath(project.id)
    const staleIndexStore: ProjectLibraryStore = {
      ...store,
      resolveProjectPackagePath: async () => projectPath,
    }
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, staleIndexStore)

    const response = await requestJson(
      port,
      '/api/project-memory/different-project-id/snapshot',
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(400)
    expect(response.json).toEqual({
      error: 'project-mismatch',
      message: 'URL project id does not match the WriterOS project package.',
    })
    expect(response.text).not.toContain(projectPath)
  })

  it('builds authenticated context through the shared retrieval contract', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'context-route-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const projectPath = await store.resolveProjectPackagePath(project.id)
    await projectMemoryStore.publish(projectPath, {
      projectId: project.id,
      dedupeKey: 'context-canon',
      kind: 'canon',
      requestedStatus: 'active',
      claim: 'The pilot ends at the lighthouse.',
      source: {
        workflow: 'writeros',
        sourceId: 'canon-source',
        sourceUri: 'writeros://canon/source',
        sourceHash: 'context-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    })
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)

    const response = await requestJson(
      port,
      `/api/project-memory/${project.id}/context?query=pilot%20ending&surface=synopsis`,
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(200)
    expect(response.json.context).toMatchObject({
      projectId: project.id,
      revision: 1,
      activeCanon: [{ claim: 'The pilot ends at the lighthouse.' }],
    })
    expect(response.text).not.toContain(projectPath)
  })

  it('binds the URL project identity inside the action lock before mutating memory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const expectedProject = {
      id: 'expected-action-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    const substitutedProject = {
      ...expectedProject,
      id: 'substituted-action-project',
    }
    await store.writeProject(expectedProject)
    await store.writeProject(substitutedProject)
    const expectedPath = await store.resolveProjectPackagePath(expectedProject.id)
    const substitutedPath = await store.resolveProjectPackagePath(substitutedProject.id)
    const backupPath = `${expectedPath}.before-swap`
    const candidate = await projectMemoryStore.publish(substitutedPath, {
      projectId: substitutedProject.id,
      dedupeKey: 'substituted-candidate',
      kind: 'canon',
      requestedStatus: 'candidate',
      claim: 'This substituted project must remain untouched.',
      source: {
        workflow: 'writeros',
        sourceId: 'substituted-source',
        sourceUri: 'writeros://substituted/source',
        sourceHash: 'substituted-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    })
    let swapped = false
    const swappingStore: ProjectMemoryStore = {
      ...projectMemoryStore,
      async applyAction(projectPath, action, expectedProjectId) {
        await rename(projectPath, backupPath)
        await rename(substitutedPath, projectPath)
        swapped = true
        return projectMemoryStore.applyAction(projectPath, action, expectedProjectId)
      },
    }
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store, undefined, swappingStore)

    const response = await postJson(
      port,
      `/api/projects/${expectedProject.id}/memory/actions`,
      { type: 'reject', recordId: candidate.record.id, expectedRevision: 1 },
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(swapped).toBe(true)
    expect(response.status).toBe(400)
    expect(response.json).toEqual({
      error: 'project-mismatch',
      message: 'Project memory request is invalid.',
    })
    expect(await projectMemoryStore.readSnapshot(expectedPath)).toMatchObject({
      projectId: substitutedProject.id,
      revision: 1,
      records: [{ id: candidate.record.id, status: 'candidate' }],
    })
    expect(await projectMemoryStore.readSnapshot(backupPath)).toMatchObject({
      projectId: expectedProject.id,
      revision: 0,
      records: [],
    })
    expect(response.text).not.toContain(root)
  })

  it('returns 409 for an action with a stale expected revision and leaves memory unchanged', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'stale-action-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const projectPath = await store.resolveProjectPackagePath(project.id)
    const publication = await projectMemoryStore.publish(projectPath, {
      projectId: project.id,
      dedupeKey: 'stale-candidate',
      kind: 'canon',
      requestedStatus: 'candidate',
      claim: 'A candidate awaiting the writer.',
      source: {
        workflow: 'writeros',
        sourceId: 'candidate-source',
        sourceUri: 'writeros://candidate/source',
        sourceHash: 'candidate-hash',
        capturedAt: '2026-08-02T12:00:00.000Z',
        approval: 'explicit',
      },
    })
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)

    const response = await postJson(
      port,
      `/api/project-memory/${project.id}/actions`,
      { type: 'reject', recordId: publication.record.id, expectedRevision: 0 },
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(409)
    expect(response.json).toEqual({
      error: 'revision-conflict',
      message: 'Project memory changed. Refresh and try again.',
    })
    expect((await projectMemoryStore.readSnapshot(projectPath)).revision).toBe(1)
    expect(response.text).not.toContain(projectPath)
  })

  it('fails analysis visibly when no analyzer is configured and never publishes the request body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'analysis-route-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const projectPath = await store.resolveProjectPackagePath(project.id)
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store)

    const response = await postJson(
      port,
      `/api/project-memory/${project.id}/analyze`,
      {
        surface: 'synopsis',
        content: 'This must not become canon merely because it was analyzed.',
      },
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(503)
    expect(response.json).toEqual({
      error: 'analysis-unavailable',
      message: 'Project memory analysis is unavailable.',
    })
    expect((await projectMemoryStore.readSnapshot(projectPath))).toMatchObject({
      revision: 0,
      records: [],
    })
  })

  it('rejects an invalid analyzer result instead of reporting analysis success', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'invalid-analysis-result-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const projectPath = await store.resolveProjectPackagePath(project.id)
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store, async () => undefined)

    const response = await postJson(
      port,
      `/api/projects/${project.id}/memory/analyze`,
      { surface: 'synopsis', content: 'Changed synopsis.' },
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(502)
    expect(response.json).toEqual({
      error: 'analysis-invalid',
      message: 'Project memory analysis returned an invalid result.',
    })
    expect(response.text).not.toContain(root)
    expect((await projectMemoryStore.readSnapshot(projectPath))).toMatchObject({ revision: 0, records: [] })
  })

  it('returns configured analysis proposals without silently publishing them', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const project = {
      id: 'configured-analysis-project',
      createdAt: Date.parse('2026-08-01T12:00:00.000Z'),
      updatedAt: Date.parse('2026-08-02T12:00:00.000Z'),
      state: defaultProjectState(),
    }
    await store.writeProject(project)
    const projectPath = await store.resolveProjectPackagePath(project.id)
    const inputs: any[] = []
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, store, async input => {
      inputs.push(input)
      return { records: [{ kind: 'development', claim: 'A proposal only.' }] }
    })
    const requestBody = { surface: 'synopsis', content: 'Changed synopsis.' }

    const response = await postJson(
      port,
      `/api/project-memory/${project.id}/analyze`,
      requestBody,
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      analysis: { records: [{ kind: 'development', claim: 'A proposal only.' }] },
      revision: 0,
    })
    expect(inputs).toEqual([{
      projectId: project.id,
      request: requestBody,
      snapshot: expect.objectContaining({ projectId: project.id, revision: 0 }),
    }])
    expect((await projectMemoryStore.readSnapshot(projectPath))).toMatchObject({ revision: 0, records: [] })
  })

  it('redacts filesystem paths from project resolution failures', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-memory-routes-'))
    temporaryRoots.push(root)
    const store = await createProjectLibraryStore(root)
    const failingStore: ProjectLibraryStore = {
      ...store,
      resolveProjectPackagePath: async () => {
        throw new ProjectLibraryStoreError(`Failed to read ${root}/Secret.writeros`, 500, 'read-failed')
      },
    }
    const port = await startMemoryApp({
      enabled: true,
      rootPath: root,
      label: 'Projects',
      sessionToken: 'route-session',
      allowedOrigins: new Set(['http://127.0.0.1:5177']),
    }, failingStore)

    const response = await requestJson(
      port,
      '/api/project-memory/safe-project-id/snapshot',
      { Origin: 'http://127.0.0.1:5177', 'X-WriterOS-Session': 'route-session' },
    )

    expect(response.status).toBe(500)
    expect(response.json).toEqual({
      error: 'project-memory-failed',
      message: 'WriterOS could not access project memory.',
    })
    expect(response.text).not.toContain(root)
  })
})

describe('project memory browser API adapter', () => {
  it('sends the per-session token on same-origin snapshot requests', async () => {
    const apiModulePath = '../../client/src/lib/projectMemoryApi.ts'
    const apiModule = await import(apiModulePath).catch(() => undefined)
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetchProjectMemory = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({
        snapshot: {
          schemaVersion: 1,
          projectId: 'browser-project',
          revision: 0,
          records: [],
          conflicts: [],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const api = apiModule?.createProjectMemoryApi('browser-session', fetchProjectMemory)
    const snapshot = await api?.snapshot('browser-project')

    expect(snapshot).toMatchObject({ projectId: 'browser-project', revision: 0 })
    expect(requests).toEqual([{
      input: '/api/projects/browser-project/memory/snapshot',
      init: {
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-WriterOS-Session': 'browser-session',
        },
      },
    }])
  })

  it('encodes a structured context query and returns the shared context package', async () => {
    const apiModulePath = '../../client/src/lib/projectMemoryApi.ts'
    const apiModule = await import(apiModulePath).catch(() => undefined)
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetchProjectMemory = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({
        context: {
          projectId: 'browser-project',
          revision: 2,
          activeCanon: [],
          relevant: [],
          conflicts: [],
          spoilerConflictIds: [],
          citationMap: {},
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const api = apiModule?.createProjectMemoryApi('browser-session', fetchProjectMemory)
    const context = await api?.context?.('browser-project', {
      message: 'pilot ending',
      surface: 'synopsis',
      currentEntities: ['Mara', 'The Light'],
    })

    expect(context).toMatchObject({ projectId: 'browser-project', revision: 2 })
    expect(requests[0]?.input).toBe(
      '/api/projects/browser-project/memory/context?query=pilot+ending&surface=synopsis&currentEntities=Mara&currentEntities=The+Light',
    )
    expect(requests[0]?.init).toMatchObject({
      credentials: 'same-origin',
      headers: { 'X-WriterOS-Session': 'browser-session' },
    })
  })

  it('posts revision-checked actions as JSON and returns the updated snapshot', async () => {
    const apiModulePath = '../../client/src/lib/projectMemoryApi.ts'
    const apiModule = await import(apiModulePath).catch(() => undefined)
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetchProjectMemory = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({
        snapshot: {
          schemaVersion: 1,
          projectId: 'browser-project',
          revision: 3,
          records: [],
          conflicts: [],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const action = { type: 'reject', recordId: 'candidate-1', expectedRevision: 2 } as const

    const api = apiModule?.createProjectMemoryApi('browser-session', fetchProjectMemory)
    const snapshot = await api?.action?.('browser-project', action)

    expect(snapshot).toMatchObject({ projectId: 'browser-project', revision: 3 })
    expect(requests).toEqual([{
      input: '/api/projects/browser-project/memory/actions',
      init: {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-WriterOS-Session': 'browser-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(action),
      },
    }])
  })

  it('posts analysis input without turning it into a publish request', async () => {
    const apiModulePath = '../../client/src/lib/projectMemoryApi.ts'
    const apiModule = await import(apiModulePath).catch(() => undefined)
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetchProjectMemory = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({ analysis: { records: [] }, revision: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const input = { surface: 'synopsis', content: 'A changed synopsis.' }

    const api = apiModule?.createProjectMemoryApi('browser-session', fetchProjectMemory)
    const analysis = await api?.analyze?.('browser-project', input)

    expect(analysis).toEqual({ records: [] })
    expect(requests[0]).toMatchObject({
      input: '/api/projects/browser-project/memory/analyze',
      init: {
        method: 'POST',
        body: JSON.stringify(input),
      },
    })
    expect(String(requests[0]?.input)).not.toContain('/publish')
  })

  it('rejects an invalid successful analysis response in the browser adapter', async () => {
    const apiModulePath = '../../client/src/lib/projectMemoryApi.ts'
    const apiModule = await import(apiModulePath).catch(() => undefined)
    const fetchProjectMemory = async () => new Response(JSON.stringify({
      analysis: undefined,
      revision: 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const api = apiModule?.createProjectMemoryApi('browser-session', fetchProjectMemory)

    const failure = await api?.analyze?.('browser-project', {
      surface: 'synopsis',
      content: 'A changed synopsis.',
    }).then(() => undefined, (error: unknown) => error)

    expect(failure).toBeInstanceOf(apiModule?.ProjectMemoryApiError)
    expect(failure).toMatchObject({
      statusCode: 200,
      code: 'invalid-response',
      message: 'WriterOS project memory returned an invalid response.',
    })
  })

  it('preserves stale-revision status and code for browser conflict handling', async () => {
    const apiModulePath = '../../client/src/lib/projectMemoryApi.ts'
    const apiModule = await import(apiModulePath).catch(() => undefined)
    const fetchProjectMemory = async () => new Response(JSON.stringify({
      error: 'revision-conflict',
      message: 'Project memory changed. Refresh and try again.',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    const api = apiModule?.createProjectMemoryApi('browser-session', fetchProjectMemory)

    const failure = await api?.action?.('browser-project', {
      type: 'reject',
      recordId: 'candidate-1',
      expectedRevision: 1,
    }).then(() => undefined, (error: unknown) => error)

    expect(failure).toBeInstanceOf(apiModule?.ProjectMemoryApiError)
    expect(failure).toMatchObject({
      statusCode: 409,
      code: 'revision-conflict',
      message: 'Project memory changed. Refresh and try again.',
    })
  })
})
