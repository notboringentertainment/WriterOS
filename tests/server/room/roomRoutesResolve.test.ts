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

  it('returns 409 when the proposal is stale, already resolved, or belongs to another project', async () => {
    storeMock.resolveProposal.mockResolvedValueOnce(null)

    const res = await post('/api/room/project-B/proposals/prop-1/resolve', { status: 'adopted' })

    expect(res.status).toBe(409)
    expect(String(res.json.message)).toMatch(/not pending/i)
    expect(storeMock.insertMessage).not.toHaveBeenCalled() // no channel log for a refused resolve
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
