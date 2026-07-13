import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __setRoomDbForTests } from '../../../server/room/supabaseClient';
import {
  ROOM_AGENT_IDS,
  RoomMemoryError,
  SHARED_BLOCK_CONTRACT,
  ensureProjectMemory,
} from '../../../server/room/memoryContract';

afterEach(() => {
  __setRoomDbForTests(null);
  vi.restoreAllMocks();
});

type ContractRow = { label: string; value: string; char_cap: number; block_attachments: Array<{ agent_id: string }> };

// `reads` are consumed in order (fast-path read, then post-repair verify);
// the last entry repeats for any further reads.
function fakeDb(input: {
  reads: Array<ContractRow[] | null>;
  selectError?: { message: string };
  rpcError?: { message: string };
}) {
  const rpc = vi.fn(async () => ({ data: null, error: input.rpcError ?? null }));
  let call = 0;
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: async () => ({
      data: input.reads[Math.min(call++, input.reads.length - 1)],
      error: input.selectError ?? null,
    }),
  };
  const db = { from: () => chain, rpc } as unknown as SupabaseClient;
  return { db, rpc };
}

const fullAttachments = ROOM_AGENT_IDS.map((agent_id) => ({ agent_id }));
const completeRows: ContractRow[] = SHARED_BLOCK_CONTRACT.map((b) => ({
  label: b.label,
  value: b.sentinel,
  char_cap: b.cap,
  block_attachments: fullAttachments,
}));

describe('contract constants', () => {
  it('covers the seven-agent roster by RUNTIME id and four blocks (7 x 4 = 28)', () => {
    // 'writingPartner' is Morgan's runtime id (wakeRules.ts MORGAN_ID) — the
    // display name 'morgan' must never appear in the roster.
    expect(ROOM_AGENT_IDS).toEqual(['writingPartner', 'sam', 'casey', 'oliver', 'maya', 'zoe', 'alex']);
    expect(ROOM_AGENT_IDS).not.toContain('morgan');
    expect(SHARED_BLOCK_CONTRACT.map((b) => b.label)).toEqual([
      'concept_seed',
      'story_locks',
      'open_questions',
      'project_state',
    ]);
  });

  it('uses the B1 sentinels verbatim', () => {
    const byLabel = Object.fromEntries(SHARED_BLOCK_CONTRACT.map((b) => [b.label, b]));
    expect(byLabel.concept_seed.sentinel).toBe('No concept seed banked yet. Offer the Project Meeting.');
    expect(byLabel.concept_seed.cap).toBe(4000);
    expect(byLabel.story_locks.sentinel).toBe(
      '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.',
    );
    expect(byLabel.open_questions.sentinel).toBe('Nothing delegated — writer holds all intent.');
    expect(byLabel.project_state.sentinel).toBe('No project state recorded yet.');
  });
});

describe('ensureProjectMemory', () => {
  it('no-ops (SELECT-only fast path) when the full invariant already holds', async () => {
    const { db, rpc } = fakeDb({ reads: [completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('repairs when a block is missing, then verifies the invariant again', async () => {
    const { db, rpc } = fakeDb({ reads: [completeRows.slice(0, 3), completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledWith('ensure_project_memory', {
      p_project_id: 'p1',
      p_agent_ids: ROOM_AGENT_IDS,
      p_blocks: SHARED_BLOCK_CONTRACT.map((b) => ({ label: b.label, cap: b.cap, sentinel: b.sentinel })),
    });
  });

  it('repairs blank/whitespace-only values (spaces, tabs, newlines — none count healthy)', async () => {
    const rows = completeRows.map((r, i) => (i === 0 ? { ...r, value: ' \t\n ' } : r));
    const { db, rpc } = fakeDb({ reads: [rows, completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('repairs char_cap drift (wrong cap is not a healthy contract state)', async () => {
    const rows = completeRows.map((r, i) => (i === 0 ? { ...r, char_cap: 2000 } : r)); // concept_seed should be 4000
    const { db, rpc } = fakeDb({ reads: [rows, completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does NOT repair sentinel or writer-authored values (both are healthy)', async () => {
    const rows = completeRows.map((r, i) => (i === 0 ? { ...r, value: '## Round 1\nreal content' } : r));
    const { db, rpc } = fakeDb({ reads: [rows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('repairs when any attachment is missing', async () => {
    const rows = completeRows.map((r, i) =>
      i === 1 ? { ...r, block_attachments: fullAttachments.slice(0, 6) } : r,
    );
    const { db, rpc } = fakeDb({ reads: [rows, completeRows] });
    __setRoomDbForTests(db);
    await ensureProjectMemory('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED when the invariant is unreadable even after repair', async () => {
    const { db, rpc } = fakeDb({ reads: [null], selectError: { message: 'boom' } });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toBeInstanceOf(RoomMemoryError);
    expect(rpc).toHaveBeenCalledTimes(1); // repair was attempted
  });

  it('throws RoomMemoryError when the RPC fails', async () => {
    const { db } = fakeDb({ reads: [[]], rpcError: { message: 'db down' } });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toBeInstanceOf(RoomMemoryError);
  });

  it('throws RoomMemoryError when the RPC succeeds but the invariant STILL does not hold', async () => {
    const incomplete = completeRows.slice(0, 3);
    const { db, rpc } = fakeDb({ reads: [incomplete, incomplete] });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toThrow(/incomplete after repair/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED on a preserved over-cap value without truncating it', async () => {
    // A 2,500-char story_locks value (cap 2,000) is real writer content the RPC
    // never truncates (E4.2). readContractComplete must treat it as incomplete
    // so the wrapper throws; the value is left untouched.
    const overCap = completeRows.map((r) =>
      r.label === 'story_locks' ? { ...r, value: 's'.repeat(2500) } : r,
    );
    const { db, rpc } = fakeDb({ reads: [overCap, overCap] });
    __setRoomDbForTests(db);
    await expect(ensureProjectMemory('p1')).rejects.toBeInstanceOf(RoomMemoryError);
    expect(overCap.find((r) => r.label === 'story_locks')!.value).toHaveLength(2500); // untouched
  });
});
