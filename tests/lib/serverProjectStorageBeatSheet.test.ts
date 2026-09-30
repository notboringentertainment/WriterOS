import { describe, expect, it, vi } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { bootstrapServerProjectStorage } from '../../client/src/lib/serverProjectStorage'
import { createFileSystemAccessProjectStorageAdapter } from '../../client/src/lib/projectStorage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ref = {
  kind: 'server' as const,
  id: 'server-project-1234',
  packageName: 'Sample (serverpr).writeros',
  summary: { id: 'server-project-1234', title: 'Sample', createdAt: 1, updatedAt: 2 },
}
const bootstrapBody = { enabled: true, label: 'WriterOS Projects', sessionToken: 'tok' }
const readResult = {
  ok: true as const,
  manifest: { format: 'writeros-project', version: 1, projectId: ref.id },
  project: { id: ref.id, createdAt: 1, updatedAt: 2, state: defaultProjectState() },
  warnings: [],
}

describe('server adapter read', () => {
  it('returns beatSheet from the GET body and throws on a body without it', async () => {
    const synced = {
      kind: 'unchanged',
      ticket: 'T-1',
      syncedAt: '2026-09-29T17:42:00.000Z',
      beatCount: 14,
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(bootstrapBody))
      .mockResolvedValueOnce(jsonResponse({ result: readResult, beatSheet: synced }))
      .mockResolvedValueOnce(jsonResponse({ result: readResult }))
    const adapter = await bootstrapServerProjectStorage(fetchMock)
    if (!adapter) throw new Error('expected server adapter')

    const read = await adapter.readProject(ref)
    expect(read.beatSheet).toEqual(synced)
    expect(read.result).toEqual(readResult)

    await expect(adapter.readProject(ref)).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('sends the session token on the refresh and status calls', async () => {
    const refreshBody = { beatSheet: { kind: 'no-beat-sheet' }, outline: null }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(bootstrapBody))
      .mockResolvedValueOnce(jsonResponse(refreshBody))
      .mockResolvedValueOnce(jsonResponse({ beatSheet: { kind: 'not-linked' } }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const adapter = await bootstrapServerProjectStorage(fetchMock)
      if (!adapter?.beatSheet) throw new Error('expected beat sheet client')
      await expect(adapter.beatSheet.refresh(ref.id)).resolves.toEqual(refreshBody)
      await expect(adapter.beatSheet.status(ref.id)).resolves.toEqual({ kind: 'not-linked' })
      expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/project-library/projects/${ref.id}/beat-sheet/refresh`, expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-WriterOS-Session': 'tok' }),
      }))
      expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/project-library/projects/${ref.id}/beat-sheet/status`, expect.objectContaining({
        headers: expect.objectContaining({ 'X-WriterOS-Session': 'tok' }),
      }))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('the folder adapter returns beatSheet null', async () => {
    const notFound = Object.assign(new Error('missing'), { name: 'NotFoundError' })
    const emptyDir = {
      kind: 'directory',
      name: 'x.writeros',
      getDirectoryHandle: async () => { throw notFound },
      getFileHandle: async () => { throw notFound },
    }
    const adapter = createFileSystemAccessProjectStorageAdapter({ ...emptyDir, name: 'Root' } as never)
    const read = await adapter.readProject({ handle: emptyDir } as never)
    expect(read.beatSheet).toBeNull()
  })
})
