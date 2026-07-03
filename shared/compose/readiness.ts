// shared/compose/readiness.ts
import type { FactSheet, Readiness, Recipe } from './types'
import { FEATURE_CORE_BEAT_FIELD_IDS, seriesCoreEpisodePrefix } from './recipe'

function has(fs: FactSheet, id: string): boolean {
  return fs.fields.some(f => f.id === id)
}
function labelFor(fs: FactSheet, id: string): string {
  return fs.fields.find(f => f.id === id)?.label ?? id
}

export function getOutlineReadiness(fs: FactSheet, recipe: Recipe): Readiness {
  const missingCoreLabels: string[] = []

  for (const id of recipe.coreRequiredFieldIds) {
    if (!has(fs, id)) missingCoreLabels.push(labelFor(fs, id))
  }
  // OR-group: >=1 beat (feature) or >=1 episode field (series)
  if (recipe.format === 'feature') {
    if (!FEATURE_CORE_BEAT_FIELD_IDS.some(id => has(fs, id))) missingCoreLabels.push('At least one story beat')
  } else {
    if (!fs.fields.some(f => f.id.startsWith(seriesCoreEpisodePrefix()))) missingCoreLabels.push('At least one episode')
  }

  if (missingCoreLabels.length > 0) {
    return { tier: 'sparse', missingCoreLabels, omittedSectionHeadings: [] }
  }

  // Determine omitted omittable sections (no source fields present).
  const omittedSectionHeadings: string[] = []
  for (const section of recipe.sections) {
    if (!section.omittable) continue
    const sourceIds = section.style === 'leadIns'
      ? (section.beats ?? []).flatMap(b => b.fieldIds)
      : section.importantFieldIds
    const anyPresent = section.key === 'episodeMap'
      ? fs.fields.some(f => f.id.startsWith('episodes.'))
      : sourceIds.some(id => has(fs, id))
    if (!anyPresent) omittedSectionHeadings.push(section.heading)
  }

  // Rich = every section's important fields all answered AND nothing omitted.
  const allImportantAnswered = recipe.sections.every(s => s.importantFieldIds.every(id => has(fs, id)))
  const tier = allImportantAnswered && omittedSectionHeadings.length === 0 ? 'rich' : 'partial'
  return { tier, missingCoreLabels: [], omittedSectionHeadings }
}
