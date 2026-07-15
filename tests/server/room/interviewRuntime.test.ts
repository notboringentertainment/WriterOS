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
  bank_snapshot: null,
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

describe('interviewRuntime status direction', () => {
  it('reports the current direction revision even when no round is active', async () => {
    const interviewStore = await import('../../../server/room/interview/store');
    const roomStore = await import('../../../server/room/store');
    vi.spyOn(interviewStore, 'listInterviewSessions').mockResolvedValue([bankedSession]);
    vi.spyOn(roomStore, 'getSharedBlockSnapshot').mockResolvedValue({ value: 'seed', revision: 7 });
    const { getInterviewStatus } = await import('../../../server/room/interview/runtime');
    await expect(getInterviewStatus('p1')).resolves.toMatchObject({
      activeSession: null,
      latestTerminalSession: bankedSession,
      directionRevision: 7,
      directionDiff: [],
      recap: [],
    });
  });
});

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

describe('interviewRuntime redirects', () => {
  it('reconstructs unanswered redirects after remaining base questions', async () => {
    const { reconstructInterviewQuestions } = await import('../../../server/room/interview/runtime');
    const redirected: InterviewSessionRow = {
      ...activeSession,
      audit: { locks: 'THIN', ending: 'SUFFICIENT_FROM_PRIOR', open_questions: 'SUFFICIENT', load_bearing_character: 'SUFFICIENT' },
      cursor: {
        lane: 'morgan',
        question_id: 'morgan-locks',
        budgets_spent: {},
        redirects: [{ area: 'ending', question_id: 'morgan-ending', at: '2026-07-14T00:00:00Z', answered_at: null }],
      },
    };

    expect(reconstructInterviewQuestions(redirected).map(question => question.id)).toEqual(['morgan-locks', 'morgan-ending']);
    expect(reconstructInterviewQuestions({
      ...redirected,
      cursor: { ...redirected.cursor, redirects: [{ ...redirected.cursor.redirects![0], answered_at: '2026-07-14T00:01:00Z' }] },
    }).map(question => question.id)).toEqual(['morgan-locks']);
  });

  it('dedupes an unanswered redirect for the same area', async () => {
    const interviewStore = await import('../../../server/room/interview/store');
    const existing: InterviewSessionRow = {
      ...activeSession,
      cursor: {
        ...activeSession.cursor,
        redirects: [{ area: 'ending', question_id: 'morgan-ending', at: '2026-07-14T00:00:00Z', answered_at: null }],
      },
    };
    vi.spyOn(interviewStore, 'getInterviewSession').mockResolvedValue(existing);
    const update = vi.spyOn(interviewStore, 'updateInterviewSession');

    const { redirectInterviewArea } = await import('../../../server/room/interview/runtime');
    const result = await redirectInterviewArea({ projectId: 'p1', sessionId: 's1', area: 'ending', questionId: 'morgan-ending' });

    expect(result.session).toBe(existing);
    expect(update).not.toHaveBeenCalled();
  });

  it('stamps a redirect while writing its answer and next cursor once', async () => {
    const interviewStore = await import('../../../server/room/interview/store');
    const roomStore = await import('../../../server/room/store');
    const redirected: InterviewSessionRow = {
      ...activeSession,
      audit: { locks: 'SUFFICIENT', ending: 'SUFFICIENT_FROM_PRIOR', open_questions: 'SUFFICIENT', load_bearing_character: 'SUFFICIENT' },
      cursor: {
        lane: 'morgan',
        question_id: 'morgan-ending',
        budgets_spent: {},
        redirects: [{ area: 'ending', question_id: 'morgan-ending', at: '2026-07-14T00:00:00Z', answered_at: null }],
      },
    };
    vi.spyOn(interviewStore, 'getInterviewSession').mockResolvedValue(redirected);
    vi.spyOn(roomStore, 'insertProposal').mockResolvedValue(undefined as never);
    const write = vi.spyOn(interviewStore, 'appendInterviewAnswerAndUpdateCursor').mockImplementation(async (_id, _entry, patch) => ({ ...redirected, ...patch }));

    const { answerInterviewQuestion } = await import('../../../server/room/interview/runtime');
    const result = await answerInterviewQuestion({ projectId: 'p1', sessionId: 's1', answerText: 'She leaves.', origin: 'seed' });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][2].state).toBe('readback');
    expect(write.mock.calls[0][2].cursor.redirects?.[0].answered_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.session.state).toBe('readback');
  });
});

