import { describe, expect, it, vi } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import {
  ServerProjectStorageError,
  bootstrapServerProjectStorage,
} from '../../client/src/lib/serverProjectStorage'
import type { StoredProject } from '../../client/src/lib/projectLibrary'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeProject(): StoredProject {
  const state = defaultProjectState()
  state.meta.title = 'The Salt Line'
  return {
    id: 'server-project-1234',
    createdAt: Date.parse('2026-08-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-08-02T10:00:00.000Z'),
    state,
  }
}

const ref = {
  kind: 'server' as const,
  id: 'server-project-1234',
  packageName: 'The Salt Line (serverpr).writeros',
  summary: {
    id: 'server-project-1234',
    title: 'The Salt Line',
    createdAt: Date.parse('2026-08-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-08-02T10:00:00.000Z'),
  },
}

describe('server project storage adapter', () => {
  it('returns null when server project library is disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ enabled: false }))

    await expect(bootstrapServerProjectStorage(fetchMock)).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/project-library/bootstrap', expect.objectContaining({
      credentials: 'same-origin',
    }))
  })

  it('lists, reads, and writes through authenticated same-origin requests', async () => {
    const project = makeProject()
    const readyEntry = { status: 'ready' as const, ref, warnings: [] }
    const readResult = {
      ok: true as const,
      manifest: { format: 'writeros-project', version: 1, projectId: project.id },
      project,
      warnings: [],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        enabled: true,
        label: 'WriterOS Projects',
        sessionToken: 'secret-session-token',
      }))
      .mockResolvedValueOnce(jsonResponse({ entries: [readyEntry] }))
      .mockResolvedValueOnce(jsonResponse({ result: readResult }))
      .mockResolvedValueOnce(jsonResponse({ ref }))

    const adapter = await bootstrapServerProjectStorage(fetchMock)
    expect(adapter).not.toBeNull()
    if (!adapter) throw new Error('expected server adapter')

    await expect(adapter.listProjects()).resolves.toEqual([readyEntry])
    await expect(adapter.readProject(ref)).resolves.toEqual(readResult)
    await expect(adapter.writeProject(project, ref)).resolves.toEqual(ref)

    expect(adapter.kind).toBe('server')
    expect(adapter.label).toBe('WriterOS Projects')
    expect(adapter.capabilities).toEqual({
      removeProject: false,
      archiveProject: false,
      restoreProject: false,
      showProjectInFolder: false,
      duplicateProject: false,
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/project-library/projects', expect.objectContaining({
      headers: expect.objectContaining({ 'X-WriterOS-Session': 'secret-session-token' }),
      credentials: 'same-origin',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/project-library/projects/server-project-1234', expect.objectContaining({
      headers: expect.objectContaining({ 'X-WriterOS-Session': 'secret-session-token' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/project-library/projects/server-project-1234', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-WriterOS-Session': 'secret-session-token',
      }),
      body: JSON.stringify({ project }),
    }))
  })

  it('returns explicit unsupported results without calling server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      enabled: true,
      label: 'WriterOS Projects',
      sessionToken: 'secret-session-token',
    }))
    const adapter = await bootstrapServerProjectStorage(fetchMock)
    if (!adapter) throw new Error('expected server adapter')

    await expect(adapter.removeProject(ref)).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    await expect(adapter.archiveProject(ref)).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    await expect(adapter.restoreProject(ref)).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    await expect(adapter.showProjectInFolder(ref)).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    await expect(adapter.duplicateProject(ref)).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('surfaces stable API errors without exposing response internals', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        enabled: true,
        label: 'WriterOS Projects',
        sessionToken: 'secret-session-token',
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: 'name-collision',
        message: 'A WriterOS project package with this name already exists.',
        ignored: '/private/project/root',
      }, 409))
    const adapter = await bootstrapServerProjectStorage(fetchMock)
    if (!adapter) throw new Error('expected server adapter')

    await adapter.writeProject(makeProject()).catch(error => {
      expect(error).toBeInstanceOf(ServerProjectStorageError)
      expect(error).toEqual(expect.objectContaining({
        name: 'ServerProjectStorageError',
        statusCode: 409,
        code: 'name-collision',
        message: 'A WriterOS project package with this name already exists.',
      }))
      expect(JSON.stringify(error)).not.toContain('/private/project/root')
    })
  })
})
