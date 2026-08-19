import { annotationStore, derivePendingQuestions, questionVersionFor } from './annotationStore'
import { projectMemoryStore } from './store'
import { composeWhatsStanding } from '../compose'
import type { WhatsStandingPayload, EnrichedQuestion } from '../../shared/whatsStandingPanel'
import type { AnnotationLogState } from '../../shared/projectMemoryAnnotations'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'

function headline(claim: string): string {
  const first = claim.split('\n')[0]
  return first.length > 70 ? `${first.slice(0, 69)}…` : first
}

type ReadResult =
  | { ok: true; payload: WhatsStandingPayload }
  | { ok: false; reason: string }

/**
 * Shared composition step for a (snapshot, annotations) pair already read from disk. Derives
 * pending questions from the annotation state directly (`derivePendingQuestions`) rather than
 * re-replaying the log through `annotationStore.pendingQuestions` — the caller already holds
 * the state, so a third read of the same log would be redundant.
 */
function composeReportPayload(
  snapshot: ProjectMemorySnapshot,
  annotations: AnnotationLogState,
): ReadResult {
  const result = composeWhatsStanding({
    snapshot,
    runId: `whats-standing-r${snapshot.revision}-a${annotations.revision}`,
    annotations,
  })
  if (!result.ok) return { ok: false, reason: result.reason }

  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  const questions: EnrichedQuestion[] = derivePendingQuestions(annotations, snapshot)
    .map(q => ({
      annotationId: q.annotationId,
      status: q.status,
      questionText: q.questionText,
      recordId: q.locator.recordId,
      candidates: q.candidateRecordIds.map(id => ({ id, headline: headline(byId.get(id)?.claim ?? '') })),
      questionVersion: questionVersionFor(snapshot, q),
    }))
  return { ok: true, payload: { composed: result.composed, questions } }
}

/**
 * @param expectedProjectId When provided, the route's URL project id — asserted against the
 * resolved package's own manifest id, matching the assertion every sibling project-memory
 * route performs (readSnapshot's callers compare `snapshot.projectId` to the URL id). The CLI
 * report command has no URL id to compare against, so it omits this argument and the check
 * never runs.
 */
export async function readWhatsStandingReport(
  projectPath: string,
  expectedProjectId?: string,
): Promise<ReadResult> {
  // Optimistic consistent pair — same contract the CLI report command documented:
  // annotation revision identical before and after the snapshot read means no writer
  // ran in between, so the pair is one moment's state.
  let annotations = await annotationStore.state(projectPath)
  let snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  for (let attempt = 0; ; attempt += 1) {
    const after = await annotationStore.state(projectPath)
    if (after.revision === annotations.revision) break
    if (attempt >= 3) {
      return { ok: false, reason: 'Memory kept changing while the report was being read. Try again when the project is quiet.' }
    }
    annotations = after
    snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  }

  if (expectedProjectId !== undefined && snapshot.projectId !== expectedProjectId) {
    return { ok: false, reason: 'project-mismatch' }
  }

  return composeReportPayload(snapshot, annotations)
}

/**
 * Post-write fallback ONLY — never use this for the GET route, which must keep the strict
 * paired read above. This does one `annotationStore.state` read and one
 * `readSnapshotReadOnly` read with no consistent-pair retry, so under a concurrent writer
 * the snapshot and annotation state it composes from can, rarely, come from two adjacent
 * moments rather than one.
 *
 * That's acceptable here and only here: the one caller is the answer POST handler, after
 * its own write already landed durably. A failed paired read at that point is never a
 * reason to report failure for a write that succeeded — the log changed, so returning an
 * error status would contradict the "non-200 ⇒ log unchanged" contract. This is a display
 * refresh; the client's very next action against a stale-looking question revalidates via
 * questionVersion regardless, so a slightly stitched pair here self-corrects rather than
 * being load-bearing.
 */
export async function readWhatsStandingReportDirect(projectPath: string): Promise<ReadResult> {
  const annotations = await annotationStore.state(projectPath)
  const snapshot = await projectMemoryStore.readSnapshotReadOnly(projectPath)
  return composeReportPayload(snapshot, annotations)
}
