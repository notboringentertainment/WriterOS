import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPitchPacketDraft, exportPitchPacketRow, getOpenPitchPacket } from '../../../server/room/interview/pitchPacketStore'
import type { MemoryReceipt } from '../../../shared/schema'

const field = <T>(value: T) => ({ value, origin: 'writer' as const, approved: true, sourceRef: 'writer:test' })
const packet = {
  packetVersion: 1 as const, projectId: 'p1', exportedAt: '2026-07-14T00:00:00Z', directionRevision: 2,
  title: field('Title'), logline: field('Logline'), format: field('Feature'), genre: field('Drama'), tone: field('Warm'),
  premise: field('Premise'), storyEngine: field('Engine'), coreCharacters: field([{ name: 'Mara', role: '', want: '', need: '', flawOrWound: '', secretOrContradiction: '', arc: '' }]),
  locks: field([]), openQuestions: field([]),
}
const memoryReceipt: MemoryReceipt = { revision: 31, status: 'available', citations: [], conflictIds: [] }

describe('pitchPacketStore', () => {
  // F22 (Ben approved this protected-test edit, 2026-10-16): creating a draft never deletes a saved or approved packet.
  it('inserts a new draft without deleting any saved draft or approved packet', async () => {
    const calls: Array<[string, unknown]> = []
    const inserted = { data: { id: 'new', status: 'draft', packet }, error: null }
    const insertChain: Record<string, unknown> = {}
    insertChain.select = vi.fn(() => insertChain)
    insertChain.single = vi.fn(async () => inserted)
    const db = { from: vi.fn(() => ({
      delete: () => { calls.push(['delete', null]); throw new Error('must not delete') },
      insert: (value: unknown) => { calls.push(['insert', value]); return insertChain },
    })) } as unknown as SupabaseClient

    const row = await createPitchPacketDraft({ projectId: 'p1', sessionId: 's1', packet, directionRevision: 2, memoryReceipt }, db)

    expect(row).toMatchObject({ id: 'new', status: 'draft' })
    expect(calls.map(([key]) => key)).toEqual(['insert'])
    expect(calls).toContainEqual(['insert', expect.objectContaining({ memory_receipt: memoryReceipt })])
  })

  it('finds the session\'s open draft or approved packet', async () => {
    const calls: Array<[string, unknown]> = []
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((key, value) => { calls.push([`eq:${key}`, value]); return chain })
    chain.in = vi.fn((key, value) => { calls.push([`in:${key}`, value]); return chain })
    chain.maybeSingle = vi.fn(async () => ({ data: { id: 'saved', status: 'approved', packet }, error: null }))
    const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient

    const row = await getOpenPitchPacket({ projectId: 'p1', sessionId: 's1' }, db)

    expect(row).toMatchObject({ id: 'saved', status: 'approved' })
    expect(calls).toEqual([['eq:project_id', 'p1'], ['eq:session_id', 's1'], ['in:status', ['draft', 'approved']]])
  })

  it('exports through the single transaction RPC and returns its persisted row', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'packet-1', status: 'exported', packet }, error: null }))
    const db = { rpc } as unknown as SupabaseClient
    const row = await exportPitchPacketRow({ projectId: 'p1', sessionId: 's1', packetId: 'packet-1' }, db)
    expect(rpc).toHaveBeenCalledWith('export_pitch_packet', { p_project_id: 'p1', p_session_id: 's1', p_packet_id: 'packet-1' })
    const rpcArgs = (rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[0][1]
    expect(Object.keys(rpcArgs)).toEqual(['p_project_id', 'p_session_id', 'p_packet_id'])
    expect(row.status).toBe('exported')
  })
})
