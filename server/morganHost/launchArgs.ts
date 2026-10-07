// server/morganHost/launchArgs.ts
// Builds one hosted Morgan session. She gets the tools Claude Code has; safety is asking first.
// Every limit names what it protects.
import path from 'node:path'
import { homedir } from 'node:os'

export interface MorganProjectPaths { packagePath: string; storyDriveRoot: string | null }
export interface MorganHostPaths { writerosRoot: string; modDir: string; personaFile: string; readRoots: string[] }
export interface MorganLaunchInput {
  project: MorganProjectPaths
  host: MorganHostPaths
  model: string
  session: { kind: 'new' | 'resume'; id: string }
  socketPath: string
  token: string
  parentEnv: Record<string, string | undefined>
  loginPath: string
  isolationArgs: string[]
  permissionMode: string
}
export interface MorganSettings {
  permissions: {
    defaultMode: string; allow: string[]; deny: string[]
    additionalDirectories: string[]; blockReadsOutsideWorkingDirectories: true
  }
  [k: string]: unknown
}
export interface MorganLaunch { cwd: string; args: string[]; env: Record<string, string>; settings: MorganSettings }

export const DEFAULT_MORGAN_MODEL = 'claude-sonnet-5-5'
export const MORGAN_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'TodoWrite', 'WebSearch', 'WebFetch', 'Agent'] as const
export const PROPOSE_TOOL = 'mcp__writeros-morgan__propose_page_change'
export const PAGE_DIRS = ['documents', 'script'] as const // the files behind open WriterOS pages
// Exact keys per Task 0 Step 12 (Claude Code sandbox settings, 2.1.292). Network stays as Claude Code's default for Bash.
export const ISOLATION_ARGS = ['--restricted', '--strict-mcp-config']
export const PERMISSION_MODE = 'manual'
export const CLAUDE_MEM_DIR = path.join(homedir(), '.claude-mem')
export const SANDBOX_SETTINGS = { enabled: true, autoAllowBashIfSandboxed: false } as const // sandboxed commands that change things still ask Ben (Task 0 Step 5)

const ENV_KEYS = new Set(['HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR'])

export function morganModel(env: Record<string, string | undefined>): string {
  return env.MORGAN_MODEL || env.ANTHROPIC_CHAT_MODEL || DEFAULT_MORGAN_MODEL
}

// Allowlist, not denylist: WriterOS's own secrets and Anthropic routing variables never reach the child.
export function morganEnv(parentEnv: Record<string, string | undefined>, loginPath: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value !== undefined && (ENV_KEYS.has(key) || key.startsWith('LC_'))) env[key] = value
  }
  env.PATH = loginPath
  env.TERM = 'xterm-256color'
  return { ...env, ...extra }
}

export function defaultReadRoots(home: string, claudeMemDir: string | null): string[] {
  return [
    path.join(home, 'Projects'),
    path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'My Scripts'),
    path.join(home, '.claude', 'projects'),          // past Claude Code session transcripts
    ...(claudeMemDir ? [claudeMemDir] : []),         // past-session observations
  ]
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/')

export function readRootsFor(project: MorganProjectPaths, host: MorganHostPaths): string[] {
  const candidates = [...(project.storyDriveRoot ? [project.packagePath] : []), host.writerosRoot, ...host.readRoots]
  const unique = [...new Set(candidates)]
  const cwd = project.storyDriveRoot ?? project.packagePath
  return unique.filter(dir => !inside(dir, cwd) && !unique.some(other => other !== dir && inside(dir, other)))
}

export function buildMorganLaunch(input: MorganLaunchInput): MorganLaunch {
  const { project, host } = input
  const cwd = project.storyDriveRoot ?? project.packagePath
  const roots = readRootsFor(project, host)
  const settings: MorganSettings = {
    permissions: {
      defaultMode: input.permissionMode,
      additionalDirectories: roots,
      blockReadsOutsideWorkingDirectories: true,
      allow: [
        ...[cwd, ...roots].map(dir => `Read(/${dir}/**)`), // leading "//" = absolute path
        'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'Agent', PROPOSE_TOOL,
        // Bash, Edit, Write and WebFetch are not listed: they ask Ben (read-only shell commands are automatic in Claude Code).
      ],
      deny: [
        'Read(//**/casting-inspiration/**)',        // casting firewall: real-person images are for Ben's eyes only (Read rules also govern Grep, Glob and sandboxed Bash)
        ...PAGE_DIRS.flatMap(d => [`Edit(/${project.packagePath}/${d}/**)`, `Write(/${project.packagePath}/${d}/**)`]), // open WriterOS pages: changes go through propose_page_change (memory files stay writable for canon imports)
        'AskUserQuestion',                           // its dialog cannot be shown in the page; Morgan asks in conversation
      ],
    },
  }
  // Bash runs in Claude Code's sandbox, which enforces the same Read/Edit rules on commands and everything they start,
  // so a shell command cannot open a casting folder or write a page file. A command that genuinely needs to run outside
  // the sandbox asks Ben on a card first (Claude Code's own escape hatch), and its card says so.
  settings.sandbox = SANDBOX_SETTINGS
  const args = [
    ...input.isolationArgs,
    '--tools', MORGAN_TOOLS.join(','),
    ...roots.flatMap(dir => ['--add-dir', dir]),
    '--permission-mode', input.permissionMode,
    '--settings', JSON.stringify(settings),
    '--plugin-dir', host.modDir,
    '--append-system-prompt-file', host.personaFile,
    '--model', input.model,
    ...(input.session.kind === 'resume' ? ['--resume', input.session.id] : ['--session-id', input.session.id]),
  ]
  const env = morganEnv(input.parentEnv, input.loginPath, {
    WRITEROS_MORGAN_SOCKET: input.socketPath,
    WRITEROS_MORGAN_TOKEN: input.token,
    WRITEROS_MORGAN_PACKAGE: project.packagePath, // the mod's guard keeps writes out of the open WriterOS pages
  })
  return { cwd, args, settings, env }
}
