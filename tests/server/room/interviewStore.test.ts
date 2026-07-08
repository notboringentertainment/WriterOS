import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createInterviewSession,
  getInterviewSession,
  listInterviewSessions,
  updateInterviewSession,
  appendInterviewAnswer,
  listInterviewProposals,
} from '../../../server/room/interview/store';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';

afterEach(() => {
  __setRoomDbForTests(null);
});

// ---------------------------------------------------------------------------
// Fake Supabase query-builder. Mirrors the chain shape used by store.ts:
//   db.from(table).insert({...}).select().single()   →  { data, error }
//   db.from(table).select().eq(col, val).maybeSingle() →  { data, error }
//   db.from(table).update({...}).eq(col, val).select().single() →  { data, error }
// Each test configures the fake to return specific data/error for the
// terminal method the store helper calls.
// ---------------------------------------------------------------------------

type TerminalResult = { data: unknown; error: { message: string } | null };

function makeChainable(result: TerminalResult) {
  // Every method returns the chain (this) so the store can call any sequence
  // of builders before the terminal .single() / .maybeSingle() / .order() etc.
  const chain = {
    insert: () => chain,
    update: () => chain,
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    // For listProposals: order() returns something with an awaitable shape.
    // We make the chain itself thenable so `await query.order(...)` resolves.
    then: (resolve: (v: TerminalResult) => void) => resolve(result),
  };
  return chain;
}

function fakeDb(result: TerminalResult): SupabaseClient {
  const chain = makeChainable(result);
  return { from: () => chain } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// createInterviewSession
// ---------------------------------------------------------------------------

describe('interview.store.createInterviewSession', () => {
  it('inserts a new session with defaults and returns the row', async () => {
    const inserted: Record<string, unknown>[] = [];
    const chain = {
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return chain;
      },
      select: () => chain,
      single: async () => ({
        data: { id: 's1', project_id: 'p1', mode: 'full', state: 'intake', ...{} },
        error: null,
      }),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    const row = await createInterviewSession({ projectId: 'p1', mode: 'full' });

    expect(row).toMatchObject({ id: 's1', project_id: 'p1', mode: 'full', state: 'intake' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      project_id: 'p1',
      mode: 'full',
      state: 'intake',
      seed_text: '',
      audit: {},
      cursor: {},
      answers: [],
    });
  });

  it('passes seed text through when provided', async () => {
    const inserted: Record<string, unknown>[] = [];
    const chain = {
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return chain;
      },
      select: () => chain,
      single: async () => ({ data: { id: 's1' }, error: null }),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await createInterviewSession({ projectId: 'p1', mode: 'quick', seedText: 'A heist movie' });

    expect(inserted[0]).toMatchObject({ seed_text: 'A heist movie', mode: 'quick' });
  });

  it('throws on database error', async () => {
    __setRoomDbForTests(fakeDb({ data: null, error: { message: 'insert failed' } }));
    await expect(createInterviewSession({ projectId: 'p1', mode: 'full' })).rejects.toThrow(/insert failed/);
  });
});

// ---------------------------------------------------------------------------
// getInterviewSession
// ---------------------------------------------------------------------------

describe('interview.store.getInterviewSession', () => {
  it('returns the session row when found', async () => {
    __setRoomDbForTests(fakeDb({
      data: { id: 's1', project_id: 'p1', state: 'interviewing' },
      error: null,
    }));

    const row = await getInterviewSession('s1');
    expect(row).toMatchObject({ id: 's1', state: 'interviewing' });
  });

  it('returns null when not found', async () => {
    __setRoomDbForTests(fakeDb({ data: null, error: null }));
    const row = await getInterviewSession('nonexistent');
    expect(row).toBeNull();
  });

  it('throws on database error', async () => {
    __setRoomDbForTests(fakeDb({ data: null, error: { message: 'connection lost' } }));
    await expect(getInterviewSession('s1')).rejects.toThrow(/connection lost/);
  });
});

// ---------------------------------------------------------------------------
// updateInterviewSession
// ---------------------------------------------------------------------------

describe('interview.store.updateInterviewSession', () => {
  it('sends only provided fields in the patch', async () => {
    const sentUpdate: Record<string, unknown>[] = [];
    const eqCalls: string[][] = [];
    const chain = {
      update: (patch: Record<string, unknown>) => {
        sentUpdate.push(patch);
        return chain;
      },
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, String(val)]);
        return chain;
      },
      select: () => chain,
      single: async () => ({ data: { id: 's1', state: 'auditing' }, error: null }),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await updateInterviewSession('s1', { state: 'auditing' });

    expect(sentUpdate[0]).toMatchObject({ state: 'auditing' });
    expect(sentUpdate[0]).not.toHaveProperty('seed_text');
    expect(sentUpdate[0]).not.toHaveProperty('audit');
    expect(sentUpdate[0]).toHaveProperty('updated_at');
    expect(eqCalls).toContainEqual(['id', 's1']);
  });

  it('sends all provided fields', async () => {
    const sentUpdate: Record<string, unknown>[] = [];
    const chain = {
      update: (patch: Record<string, unknown>) => { sentUpdate.push(patch); return chain; },
      eq: () => chain,
      select: () => chain,
      single: async () => ({ data: { id: 's1' }, error: null }),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await updateInterviewSession('s1', {
      state: 'banked',
      audit: { locks: 'SUFFICIENT', ending: 'THIN' },
      cursor: { lane: 'morgan', question_id: 'q1', budgets_spent: { morgan: 1 } },
    });

    expect(sentUpdate[0]).toMatchObject({
      state: 'banked',
      audit: { locks: 'SUFFICIENT', ending: 'THIN' },
      cursor: { lane: 'morgan', question_id: 'q1', budgets_spent: { morgan: 1 } },
    });
  });
});

