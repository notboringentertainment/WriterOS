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

// Text placed under a "## " section must not open a heading of its own: a line
// starting with "#" would end the section early (or add one) when the ticket is
// read back. "\#" renders as "#" in Markdown and the WriterOS import undoes it.
export const escapeSectionText = (text: string) => text.replace(/^([ \t]*)#/gm, '$1\\#')
export const unescapeSectionLine = (line: string) => line.replace(/^([ \t]*)\\#/, '$1#')

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
    // The full supersedes chain: v2 -> v1 -> W must reach W, or a later version
    // would drop the Story-drive claim and flip an overrule into a new appeal.
    const chain = new Map<string, ProjectMemoryRecord>()
    const lineage = new Set<string>([record.id])
    const pending = [...record.supersedes]
    while (pending.length > 0) {
      const id = pending.shift() as string
      if (lineage.has(id)) continue
      lineage.add(id)
      const older = byId.get(id)
      if (!older) continue
      chain.set(id, older)
      pending.push(...older.supersedes)
    }
    const replaced = [...chain.values()]
    const conflicting = after.conflicts
      .filter(c => c.leftRecordId === record.id || c.rightRecordId === record.id)
      .map(c => (c.leftRecordId === record.id ? c.rightRecordId : c.leftRecordId))
      .map(id => byId.get(id))
      .filter((r): r is ProjectMemoryRecord => !!r)
    const overruled = [...new Map([...replaced, ...conflicting].filter(isWayfinder).map(r => [r.id, r])).values()]
    const affects = [...new Set([record, ...replaced, ...overruled].flatMap(namesOf).map(listSafe).filter(Boolean))].sort()
    appeals.push({
      recordId: record.id,
      lineageIds: [...lineage],
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
    a.storyDriveSays.length > 0 ? escapeSectionText(a.storyDriveSays.join('\n\n')) : 'Nothing — Story-drive never decided this.',
    '',
    '## WriterOS now says',
    escapeSectionText(a.writerOSSays),
    '',
    '## Where it came from',
    escapeSectionText(a.origin),
    '',
    '## Answer',
    '',
  ].join('\n')
}
