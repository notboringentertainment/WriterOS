import type { OutlineUnit } from './documents'

export const FEATURE_ROLES = [
  'openingNormalWorld', 'incitingIncident', 'actOneBreak', 'midpoint',
  'allIsLostWithSubplot', 'climax', 'finalImage',
] as const

export type FeatureRole = typeof FEATURE_ROLES[number]
export type FeatureRoleResolution = Record<FeatureRole, string | undefined>

const STOCK_FEATURE_UNIT_IDS = new Set([...FEATURE_ROLES.map(role => `feature.${role}`), 'feature.actTwoA'])

export function resolveFeatureRoleUnitIds(content: {
  units: OutlineUnit[]
  featureRoleUnitIds?: Partial<Record<FeatureRole, string>>
}): FeatureRoleResolution {
  const ids = new Set(content.units.map(unit => unit.id))
  const stockOnly = content.featureRoleUnitIds === undefined &&
    content.units.every(unit => STOCK_FEATURE_UNIT_IDS.has(unit.id))
  return Object.fromEntries(FEATURE_ROLES.map(role => {
    const candidate = content.featureRoleUnitIds === undefined
      ? `feature.${role}`
      : content.featureRoleUnitIds[role]
    return [role, candidate && (ids.has(candidate) || stockOnly) ? candidate : undefined]
  })) as FeatureRoleResolution
}
