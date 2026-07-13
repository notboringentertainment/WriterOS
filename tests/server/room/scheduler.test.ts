import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomMemoryError } from '../../../server/room/memoryContract';

const storeMock = vi.hoisted(() => ({ claimQueuedEvents: vi.fn(), requeueRoomEvent: vi.fn(), lastMessageAt: vi.fn(), insertEvent: vi.fn() }));
const turnMock = vi.hoisted(() => vi.fn());
vi.mock('../../../server/room/store', () => storeMock);
vi.mock('../../../server/room/runRoomTurn', () => ({ runRoomTurn: turnMock }));
vi.mock('../../../server/room/digest', () => ({ runCaseyDigest: vi.fn() }));
vi.mock('../../../server/room/wakeRules', () => ({ decideSpeakers: () => [
  { agentId: 'sam', mode: 'turn' }, { agentId: 'casey', mode: 'turn' },
], MORGAN_ID: 'writingPartner' }));
vi.mock('../../../server/room/sseHub', () => ({ openProjectIds: () => [] }));
vi.mock('../../../server/room/supabaseClient', () => ({ isRoomConfigured: () => true }));
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', () => ({ isAnthropicConfigured: () => true }));

import { __processEventsForTests } from '../../../server/room/scheduler';

const event = { id: 'e1', project_id: 'p1', kind: 'writer_message', payload: { content: 'hello', characterNames: ['Rosa'] }, processed_at: null, created_at: '' };

beforeEach(() => { vi.clearAllMocks(); storeMock.claimQueuedEvents.mockResolvedValue([event]); storeMock.requeueRoomEvent.mockResolvedValue(undefined); });

describe('scheduler memory retry', () => {
  it('preserves payload and records completed speakers', async () => {
    turnMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new RoomMemoryError('memory down'));
    await __processEventsForTests();
    expect(storeMock.requeueRoomEvent).toHaveBeenCalledWith('e1', {
      content: 'hello', characterNames: ['Rosa'], memoryRetries: 1, memoryCompletedSpeakers: ['turn:sam'],
    });
  });

  it('skips completed speakers and does not requeue after retry limit', async () => {
    storeMock.claimQueuedEvents.mockResolvedValue([{ ...event, payload: { ...event.payload, memoryRetries: 3, memoryCompletedSpeakers: ['turn:sam'] } }]);
    turnMock.mockRejectedValueOnce(new RoomMemoryError('memory down'));
    await __processEventsForTests();
    expect(turnMock).toHaveBeenCalledTimes(1);
    expect(turnMock.mock.calls[0][0].agentId).toBe('casey');
    expect(storeMock.requeueRoomEvent).not.toHaveBeenCalled();
  });
});
