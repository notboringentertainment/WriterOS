import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const storeMock = vi.hoisted(() => ({
  getSharedBlockValue: vi.fn(async () => '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.'),
  casUpdateSharedBlock: vi.fn(async () => true), writeBlock: vi.fn(), insertMessage: vi.fn(async () => ({ id: 'm1' })),
  listRecentMessages: vi.fn(async () => []), insertEvent: vi.fn(async () => ({ id: 'e1' })),
  listProposals: vi.fn(async () => []), resolveProposal: vi.fn(async () => null),
}));
vi.mock('../../../server/room/store', () => storeMock);
vi.mock('../../../server/room/supabaseClient', () => ({ isRoomConfigured: () => true }));
vi.mock('../../../server/room/scheduler', () => ({ startRoomScheduler: () => true }));
const sseMock = vi.hoisted(() => ({ addSseClient: vi.fn((_p, res) => res.status(200).end()), broadcast: vi.fn() }));
vi.mock('../../../server/room/sseHub', () => sseMock);
const runtimeMock = vi.hoisted(() => ({
  getInterviewStatus: vi.fn(async () => ({ activeSession: null })), startInterview: vi.fn(async () => ({})),
  answerInterviewQuestion: vi.fn(async () => ({})), skipInterviewQuestion: vi.fn(async () => ({})),
  wrapInterview: vi.fn(async () => ({})), pauseInterview: vi.fn(async () => ({})), resumeInterview: vi.fn(async () => ({})),
  previewBankFinal: vi.fn(async () => ({ preview: {}, finalValues: {} })), bankInterview: vi.fn(async () => ({})), exportInterview: vi.fn(async () => ({})),
}));
vi.mock('../../../server/room/interview/runtime', () => runtimeMock);
const memoryMock = vi.hoisted(() => ({ ensureProjectMemory: vi.fn(async () => undefined) }));
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({ ...(await importOriginal<object>()), ensureProjectMemory: memoryMock.ensureProjectMemory }));
import { registerRoomRoutes } from '../../../server/room/roomRoutes';

let server: http.Server; let port: number;
beforeEach(async () => {
  vi.clearAllMocks(); const app = express(); app.use(express.json()); registerRoomRoutes(app); server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); port = (server.address() as AddressInfo).port;
});
afterEach(async () => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));
const post = (path: string, body: object = {}) => fetch(`http://127.0.0.1:${port}/api/room/p1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const guarded: Array<[string, object]> = [
  ['/memory/ensure', {}], ['/messages', { content: 'hi' }], ['/events', { kind: 'lock_changed' }],
  ['/blocks/story-locks', { value: '- lock' }], ['/interview/start', { mode: 'full', seedText: 'seed' }],
  ['/interview/s1/answer', { answerText: 'a' }], ['/interview/s1/skip', {}], ['/interview/s1/wrap', {}],
  ['/interview/s1/pause', {}], ['/interview/s1/resume', {}], ['/interview/s1/bank-preview', {}],
  ['/interview/s1/bank', {}], ['/interview/s1/export', {}],
];

describe('memory guard', () => {
  it.each(guarded)('initializes before %s and returns 503 on failure', async (path, body) => {
    expect((await post(path, body)).status).not.toBe(503);
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1');
    vi.clearAllMocks(); memoryMock.ensureProjectMemory.mockRejectedValueOnce(new Error('db down'));
    const failed = await post(path, body);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ message: 'Room memory unavailable.' });
  });

  it('guards stream but excludes read-only and proposal resolve routes', async () => {
    expect((await fetch(`http://127.0.0.1:${port}/api/room/p1/stream`)).status).toBe(200);
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1');
    vi.clearAllMocks();
    await fetch(`http://127.0.0.1:${port}/api/room/p1/messages`);
    await fetch(`http://127.0.0.1:${port}/api/room/p1/proposals`);
    await fetch(`http://127.0.0.1:${port}/api/room/p1/interview`);
    await post('/proposals/x1/resolve', { status: 'rejected' });
    expect(memoryMock.ensureProjectMemory).not.toHaveBeenCalled();
  });
});
