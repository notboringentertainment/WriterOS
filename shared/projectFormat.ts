export type ProjectFormat = 'feature' | 'series'

export function normalizeProjectFormat(value: unknown): ProjectFormat {
  return value === 'series' ? 'series' : 'feature'
}
