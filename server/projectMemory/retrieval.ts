import { createHash } from 'node:crypto'
import type {
  MemoryContextPackage,
  ProjectMemoryRecord,
  ProjectMemorySnapshot,
} from '../../shared/projectMemory'

const MAX_RELEVANT_RECORDS = 12
const MAX_RELEVANT_CHARACTERS = 16_000
const MAX_ACTIVE_CANON_CHARACTERS = 64_000
const RELEVANCE_WEIGHTS = {
  entity: 5,
  tag: 3,
  surface: 2,
  personaLane: 1,
} as const

export class ProjectMemoryRetrievalError extends Error {
  constructor(
    readonly code: 'canon_context_too_large',
    message: string,
  ) {
    super(`${code}: ${message}`)
    this.name = 'ProjectMemoryRetrievalError'
  }
}

export interface MemoryQuery {
  message: string
  surface?: string
  personaId?: string
  currentEntities?: string[]
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function conciseCanonRecord(record: ProjectMemoryRecord): ProjectMemoryRecord {
  const { detail: _detail, ...withoutDetail } = record
  return {
    ...withoutDetail,
    evidence: [],
  }
}

function normalizeTokens(values: readonly string[]): Set<string> {
  const tokens = new Set<string>()
  for (const value of values) {
    for (const match of value.normalize('NFKC').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
      tokens.add(match[0])
    }
  }
  return tokens
}

function overlaps(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const token of left) {
    if (right.has(token)) return true
  }
  return false
}

interface QueryTokenSets {
  message: ReadonlySet<string>
  entities: ReadonlySet<string>
  surface: ReadonlySet<string>
  personaLane: ReadonlySet<string>
}

function queryTokenSets(query: MemoryQuery): QueryTokenSets {
  return {
    message: normalizeTokens([query.message]),
    entities: normalizeTokens([query.message, ...(query.currentEntities ?? [])]),
    surface: normalizeTokens(query.surface === undefined ? [] : [query.surface]),
    personaLane: normalizeTokens(query.personaId === undefined ? [] : [query.personaId]),
  }
}

function relevanceScore(record: ProjectMemoryRecord, queryTokens: QueryTokenSets): number {
  const entityTokens = normalizeTokens(record.entities)
  const tagTokens = normalizeTokens(record.tags)

  let score = 0
  if (overlaps(entityTokens, queryTokens.entities)) score += RELEVANCE_WEIGHTS.entity
  if (overlaps(tagTokens, queryTokens.message)) score += RELEVANCE_WEIGHTS.tag
  if (overlaps(tagTokens, queryTokens.surface)) score += RELEVANCE_WEIGHTS.surface
  if (overlaps(tagTokens, queryTokens.personaLane)) score += RELEVANCE_WEIGHTS.personaLane
  return score
}

function contextRecord(record: ProjectMemoryRecord): ProjectMemoryRecord {
  return {
    ...record,
    evidence: [],
  }
}

function recordCharacterCount(record: ProjectMemoryRecord): number {
  return record.claim.length + (record.detail?.length ?? 0)
}

export function citationLabelsForRecords(
  records: readonly ProjectMemoryRecord[],
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>()
  const usedLabels = new Set<string>()
  for (const record of records) {
    const digest = createHash('sha256').update(record.id, 'utf8').digest('hex').toUpperCase()
    let digestLength = 4
    let label = `[M-${digest.slice(0, digestLength)}]`
    while (usedLabels.has(label) && digestLength < digest.length) {
      digestLength += 1
      label = `[M-${digest.slice(0, digestLength)}]`
    }
    labels.set(record.id, label)
    usedLabels.add(label)
  }
  return labels
}

export function buildMemoryContext(
  snapshot: ProjectMemorySnapshot,
  query: MemoryQuery,
): MemoryContextPackage {
  const activeCanon = snapshot.records
    .filter(record => (
      record.kind === 'canon'
      && record.status === 'active'
      && record.safety === 'clear'
    ))
    .sort((left, right) => compareCodePoints(left.id, right.id))
    .map(conciseCanonRecord)
  const activeCanonCharacters = activeCanon.reduce(
    (total, record) => total + record.claim.length,
    0,
  )
  if (activeCanonCharacters > MAX_ACTIVE_CANON_CHARACTERS) {
    throw new ProjectMemoryRetrievalError(
      'canon_context_too_large',
      `active canon contains ${activeCanonCharacters} characters; maximum is ${MAX_ACTIVE_CANON_CHARACTERS}`,
    )
  }
  const activeCanonIds = new Set(activeCanon.map(record => record.id))
  const queryTokens = queryTokenSets(query)
  const rankedRelevant = snapshot.records
    .filter(record => (
      !activeCanonIds.has(record.id)
      && (record.status === 'active' || record.status === 'candidate')
      && record.safety === 'clear'
    ))
    .map(record => ({ record, score: relevanceScore(record, queryTokens) }))
    .filter(result => result.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt)
      || compareCodePoints(left.record.id, right.record.id)
    ))
    .map(result => contextRecord(result.record))
  const relevant: ProjectMemoryRecord[] = []
  let relevantCharacters = 0
  for (const record of rankedRelevant) {
    if (relevant.length >= MAX_RELEVANT_RECORDS) break
    const characterCount = recordCharacterCount(record)
    if (relevantCharacters + characterCount > MAX_RELEVANT_CHARACTERS) continue
    relevant.push(record)
    relevantCharacters += characterCount
  }
  const contextRecordIds = new Set([
    ...activeCanonIds,
    ...relevant.map(record => record.id),
  ])
  const conflicts = snapshot.conflicts
    .filter(conflict => (
      conflict.status === 'open'
      && (
        contextRecordIds.has(conflict.leftRecordId)
        || contextRecordIds.has(conflict.rightRecordId)
      )
    ))
    .sort((left, right) => compareCodePoints(left.id, right.id))
  const citedRecords = [...activeCanon, ...relevant]
  const citationLabels = citationLabelsForRecords(citedRecords)
  const citationMap = Object.fromEntries(citedRecords.map(record => [
    citationLabels.get(record.id) as string,
    record.source,
  ]))

  return {
    projectId: snapshot.projectId,
    revision: snapshot.revision,
    activeCanon,
    relevant,
    conflicts,
    citationMap,
  }
}
