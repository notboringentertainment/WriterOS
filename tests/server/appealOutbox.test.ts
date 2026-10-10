import { chmod, mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appealFileName, renderAppealTicket, type AppealDraft } from '../../server/appeals/appealTicket'
import {
  APPEALS_OUTBOX_FILE,
  deliverPendingAppeals,
  enqueueAppeals,
  LINKS_UNREADABLE,
  NOT_LINKED_MESSAGE,
  plainDeliveryReason,
  readOutbox,
} from '../../server/appeals/appealOutbox'

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
  let errors: ReturnType<typeof vi.spyOn>
  beforeEach(async () => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    dir = await mkdtemp(path.join(os.tmpdir(), 'appeal-outbox-'))
    project = path.join(dir, 'pkg')
    root = path.join(dir, 'wayfinder')
    await mkdir(path.join(project, 'memory'), { recursive: true })
    await mkdir(path.join(root, 'tickets'), { recursive: true })
    await mkdir(path.join(root, 'resolved'), { recursive: true })
  })
  afterEach(async () => {
    errors.mockRestore()
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
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: NOT_LINKED_MESSAGE })
  })

  it('says the list of links could not be read, not that the project is unlinked', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const outbox = await deliverPendingAppeals(project, LINKS_UNREADABLE)
    expect(outbox.entries[0]).toMatchObject({
      status: 'failed',
      error: "WriterOS couldn't read its list of linked Story-drive folders; it will retry.",
    })
  })

  it('fails entries plainly when the folder does not exist', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111'), draft('mem_bbbbbbbbbbbb2222')], 'T1')
    const outbox = await deliverPendingAppeals(project, path.join(dir, 'missing'))
    expect(outbox.entries.map(entry => [entry.status, entry.error])).toEqual([
      ['failed', "The Story-drive folder isn't there — it may have been moved or renamed, or iCloud is offline."],
      ['failed', "The Story-drive folder isn't there — it may have been moved or renamed, or iCloud is offline."],
    ])
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('ENOENT'))
  })

  it('refuses a folder that is a symlink', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const link = path.join(dir, 'link')
    await symlink(root, link)
    const outbox = await deliverPendingAppeals(project, link)
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: "The linked Story-drive path isn't a folder." })
    expect(await readdir(path.join(root, 'tickets'))).toEqual([])
  })

  it('refuses a linked path that is a file', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const file = path.join(dir, 'file.md')
    await writeFile(file, 'x')
    const outbox = await deliverPendingAppeals(project, file)
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: "The linked Story-drive path isn't a folder." })
  })

  it('refuses a folder with neither tickets/ nor resolved/, and creates nothing there', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const elsewhere = path.join(dir, 'Documents')
    await mkdir(elsewhere)
    const outbox = await deliverPendingAppeals(project, elsewhere)
    expect(outbox.entries[0]).toMatchObject({
      status: 'failed',
      error: "The linked folder doesn't look like a Story-drive wayfinder folder.",
    })
    expect(await readdir(elsewhere)).toEqual([])
  })

  it('creates tickets/ in a wayfinder folder that only has resolved/', async () => {
    const a = draft('mem_aaaaaaaaaaaa1111')
    await enqueueAppeals(project, [a], 'T1')
    await rm(path.join(root, 'tickets'), { recursive: true })
    const outbox = await deliverPendingAppeals(project, root)
    expect(outbox.entries[0].status).toBe('delivered')
    expect(await readdir(path.join(root, 'tickets'))).toEqual([appealFileName(a.recordId)])
  })

  it.each([
    ['EPERM', "macOS hasn't given WriterOS permission to open the Story-drive folder."],
    ['EACCES', "macOS hasn't given WriterOS permission to open the Story-drive folder."],
    ['ENOENT', "The Story-drive folder isn't there — it may have been moved or renamed, or iCloud is offline."],
    ['ENOTDIR', "The linked Story-drive path isn't a folder."],
    ['EIO', "WriterOS couldn't write to the Story-drive folder."],
  ])('turns a %s write error into a plain sentence and logs the raw error', async (code, sentence) => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const raw = Object.assign(new Error(`${code}: raw system detail`), { code })
    const outbox = await deliverPendingAppeals(project, root, { writeFile: async () => { throw raw } })
    expect(outbox.entries[0]).toMatchObject({ status: 'failed', error: sentence })
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('raw system detail'))
  })

  it('gives a plain sentence for a "not a directory" error without a code', () => {
    expect(plainDeliveryReason(new Error('path is not a directory'))).toBe("The linked Story-drive path isn't a folder.")
  })

  it('picks an unused name when the record\'s own file name is also already closed', async () => {
    const v1 = draft('mem_aaaaaaaaaaaa1111')
    const v2 = draft('mem_bbbbbbbbbbbb2222', { lineageIds: ['mem_bbbbbbbbbbbb2222', v1.recordId] })
    await enqueueAppeals(project, [v1], 'T1')
    await deliverPendingAppeals(project, root)
    const oldName = appealFileName(v1.recordId)
    await rm(path.join(root, 'tickets', oldName))
    const base = appealFileName(v2.recordId).replace(/\.md$/, '')
    for (const name of [oldName, `${base}.md`, `${base}-2.md`]) await writeFile(path.join(root, 'resolved', name), 'closed')

    await enqueueAppeals(project, [v2], 'T2')
    const outbox = await deliverPendingAppeals(project, root)
    expect(outbox.entries[0]).toMatchObject({ fileName: `${base}-3.md`, status: 'delivered' })
    expect(await readdir(path.join(root, 'tickets'))).toEqual([`${base}-3.md`])
    expect(await readFile(path.join(root, 'resolved', `${base}.md`), 'utf8')).toBe('closed')
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
  it('runs only the final outbox merge inside withLock, never the ticket writes', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    let locked = false
    const events: string[] = []
    const writer = vi.fn(async () => { events.push(locked ? 'write-in-lock' : 'write') })
    const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
      locked = true
      events.push('lock')
      try {
        const before = (await readOutbox(project)).entries[0].status
        const result = await fn()
        events.push(`merged:${before}->${(await readOutbox(project)).entries[0].status}`)
        return result
      } finally {
        locked = false
      }
    }
    const result = await deliverPendingAppeals(project, root, { writeFile: writer, withLock })
    expect(events).toEqual(['write', 'lock', 'merged:pending->delivered'])
    expect(result.entries[0].status).toBe('delivered')
  })

  it('logs and still resolves when the lock cannot be taken', async () => {
    await enqueueAppeals(project, [draft('mem_aaaaaaaaaaaa1111')], 'T1')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const withLock = async <T>(): Promise<T> => { throw new Error('lock busy') }
      await expect(deliverPendingAppeals(project, root, { withLock })).resolves.toBeDefined()
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('lock busy'))
      expect((await readOutbox(project)).entries[0].status).toBe('pending')
    } finally {
      errors.mockRestore()
    }
  })
})
