export const DEFAULT_PROJECT_TITLE = 'Untitled Project'

export function normalizeProjectTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized === DEFAULT_PROJECT_TITLE ? '' : normalized
}

export function getDisplayProjectTitle(value: unknown): string {
  return normalizeProjectTitle(value) || DEFAULT_PROJECT_TITLE
}

export function getProjectContextTitle(value: unknown): string | undefined {
  return normalizeProjectTitle(value) || undefined
}
