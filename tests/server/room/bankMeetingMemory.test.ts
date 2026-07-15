import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMock = vi.hoisted(() => ({
  getSharedBlockValue: vi.fn(),
  getSharedBlockSnapshot: vi.fn(),
  writeBlock: vi.fn(async () => ({ ok: true as const, nearCap: false })),
}));
vi.mock('../../../server/room/store', () => storeMock);

const rpcMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]): Promise<{ data: string | null; error: { message: string } | null }> => ({ data: 'banked', error: null })));
vi.mock('../../../server/room/supabaseClient', () => ({
  getRoomDb: () => ({ rpc: rpcMock }),
  isRoomConfigured: () => true,
}));

const readbackSession = {
  id: 's1', project_id: 'p1', mode: 'full', state: 'readback',
  seed_text: 'A noir about a lighthouse keeper.', audit: {}, bank_snapshot: null,
  cursor: { lane: null, question_id: null, budgets_spent: {} }, answers: [],
  created_at: '2026-07-08T00:00:00Z', updated_at: '2026-07-08T00:00:00Z',
};
const adoptedLock = {
  id: 'p-lock', project_id: 'p1', agent_id: 'morgan', surface: 'memory', field_path: 'story_locks',
  proposed_value: 'The ending is fixed.', resolved_value: null, rationale: 'constraint', status: 'adopted',
  resolved_at: '2026-07-08T01:00:00Z', kind: 'interview_answer', session_id: 's1',
  question_id: 'morgan-locks', origin: 'seed', created_at: '2026-07-08T00:30:00Z',
};
const interviewStoreMock = vi.hoisted(() => ({
  getInterviewSession: vi.fn(), updateInterviewSession: vi.fn(),
  listInterviewSessions: vi.fn(), listInterviewProposals: vi.fn(),
}));
vi.mock('../../../server/room/interview/store', () => interviewStoreMock);
const decisionsStoreMock = vi.hoisted(() => ({ listMeetingDecisions: vi.fn() }));
vi.mock('../../../server/room/interview/meetingDecisionsStore', () => decisionsStoreMock);
const traceEvents: object[] = [];

const SENTINEL_LOCKS = '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.';
const SENTINEL_OPEN = 'Nothing delegated — writer holds all intent.';

beforeEach(() => {
  vi.clearAllMocks();
  interviewStoreMock.getInterviewSession.mockResolvedValue(readbackSession);
  interviewStoreMock.listInterviewSessions.mockResolvedValue([readbackSession]);
  interviewStoreMock.listInterviewProposals.mockResolvedValue([adoptedLock]);
  decisionsStoreMock.listMeetingDecisions.mockResolvedValue([]);
  storeMock.getSharedBlockValue.mockImplementation(async (_projectId, label) => label === 'story_locks' ? SENTINEL_LOCKS : SENTINEL_OPEN);
  storeMock.getSharedBlockSnapshot.mockResolvedValue({ value: 'sentinel', revision: 0 });
  rpcMock.mockResolvedValue({ data: 'banked', error: null });
});
afterEach(async () => {
  const { __setMeetingTraceSinkForTests } = await import('../../../server/room/interview/trace');
  __setMeetingTraceSinkForTests(null);
  traceEvents.length = 0;
  vi.restoreAllMocks();
});

async function bank() {
  const { bankInterview } = await import('../../../server/room/interview/runtime');
  return bankInterview({ sessionId: 's1', projectId: 'p1' });
}

function rpcArgs(index = 0): Record<string, string | number | object> {
  return rpcMock.mock.calls[index][1] as Record<string, string | number | object>;
}

describe('bankInterview via bank_meeting_round', () => {
  it('writes atomically through one RPC and preserves lock sections', async () => {
    const { __setMeetingTraceSinkForTests } = await import('../../../server/room/interview/trace');
    __setMeetingTraceSinkForTests((event) => traceEvents.push(event));
    await bank();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe('bank_meeting_round');
    expect(rpcArgs()).toMatchObject({ p_bank_revision: 0, p_direction_revision: 0, p_locks_expected: SENTINEL_LOCKS });
    expect(rpcArgs().p_decisions).toEqual(expect.arrayContaining([expect.objectContaining({ op: 'assert', area: 'locks' })]));
    expect(rpcArgs().p_locks_next).toContain('## Meeting locks\n[SEED] The ending is fixed.');
    expect(storeMock.writeBlock).not.toHaveBeenCalled();
    expect(traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'meeting.direction.folded' }),
      expect.objectContaining({ type: 'meeting.ledger.bank_started' }),
      expect.objectContaining({ type: 'meeting.ledger.bank_committed' }),
    ]));
  });

  it('retries conflicts with fresh reads and stops after three', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'projection_conflict' } }).mockResolvedValueOnce({ data: 'banked', error: null });
    storeMock.getSharedBlockSnapshot.mockResolvedValueOnce({ value: 'old', revision: 0 }).mockResolvedValueOnce({ value: 'new', revision: 1 });
    await bank();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcArgs(1).p_bank_revision).toBe(1);

    vi.clearAllMocks();
    interviewStoreMock.getInterviewSession.mockResolvedValue(readbackSession);
    interviewStoreMock.listInterviewSessions.mockResolvedValue([readbackSession]);
    interviewStoreMock.listInterviewProposals.mockResolvedValue([adoptedLock]);
    decisionsStoreMock.listMeetingDecisions.mockResolvedValue([]);
    storeMock.getSharedBlockValue.mockImplementation(async (_projectId, label) => label === 'story_locks' ? SENTINEL_LOCKS : SENTINEL_OPEN);
    storeMock.getSharedBlockSnapshot.mockResolvedValue({ value: 'old', revision: 0 });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'locks_conflict' } });
    await expect(bank()).rejects.toThrow(/contention persisted/);
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });

  it('retries direction_conflict exactly three times with recomputed plans', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'direction_conflict' } });
    await expect(bank()).rejects.toThrow(/contention persisted across 3 attempts/);
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(decisionsStoreMock.listMeetingDecisions).toHaveBeenCalledTimes(3);
  });

  it('treats an already-banked session as idempotent success', async () => {
    interviewStoreMock.getInterviewSession.mockResolvedValue({ ...readbackSession, state: 'banked' });
    const result = await bank();
    expect(result.session.state).toBe('banked');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('records delegated transcript entries in open questions', async () => {
    interviewStoreMock.listInterviewProposals.mockResolvedValue([]);
    interviewStoreMock.getInterviewSession.mockResolvedValue({ ...readbackSession, answers: [{
      question_id: 'q1', question_text: 'Who carries the story?', domain: 'character', lane: 'casey',
      answer_text: 'delegated', origin: null, disposition: 'skipped_delegated', at: '2026-07-08T00:20:00Z',
    }] });
    await bank();
    expect(rpcArgs().p_open_questions).toContain('Delegated to the room: Who carries the story?');
  });

  it('preview final values equal bank RPC values', async () => {
    const { previewBankFinal } = await import('../../../server/room/interview/runtime');
    const { finalValues, pendingDecisions } = await previewBankFinal({ sessionId: 's1', projectId: 'p1' });
    await bank();
    const args = rpcArgs();
    expect(finalValues).toEqual({ concept_seed: args.p_concept_seed, story_locks: args.p_locks_next, open_questions: args.p_open_questions });
    expect(args.p_decisions).toEqual(pendingDecisions);
  });
});
