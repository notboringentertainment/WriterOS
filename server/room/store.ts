// Writers' Room — data access. Every Supabase query for the room lives here;
// runtime modules consume these helpers and never touch the client directly.

import { getRoomDb } from './supabaseClient';
import type {
  LedgerAction,
  MemoryBlockRow,
  ProposalKind,
  ProposalOrigin,
  ProposalRow,
  ProposalStatus,
  RoomEventKind,
  RoomEventRow,
  RoomMessageRow,
  RoomMessageKind,
} from './types';

const CHANNEL_WINDOW = 30; // §6.3 context assembly: last 30 channel messages

function throwOnError<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`[room.store] ${label}: ${result.error.message}`);
  if (result.data === null) throw new Error(`[room.store] ${label}: no data returned`);
  return result.data;
}

// ---- channel ----

export async function insertMessage(input: {
  projectId: string;
  author: string;
  content: string;
  kind?: RoomMessageKind;
  replyTo?: string;
}): Promise<RoomMessageRow> {
  const res = await getRoomDb()
    .from('room_messages')
    .insert({
      project_id: input.projectId,
      author: input.author,
      kind: input.kind ?? 'say',
      content: input.content,
      reply_to: input.replyTo ?? null,
    })
    .select()
    .single();
  return throwOnError(res, 'insertMessage') as RoomMessageRow;
}

export async function listRecentMessages(projectId: string, limit = CHANNEL_WINDOW): Promise<RoomMessageRow[]> {
  const res = await getRoomDb()
    .from('room_messages')
    .select()
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = throwOnError(res, 'listRecentMessages') as RoomMessageRow[];
  return rows.reverse(); // chronological for context assembly + UI
}

export async function lastMessageAt(projectId: string): Promise<Date | null> {
  const res = await getRoomDb()
    .from('room_messages')
    .select('created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (res.error) throw new Error(`[room.store] lastMessageAt: ${res.error.message}`);
  const row = (res.data ?? [])[0] as { created_at: string } | undefined;
  return row ? new Date(row.created_at) : null;
}

// ---- memory blocks ----

export async function getSharedBlocksForAgent(projectId: string, agentId: string): Promise<MemoryBlockRow[]> {
  // Shared blocks: agent_id null, visible to this agent via block_attachments.
  const res = await getRoomDb()
    .from('block_attachments')
    .select('memory_blocks(*)')
    .eq('agent_id', agentId);
  if (res.error) throw new Error(`[room.store] getSharedBlocksForAgent: ${res.error.message}`);
  const blocks = (res.data ?? [])
    .map((row: { memory_blocks: unknown }) => row.memory_blocks as MemoryBlockRow | null)
    .filter((b): b is MemoryBlockRow => Boolean(b))
    .filter((b) => b.project_id === projectId && b.agent_id === null);
  return blocks;
}

export async function getPrivateBlocks(projectId: string, agentId: string): Promise<MemoryBlockRow[]> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .select()
    .eq('project_id', projectId)
    .eq('agent_id', agentId);
  if (res.error) throw new Error(`[room.store] getPrivateBlocks: ${res.error.message}`);
  return (res.data ?? []) as MemoryBlockRow[];
}

export async function getSharedBlockValue(projectId: string, label: string): Promise<string> {
  const res = await getRoomDb()
    .from('memory_blocks')
    .select('value')
    .eq('project_id', projectId)
    .is('agent_id', null)
    .eq('label', label)
    .limit(1);
  if (res.error) throw new Error(`[room.store] getSharedBlockValue: ${res.error.message}`);
  const row = (res.data ?? [])[0] as { value: string } | undefined;
  return row?.value ?? '';
}

