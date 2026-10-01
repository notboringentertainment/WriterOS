// shared/compose/recipe.ts
import type { Recipe } from './types'
import type { FeatureRole, FeatureRoleResolution } from '../featureRoleBindings'

export const OUTLINE_RECIPE_VERSION = 1

function featureRecipe(resolution: FeatureRoleResolution | undefined): Recipe {
  const field = (role: FeatureRole, name: string): string[] => {
    const id = resolution?.[role]
    return id ? [`${id}.${name}`] : []
  }
  const fields = (...parts: string[][]): string[] => parts.flat()
  return {
    surface: 'outline', format: 'feature', recipeVersion: OUTLINE_RECIPE_VERSION,
    coreRequiredFieldIds: ['spine.protagonist', 'spine.centralOpposition'],
    coreAlternativeFieldIds: fields(
      field('openingNormalWorld', 'whatHappens'), field('incitingIncident', 'whatHappens'),
      field('actOneBreak', 'whatHappens'), field('midpoint', 'whatHappens'), field('climax', 'whatHappens'),
    ),
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
        importantFieldIds: fields(field('incitingIncident', 'whatHappens'), field('midpoint', 'whatHappens'), field('climax', 'whatHappens')),
        beats: [
          { lead: 'Where We Begin', fieldIds: fields(field('openingNormalWorld', 'whatHappens'), field('openingNormalWorld', 'whyNext')) },
          { lead: 'Disruption', fieldIds: fields(field('incitingIncident', 'whatHappens'), field('incitingIncident', 'consequence')) },
          { lead: 'Point of No Return', fieldIds: fields(field('actOneBreak', 'whatHappens'), field('actOneBreak', 'whyNext')) },
          { lead: 'Turn', fieldIds: fields(field('midpoint', 'whatHappens'), field('allIsLostWithSubplot', 'whatHappens')) },
          { lead: 'Where It Lands', fieldIds: fields(field('climax', 'whatHappens'), field('finalImage', 'whatHappens'), ['spine.ending']) },
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

export function getOutlineRecipe(format: 'feature' | 'series', resolution: FeatureRoleResolution | undefined): Recipe {
  return format === 'series' ? seriesRecipe() : featureRecipe(resolution)
}
export function seriesCoreEpisodePrefix(): string { return 'episodes.' }
