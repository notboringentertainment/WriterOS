import { constants } from 'node:fs'
import { lstat, open, readFile } from 'node:fs/promises'
import path from 'node:path'
import { acquirePackageWriteLock } from '../projectLibrary/packageLock'
import { sha256Hex } from '../../shared/compose/sha256'
import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '../../shared/projectMemory'
import {
  AnnotationEventSchema,
  AnnotationReplayError,
  applyAnnotationEvent,
  type AnnotationEvent,
  type AnnotationLogState,
  type AnnotationState,
  type PhraseLocator,
  type RecordLanguageFingerprint,
} from '../../shared/projectMemoryAnnotations'
import { findCues } from '../../shared/compose/whatsStandingCues'
import { buildStandingEntries } from '../../shared/compose/whatsStandingFactSheet'

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

/**
 * Deterministic annotation id: the same phrase at the same spot in the same record always
 * yields the same id, so a crashed or retried run re-derives the identical question instead
 * of proposing a duplicate.
 */
export function annotationIdFor(locator: PhraseLocator): string {
  return `ann_${sha256Hex(JSON.stringify({
    recordId: locator.recordId,
    field: locator.field,
    phrase: locator.phrase,
    occurrence: locator.occurrence,
  })).slice(0, 32)}`
}

export interface PendingQuestion {
  annotationId: string
  status: 'new' | 'proposed'
  locator: PhraseLocator
  candidateRecordIds: string[]
  /** Fixed server-rendered framing. No model writes this, so no record can shape it. */
  questionText: string
}

function renderQuestionText(locator: PhraseLocator): string {
  return [
    `In the decision recorded at ${locator.recordId}, the wording`,
    `“${locator.sentence}”`,
    `appears to point at another decision (the phrase “${locator.phrase}”).`,
    'Which records does it refer to? Choose from the candidates, or answer cant-say.',
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
}

function cueQuestions(snapshot: ProjectMemorySnapshot): Map<string, PhraseLocator> {
  const out = new Map<string, PhraseLocator>()
  for (const record of snapshot.records) {
    if (record.status !== 'active' && record.status !== 'candidate') continue
    const cues = [...findCues('claim', record.claim), ...findCues('detail', record.detail)]
    for (const cue of cues) {
      const locator: PhraseLocator = {
        recordId: record.id,
        field: cue.field,
        sentence: cue.sentence,
        phrase: cue.phrase,
        occurrence: cue.occurrence,
        cue: cue.cue,
      }
      out.set(annotationIdFor(locator), locator)
    }
  }
  return out
}

export function createAnnotationStore(): AnnotationQueries {
  return {
    async state(projectPath) {
      const projectId = await readProjectId(projectPath)
      return replayAnnotations(projectPath, projectId)
    },

    async pendingQuestions(projectPath, snapshot) {
      const state = await this.state(projectPath)
      const questions: PendingQuestion[] = []
      for (const [annotationId, locator] of cueQuestions(snapshot)) {
        const existing = state.annotations.get(annotationId)
        if (existing === undefined) {
          questions.push({
            annotationId,
            status: 'new',
            locator,
            candidateRecordIds: candidateIds(snapshot, locator.recordId),
            questionText: renderQuestionText(locator),
          })
          continue
        }
        if (existing.status === 'proposed') {
          questions.push({
            annotationId,
            status: 'proposed',
            locator: existing.locator,
            candidateRecordIds: existing.candidateRecordIds,
            questionText: renderQuestionText(existing.locator),
          })
        }
        // approved / declined / invalidated: nothing to ask. Re-asking after the language
        // changes is the invalidation slice's job.
      }
      return questions.sort((a, b) => (a.annotationId < b.annotationId ? -1 : 1))
    },

    async propose(projectPath, snapshot, annotationId, runId) {
      return withLock(projectPath, async projectId => {
        if (snapshot.projectId !== projectId) {
          throw new AnnotationStoreError('Snapshot does not belong to this project.', 'invalid-input')
        }
        const state = await replayAnnotations(projectPath, projectId)
        const locator = cueQuestions(snapshot).get(annotationId)
        if (locator === undefined) {
          throw new AnnotationStoreError('No such question in the current snapshot.', 'not-found')
        }
        const existing = state.annotations.get(annotationId)
        if (existing !== undefined && existing.status !== 'declined') {
          if (existing.status === 'proposed') return existing
          throw new AnnotationStoreError(`Annotation is already ${existing.status}.`, 'conflict')
        }
        const referencing = snapshot.records.find(r => r.id === locator.recordId)
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
          candidateRecordIds: candidateIds(snapshot, locator.recordId),
          support: [recordLanguageFingerprint(referencing)],
          runId,
        }
        await appendAnnotationEvent(projectPath, event)
        return applyAnnotationEvent(state, event, -1).annotations.get(annotationId) as AnnotationState
      })
    },

    async approve(projectPath, snapshot, annotationId, referentRecordIds, runId) {
      return withLock(projectPath, async projectId => {
        const state = await replayAnnotations(projectPath, projectId)
        const existing = state.annotations.get(annotationId)
        if (existing === undefined) throw new AnnotationStoreError('Unknown annotation.', 'not-found')
        if (existing.status !== 'proposed') {
          throw new AnnotationStoreError(`Cannot approve an annotation in status "${existing.status}".`, 'conflict')
        }
        const referencing = snapshot.records.find(r => r.id === existing.locator.recordId)
        if (referencing === undefined) {
          throw new AnnotationStoreError('Referencing record vanished from the snapshot.', 'conflict')
        }
        const support: RecordLanguageFingerprint[] = [recordLanguageFingerprint(referencing)]
        for (const id of referentRecordIds) {
          const referent = snapshot.records.find(r => r.id === id)
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
        await appendAnnotationEvent(projectPath, event)
        return applyAnnotationEvent(state, event, -1).annotations.get(annotationId) as AnnotationState
      })
    },

    async decline(projectPath, snapshot, annotationId, reason, runId) {
      return withLock(projectPath, async projectId => {
        const state = await replayAnnotations(projectPath, projectId)
        const existing = state.annotations.get(annotationId)
        if (existing === undefined) throw new AnnotationStoreError('Unknown annotation.', 'not-found')
        if (existing.status !== 'proposed') {
          throw new AnnotationStoreError(`Cannot decline an annotation in status "${existing.status}".`, 'conflict')
        }
        const referencing = snapshot.records.find(r => r.id === existing.locator.recordId)
        const support = referencing !== undefined
          ? [recordLanguageFingerprint(referencing)]
          : existing.support
        const event: AnnotationEvent = {
          type: 'annotation-declined',
          projectId,
          annotationId,
          annotationRevision: state.revision + 1,
          at: new Date().toISOString(),
          reason,
          support,
          actor: 'writer',
          runId,
        }
        await appendAnnotationEvent(projectPath, event)
        return applyAnnotationEvent(state, event, -1).annotations.get(annotationId) as AnnotationState
      })
    },
  }
}

export const annotationStore = createAnnotationStore()
