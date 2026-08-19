import { describe, expect, it } from 'vitest'
import {
  annotationStaleness,
  recordLanguageFingerprint,
} from '../../shared/projectMemoryAnnotations'
import type { ProjectMemoryRecord } from '../../shared/projectMemory'

function record(id: string, claim: string, overrides: Partial<ProjectMemoryRecord> = {}): ProjectMemoryRecord {
  return {
    id, projectId: 'p1', kind: 'canon', status: 'active', claim,
    tags: [], entities: [], evidence: [], safety: 'clear', spoiler: false, supersedes: [],
    source: {
      workflow: 'story-wayfinder', sourceId: 's', sourceUri: 'u', sourceHash: 'h',
      capturedAt: '2026-08-18T00:00:00.000Z', approval: 'explicit',
    },
    createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  } as ProjectMemoryRecord
}

describe('annotationStaleness', () => {
  const a = record('mem-a', 'First decision.')
  const b = record('mem-b', 'Second decision.')

  it('is fresh when every support matches the snapshot', () => {
    const support = [recordLanguageFingerprint(a), recordLanguageFingerprint(b)]
    expect(annotationStaleness(support, { records: [a, b] })).toEqual({ stale: false })
  })

  it('reports language-changed with both hashes when a claim moved', () => {
    const support = [recordLanguageFingerprint(a)]
    const edited = record('mem-a', 'First decision, reworded.')
    const result = annotationStaleness(support, { records: [edited] })
    expect(result).toEqual({
      stale: true, cause: 'language-changed', changedRecordId: 'mem-a',
      previousContentHash: support[0].contentHash,
      currentContentHash: recordLanguageFingerprint(edited).contentHash,
    })
  })

  it('reports record-removed with only the previous hash when the id is absent', () => {
    const support = [recordLanguageFingerprint(a)]
    const result = annotationStaleness(support, { records: [b] })
    expect(result).toEqual({
      stale: true, cause: 'record-removed', changedRecordId: 'mem-a',
      previousContentHash: support[0].contentHash,
    })
  })

  it('first divergence wins when two supports moved', () => {
    const support = [recordLanguageFingerprint(a), recordLanguageFingerprint(b)]
    const result = annotationStaleness(support, { records: [] })
    if (!result.stale) throw new Error('expected stale')
    expect(result.changedRecordId).toBe('mem-a')
  })

  it('ignores status and supersedes flips entirely', () => {
    const support = [recordLanguageFingerprint(a)]
    const flipped = record('mem-a', 'First decision.', {
      status: 'superseded' as ProjectMemoryRecord['status'], supersedes: ['mem-x'],
    })
    expect(annotationStaleness(support, { records: [flipped] })).toEqual({ stale: false })
  })
})
