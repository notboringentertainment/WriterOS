// Writers' Room — client API + SSE stream. Thin fetch wrappers over
// /api/room/*; all room persistence lives server-side in Supabase.

import type { ProjectDocuments } from '@shared/documents'
import type { PitchPacket } from '@shared/pitchPacket'

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
  resolved_value?: string | null
  rationale: string
  status: 'pending' | 'adopted' | 'rejected' | 'superseded' | 'blocked'
  resolved_at: string | null
  kind?: 'ambient_suggestion' | 'interview_answer'
  session_id?: string | null
  question_id?: string | null
  origin?: 'seed' | 'extrapolated' | 'invented' | null
  created_at: string
}

export interface RoomCharacterBrief {
  id: string
  name: string
  want?: string
  need?: string
  flaw?: string
  secret?: string
  arc?: string
}

export interface InterviewSession {
  id: string
  project_id: string
  mode: 'quick' | 'full'
  state: 'intake' | 'auditing' | 'interviewing' | 'readback' | 'banked' | 'exported' | 'paused'
  seed_text: string
  audit: Record<string, 'SUFFICIENT' | 'SUFFICIENT_FROM_PRIOR' | 'THIN'>
  cursor: { lane: string | null; question_id: string | null; budgets_spent: Record<string, number>; redirects?: Array<{ area: string; question_id: string; at: string; answered_at: string | null }>; paused_from?: string }
  answers: Array<{ question_id: string; lane: string; answer_text: string; origin: 'seed' | 'extrapolated' | null; disposition: 'field_mapped' | 'seed_color' | 'skipped_delegated'; at: string }>
  bank_snapshot: { applied_classifications: Record<string, InterviewMutability>; open_questions: string[]; legacy_open_questions: string[] } | null
  created_at: string
  updated_at: string
}

export interface InterviewQuestion {
  id: string
  lane: string
  trigger: string
  question: string
  writerOSTarget: string
  templateDestination: string
  originOnConfirm: string
  requirement: string
  budget: number
}

export interface InterviewStatus {
  activeSession: InterviewSession | null
  latestTerminalSession?: InterviewSession | null
  hasBankedSeed: boolean
  actionLabel: 'Project Meeting' | 'New interview round'
  currentQuestion: InterviewQuestion | null
  recap: MeetingRecapItem[]
  directionDiff: MeetingDirectionDiff[]
  directionRevision: number
}

export interface PitchPacketRow {
  id: string
  project_id: string
  session_id: string
  packet: PitchPacket
  packet_version: number
  status: 'draft' | 'approved' | 'exported'
  direction_revision: number
  created_at: string
  exported_at: string | null
}

export interface MeetingRecapItem {
  decisionId: string
  sessionId: string
  area: string
  fieldPath: string
  statement: string
  roundNumber: number
  questionId: string | null
}

export type MeetingRevisionInput =
  | { op: 'keep'; targetId: string }
  | { op: 'revise'; targetId: string; statement: string; mutability?: InterviewMutability }
  | { op: 'retract'; targetId: string }
  | { op: 'supersede'; targetIds: string[]; area: string; fieldPath: string; statement: string; mutability: InterviewMutability }

export interface MeetingDirectionDiff {
  area: string
  before: string[]
  after: string[]
  op: MeetingRevisionInput['op'] | 'assert'
}

export type InterviewMutability = 'locked' | 'leaning' | 'open'

export interface InterviewTaggableAnswer {
  proposalId: string
  questionId: string | null
  value: string
  origin: 'seed' | 'extrapolated' | null
  defaultMutability: InterviewMutability
  applied: InterviewMutability
}

export interface InterviewBankPreview {
  title: string
  seedText: string
  datedAnswers: string[]
  seedColor: string[]
  locks: string[]
  leanings: string[]
  openQuestions: string[]
  conceptSeedAppend: string
  taggable: InterviewTaggableAnswer[]
}

export interface InterviewBankFinalValues {
  concept_seed: string
  story_locks: string
  open_questions: string
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

export function isRoomMemoryUnavailable(err: unknown): boolean {
  return err instanceof Error && err.message.includes('room api 503') && err.message.includes('Room memory unavailable')
}

export type RoomMutationResult =
  | { outcome: 'ok' }
  | { outcome: 'memory_unavailable' }
  | { outcome: 'failed'; status?: number; message?: string }

async function classifyFailure(res: Response): Promise<RoomMutationResult> {
  const text = await res.text().catch(() => '')
  if (res.status === 503 && text.includes('Room memory unavailable')) return { outcome: 'memory_unavailable' }
  let message: string | undefined
  try { message = (JSON.parse(text) as { message?: string }).message } catch { message = text.slice(0, 160) || undefined }
  return { outcome: 'failed', status: res.status, message }
}

export async function ensureRoomMemory(projectId: string): Promise<RoomMutationResult> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/memory/ensure`, { method: 'POST' })
    return res.ok ? { outcome: 'ok' } : classifyFailure(res)
  } catch {
    return { outcome: 'failed', message: "Couldn't reach the room." }
  }
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
  characters: RoomCharacterBrief[] = [],
): Promise<RoomMessage> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, characterNames, characters }),
  })
  const body = await jsonOrThrow<{ message: RoomMessage }>(res)
  return body.message
}

export async function postRoomEvent(
  projectId: string,
  kind: 'doc_field_changed' | 'lock_changed' | 'session_opened',
  payload: Record<string, unknown>,
): Promise<RoomMutationResult> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, payload }),
    })
    return res.ok ? { outcome: 'ok' } : classifyFailure(res)
  } catch {
    return { outcome: 'failed' }
  }
}

export async function resolveRoomProposal(
  projectId: string,
  proposalId: string,
  status: 'adopted' | 'rejected',
  opts: { resolvedValue?: string; origin?: 'seed' | 'extrapolated' | 'invented' } = {},
): Promise<RoomProposal> {
  const body: { status: 'adopted' | 'rejected'; resolved_value?: string; origin?: 'seed' | 'extrapolated' | 'invented' } = { status }
  if (opts.resolvedValue !== undefined) body.resolved_value = opts.resolvedValue
  if (opts.origin !== undefined) body.origin = opts.origin

  const res = await fetch(
    `/api/room/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const response = await jsonOrThrow<{ proposal: RoomProposal }>(res)
  return response.proposal
}

