// mod/writeros-morgan/hooks/permission.ts — pure helpers, no `$`

const base = (p: unknown) => (typeof p === 'string' ? p.split('/').pop() || p : '?')

export function describePermission(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Edit' || tool === 'MultiEdit') return `Edit ${base(input.file_path)} (${input.file_path})`
  if (tool === 'Write') return `Create or overwrite ${base(input.file_path)} (${input.file_path})`
  if (tool === 'Bash') {
    const why = typeof input.description === 'string' && input.description ? ` — "${input.description}"` : ''
    return `Run: ${String(input.command)}${why}` // the card shows the whole command; the description is Morgan's words, shown second
  }
  if (tool === 'WebFetch') return `Open a web page: ${input.url}`
  return `Use ${tool}`
}
