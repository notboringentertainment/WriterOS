import type { TreatmentDocumentContent } from '../documents'
import type { ComposeIdentity } from './types'
import { buildTreatmentFactSheet } from './treatmentFactSheet'
import { stableHash } from './stableHash'

export function computeTreatmentSourceHash(
  content: TreatmentDocumentContent,
  format: 'feature' | 'series',
  identity: ComposeIdentity,
): string {
  const factSheet = buildTreatmentFactSheet(content, format)
  return stableHash({ factSheet, format, identity })
}
