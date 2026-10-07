// tests/server/morganHost/ptyProcess.test.ts
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { groupAlive, spawnWithPty } from '../../../server/morganHost/ptyProcess'

const children: ReturnType<typeof spawnWithPty>[] = []
afterEach(async () => { await Promise.all(children.splice(0).map(c => c.terminate(100))) })
const start: typeof spawnWithPty = (...args) => { const c = spawnWithPty(...args); children.push(c); return c }
const env = { PATH: '/usr/bin:/bin' }
const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('spawnWithPty', () => {
  it('reports the exit code', async () => {
    const child = start('/bin/sh', ['-c', 'exit 3'], { cwd: '/', env })
    expect(await new Promise<number | null>(r => child.onExit(r))).toBe(3)
  })

  it('kills a descendant that ignores SIGTERM after the leader has already exited', async () => {
    const child = start('/bin/sh', ['-c', '(trap "" TERM; exec sleep 60) & trap "exit 0" TERM; wait'], { cwd: '/', env })
    await settle(300)
    expect(await child.terminate(200)).toBe(true)
    expect(groupAlive(child.pid)).toBe(false)
  })

  it('kills a whole group that ignores SIGTERM', async () => {
    const child = start('/bin/sh', ['-c', 'trap "" TERM; sleep 60 & wait'], { cwd: '/', env })
    await settle(300)
    expect(await child.terminate(200)).toBe(true)
    expect(groupAlive(child.pid)).toBe(false)
  })

  it('terminate() after a natural exit still clears leftover descendants', async () => {
    const child = start('/bin/sh', ['-c', '(trap "" TERM; exec sleep 60) & exit 0'], { cwd: '/', env })
    await new Promise(r => child.onExit(r))
    expect(await child.terminate(200)).toBe(true)
    expect(groupAlive(child.pid)).toBe(false)
  })
})

