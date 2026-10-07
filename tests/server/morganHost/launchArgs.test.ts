// tests/server/morganHost/launchArgs.test.ts
import { describe, expect, it } from 'vitest'
import { buildMorganLaunch, defaultReadRoots, morganEnv, morganModel, PROPOSE_TOOL, readRootsFor } from '../../../server/morganHost/launchArgs'

const host = {
  writerosRoot: '/src/WriterOS',
  modDir: '/src/WriterOS/mod/writeros-morgan',
  personaFile: '/src/WriterOS/server/morganHost/persona.md',
  readRoots: ['/home/b/Projects', '/home/b/.claude/projects'],
}
const base = {
  project: { packagePath: '/projects/Test Project.writeros', storyDriveRoot: '/icloud/Test Project' },
  host,
  model: 'claude-sonnet-5-5',
  session: { kind: 'new' as const, id: '00000000-0000-4000-8000-000000000001' },
  socketPath: '/run/m.sock',
  token: 'a'.repeat(64),
  parentEnv: {
    HOME: '/home/b', USER: 'b', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', PATH: '/usr/bin',
    CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli',
    ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_AUTH_TOKEN: 't',
    OPENAI_API_KEY: 'o', NODE_ENV: 'production', PORT: '5177',
  },
  loginPath: '/opt/homebrew/bin:/usr/bin',
  isolationArgs: ['--restricted', '--strict-mcp-config'],
  permissionMode: 'manual',
}
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]
const all = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))

describe('buildMorganLaunch', () => {
  it('works in the Story-drive folder and reads every root', () => {
    const l = buildMorganLaunch(base)
    expect(l.cwd).toBe('/icloud/Test Project')
    const roots = ['/projects/Test Project.writeros', '/src/WriterOS', '/home/b/Projects', '/home/b/.claude/projects']
    expect(all(l.args, '--add-dir')).toEqual(roots)
    expect(l.settings.permissions.additionalDirectories).toEqual(roots)
    expect(l.settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true)
    for (const dir of ['/icloud/Test Project', ...roots]) expect(l.settings.permissions.allow).toContain(`Read(/${dir}/**)`)
  })

  it('falls back to the package folder when no Story-drive folder is linked', () => {
    const l = buildMorganLaunch({ ...base, project: { ...base.project, storyDriveRoot: null } })
    expect(l.cwd).toBe('/projects/Test Project.writeros')
    expect(all(l.args, '--add-dir')).not.toContain('/projects/Test Project.writeros')
  })

  it('has the full tool set and asks before changes', () => {
    const { args, settings } = buildMorganLaunch(base)
    expect(after(args, '--tools')).toBe('Read,Grep,Glob,Bash,Edit,Write,TodoWrite,WebSearch,WebFetch,Agent')
    expect(after(args, '--permission-mode')).toBe('manual')
    expect(settings.permissions.defaultMode).toBe('manual')
    for (const t of ['Grep', 'Glob', 'TodoWrite', 'WebSearch', 'Agent', PROPOSE_TOOL]) expect(settings.permissions.allow).toContain(t)
    for (const t of ['Edit', 'Write', 'Bash', 'WebFetch']) expect(settings.permissions.allow).not.toContain(t) // these ask
  })

  it('keeps the casting firewall, the open pages and the dialog it cannot show', () => {
    const { settings } = buildMorganLaunch(base)
    expect(settings.permissions.deny).toEqual(expect.arrayContaining([
      'Read(//**/casting-inspiration/**)',
      'Edit(//projects/Test Project.writeros/documents/**)',
      'Write(//projects/Test Project.writeros/documents/**)',
      'Edit(//projects/Test Project.writeros/script/**)',
      'Write(//projects/Test Project.writeros/script/**)',
      'AskUserQuestion',
    ]))
    expect(settings.permissions.deny).not.toContain('Edit(//projects/Test Project.writeros/**)') // canon imports write memory files
  })

  it('runs Bash in the sandbox so the same rules hold for commands', () => {
    expect(buildMorganLaunch(base).settings.sandbox).toEqual({ enabled: true, autoAllowBashIfSandboxed: false, network: { allowLocalBinding: true } }) // local binding lets the memory import run; without the second key, sandboxed writes run without asking
  })

  it('starts a new conversation or resumes one', () => {
    expect(after(buildMorganLaunch(base).args, '--session-id')).toBe('00000000-0000-4000-8000-000000000001')
    const resumed = buildMorganLaunch({ ...base, session: { kind: 'resume', id: 'abc' } })
    expect(after(resumed.args, '--resume')).toBe('abc')
    expect(resumed.args).not.toContain('--session-id')
  })

  it('passes isolation, mod, persona, model and settings', () => {
    const { args, settings } = buildMorganLaunch(base)
    expect(args.slice(0, 2)).toEqual(['--restricted', '--strict-mcp-config'])
    expect(after(args, '--plugin-dir')).toBe('/src/WriterOS/mod/writeros-morgan')
    expect(after(args, '--append-system-prompt-file')).toBe('/src/WriterOS/server/morganHost/persona.md')
    expect(after(args, '--model')).toBe('claude-sonnet-5-5')
    expect(JSON.parse(after(args, '--settings'))).toEqual(settings)
  })

  it('environment: allowlist, login PATH, channel', () => {
    expect(buildMorganLaunch(base).env).toEqual({
      HOME: '/home/b', USER: 'b', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8',
      PATH: '/opt/homebrew/bin:/usr/bin', TERM: 'xterm-256color',
      WRITEROS_MORGAN_SOCKET: '/run/m.sock', WRITEROS_MORGAN_TOKEN: 'a'.repeat(64),
      WRITEROS_MORGAN_PACKAGE: '/projects/Test Project.writeros',
    })
  })
})

describe('morganEnv', () => {
  it('is the same environment preflight uses, without session variables', () => {
    const env = morganEnv(base.parentEnv, base.loginPath)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(Object.keys(env)).toEqual(['HOME', 'USER', 'LANG', 'LC_ALL', 'PATH', 'TERM'])
  })
})

describe('read roots', () => {
  it('defaults to projects, iCloud scripts, past sessions and claude-mem', () => {
    expect(defaultReadRoots('/home/b', '/home/b/.claude-mem')).toEqual([
      '/home/b/Projects',
      '/home/b/Library/Mobile Documents/com~apple~CloudDocs/My Scripts',
      '/home/b/.claude/projects',
      '/home/b/.claude-mem',
    ])
  })

  it('drops duplicates and roots nested inside another root', () => {
    const roots = readRootsFor(
      { packagePath: '/home/b/Projects/x.writeros', storyDriveRoot: null },
      { ...host, writerosRoot: '/home/b/Projects/WriterOS', readRoots: ['/home/b/Projects', '/home/b/Projects'] },
    )
    expect(roots).toEqual(['/home/b/Projects'])
  })
})

describe('morganModel', () => {
  it('prefers MORGAN_MODEL, then ANTHROPIC_CHAT_MODEL, then the default', () => {
    expect(morganModel({ MORGAN_MODEL: 'a', ANTHROPIC_CHAT_MODEL: 'b' })).toBe('a')
    expect(morganModel({ ANTHROPIC_CHAT_MODEL: 'b' })).toBe('b')
    expect(morganModel({})).toBe('claude-sonnet-5-5')
  })
})
