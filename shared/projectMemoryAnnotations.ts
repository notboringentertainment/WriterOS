import { z } from 'zod'
import { sha256Hex } from './compose/sha256'
import type { ProjectMemoryRecord, ProjectMemorySnapshot } from './projectMemory'

/**
 * Reference annotations — the writer's answers to "what does this phrase point at?"
 *
 * These live in their own event log (`memory/annotations.jsonl`), deliberately NOT in the
 * memory ledger: a sixth memory event type would leave an older build unable to replay a
 * ledger it meets, and annotations are a different species of knowledge. They are never
 * canon, never enter retrieval, and never mutate a record. The only thing an annotation may
 * say is which records a phrase in another record's own wording denotes — it can never
 * speak about a record's status or supersession, which the memory store owns.
 *
 * The log is append-only. "State" (proposed / approved / declined) is a replay outcome,
 * not a mutable field: each transition is its own event, so a decline is durable and the
 * same question is never re-asked while the language it was asked about is unchanged.
 */

const IdentifierSchema = z.string().min(1).max(200)
const TimestampSchema = z.string().datetime()
const HashSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const AnnotationQuestionTypeSchema = z.enum(['resolve-reference'])

/**
 * Where, exactly, the questioned phrase lives. Without this an annotation is
 * unreconstructable: a record id alone cannot say which words were resolved, and the server
 * needs the structure to render the question with fixed framing — no model authors the
 * question text, so an untrusted claim cannot shape what the writer is asked.
 */
export const PhraseLocatorSchema = z.object({
  recordId: IdentifierSchema,
  field: z.enum(['claim', 'detail']),
  /** The sentence containing the cue, quoted verbatim. */
  sentence: z.string().min(1).max(2_000),
  /** The exact text the cue matched, within that sentence. */
  phrase: z.string().min(1).max(500),
  /** 0-based index of this match among the record's matches, in document order. */
  occurrence: z.number().int().min(0),
  /** Which named cue pattern matched — diagnostics, never shown to the writer. */
  cue: z.string().min(1).max(100),
  /**
   * Hash of the phrase plus its containing sentence — the bounded window the design
   * requires so invalidation can tell "this exact wording moved" without re-deriving cues.
   * Optional because early logs were written before it existed; every new event carries it.
   */
  phraseHash: HashSchema.optional(),
}).strict()

/**
 * Fingerprint of one record's language at the moment an event was written. Covers claim
 * and detail — deliberately NOT status or supersedes: a decision moving from in-force to
 * superseded does not change what a phrase denotes, and including standing would re-ask
 * questions whose answers are still right. Reports read standing fields live instead.
 */
export const RecordLanguageFingerprintSchema = z.object({
  recordId: IdentifierSchema,
  contentHash: HashSchema,
}).strict()

const EventBaseSchema = z.object({
  projectId: IdentifierSchema,
  annotationId: IdentifierSchema,
  /** Revision of the annotation log after this event applies; 1-based, strictly +1. */
  annotationRevision: z.number().int().min(1),
  at: TimestampSchema,
})

export const AnnotationProposedEventSchema = EventBaseSchema.extend({
  type: z.literal('annotation-proposed'),
  questionType: AnnotationQuestionTypeSchema,
  locator: PhraseLocatorSchema,
  /**
   * The ids the writer may choose among. An answer outside this list is invalid. Captured
   * at proposal time so an answer is always judged against the choices actually offered.
   * May be empty — a project displaying only the referencing record has no candidates to
   * offer, but the writer must still be able to record cant-say or decline.
   */
  candidateRecordIds: z.array(IdentifierSchema).max(200),
  /** Language fingerprints of the referencing record — proof of what was asked about. */
  support: z.array(RecordLanguageFingerprintSchema).min(1).max(50),
  runId: IdentifierSchema,
}).strict()

export const AnnotationApprovedEventSchema = EventBaseSchema.extend({
  type: z.literal('annotation-approved'),
  /** The records the writer says the phrase denotes. Subset of the proposal's candidates. */
  referentRecordIds: z.array(IdentifierSchema).min(1).max(50),
  /** Fingerprints of the referencing record AND every chosen referent at answer time. */
  support: z.array(RecordLanguageFingerprintSchema).min(1).max(100),
  actor: z.literal('writer'),
  runId: IdentifierSchema,
}).strict()