// ---------------------------------------------------------------------------
// appendInterviewAnswer
// ---------------------------------------------------------------------------

describe('interview.store.appendInterviewAnswer', () => {
  it('reads the session then writes the appended answers array', async () => {
    const existingAnswers = [
      { question_id: 'q1', lane: 'morgan', answer_text: 'first', origin: 'seed', disposition: 'field_mapped', at: '2026-07-08T10:00:00Z' },
    ];
    const updates: Record<string, unknown>[] = [];
    let callCount = 0;
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () =>
        callCount++ === 0
          ? { data: { id: 's1', answers: existingAnswers }, error: null }
          : { data: null, error: null },
      update: (patch: Record<string, unknown>) => { updates.push(patch); return chain; },
      single: async () => ({
        data: { id: 's1', answers: [...existingAnswers, { question_id: 'q2' }] },
        error: null,
      }),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    const row = await appendInterviewAnswer('s1', {
      question_id: 'q2',
      lane: 'casey',
      answer_text: 'she wants revenge',
      origin: 'seed',
      disposition: 'field_mapped',
    });

    expect(updates).toHaveLength(1);
    const writtenAnswers = updates[0].answers as unknown[];
    expect(writtenAnswers).toHaveLength(2);
    expect(writtenAnswers[1]).toMatchObject({ question_id: 'q2', answer_text: 'she wants revenge' });
    expect(row.answers).toHaveLength(2);
  });

  it('throws when session not found', async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await expect(appendInterviewAnswer('s1', {
      question_id: 'q1',
      lane: 'morgan',
      answer_text: 'test',
      origin: null,
      disposition: 'skipped_delegated',
    })).rejects.toThrow(/session s1 not found/);
  });
});

// ---------------------------------------------------------------------------
// listInterviewProposals
// ---------------------------------------------------------------------------

describe('interview.store.listInterviewProposals', () => {
  it('queries proposals filtered by session_id', async () => {
    const eqCalls: string[][] = [];
    const result = {
      data: [
        { id: 'p1', session_id: 's1', kind: 'interview_answer', origin: 'seed' },
        { id: 'p2', session_id: 's1', kind: 'interview_answer', origin: 'extrapolated' },
      ],
      error: null,
    };
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { eqCalls.push([col, String(val)]); return chain; },
      order: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => void) => resolve(result),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    const rows = await listInterviewProposals('s1');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'interview_answer', origin: 'seed' });
    expect(eqCalls).toContainEqual(['session_id', 's1']);
  });

  it('adds status filter when provided', async () => {
    const eqCalls: string[][] = [];
    const result = { data: [], error: null };
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { eqCalls.push([col, String(val)]); return chain; },
      order: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => void) => resolve(result),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await listInterviewProposals('s1', 'adopted');

    expect(eqCalls).toContainEqual(['session_id', 's1']);
    expect(eqCalls).toContainEqual(['status', 'adopted']);
  });

  it('throws on database error', async () => {
    const result = { data: null, error: { message: 'query failed' } };
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => void) => resolve(result),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await expect(listInterviewProposals('s1')).rejects.toThrow(/query failed/);
  });
});

// ---------------------------------------------------------------------------
// listInterviewSessions
// ---------------------------------------------------------------------------

describe('interview.store.listInterviewSessions', () => {
  it('queries sessions by project_id ordered newest first', async () => {
    const eqCalls: string[][] = [];
    const orderCalls: string[][] = [];
    const result = {
      data: [{ id: 's2' }, { id: 's1' }],
      error: null,
    };
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { eqCalls.push([col, String(val)]); return chain; },
      order: (col: string, opts: { ascending: boolean }) => {
        orderCalls.push([col, String(opts.ascending)]);
        return Promise.resolve(result);
      },
      then: (resolve: (v: typeof result) => void) => resolve(result),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    const rows = await listInterviewSessions('p1');

    expect(rows).toHaveLength(2);
    expect(eqCalls).toContainEqual(['project_id', 'p1']);
    expect(orderCalls).toContainEqual(['created_at', 'false']); // descending
  });
});
