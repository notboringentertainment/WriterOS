import { chmod, mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appealFileName, renderAppealTicket, type AppealDraft } from '../../server/appeals/appealTicket'
import { APPEALS_OUTBOX_FILE, deliverPendingAppeals, enqueueAppeals, readOutbox } from '../../server/appeals/appealOutbox'

const draft = (recordId: string, overrides: Partial<AppealDraft> = {}): AppealDraft => ({
  recordId,
  lineageIds: [recordId],
  kind: 'new',
  overrules: [],
  storyDriveSays: [],
  writerOSSays: `Vector Station claim for ${recordId}`,
  affects: ['Vector Station'],
  origin: 'writeros:test',
  raisedAt: '2026-10-09T10:00:00.000Z',
  ...overrides,
})

describe('appeal outbox', () => {
  let dir: string
  let project: string
  let root: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'appeal-outbox-'))
    project = path.join(dir, 'pkg')
    root = path.join(dir, 'wayfinder')
    await mkdir(path.join(project, 'memory'), { recursive: true })
    await mkdir(path.join(root, 'tickets'), { recursive: true })
    await mkdir(path.join(root, 'resolved'), { recursive: true })
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty outbox when none exists', async () => {
    expect(await readOutbox(project)).toEqual({ version: 1, entries: [] })
  })

  it('enqueues one pending entry with the rendered ticket', async () => {
    const a = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [a], '2026-10-09T10:00:00.000Z')
    const outbox = await readOutbox(project)
    expect(outbox.entries).toHaveLength(1)
    expect(outbox.entries[0]).toMatchObject({
      recordId: a.recordId,
      lineageIds: a.lineageIds,
      fileName: appealFileName(a.recordId),
      ticket: renderAppealTicket(a),
      status: 'pending',
      updatedAt: '2026-10-09T10:00:00.000Z',
    })
    expect(await readFile(path.join(project, 'memory', APPEALS_OUTBOX_FILE), 'utf8')).toContain('"version": 1')
  })

  it('replaces an earlier entry in the same lineage, keeping its file name, and resets it to pending', async () => {
    const v1 = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [v1], 'T1')
    await deliverPendingAppeals(project, root)
    const v2 = draft('mem_bbbbbbbbbbbb2222', { lineageIds: ['mem_bbbbbbbbbbbb2222', v1.recordId], writerOSSays: 'Vector Station, second version' })
    await enqueueAppeals(project, [v2], 'T2')
    const outbox = await readOutbox(project)
    expect(outbox.entries).toHaveLength(1)
    expect(outbox.entries[0]).toMatchObject({ recordId: v2.recordId, fileName: appealFileName(v1.recordId), status: 'pending', updatedAt: 'T2' })
    await deliverPendingAppeals(project, root)
    expect(await readdir(path.join(root, 'tickets'))).toEqual([appealFileName(v1.recordId)])
    expect(await readFile(path.join(root, 'tickets', appealFileName(v1.recordId)), 'utf8')).toContain('second version')
  })

  it('gives the new record its own file when the earlier appeal was already closed', async () => {
    const v1 = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [v1], 'T1')
    await deliverPendingAppeals(project, root)
    const oldName = appealFileName(v1.recordId)
    const closed = await readFile(path.join(root, 'tickets', oldName), 'utf8')
    await rm(path.join(root, 'tickets', oldName))
    await writeFile(path.join(root, 'resolved', oldName), closed)

    const v2 = draft('mem_bbbbbbbbbbbb2222', { lineageIds: ['mem_bbbbbbbbbbbb2222', v1.recordId] })
    await enqueueAppeals(project, [v2], 'T2')
    const outbox = await deliverPendingAppeals(project, root)
    expect(outbox.entries[0]).toMatchObject({ fileName: appealFileName(v2.recordId), status: 'delivered' })
    expect(await readdir(path.join(root, 'tickets'))).toEqual([appealFileName(v2.recordId)])
    expect(await readFile(path.join(root, 'resolved', oldName), 'utf8')).toBe(closed)
  })

  it('delivers pending entries into tickets/ and marks them delivered', async () => {
    const a = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [a], 'T1')
    const outbox = await deliverPendingAppeals(project, root, { now: () => 'T9' })
    expect(outbox.entries[0]).toMatchObject({ status: 'delivered', updatedAt: 'T9' })
    expect(outbox.entries[0].error).toBeUndefined()
    expect(await readFile(path.join(root, 'tickets', appealFileName(a.recordId)), 'utf8')).toBe(renderAppealTicket(a))
    expect((await readOutbox(project)).entries[0].status).toBe('delivered')
  })

  it('fails entries plainly when the project is not linked', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const outbox = await deliverPendingAppeals(project, null)
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: "This project isn't linked to a Story-drive folder." })
  })

  it('fails entries plainly when the folder does not exist', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const outbox = await deliverPendingAppeals(project, path.join(dir, 'missing'))
    expect(outbox.entries[0].status).toBe('failed')
    expect(outbox.entries[0].error).toMatch(/^WriterOS can't reach the Story-drive folder: /)
  })

  it('refuses a folder that is a symlink', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const link = path.join(dir, 'link')
    await symlink(root, link)
    const outbox = await deliverPendingAppeals(project, link)
    expect(outbox.entries[0].status).toBe('failed')
    expect(outbox.entries[0].error).toMatch(/^WriterOS can't reach the Story-drive folder: /)
    expect(await readdir(path.join(root, 'tickets'))).toEqual([])
  })

  it('abandons a write that never settles and retries later', async () => {
    const a = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [a], 'T1')
    const outbox = await deliverPendingAppeals(project, root, { timeoutMs: 20, writeFile: () => new Promise<void>(() => {}) })
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: 'Delivery to the Story-drive folder timed out; it will retry.' })
    const retried = await deliverPendingAppeals(project, root)
    expect(retried.entries[0].status).toBe('delivered')
    expect(retried.entries[0].error).toBeUndefined()
  })

  it('does not rewrite delivered entries', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    await deliverPendingAppeals(project, root)
    const writer = vi.fn(async () => {})
    const outbox = await deliverPendingAppeals(project, root, { writeFile: writer })
    expect(writer).not.toHaveBeenCalled()
    expect(outbox.entries[0].status).toBe('delivered')
  })

  it('never throws when the outbox cannot be written', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await chmod(path.join(project, 'memory'), 0o500)
    try {
      await expect(deliverPendingAppeals(project, root)).resolves.toBeDefined()
      expect(spy).toHaveBeenCalled()
    } finally {
      await chmod(path.join(project, 'memory'), 0o700)
      spy.mockRestore()
    }
  })

  it('keeps an enqueue that happens while a delivery write is still pending', async () => {
    const v1 = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [v1], 'T1')
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    let started: () => void = () => {}
    const writing = new Promise<void>(resolve => { started = resolve })
    const delivery = deliverPendingAppeals(project, root, { writeFile: () => { started(); return gate } })
    await writing
    const v2 = draft('mem_bbbbbbbbbbbb2222', { lineageIds: ['mem_bbbbbbbbbbbb2222', v1.recordId], writerOSSays: 'Vector Station, newer' })
    const other = draft('mem_cccccccccccc3333')
    await enqueueAppeals(project, [v2, other], 'T2')
    release()
    await delivery
    const outbox = await readOutbox(project)
    expect(outbox.entries.map(e => e.recordId)).toEqual([v2.recordId, other.recordId])
    expect(outbox.entries[0]).toMatchObject({ status: 'pending', ticket: renderAppealTicket(v2) })
    expect(outbox.entries[1].status).toBe('pending')
  })

  it('serializes concurrent deliveries for the same project', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const writer = vi.fn(async () => {})
    const [a, b] = await Promise.all([
      deliverPendingAppeals(project, root, { writeFile: writer }),
      deliverPendingAppeals(project, root, { writeFile: writer }),
    ])
    expect(writer).toHaveBeenCalledTimes(1)
    expect(a.entries[0].status).toBe('delivered')
    expect(b.entries[0].status).toBe('delivered')
    expect((await readOutbox(project)).entries).toHaveLength(1)
  })
})
