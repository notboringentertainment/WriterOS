import type { SupabaseClient } from '@supabase/supabase-js'
import { PitchPacketSchema, type PitchPacket } from '../../../shared/pitchPacket'
import { getRoomDb } from '../supabaseClient'

export type PitchPacketStatus = 'draft' | 'approved' | 'exported'

export interface PitchPacketRow {
  id: string
  project_id: string
  session_id: string
  packet: PitchPacket
  packet_version: number
  status: PitchPacketStatus
  direction_revision: number
  created_at: string
  exported_at: string | null
}

function normalizeRow(value: unknown): PitchPacketRow {
  const row = value as PitchPacketRow
  return { ...row, packet: PitchPacketSchema.parse(row.packet) }
}

function errorMessage(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`[pitchPacket.store] ${action}: ${error.message}`)
}

export async function createPitchPacketDraft(input: {
  projectId: string; sessionId: string; packet: PitchPacket; directionRevision: number
}, db: SupabaseClient = getRoomDb()): Promise<PitchPacketRow> {
  const removed = await db.from('pitch_packets').delete().eq('project_id', input.projectId).eq('session_id', input.sessionId).in('status', ['draft', 'approved'])
  errorMessage(removed.error, 'replace draft')
  const result = await db.from('pitch_packets').insert({
    project_id: input.projectId, session_id: input.sessionId, packet: input.packet,
    packet_version: input.packet.packetVersion, status: 'draft', direction_revision: input.directionRevision,
  }).select().single()
  errorMessage(result.error, 'create draft')
  return normalizeRow(result.data)
}

export async function getPitchPacket(input: { projectId: string; sessionId: string; packetId: string }, db: SupabaseClient = getRoomDb()): Promise<PitchPacketRow | null> {
  const result = await db.from('pitch_packets').select().eq('id', input.packetId).eq('project_id', input.projectId).eq('session_id', input.sessionId).maybeSingle()
  errorMessage(result.error, 'get packet')
  return result.data ? normalizeRow(result.data) : null
}

export async function updatePitchPacketDraft(input: { projectId: string; sessionId: string; packetId: string; packet: PitchPacket }, db: SupabaseClient = getRoomDb()): Promise<PitchPacketRow> {
  const result = await db.from('pitch_packets').update({ packet: input.packet, packet_version: input.packet.packetVersion, direction_revision: input.packet.directionRevision })
    .eq('id', input.packetId).eq('project_id', input.projectId).eq('session_id', input.sessionId).eq('status', 'draft').select().single()
  errorMessage(result.error, 'update draft')
  return normalizeRow(result.data)
}

export async function approvePitchPacketRow(input: { projectId: string; sessionId: string; packetId: string }, db: SupabaseClient = getRoomDb()): Promise<PitchPacketRow> {
  const result = await db.from('pitch_packets').update({ status: 'approved' }).eq('id', input.packetId)
    .eq('project_id', input.projectId).eq('session_id', input.sessionId).eq('status', 'draft').select().single()
  errorMessage(result.error, 'approve packet')
  return normalizeRow(result.data)
}

export async function exportPitchPacketRow(input: { projectId: string; sessionId: string; packetId: string }, db: SupabaseClient = getRoomDb()): Promise<PitchPacketRow> {
  const result = await db.rpc('export_pitch_packet', {
    p_project_id: input.projectId, p_session_id: input.sessionId, p_packet_id: input.packetId,
  })
  errorMessage(result.error, 'export packet')
  return normalizeRow(result.data)
}

export async function getLatestExportedPitchPacket(input: { projectId: string; sessionId: string }, db: SupabaseClient = getRoomDb()): Promise<PitchPacketRow | null> {
  const result = await db.from('pitch_packets').select().eq('project_id', input.projectId).eq('session_id', input.sessionId)
    .eq('status', 'exported').order('created_at', { ascending: false }).limit(1).maybeSingle()
  errorMessage(result.error, 'get exported packet')
  return result.data ? normalizeRow(result.data) : null
}