export const AnnotationDeclinedEventSchema = EventBaseSchema.extend({
  type: z.literal('annotation-declined'),
  /** `cant-say` keeps readiness incomplete; both suppress re-asking while language holds. */
  reason: z.enum(['declined', 'cant-say']),
  /** Fingerprints at decline time — without these, the re-ask rule has nothing to compare. */
  support: z.array(RecordLanguageFingerprintSchema).min(1).max(50),
  actor: z.literal('writer'),
  runId: IdentifierSchema,
}).strict()

export const AnnotationInvalidatedEventSchema = EventBaseSchema.extend({
  type: z.literal('annotation-invalidated'),
  cause: z.enum(['language-changed', 'record-removed']),
  changedRecordId: IdentifierSchema,
  previousContentHash: HashSchema.optional(),
  currentContentHash: HashSchema.optional(),
}).strict()

export const AnnotationEventSchema = z.discriminatedUnion('type', [
  AnnotationProposedEventSchema,
  AnnotationApprovedEventSchema,
  AnnotationDeclinedEventSchema,
  AnnotationInvalidatedEventSchema,
])

export type AnnotationEvent = z.infer<typeof AnnotationEventSchema>
export type PhraseLocator = z.infer<typeof PhraseLocatorSchema>
export type RecordLanguageFingerprint = z.infer<typeof RecordLanguageFingerprintSchema>

/** Hash of the phrase plus its containing sentence — the locator's persisted `phraseHash`. */
export function phraseHashFor(phrase: string, sentence: string): string {
  return sha256Hex(JSON.stringify({ phrase, sentence }))
}

/**
 * Deterministic annotation id: the same phrase at the same spot in the same record always
 * yields the same id, so a crashed or retried run re-derives the identical question instead
 * of proposing a duplicate. `phraseHash` is deliberately excluded — adding it later must not
 * orphan annotations already written without it.
 */
export function annotationIdFor(locator: PhraseLocator): string {
  return `ann_${sha256Hex(JSON.stringify({
    recordId: locator.recordId,
    field: locator.field,
    phrase: locator.phrase,
    occurrence: locator.occurrence,
  })).slice(0, 32)}`
}

/** Hash of a record's language — claim and detail, never status or supersedes. */
export function recordLanguageFingerprint(record: ProjectMemoryRecord): RecordLanguageFingerprint {
  return {
    recordId: record.id,
    contentHash: sha256Hex(JSON.stringify({ claim: record.claim, detail: record.detail ?? null })),
  }
}

export type AnnotationStaleness =
  | { stale: false }
  | { stale: true
      cause: 'language-changed' | 'record-removed'
      changedRecordId: string
      previousContentHash?: string
      currentContentHash?: string }

/**
 * Does an annotation's premise still hold? Compares its stored support fingerprints
 * against the current snapshot, in support order; the FIRST divergence wins, matching
 * the invalidated event's single changedRecordId. Only language (claim/detail) and
 * record presence are visible here — status, supersedes, and safety flips can never
 * make an annotation stale, which is the design's guardrail against over-firing.
 */
export function annotationStaleness(
  support: RecordLanguageFingerprint[],
  snapshot: Pick<ProjectMemorySnapshot, 'records'>,
): AnnotationStaleness {
  const byId = new Map(snapshot.records.map(r => [r.id, r]))
  for (const fingerprint of support) {
    const current = byId.get(fingerprint.recordId)
    if (current === undefined) {
      return {
        stale: true, cause: 'record-removed', changedRecordId: fingerprint.recordId,
        previousContentHash: fingerprint.contentHash,
      }
    }
    const currentHash = recordLanguageFingerprint(current).contentHash
    if (currentHash !== fingerprint.contentHash) {
      return {
        stale: true, cause: 'language-changed', changedRecordId: fingerprint.recordId,
        previousContentHash: fingerprint.contentHash, currentContentHash: currentHash,
      }
    }
  }
  return { stale: false }
}

/** Replay outcome for one annotation. */
export type AnnotationStatus = 'proposed' | 'approved' | 'declined' | 'invalidated'

