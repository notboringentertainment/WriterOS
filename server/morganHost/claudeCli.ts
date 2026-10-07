// Finds Claude Code and checks its version and Claude-account login without blocking the server.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const MIN_MORGAN_VERSION = '2.1.290'

export type Preflight =
  | { ok: true; path: string; version: string }
  | { ok: false; reason: 'not-found' | 'old-version' | 'not-logged-in' | 'api-key-login'; message: string }

export interface PreflightDeps {
  exec(file: string, args: string[], env: Record<string, string>, signal?: AbortSignal): Promise<string>
  exists(p: string): boolean
  home: string
  savedPath: string | null
  env: Record<string, string>
  isolationArgs: string[]
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function findClaude(deps: PreflightDeps): string | null {
  const candidates = [
    deps.savedPath,
    join(deps.home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ].filter((p): p is string => !!p)
  return candidates.find(p => deps.exists(p)) ?? null
}

export async function preflight(deps: PreflightDeps): Promise<Preflight> {
  const path = findClaude(deps)
  if (!path) return { ok: false, reason: 'not-found', message: 'Claude Code not found. Install it, then reopen WriterOS.' }
  let version: string
  try {
    const out = await deps.exec(path, ['--version'], deps.env)
    const match = out.match(/(\d+\.\d+\.\d+)/)
    if (!match) throw new Error('Unparseable version')
    version = match[1]
  } catch {
    return { ok: false, reason: 'not-found', message: 'Claude Code failed to start. Check its installation, then click Start Morgan again.' }
  }
  if (compareVersions(version, MIN_MORGAN_VERSION) < 0) {
    return { ok: false, reason: 'old-version', message: 'Morgan needs Claude Code 2.1.290 or newer. Update Claude Code, then click Start Morgan again.' }
  }
  try {
    const status = JSON.parse(await deps.exec(path, [...deps.isolationArgs, 'auth', 'status', '--json'], deps.env))
    if (!status.loggedIn) throw new Error('Not logged in')
    if (status.authMethod !== 'claude.ai') {
      return { ok: false, reason: 'api-key-login', message: 'Morgan uses your Claude account, but Claude Code is logged in with an API key. Run `claude /login` in Terminal and choose your Claude account.' }
    }
  } catch {
    return { ok: false, reason: 'not-logged-in', message: 'Not logged in. Run `claude /login` in Terminal to log in, then click Start Morgan again.' }
  }
  return { ok: true, path, version }
}

const execFileAsync = promisify(execFile)

export function realDeps(env: Record<string, string>, isolationArgs: string[], signal?: AbortSignal): PreflightDeps {
  return {
    exec: async (file, args, childEnv, callSignal) => {
      const { stdout } = await execFileAsync(file, args, { encoding: 'utf8', timeout: 5000, env: childEnv, signal: callSignal ?? signal })
      return stdout
    },
    exists: existsSync,
    home: homedir(),
    savedPath: null,
    env,
    isolationArgs,
  }
}
