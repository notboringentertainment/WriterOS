// tests/server/morganHost/morganRoutes.test.ts
// @vitest-environment node
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { morganHostEnabled, registerMorganRoutes } from '../../../server/morganHost/morganRoutes'
import type { ProjectLibraryConfig } from '../../../server/projectLibrary/config'

const TOKEN = 't'.repeat(64)

function stubSessions() {
  const listeners: ((e: unknown) => void)[] = []
  return {
    start: vi.fn(async (id: string) => { if (id === 'missing') throw Object.assign(new Error('No such project.'), { code: 'not-found' }); return { sessionId: 's1', existing: false } }),
    subscribe: vi.fn((_id: string, l: (e: unknown) => void) => { listeners.push(l); l({ type: 'hello', hello: { epoch: 'e1' } }); return () => {} }),
    submit: vi.fn(() => 'c1'),
    stop: vi.fn(),
    end: vi.fn(async () => {}),
    has: vi.fn(() => true),
    canStream: vi.fn(() => true),
    answerApproval: vi.fn((_p: string, id: string) => id === 'r1'),
    answerProposal: vi.fn((_p: string, id: string) => id === 'p1'),
    emit: (e: unknown) => listeners.forEach(l => l(e)),
  }
}

let server: Server | null = null
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(r => server!.close(() => r())) }; server = null })

async function boot(sessions = stubSessions()) {
  const app = express()
  app.use(express.json())
  server = app.listen(0, '127.0.0.1')
  await new Promise(r => server!.once('listening', r))
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  const config: ProjectLibraryConfig = {
    // Fill every required field from server/projectLibrary/config.ts; these three matter here.
    sessionToken: TOKEN,
    rootPath: '/projects', enabled: true, label: 'Projects',
    allowedOrigins: new Set([base]),
  }
  registerMorganRoutes(app, config, sessions as never)
  return { base, sessions }
}
const headers = (base: string) => ({ 'content-type': 'application/json', origin: base, 'x-writeros-session': TOKEN })

describe('morgan routes', () => {
  it('refuses requests without the session token', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: { origin: base } })).status).toBe(401)
  })

  it('refuses requests from another origin', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: { ...headers(base), origin: 'http://evil.test' } })).status).toBe(403)
  })

  it('refuses a malformed project id', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/${encodeURIComponent('../x')}/session`, { method: 'POST', headers: headers(base) })).status).toBe(400)
  })

  it('starts a session', async () => {
    const { base, sessions } = await boot()
    const r = await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: headers(base) })
    expect(await r.json()).toEqual({ sessionId: 's1', existing: false })
    expect(sessions.start).toHaveBeenCalledWith('p1', { fresh: false })
  })

  it('starts a new conversation on request', async () => {
    const { base, sessions } = await boot()
    await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: headers(base), body: JSON.stringify({ fresh: true }) })
    expect(sessions.start).toHaveBeenCalledWith('p1', { fresh: true })
  })

  it('submits with the page Ben is on', async () => {
    const { base, sessions } = await boot()
    await fetch(`${base}/api/morgan/p1/submit`, { method: 'POST', headers: headers(base), body: JSON.stringify({ text: 'tighten this', context: { surface: 'Outline' } }) })
    expect(sessions.submit).toHaveBeenCalledWith('p1', '[WriterOS: Ben is on the Outline page]\ntighten this')
  })

  it('answers an approval card, and 404s one that is no longer open', async () => {
    const { base, sessions } = await boot()
    const ok = await fetch(`${base}/api/morgan/p1/approval/r1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ allow: true }) })
    expect(ok.status).toBe(204)
    expect(sessions.answerApproval).toHaveBeenCalledWith('p1', 'r1', { allow: true })
    const gone = await fetch(`${base}/api/morgan/p1/approval/r9`, { method: 'POST', headers: headers(base), body: JSON.stringify({ allow: true }) })
    expect(gone.status).toBe(404)
    const bad = await fetch(`${base}/api/morgan/p1/approval/r1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ allow: 'yes' }) })
    expect(bad.status).toBe(400)
  })

  it('answers a page proposal', async () => {
    const { base, sessions } = await boot()
    const ok = await fetch(`${base}/api/morgan/p1/proposal/p1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ outcome: 'kept' }) })
    expect(ok.status).toBe(204)
    expect(sessions.answerProposal).toHaveBeenCalledWith('p1', 'p1', { outcome: 'kept' })
    const bad = await fetch(`${base}/api/morgan/p1/proposal/p1`, { method: 'POST', headers: headers(base), body: JSON.stringify({ outcome: 'invalid' }) })
    expect(bad.status).toBe(400) // only the page's own outcomes come from the browser
  })

  it('reports an unknown project as 404', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/api/morgan/missing/session`, { method: 'POST', headers: headers(base) })).status).toBe(404)
  })

  it('reports preflight failure as 503 with the plain message', async () => {
    const sessions = stubSessions()
    sessions.start.mockRejectedValueOnce(Object.assign(new Error('Morgan needs Claude Code 2.1.290 or newer.'), { code: 'claude-unavailable' }))
    const { base } = await boot(sessions)
    const r = await fetch(`${base}/api/morgan/p1/session`, { method: 'POST', headers: headers(base) })
    expect(r.status).toBe(503)
    expect((await r.json()).message).toMatch(/2\.1\.290/)
  })

  it('submits text and refuses empty text', async () => {
    const { base, sessions } = await boot()
    const ok = await fetch(`${base}/api/morgan/p1/submit`, { method: 'POST', headers: headers(base), body: JSON.stringify({ text: 'hello' }) })
    expect(await ok.json()).toEqual({ composerId: 'c1' })
    expect(sessions.submit).toHaveBeenCalledWith('p1', 'hello')
    const bad = await fetch(`${base}/api/morgan/p1/submit`, { method: 'POST', headers: headers(base), body: JSON.stringify({ text: '' }) })
    expect(bad.status).toBe(400)
  })

  it('streams events with the session header, and refuses without it', async () => {
    const { base, sessions } = await boot()
    expect((await fetch(`${base}/api/morgan/p1/stream`, { headers: { origin: base } })).status).toBe(401)
    const ctrl = new AbortController()
    const r = await fetch(`${base}/api/morgan/p1/stream`, { headers: headers(base), signal: ctrl.signal })
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/)
    const reader = r.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"hello"')
    sessions.emit({ type: 'lost', epoch: 'e1', reason: 'silence' })
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"reason":"silence"')
    sessions.emit({ type: 'ended', reason: 'stopped', code: 0 })
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"ended"')
    expect((await reader.read()).done).toBe(true) // the server closes the stream after `ended`
    ctrl.abort()
  })

  it('ends a session after the process is gone', async () => {
    const { base, sessions } = await boot()
    const r = await fetch(`${base}/api/morgan/p1/session`, { method: 'DELETE', headers: headers(base) })
    expect(r.status).toBe(204)
    expect(sessions.end).toHaveBeenCalledWith('p1')
  })
})

describe('morganHostEnabled', () => {
  it('is on only for 1', () => {
    expect(morganHostEnabled({ WRITEROS_MORGAN_HOST: '1' })).toBe(true)
    expect(morganHostEnabled({ WRITEROS_MORGAN_HOST: 'true' })).toBe(false)
    expect(morganHostEnabled({})).toBe(false)
  })
})

