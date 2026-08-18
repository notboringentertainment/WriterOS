import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '../projectMemory'
import type { AnnotationLogState } from '../projectMemoryAnnotations'
import type { FactSheet, FactSheetField } from './types'
import { findCues, readsAsWithdrawn, type CueMatch } from './whatsStandingCues'

/**
 * Fact sheet for the "What's Standing" report.
 *
 * Unlike the authored surfaces, whose facts come from the writer's answers, these facts
 * are project memory records. One field per record, keyed by record id, so blocks cite
 * `sourceFieldIds: [recordId]` and the existing fidelity check verifies provenance and
 * coverage without special-casing.
 */

export type StandingGroup =
  | 'inForce'      // active canon whose own wording carries no withdrawal cue
  | 'withdrawn'    // active canon whose own wording says struck / superseded / do not use
  | 'openQuestion'
  | 'awaiting'     // candidates

export interface StandingEntry {
  record: ProjectMemoryRecord
  group: StandingGroup
  cues: CueMatch[]
}

/**
 * Total order over records. `createdAt` collides for records published in one import, and
 * array position must never decide output, so id breaks every tie. Ids are unique, so this
 * is a total order and the report is byte-stable across runs.
 */
function byCreatedThenId(a: ProjectMemoryRecord, b: ProjectMemoryRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function groupOf(record: ProjectMemoryRecord, cues: readonly CueMatch[]): StandingGroup | undefined {
  if (record.status === 'candidate') return 'awaiting'
  if (record.status !== 'active') return undefined
  if (record.kind === 'open_question') return 'openQuestion'
  if (record.kind !== 'canon') return undefined
  // `safety: 'flagged'` records are withheld from the report exactly as they are withheld
  // from the canon projection.
  if (record.safety !== 'clear') return undefined
  return readsAsWithdrawn(cues) ? 'withdrawn' : 'inForce'
}

export function buildStandingEntries(snapshot: ProjectMemorySnapshot): StandingEntry[] {
  const entries: StandingEntry[] = []
  for (const record of [...snapshot.records].sort(byCreatedThenId)) {
    const cues = [...findCues('claim', record.claim), ...findCues('detail', record.detail)]
    const group = groupOf(record, cues)
    if (group === undefined) continue
    entries.push({ record, group, cues })
  }
  return entries
}

/** Fact value: the record's own words, never rewritten. */
function factValue(record: ProjectMemoryRecord): string {
  return record.detail ? `${record.claim}\n\n${record.detail}` : record.claim
}

/** Short, stable label for diagnostics and coverage messages — not shown to the reader. */
function factLabel(record: ProjectMemoryRecord): string {
  const firstLine = record.claim.split('\n')[0]
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
}

export function buildWhatsStandingFactSheet(
  snapshot: ProjectMemorySnapshot,
  annotations?: AnnotationLogState,
): FactSheet {
  const fields: FactSheetField[] = buildStandingEntries(snapshot).map(entry => ({
    id: entry.record.id,
    label: factLabel(entry.record),
    kind: 'prose',
    value: factValue(entry.record),
  }))

  // Open conflicts are facts too, and the report cites them, so they need ids in the sheet
  // or every citation to one would raise `dangling_source_id`.
  for (const conflict of [...snapshot.conflicts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (conflict.status !== 'open') continue
    fields.push({
      id: conflict.id,
      label: `conflict ${conflict.id}`,
      kind: 'prose',
      value: conflict.reason,
    })
  }

  // Records cited only as approved-annotation referents. A referent that later moved to
  // superseded or rejected leaves the displayed set, but a status change must not turn the
  // still-valid resolution citing it into a dangling citation — fingerprints cover language,
  // not standing. A referent missing from the snapshot entirely is left out: that citation
  // IS dangling until the invalidation slice rules on it.
  if (annotations !== undefined) {
    const present = new Set(fields.map(f => f.id))
    const approved = [...annotations.annotations.values()]
      .filter(a => a.status === 'approved')
      .sort((a, b) => (a.annotationId < b.annotationId ? -1 : 1))
    for (const annotation of approved) {
      for (const id of annotation.referentRecordIds ?? []) {
        if (present.has(id)) continue
        const record = snapshot.records.find(r => r.id === id)
        if (record === undefined) continue
        present.add(id)
        fields.push({ id, label: factLabel(record), kind: 'prose', value: factValue(record) })
      }
    }
  }

  return {
    surface: 'whatsStanding',
    // Reports are not feature/series specific — memory records carry no format. 'feature'
    // satisfies the shared type without asserting anything about the project.
    format: 'feature',
    fields,
  }
}
