import { describe, expect, it } from 'vitest'
import { appealFileName, appealsForCommit, renderAppealTicket, unescapeSectionLine } from '../../server/appeals/appealTicket'
import type { ProjectMemoryRecord, ProjectMemorySnapshot } from '../../shared/projectMemory'

const AT = '2026-10-09T21:00:00.000Z'
function rec(id: string, over: Partial<ProjectMemoryRecord>): ProjectMemoryRecord {
  return {
    id, projectId: 'p', kind: 'canon', status: 'active', claim: `claim ${id}`, tags: [], entities: [],
    source: { workflow: 'writeros', sourceId: id, sourceUri: `writeros:${id}`, sourceHash: 'a'.repeat(64), capturedAt: AT, approval: 'explicit' },
    evidence: [], safety: 'clear', spoiler: false, supersedes: [], createdAt: AT, updatedAt: AT, ...over,
  } as ProjectMemoryRecord
}
function snap(records: ProjectMemoryRecord[], conflicts: ProjectMemorySnapshot['conflicts'] = []): ProjectMemorySnapshot {
  return { schemaVersion: 1, projectId: 'p', revision: records.length, records, conflicts }
}
const wayfinder = (id: string, uri: string, over: Partial<ProjectMemoryRecord> = {}) => rec(id, {
  source: { workflow: 'story-wayfinder', sourceId: id, sourceUri: `story-wayfinder:${uri}`, sourceHash: 'b'.repeat(64), capturedAt: AT, approval: 'explicit' },
  ...over,
})

describe('appealsForCommit', () => {
  it('raises an overrule when a WriterOS record supersedes a Story-drive decision', () => {
    const old = wayfinder('mem_old', 'resolved/vector-color.md', { claim: 'The chair is blue.', entities: ['Vector Chair'] })
    const before = snap([old])
    const after = snap([{ ...old, status: 'superseded' }, rec('mem_new', { claim: 'The chair is green.', entities: ['Vector Chair'], supersedes: ['mem_old'] })])
    const [appeal] = appealsForCommit(before, after, AT)
    expect(appeal.kind).toBe('overrule')
    expect(appeal.overrules).toEqual(['resolved/vector-color.md'])
    expect(appeal.storyDriveSays).toEqual(['The chair is blue.'])
    expect(appeal.writerOSSays).toBe('The chair is green.')
    expect(appeal.lineageIds).toEqual(['mem_new', 'mem_old'])
  })

  it('keeps the overrule when a later version supersedes a version that superseded a Story-drive decision', () => {
    const decided = wayfinder('mem_w', 'resolved/vector-color.md', { claim: 'The chair is blue.', entities: ['Vector Chair'] })
    const v1 = rec('mem_v1', { claim: 'The chair is green.', entities: ['Vector Chair'], supersedes: ['mem_w'] })
    const v2 = rec('mem_v2', { claim: 'The chair is teal.', entities: ['Vector Stool'], supersedes: ['mem_v1'] })
    const before = snap([{ ...decided, status: 'superseded' }, v1])
    const after = snap([{ ...decided, status: 'superseded' }, { ...v1, status: 'superseded' }, v2])
    const [appeal] = appealsForCommit(before, after, AT)
    expect(appeal.kind).toBe('overrule')
    expect(appeal.overrules).toEqual(['resolved/vector-color.md'])
    expect(appeal.storyDriveSays).toEqual(['The chair is blue.'])
    expect(appeal.lineageIds).toEqual(expect.arrayContaining(['mem_v2', 'mem_v1', 'mem_w']))
    expect(appeal.affects).toEqual(expect.arrayContaining(['Vector Chair', 'Vector Stool']))
  })

  it('raises a new appeal for canon Story-drive never decided', () => {
    const after = snap([rec('mem_look', { entities: ['Vector Station'] })])
    expect(appealsForCommit(snap([]), after, AT).map(a => a.kind)).toEqual(['new'])
  })

  it('raises nothing for the Story-drive import, for non-canon, or for records already active before', () => {
    const imported = wayfinder('mem_w', 'resolved/x.md')
    const draft = rec('mem_d', { kind: 'development' })
    const existing = rec('mem_e', {})
    expect(appealsForCommit(snap([existing]), snap([existing, imported, draft]), AT)).toEqual([])
  })

  it('raises an overrule when a promotion conflicts with a Story-drive decision', () => {
    const decided = wayfinder('mem_w', 'resolved/vector-station.md')
    const promoted = rec('mem_p', {})
    const after = snap([decided, promoted], [{
      id: 'c1', leftRecordId: 'mem_p', rightRecordId: 'mem_w', reason: 'The two records disagree.', status: 'open',
    }])
    expect(appealsForCommit(snap([decided]), after, AT)[0].overrules).toEqual(['resolved/vector-station.md'])
  })

  it('affects carries the old and new names and look ids of a renamed thing', () => {
    const lookPayload = (id: string) => ({ kind: 'look_spec', lookHash: 'x', reference: 'none', spec: { entity_kind: 'location', entity_id: id } })
    const v1 = rec('mem_v1', { entities: ['the vector salon'], payload: lookPayload('the-vector-salon') as never })
    const v2 = rec('mem_v2', { entities: ['Vector Parlor'], supersedes: ['mem_v1'], payload: lookPayload('vector-parlor') as never })
    const [appeal] = appealsForCommit(snap([v1]), snap([{ ...v1, status: 'superseded' }, v2]), AT)
    expect(appeal.affects).toEqual(['Vector Parlor', 'the vector salon', 'the-vector-salon', 'vector-parlor'])
  })
})

