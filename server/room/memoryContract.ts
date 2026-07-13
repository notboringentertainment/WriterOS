// Addendum B: the shared-memory contract. Sentinels, caps, and the roster are
// defined here (single source of truth) and passed to the ensure_project_memory
// RPC, which creates blocks + attachments and repairs blank rows atomically (B4).

import { CALLABLE_SPECIALIST_IDS } from '../../shared/personas';
import { NONE_DECLARED, renderLockSections } from './lockSections';
import { getRoomDb } from './supabaseClient';
import { MORGAN_ID } from './wakeRules';

// RUNTIME ids, not display names: Morgan's internal id is 'writingPartner'
// (shared/personas.ts:1-5). getSharedBlocksForAgent matches agent_id exactly —
// attaching to a display alias would leave the host with no shared memory,
// which is the original bug this contract exists to kill.
export const ROOM_AGENT_IDS: string[] = [MORGAN_ID, ...CALLABLE_SPECIALIST_IDS];

export const SHARED_BLOCK_CONTRACT = [
  { label: 'concept_seed', cap: 4000, sentinel: 'No concept seed banked yet. Offer the Project Meeting.' },
  { label: 'story_locks', cap: 2000, sentinel: renderLockSections({ surface: NONE_DECLARED, meeting: NONE_DECLARED }) },
  { label: 'open_questions', cap: 2000, sentinel: 'Nothing delegated — writer holds all intent.' },
  { label: 'project_state', cap: 2000, sentinel: 'No project state recorded yet.' },
] as const;

const CONTRACT_LABELS = SHARED_BLOCK_CONTRACT.map((b) => b.label);

export class RoomMemoryError extends Error {}

type ContractRow = { label: string; value: string; char_cap: number; block_attachments: Array<{ agent_id: string }> | null };

// The invariant read: all four blocks exist, values are non-blank (JS trim
// covers tabs/newlines), char_cap matches the contract, and all 28 roster
// attachments exist. Used for the fast path AND re-verified after repair.
async function readContractComplete(projectId: string): Promise<boolean> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .select('label, value, char_cap, block_attachments(agent_id)')
    .eq('project_id', projectId)
    .is('agent_id', null)
    .in('label', CONTRACT_LABELS);
  if (res.error) return false; // unreadable = not verifiably complete
  const rows = (res.data ?? []) as ContractRow[];
  return SHARED_BLOCK_CONTRACT.every((contract) => {
    const row = rows.find((r) => r.label === contract.label);
    // `.trim() === ''` is the TS blank predicate; it now matches the SQL
    // `^\s*$` predicate (E4.1) so both layers agree on what counts blank.
    if (!row || row.value.trim() === '' || row.char_cap !== contract.cap) return false;
    // Over-cap is a broken contract state too: a preserved value longer than the
    // cap is real writer content the RPC refused to truncate (E4.2). Treat the
    // contract as INCOMPLETE so ensureProjectMemory surfaces a loud, actionable
    // error — never silently truncate.
    if (row.value.length > contract.cap) return false;
    const attached = new Set((row.block_attachments ?? []).map((a) => a.agent_id));
    return ROOM_AGENT_IDS.every((agent) => attached.has(agent));
  });
}

// B4: SELECT-only fast path only when the full invariant already holds.
// Anything less runs the idempotent RPC repair — and success is defined by
// the INVARIANT holding afterwards, not by the RPC merely returning.
export async function ensureProjectMemory(projectId: string): Promise<void> {
  if (await readContractComplete(projectId)) return;

  const rpc = await getRoomDb().rpc('ensure_project_memory', {
    p_project_id: projectId,
    p_agent_ids: ROOM_AGENT_IDS,
    p_blocks: SHARED_BLOCK_CONTRACT.map((b) => ({ label: b.label, cap: b.cap, sentinel: b.sentinel })),
  });
  if (rpc.error) {
    throw new RoomMemoryError(`[room.memory] ensure_project_memory failed: ${rpc.error.message}`);
  }

  if (!(await readContractComplete(projectId))) {
    throw new RoomMemoryError(`[room.memory] contract incomplete after repair for project ${projectId}`);
  }
}
