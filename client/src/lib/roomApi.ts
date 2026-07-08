// Writers' Room — client API + SSE stream. Thin fetch wrappers over
// /api/room/*; all room persistence lives server-side in Supabase.

export interface RoomMessage {
  id: string
  project_id: string
  author: string // 'writer' | persona id
  kind: 'say' | 'proposal_ref' | 'system'
  content: string
  reply_to: string | null
  created_at: string
}

export interface RoomProposal {
  id: string
  project_id: string
  agent_id: string
  surface: string
  field_path: string
  proposed_value: string
  rationale: string
  status: 'pending' | 'adopted' | 'rejected' | 'superseded' | 'blocked'
  resolved_at: string | null
  created_at: string
}

export type RoomStreamEvent =
  | { type: 'turn_started'; agentId: string; turnId: string }
  | { type: 'speak_delta'; agentId: string; turnId: string; content: string }
  | { type: 'turn_ended'; agentId: string; turnId: string; action: string }
  | { type: 'message'; message: RoomMessage; turnId?: string }
  | { type: 'proposal'; proposal: RoomProposal }

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`room api ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

export async function fetchRoomMessages(projectId: string, limit = 50): Promise<RoomMessage[]> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/messages?limit=${limit}`)
  const body = await jsonOrThrow<{ messages: RoomMessage[] }>(res)
  return body.messages
}

export async function fetchRoomProposals(projectId: string, status?: string): Promise<RoomProposal[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/proposals${query}`)
  const body = await jsonOrThrow<{ proposals: RoomProposal[] }>(res)
  return body.proposals
}

export async function sendRoomMessage(
  projectId: string,
  content: string,
  characterNames: string[],
): Promise<RoomMessage> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, characterNames }),
  })
  const body = await jsonOrThrow<{ message: RoomMessage }>(res)
  return body.message
}

export async function postRoomEvent(
  projectId: string,
  kind: 'doc_field_changed' | 'lock_changed' | 'session_opened',
  payload: Record<string, unknown>,
): Promise<void> {
  await fetch(`/api/room/${encodeURIComponent(projectId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, payload }),
  }).catch(() => {
    // Room events are ambient enrichment — never let them break the save path.
  })
}

export async function resolveRoomProposal(
  projectId: string,
  proposalId: string,
  status: 'adopted' | 'rejected',
): Promise<RoomProposal> {
  const res = await fetch(
    `/api/room/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  )
  const body = await jsonOrThrow<{ proposal: RoomProposal }>(res)
  return body.proposal
}

export async function syncStoryLocksBlock(projectId: string, locksText: string): Promise<void> {
  await fetch(`/api/room/${encodeURIComponent(projectId)}/blocks/story-locks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: locksText }),
  }).catch(() => {})
}

export function openRoomStream(
  projectId: string,
  onEvent: (event: RoomStreamEvent) => void,
): () => void {
  if (typeof EventSource === 'undefined') return () => {} // non-browser env (jsdom tests)
  const source = new EventSource(`/api/room/${encodeURIComponent(projectId)}/stream`)
  source.onmessage = (raw) => {
    try {
      onEvent(JSON.parse(raw.data) as RoomStreamEvent)
    } catch {
      // malformed frame — skip
    }
  }
  return () => source.close()
}
