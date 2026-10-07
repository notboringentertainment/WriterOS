// @vitest-environment node
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerRoutes } from '../../../server/routes'
import { createMorganHost } from '../../../server/morganHost/morganRoutes'
import { ownedFile, processInfo } from '../../../server/morganHost/ownership'
import { createProjectLibraryStore } from '../../../server/projectLibrary/store'
import type { MorganSessions } from '../../../server/morganHost/morganSession'
import { writerosRoot } from '../../../server/morganHost/repoRoot'
import { fileURLToPath, pathToFileURL } from 'node:url'

const servers: Server[] = []
const hosts: MorganSessions[] = []
const children: ChildProcess[] = []
const dirs: string[] = []
const temp = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'mw-')); dirs.push(dir); return dir }
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(h => h.shutdown()))
  for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise<void>(r => s.close(() => r())) }
  for (const c of children.splice(0)) {
    const exited = new Promise<void>(r => { if (c.exitCode !== null || c.signalCode !== null) r(); else c.once('exit', () => r()) })
    try { process.kill(-c.pid!, 'SIGKILL') } catch {}
    await exited
  }
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const child = () => { const c = spawn('/bin/sleep', ['60'], { detached: true, stdio: 'ignore' }); children.push(c); return c }

async function statusOf(flag: string | undefined) {
  vi.stubEnv('WRITEROS_MORGAN_HOST', flag)
  vi.stubEnv('WRITEROS_PROJECTS_ROOT', temp())
  vi.stubEnv('PORT', '51997')
  const home = temp(); vi.spyOn(os, 'homedir').mockReturnValue(home)
  const app = express()
  const { server, morganHost } = await registerRoutes(app)
  servers.push(server); if (morganHost) hosts.push(morganHost.sessions)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  const status = (await fetch(base + '/api/morgan/p1/session', { method: 'POST' })).status
  const bootstrap = await (await fetch(base + '/api/project-library/bootstrap', { headers: { Origin: 'http://127.0.0.1:51997' } })).json()
  return { status, hasHost: morganHost !== null, capability: bootstrap.morganHost }
}

describe('production Morgan wiring', () => {
  it('flag off registers no Morgan routes and reports false', async () => {
    expect(await statusOf(undefined)).toEqual({ status: 404, hasHost: false, capability: false })
  })
  it('flag on registers guarded routes and reports true without starting Claude', async () => {
    expect(await statusOf('1')).toEqual({ status: 403, hasHost: true, capability: true })
  })
  it('boot stops a recorded live pid and ignores reused and unrecorded pids', async () => {
    const home = temp(); vi.spyOn(os, 'homedir').mockReturnValue(home)
    const root = temp(); const port = '51996'; const runDir = path.join(home, '.writeros', 'run', port)
    const recorded = child(); const reused = child(); const other = child()
    const ri = (await processInfo(recorded.pid!))!; const pi = (await processInfo(reused.pid!))!
    const registry = ownedFile(runDir)
    await registry.add([ri, { ...pi, started: 'different start' }])
    const store = await createProjectLibraryStore(root)
    const host = createMorganHost({ enabled: true, rootPath: root, label: 'Projects', allowedOrigins: new Set(), sessionToken: 'token' }, store, { PORT: port, PATH: '/usr/bin:/bin' })
    hosts.push(host.sessions)
    await expect(host.sessions.start('missing')).rejects.toMatchObject({ code: 'not-found' })
    expect(alive(recorded.pid!)).toBe(false)
    expect(alive(reused.pid!)).toBe(true)
    expect(alive(other.pid!)).toBe(true)
    expect(await registry.all()).toEqual([])
    await registry.add([(await processInfo(other.pid!))!])
    host.killAllNow()
    await new Promise(r => setTimeout(r, 150))
    expect(alive(other.pid!)).toBe(false)
    expect(alive(reused.pid!)).toBe(true)
  })
  it('finds the repository from source and bundled server locations', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
    expect(writerosRoot()).toBe(root)
    expect(writerosRoot(pathToFileURL(path.join(root, 'dist', 'index.js')).href)).toBe(root)
    expect(() => writerosRoot(pathToFileURL('/missing/index.js').href)).toThrow(/not found/)
  })
})
