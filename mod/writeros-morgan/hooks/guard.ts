// mod/writeros-morgan/hooks/guard.ts
// Second line of defence behind the session settings, for three rules that must hold even if the settings are wrong.
// Each refusal says what it protects. Everything else is left to Claude Code's permissions and Ben's approval cards.

const CASTING = /(^|\/)casting-inspiration(\/|$)/i
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
export const PROPOSE_TOOL = 'mcp__writeros-morgan__propose_page_change'
const PROPOSABLE = new Set(['synopsis', 'outline', 'treatment', 'storyBible', 'script'])

export interface GuardContext {
  packagePath: string                          // this session's WriterOS package (from WRITEROS_MORGAN_PACKAGE)
  resolve(p: string): Promise<string | null>   // symlinks followed; null if it cannot be resolved
}
export type GuardResult = { allow: true } | { allow: false; reason: string }

export const CASTING_REASON = 'That is a casting-inspiration folder: photos of real people, for the writer\'s eyes only. Morgan does not open them.'
const PACKAGE_REASON = 'That file belongs to an open WriterOS page. Use propose_page_change so the writer sees the change on the page and keeps or dismisses it.'
const LOOK_REASON = 'Look panel fields are the writer\'s to fill. Morgan can explain them but not propose values.'
const UNKNOWN_FILE = 'Morgan could not check this file, so it was not opened.'

const inside = (p: string, dir: string) => p === dir || p.startsWith(dir.endsWith('/') ? dir : dir + '/')

export async function castingPath(p: unknown, resolve: GuardContext['resolve']): Promise<string | null> {
  if (typeof p !== 'string' || p.length === 0) return null
  if (CASTING.test(p)) return CASTING_REASON
  const resolved = await resolve(p)
  if (resolved === null) return UNKNOWN_FILE
  return CASTING.test(resolved) ? CASTING_REASON : null
}

export async function guardTool(tool: string, args: Record<string, unknown>, ctx: GuardContext): Promise<GuardResult> {
  if (tool === 'Read') {
    if (typeof args.file_path !== 'string') return { allow: false, reason: UNKNOWN_FILE }
    const reason = await castingPath(args.file_path, ctx.resolve)
    return reason ? { allow: false, reason } : { allow: true }
  }
  if (tool === 'Grep' || tool === 'Glob') {
    for (const field of [args.path, args.pattern, args.glob]) {
      if (typeof field === 'string' && CASTING.test(field)) return { allow: false, reason: CASTING_REASON }
    }
    if (typeof args.path === 'string') {
      const resolved = await ctx.resolve(args.path)
      if (resolved && CASTING.test(resolved)) return { allow: false, reason: CASTING_REASON } // a linked search root
    }
    return { allow: true } // casting folders hold images, not text; the settings deny keeps their files out of Grep results too
  }
  if (tool === 'Bash') {
    // Bash cannot hand an image to the model as a picture, but a command naming the folder is refused outright.
    return typeof args.command === 'string' && CASTING.test(args.command) ? { allow: false, reason: CASTING_REASON } : { allow: true }
  }
  if (WRITE_TOOLS.has(tool)) {
    if (!ctx.packagePath) return { allow: false, reason: UNKNOWN_FILE }
    const p = args.file_path ?? args.notebook_path
    if (typeof p !== 'string') return { allow: false, reason: UNKNOWN_FILE }
    const resolved = (await ctx.resolve(p)) ?? p // a new file does not resolve yet; check the path as given
    const pageDirs = ['documents', 'script'].map(d => `${ctx.packagePath}/${d}`)
    if (pageDirs.some(d => inside(p, d) || inside(resolved, d))) return { allow: false, reason: PACKAGE_REASON }
    return { allow: true }
  }
  if (tool === PROPOSE_TOOL) return PROPOSABLE.has(String(args.surface)) ? { allow: true } : { allow: false, reason: LOOK_REASON }
  return { allow: true }
}
