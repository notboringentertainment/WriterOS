import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appealFileName, type AppealDraft } from '../../server/appeals/appealTicket'

// A stalled iCloud folder: lstat/stat on paths inside the linked folder never
// settle. The whole delivery step must sit under the time limit, not just the write.
const stall = vi.hoisted(() => {
  const state = { prefix: null as string | null, call: '' as 'lstat' | 'stat' | '' }
  const factory = async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    const hangs = (call: 'lstat' | 'stat', target: unknown) =>
      state.call === call && state.prefix !== null && String(target).startsWith(state.prefix)
    const lstat = (target: string, ...rest: unknown[]) =>
      hangs('lstat', target) ? new Promise(() => {}) : (actual.lstat as (...args: unknown[]) => unknown)(target, ...rest)
    const stat = (target: string, ...rest: unknown[]) =>
      hangs('stat', target) ? new Promise(() => {}) : (actual.stat as (...args: unknown[]) => unknown)(target, ...rest)
    return { ...actual, lstat, stat, default: { ...actual, lstat, stat } }
  }
  return Object.assign(state, { factory })
})
vi.mock('node:fs/promises', () => stall.factory())
vi.mock('fs/promises', () => stall.factory())

const { deliverPendingAppeals, enqueueAppeals, TIMEOUT_MESSAGE } = await import('../../server/appeals/appealOutbox')

const draft = (recordId: string): AppealDraft => ({
  recordId,
  lineageIds: [recordId],
  kind: 'new',
  overrules: [],
  storyDriveSays: [],
  writerOSSays: `Vector Station claim for ${recordId}`,
  affects: ['Vector Station'],
  origin: 'writeros:test',
  raisedAt: '2026-10-09T10:00:00.000Z',
})

describe('appeal delivery against a stalled folder', () => {
  let dir: string
  let project: string
  let root: string
  beforeEach(async () => {
    stall.prefix = null
    stall.call = ''
    dir = await mkdtemp(path.join(os.tmpdir(), 'appeal-stall-'))
    project = path.join(dir, 'pkg')
    root = path.join(dir, 'wayfinder')
    await mkdir(path.join(project, 'memory'), { recursive: true })
    await mkdir(path.join(root, 'tickets'), { recursive: true })
    await mkdir(path.join(root, 'resolved'), { recursive: true })
  })
  afterEach(async () => {
    stall.prefix = null
    await rm(dir, { recursive: true, force: true })
  })

  it('times out when the folder check stalls, and later deliveries still run', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111'), draft('mem_bbbbbbbbbbbb2222')], 'T1')
    stall.prefix = root
    stall.call = 'lstat'
    const outbox = await deliverPendingAppeals(project, root, { timeoutMs: 20 })
    expect(outbox.entries.map(entry => [entry.status, entry.error])).toEqual([
      ['failed', TIMEOUT_MESSAGE],
      ['failed', TIMEOUT_MESSAGE],
    ])
    stall.prefix = null
    const retried = await deliverPendingAppeals(project, root)
    expect(retried.entries.map(entry => entry.status)).toEqual(['delivered', 'delivered'])
  })

  it('times out when the closed-appeal check in resolved/ stalls', async () => {
    const a = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [a], 'T1')
    stall.prefix = path.join(root, 'resolved')
    stall.call = 'stat'
    const outbox = await deliverPendingAppeals(project, root, { timeoutMs: 20 })
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: TIMEOUT_MESSAGE, fileName: appealFileName(a.recordId) })
    expect(await readdir(path.join(root, 'tickets'))).toEqual([])
  })
})
