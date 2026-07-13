import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const storeMock = vi.hoisted(() => ({
  getSharedBlockValue: vi.fn(), casUpdateSharedBlock: vi.fn(async (_input: unknown): Promise<boolean> => true), writeBlock: vi.fn(),
  insertMessage: vi.fn(), listRecentMessages: vi.fn(async () => []), insertEvent: vi.fn(),
  listProposals: vi.fn(async () => []), resolveProposal: vi.fn(),
}));
vi.mock('../../../server/room/store', () => storeMock);
vi.mock('../../../server/room/supabaseClient', () => ({ isRoomConfigured: () => true }));
vi.mock('../../../server/room/scheduler', () => ({ startRoomScheduler: () => true }));
vi.mock('../../../server/room/sseHub', () => ({ addSseClient: vi.fn(), broadcast: vi.fn() }));
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({
  ...(await importOriginal<object>()), ensureProjectMemory: vi.fn(async () => undefined),
}));

import { registerRoomRoutes } from '../../../server/room/roomRoutes';

let server: http.Server;
let port: number;
beforeEach(async () => {
  vi.clearAllMocks();
  const app = express(); app.use(express.json()); registerRoomRoutes(app);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));

const sync = (value: string) => fetch(`http://127.0.0.1:${port}/api/room/p1/blocks/story-locks`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }),
});
const casArgs = (index = 0) => storeMock.casUpdateSharedBlock.mock.calls[index][0] as Record<string, string>;

describe('POST /blocks/story-locks', () => {
  it('rewrites only surface section through CAS', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue('## Surface-declared locks\nold\n\n## Meeting locks\n[SEED] ending fixed');
    expect((await sync('- Ace lives')).status).toBe(200);
    const args = casArgs();
    expect(args.next).toContain('## Surface-declared locks\n- Ace lives');
    expect(args.next).toContain('## Meeting locks\n[SEED] ending fixed');
  });

  it('adopts legacy meeting locks before syncing', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue('[SEED] Interview answer: ending fixed');
    await sync('- bible lock');
    expect(casArgs().next).toContain('## Meeting locks\n[SEED] Interview answer: ending fixed');
  });

  it('re-reads and re-merges after lost CAS', async () => {
    storeMock.getSharedBlockValue
      .mockResolvedValueOnce('## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.')
      .mockResolvedValueOnce('## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] banked mid-flight');
    storeMock.casUpdateSharedBlock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await sync('- Ace lives')).status).toBe(200);
    expect(casArgs(1).next).toContain('[SEED] banked mid-flight');
  });

  it('maps bounded retry, cap, reserved header, and missing row outcomes', async () => {
    storeMock.getSharedBlockValue.mockResolvedValue('## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.');
    storeMock.casUpdateSharedBlock.mockResolvedValue(false);
    expect((await sync('- lock')).status).toBe(409);
    expect(storeMock.casUpdateSharedBlock).toHaveBeenCalledTimes(3);

    vi.clearAllMocks();
    storeMock.getSharedBlockValue.mockResolvedValue('## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] keep');
    expect((await sync('x'.repeat(3000))).status).toBe(413);
    expect(storeMock.casUpdateSharedBlock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    expect((await sync('real\n## Meeting locks\nsmuggled')).status).toBe(422);
    expect(storeMock.getSharedBlockValue).not.toHaveBeenCalled();

    storeMock.getSharedBlockValue.mockResolvedValue(null);
    expect((await sync('- anything')).status).toBe(503);
  });
});
