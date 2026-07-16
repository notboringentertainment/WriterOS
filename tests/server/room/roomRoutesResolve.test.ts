import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const { storeMock } = vi.hoisted(() => ({
  storeMock: {
    resolveProposal: vi.fn(),
    insertMessage: vi.fn(),
    listProposals: vi.fn(),
    listRecentMessages: vi.fn(),
    insertEvent: vi.fn(),
    writeBlock: vi.fn(),
  },
}))
vi.mock('../../../server/room/store', () => storeMock)
vi.mock('../../../server/room/supabaseClient', () => ({ isRoomConfigured: () => true }))
vi.mock('../../../server/room/scheduler', () => ({ startRoomScheduler: () => true }))
vi.mock('../../../server/room/sseHub', () => ({ addSseClient: vi.fn(), broadcast: vi.fn() }))
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()), ensureProjectMemory: vi.fn(async () => undefined),
}))

import { registerRoomRoutes } from '../../../server/room/roomRoutes'

let server: http.Server
let port: number

beforeEach(async () => {
  vi.clearAllMocks()
  const app = express()
  app.use(express.json())
  registerRoomRoutes(app)
  server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString() || '{}') }))
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString() || '{}') }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('GET /api/room/:projectId/messages', () => {
  it('falls back to 50 for negative limits and caps large positive limits', async () => {
    storeMock.listRecentMessages.mockResolvedValue([])

    await get('/api/room/project-A/messages?limit=-5')
    await get('/api/room/project-A/messages?limit=999')

    expect(storeMock.listRecentMessages).toHaveBeenNthCalledWith(1, 'project-A', 50)
    expect(storeMock.listRecentMessages).toHaveBeenNthCalledWith(2, 'project-A', 200)
  })
})

describe('GET /api/room/:projectId/proposals', () => {
  it('does not forward invalid status filters', async () => {
    storeMock.listProposals.mockResolvedValue([])

    const res = await get('/api/room/project-A/proposals?status=wat')

    expect(res.status).toBe(200)
    expect(storeMock.listProposals).toHaveBeenCalledWith('project-A', undefined)
  })
})

describe('POST /api/room/:projectId/messages', () => {
  it('rejects oversized writer messages before inserting anything', async () => {
    const res = await post('/api/room/project-A/messages', { content: 'x'.repeat(4001), characterNames: [] })

    expect(res.status).toBe(413)
    expect(storeMock.insertMessage).not.toHaveBeenCalled()
    expect(storeMock.insertEvent).not.toHaveBeenCalled()
  })

  it('persists writer_message events with visible character card context', async () => {
    storeMock.insertMessage.mockResolvedValueOnce({ id: 'm1', author: 'writer', kind: 'say', content: 'Casey, help with Rosa.' })
    storeMock.insertEvent.mockResolvedValueOnce({ id: 'e1' })

    const res = await post('/api/room/project-A/messages', {
      content: 'Casey, help with Rosa.',
      characterNames: ['Rosa'],
      characters: [{ id: 'r1', name: 'Rosa', want: '', need: 'accept help' }],
      surfaceAwareness: {
        kind: 'intake', surface: 'outline', surfaceTitle: 'Outline', format: 'series',
        questions: [{ id: 'series.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' }],
        selectionSource: 'first_unanswered',
        answeredCount: 0, totalCount: 1,
        nextQuestion: { id: 'series.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' },
        nextRecommendedAction: 'answer_next_question',
      },
    })

    expect(res.status).toBe(200)
    expect(storeMock.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'writer_message',
        payload: expect.objectContaining({
          characterNames: ['Rosa'],
          characters: [{ id: 'r1', name: 'Rosa', want: '', need: 'accept help' }],
          surfaceAwareness: expect.objectContaining({
            kind: 'intake', surface: 'outline', format: 'series',
            nextQuestion: expect.objectContaining({ label: 'Who are we following?' }),
          }),
        }),
      }),
    )
  })
})

