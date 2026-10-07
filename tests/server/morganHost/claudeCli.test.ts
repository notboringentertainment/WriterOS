import { describe, expect, it } from 'vitest'
import { compareVersions, findClaude, MIN_MORGAN_VERSION, preflight, realDeps, type PreflightDeps } from '../../../server/morganHost/claudeCli'

function deps(over: Partial<PreflightDeps> & { version?: string; loggedIn?: boolean; authMethod?: string; found?: boolean } = {}): PreflightDeps {
  return {
    home: '/home/t', savedPath: null, env: { HOME: '/home/t', PATH: '/usr/bin' },
    isolationArgs: ['--restricted', '--strict-mcp-config'],
    exists: p => over.found !== false && p === '/home/t/.local/bin/claude',
    exec: async (_file, args) => args[0] === '--version' ? `${over.version ?? MIN_MORGAN_VERSION} (Claude Code)` : JSON.stringify({ loggedIn: over.loggedIn ?? true, authMethod: over.authMethod ?? 'claude.ai' }),
    ...over,
  }
}

describe('Claude Code preflight', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('2.1.290', '2.1.290')).toBe(0)
    expect(compareVersions('2.1.289', '2.1.290')).toBeLessThan(0)
    expect(compareVersions('2.2.0', '2.1.999')).toBeGreaterThan(0)
  })
  it('accepts the minimum version and Claude account', async () => {
    expect(await preflight(deps())).toEqual({ ok: true, path: '/home/t/.local/bin/claude', version: '2.1.290' })
  })
  it('reports a missing binary', async () => {
    expect(await preflight(deps({ found: false }))).toMatchObject({ ok: false, reason: 'not-found' })
  })
  it('stops before auth when too old', async () => {
    const d = deps({ version: '2.1.289' })
    const calls: string[][] = []
    const exec = d.exec
    d.exec = async (file, args, env) => { calls.push(args); return exec(file, args, env) }
    expect(await preflight(d)).toEqual({ ok: false, reason: 'old-version', message: 'Morgan needs Claude Code 2.1.290 or newer. Update Claude Code, then click Start Morgan again.' })
    expect(calls).toEqual([['--version']])
  })
  it('requires login', async () => {
    expect(await preflight(deps({ loggedIn: false }))).toMatchObject({ ok: false, reason: 'not-logged-in' })
  })
  it('rejects API keys and unknown auth methods', async () => {
    for (const authMethod of ['api_key', 'unknown', '']) {
      expect(await preflight(deps({ authMethod }))).toEqual({ ok: false, reason: 'api-key-login', message: 'Morgan uses your Claude account, but Claude Code is logged in with an API key. Run `claude /login` in Terminal and choose your Claude account.' })
    }
  })
  it('uses the same environment and isolation for auth', async () => {
    const d = deps()
    const calls: { file: string; args: string[]; env: Record<string, string> }[] = []
    const exec = d.exec
    d.exec = async (file, args, env) => { calls.push({ file, args, env }); return exec(file, args, env) }
    await preflight(d)
    expect(calls).toEqual([
      { file: '/home/t/.local/bin/claude', args: ['--version'], env: d.env },
      { file: '/home/t/.local/bin/claude', args: ['--restricted', '--strict-mcp-config', 'auth', 'status', '--json'], env: d.env },
    ])
  })
  it('prefers a saved binary, then known installation paths', () => {
    expect(findClaude(deps({ savedPath: '/custom/claude', exists: () => true }))).toBe('/custom/claude')
    expect(findClaude(deps({ exists: p => p === '/opt/homebrew/bin/claude' }))).toBe('/opt/homebrew/bin/claude')
    expect(findClaude(deps({ exists: p => p === '/usr/local/bin/claude' }))).toBe('/usr/local/bin/claude')
  })
  it('handles failed or malformed version and auth output without disclosing credentials', async () => {
    expect(await preflight(deps({ exec: async () => 'bad' }))).toMatchObject({ reason: 'not-found' })
    expect(await preflight(deps({ exec: async () => { throw new Error('secret') } }))).toMatchObject({ reason: 'not-found', message: 'Claude Code failed to start. Check its installation, then click Start Morgan again.' })
    expect(await preflight(deps({ exec: async (_f, a) => a[0] === '--version' ? '2.1.292' : 'bad' }))).toMatchObject({ reason: 'not-logged-in' })
  })
  it('real execution respects cancellation and the explicit environment', async () => {
    const env = { PATH: '/usr/bin', MORGAN_TEST: 'value' }
    const d = realDeps(env, ['--restricted'])
    expect(await d.exec(process.execPath, ['-e', 'process.stdout.write(process.env.MORGAN_TEST)'], env)).toBe('value')
    const controller = new AbortController()
    controller.abort()
    await expect(realDeps(env, [], controller.signal).exec(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], env)).rejects.toThrow()
  })
})
