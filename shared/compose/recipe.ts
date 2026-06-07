// shared/compose/recipe.ts
import type { Recipe } from './types'

export const OUTLINE_RECIPE_VERSION = 1

function featureRecipe(): Recipe {
  return {
    surface: 'outline', format: 'feature', recipeVersion: OUTLINE_RECIPE_VERSION,
    coreRequiredFieldIds: ['spine.protagonist', 'spine.centralOpposition'],
    sections: [
      {
        key: 'whoWeFollow', heading: 'Who We Follow', style: 'prose', omittable: false,
        requiredFieldIds: ['spine.protagonist'],
        importantFieldIds: ['spine.protagonist', 'spine.externalGoal', 'spine.internalNeed'],
      },
      {
        key: 'whatStandsInTheWay', heading: 'What Stands in the Way', style: 'prose', omittable: false,
        requiredFieldIds: ['spine.centralOpposition'],
        importantFieldIds: ['spine.centralOpposition', 'spine.coreStakes'],
      },
      {
        key: 'shapeOfTheStory', heading: 'The Shape of the Story', style: 'leadIns', omittable: true,
        requiredFieldIds: [],
        importantFieldIds: ['feature.incitingIncident.whatHappens', 'feature.midpoint.whatHappens', 'feature.climax.whatHappens'],
        beats: [
          { lead: 'Where We Begin', fieldIds: ['feature.openingNormalWorld.whatHappens', 'feature.openingNormalWorld.whyNext'] },
          { lead: 'Disruption', fieldIds: ['feature.incitingIncident.whatHappens', 'feature.incitingIncident.consequence'] },
          { lead: 'Point of No Return', fieldIds: ['feature.actOneBreak.whatHappens', 'feature.actOneBreak.whyNext'] },
          { lead: 'Turn', fieldIds: ['feature.midpoint.whatHappens', 'feature.allIsLostWithSubplot.whatHappens'] },
          { lead: 'Where It Lands', fieldIds: ['feature.climax.whatHappens', 'feature.finalImage.whatHappens', 'spine.ending'] },
        ],
      },
    ],
  }
}

function seriesRecipe(): Recipe {
  return {
    surface: 'outline', format: 'series', recipeVersion: OUTLINE_RECIPE_VERSION,
    // Design says "showPitch", but no outline card writes seriesEngine.showPitch — the
    // "Show pitch" card writes repeatableConflict/episodeEngine/serialQuestion. Using
    // repeatableConflict (the card's primary "repeatable pressure" field) keeps the gate
    // satisfiable through the UI. Product-approved 2026-06-06. (>=1 episode gate lives in readiness.)
    coreRequiredFieldIds: ['seriesEngine.repeatableConflict', 'seasonArc.seasonQuestion'],
    sections: [
      {
        key: 'whoWeFollow', heading: 'Who We Follow', style: 'prose', omittable: false,
        requiredFieldIds: ['spine.protagonist'],
        importantFieldIds: ['spine.protagonist', 'spine.externalGoal', 'spine.internalNeed'],
      },
      {
        key: 'whatStandsInTheWay', heading: 'What Stands in the Way', style: 'prose', omittable: false,
        requiredFieldIds: ['seasonArc.seasonQuestion'],
        importantFieldIds: ['seasonArc.seasonQuestion', 'seasonArc.seasonAntagonist', 'spine.coreStakes'],
      },
      {
        key: 'theEngine', heading: 'The Engine', style: 'prose', omittable: true,
        requiredFieldIds: [],
        importantFieldIds: ['seriesEngine.repeatableConflict', 'seriesEngine.episodeEngine', 'seriesEngine.pilotPromise'],
      },
      {
        key: 'episodeMap', heading: 'Episode Map', style: 'prose', omittable: true,
        requiredFieldIds: [],
        importantFieldIds: [],
      },
    ],
  }
}

export function getOutlineRecipe(format: 'feature' | 'series'): Recipe {
  return format === 'series' ? seriesRecipe() : featureRecipe()
}

// OR-group beats: readiness requires >=1 present.
export const FEATURE_CORE_BEAT_FIELD_IDS = [
  'feature.openingNormalWorld.whatHappens', 'feature.incitingIncident.whatHappens',
  'feature.actOneBreak.whatHappens', 'feature.midpoint.whatHappens', 'feature.climax.whatHappens',
]
export function seriesCoreEpisodePrefix(): string { return 'episodes.' }
