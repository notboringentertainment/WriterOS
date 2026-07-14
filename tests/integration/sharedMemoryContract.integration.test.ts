import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ROOM_AGENT_IDS, SHARED_BLOCK_CONTRACT } from '../../server/room/memoryContract';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

const P_BLOCKS = SHARED_BLOCK_CONTRACT.map((b) => ({ label: b.label, cap: b.cap, sentinel: b.sentinel }));
const projectIds: string[] = [];
function freshProject(): string {
  const id = `itest-mem-${Math.random().toString(36).slice(2, 10)}`;
  projectIds.push(id);
  return id;
}

let db: SupabaseClient;

/**
 * Insert a row and return the inserted data, throwing a clear error on failure.
 * Without this, a setup insert that silently fails leaves `.data` null and the
 * next line dereferences it as a TypeError instead of a database error.
 */
async function insertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const res = await db.from(table).insert(row).select().single();
  if (res.error) throw new Error(`integration setup insert into ${table} failed: ${res.error.message}`);
  return res.data as T;
}

/**
 * Insert a row without selecting (fire-and-forget), throwing on failure.
 */
async function insertOnly(table: string, row: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
  const res = await db.from(table).insert(row);
  if (res.error) throw new Error(`integration setup insert into ${table} failed: ${res.error.message}`);
}