describe('interviewRuntime recap context', () => {
  it('starts a later round with active recap and prior-coverage verdicts', async () => {
    const interviewStore = await import('../../../server/room/interview/store');
    const roomStore = await import('../../../server/room/store');
    const auditContext = await import('../../../server/room/interview/auditContext');
    const priorDecision = {
      id: 'decision-1',
      project_id: 'p1',
      session_id: 's1',
      area: 'ending',
      field_path: 'story_locks',
      op: 'assert' as const,
      content: { statement: 'Mara chooses her sister.', mutability: 'locked' as const, originMarker: '[SEED]' as const, disposition: 'field_mapped' as const },
      targets: [],
      created_at: '2026-07-08T00:00:00Z',
    };
    const nextSession: InterviewSessionRow = {
      ...activeSession,
      id: 's2',
      state: 'intake',
      audit: {},
      cursor: { lane: null, question_id: null, budgets_spent: {}, redirects: [] },
    };
    vi.spyOn(interviewStore, 'listInterviewSessions').mockResolvedValue([bankedSession]);
    vi.spyOn(interviewStore, 'createInterviewSession').mockResolvedValue(nextSession);
    vi.spyOn(interviewStore, 'updateInterviewSession').mockImplementation(async (_id, patch) => ({ ...nextSession, ...patch }));
    vi.spyOn(roomStore, 'getSharedBlockValue').mockResolvedValue('');
    vi.spyOn(roomStore, 'getSharedBlockSnapshot').mockResolvedValue({ value: 'seed', revision: 4 });
    vi.spyOn(roomStore, 'insertMessage').mockResolvedValue(undefined as never);
    vi.spyOn(auditContext, 'buildAuditContext').mockResolvedValue({
      activeDecisions: [priorDecision],
      priorAnswers: [],
      storyLocks: '',
      openQuestions: '',
      coveredAreas: new Set(['ending']),
    });

    const { startInterview } = await import('../../../server/room/interview/runtime');
    const result = await startInterview({ projectId: 'p1', mode: 'full', seedText: 'A new round.' });

    expect(result.session.audit.ending).toBe('SUFFICIENT_FROM_PRIOR');
    expect(result.recap).toEqual([expect.objectContaining({
      decisionId: 'decision-1',
      area: 'ending',
      statement: 'Mara chooses her sister.',
      roundNumber: 1,
      questionId: 'morgan-ending',
    })]);
    expect(result.currentQuestion?.id).not.toBe('morgan-ending');
    expect(result.directionRevision).toBe(4);
    expect(result.directionDiff).toEqual([]);
  });
});

// Sequenced fake: each query terminal (order/single/maybeSingle) consumes the
// next queued result, so one test can script list-then-insert behavior.
function sequencedDb(results: Array<{ data: unknown; error: { message: string } | null }>): SupabaseClient {
  let index = 0
  const next = () => {
    if (index >= results.length) {
      throw new Error(`sequencedDb: script exhausted after ${results.length} results — an unexpected extra query ran`)
    }
    return results[index++]
  }
  const chain = {
    insert: () => chain,
    update: () => chain,
    select: () => chain,
    eq: () => chain,
    single: async () => next(),
    maybeSingle: async () => next(),
    order: () => Promise.resolve(next()),
    then: (resolve: (v: unknown) => void) => resolve(next()),
  }
  return { from: () => chain } as unknown as SupabaseClient
}

describe('interviewRuntime.single active session guard', () => {
  it('refuses to start when the project already has an active session', async () => {
    __setRoomDbForTests(fakeDb({ data: [activeSession], error: null }));

    const { startInterview } = await import('../../../server/room/interview/runtime');
    await expect(startInterview({ projectId: 'p1', mode: 'full', seedText: 'another seed' })).rejects.toThrow(/already in progress/);
  });

  it('allows a new round when previous sessions are banked or exported', async () => {
    // list → no active; insert/update/etc. proceed normally.
    __setRoomDbForTests(sequencedDb([
      { data: [bankedSession, exportedSession], error: null },
      { data: { ...activeSession, state: 'intake' }, error: null },
      { data: activeSession, error: null },
      { data: activeSession, error: null },
    ]));
    const auditContext = await import('../../../server/room/interview/auditContext');
    const roomStore = await import('../../../server/room/store');
    vi.spyOn(roomStore, 'getSharedBlockValue').mockResolvedValue('');
    vi.spyOn(roomStore, 'getSharedBlockSnapshot').mockResolvedValue({ value: 'seed', revision: 2 });
    vi.spyOn(auditContext, 'buildAuditContext').mockResolvedValue({
      activeDecisions: [],
      priorAnswers: [],
      storyLocks: '',
      openQuestions: '',
      coveredAreas: new Set(),
    });

    const { startInterview } = await import('../../../server/room/interview/runtime');
    const result = await startInterview({ projectId: 'p1', mode: 'full', seedText: 'new round seed' });
    expect(result.session.state).toBe('interviewing');
  });

  it('translates a unique-index race loss into the friendly conflict error', async () => {
    // list → empty (we lost the race after checking), insert → unique violation.
    __setRoomDbForTests(sequencedDb([
      { data: [], error: null },
      { data: null, error: { message: 'duplicate key value violates unique constraint "interview_sessions_one_active_per_project"' } },
    ]));

    const { startInterview } = await import('../../../server/room/interview/runtime');
    await expect(startInterview({ projectId: 'p1', mode: 'full', seedText: 'raced seed' })).rejects.toThrow(/already in progress/);
  });
});

