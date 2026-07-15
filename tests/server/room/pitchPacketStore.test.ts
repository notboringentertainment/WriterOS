import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPitchPacketDraft, exportPitchPacketRow } from '../../../server/room/interview/pitchPacketStore'

const field = <T>(value: T) => ({ value, origin: 'writer' as const, approved: true, sourceRef: 'writer:test' })
const packet = {
  packetVersion: 1 as const, projectId: 'p1', exportedAt: '2026-07-14T00:00:00Z', directionRevision: 2,
  title: field('Title'), logline: field('Logline'), format: field('Feature'), genre: field('Drama'), tone: field('Warm'),
  premise: field('Premise'), storyEngine: field('Engine'), coreCharacters: field([{ name: 'Mara', role: '', want: '', need: '', flawOrWound: '', secretOrContradiction: '', arc: '' }]),
  locks: field([]), openQuestions: field([]),
}

describe('pitchPacketStore', () => {
  it('deletes only draft/approved rows for the same session before inserting a replacement', async () => {
    const calls: Array<[string, unknown]> = []
    const deleted = { error: null }
    const inserted = { data: { id: 'new', status: 'draft', packet }, error: null }
    const deleteChain: Record<string, unknown> = {}
    deleteChain.eq = vi.fn((key, value) => { calls.push([`eq:${key}`, value]); return deleteChain })
    deleteChain.in = vi.fn((key, value) => { calls.push([`in:${key}`, value]); return Promise.resolve(deleted) })
    const insertChain: Record<string, unknown> = {}
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn(async () => inserted)
    const db = { from: vi.fn(() => ({ delete: () => deleteChain, insert: (value: unknown) => { calls.push(['insert', value]); return insertChain } })) } as unknown as SupabaseClient

    const row = await createPitchPacketDraft({ projectId: 'p1', sessionId: 's1', packet, directionRevision: 2 }, db)

    expect(row).toMatchObject({ id: 'new', status: 'draft' })
    expect(calls).toContainEqual(['eq:session_id', 's1'])
    expect(calls).toContainEqual(['in:status', ['draft', 'approved']])
    expect(calls.filter(([key]) => key === 'in:status')).toEqual([['in:status', ['draft', 'approved']]])
  })

  it('exports through the single transaction RPC and returns its persisted row', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'packet-1', status: 'exported', packet }, error: null }))
    const db = { rpc } as unknown as SupabaseClient
    const row = await exportPitchPacketRow({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1', exportedAt: '2026-07-14T01:00:00Z' }, db)
    expect(rpc).toHaveBeenCalledWith('export_pitch_packet', { p_project_id: 'p1', p_session_id: 's1', p_packet_id: 'packet-1', p_exported_at: '2026-07-14T01:00:00Z' })
    expect(row.status).toBe('exported')
  })
})
