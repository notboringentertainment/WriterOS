// Project Meeting interview — data access helpers (Phase 2, Slice 1).
// Every Supabase query for the interview lives here; runtime modules consume
// these helpers and never touch the client directly. Mirrors the pattern in
// server/room/store.ts.

import { getRoomDb } from '../supabaseClient';
import type {
  InterviewMode,
  InterviewSessionRow,
  InterviewSessionState,
  InterviewCursor,
  AuditVerdicts,
  TranscriptEntry,
  InterviewProposalRow,
} from './types';
import { DEFAULT_INTERVIEW_CURSOR } from './types';
import type { ProposalStatus } from '../types';

function throwOnError<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`[interview.store] ${label}: ${result.error.message}`);
  if (result.data === null) throw new Error(`[interview.store] ${label}: no data returned`);
  return result.data;
}

// ---- session lifecycle ----

export async function createInterviewSession(input: {
  projectId: string;
  mode: InterviewMode;
  seedText?: string;
}): Promise<InterviewSessionRow> {
  const res = await getRoomDb()
    .from('interview_sessions')
    .insert({
      project_id: input.projectId,
      mode: input.mode,
      state: 'intake',
      seed_text: input.seedText ?? '',
      audit: {},
      cursor: DEFAULT_INTERVIEW_CURSOR,
      answers: [],
    })
    .select()
    .single();
  return throwOnError(res, 'createInterviewSession') as InterviewSessionRow;
}

export async function getInterviewSession(id: string): Promise<InterviewSessionRow | null> {
  const res = await getRoomDb()
    .from('interview_sessions')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (res.error) throw new Error(`[interview.store] getInterviewSession: ${res.error.message}`);
  return (res.data as InterviewSessionRow | null) ?? null;
}

export async function listInterviewSessions(projectId: string): Promise<InterviewSessionRow[]> {
  const res = await getRoomDb()
    .from('interview_sessions')
    .select()
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (res.error) throw new Error(`[interview.store] listInterviewSessions: ${res.error.message}`);
  return (res.data ?? []) as InterviewSessionRow[];
}

export async function updateInterviewSession(
  id: string,
  patch: {
    state?: InterviewSessionState;
    seedText?: string;
    audit?: AuditVerdicts;
    cursor?: InterviewCursor;
  },
): Promise<InterviewSessionRow> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.seedText !== undefined) update.seed_text = patch.seedText;
  if (patch.audit !== undefined) update.audit = patch.audit;
  if (patch.cursor !== undefined) update.cursor = patch.cursor;

  const res = await getRoomDb()
    .from('interview_sessions')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  return throwOnError(res, 'updateInterviewSession') as InterviewSessionRow;
}

// ---- transcript (answers) ----

// Appends a transcript entry to the answers array. Uses a read-modify-write
// because Supabase's jsonb_append isn't available in the PostgREST API; the
// interview is single-writer (one agent turn at a time), so no concurrency risk.
export async function appendInterviewAnswer(
  sessionId: string,
  entry: Omit<TranscriptEntry, 'at'> & { at?: string },
): Promise<InterviewSessionRow> {
  const session = await getInterviewSession(sessionId);
  if (!session) throw new Error(`[interview.store] appendInterviewAnswer: session ${sessionId} not found`);

  const answers = [...session.answers, {
    ...entry,
    at: entry.at ?? new Date().toISOString(),
  }];

  const res = await getRoomDb()
    .from('interview_sessions')
    .update({ answers, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();
  return throwOnError(res, 'appendInterviewAnswer') as InterviewSessionRow;
}

// ---- interview proposals ----

export async function listInterviewProposals(
  sessionId: string,
  status?: ProposalStatus,
): Promise<InterviewProposalRow[]> {
  let query = getRoomDb()
    .from('proposals')
    .select()
    .eq('session_id', sessionId);
  if (status) query = query.eq('status', status);
  const res = await query.order('created_at', { ascending: true });
  if (res.error) throw new Error(`[interview.store] listInterviewProposals: ${res.error.message}`);
  return (res.data ?? []) as InterviewProposalRow[];
}
