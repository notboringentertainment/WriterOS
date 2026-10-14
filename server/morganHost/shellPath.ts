// A Finder-launched app inherits launchd's bare PATH (/usr/bin:/bin:...), so
// sessions couldn't find user tools like `node` that Claude's hooks call by
// bare name. Ask the user's login shell for its PATH once and hand that to
// every pty. Falls back to the inherited PATH if the shell misbehaves.

export type RunShell = (shell: string, args: string[]) => string

export function loginShellPath(fallback: string | undefined, run: RunShell, shell = process.env.SHELL || '/bin/zsh'): string {
  const base = fallback ?? '/usr/bin:/bin'
  let out: string
  try {
    out = run(shell, ['-ilc', 'printf %s "$PATH"']).trim()
  } catch {
    return base
  }
  if (!out || out.includes('\n')) return base
  const seen = new Set<string>()
  const merged: string[] = []
  for (const p of [...out.split(':'), ...base.split(':')]) {
    if (p && !seen.has(p)) {
      seen.add(p)
      merged.push(p)
    }
  }
  return merged.join(':')
}