describe.skipIf(!enabled)('shared memory contract — real database', () => {
  beforeAll(() => {
    db = createClient(url!, key!);
  });

  afterAll(async () => {
    for (const table of ['proposals', 'room_events', 'room_messages', 'interview_sessions', 'memory_blocks']) {
      const res = await db.from(table).delete().in('project_id', projectIds);
      if (res.error) throw new Error(`integration cleanup failed for ${table}: ${res.error.message}`);
    }
  });

  async function ensure(projectId: string) {
    const res = await db.rpc('ensure_project_memory', {
      p_project_id: projectId,
      p_agent_ids: ROOM_AGENT_IDS,
      p_blocks: P_BLOCKS,
    });
    expect(res.error).toBeNull();
  }

  async function contractState(projectId: string) {
    const res = await db
      .from('memory_blocks')
      .select('label, value, block_attachments(agent_id)')
      .eq('project_id', projectId)
      .is('agent_id', null);
    expect(res.error).toBeNull();
    const rows = res.data as Array<{ label: string; value: string; block_attachments: Array<{ agent_id: string }> }>;
    return {
      rows,
      attachmentCount: rows.reduce((n, r) => n + r.block_attachments.length, 0),
    };
  }

  it('creates exactly four blocks and 28 attachments; double + concurrent calls stay at 4/28', async () => {
    const p = freshProject();
    await ensure(p);
    await ensure(p);
    await Promise.all([ensure(p), ensure(p), ensure(p)]);
    const { rows, attachmentCount } = await contractState(p);
    expect(rows).toHaveLength(4);
    expect(attachmentCount).toBe(28);
    for (const b of SHARED_BLOCK_CONTRACT) {
      expect(rows.find((r) => r.label === b.label)?.value).toBe(b.sentinel);
    }
  });

  it('preserves existing non-blank content and repairs blank legacy rows', async () => {
    const p = freshProject();
    await insertOnly('memory_blocks', [
      { project_id: p, agent_id: null, label: 'concept_seed', value: 'real writer content', char_cap: 4000 },
      { project_id: p, agent_id: null, label: 'story_locks', value: '   ', char_cap: 2000 },
    ]);
    await ensure(p);
    const { rows, attachmentCount } = await contractState(p);
    expect(rows.find((r) => r.label === 'concept_seed')?.value).toBe('real writer content');
    expect(rows.find((r) => r.label === 'story_locks')?.value).toBe(
      SHARED_BLOCK_CONTRACT.find((b) => b.label === 'story_locks')!.sentinel,
    );
    expect(attachmentCount).toBe(28);
  });

  it('bank_meeting_memory: banks atomically, retries idempotently, rolls back on locks conflict', async () => {
    const p = freshProject();
    await ensure(p);
    const sid = await insertRow<{ id: string }>('interview_sessions', { project_id: p, mode: 'full', state: 'readback', seed_text: 'integration seed' }).then((r) => r.id);
    const sentinel = SHARED_BLOCK_CONTRACT.find((b) => b.label === 'story_locks')!.sentinel;
    const locksNext = '## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] integration lock';

    const conflicted = await db.rpc('bank_meeting_memory', {
      p_project_id: p, p_session_id: sid,
      p_bank_revision: 0,
      p_concept_seed: 'projected seed', p_locks_expected: 'STALE', p_locks_next: locksNext,
      p_open_questions: 'Nothing delegated — writer holds all intent.',
      p_bank_snapshot: { applied_classifications: {}, open_questions: [], legacy_open_questions: [] },
    });
    expect(conflicted.error?.message).toContain('locks_conflict');
    const afterConflict = await db.from('interview_sessions').select('state').eq('id', sid).single();
    expect((afterConflict.data as { state: string }).state).toBe('readback');
    const seedAfterConflict = await db.from('memory_blocks').select('value, revision').eq('project_id', p).is('agent_id', null).eq('label', 'concept_seed').single();
    expect((seedAfterConflict.data as { value: string }).value).not.toBe('projected seed');
    expect((seedAfterConflict.data as { revision: number }).revision).toBe(0);

    const banked = await db.rpc('bank_meeting_memory', {
      p_project_id: p, p_session_id: sid,
      p_bank_revision: 0,
      p_concept_seed: 'projected seed', p_locks_expected: sentinel, p_locks_next: locksNext,
      p_open_questions: 'Nothing delegated — writer holds all intent.',
      p_bank_snapshot: { applied_classifications: {}, open_questions: [], legacy_open_questions: [] },
    });
    expect(banked.error).toBeNull();
    expect(banked.data).toBe('banked');

    const retried = await db.rpc('bank_meeting_memory', {
      p_project_id: p, p_session_id: sid,
      p_bank_revision: 0,
      p_concept_seed: 'projected seed AGAIN', p_locks_expected: locksNext, p_locks_next: locksNext + '\n[SEED] dupe',
      p_open_questions: 'x',
      p_bank_snapshot: { applied_classifications: { fake: 'open' }, open_questions: ['x'], legacy_open_questions: [] },
    });
    expect(retried.data).toBe('already_banked');
    const finalSeed = await db.from('memory_blocks').select('value, revision').eq('project_id', p).is('agent_id', null).eq('label', 'concept_seed').single();
    expect((finalSeed.data as { value: string }).value).toBe('projected seed');
    expect((finalSeed.data as { revision: number }).revision).toBe(1);
  });

  it('concurrent PRODUCTION surface sync and Meeting bank both succeed and BOTH sections survive', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db);
    try {
      const sid = (await insertRow<{ id: string }>('interview_sessions', { project_id: p, mode: 'full', state: 'readback', seed_text: 'race seed' })).id;
      await insertOnly('proposals', {
        project_id: p, agent_id: 'writingPartner', surface: 'memory', field_path: 'story_locks',
        proposed_value: 'The ending is fixed.', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: sid, question_id: 'morgan-locks', origin: 'seed',
      });

      const { syncSurfaceLocks } = await import('../../server/room/surfaceLockSync');
      const { bankInterview } = await import('../../server/room/interview/runtime');
      const [surfaceOutcome, bankResult] = await Promise.all([
        syncSurfaceLocks(p, '- surface lock'),
        bankInterview({ sessionId: sid, projectId: p }),
      ]);
      expect(surfaceOutcome).toBe('ok');
      expect(bankResult.session.state).toBe('banked');

      const final = await db
        .from('memory_blocks').select('value')
        .eq('project_id', p).is('agent_id', null).eq('label', 'story_locks').single();
      const v = (final.data as { value: string }).value;
      expect(v).toContain('- surface lock');
      expect(v).toContain('[SEED] The ending is fixed.');
    } finally {
      __setRoomDbForTests(null);
    }
  });

  it('banks a Meeting through the PRODUCTION path and the banked content reaches real prompt assembly', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db);
    try {
      const sid = (await insertRow<{ id: string }>('interview_sessions', { project_id: p, mode: 'full', state: 'readback', seed_text: 'production-path seed' })).id;
      await insertOnly('proposals', {
        project_id: p, agent_id: 'morgan', surface: 'memory', field_path: 'story_locks',
        proposed_value: 'The ending is fixed.', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: sid, question_id: 'morgan-locks', origin: 'seed',
      });

      const { bankInterview } = await import('../../server/room/interview/runtime');
      const result = await bankInterview({ sessionId: sid, projectId: p });
      expect(result.session.state).toBe('banked');

      const { getSharedBlocksForAgent } = await import('../../server/room/store');
      const { buildRoomSystemPrompt } = await import('../../server/room/roomPrompts');
      const blocks = await getSharedBlocksForAgent(p, 'sam');
      expect(blocks.map((b) => b.label).sort()).toEqual(['concept_seed', 'open_questions', 'project_state', 'story_locks']);
      const prompt = buildRoomSystemPrompt({ agentId: 'sam', sharedBlocks: blocks, privateBlocks: [], ambient: false });
      expect(prompt).toContain('production-path seed');
      expect(prompt).toContain('[SEED] The ending is fixed.');
    } finally {
      __setRoomDbForTests(null);
    }
  });

  it('a NON-DEFAULT applied classification survives bank → stored in the record → export reproduces it', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db);
    try {
      const sid = (await insertRow<{ id: string }>('interview_sessions', { project_id: p, mode: 'full', state: 'readback', seed_text: 'classification seed' })).id;
      const pid = (await insertRow<{ id: string }>('proposals', {
        project_id: p, agent_id: 'writingPartner', surface: 'memory', field_path: 'story_locks',
        proposed_value: 'The ending is fixed.', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: sid, question_id: 'morgan-locks', origin: 'seed',
      })).id;

      const { bankInterview, exportInterview } = await import('../../server/room/interview/runtime');
      await bankInterview({ sessionId: sid, projectId: p, mutability: { [pid]: 'leaning' } });

      const banked = await db.from('interview_sessions').select('bank_snapshot').eq('id', sid).single();
      const stored = (banked.data as { bank_snapshot: { applied_classifications: Record<string, string> } }).bank_snapshot;
      expect(stored.applied_classifications[pid]).toBe('leaning');

      const exported = await exportInterview({ sessionId: sid, projectId: p });
      expect(exported.markdown).toContain('[SEED] The ending is fixed. — challenge permitted');
      expect(exported.markdown).not.toMatch(/## Locks — do not violate[\s\S]*\[SEED\] The ending is fixed\./);
    } finally {
      __setRoomDbForTests(null);
    }
  });

  it('a second bank preserves an adopted-open question after the first session is exported', async () => {
    const p = freshProject();
    await ensure(p);
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient');
    __setRoomDbForTests(db);
    try {
      const { bankInterview, exportInterview } = await import('../../server/room/interview/runtime');
      const s1id = (await insertRow<{ id: string }>('interview_sessions', {
        project_id: p, mode: 'full', state: 'readback', seed_text: 'round one seed', answers: [],
      })).id;
      await insertOnly('proposals', {
        project_id: p, agent_id: 'writingPartner', surface: 'memory', field_path: 'open_questions',
        proposed_value: 'Should the sister be trusted?', rationale: 'itest', status: 'adopted',
        kind: 'interview_answer', session_id: s1id, question_id: 'morgan-open', origin: 'seed',
      });
      await bankInterview({ sessionId: s1id, projectId: p });
      await exportInterview({ sessionId: s1id, projectId: p });

      const s2id = (await insertRow<{ id: string }>('interview_sessions', {
        project_id: p, mode: 'full', state: 'readback', seed_text: 'round two seed', answers: [],
      })).id;
      await bankInterview({ sessionId: s2id, projectId: p });

      const oq = await db.from('memory_blocks').select('value')
        .eq('project_id', p).is('agent_id', null).eq('label', 'open_questions').single();
      expect((oq.data as { value: string }).value).toContain('Should the sister be trusted?');
    } finally {
      __setRoomDbForTests(null);
    }
  });
});
