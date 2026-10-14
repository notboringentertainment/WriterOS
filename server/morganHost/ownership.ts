// Ownership is a parent-link snapshot plus a persisted pid/start-time registry.
import { execFile, execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
export interface ProcInfo { pid: number; ppid: number; pgid: number; started: string }
export type OwnedProcess = Pick<ProcInfo, 'pid' | 'pgid' | 'started'>
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
function parseTable(stdout: string): ProcInfo[] {
  return stdout.split('\n').map(l => l.trim().split(/\s+/)).filter(r => r.length === 8)
    .map(r => ({ pid: Number(r[0]), ppid: Number(r[1]), pgid: Number(r[2]), started: r.slice(3).join(' ') }))
    .filter(p => Number.isInteger(p.pid) && p.pid > 0 && p.pid !== process.pid)
}
async function table(): Promise<ProcInfo[]> {
  const { stdout } = await run('ps', ['-U', String(process.getuid?.() ?? ''), '-o', 'pid=,ppid=,pgid=,lstart='], { maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } })
  return parseTable(stdout)
}
export async function processInfo(pid: number): Promise<ProcInfo | null> {
  return (await table()).find(p => p.pid === pid) ?? null
}
export async function descendantsOf(pid: number): Promise<ProcInfo[]> {
  const procs = await table()
  const out: ProcInfo[] = []
  const seen = new Set([pid])
  const frontier = [pid]
  while (frontier.length) {
    const parent = frontier.pop()!
    for (const p of procs) if (p.ppid === parent && !seen.has(p.pid)) {
      seen.add(p.pid); out.push(p); frontier.push(p.pid)
    }
  }
  return out
}
async function verified(list: OwnedProcess[]): Promise<ProcInfo[]> {
  const current = await table()
  return current.filter(p => list.some(o => o.pid === p.pid && o.started === p.started))
}
export async function stopProcesses(list: OwnedProcess[], graceMs = 1000): Promise<number[]> {
  if (!list.length) return []
  const signal = async (sig: NodeJS.Signals) => {
    for (const p of await verified(list)) {
      if (p.pid === p.pgid && list.some(o => o.pid === p.pid && o.pgid === p.pgid && o.started === p.started)) {
        try { process.kill(-p.pgid, sig) } catch { /* gone */ }
      }
      try { process.kill(p.pid, sig) } catch { /* gone */ }
    }
  }
  await signal('SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && (await verified(list)).length) await pause(50)
  if ((await verified(list)).length) {
    await signal('SIGKILL')
    const killDeadline = Date.now() + 2000
    while (Date.now() < killDeadline && (await verified(list)).length) await pause(50)
  }
  return (await verified(list)).map(p => p.pid)
}

export interface OwnedRegistry {
  all(): Promise<OwnedProcess[]>
  add(list: OwnedProcess[]): Promise<void>
  remove(list: OwnedProcess[]): Promise<void>
}
export function ownedFile(dir: string): OwnedRegistry {
  const file = path.join(dir, 'owned.json')
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next }
  const read = async (): Promise<OwnedProcess[]> => {
    try { return JSON.parse(await readFile(file, 'utf8')) }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
  }
  const write = async (list: OwnedProcess[]) => {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const tmp = file + '.' + process.pid + '.tmp'
    await writeFile(tmp, JSON.stringify(list.map(({ pid, pgid, started }) => ({ pid, pgid, started }))), { mode: 0o600 })
    await rename(tmp, file)
  }
  const same = (a: OwnedProcess, b: OwnedProcess) => a.pid === b.pid && a.started === b.started
  return {
    all: () => serial(read),
    add: list => serial(async () => { const all = await read(); for (const p of list) { const i = all.findIndex(o => o.pid === p.pid); if (i >= 0) all[i] = p; else all.push(p) }; await write(all) }),
    remove: list => serial(async () => write((await read()).filter(p => !list.some(o => same(p, o))))),
  }
}
export function killOwnedNow(dir: string): void {
  try {
    const list: OwnedProcess[] = JSON.parse(readFileSync(path.join(dir, 'owned.json'), 'utf8'))
    const pids = list.filter(p => Number.isInteger(p.pid) && p.pid > 0 && p.pid !== process.pid).map(p => p.pid)
    if (!pids.length) return
    const stdout = execFileSync('ps', ['-o', 'pid=,lstart=', '-p', pids.join(',')], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
    for (const line of stdout.split('\n')) {
      const fields = line.trim().split(/\s+/)
      const pid = Number(fields[0]); const started = fields.slice(1).join(' ')
      if (list.some(p => p.pid === pid && p.started === started)) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[morgan] forced cleanup failed', error) }
}
