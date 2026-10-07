// server/morganHost/ptyProcess.ts
// node-pty starts the child as the leader of a new session, so its pid is also its process-group id
// and signalling -pid reaches every descendant, even after the leader itself has exited.
import pty from 'node-pty' // use the import form recorded in Task 0 Step 10

export interface ChildProcessLike {
  pid: number
  write(data: string): void
  onData(cb: (data: string) => void): void
  onExit(cb: (code: number | null) => void): void
  terminate(graceMs?: number): Promise<boolean>
}
export type SpawnChild = (file: string, args: string[], opts: { cwd: string; env: Record<string, string> }) => ChildProcessLike

export function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

function signalGroup(pgid: number, sig: NodeJS.Signals): void {
  try { process.kill(-pgid, sig) } catch { /* group gone */ }
}

const GIVE_UP_AFTER_KILL_MS = 2000

export const spawnWithPty: SpawnChild = (file, args, opts) => {
  const p = pty.spawn(file, args, { name: 'xterm-256color', cols: 120, rows: 36, cwd: opts.cwd, env: opts.env })
  let exited = false
  let exitCode: number | null = null
  const exitCallbacks: ((code: number | null) => void)[] = []
  p.onData(() => {}) // Stage 1 has no raw view; output is drained so the child never blocks on a full buffer.
  p.onExit(({ exitCode: code }) => {
    exited = true
    exitCode = code ?? null
    for (const cb of exitCallbacks) cb(code ?? null)
  })
  let terminating: Promise<boolean> | null = null
  return {
    pid: p.pid,
    write: data => p.write(data),
    onData: cb => { p.onData(cb) },
    onExit: cb => { if (exited) queueMicrotask(() => cb(exitCode)); else exitCallbacks.push(cb) },
    terminate: (graceMs = 3000) => {
      terminating ??= new Promise<boolean>(resolve => {
        const started = Date.now()
        let killed = false
        signalGroup(p.pid, 'SIGTERM')
        const tick = () => {
          if (exited && !groupAlive(p.pid)) return resolve(true)
          const elapsed = Date.now() - started
          if (!killed && elapsed >= graceMs) { killed = true; signalGroup(p.pid, 'SIGKILL') }
          if (killed && elapsed >= graceMs + GIVE_UP_AFTER_KILL_MS) {
            terminating = null // a later call may try again
            return resolve(!groupAlive(p.pid))
          }
          setTimeout(tick, 50)
        }
        tick()
      })
      return terminating
    },
  }
}

