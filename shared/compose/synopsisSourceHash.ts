import type { SynopsisDocumentContent } from '../documents'
import type { ComposeIdentity } from './types'
import { buildSynopsisFactSheet } from './synopsisFactSheet'
import { stableHash } from './stableHash'

export function computeSynopsisSourceHash(
  content: SynopsisDocumentContent,
  format: 'feature' | 'series',
  identity: ComposeIdentity,
): string {
  const factSheet = buildSynopsisFactSheet(content, format)
  return stableHash({ factSheet, format, identity })
}
