// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { descendantsOf, processInfo, stopProcesses, ownedFile, killOwnedNow } from '../../../server/morganHost/ownership'

const children: ChildProcess[] = []
const dirs: string[] = []
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const start = (command = 'exec sleep 60') => {
  const c = spawn('/bin/sh', ['-c', command], { detached: true, stdio: 'ignore' })
  children.push(c)
  return c
}
afterEach(async () => {
  for (const c of children.splice(0)) {
    const exited = new Promise<void>(r => { if (c.exitCode !== null || c.signalCode !== null) r(); else c.once('exit', () => r()) })
    try { process.kill(-c.pid!, 'SIGKILL') } catch {}
    await exited
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('process ownership', () => {
  it('stops a recorded live process and leaves an unrecorded process alone', async () => {
    const c = start('trap "" TERM; exec sleep 60')
    const other = start()
    await new Promise(r => setTimeout(r, 100))
    const info = (await processInfo(c.pid!))!
    expect(info.started).toBeTruthy()
    expect(await stopProcesses([info], 100)).toEqual([])
    expect(alive(c.pid!)).toBe(false)
    expect(alive(other.pid!)).toBe(true)
  })
  it('leaves a reused pid alone and never signals an unverified group leader', async () => {
    const c = start('sleep 60 & sleep 60; while :; do sleep 1; done')
    await new Promise(r => setTimeout(r, 100))
    const info = (await processInfo(c.pid!))!
    expect(await stopProcesses([{ ...info, started: 'different' }], 50)).toEqual([])
    const kids = await descendantsOf(c.pid!)
    expect(kids.length).toBeGreaterThan(0)
    await stopProcesses(kids, 50)
    expect(alive(c.pid!)).toBe(true)
  })
  it('serializes registry writes and forced stop verifies start times', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mo-')); dirs.push(dir)
    const a = start(); const b = start()
    const ai = (await processInfo(a.pid!))!; const bi = (await processInfo(b.pid!))!
    const registry = ownedFile(dir)
    await Promise.all([registry.add([ai]), registry.add([{ ...bi, started: 'different' }])])
    expect(await registry.all()).toHaveLength(2)
    killOwnedNow(dir)
    await new Promise(r => setTimeout(r, 150))
    expect(alive(a.pid!)).toBe(false)
    expect(alive(b.pid!)).toBe(true)
  })
})
