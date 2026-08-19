import { constants } from 'node:fs'
import { lstat, open, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { sha256Hex } from '../../shared/compose/sha256'
import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '../../shared/projectMemory'
import {
  AnnotationEventSchema,
  AnnotationReplayError,
  annotationIdFor,
  applyAnnotationEvent,
  phraseHashFor,
  type AnnotationEvent,
  type AnnotationLogState,
  type AnnotationState,
  type PhraseLocator,
  type RecordLanguageFingerprint,
} from '../../shared/projectMemoryAnnotations'
import { buildStandingEntries } from '../../shared/compose/whatsStandingFactSheet'
import { projectMemoryStore } from './store'

export { annotationIdFor }

const MEMORY_DIRECTORY = 'memory'
const ANNOTATIONS_FILE = 'annotations.jsonl'

/**
 * The annotation log. Its own domain — never the memory ledger, whose five event types an
 * older build must always be able to replay — but the same write discipline: package lock,
 * O_APPEND with O_NOFOLLOW, schema-validated on the way in and on the way out, and replay
 * that halts at the first bad line rather than skipping past corruption.
 */

export class AnnotationStoreError extends Error {
  constructor(message: string, readonly reason: 'not-found' | 'corrupt' | 'conflict' | 'invalid-input') {
    super(message)
    this.name = 'AnnotationStoreError'
  }
}

function annotationsPath(projectPath: string): string {
  return path.join(projectPath, MEMORY_DIRECTORY, ANNOTATIONS_FILE)
}

async function readProjectId(projectPath: string): Promise<string> {
  const manifestRaw = await readFile(path.join(projectPath, 'project.json'), 'utf8')
  const manifest = JSON.parse(manifestRaw) as { projectId?: unknown }
  if (typeof manifest.projectId !== 'string' || manifest.projectId.length === 0) {
    throw new AnnotationStoreError('project.json has no projectId.', 'corrupt')
  }
  return manifest.projectId
}

async function assertRegularFileOrMissing(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath)
    if (!stats.isFile()) throw new AnnotationStoreError(`${filePath} is not a regular file.`, 'corrupt')
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function emptyState(projectId: string): AnnotationLogState {
  return { projectId, revision: 0, annotations: new Map() }
}

async function replayAnnotations(projectPath: string, projectId: string): Promise<AnnotationLogState> {
  const filePath = annotationsPath(projectPath)
  if (!await assertRegularFileOrMissing(filePath)) return emptyState(projectId)

  const content = await readFile(filePath, 'utf8')
  let state = emptyState(projectId)
  const lines = content.split('\n')
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue
    const lineNumber = index + 1
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch {
      throw new AnnotationReplayError('invalid JSON.', lineNumber)
    }
    const parsed = AnnotationEventSchema.safeParse(json)
    if (!parsed.success) {
      throw new AnnotationReplayError(parsed.error.issues[0]?.message ?? 'event schema validation failed.', lineNumber)
    }
    state = applyAnnotationEvent(state, parsed.data, lineNumber)
  }
  return state
}

