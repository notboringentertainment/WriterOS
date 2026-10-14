// server/morganHost/sessionStore.ts
// Remembers each project's Claude Code session id so Morgan can pick up the conversation next time.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface SessionStore {
  get(projectId: string): Promise<string | null>
  set(projectId: string, sessionId: string): Promise<void>
  clear(projectId: string): Promise<void>
}

export function fileSessionStore(dir: string): SessionStore {
  const file = path.join(dir, 'sessions.json')
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next } // one read-modify-write at a time
  const read = async (): Promise<Record<string, string>> => { try { return JSON.parse(await readFile(file, 'utf8')) } catch { return {} } }
  const write = async (all: Record<string, string>) => {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(all), { mode: 0o600 })
    await rename(tmp, file)
  }
  return {
    get: async id => (await read())[id] ?? null,
    set: (id, sid) => serial(async () => { const all = await read(); all[id] = sid; await write(all) }),
    clear: id => serial(async () => { const all = await read(); delete all[id]; await write(all) }),
  }
}

