import type { OutlineUnit } from './documents'

export const FEATURE_ROLES = [
  'openingNormalWorld', 'incitingIncident', 'actOneBreak', 'midpoint',
  'allIsLostWithSubplot', 'climax', 'finalImage',
] as const

export type FeatureRole = typeof FEATURE_ROLES[number]
export type FeatureRoleResolution = Record<FeatureRole, string | undefined>

export function resolveFeatureRoleUnitIds(content: {
  units: OutlineUnit[]
  featureRoleUnitIds?: Partial<Record<FeatureRole, string>>
}): FeatureRoleResolution {
  const ids = new Set(content.units.map(unit => unit.id))
  return Object.fromEntries(FEATURE_ROLES.map(role => {
    const candidate = content.featureRoleUnitIds === undefined
      ? `feature.${role}`
      : content.featureRoleUnitIds[role]
    const blankTemplate = content.featureRoleUnitIds === undefined && content.units.length === 0
    return [role, candidate && (ids.has(candidate) || blankTemplate) ? candidate : undefined]
  })) as FeatureRoleResolution
}
