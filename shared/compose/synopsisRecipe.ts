// shared/compose/synopsisRecipe.ts
import type { Recipe } from './types'

export const SYNOPSIS_RECIPE_VERSION = 1

function featureRecipe(): Recipe {
  return {
    surface: 'synopsis', format: 'feature', recipeVersion: SYNOPSIS_RECIPE_VERSION,
    coreRequiredFieldIds: ['logline.protagonist'],
    sections: [
      {
        key: 'logline', heading: 'Logline', style: 'prose', omittable: false,
        requiredFieldIds: ['logline.protagonist'],
        // hook is omittable for readiness but coverage-counted when answered.
        importantFieldIds: ['logline.text', 'logline.protagonist', 'logline.goal', 'logline.obstacle', 'logline.stakes', 'logline.hook'],
      },
      {
        key: 'synopsisBody', heading: 'Synopsis', style: 'prose', omittable: false,
        requiredFieldIds: [],
        importantFieldIds: ['prose.opening', 'prose.escalation', 'prose.middle', 'prose.climax', 'prose.resolution'],
      },
    ],
  }
}

function seriesRecipe(): Recipe {
  return {
    surface: 'synopsis', format: 'series', recipeVersion: SYNOPSIS_RECIPE_VERSION,
    // logline.text is core: the non-omittable Logline section opens the artifact and the
    // prompt requires the first block to be the Logline heading, so it must be present.
    coreRequiredFieldIds: ['logline.text', 'series.showOverview'],
    sections: [
      {
        key: 'seriesLogline', heading: 'Logline', style: 'prose', omittable: false,
        requiredFieldIds: [], importantFieldIds: ['logline.text'],
      },
      {
        key: 'showOverview', heading: 'Show Overview', style: 'prose', omittable: false,
        requiredFieldIds: ['series.showOverview'], importantFieldIds: ['series.showOverview'],
      },
      {
        key: 'pilotSynopsis', heading: 'Pilot Synopsis', style: 'prose', omittable: false,
        requiredFieldIds: [], importantFieldIds: ['series.pilot.logline', 'series.pilot.prose'],
      },
      {
        key: 'seasonOneArc', heading: 'Season One Arc', style: 'prose', omittable: true,
        requiredFieldIds: [], importantFieldIds: ['series.seasonOneArc'],
      },
      {
        // Dynamic per-future-season ids; coverage is prefix-checked, not enumerated.
        key: 'whereItGoes', heading: 'Where It Goes', style: 'prose', omittable: true,
        requiredFieldIds: [], importantFieldIds: [], importantFieldPrefixes: [SERIES_FUTURE_SEASON_PREFIX],
      },
      {
        // Dynamic per-character ids; coverage is prefix-checked, not enumerated.
        key: 'characters', heading: 'Characters', style: 'prose', omittable: true,
        requiredFieldIds: [], importantFieldIds: [], importantFieldPrefixes: [SERIES_CHARACTER_PREFIX],
      },
      {
        key: 'compsWhyNow', heading: 'Comps & Why This Show Now', style: 'prose', omittable: true,
        requiredFieldIds: [], importantFieldIds: ['series.compsAndWhyThisShowNow'],
      },
    ],
  }
}

export function getSynopsisRecipe(format: 'feature' | 'series'): Recipe {
  return format === 'series' ? seriesRecipe() : featureRecipe()
}

// OR-group: readiness requires >=1 present.
export const FEATURE_CORE_PROSE_FIELD_IDS = [
  'prose.opening', 'prose.escalation', 'prose.middle', 'prose.climax', 'prose.resolution',
]
export const SERIES_CORE_PILOT_FIELD_IDS = [
  'series.pilot.logline', 'series.pilot.prose', 'series.seasonOneArc',
]
// Dynamic-id section prefixes (whereItGoes / characters) for omitted-section detection.
export const SERIES_FUTURE_SEASON_PREFIX = 'series.futureSeasons.'
export const SERIES_CHARACTER_PREFIX = 'series.characters.'
