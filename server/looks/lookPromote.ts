import { canonicalJson, lookHash } from '../../shared/canonicalJson'
import {
  findFirewallProblems,
  trimLookStrings,
  validateLookSpecForPromotion,
  type LookSpec,
  type LookSpecProblem,
  type WriterOSDependencyRef,
} from '../../shared/lookSpec'
import { SERVER_SET_LOOK_FIELDS, type LookPromoteRequest, type LookPromoteResponse } from '../../shared/looks'
import type { MemoryPayload, ProjectMemoryRecord, ProjectMemorySnapshot } from '../../shared/projectMemory'
import { renderLookYaml } from '../projectMemory/projections'
import { ProjectMemoryStoreError, type ProjectMemoryStore } from '../projectMemory/store'
import { ensureCurrentLookExport, writeLookLocksExport } from './lookExport'

// Promote: turn a writer-typed look block into an active canon record and
// write the look-locks export, in one publication under the package lock
// (look sessions plan, Task 3). Promotion is not ratification: OpenMontage's
// look_lock receipt, approved by Ben in a terminal, is the only ratification.

export const CURRENT_LOOK_SPEC_VERSION = '1.1' as const
const DETAIL_LIMIT = 8_000
const CLAIM_LIMIT = 600

export class LookPromoteError extends Error {
  readonly name = 'LookPromoteError'
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly problems: LookSpecProblem[] = [],
  ) {
    super(message)
  }
}

export interface LookPromoteDeps {
  memoryStore: ProjectMemoryStore
  projectPath: string
  projectId: string
  now?: () => string
  /** @internal Replaced in tests to exercise a failing export write. */
  writeExport?: typeof writeLookLocksExport
}

