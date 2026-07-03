// shared/compose/normalize.ts
// Conservative normalization (spec §4). Preserves punctuation/casing/wording.
function normalizeString(s: string): string {
  return s.replace(/\r\n?/g, '\n').trim()
}

export function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const n = normalizeString(value)
    return n === '' ? undefined : n
  }
  if (Array.isArray(value)) {
    const arr = value.map(normalizeValue).filter(v => v !== undefined)
    return arr.length === 0 ? undefined : arr
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const nv = normalizeValue((value as Record<string, unknown>)[key])
      if (nv !== undefined) out[key] = nv
    }
    return Object.keys(out).length === 0 ? undefined : out
  }
  if (value === null || value === undefined) return undefined
  return value // numbers, booleans
}

export function deterministicStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value) ?? null)
}
