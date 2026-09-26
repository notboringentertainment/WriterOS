import type { OutlineDocumentContent } from '../documents'
import { resolveFeatureRoleUnitIds, type FeatureRoleResolution } from '../featureRoleBindings'
import type { ComposeIdentity } from './types'
import { buildOutlineFactSheet } from './factSheet'
import { stableHash } from './stableHash'

export function computeOutlineSourceHash(
  content: OutlineDocumentContent,
  format: 'feature' | 'series',
  identity: ComposeIdentity,
  resolved?: FeatureRoleResolution,
): string {
  const resolution = format === 'feature' ? resolved ?? resolveFeatureRoleUnitIds(content) : undefined
  const factSheet = buildOutlineFactSheet(content, format, resolution)
  return stableHash({
    factSheet, format, identity,
    ...(format === 'feature' && content.featureRoleUnitIds !== undefined ? { resolution } : {}),
  })
}