export function lookPromoteDedupeKey(promotionOpId: string): string {
  return `writeros:look-promote:${promotionOpId}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function citedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

/** A true retry resends the same fields, citations and reference as the original click. */
function sameContent(stored: Extract<MemoryPayload, { kind: 'look_spec' }>, request: LookPromoteRequest): boolean {
  if (stored.reference !== request.reference || !isPlainObject(request.spec)) return false
  const storedCitations = stored.spec.depends_on
    .flatMap(ref => ('writeros_record_id' in ref ? [ref.writeros_record_id] : []))
  if (canonicalJson(storedCitations) !== canonicalJson(citedIds(request.citedRecordIds))) return false
  try {
    return canonicalJson({ ...stored.spec, depends_on: [] })
      === canonicalJson({ ...request.spec, version: CURRENT_LOOK_SPEC_VERSION, depends_on: [] })
  } catch {
    return false
  }
}

function deriveDependencies(snapshot: ProjectMemorySnapshot, ids: readonly string[]): WriterOSDependencyRef[] {
  const unknown: string[] = []
  const refs: WriterOSDependencyRef[] = []
  for (const id of citedIds(ids)) {
    const record = snapshot.records.find(candidate => candidate.id === id)
    if (!record || record.status !== 'active' || !/^[a-f0-9]{64}$/.test(record.source.sourceHash)) {
      unknown.push(id)
      continue
    }
    refs.push({ writeros_record_id: record.id, content_hash: record.source.sourceHash })
  }
  if (unknown.length > 0) {
    throw new LookPromoteError(
      400,
      'unknown-citation',
      `This look cites memory that is no longer active: ${unknown.join(', ')}. Ask Zoe again so the look cites current canon.`,
    )
  }
  return refs
}

function unattributedFields(spec: Record<string, unknown>, fieldSources: Record<string, 'writer'>): string[] {
  const serverSet = new Set<string>(SERVER_SET_LOOK_FIELDS)
  return Object.keys(spec).filter(field => !serverSet.has(field) && fieldSources[field] !== 'writer').sort()
}

function priorLookRecords(snapshot: ProjectMemorySnapshot, spec: LookSpec): ProjectMemoryRecord[] {
  return snapshot.records.filter(record => (
    record.kind === 'canon'
    && record.status === 'active'
    && record.payload?.kind === 'look_spec'
    && record.payload.spec.entity_kind === spec.entity_kind
    && record.payload.spec.entity_id === spec.entity_id
  ))
}

function claimFor(entityName: string, spec: LookSpec): string {
  const firstSentence = spec.prompt_safe_description.split(/(?<=[.!?])\s+/)[0] ?? ''
  const claim = `Look: ${entityName} — ${firstSentence}`
  return claim.length <= CLAIM_LIMIT ? claim : `${claim.slice(0, CLAIM_LIMIT - 1)}…`
}

function detailFor(spec: LookSpec): string {
  const yaml = renderLookYaml(spec)
  return yaml.length <= DETAIL_LIMIT ? yaml : `${yaml.slice(0, DETAIL_LIMIT - 1)}…`
}

export async function promoteLook(deps: LookPromoteDeps, rawRequest: LookPromoteRequest): Promise<LookPromoteResponse> {
  // Spaces at the start and end of typed text are not part of the look.
  const request: LookPromoteRequest = { ...rawRequest, spec: trimLookStrings(rawRequest.spec) }
  const { memoryStore, projectPath, projectId } = deps
  const now = deps.now ?? (() => new Date().toISOString())
  const writeExport = deps.writeExport ?? writeLookLocksExport
  const dedupeKey = lookPromoteDedupeKey(request.promotionOpId)

  // 1. Retry first, before any check that depends on current state.
  const existing = await memoryStore.findPublication(projectPath, projectId, dedupeKey)
  if (existing) {
    if (existing.payload?.kind !== 'look_spec' || !sameContent(existing.payload, request)) {
      throw new LookPromoteError(409, 'op-reused', 'This promotion was already sent with different content; click Promote again.')
    }
    return retriedResponse(deps, existing)
  }

  if (!isPlainObject(request.spec)) {
    throw new LookPromoteError(400, 'invalid-look', 'The look is missing.', [{ path: '', message: 'A look must be a set of named fields.' }])
  }
  const snapshot = await memoryStore.readSnapshotReadOnly(projectPath, projectId)

  // 2. depends_on is derived from the session's citations, never typed.
  const dependsOn = deriveDependencies(snapshot, request.citedRecordIds)

  // 3. Writer provenance, then the reference-image firewall, then the look rules.
  const missing = unattributedFields(request.spec, request.fieldSources)
  if (missing.length > 0) {
    throw new LookPromoteError(
      400,
      'unattributed-field',
      `These fields were not typed in the look form: ${missing.join(', ')}.`,
      missing.map(path => ({ path, message: `${path} was not typed in the look form.` })),
    )
  }
  const candidate = { ...request.spec, version: CURRENT_LOOK_SPEC_VERSION, depends_on: dependsOn }
  const firewall = findFirewallProblems(candidate, request.reference)
  if (firewall.length > 0) {
    throw new LookPromoteError(400, 'firewall', 'With a real person as the reference, the look may describe type only.', firewall)
  }
  const validated = validateLookSpecForPromotion(candidate)
  if (!validated.ok) {
    throw new LookPromoteError(400, 'invalid-look', 'The look is not ready to promote.', validated.problems)
  }
  const spec = validated.spec
  const hash = lookHash(spec)
  const prior = priorLookRecords(snapshot, spec)

  // 4. Publish and write the export inside the same package lock.
  let exportPath: string | null = null
  let result
  try {
    result = await memoryStore.publish(projectPath, {
      projectId,
      dedupeKey,
      kind: 'canon',
      requestedStatus: 'active',
      claim: claimFor(request.entityName, spec),
      detail: detailFor(spec),
      tags: ['look'],
      entities: [request.entityName],
      source: {
        workflow: 'writeros',
        sourceId: `looks/${spec.entity_kind}/${spec.entity_id}`,
        sourceUri: `writeros:looks/${spec.entity_kind}/${spec.entity_id}`,
        sourceHash: hash,
        capturedAt: now(),
        approval: 'explicit',
      },
      evidence: [],
      safety: 'clear',
      spoiler: spec.spoiler,
      conflictsWith: [],
      supersedes: prior.map(record => record.id),
      supersedesPriorVersions: false,
      expectedRevision: request.expectedRevision,
      payload: { kind: 'look_spec', version: CURRENT_LOOK_SPEC_VERSION, spec, lookHash: hash, reference: request.reference },
    }, {
      afterCommit: async committed => {
        exportPath = await writeExport(projectPath, committed)
      },
    })
  } catch (error) {
    if (error instanceof ProjectMemoryStoreError && error.code === 'revision-conflict') {
      throw new LookPromoteError(409, 'revision-conflict', 'Memory moved on; reload and try again.')
    }
    throw error
  }
  if (!result.published) return retriedResponse(deps, result.record)
  if (result.afterCommitError) {
    console.error('Look export write failed after promotion:', result.afterCommitError)
  }
  return {
    recordId: result.record.id,
    lookHash: hash,
    memoryRevision: result.snapshot.revision,
    exportPath: exportPath ?? '',
    exportWritten: exportPath !== null && result.afterCommitError === undefined,
    supersededRecordId: result.record.supersedes[0] ?? null,
    retried: false,
  }
}

async function retriedResponse(deps: LookPromoteDeps, record: ProjectMemoryRecord): Promise<LookPromoteResponse> {
  let exportPath = ''
  let exportWritten = false
  let memoryRevision = 0
  try {
    const current = await ensureCurrentLookExport(deps.memoryStore, deps.projectPath, deps.projectId)
    exportPath = current.relativePath ?? ''
    exportWritten = current.relativePath !== null
    memoryRevision = current.export.memory_revision
  } catch (error) {
    console.error('Look export repair failed on promote retry:', error instanceof Error ? error.message : error)
  }
  return {
    recordId: record.id,
    lookHash: record.payload?.kind === 'look_spec' ? record.payload.lookHash : record.source.sourceHash,
    memoryRevision,
    exportPath,
    exportWritten,
    supersededRecordId: record.supersedes[0] ?? null,
    retried: true,
  }
}