describe('interviewRuntime.length caps', () => {
  it('rejects oversized seed text', async () => {
    const { startInterview } = await import('../../../server/room/interview/runtime');
    await expect(startInterview({ projectId: 'p1', mode: 'full', seedText: 'a'.repeat(20001) })).rejects.toThrow(/exceeds maximum length/);
    await expect(
      startInterview({ projectId: 'p1', mode: 'full', seedText: ` ${'a'.repeat(19999)} ` }),
    ).rejects.toThrow(/exceeds maximum length/);
  });

  it('rejects oversized answer text and resolved value', async () => {
    __setRoomDbForTests(fakeDb({ data: activeSession, error: null }));

    const { answerInterviewQuestion } = await import('../../../server/room/interview/runtime');

    await expect(answerInterviewQuestion({ sessionId: 's1', projectId: 'p1', answerText: 'a'.repeat(20001) })).rejects.toThrow(/exceeds maximum length/);
    await expect(answerInterviewQuestion({ sessionId: 's1', projectId: 'p1', answerText: 'short', resolvedValue: 'a'.repeat(20001) })).rejects.toThrow(/exceeds maximum length/);
  });
});

describe('interviewRuntime.verbatim Meeting record', () => {
  it('persists padded seed text byte-identically', async () => {
    const interviewStore = await import('../../../server/room/interview/store');
    const roomStore = await import('../../../server/room/store');
    vi.spyOn(interviewStore, 'listInterviewSessions').mockResolvedValue([]);
    const createSpy = vi.spyOn(interviewStore, 'createInterviewSession').mockResolvedValue({
      ...activeSession,
      state: 'intake',
      seed_text: '  padded seed  ',
    });
    vi.spyOn(interviewStore, 'updateInterviewSession').mockResolvedValue(activeSession);
    vi.spyOn(roomStore, 'insertMessage').mockResolvedValue(undefined as never);

    const { startInterview } = await import('../../../server/room/interview/runtime');
    await startInterview({ projectId: 'p1', mode: 'full', seedText: '  padded seed  ' });

    expect(createSpy).toHaveBeenCalledWith({ projectId: 'p1', mode: 'full', seedText: '  padded seed  ' });
  });
});

describe('interviewRuntime.field_path normalization', () => {
  it('normalizes composite writerOSTarget patterns at proposal insert time', async () => {
    __setRoomDbForTests(fakeDb({ data: caseyActiveSession, error: null }));

    const roomStore = await import('../../../server/room/store');
    const interviewStore = await import('../../../server/room/interview/store');
    const insertSpy = vi.spyOn(roomStore, 'insertProposal').mockResolvedValue(undefined as never);
    const appendSpy = vi.spyOn(interviewStore, 'appendInterviewAnswerAndUpdateCursor').mockResolvedValue(activeSession);

    const { answerInterviewQuestion } = await import('../../../server/room/interview/runtime');
    await answerInterviewQuestion({ sessionId: 's1', projectId: 'p1', answerText: '  complex character detail  ' });

    expect(appendSpy).toHaveBeenCalledWith('s1', expect.objectContaining({
      question_text: expect.any(String),
      domain: 'character',
      answer_text: '  complex character detail  ',
    }), expect.objectContaining({ cursor: expect.any(Object) }));

    expect(insertSpy).toHaveBeenCalled();
    const fieldPath = insertSpy.mock.calls[0][0].fieldPath as string;
    expect(fieldPath).not.toContain('{');
    expect(fieldPath).not.toContain('[');
    expect(fieldPath).not.toContain('|');
    expect(fieldPath).toBe('interview_answer.casey-load-bearing-character');

    insertSpy.mockRestore();
    appendSpy.mockRestore();
  });
});
