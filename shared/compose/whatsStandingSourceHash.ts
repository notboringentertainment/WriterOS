import type { ProjectMemorySnapshot } from '../projectMemory'
import type { AnnotationLogState } from '../projectMemoryAnnotations'
import { stableHash } from './stableHash'
import { buildWhatsStandingFactSheet } from './whatsStandingFactSheet'

/**
 * Source hash for a "What's Standing" report.
 *
 * Covers the fact sheet plus the snapshot revision. The revision is included because two
 * different memory states can produce the same visible facts — a promotion that changes a
 * record's status without changing its text, for instance — and a report should not claim
 * to be the same artifact as one taken at a different point in the project's history.
 *
 * Annotations are part of the source too: they contribute fact-sheet fields, resolved
 * references, and readiness. Hashing the annotation revision alongside the annotation-aware
 * fact sheet means an annotation-only change can never produce a different report under the
 * same hash.
 */
export function computeWhatsStandingSourceHash(
  snapshot: ProjectMemorySnapshot,
  annotations?: AnnotationLogState,
): string {
  const annotationDigest = annotations === undefined ? undefined
    : [...annotations.annotations.values()]
        .sort((a, b) => (a.annotationId < b.annotationId ? -1 : 1))
        .map(a => ({
          annotationId: a.annotationId,
          status: a.status,
          declineReason: a.declineReason ?? null,
          locator: a.locator,
          referentRecordIds: a.referentRecordIds ?? null,
          support: a.support,
        }))
  return stableHash({
    factSheet: buildWhatsStandingFactSheet(snapshot, annotations),
    revision: snapshot.revision,
    annotationRevision: annotations?.revision,
    annotationDigest,
    projectId: snapshot.projectId,
  })
}
