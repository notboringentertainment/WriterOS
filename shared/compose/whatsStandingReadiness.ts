import type { ProjectMemorySnapshot } from '../projectMemory'
import type { AnnotationLogState } from '../projectMemoryAnnotations'
import { annotationIdFor } from '../projectMemoryAnnotations'
import { buildStandingEntries } from './whatsStandingFactSheet'

/**
 * Readiness for the "What's Standing" report: which referencing phrases in the displayed
 * records have no writer-approved resolution.
 *
 * The design's central safety promise is that a report never presents itself as settled
 * while a reference in it is unresolved — it still renders, but INCOMPLETE, loudly, at the
 * top. This module is the single source of that judgement; the composer turns each entry
 * into a fidelity warning and the CLI banner names them.
 *
 * What counts as unresolved: a cue nobody has been asked about yet, a question proposed but
 * unanswered, an answer of "can't say" (durable, but explicitly not a resolution — see the
 * declined-event schema), and an approval later invalidated. A plain decline does NOT count:
 * it is the writer ruling "this phrase is not really a reference", which settles the
 * question.
 */

export type UnresolvedReferenceState = 'unasked' | 'proposed' | 'cant-say' | 'invalidated'

export interface UnresolvedReference {
  annotationId: string
  recordId: string
  phrase: string
  sentence: string
  state: UnresolvedReferenceState
}

export function unresolvedReferences(
  snapshot: ProjectMemorySnapshot,
  annotations?: AnnotationLogState,
): UnresolvedReference[] {
  const out: UnresolvedReference[] = []
  const seen = new Set<string>()
  for (const entry of buildStandingEntries(snapshot)) {
    for (const cue of entry.cues) {
      const annotationId = annotationIdFor({
        recordId: entry.record.id,
        field: cue.field,
        sentence: cue.sentence,
        phrase: cue.phrase,
        occurrence: cue.occurrence,
        cue: cue.cue,
      })
      if (seen.has(annotationId)) continue
      seen.add(annotationId)

      const existing = annotations?.annotations.get(annotationId)
      let state: UnresolvedReferenceState | undefined
      if (existing === undefined) state = 'unasked'
      else if (existing.status === 'proposed') state = 'proposed'
      else if (existing.status === 'invalidated') state = 'invalidated'
      else if (existing.status === 'declined') {
        state = existing.declineReason === 'cant-say' ? 'cant-say' : undefined
      }
      // approved: resolved, nothing to report.

      if (state !== undefined) {
        out.push({ annotationId, recordId: entry.record.id, phrase: cue.phrase, sentence: cue.sentence, state })
      }
    }
  }
  return out.sort((a, b) => (a.annotationId < b.annotationId ? -1 : a.annotationId > b.annotationId ? 1 : 0))
}
