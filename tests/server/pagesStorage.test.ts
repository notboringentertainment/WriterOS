import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { detectDocumentChanges } from '../../server/projectMemory/writerOSObserver'
import { pageStatus } from '../../client/src/components/writing/Pages'
import type { ProjectMemorySnapshot } from '../../shared/projectMemory'

describe('page storage', () => {
  it('keeps and approves a bible independently of facts, refuses stale writes, and survives save and reopen', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-bible-'))
    try {
      const store = await createProjectLibraryStore(root)
      const state = defaultProjectState()
      state.documents.storyBible.content.onePagePitch.logline = 'These facts must never become page prose.'
      const project = { id: '11111111-1111-4111-8111-111111111111', createdAt: Date.now(), updatedAt: Date.now(), state }
      await store.writeProject(project)
      const empty = await store.readPage!(project.id, 'bible')
      expect(empty).toEqual({ page: 'bible', markdown: '', status: 'draft', revision: 0 })
      const kept = await store.writePage!(project.id, { ...empty, markdown: '# Story Bible\n\nA repeatable story engine.' }, 0)
      expect(kept.stale).toBe(false)
      expect((await store.writePage!(project.id, { ...empty, markdown: 'Stale' }, 0)).stale).toBe(true)
      const approved = await store.writePage!(project.id, { ...kept.page, status: 'approved', approvedAt: '2026-10-18T12:00:00.000Z', approvedCanon: [{ id: 'fact', version: 'v1' }] }, 1)
      await store.writeProject(project)
      const reopened = await createProjectLibraryStore(root)
      const page = await reopened.readPage!(project.id, 'bible')
      expect(page).toEqual(approved.page)
      expect(page.revision).toBe(2)
      const snapshot = { records: [{ id: 'fact', kind: 'canon', status: 'active', updatedAt: 'v1', claim: 'The engine repeats.' }] } as ProjectMemorySnapshot
      expect(pageStatus(page, snapshot)).toBe('approved')
      snapshot.records[0].updatedAt = 'v2'
      expect(pageStatus(page, snapshot)).toBe('out of date')
      const files = await reopened.readPackageSnapshot!(project.id)
      expect(JSON.parse(files['documents/pages/bible.json']!)).toEqual(page)
      expect(JSON.parse(files['documents/story-bible.json']!).content.onePagePitch.logline).toBe(state.documents.storyBible.content.onePagePitch.logline)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('seeds once, refuses stale writes, and preserves frozen bytes across format and page work', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'writeros-pages-'))
    try {
      const store = await createProjectLibraryStore(root)
      const state = defaultProjectState()
      state.meta.title = 'Sample Project'
      state.documents.synopsis.content.prose.opening = 'A visitor arrives.'
      const project = { id: '11111111-1111-4111-8111-111111111111', createdAt: Date.now(), updatedAt: Date.now(), state }
      await store.writeProject(project)
      const folder = await store.resolveProjectPackagePath(project.id)
      const names = ['synopsis', 'treatment']
      const before = await Promise.all(names.map(async name => {
        const filename = path.join(folder, `documents/${name}.json`)
        const bytes = '  ' + await readFile(filename, 'utf8')
        await writeFile(filename, bytes)
        return bytes
      }))
      const [first, second] = await Promise.all([store.readPage!(project.id, 'synopsis'), store.readPage!(project.id, 'synopsis')])
      const priorFiles = await store.readPackageSnapshot!(project.id)
      expect(first).toEqual(second)
      expect(first.markdown).toContain('A visitor arrives.')
      const kept = await store.writePage!(project.id, { ...first, markdown: 'New prose.' }, 0)
      expect(kept.page.revision).toBe(1)
      expect((await store.writePage!(project.id, { ...first, markdown: 'Stale prose.' }, 0)).stale).toBe(true)
      state.meta.format = 'series'
      state.documents.synopsis.content.prose.opening = 'A stale browser edit.'
      state.pages = { synopsis: first }
      await Promise.all([store.writeProject(project), store.writePage!(project.id, { ...kept.page, markdown: 'Newest prose.' }, 1)])
      expect((await store.readPage!(project.id, 'synopsis')).markdown).toBe('Newest prose.')
      for (const [index, name] of names.entries()) expect(await readFile(path.join(folder, `documents/${name}.json`), 'utf8')).toBe(before[index])
      const changed = detectDocumentChanges(priorFiles, await store.readPackageSnapshot!(project.id))
      expect(changed.filter(change => ['synopsis', 'treatment'].includes(change.surface))).toEqual([])
      expect(changed.filter(change => change.sourceId.startsWith('documents/pages/'))).toEqual([])
      await writeFile(path.join(folder, 'documents/pages/synopsis.json'), '{"page":"synopsis","revision":-1}')
      await expect(store.readPage!(project.id, 'synopsis')).rejects.toThrow()
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