async function appendAnnotationEvent(projectPath: string, event: AnnotationEvent): Promise<void> {
  const parsed = AnnotationEventSchema.parse(event)
  const filePath = annotationsPath(projectPath)
  // O_CREAT is deliberate here, unlike the memory ledger: the first proposal is what brings
  // the log into existence. The memory/ directory must already exist — a project with no
  // memory has nothing to annotate, and this store must not create memory state.
  const handle = await open(filePath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  try {
    const bytes = Buffer.from(`${JSON.stringify(parsed)}\n`, 'utf8')
    let offset = 0
    while (offset < bytes.length) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.length - offset) {
        throw new AnnotationStoreError('The annotation event write made no valid progress.', 'corrupt')
      }
      offset += bytesWritten
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function withLock<T>(projectPath: string, operation: (projectId: string) => Promise<T>): Promise<T> {
  const projectId = await readProjectId(projectPath)
  const lock = await acquirePackageWriteLock({
    workspaceRoot: path.dirname(projectPath),
    projectId,
  })
  try {
    // Same discipline as the memory store's withProjectLock: the manifest was read before
    // the lock was held, so re-read it under the lock and refuse if the package changed
    // identity in between — the lock taken would be keyed to the wrong project.
    const lockedProjectId = await readProjectId(projectPath)
    if (lockedProjectId !== projectId) {
      throw new AnnotationStoreError(
        `The package changed identity while the lock was being acquired (${projectId} → ${lockedProjectId}).`,
        'conflict')
    }
    return await operation(projectId)
  } finally {
    await lock.release()
  }
}

/** Hash of a record's language — claim and detail, never status or supersedes. */
export function recordLanguageFingerprint(record: ProjectMemoryRecord): RecordLanguageFingerprint {
  return {
    recordId: record.id,
    contentHash: sha256Hex(JSON.stringify({ claim: record.claim, detail: record.detail ?? null })),
  }
}

export interface PendingQuestion {
  annotationId: string
  status: 'new' | 'proposed'
  locator: PhraseLocator
  candidateRecordIds: string[]
  /** Fixed server-rendered framing. No model writes this, so no record can shape it. */
  questionText: string
}

function renderQuestionText(locator: PhraseLocator, candidateCount: number): string {
  return [
    `In the decision recorded at ${locator.recordId}, the wording`,
    `“${locator.sentence}”`,
    `appears to point at another decision (the phrase “${locator.phrase}”).`,
    candidateCount > 0
      ? 'Which records does it refer to? Choose from the candidates, or answer cant-say.'
      : 'No other displayed decision is available as a referent. Answer cant-say, or decline if this is not really a reference.',
  ].join('\n')
}

/**
 * Candidates a referent may be chosen from: every record the report itself displays,
 * except the referencing record. Restricting to displayed records matters twice over — a
 * referent invisible to the reader would render as a dead id, and the fidelity check would
 * rightly flag its citation as dangling. The writer picks; nothing infers.
 */
function candidateIds(snapshot: ProjectMemorySnapshot, referencingId: string): string[] {
  return buildStandingEntries(snapshot)
    .map(e => e.record.id)
    .filter(id => id !== referencingId)
    .sort()
}

/**
 * Opaque hash of a question's premise as shown to the writer: the referencing record's
 * language, the exact sentence quoted, and the offered candidates with their language.
 * The annotation id deliberately excludes the sentence, so it alone cannot prove the
 * writer answered the question they were looking at; this can.
 */
export function questionVersionFor(snapshot: ProjectMemorySnapshot, question: PendingQuestion): string {
  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  const referencing = byId.get(question.locator.recordId)
  return sha256Hex(JSON.stringify({
    referencing: referencing ? recordLanguageFingerprint(referencing).contentHash : null,
    sentence: question.locator.sentence,
    candidates: [...question.candidateRecordIds].sort().map(id => {
      const record = byId.get(id)
      return { id, hash: record ? recordLanguageFingerprint(record).contentHash : null }
    }),
  }))
}

export type WhatsStandingAnswer =
  | { kind: 'referents'; recordIds: string[] }
  | { kind: 'cant-say' }
  | { kind: 'decline' }

export interface AnnotationQueries {
  state(projectPath: string): Promise<AnnotationLogState>
  /**
   * Questions the writer could answer right now: cue matches with no annotation yet, plus
   * annotations already proposed but unanswered. Declined and approved cues stay silent
   * while the language they were judged against is unchanged (the fingerprint check —
   * enforced in full in the invalidation slice; here a decline suppresses unconditionally).
   */
  pendingQuestions(projectPath: string, snapshot: ProjectMemorySnapshot): Promise<PendingQuestion[]>
  propose(projectPath: string, snapshot: ProjectMemorySnapshot, annotationId: string, runId: string): Promise<AnnotationState>
  approve(projectPath: string, snapshot: ProjectMemorySnapshot, annotationId: string, referentRecordIds: string[], runId: string): Promise<AnnotationState>
  decline(projectPath: string, snapshot: ProjectMemorySnapshot, annotationId: string, reason: 'declined' | 'cant-say', runId: string): Promise<AnnotationState>
  answerQuestion(projectPath: string, input: {
    annotationId: string
    questionVersion: string
    answer: WhatsStandingAnswer
    runId: string
  }): Promise<AnnotationState>
}

function cueQuestions(snapshot: ProjectMemorySnapshot): Map<string, PhraseLocator> {
  const out = new Map<string, PhraseLocator>()
  // Derived from the standing entries — the exact set of records the report displays — so
  // the CLI never asks a question whose resolution the report could not show. A record can
  // be active yet undisplayed (non-canon kind, safety-flagged); its cues are not questions.
  for (const entry of buildStandingEntries(snapshot)) {
    for (const cue of entry.cues) {
      const locator: PhraseLocator = {
        recordId: entry.record.id,
        field: cue.field,
        sentence: cue.sentence,
        phrase: cue.phrase,
        occurrence: cue.occurrence,
        cue: cue.cue,
        phraseHash: phraseHashFor(cue.phrase, cue.sentence),
      }
      out.set(annotationIdFor(locator), locator)
    }
  }
  return out
}

/**
 * Validate an event against the replayed state BEFORE anything is written. The replay rules
 * in applyAnnotationEvent are the single authority on legal events — e.g. a referent that
 * exists in memory but was never among the proposal's candidates — so they must run as a
 * preflight: an illegal line appended durably would halt every future replay and leave the
 * whole log unreadable.
 */
function preflightAnnotationEvent(state: AnnotationLogState, event: AnnotationEvent): AnnotationLogState {
  try {
    return applyAnnotationEvent(state, AnnotationEventSchema.parse(event), -1)
  } catch (error) {
    if (error instanceof AnnotationReplayError) {
      throw new AnnotationStoreError(
        `Refused annotation event: ${error.message.replace(/^memory\/annotations\.jsonl:-1: /, '')}`,
        'invalid-input')
    }
    if (error instanceof z.ZodError) {
      throw new AnnotationStoreError(
        `Refused annotation event: ${error.issues[0]?.message ?? 'schema validation failed'}`,
        'invalid-input')
    }
    throw error
  }
}

/**
 * The answer-time revalidation the design requires: before an answer is written, the record
 * whose wording the question quoted must still exist and still carry that wording. The
 * baseline is the fingerprint captured at proposal time; comparison is language only, so an
 * unrelated publish — or a status flip on this very record — never blocks an answer.
 */
function requireUnmovedReferencing(
  current: ProjectMemorySnapshot,
  existing: AnnotationState,
): ProjectMemoryRecord {
  const referencing = current.records.find(r => r.id === existing.locator.recordId)
  if (referencing === undefined) {
    throw new AnnotationStoreError(
      `The record this question quotes (${existing.locator.recordId}) is no longer in memory. Run the questions command again.`,
      'conflict')
  }
  const baseline = existing.support.find(f => f.recordId === existing.locator.recordId)
  if (baseline !== undefined && recordLanguageFingerprint(referencing).contentHash !== baseline.contentHash) {
    throw new AnnotationStoreError(
      `The wording of ${existing.locator.recordId} has changed since this question was asked. Run the questions command again.`,
      'conflict')
  }
  return referencing
}

/**
 * Pure derivation of pending questions from annotation state already held in memory — no
 * I/O of its own. Exported so callers that already hold a consistent (state, snapshot) pair
 * (the What's Standing report helper) can derive questions from it directly, instead of
 * going through `pendingQuestions` below and triggering a third, redundant replay of the
 * annotation log.
 */
export function derivePendingQuestions(state: AnnotationLogState, snapshot: ProjectMemorySnapshot): PendingQuestion[] {
  const questions: PendingQuestion[] = []
  for (const [annotationId, locator] of cueQuestions(snapshot)) {
    const existing = state.annotations.get(annotationId)
    // An invalidated annotation's question is open again: re-derive it fresh, exactly
    // as if it had never been asked, so it is answerable rather than a dead end.
    if (existing === undefined || existing.status === 'invalidated') {
      const candidateRecordIds = candidateIds(snapshot, locator.recordId)
      questions.push({
        annotationId,
        status: 'new',
        locator,
        candidateRecordIds,
        questionText: renderQuestionText(locator, candidateRecordIds.length),
      })
      continue
    }
    if (existing.status === 'proposed') {
      questions.push({
        annotationId,
        status: 'proposed',
        locator: existing.locator,
        candidateRecordIds: existing.candidateRecordIds,
        questionText: renderQuestionText(existing.locator, existing.candidateRecordIds.length),
      })
    }
    // approved / declined: nothing to ask. Re-asking after the language changes is
    // the invalidation slice's job.
  }
  return questions.sort((a, b) => (a.annotationId < b.annotationId ? -1 : 1))
}

export function createAnnotationStore(): AnnotationQueries {
  return {
    async state(projectPath) {
      const projectId = await readProjectId(projectPath)
      return replayAnnotations(projectPath, projectId)
    },

    async pendingQuestions(projectPath, snapshot) {
      return derivePendingQuestions(await this.state(projectPath), snapshot)
    },

    async propose(projectPath, snapshot, annotationId, runId) {
      return withLock(projectPath, async projectId => {
        if (snapshot.projectId !== projectId) {
          throw new AnnotationStoreError('Snapshot does not belong to this project.', 'invalid-input')
        }
        const state = await replayAnnotations(projectPath, projectId)
        // Revalidate under the lock: the caller's snapshot was read before the lock was
        // held, so the question is re-derived from memory as it is NOW. If the cue no
        // longer exists — the wording changed, the record left the displayed set — there
        // is no premise to propose.
        const current = await projectMemoryStore.readSnapshotReadOnlyInHeldLock(projectPath, projectId)
        const locator = cueQuestions(current).get(annotationId)
        if (locator === undefined) {
          throw new AnnotationStoreError(
            'No such question in the current memory. It may have been settled by an edit; run the questions command again.',
            'not-found')
        }
        const existing = state.annotations.get(annotationId)
        if (existing !== undefined && existing.status !== 'declined' && existing.status !== 'invalidated') {
          if (existing.status === 'proposed') return existing
          throw new AnnotationStoreError(`Annotation is already ${existing.status}.`, 'conflict')
        }
        const referencing = current.records.find(r => r.id === locator.recordId)
        if (referencing === undefined) {
          throw new AnnotationStoreError('Referencing record vanished from the snapshot.', 'conflict')
        }
        const event: AnnotationEvent = {
          type: 'annotation-proposed',
          projectId,
          annotationId,
          annotationRevision: state.revision + 1,
          at: new Date().toISOString(),
          questionType: 'resolve-reference',
          locator,
          candidateRecordIds: candidateIds(current, locator.recordId),
          support: [recordLanguageFingerprint(referencing)],
          runId,
        }
        const next = preflightAnnotationEvent(state, event)
        await appendAnnotationEvent(projectPath, event)
        return next.annotations.get(annotationId) as AnnotationState
      })
    },

    async approve(projectPath, snapshot, annotationId, referentRecordIds, runId) {
      return withLock(projectPath, async projectId => {
        if (snapshot.projectId !== projectId) {
          throw new AnnotationStoreError('Snapshot does not belong to this project.', 'invalid-input')
        }
        const state = await replayAnnotations(projectPath, projectId)
        const existing = state.annotations.get(annotationId)
        if (existing === undefined) throw new AnnotationStoreError('Unknown annotation.', 'not-found')
        if (existing.status !== 'proposed') {
          throw new AnnotationStoreError(`Cannot approve an annotation in status "${existing.status}".`, 'conflict')
        }
        const current = await projectMemoryStore.readSnapshotReadOnlyInHeldLock(projectPath, projectId)
        const referencing = requireUnmovedReferencing(current, existing)
        const support: RecordLanguageFingerprint[] = [recordLanguageFingerprint(referencing)]
        for (const id of referentRecordIds) {
          const referent = current.records.find(r => r.id === id)
          if (referent === undefined) {
            throw new AnnotationStoreError(`Chosen referent ${id} is not in the snapshot.`, 'invalid-input')
          }
          support.push(recordLanguageFingerprint(referent))
        }
        const event: AnnotationEvent = {
          type: 'annotation-approved',
          projectId,
          annotationId,
          annotationRevision: state.revision + 1,
          at: new Date().toISOString(),
          referentRecordIds,
          support,
          actor: 'writer',
          runId,
        }
        const next = preflightAnnotationEvent(state, event)
        await appendAnnotationEvent(projectPath, event)
        return next.annotations.get(annotationId) as AnnotationState
      })
    },

    async decline(projectPath, snapshot, annotationId, reason, runId) {
      return withLock(projectPath, async projectId => {
        if (snapshot.projectId !== projectId) {
          throw new AnnotationStoreError('Snapshot does not belong to this project.', 'invalid-input')
        }
        const state = await replayAnnotations(projectPath, projectId)
        const existing = state.annotations.get(annotationId)
        if (existing === undefined) throw new AnnotationStoreError('Unknown annotation.', 'not-found')
        if (existing.status !== 'proposed') {
          throw new AnnotationStoreError(`Cannot decline an annotation in status "${existing.status}".`, 'conflict')
        }
        const current = await projectMemoryStore.readSnapshotReadOnlyInHeldLock(projectPath, projectId)
        const referencing = requireUnmovedReferencing(current, existing)
        const event: AnnotationEvent = {
          type: 'annotation-declined',
          projectId,
          annotationId,
          annotationRevision: state.revision + 1,
          at: new Date().toISOString(),
          reason,
          support: [recordLanguageFingerprint(referencing)],
          actor: 'writer',
          runId,
        }
        const next = preflightAnnotationEvent(state, event)
        await appendAnnotationEvent(projectPath, event)
        return next.annotations.get(annotationId) as AnnotationState
      })
    },

    async answerQuestion(projectPath, input) {
      return withLock(projectPath, async projectId => {
        const state = await replayAnnotations(projectPath, projectId)
        const current = await projectMemoryStore.readSnapshotReadOnlyInHeldLock(projectPath, projectId)
        const question = derivePendingQuestions(state, current)
          .find(q => q.annotationId === input.annotationId)
        if (question === undefined) {
          throw new AnnotationStoreError('No such open question. Refresh the report.', 'not-found')
        }
        if (questionVersionFor(current, question) !== input.questionVersion) {
          throw new AnnotationStoreError(
            'This question changed since it was shown. Refresh the report and answer the current version.',
            'conflict')
        }

        const referencing = current.records.find(r => r.id === question.locator.recordId)
        if (referencing === undefined) {
          throw new AnnotationStoreError('The record this question quotes is no longer in memory.', 'conflict')
        }

        const at = new Date().toISOString()
        const events: AnnotationEvent[] = []
        let revision = state.revision
        if (question.status === 'new') {
          events.push({
            type: 'annotation-proposed',
            projectId,
            annotationId: input.annotationId,
            annotationRevision: ++revision,
            at,
            questionType: 'resolve-reference',
            locator: question.locator,
            candidateRecordIds: question.candidateRecordIds,
            support: [recordLanguageFingerprint(referencing)],
            runId: input.runId,
          })
        }

        if (input.answer.kind === 'referents') {
          const chosen = [...new Set(input.answer.recordIds)]
          if (chosen.length === 0) {
            throw new AnnotationStoreError('An answer needs at least one referent.', 'invalid-input')
          }
          const candidates = new Set(question.candidateRecordIds)
          const support: RecordLanguageFingerprint[] = [recordLanguageFingerprint(referencing)]
          for (const id of chosen) {
            if (!candidates.has(id)) {
              throw new AnnotationStoreError(`${id} is not among this question's candidates.`, 'invalid-input')
            }
            const referent = current.records.find(r => r.id === id)
            if (referent === undefined) {
              throw new AnnotationStoreError(`Chosen referent ${id} is not in the snapshot.`, 'invalid-input')
            }
            support.push(recordLanguageFingerprint(referent))
          }
          events.push({
            type: 'annotation-approved',
            projectId,
            annotationId: input.annotationId,
            annotationRevision: ++revision,
            at,
            referentRecordIds: chosen,
            support,
            actor: 'writer',
            runId: input.runId,
          })
        } else {
          events.push({
            type: 'annotation-declined',
            projectId,
            annotationId: input.annotationId,
            annotationRevision: ++revision,
            at,
            reason: input.answer.kind === 'cant-say' ? 'cant-say' : 'declined',
            support: [recordLanguageFingerprint(referencing)],
            actor: 'writer',
            runId: input.runId,
          })
        }

        // Preflight EVERY event against the replayed state before ANY append. An error
        // response must never leave the log changed; an illegal line appended durably
        // would brick every future replay.
        let next = state
        for (const event of events) next = preflightAnnotationEvent(next, event)
        for (const event of events) await appendAnnotationEvent(projectPath, event)
        return next.annotations.get(input.annotationId) as AnnotationState
      })
    },
  }
}

export const annotationStore = createAnnotationStore()
