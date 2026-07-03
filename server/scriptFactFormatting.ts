interface ScriptFactFormattingEntry {
  label: string
  count: number
}

interface ScriptFactsForFormatting {
  facts?: {
    characters: ScriptFactFormattingEntry[]
    locations: ScriptFactFormattingEntry[]
    times: ScriptFactFormattingEntry[]
  }
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function truncate(value: string, limit = 900): string {
  const trimmed = value.trim()
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit).trim()}...`
}

export function compactFactEntries(entries: ScriptFactFormattingEntry[], limit = 8): string {
  const compacted = entries
    .filter(entry => filled(entry.label) && entry.count > 0)
    .map(entry => `${truncate(entry.label, 120)}${entry.count > 1 ? ` (${entry.count})` : ''}`)
  if (!compacted.length) return ''

  const visible = compacted.slice(0, limit).join('; ')
  const extra = compacted.length > limit ? `; +${compacted.length - limit} more` : ''
  return `${visible}${extra}`
}

export function scriptFactLines(script: ScriptFactsForFormatting): string[] {
  if (!script.facts) return []

  const characters = compactFactEntries(script.facts.characters)
  const locations = compactFactEntries(script.facts.locations)
  const times = compactFactEntries(script.facts.times)

  return [
    characters && `Script Fact characters: ${characters}`,
    locations && `Script Fact locations: ${locations}`,
    times && `Script Fact times: ${times}`,
  ].filter(filled)
}
