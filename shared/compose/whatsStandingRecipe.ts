import type { ProjectMemorySnapshot } from '../projectMemory'
import type { Recipe, RecipeSection } from './types'
import { buildStandingEntries, type StandingGroup } from './whatsStandingFactSheet'

export const WHATS_STANDING_RECIPE_VERSION = 1

/**
 * Recipe for the "What's Standing" report.
 *
 * Unlike the authored surfaces, whose recipes are static per format, this one is derived
 * from the snapshot: its sections are populated by whichever records exist, so the field
 * ids cannot be known ahead of time. Section order is fixed and is the reading order.
 *
 * "Reads as withdrawn" comes before "In force" deliberately. A record whose own wording
 * says it was struck is the thing most likely to mislead, so it is shown first rather than
 * buried among decisions that still stand.
 */
const SECTION_ORDER: readonly { key: StandingGroup | 'contested'; heading: string }[] = [
  { key: 'inForce', heading: 'In force' },
  { key: 'withdrawn', heading: 'Reads as withdrawn — check before relying on these' },
  { key: 'contested', heading: 'Contested' },
  { key: 'openQuestion', heading: 'Still open' },
  { key: 'awaiting', heading: 'Awaiting your decision' },
]

export function getWhatsStandingRecipe(snapshot: ProjectMemorySnapshot): Recipe {
  const entries = buildStandingEntries(snapshot)
  const conflictIds = snapshot.conflicts.filter(c => c.status === 'open').map(c => c.id).sort()

  const sections: RecipeSection[] = SECTION_ORDER.map(({ key, heading }) => {
    const fieldIds = key === 'contested'
      ? conflictIds
      : entries.filter(e => e.group === key).map(e => e.record.id)
    return {
      key,
      heading,
      style: 'prose',
      // Nothing is required: a project with no contested items is not an incomplete report,
      // it is a project with nothing contested.
      requiredFieldIds: [],
      // Every fact in a section must be cited by some block in it. This is what makes a
      // silently dropped record a fidelity failure rather than an invisible omission.
      importantFieldIds: fieldIds,
      omittable: true,
    }
  })

  return {
    surface: 'whatsStanding',
    format: 'feature',
    recipeVersion: WHATS_STANDING_RECIPE_VERSION,
    sections,
    coreRequiredFieldIds: [],
  }
}