describe('POST /api/room/:projectId/proposals/:id/resolve', () => {
  it('passes the route projectId into the store (cross-project scoping)', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce({
      id: 'prop-1', project_id: 'project-A', agent_id: 'casey', surface: 'storyBible',
      field_path: 'characters[r1].want', proposed_value: 'x', rationale: 'y',
      status: 'adopted', resolved_at: 'now', created_at: 'then',
    })
    storeMock.insertMessage.mockResolvedValueOnce({ id: 'm1', author: 'writer', kind: 'system', content: '' })

    const res = await post('/api/room/project-A/proposals/prop-1/resolve', { status: 'adopted' })

    expect(res.status).toBe(200)
    expect(storeMock.resolveProposal).toHaveBeenCalledWith('project-A', 'prop-1', 'adopted')
  })

  it('passes a writer-edited resolved value to the store', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce({
      id: 'prop-1', project_id: 'project-A', agent_id: 'morgan', surface: 'storyBible',
      field_path: 'characters[r1].want', proposed_value: 'draft', resolved_value: 'writer edit', rationale: 'y',
      status: 'adopted', resolved_at: 'now', created_at: 'then',
    })
    storeMock.insertMessage.mockResolvedValueOnce({ id: 'm1', author: 'writer', kind: 'system', content: '' })

    const res = await post('/api/room/project-A/proposals/prop-1/resolve', {
      status: 'adopted',
      resolved_value: 'writer edit',
    })

    expect(res.status).toBe(200)
    expect(storeMock.resolveProposal).toHaveBeenCalledWith('project-A', 'prop-1', 'adopted', {
      resolvedValue: 'writer edit',
    })
  })

  it('passes a writer origin override to the store', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce({
      id: 'prop-1', project_id: 'project-A', agent_id: 'morgan', surface: 'storyBible',
      field_path: 'characters[r1].want', proposed_value: 'draft', origin: 'extrapolated', rationale: 'y',
      status: 'adopted', resolved_at: 'now', created_at: 'then',
    })
    storeMock.insertMessage.mockResolvedValueOnce({ id: 'm1', author: 'writer', kind: 'system', content: '' })

    const res = await post('/api/room/project-A/proposals/prop-1/resolve', {
      status: 'adopted',
      origin: 'extrapolated',
    })

    expect(res.status).toBe(200)
    expect(storeMock.resolveProposal).toHaveBeenCalledWith('project-A', 'prop-1', 'adopted', {
      origin: 'extrapolated',
    })
  })

  it('passes writer edit and origin override together', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce({
      id: 'prop-1', project_id: 'project-A', agent_id: 'morgan', surface: 'storyBible',
      field_path: 'characters[r1].want', proposed_value: 'draft', resolved_value: 'writer edit',
      origin: 'seed', rationale: 'y', status: 'adopted', resolved_at: 'now', created_at: 'then',
    })
    storeMock.insertMessage.mockResolvedValueOnce({ id: 'm1', author: 'writer', kind: 'system', content: '' })

    const res = await post('/api/room/project-A/proposals/prop-1/resolve', {
      status: 'adopted',
      resolved_value: 'writer edit',
      origin: 'seed',
    })

    expect(res.status).toBe(200)
    expect(storeMock.resolveProposal).toHaveBeenCalledWith('project-A', 'prop-1', 'adopted', {
      resolvedValue: 'writer edit',
      origin: 'seed',
    })
  })

  it('rejects invalid origin overrides', async () => {
    const res = await post('/api/room/project-A/proposals/prop-1/resolve', { status: 'adopted', origin: 'wrong' })
    expect(res.status).toBe(400)
    expect(storeMock.resolveProposal).not.toHaveBeenCalled()
  })

  it('rejects non-string resolved values', async () => {
    const res = await post('/api/room/project-A/proposals/prop-1/resolve', { status: 'adopted', resolved_value: 12 })
    expect(res.status).toBe(400)
    expect(storeMock.resolveProposal).not.toHaveBeenCalled()
  })

  it('returns 409 when the proposal is stale, already resolved, or belongs to another project', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce(null)

    const res = await post('/api/room/project-B/proposals/prop-1/resolve', { status: 'adopted' })

    expect(res.status).toBe(409)
    expect(String(res.json.message)).toMatch(/not pending/i)
    expect(storeMock.insertMessage).not.toHaveBeenCalled() // no channel log for a refused resolve
  })

  it('keeps stale/double resolve at 409 even with interview confirmation metadata', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce(null)

    const res = await post('/api/room/project-B/proposals/prop-1/resolve', {
      status: 'adopted',
      resolved_value: 'writer edit',
      origin: 'seed',
    })

    expect(res.status).toBe(409)
    expect(storeMock.resolveProposal).toHaveBeenCalledWith('project-B', 'prop-1', 'adopted', {
      resolvedValue: 'writer edit',
      origin: 'seed',
    })
    expect(storeMock.insertMessage).not.toHaveBeenCalled()
  })

  it('still 500s on real store failures', async () => {
    storeMock.resolveProposal.mockRejectedValueOnce(new Error('db down'))
    const res = await post('/api/room/project-A/proposals/prop-1/resolve', { status: 'rejected' })
    expect(res.status).toBe(500)
  })

  it('rejects invalid statuses', async () => {
    const res = await post('/api/room/project-A/proposals/prop-1/resolve', { status: 'superseded' })
    expect(res.status).toBe(400)
    expect(storeMock.resolveProposal).not.toHaveBeenCalled()
  })
})