export async function fetchInterviewStatus(projectId: string): Promise<InterviewStatus> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview`)
  return jsonOrThrow<InterviewStatus>(res)
}

export async function startInterview(
  projectId: string,
  input: { mode: 'quick' | 'full'; seedText: string; speculative?: boolean },
): Promise<{ session: InterviewSession; auditMessage: string; currentQuestion: InterviewQuestion | null; recap: MeetingRecapItem[]; directionDiff: MeetingDirectionDiff[]; directionRevision: number }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return jsonOrThrow(res)
}

export async function answerInterviewQuestion(
  projectId: string,
  sessionId: string,
  input: { answerText: string; origin?: 'seed' | 'extrapolated'; resolvedValue?: string; rejectMapping?: boolean },
): Promise<{ session: InterviewSession; proposal?: RoomProposal; currentQuestion: InterviewQuestion | null }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return jsonOrThrow(res)
}

export async function skipInterviewQuestion(projectId: string, sessionId: string): Promise<{ session: InterviewSession; currentQuestion: InterviewQuestion | null }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/skip`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function pauseInterview(projectId: string, sessionId: string): Promise<{ session: InterviewSession }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/pause`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function resumeInterview(projectId: string, sessionId: string): Promise<{ session: InterviewSession }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/resume`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function wrapInterview(projectId: string, sessionId: string): Promise<{ session: InterviewSession }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/wrap`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function fetchInterviewBankPreview(
  projectId: string,
  sessionId: string,
  mutability: Record<string, InterviewMutability> = {},
  operations: MeetingRevisionInput[] = [],
): Promise<{ preview: InterviewBankPreview; finalValues: InterviewBankFinalValues; directionDiff: MeetingDirectionDiff[]; directionRevision: number }> {
  // POST: the preview is parameterized by the writer's in-flight mutability choices.
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/bank-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutability, operations }),
  })
  return jsonOrThrow(res)
}

export async function bankInterview(
  projectId: string,
  sessionId: string,
  mutability: Record<string, InterviewMutability> = {},
  operations: MeetingRevisionInput[] = [],
): Promise<{ session: InterviewSession; preview: InterviewBankPreview }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/bank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutability, operations }),
  })
  return jsonOrThrow(res)
}

export async function redirectInterviewArea(projectId: string, sessionId: string, area: string, questionId: string): Promise<{ session: InterviewSession; currentQuestion: InterviewQuestion | null }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/redirect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area, questionId }),
  })
  return jsonOrThrow(res)
}

export async function exportInterview(projectId: string, sessionId: string): Promise<{ session: InterviewSession; markdown: string }> {
  const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/export`, { method: 'POST' })
  return jsonOrThrow(res)
}

function pitchPacketPath(projectId: string, sessionId: string): string {
  return `/api/room/${encodeURIComponent(projectId)}/interview/${encodeURIComponent(sessionId)}/pitch-packet`
}

export async function createPitchPacketDraft(
  projectId: string,
  sessionId: string,
  documents: ProjectDocuments,
  projectMeta: { title?: string },
): Promise<{ row: PitchPacketRow; proposalUnavailable: boolean }> {
  const res = await fetch(`${pitchPacketPath(projectId, sessionId)}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents, projectMeta }),
  })
  return jsonOrThrow(res)
}

export async function savePitchPacketDraft(projectId: string, sessionId: string, packetId: string, packet: PitchPacket): Promise<PitchPacketRow> {
  const res = await fetch(`${pitchPacketPath(projectId, sessionId)}/${encodeURIComponent(packetId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packet }),
  })
  return jsonOrThrow(res)
}

export async function approvePitchPacket(projectId: string, sessionId: string, packetId: string): Promise<PitchPacketRow> {
  const res = await fetch(`${pitchPacketPath(projectId, sessionId)}/${encodeURIComponent(packetId)}/approve`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function exportPitchPacket(projectId: string, sessionId: string, packetId: string): Promise<PitchPacketRow> {
  const res = await fetch(`${pitchPacketPath(projectId, sessionId)}/${encodeURIComponent(packetId)}/export`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function fetchExportedPitchPacket(projectId: string, sessionId: string): Promise<PitchPacketRow | null> {
  const res = await fetch(`${pitchPacketPath(projectId, sessionId)}/exported`)
  return jsonOrThrow(res)
}

export async function syncStoryLocksBlock(projectId: string, locksText: string): Promise<RoomMutationResult> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(projectId)}/blocks/story-locks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: locksText }),
    })
    if (!res.ok) {
      const result = await classifyFailure(res)
      console.error(`[roomApi] story-locks sync failed: ${res.status}`)
      return result
    }
    return { outcome: 'ok' }
  } catch (err) {
    console.error('[roomApi] story-locks sync failed:', err)
    return { outcome: 'failed' }
  }
}

export function openRoomStream(
  projectId: string,
  onEvent: (event: RoomStreamEvent) => void,
  onConnectionError?: () => void,
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
  source.onerror = () => onConnectionError?.()
  return () => source.close()
}
