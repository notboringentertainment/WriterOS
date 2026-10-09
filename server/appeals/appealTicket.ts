import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '../../shared/projectMemory'

// Canon appeals (spec 2026-10-09): every canon change made in WriterOS is
// sent down to Story-drive as an appeal ticket. This file only decides which
// commits raise one and what the ticket says; it touches no disk.

export type AppealKind = 'overrule' | 'new'
export interface AppealDraft {
  recordId: string            // the new active canon record
  lineageIds: string[]        // recordId plus every record it supersedes (for "update the open appeal")
  kind: AppealKind
  overrules: string[]         // sourceUri paths of superseded/conflicting story-wayfinder records, e.g. "resolved/aces-want.md"
  storyDriveSays: string[]    // claims of those records
  writerOSSays: string        // the new record's claim
  affects: string[]           // sorted, de-duplicated names and ids
  origin: string              // the new record's source.sourceUri
  raisedAt: string            // ISO timestamp of the commit
}

const isWayfinder = (record: ProjectMemoryRecord) => record.source.workflow === 'story-wayfinder'
const wayfinderPath = (record: ProjectMemoryRecord) => record.source.sourceUri.replace(/^story-wayfinder:/, '')
// Ticket header lists use "[a, b]"; commas and brackets inside a value would break them.
const listSafe = (value: string) => value.replace(/[[\],\n]/g, ' ').replace(/\s+/g, ' ').trim()

function namesOf(record: ProjectMemoryRecord): string[] {
  const names = [...record.entities]
  if (record.payload?.kind === 'look_spec') names.push(record.payload.spec.entity_id)
  return names
}

export function appealsForCommit(before: ProjectMemorySnapshot, after: ProjectMemorySnapshot, raisedAt: string): AppealDraft[] {
  const wasActive = new Set(before.records.filter(r => r.status === 'active').map(r => r.id))
  const byId = new Map(after.records.map(r => [r.id, r]))
  const appeals: AppealDraft[] = []
  for (const record of after.records) {
    if (record.kind !== 'canon' || record.status !== 'active' || wasActive.has(record.id) || isWayfinder(record)) continue
    const replaced = record.supersedes.map(id => byId.get(id)).filter((r): r is ProjectMemoryRecord => !!r)
    const conflicting = after.conflicts
      .filter(c => c.leftRecordId === record.id || c.rightRecordId === record.id)
      .map(c => (c.leftRecordId === record.id ? c.rightRecordId : c.leftRecordId))
      .map(id => byId.get(id))
      .filter((r): r is ProjectMemoryRecord => !!r)
    const overruled = [...replaced, ...conflicting].filter(isWayfinder)
    const affects = [...new Set([record, ...replaced, ...overruled].flatMap(namesOf).map(listSafe).filter(Boolean))].sort()
    appeals.push({
      recordId: record.id,
      lineageIds: [record.id, ...record.supersedes],
      kind: overruled.length > 0 ? 'overrule' : 'new',
      overrules: overruled.map(wayfinderPath),
      storyDriveSays: overruled.map(r => r.claim),
      writerOSSays: record.claim,
      affects,
      origin: record.source.sourceUri,
      raisedAt,
    })
  }
  return appeals
}

export function appealFileName(recordId: string): string {
  return `appeal-${recordId.replace(/^mem_/, '').slice(0, 12)}.md`
}

export function renderAppealTicket(a: AppealDraft): string {
  const title = a.writerOSSays.split('\n')[0].slice(0, 120)
  return [
    `# Appeal: ${title}`,
    'type: appeal',
    'mode: hitl',
    `appeal: ${a.kind}`,
    `writeros-record: ${a.recordId}`,
    `overrules: [${a.overrules.map(listSafe).join(', ')}]`,
    `affects: [${a.affects.join(', ')}]`,
    `raised: ${a.raisedAt}`,
    `created: ${a.raisedAt.slice(0, 10)}`,
    'claimed:',
    'resolved:',
    '',
    '## Question',
    a.kind === 'overrule'
      ? 'WriterOS changed something Story-drive decided. The WriterOS version is canon now. Front Lot closes this once it has applied the change.'
      : 'WriterOS added canon Story-drive never decided. It is canon now. Front Lot closes this once it has applied the change.',
    '',
    '## Story-drive says',
    a.storyDriveSays.length > 0 ? a.storyDriveSays.join('\n\n') : 'Nothing — Story-drive never decided this.',
    '',
    '## WriterOS now says',
    a.writerOSSays,
    '',
    '## Where it came from',
    a.origin,
    '',
    '## Answer',
    '',
  ].join('\n')
}
