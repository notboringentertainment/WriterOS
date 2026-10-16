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
    defaultMode: string; allow: string[]; ask: string[]; deny: string[]
    additionalDirectories: string[]; blockReadsOutsideWorkingDirectories: boolean
  }
  [k: string]: unknown
}
export interface MorganLaunch { cwd: string; args: string[]; env: Record<string, string>; settings: MorganSettings }

// Morgan runs on Ben's Claude login, so Opus costs plan usage, not API money (Ben, 2026-10-14).
export const DEFAULT_MORGAN_MODEL = 'claude-opus-5-5'
// ToolSearch loads Ben's connectors and Chrome, which Claude Code defers until asked for.
export const MORGAN_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'TodoWrite', 'WebSearch', 'WebFetch', 'Agent', 'ToolSearch'] as const
export const PROPOSE_TOOL = 'mcp__writeros-morgan__propose_page_change'
export const PAGE_DIRS = ['documents', 'script'] as const // the files behind open WriterOS pages
// Ben's user, project and local settings files stay out (his own hooks and modes are not Morgan's); his claude.ai
// connectors and Chrome load (Ben, 2026-10-14: the in-app Claude gets his reach).
export const ISOLATION_ARGS = ['--setting-sources', '']
export const PERMISSION_MODE = 'manual'
export const CLAUDE_MEM_DIR = path.join(homedir(), '.claude-mem')
export const CHROME_TOOLS = 'mcp__claude-in-chrome'
// Ben's claude.ai connectors, allowed whole. One missing here still works: Morgan asks Ben on a card.
export const CONNECTORS = ['Higgsfield', 'Google_Drive', 'Google_Calendar', 'Gmail', 'Notion', 'Claude_Docs', 'Airtable',
  'Granola', 'Hugging_Face', 'Supabase', 'Docusign'] as const
// protects: Ben's credits. Every Higgsfield call that makes or changes media asks him on a card.
export const HIGGSFIELD_SPEND = [
  'generate_image', 'generate_video', 'generate_audio', 'generate_3d', 'generate_image_batch', 'generate_video_batch',
  'generate_audio_batch', 'upscale_image', 'upscale_video', 'outpaint_image', 'reframe', 'remove_background',
  'motion_control', 'execute_preset', 'dubbing', 'voice_change', 'create_voice', 'create_voice_from_confirmed_audio',
  'ai_influencer_generate', 'build_ai_influencer', 'ads_studio_generate', 'shorts_studio_create',
  'scene_builder_3d_generate_angles', 'scene_builder_3d_generate_video', 'video_analysis_create', 'virality_predictor',
  'apps_invoke',
] as const
// protects: keys, tokens and saved passwords (Morgan never needs them). Read rules also bind Grep, Glob and sandboxed Bash.
export const SECRET_DIRS = ['~/.ssh', '~/.aws', '~/.config/gcloud', '~/.config/gh', '~/.docker', '~/.codex', '~/.openmontage',
  '~/Library/Keychains'] as const
export const SECRET_FILES = ['~/.netrc', '~/.git-credentials', '~/.npmrc', '~/.claude.json', '~/.claude/.credentials.json'] as const
// Sandboxed commands run without a card; the sandbox still applies the Read/Edit rules to them and everything they
// start. Open internet (Ben, 2026-10-14). Local binding (Ben's yes, 2026-10-07) lets WriterOS's `npm run memory`
// import open its loopback port.
export const SANDBOX_SETTINGS = {
  enabled: true, autoAllowBashIfSandboxed: true,
  filesystem: { denyRead: [...SECRET_DIRS, ...SECRET_FILES] },
  network: { allowedDomains: ['*'], allowLocalBinding: true },
} as const

const ENV_KEYS = new Set(['HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR'])

// Morgan no longer follows ANTHROPIC_CHAT_MODEL: that setting picks the API model for WriterOS's other agents.
export function morganModel(env: Record<string, string | undefined>): string {
  return env.MORGAN_MODEL || DEFAULT_MORGAN_MODEL
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
  // The Story-drive folder and the package's memory are canon: Morgan edits them without a card, and her persona
  // requires Ben's yes in the conversation first (canon changes only with his explicit yes).
  const writable = [...new Set([cwd, project.packagePath])]
  const settings: MorganSettings = {
    permissions: {
      defaultMode: input.permissionMode,
      additionalDirectories: roots,
      blockReadsOutsideWorkingDirectories: false, // reads elsewhere ask Ben on a card instead of failing
      allow: [
        ...[cwd, ...roots].map(dir => `Read(/${dir}/**)`), // leading "//" = absolute path
        ...writable.flatMap(dir => [`Edit(/${dir}/**)`, `Write(/${dir}/**)`]),
        'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'WebFetch', 'Agent', 'ToolSearch', PROPOSE_TOOL, CHROME_TOOLS,
        ...CONNECTORS.map(c => `mcp__claude_ai_${c}`),
        // Bash outside the sandbox, and edits outside the project, ask Ben on a card.
      ],
      ask: HIGGSFIELD_SPEND.map(t => `mcp__claude_ai_Higgsfield__${t}`),
      deny: [
        ...SECRET_DIRS.map(d => `Read(${d}/**)`), ...SECRET_FILES.map(f => `Read(${f})`),
        `Read(/${host.writerosRoot}/.env*)`,         // WriterOS's own keys
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
    WRITEROS_MORGAN_FORMATS: path.resolve(host.writerosRoot, 'server/morganHost/formats'),
  })
  return { cwd, args, settings, env }
}
