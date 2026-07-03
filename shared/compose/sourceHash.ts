import type { OutlineDocumentContent } from '../documents'
import type { ComposeIdentity } from './types'
import { buildOutlineFactSheet } from './factSheet'
import { stableHash } from './stableHash'

export function computeOutlineSourceHash(
  content: OutlineDocumentContent,
  format: 'feature' | 'series',
  identity: ComposeIdentity,
): string {
  const factSheet = buildOutlineFactSheet(content, format)
  return stableHash({ factSheet, format, identity })
}