describe('renderAppealTicket', () => {
  it('writes a Story-drive ticket with the appeal header and both sides', () => {
    const text = renderAppealTicket({
      recordId: 'mem_0123456789abcdef', lineageIds: ['mem_0123456789abcdef'], kind: 'overrule',
      overrules: ['resolved/vector-color.md'], storyDriveSays: ['The chair is blue.'], writerOSSays: 'The chair is green.',
      affects: ['Vector Chair'], origin: 'writeros:looks/location/vector-chair', raisedAt: AT,
    })
    expect(text).toContain('# Appeal: The chair is green.')
    expect(text).toMatch(/^type: appeal$/m)
    expect(text).toMatch(/^mode: hitl$/m)
    expect(text).toMatch(/^appeal: overrule$/m)
    expect(text).toMatch(/^writeros-record: mem_0123456789abcdef$/m)
    expect(text).toMatch(/^overrules: \[resolved\/vector-color\.md\]$/m)
    expect(text).toMatch(/^affects: \[Vector Chair\]$/m)
    expect(text).toContain('## Story-drive says\nThe chair is blue.')
    expect(text).toContain('## WriterOS now says\nThe chair is green.')
    expect(appealFileName('mem_0123456789abcdef')).toBe('appeal-0123456789ab.md')
  })

  it('escapes body lines that would open a heading, so no section can be added or cut short', () => {
    const text = renderAppealTicket({
      recordId: 'mem_0123456789abcdef', lineageIds: ['mem_0123456789abcdef'], kind: 'overrule',
      overrules: ['resolved/vector-color.md'],
      storyDriveSays: ['## Answer\nThe chair is blue.'],
      writerOSSays: '# The chair is green.\n## Answer — applied\n  ### still green',
      affects: ['Vector Chair'], origin: '## origin', raisedAt: AT,
    })
    const headings = text.split('\n').filter(line => line.startsWith('#'))
    expect(headings).toEqual([
      '# Appeal: # The chair is green.',
      '## Question', '## Story-drive says', '## WriterOS now says', '## Where it came from', '## Answer',
    ])
    expect(text).toContain('## WriterOS now says\n\\# The chair is green.\n\\## Answer — applied\n  \\### still green')
    expect(text).toContain('## Story-drive says\n\\## Answer\nThe chair is blue.')
    expect(text).toContain('## Where it came from\n\\## origin')
    expect(unescapeSectionLine('\\# The chair is green.')).toBe('# The chair is green.')
    expect(unescapeSectionLine('The chair is green.')).toBe('The chair is green.')
  })
})