// Cap enforcement lives here (§4.1: enforced at write time, never a crash).
// Returns { ok: false } with a reason instead of throwing so tool dispatch can
// tell the agent in-turn.
export async function writeBlock(input: {
  projectId: string;
  agentId: string | null;
  label: string;
  value: string;
  updatedBy: string;
  charCap?: number;
}): Promise<{ ok: true; nearCap: boolean } | { ok: false; reason: string }> {
  const db = getRoomDb();
  const existing = await db
    .from('memory_blocks')
    .select('id, char_cap')
    .eq('label', input.label)
    .eq('project_id', input.projectId)
    [input.agentId === null ? 'is' : 'eq']('agent_id', input.agentId)
    .limit(1);
  if (existing.error) throw new Error(`[room.store] writeBlock lookup: ${existing.error.message}`);
  const row = (existing.data ?? [])[0] as { id: string; char_cap: number } | undefined;

  const cap = row?.char_cap ?? input.charCap ?? 2000;
  if (input.value.length > cap) {
    return {
      ok: false,
      reason: `Block "${input.label}" is capped at ${cap} characters; your value is ${input.value.length}. Condense it and try again.`,
    };
  }

  const res = await db
    .from('memory_blocks')
    .upsert(
      {
        project_id: input.projectId,
        agent_id: input.agentId,
        label: input.label,
        value: input.value,
        char_cap: cap,
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent_id,label' },
    );
  if (res.error) throw new Error(`[room.store] writeBlock upsert: ${res.error.message}`);

  return { ok: true, nearCap: input.value.length > cap * 0.85 };
}

// ---- events ----

export async function insertEvent(input: {
  projectId: string;
  kind: RoomEventKind;
  payload?: Record<string, unknown>;
}): Promise<RoomEventRow> {
  const res = await getRoomDb()
    .from('room_events')
    .insert({ project_id: input.projectId, kind: input.kind, payload: input.payload ?? {} })
    .select()
    .single();
  return throwOnError(res, 'insertEvent') as RoomEventRow;
}

// Single-worker queue claim (§6.2): read unprocessed events oldest-first and
// mark them processed immediately. One scheduler loop per dev server — no
// row-lock ceremony needed for the spike.
export async function claimQueuedEvents(limit = 10): Promise<RoomEventRow[]> {
  const db = getRoomDb();
  const res = await db
    .from('room_events')
    .select()
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (res.error) throw new Error(`[room.store] claimQueuedEvents: ${res.error.message}`);
  const events = (res.data ?? []) as RoomEventRow[];
  if (events.length > 0) {
    const upd = await db
      .from('room_events')
      .update({ processed_at: new Date().toISOString() })
      .in('id', events.map((e) => e.id));
    if (upd.error) throw new Error(`[room.store] claimQueuedEvents mark: ${upd.error.message}`);
  }
  return events;
}

// ---- proposals ----

export async function insertProposal(input: {
  projectId: string;
  agentId: string;
  surface: string;
  fieldPath: string;
  proposedValue: string;
  rationale: string;
  status?: ProposalStatus;
  kind?: ProposalKind;
  sessionId?: string;
  questionId?: string;
  origin?: ProposalOrigin;
}): Promise<ProposalRow> {
  const insert: Record<string, unknown> = {
    project_id: input.projectId,
    agent_id: input.agentId,
    surface: input.surface,
    field_path: input.fieldPath,
    proposed_value: input.proposedValue,
    rationale: input.rationale,
    status: input.status ?? 'pending',
  };
  if (input.kind !== undefined) insert.kind = input.kind;
  if (input.sessionId !== undefined) insert.session_id = input.sessionId;
  if (input.questionId !== undefined) insert.question_id = input.questionId;
  if (input.origin !== undefined) insert.origin = input.origin;

  const res = await getRoomDb()
    .from('proposals')
    .insert(insert)
    .select()
    .single();
  return throwOnError(res, 'insertProposal') as ProposalRow;
}

// Returns null when nothing matched: unknown id, wrong project, or already
// resolved (stale click). Callers map null to 409 — it is contention, not a
// server fault.
export async function resolveProposal(
  projectId: string,
  id: string,
  status: 'adopted' | 'rejected',
  opts?: { resolvedValue?: string; origin?: ProposalOrigin },
): Promise<ProposalRow | null> {
  const update: Record<string, unknown> = { status, resolved_at: new Date().toISOString() };
  if (opts?.resolvedValue !== undefined) update.resolved_value = opts.resolvedValue;
  if (opts?.origin !== undefined) update.origin = opts.origin;

  const res = await getRoomDb()
    .from('proposals')
    .update(update)
    .eq('id', id)
    .eq('project_id', projectId) // never resolve another project's proposal
    .eq('status', 'pending') // only pending proposals resolve
    .select()
    .maybeSingle();
  if (res.error) throw new Error(`[room.store] resolveProposal: ${res.error.message}`);
  return (res.data as ProposalRow | null) ?? null;
}

export async function listProposals(projectId: string, status?: ProposalStatus): Promise<ProposalRow[]> {
  let query = getRoomDb().from('proposals').select().eq('project_id', projectId);
  if (status) query = query.eq('status', status);
  const res = await query.order('created_at', { ascending: true });
  if (res.error) throw new Error(`[room.store] listProposals: ${res.error.message}`);
  return (res.data ?? []) as ProposalRow[];
}

// ---- ledger ----

export async function insertLedger(input: {
  projectId: string;
  agentId: string;
  action: LedgerAction;
  triggerEvent?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  const res = await getRoomDb().from('agent_turn_ledger').insert({
    project_id: input.projectId,
    agent_id: input.agentId,
    action: input.action,
    trigger_event: input.triggerEvent ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
  });
  if (res.error) throw new Error(`[room.store] insertLedger: ${res.error.message}`);
}
