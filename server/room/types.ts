// Writers' Room runtime — shared type contracts (Phase 1).
// Row shapes mirror the §5 Supabase schema; SSE event union is the wire
// contract between the room server and the channel UI.

export type RoomMessageKind = 'say' | 'proposal_ref' | 'system';

export interface RoomMessageRow {
  id: string;
  project_id: string;
  author: string; // 'writer' | persona id
  kind: RoomMessageKind;
  content: string;
  reply_to: string | null;
  created_at: string;
}

export interface MemoryBlockRow {
  id: string;
  project_id: string | null;
  agent_id: string | null; // null = shared block
  label: string;
  value: string;
  char_cap: number;
  updated_by: string | null;
  updated_at: string;
}

export type RoomEventKind =
  | 'writer_message'
  | 'doc_field_changed'
  | 'lock_changed'
  | 'idle_tick'
  | 'agent_mention'
  | 'session_opened';

export interface RoomEventRow {
  id: string;
  project_id: string;
  kind: RoomEventKind;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

export type ProposalStatus = 'pending' | 'adopted' | 'rejected' | 'superseded' | 'blocked';

export interface ProposalRow {
  id: string;
  project_id: string;
  agent_id: string;
  surface: string; // 'storyBible' | 'outline' | 'synopsis' | 'treatment'
  field_path: string; // e.g. 'characters[ace].want'
  proposed_value: string;
  rationale: string;
  status: ProposalStatus;
  resolved_at: string | null;
  created_at: string;
}

export type LedgerAction = 'spoke' | 'proposed' | 'passed' | 'digested' | 'errored';

// ---- SSE wire contract (server → channel UI) ----

export type RoomSseEvent =
  // An agent turn began — render the typing indicator.
  | { type: 'turn_started'; agentId: string; turnId: string }
  // Live prefix of the agent's speak() content as it generates.
  | { type: 'speak_delta'; agentId: string; turnId: string; content: string }
  // Turn finished without a channel message (pass / error) — drop provisional UI.
  | { type: 'turn_ended'; agentId: string; turnId: string; action: LedgerAction }
  // A message row landed in the channel (writer, agent, or system).
  | { type: 'message'; message: RoomMessageRow; turnId?: string }
  // A proposal card was created or resolved.
  | { type: 'proposal'; proposal: ProposalRow };

export interface RoomTurnRecorder {
  speak?: { content: string; replyTo?: string };
  passReason?: string;
  proposalsFiled: number;
  proposalsBlocked: number;
  remembers: number;
  inputTokens: number;
  outputTokens: number;
}

export const newRecorder = (): RoomTurnRecorder => ({
  proposalsFiled: 0,
  proposalsBlocked: 0,
  remembers: 0,
  inputTokens: 0,
  outputTokens: 0,
});
