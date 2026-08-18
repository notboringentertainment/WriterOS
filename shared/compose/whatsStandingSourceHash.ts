import type { ProjectMemorySnapshot } from '../projectMemory'
import { stableHash } from './stableHash'
import { buildWhatsStandingFactSheet } from './whatsStandingFactSheet'

/**
 * Source hash for a "What's Standing" report.
 *
 * Covers the fact sheet plus the snapshot revision. The revision is included because two
 * different memory states can produce the same visible facts — a promotion that changes a
 * record's status without changing its text, for instance — and a report should not claim
 * to be the same artifact as one taken at a different point in the project's history.
 */
export function computeWhatsStandingSourceHash(snapshot: ProjectMemorySnapshot): string {
  return stableHash({
    factSheet: buildWhatsStandingFactSheet(snapshot),
    revision: snapshot.revision,
    projectId: snapshot.projectId,
  })
}