export interface AnnotationState {
  annotationId: string
  status: AnnotationStatus
  questionType: z.infer<typeof AnnotationQuestionTypeSchema>
  locator: PhraseLocator
  candidateRecordIds: string[]
  /** Present only when approved. */
  referentRecordIds?: string[]
  /** Present only when declined. */
  declineReason?: 'declined' | 'cant-say'
  /** Fingerprints from the most recent proposal/approval/decline — the re-ask baseline. */
  support: RecordLanguageFingerprint[]
  updatedAt: string
}

export interface AnnotationLogState {
  projectId: string
  revision: number
  annotations: Map<string, AnnotationState>
}

/**
 * Legal transitions. proposed → approved | declined; approved → invalidated;
 * declined → proposed (re-ask) only once the language it was declined against has moved —
 * the store enforces the fingerprint check; this table enforces the shape. An invalidated
 * annotation may also be re-proposed — its question is open again and must be answerable,
 * never a dead end — but never approved directly: approval requires a live proposal.
 */
const TRANSITIONS: Record<string, AnnotationStatus[]> = {
  'annotation-proposed': ['declined', 'invalidated'], // a settled question may be re-opened
  'annotation-approved': ['proposed'],
  'annotation-declined': ['proposed'],
  'annotation-invalidated': ['approved'],
}

export class AnnotationReplayError extends Error {
  constructor(
    message: string,
    readonly lineNumber: number,
  ) {
    super(`memory/annotations.jsonl:${lineNumber}: ${message}`)
    this.name = 'AnnotationReplayError'
  }
}

export function applyAnnotationEvent(
  state: AnnotationLogState,
  event: AnnotationEvent,
  lineNumber: number,
): AnnotationLogState {
  if (event.projectId !== state.projectId) {
    throw new AnnotationReplayError(`event projectId ${event.projectId} does not match ${state.projectId}.`, lineNumber)
  }
  if (event.annotationRevision !== state.revision + 1) {
    throw new AnnotationReplayError(
      `revision ${event.annotationRevision} does not follow ${state.revision}.`, lineNumber)
  }

  const existing = state.annotations.get(event.annotationId)
  const allowedFrom = TRANSITIONS[event.type]
  if (event.type === 'annotation-proposed') {
    if (existing !== undefined && !allowedFrom.includes(existing.status)) {
      throw new AnnotationReplayError(
        `cannot re-propose annotation in status "${existing.status}".`, lineNumber)
    }
  } else {
    if (existing === undefined) {
      throw new AnnotationReplayError(`${event.type} for unknown annotation ${event.annotationId}.`, lineNumber)
    }
    if (!allowedFrom.includes(existing.status)) {
      throw new AnnotationReplayError(
        `${event.type} is not legal from status "${existing.status}".`, lineNumber)
    }
  }

  const annotations = new Map(state.annotations)
  switch (event.type) {
    case 'annotation-proposed':
      annotations.set(event.annotationId, {
        annotationId: event.annotationId,
        status: 'proposed',
        questionType: event.questionType,
        locator: event.locator,
        candidateRecordIds: [...event.candidateRecordIds],
        support: [...event.support],
        updatedAt: event.at,
      })
      break
    case 'annotation-approved': {
      const base = existing as AnnotationState
      const candidates = new Set(base.candidateRecordIds)
      for (const id of event.referentRecordIds) {
        if (!candidates.has(id)) {
          throw new AnnotationReplayError(
            `referent ${id} was not among the proposal's candidates.`, lineNumber)
        }
      }
      annotations.set(event.annotationId, {
        ...base,
        status: 'approved',
        referentRecordIds: [...event.referentRecordIds],
        support: [...event.support],
        updatedAt: event.at,
      })
      break
    }
    case 'annotation-declined':
      annotations.set(event.annotationId, {
        ...(existing as AnnotationState),
        status: 'declined',
        declineReason: event.reason,
        support: [...event.support],
        updatedAt: event.at,
      })
      break
    case 'annotation-invalidated':
      annotations.set(event.annotationId, {
        ...(existing as AnnotationState),
        status: 'invalidated',
        updatedAt: event.at,
      })
      break
  }

  return { projectId: state.projectId, revision: event.annotationRevision, annotations }
}
