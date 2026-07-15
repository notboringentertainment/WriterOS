import { describe, expect, it } from 'vitest';
import { advanceInterviewCursor, pauseInterviewSessionState, resumeInterviewSessionState } from '../../../server/room/interview/stateMachine';
import { selectQuestionsForAudit } from '../../../server/room/interview/questionBank';
import type { InterviewSessionRow } from '../../../server/room/interview/types';

function session(overrides: Partial<InterviewSessionRow> = {}): InterviewSessionRow {
  return {
    id: 's1',
    project_id: 'p1',
    mode: 'full',
    state: 'interviewing',
    seed_text: 'thin seed',
    audit: { locks: 'THIN', ending: 'THIN', open_questions: 'SUFFICIENT', load_bearing_character: 'SUFFICIENT' },
    cursor: { lane: 'morgan', question_id: 'morgan-locks', budgets_spent: {} },
    answers: [],
    bank_snapshot: null,
    created_at: '2026-07-08T00:00:00Z',
    updated_at: '2026-07-08T00:00:00Z',
    ...overrides,
  };
}

describe('Project Meeting state machine helpers', () => {
  it('advances one audit-driven question at a time and reaches readback when exhausted', () => {
    const questions = selectQuestionsForAudit({ audit: session().audit, mode: 'full', speculative: false });

    const afterFirst = advanceInterviewCursor(session(), questions);
    expect(afterFirst.state).toBe('interviewing');
    expect(afterFirst.cursor).toMatchObject({ lane: 'morgan', question_id: 'morgan-ending' });

    const afterSecond = advanceInterviewCursor(session({ cursor: afterFirst.cursor }), questions);
    expect(afterSecond.state).toBe('readback');
    expect(afterSecond.cursor).toMatchObject({ lane: null, question_id: null });
  });

  it('pauses from any pre-banked state and resumes the exact previous state and cursor', () => {
    const redirects = [{ area: 'ending', question_id: 'morgan-ending', at: '2026-07-14T00:00:00Z', answered_at: null }];
    const active = session({ state: 'interviewing', cursor: { lane: 'casey', question_id: 'casey-load-bearing-character', budgets_spent: { locks: 1 }, redirects } });

    const paused = pauseInterviewSessionState(active);
    expect(paused.state).toBe('paused');
    expect(paused.cursor).toMatchObject({ lane: 'casey', question_id: 'casey-load-bearing-character', paused_from: 'interviewing' });

    const resumed = resumeInterviewSessionState({ ...active, state: paused.state, cursor: paused.cursor });
    expect(resumed.state).toBe('interviewing');
    expect(resumed.cursor).toEqual({ lane: 'casey', question_id: 'casey-load-bearing-character', budgets_spent: { locks: 1 }, redirects });
  });

  it('preserves redirects while advancing and entering readback', () => {
    const redirects = [{ area: 'ending', question_id: 'morgan-ending', at: '2026-07-14T00:00:00Z', answered_at: null }];
    const active = session({ cursor: { lane: 'morgan', question_id: 'morgan-locks', budgets_spent: {}, redirects } });
    const questions = selectQuestionsForAudit({ audit: active.audit, mode: 'full', speculative: false });

    const afterFirst = advanceInterviewCursor(active, questions);
    const afterSecond = advanceInterviewCursor({ ...active, cursor: afterFirst.cursor }, questions);

    expect(afterFirst.cursor.redirects).toEqual(redirects);
    expect(afterSecond.cursor.redirects).toEqual(redirects);
  });

  it('refuses to pause banked or exported sessions', () => {
    expect(() => pauseInterviewSessionState(session({ state: 'banked' }))).toThrow(/pre-banked/);
    expect(() => pauseInterviewSessionState(session({ state: 'exported' }))).toThrow(/pre-banked/);
  });
});
