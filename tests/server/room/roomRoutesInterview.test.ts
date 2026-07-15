import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const { runtimeMock } = vi.hoisted(() => ({
  runtimeMock: {
    getInterviewStatus: vi.fn(),
    startInterview: vi.fn(),
    answerInterviewQuestion: vi.fn(),
    skipInterviewQuestion: vi.fn(),
    wrapInterview: vi.fn(),
    pauseInterview: vi.fn(),
    resumeInterview: vi.fn(),
    redirectInterviewArea: vi.fn(),
    previewBank: vi.fn(),
    previewBankFinal: vi.fn(),
    bankInterview: vi.fn(),
    exportInterview: vi.fn(),
    createPitchPacketDraft: vi.fn(),
    savePitchPacketDraft: vi.fn(),
    approvePitchPacket: vi.fn(),
    exportPitchPacket: vi.fn(),
    getExportedPitchPacket: vi.fn(),
  },
}))
vi.mock('../../../server/room/interview/runtime', () => runtimeMock)
vi.mock('../../../server/room/interview/pitchPacketRuntime', () => runtimeMock)
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

function post(path: string, body: unknown = {}, method = 'POST'): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(Buffer.from(c)))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString() || '{}') }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(Buffer.from(c)))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString() || '{}') }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('Project Meeting routes', () => {
  it('loads status without auto-starting a session', async () => {
    runtimeMock.getInterviewStatus.mockResolvedValueOnce({ activeSession: null, hasBankedSeed: false, actionLabel: 'Project Meeting', currentQuestion: null })

    const res = await get('/api/room/project-A/interview')

    expect(res.status).toBe(200)
    expect(runtimeMock.getInterviewStatus).toHaveBeenCalledWith('project-A')
    expect(runtimeMock.startInterview).not.toHaveBeenCalled()
    expect(res.json).toMatchObject({ actionLabel: 'Project Meeting' })
  })

  it('starts an explicit full Project Meeting with seed text and speculative flag', async () => {
    runtimeMock.startInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'interviewing' }, auditMessage: 'Morgan audit', currentQuestion: { id: 'morgan-locks' } })

    const res = await post('/api/room/project-A/interview/start', { mode: 'full', seedText: '  thin seed  ', speculative: true })

    expect(res.status).toBe(200)
    expect(runtimeMock.startInterview).toHaveBeenCalledWith({ projectId: 'project-A', mode: 'full', seedText: '  thin seed  ', speculative: true })
    expect(res.json).toMatchObject({ session: { id: 's1' }, auditMessage: 'Morgan audit' })
  })

  it('returns 409 when a Project Meeting is already in progress', async () => {
    runtimeMock.startInterview.mockRejectedValueOnce(new Error('A Project Meeting is already in progress for project project-A.'))

    const res = await post('/api/room/project-A/interview/start', { mode: 'full', seedText: 'second seed' })

    expect(res.status).toBe(409)
    expect(res.json).toMatchObject({ message: expect.stringContaining('already in progress') })
  })

  it('rejects blank start seed before creating anything', async () => {
    const res = await post('/api/room/project-A/interview/start', { mode: 'full', seedText: '   ' })

    expect(res.status).toBe(400)
    expect(runtimeMock.startInterview).not.toHaveBeenCalled()
  })

  it('rejects action on interview session belonging to a different project', async () => {
    runtimeMock.answerInterviewQuestion.mockRejectedValueOnce(new Error('Interview session does not belong to project project-A.'))

    const res = await post('/api/room/project-A/interview/s1/answer', { answerText: 'hello' })

    expect(res.status).toBe(409)
    expect(runtimeMock.answerInterviewQuestion).toHaveBeenCalled()
  })

  it('answers, skips, pauses/resumes, banks, and exports through explicit actions', async () => {
    runtimeMock.answerInterviewQuestion.mockResolvedValueOnce({ session: { id: 's1', state: 'interviewing' }, currentQuestion: { id: 'morgan-ending' } })
    runtimeMock.skipInterviewQuestion.mockResolvedValueOnce({ session: { id: 's1', state: 'readback' }, currentQuestion: null })
    runtimeMock.pauseInterview.mockResolvedValueOnce({ id: 's1', state: 'paused' })
    runtimeMock.resumeInterview.mockResolvedValueOnce({ id: 's1', state: 'interviewing' })
    runtimeMock.previewBankFinal.mockResolvedValueOnce({ preview: { seedText: 'seed', locks: [], openQuestions: [] }, finalValues: {} })
    runtimeMock.bankInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'banked' }, preview: { seedText: 'seed' } })
    runtimeMock.exportInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'exported' }, markdown: '# Export' })

    expect((await post('/api/room/project-A/interview/s1/answer', { answerText: 'lock it', origin: 'seed' })).status).toBe(200)
    expect((await post('/api/room/project-A/interview/s1/skip')).status).toBe(200)
    expect((await post('/api/room/project-A/interview/s1/pause')).json).toMatchObject({ session: { state: 'paused' } })
    expect((await post('/api/room/project-A/interview/s1/resume')).json).toMatchObject({ session: { state: 'interviewing' } })
    expect((await post('/api/room/project-A/interview/s1/bank-preview', { mutability: {} })).json).toMatchObject({ preview: { seedText: 'seed' } })
    expect((await post('/api/room/project-A/interview/s1/bank', { mutability: {} })).json).toMatchObject({ session: { state: 'banked' } })
    expect((await post('/api/room/project-A/interview/s1/export')).json).toMatchObject({ markdown: '# Export' })
  })

  it('passes writer mutability choices through preview and bank, dropping malformed entries', async () => {
    runtimeMock.previewBankFinal.mockResolvedValueOnce({ preview: { seedText: 'seed', locks: [], openQuestions: [], taggable: [] }, finalValues: {} })
    runtimeMock.bankInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'banked' }, preview: { seedText: 'seed' } })

    await post('/api/room/project-A/interview/s1/bank-preview', { mutability: { 'p-1': 'leaning', 'p-2': 'bogus', 'p-3': 42 } })
    expect(runtimeMock.previewBankFinal).toHaveBeenCalledWith({ sessionId: 's1', projectId: 'project-A', mutability: { 'p-1': 'leaning' }, operations: [] })

    await post('/api/room/project-A/interview/s1/bank', { mutability: { 'p-1': 'open', 'p-2': null } })
    expect(runtimeMock.bankInterview).toHaveBeenCalledWith({ sessionId: 's1', projectId: 'project-A', mutability: { 'p-1': 'open' }, operations: [] })
  })

  it('sanitizes revision operations for preview and bank and redirects an exact recap area', async () => {
    runtimeMock.previewBankFinal.mockResolvedValueOnce({ preview: {}, finalValues: {}, directionDiff: [] })
    runtimeMock.bankInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'banked' }, preview: {} })
    runtimeMock.redirectInterviewArea.mockResolvedValueOnce({ session: { id: 's1', state: 'interviewing' }, currentQuestion: { id: 'morgan-ending' } })
    const operations = [
      { op: 'keep', targetId: 'd1' },
      { op: 'revise', targetId: 'd2', statement: 'A sharper ending.', mutability: 'locked' },
      { op: 'retract', targetId: 'd3' },
      { op: 'supersede', targetIds: ['d4', 'd5'], area: 'ending', fieldPath: 'story_locks', statement: 'One ending.', mutability: 'locked' },
      { op: 'assert', targetId: 'bad' },
    ]

    await post('/api/room/project-A/interview/s1/bank-preview', { operations })
    expect(runtimeMock.previewBankFinal).toHaveBeenCalledWith(expect.objectContaining({ operations: operations.slice(0, 4) }))
    await post('/api/room/project-A/interview/s1/bank', { operations })
    expect(runtimeMock.bankInterview).toHaveBeenCalledWith(expect.objectContaining({ operations: operations.slice(0, 4) }))

    const redirect = await post('/api/room/project-A/interview/s1/redirect', { area: 'ending', questionId: 'morgan-ending' })
    expect(redirect.status).toBe(200)
    expect(runtimeMock.redirectInterviewArea).toHaveBeenCalledWith({ projectId: 'project-A', sessionId: 's1', area: 'ending', questionId: 'morgan-ending' })
    expect(JSON.stringify(redirect.json)).not.toMatch(/ledger|fold|projection|assert/i)
  })

  it('rejects overly long seed, answer, and resolved values', async () => {
    const oversized = 'a'.repeat(20001)
    runtimeMock.startInterview.mockRejectedValueOnce(new Error('seedText exceeds maximum length of 20000 characters.'))
    runtimeMock.answerInterviewQuestion.mockRejectedValueOnce(new Error('answerText exceeds maximum length of 20000 characters.'))
    runtimeMock.answerInterviewQuestion.mockRejectedValueOnce(new Error('resolvedValue exceeds maximum length of 20000 characters.'))

    expect((await post('/api/room/project-A/interview/start', { mode: 'full', seedText: oversized })).status).toBe(413)
    expect((await post('/api/room/project-A/interview/s1/answer', { answerText: oversized })).status).toBe(413)
    expect((await post('/api/room/project-A/interview/s1/answer', { answerText: 'short', resolvedValue: oversized })).status).toBe(413)
  })

  it('supports the explicit Pitch Packet draft, save, approve, export, and re-download lifecycle', async () => {
    const row = { id: 'packet-1', project_id: 'project-A', session_id: 's1', status: 'draft', packet: { packetVersion: 1 } }
    runtimeMock.createPitchPacketDraft.mockResolvedValueOnce({ row, proposalUnavailable: false })
    runtimeMock.savePitchPacketDraft.mockResolvedValueOnce(row)
    runtimeMock.approvePitchPacket.mockResolvedValueOnce({ ...row, status: 'approved' })
    runtimeMock.exportPitchPacket.mockResolvedValueOnce({ ...row, status: 'exported' })
    runtimeMock.getExportedPitchPacket.mockResolvedValueOnce({ ...row, status: 'exported' })

    expect((await post('/api/room/project-A/interview/s1/pitch-packet/draft', { documents: { synopsis: {} }, projectMeta: { title: 'Ace' } })).status).toBe(200)
    expect((await post('/api/room/project-A/interview/s1/pitch-packet/packet-1', { packet: { packetVersion: 1 } }, 'PATCH')).status).toBe(200)
    expect((await post('/api/room/project-A/interview/s1/pitch-packet/packet-1/approve')).json).toMatchObject({ status: 'approved' })
    expect((await post('/api/room/project-A/interview/s1/pitch-packet/packet-1/export')).json).toMatchObject({ status: 'exported' })
    expect((await get('/api/room/project-A/interview/s1/pitch-packet/exported')).json).toMatchObject({ status: 'exported' })
    expect(runtimeMock.createPitchPacketDraft).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-A', sessionId: 's1', projectMeta: { title: 'Ace' } }))
  })
})
