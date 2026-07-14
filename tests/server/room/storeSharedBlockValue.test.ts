import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';
import { casUpdateSharedBlock, getSharedBlockSnapshot, getSharedBlockValue } from '../../../server/room/store';

afterEach(() => __setRoomDbForTests(null));

function fakeDb(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const chain = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    limit: async () => result,
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe('getSharedBlockValue missing-vs-empty (Addendum B1)', () => {
  it('returns null when the row is absent', async () => {
    __setRoomDbForTests(fakeDb({ data: [], error: null }));
    await expect(getSharedBlockValue('p1', 'story_locks')).resolves.toBeNull();
  });

  it('returns the empty string when the row exists with an empty value', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ value: '' }], error: null }));
    await expect(getSharedBlockValue('p1', 'story_locks')).resolves.toBe('');
  });

  it('returns stored writer content verbatim', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ value: '[SEED] ending fixed' }], error: null }));
    await expect(getSharedBlockValue('p1', 'story_locks')).resolves.toBe('[SEED] ending fixed');
  });
});

describe('getSharedBlockSnapshot (Meeting bank generation token)', () => {
  it('returns value + revision without collapsing a missing row', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ value: 'seed projection', revision: 7 }], error: null }));
    await expect(getSharedBlockSnapshot('p1', 'concept_seed')).resolves.toEqual({
      value: 'seed projection',
      revision: 7,
    });

    __setRoomDbForTests(fakeDb({ data: [], error: null }));
    await expect(getSharedBlockSnapshot('p1', 'concept_seed')).resolves.toBeNull();
  });
});

describe('casUpdateSharedBlock (race-safe section writes)', () => {
  it('returns true when the conditioned update matched a row', async () => {
    __setRoomDbForTests(fakeDb({ data: [{ id: 'b1' }], error: null }));
    await expect(
      casUpdateSharedBlock({ projectId: 'p1', label: 'story_locks', expected: 'old', next: 'new', updatedBy: 'writer' }),
    ).resolves.toBe(true);
  });

  it('returns false when the value changed since it was read (0 rows matched)', async () => {
    __setRoomDbForTests(fakeDb({ data: [], error: null }));
    await expect(
      casUpdateSharedBlock({ projectId: 'p1', label: 'story_locks', expected: 'stale', next: 'new', updatedBy: 'writer' }),
    ).resolves.toBe(false);
  });
});
