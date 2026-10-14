// @vitest-environment node
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { fileSessionStore } from '../../../server/morganHost/sessionStore'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
it('remembers ids across reloads, serializes writes, and clears one project only', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-')); dirs.push(dir)
  const store = fileSessionStore(dir)
  expect(await store.get('missing')).toBeNull()
  await Promise.all([store.set('p1', 's1'), store.set('p2', 's2')])
  const reloaded = fileSessionStore(dir)
  expect(await reloaded.get('p1')).toBe('s1')
  expect(await reloaded.get('p2')).toBe('s2')
  expect(statSync(path.join(dir, 'sessions.json')).mode & 0o777).toBe(0o600)
  await reloaded.clear('p1')
  expect(await store.get('p1')).toBeNull()
  expect(await store.get('p2')).toBe('s2')
})
