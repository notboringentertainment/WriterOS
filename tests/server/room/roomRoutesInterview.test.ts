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
    previewBank: vi.fn(),
    bankInterview: vi.fn(),
    exportInterview: vi.fn(),
  },
}))
vi.mock('../../../server/room/interview/runtime', () => runtimeMock)
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

function post(path: string, body: unknown = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
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

describe('First Meeting routes', () => {
  it('loads status without auto-starting a session', async () => {
    runtimeMock.getInterviewStatus.mockResolvedValueOnce({ activeSession: null, hasBankedSeed: false, actionLabel: 'First Meeting', currentQuestion: null })

    const res = await get('/api/room/project-A/interview')

    expect(res.status).toBe(200)
    expect(runtimeMock.getInterviewStatus).toHaveBeenCalledWith('project-A')
    expect(runtimeMock.startInterview).not.toHaveBeenCalled()
    expect(res.json).toMatchObject({ actionLabel: 'First Meeting' })
  })

  it('starts an explicit full First Meeting with seed text and speculative flag', async () => {
    runtimeMock.startInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'interviewing' }, auditMessage: 'Morgan audit', currentQuestion: { id: 'morgan-locks' } })

    const res = await post('/api/room/project-A/interview/start', { mode: 'full', seedText: 'thin seed', speculative: true })

    expect(res.status).toBe(200)
    expect(runtimeMock.startInterview).toHaveBeenCalledWith({ projectId: 'project-A', mode: 'full', seedText: 'thin seed', speculative: true })
    expect(res.json).toMatchObject({ session: { id: 's1' }, auditMessage: 'Morgan audit' })
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
    runtimeMock.previewBank.mockResolvedValueOnce({ seedText: 'seed', locks: [], openQuestions: [] })
    runtimeMock.bankInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'banked' }, preview: { seedText: 'seed' } })
    runtimeMock.exportInterview.mockResolvedValueOnce({ session: { id: 's1', state: 'exported' }, markdown: '# Export' })

    expect((await post('/api/room/project-A/interview/s1/answer', { answerText: 'lock it', origin: 'seed' })).status).toBe(200)
    expect((await post('/api/room/project-A/interview/s1/skip')).status).toBe(200)
    expect((await post('/api/room/project-A/interview/s1/pause')).json).toMatchObject({ session: { state: 'paused' } })
    expect((await post('/api/room/project-A/interview/s1/resume')).json).toMatchObject({ session: { state: 'interviewing' } })
    expect((await get('/api/room/project-A/interview/s1/bank-preview')).json).toMatchObject({ preview: { seedText: 'seed' } })
    expect((await post('/api/room/project-A/interview/s1/bank', { mutability: {} })).json).toMatchObject({ session: { state: 'banked' } })
    expect((await post('/api/room/project-A/interview/s1/export')).json).toMatchObject({ markdown: '# Export' })
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
})
