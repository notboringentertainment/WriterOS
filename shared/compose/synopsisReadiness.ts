// shared/compose/synopsisReadiness.ts
import type { FactSheet, Readiness, Recipe } from './types'
import {
  FEATURE_CORE_PROSE_FIELD_IDS,
  SERIES_CORE_PILOT_FIELD_IDS,
  SERIES_FUTURE_SEASON_PREFIX,
  SERIES_CHARACTER_PREFIX,
} from './synopsisRecipe'

function has(fs: FactSheet, id: string): boolean {
  return fs.fields.some(f => f.id === id)
}
function hasPrefix(fs: FactSheet, prefix: string): boolean {
  return fs.fields.some(f => f.id.startsWith(prefix))
}

const FEATURE_RICH_FIELD_IDS = [
  'logline.protagonist', 'logline.goal', 'logline.obstacle', 'logline.stakes',
  ...FEATURE_CORE_PROSE_FIELD_IDS,
]
const SERIES_RICH_FIELD_IDS = [
  'series.showOverview', 'series.pilot.logline', 'series.pilot.prose', 'series.seasonOneArc',
]

export function getSynopsisReadiness(fs: FactSheet, recipe: Recipe): Readiness {
  return recipe.format === 'feature' ? featureReadiness(fs) : seriesReadiness(fs, recipe)
}

function featureReadiness(fs: FactSheet): Readiness {
  const missingCoreLabels: string[] = []
  if (!has(fs, 'logline.protagonist')) missingCoreLabels.push('Protagonist')
  if (!FEATURE_CORE_PROSE_FIELD_IDS.some(id => has(fs, id))) missingCoreLabels.push('At least one story movement')
  if (missingCoreLabels.length > 0) {
    return { tier: 'sparse', missingCoreLabels, omittedSectionHeadings: [] }
  }
  const tier = FEATURE_RICH_FIELD_IDS.every(id => has(fs, id)) ? 'rich' : 'partial'
  return { tier, missingCoreLabels: [], omittedSectionHeadings: [] }
}

function seriesReadiness(fs: FactSheet, recipe: Recipe): Readiness {
  const missingCoreLabels: string[] = []
  if (!has(fs, 'series.showOverview')) missingCoreLabels.push('Show overview')
  if (!SERIES_CORE_PILOT_FIELD_IDS.some(id => has(fs, id))) {
    missingCoreLabels.push('Pilot or season material')
  }
  if (missingCoreLabels.length > 0) {
    return { tier: 'sparse', missingCoreLabels, omittedSectionHeadings: [] }
  }

  const omittedSectionHeadings: string[] = []
  for (const section of recipe.sections) {
    if (!section.omittable) continue
    const present = section.key === 'whereItGoes'
      ? hasPrefix(fs, SERIES_FUTURE_SEASON_PREFIX)
      : section.key === 'characters'
        ? hasPrefix(fs, SERIES_CHARACTER_PREFIX)
        : section.importantFieldIds.some(id => has(fs, id))
    if (!present) omittedSectionHeadings.push(section.heading)
  }

  const rich = SERIES_RICH_FIELD_IDS.every(id => has(fs, id)) && omittedSectionHeadings.length === 0
  return { tier: rich ? 'rich' : 'partial', missingCoreLabels: [], omittedSectionHeadings }
}
