import { ProjectDocumentsSchema, type ProjectDocuments } from '../../../shared/documents'
import { PitchPacketSchema, composePitchPacket, validatePitchPacketForApproval, type PitchMeetingDirectionItem, type PitchPacket } from '../../../shared/pitchPacket'
import * as roomStore from '../store'
import * as interviewStore from './store'
import * as auditContextRuntime from './auditContext'
import * as packetStore from './pitchPacketStore'
import { generatePitchPacketProposals } from './pitchPacketProposals'
import { emitMeetingTrace } from './trace'

type Now = () => string
const nowIso: Now = () => new Date().toISOString()
const PROPOSABLE_FIELDS = ['title', 'logline', 'format', 'genre', 'tone', 'premise', 'storyEngine'] as const

function requireSessionProject(session: { project_id: string }, projectId: string): void {
  if (session.project_id !== projectId) throw new Error('Pitch Packet does not belong to this project.')
}

function requirePacket(row: packetStore.PitchPacketRow | null): packetStore.PitchPacketRow {
  if (!row) throw new Error('Pitch Packet not found.')
  return row
}

function directionItems(rows: auditContextRuntime.InterviewAuditContext['activeDecisions']): PitchMeetingDirectionItem[] {
  return rows.flatMap(row => 'statement' in row.content ? [{
    id: row.id, area: row.area, fieldPath: row.field_path, statement: row.content.statement,
    mutability: row.content.mutability, originMarker: row.content.originMarker,
  }] : [])
}

function applyUnapprovedProposals(packet: PitchPacket, proposals: Record<string, string | undefined>): PitchPacket {
  const next = structuredClone(packet)
  for (const key of PROPOSABLE_FIELDS) {
    const proposal = proposals[key]?.trim()
    if (!proposal || next[key].value.trim()) continue
    next[key] = { value: proposal, origin: 'ai_proposed', approved: false, sourceRef: `proposal:${key}` }
  }
  return PitchPacketSchema.parse(next)
}

export async function createPitchPacketDraft(input: {
  projectId: string; sessionId: string; documents: ProjectDocuments; projectMeta?: { title?: string }; now?: Now
}): Promise<{ row: packetStore.PitchPacketRow; proposalUnavailable: boolean }> {
  const documents = ProjectDocumentsSchema.parse(input.documents)
  const session = await interviewStore.getInterviewSession(input.sessionId)
  if (!session) throw new Error('Interview session not found.')
  requireSessionProject(session, input.projectId)
  if (session.state !== 'banked') throw new Error('Pitch Packet review requires a banked Meeting round.')
  const [sessions, storyLocks, openQuestions, directionSnapshot] = await Promise.all([
    interviewStore.listInterviewSessions(input.projectId), roomStore.getSharedBlockValue(input.projectId, 'story_locks'),
    roomStore.getSharedBlockValue(input.projectId, 'open_questions'), roomStore.getSharedBlockSnapshot(input.projectId, 'concept_seed'),
  ])
  if (storyLocks === null || openQuestions === null || directionSnapshot === null) throw new Error('Pitch Packet source memory is unavailable.')
  const context = await auditContextRuntime.buildAuditContext({ projectId: input.projectId, sessions, storyLocks, openQuestions })
  let packet = composePitchPacket({
    projectId: input.projectId, sessionId: input.sessionId, projectTitle: input.projectMeta?.title,
    documents, activeMeetingDirection: directionItems(context.activeDecisions), storyLocks, openQuestions,
    directionRevision: directionSnapshot.revision, exportedAt: (input.now ?? nowIso)(),
  })
  emitMeetingTrace({ type: 'meeting.packet.composed', projectId: input.projectId, sessionId: input.sessionId, directionRevision: directionSnapshot.revision })
  const groundedProjectContext = { documents, seed: session.seed_text, bankedAnswers: session.answers, activeMeetingDirection: context.activeDecisions }
  emitMeetingTrace({ type: 'meeting.packet.proposal_started', projectId: input.projectId, sessionId: input.sessionId })
  const generated = await generatePitchPacketProposals(groundedProjectContext)
  packet = applyUnapprovedProposals(packet, generated.proposals)
  emitMeetingTrace({ type: generated.unavailable ? 'meeting.packet.proposal_failed' : 'meeting.packet.proposal_completed', projectId: input.projectId, sessionId: input.sessionId })
  const row = await packetStore.createPitchPacketDraft({ projectId: input.projectId, sessionId: input.sessionId, packet, directionRevision: directionSnapshot.revision })
  return { row, proposalUnavailable: generated.unavailable }
}

export async function savePitchPacketDraft(input: { projectId: string; sessionId: string; packetId: string; packet: unknown }): Promise<packetStore.PitchPacketRow> {
  const row = requirePacket(await packetStore.getPitchPacket(input))
  const packet = PitchPacketSchema.parse(input.packet)
  if (row.status !== 'draft') throw new Error('Only a draft Pitch Packet can be edited.')
  if (packet.projectId !== input.projectId || packet.directionRevision !== row.direction_revision) throw new Error('Pitch Packet identity does not match this review.')
  return packetStore.updatePitchPacketDraft({ ...input, packet })
}

export async function approvePitchPacket(input: { projectId: string; sessionId: string; packetId: string }): Promise<packetStore.PitchPacketRow> {
  const row = requirePacket(await packetStore.getPitchPacket(input))
  const packet = PitchPacketSchema.parse(row.packet)
  const validation = validatePitchPacketForApproval(packet)
  if (!validation.ok) throw new Error(`Pitch Packet cannot be approved: ${validation.errors.join(' ')}`)
  return packetStore.approvePitchPacketRow(input)
}

export async function exportPitchPacket(input: { projectId: string; sessionId: string; packetId: string }): Promise<packetStore.PitchPacketRow> {
  const [row, session, directionSnapshot] = await Promise.all([
    packetStore.getPitchPacket(input), interviewStore.getInterviewSession(input.sessionId), roomStore.getSharedBlockSnapshot(input.projectId, 'concept_seed'),
  ])
  const packet = requirePacket(row)
  if (!session) throw new Error('Interview session not found.')
  requireSessionProject(session, input.projectId)
  if (packet.status !== 'approved') throw new Error('Pitch Packet must be approved before export.')
  if (session.state !== 'banked') throw new Error('Pitch Packet export requires its banked Meeting round.')
  if (!directionSnapshot || directionSnapshot.revision !== packet.direction_revision || packet.packet.directionRevision !== packet.direction_revision) {
    throw new Error('Project direction changed after this Pitch Packet review. Start a fresh review before exporting.')
  }
  emitMeetingTrace({ type: 'meeting.packet.export_started', projectId: input.projectId, sessionId: input.sessionId, packetId: input.packetId })
  const exported = await packetStore.exportPitchPacketRow({ projectId: input.projectId, sessionId: input.sessionId, packetId: input.packetId })
  emitMeetingTrace({ type: 'meeting.packet.export_completed', projectId: input.projectId, sessionId: input.sessionId, packetId: input.packetId })
  return exported
}

export async function getExportedPitchPacket(input: { projectId: string; sessionId: string }): Promise<packetStore.PitchPacketRow | null> {
  const session = await interviewStore.getInterviewSession(input.sessionId)
  if (!session) throw new Error('Interview session not found.')
  requireSessionProject(session, input.projectId)
  return packetStore.getLatestExportedPitchPacket(input)
}
