import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryMock = vi.hoisted(() => ({ ensureProjectMemory: vi.fn(async () => undefined) }));
const storeMock = vi.hoisted(() => ({
  getSharedBlocksForAgent: vi.fn(async () => []), getPrivateBlocks: vi.fn(async () => []),
  listRecentMessages: vi.fn(async () => []), getSharedBlockValue: vi.fn(async (): Promise<string | null> => ''),
  insertLedger: vi.fn(async () => undefined), insertMessage: vi.fn(), insertProposal: vi.fn(), insertEvent: vi.fn(), writeBlock: vi.fn(),
}));
const sendMock = vi.hoisted(() => vi.fn());
vi.mock('../../../server/room/memoryContract', async (importOriginal) => ({ ...(await importOriginal<object>()), ensureProjectMemory: memoryMock.ensureProjectMemory }));
vi.mock('../../../server/room/store', () => storeMock);
vi.mock('../../../server/room/sseHub', () => ({ broadcast: vi.fn() }));
vi.mock('../../../server/room/lockGate', () => ({ checkProposalAgainstLocks: vi.fn(async () => ({ blocked: false })), DIGEST_MODEL: 'test' }));
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', () => ({ isAnthropicConfigured: () => true, sendToolTurn: sendMock }));
import { runRoomTurn } from '../../../server/room/runRoomTurn';
import { RoomMemoryError } from '../../../server/room/memoryContract';

const event = { id: 'e1', project_id: 'p1', kind: 'doc_field_changed', payload: {}, processed_at: null, created_at: '' } as const;
beforeEach(() => { vi.clearAllMocks(); sendMock.mockResolvedValue({ stopReason: 'tool_use', toolUses: [{ id: 'u1', name: 'pass', input: { reason: 'n/a' } }], text: '', assistantContent: [] }); });

describe('runRoomTurn memory boundary', () => {
  it('verifies before model execution and blocks model on failure', async () => {
    await runRoomTurn({ projectId: 'p1', agentId: 'casey', event });
    expect(memoryMock.ensureProjectMemory).toHaveBeenCalledWith('p1');
    memoryMock.ensureProjectMemory.mockRejectedValueOnce(new Error('memory unavailable'));
    sendMock.mockClear();
    await expect(runRoomTurn({ projectId: 'p1', agentId: 'casey', event })).rejects.toThrow(/memory/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('classifies a missing story_locks block as retryable memory failure', async () => {
    storeMock.getSharedBlockValue.mockResolvedValueOnce(null);

    await expect(runRoomTurn({ projectId: 'p1', agentId: 'casey', event })).rejects.toBeInstanceOf(RoomMemoryError);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
