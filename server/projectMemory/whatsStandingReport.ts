import { annotationStore, questionVersionFor } from './annotationStore'
import { projectMemoryStore } from './store'
import { composeWhatsStanding } from '../compose'
import type { WhatsStandingPayload, EnrichedQuestion } from '../../shared/whatsStandingPanel'

function headline(claim: string): string {
  const first = claim.split('\n')[0]
  return first.length > 70 ? `${first.slice(0, 69)}…` : first
}

export async function readWhatsStandingReport(projectPath: string): Promise<
  { ok: true; payload: WhatsStandingPayload } | { ok: false; reason: string }> {
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

  const result = composeWhatsStanding({
    snapshot,
    runId: `whats-standing-r${snapshot.revision}-a${annotations.revision}`,
    annotations,
  })
  if (!result.ok) return { ok: false, reason: result.reason }

  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  const questions: EnrichedQuestion[] = (await annotationStore.pendingQuestions(projectPath, snapshot))
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
