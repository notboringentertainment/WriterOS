import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';
import type { InterviewSessionRow } from '../../../server/room/interview/types';

afterEach(() => {
  __setRoomDbForTests(null);
  vi.restoreAllMocks();
});

function fakeDb(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const chain = {
    insert: () => chain,
    update: () => chain,
    select: () => chain,
    eq: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    order: () => Promise.resolve(result),
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const bankedSession: InterviewSessionRow = {
  id: 's1',
  project_id: 'p1',
  mode: 'full',
  state: 'banked',
  seed_text: 'seed',
  audit: {},
  cursor: { lane: null, question_id: null, budgets_spent: {} },
  answers: [],
  created_at: '2026-07-08T00:00:00Z',
  updated_at: '2026-07-08T00:00:00Z',
};

const exportedSession: InterviewSessionRow = {
  ...bankedSession,
  state: 'exported',
};

const activeSession: InterviewSessionRow = {
  ...bankedSession,
  state: 'interviewing',
  cursor: { lane: 'morgan', question_id: 'morgan-locks', budgets_spent: {} },
};

const caseyActiveSession: InterviewSessionRow = {
  ...bankedSession,
  state: 'interviewing',
  cursor: { lane: 'casey', question_id: 'casey-load-bearing-character', budgets_spent: {} },
};

describe('interviewRuntime.wrapInterview', () => {
  it('refuses to wrap a banked session back to readback', async () => {
    __setRoomDbForTests(fakeDb({ data: bankedSession, error: null }));

    const { wrapInterview } = await import('../../../server/room/interview/runtime');

    await expect(wrapInterview({ sessionId: 's1', projectId: 'p1' })).rejects.toThrow(/already (banked|exported)/);
  });

  it('refuses to wrap an exported session', async () => {
    __setRoomDbForTests(fakeDb({ data: exportedSession, error: null }));

    const { wrapInterview } = await import('../../../server/room/interview/runtime');

    await expect(wrapInterview({ sessionId: 's1', projectId: 'p1' })).rejects.toThrow(/already (banked|exported)/);
  });
});

describe('interviewRuntime.project ownership guard', () => {
  it('rejects answer when session belongs to a different project', async () => {
    __setRoomDbForTests(fakeDb({ data: activeSession, error: null }));

    const { answerInterviewQuestion } = await import('../../../server/room/interview/runtime');

    await expect(answerInterviewQuestion({ sessionId: 's1', projectId: 'p2', answerText: 'lock it' })).rejects.toThrow(/does not belong to project/);
  });
});

describe('interviewRuntime.length caps', () => {
  it('rejects oversized seed text', async () => {
    const { startInterview } = await import('../../../server/room/interview/runtime');
    await expect(startInterview({ projectId: 'p1', mode: 'full', seedText: 'a'.repeat(20001) })).rejects.toThrow(/exceeds maximum length/);
  });

  it('rejects oversized answer text and resolved value', async () => {
    __setRoomDbForTests(fakeDb({ data: activeSession, error: null }));

    const { answerInterviewQuestion } = await import('../../../server/room/interview/runtime');

    await expect(answerInterviewQuestion({ sessionId: 's1', projectId: 'p1', answerText: 'a'.repeat(20001) })).rejects.toThrow(/exceeds maximum length/);
    await expect(answerInterviewQuestion({ sessionId: 's1', projectId: 'p1', answerText: 'short', resolvedValue: 'a'.repeat(20001) })).rejects.toThrow(/exceeds maximum length/);
  });
});

describe('interviewRuntime.field_path normalization', () => {
  it('normalizes composite writerOSTarget patterns at proposal insert time', async () => {
    __setRoomDbForTests(fakeDb({ data: caseyActiveSession, error: null }));

    const roomStore = await import('../../../server/room/store');
    const insertSpy = vi.spyOn(roomStore, 'insertProposal').mockResolvedValue(undefined as never);

    const { answerInterviewQuestion } = await import('../../../server/room/interview/runtime');
    await answerInterviewQuestion({ sessionId: 's1', projectId: 'p1', answerText: 'complex character detail' });

    expect(insertSpy).toHaveBeenCalled();
    const fieldPath = insertSpy.mock.calls[0][0].fieldPath as string;
    expect(fieldPath).not.toContain('{');
    expect(fieldPath).not.toContain('[');
    expect(fieldPath).not.toContain('|');
    expect(fieldPath).toBe('interview_answer.casey-load-bearing-character');

    insertSpy.mockRestore();
  });
});
