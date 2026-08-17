import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveMeetingDirection,
  listMeetingDecisions,
} from '../../../server/room/interview/meetingDecisionsStore';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';

afterEach(() => {
  __setRoomDbForTests(null);
});

describe('meetingDecisionsStore', () => {
  it('reads project rows in fold order without exposing a write path', async () => {
    const eqCalls: Array<[string, string]> = [];
    const orderCalls: Array<[string, boolean]> = [];
    const result = {
      data: [
        { id: 'a', project_id: 'p1', session_id: 's1', area: 'locks', field_path: 'story_locks', op: 'assert', content: {}, targets: [], created_at: '2026-07-14T00:00:00Z' },
        { id: 'b', project_id: 'p1', session_id: 's1', area: 'ending', field_path: 'story_locks', op: 'assert', content: {}, targets: [], created_at: '2026-07-14T00:00:00Z' },
      ],
      error: null,
    };
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => { eqCalls.push([column, value]); return chain; },
      order: (column: string, options: { ascending: boolean }) => {
        orderCalls.push([column, options.ascending]);
        return chain;
      },
      then: (resolve: (value: typeof result) => void) => resolve(result),
    };
    const from = vi.fn(() => chain);
    __setRoomDbForTests({ from } as unknown as SupabaseClient);

    const rows = await listMeetingDecisions('p1');

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(from).toHaveBeenCalledWith('meeting_decisions');
    expect(eqCalls).toEqual([['project_id', 'p1']]);
    expect(orderCalls).toEqual([['created_at', true], ['id', true]]);
    expect(chain).not.toHaveProperty('insert');
    expect(chain).not.toHaveProperty('update');
  });

  it('returns the folded active direction', async () => {
    const result = {
      data: [
        { id: 'a', project_id: 'p1', session_id: 's1', area: 'locks', field_path: 'story_locks', op: 'assert', content: { statement: 'old' }, targets: [], created_at: '2026-07-14T00:00:00Z' },
        { id: 'b', project_id: 'p1', session_id: 's2', area: 'locks', field_path: 'story_locks', op: 'retract', content: {}, targets: ['a'], created_at: '2026-07-14T00:01:00Z' },
      ],
      error: null,
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (resolve: (value: typeof result) => void) => resolve(result),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    const active = await getActiveMeetingDirection('p1');

    expect(active.entries).toEqual([]);
  });

  it('surfaces database errors', async () => {
    const result = { data: null, error: { message: 'ledger unavailable' } };
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (resolve: (value: typeof result) => void) => resolve(result),
    };
    __setRoomDbForTests({ from: () => chain } as unknown as SupabaseClient);

    await expect(listMeetingDecisions('p1')).rejects.toThrow('[meetingDecisions.store] listMeetingDecisions: ledger unavailable');
  });
});
