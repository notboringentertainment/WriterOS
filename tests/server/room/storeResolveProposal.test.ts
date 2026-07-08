import { afterEach, describe, expect, it } from 'vitest'
import { insertProposal, resolveProposal } from '../../../server/room/store'
import { __setRoomDbForTests } from '../../../server/room/supabaseClient'
import type { SupabaseClient } from '@supabase/supabase-js'

// Minimal fake of the supabase query-builder chain used by resolveProposal.
// Records every .eq() filter so tests can assert the project scoping.
function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const eqCalls: Array<[string, unknown]> = []
  const updates: Record<string, unknown>[] = []
  const builder = {
    update: (payload: Record<string, unknown>) => {
      updates.push(payload)
      return builder
    },
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value])
      return builder
    },
    select: () => builder,
    maybeSingle: async () => result,
  }
  const db = { from: (table: string) => ({ table, ...builder }) } as unknown as SupabaseClient
  return { db, eqCalls, updates }
}

function fakeInsertDb(result: { data: unknown; error: { message: string } | null }) {
  const inserts: Record<string, unknown>[] = []
  const builder = {
    insert: (payload: Record<string, unknown>) => {
      inserts.push(payload)
      return builder
    },
    select: () => builder,
    single: async () => result,
  }
  const db = { from: (table: string) => ({ table, ...builder }) } as unknown as SupabaseClient
  return { db, inserts }
}

afterEach(() => {
  __setRoomDbForTests(null)
})

describe('store.resolveProposal', () => {
  it('scopes the update by project_id, id, and pending status', async () => {
    const { db, eqCalls } = fakeDb({ data: { id: 'prop-1', status: 'adopted' }, error: null })
    __setRoomDbForTests(db)

    const row = await resolveProposal('project-A', 'prop-1', 'adopted')

    expect(row).toMatchObject({ id: 'prop-1', status: 'adopted' })
    expect(eqCalls).toContainEqual(['project_id', 'project-A'])
    expect(eqCalls).toContainEqual(['id', 'prop-1'])
    expect(eqCalls).toContainEqual(['status', 'pending'])
  })

  it('returns null when nothing matched (wrong project / already resolved)', async () => {
    const { db } = fakeDb({ data: null, error: null })
    __setRoomDbForTests(db)

    const row = await resolveProposal('project-B', 'prop-1', 'rejected')
    expect(row).toBeNull()
  })

  it('throws on a real database error', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'connection lost' } })
    __setRoomDbForTests(db)

    await expect(resolveProposal('p', 'id', 'adopted')).rejects.toThrow(/connection lost/)
  })

  it('records a writer-confirmed edited value without overwriting proposed_value', async () => {
    const { db, updates } = fakeDb({
      data: { id: 'prop-1', status: 'adopted', proposed_value: 'draft', resolved_value: 'edited' },
      error: null,
    })
    __setRoomDbForTests(db)

    await resolveProposal('project-A', 'prop-1', 'adopted', { resolvedValue: 'edited' })

    expect(updates[0]).toMatchObject({ status: 'adopted', resolved_value: 'edited' })
    expect(updates[0]).not.toHaveProperty('proposed_value')
  })

  it('records writer origin override on confirm', async () => {
    const { db, updates } = fakeDb({
      data: { id: 'prop-1', status: 'adopted', origin: 'seed' },
      error: null,
    })
    __setRoomDbForTests(db)

    await resolveProposal('project-A', 'prop-1', 'adopted', { origin: 'seed' })

    expect(updates[0]).toMatchObject({ status: 'adopted', origin: 'seed' })
  })
})

describe('store.insertProposal', () => {
  it('keeps ambient proposal inserts unchanged by default', async () => {
    const { db, inserts } = fakeInsertDb({ data: { id: 'prop-1' }, error: null })
    __setRoomDbForTests(db)

    await insertProposal({
      projectId: 'project-A',
      agentId: 'casey',
      surface: 'storyBible',
      fieldPath: 'characters[rosa].want',
      proposedValue: 'Rosa wants revenge',
      rationale: 'Strong dramatic engine.',
    })

    expect(inserts[0]).toMatchObject({
      project_id: 'project-A',
      agent_id: 'casey',
      proposed_value: 'Rosa wants revenge',
    })
    expect(inserts[0]).not.toHaveProperty('kind')
    expect(inserts[0]).not.toHaveProperty('session_id')
    expect(inserts[0]).not.toHaveProperty('question_id')
    expect(inserts[0]).not.toHaveProperty('origin')
  })

  it('can insert interview proposal metadata', async () => {
    const { db, inserts } = fakeInsertDb({ data: { id: 'prop-1' }, error: null })
    __setRoomDbForTests(db)

    await insertProposal({
      projectId: 'project-A',
      agentId: 'morgan',
      surface: 'storyBible',
      fieldPath: 'characters[rosa].want',
      proposedValue: 'Rosa wants revenge',
      rationale: 'Writer stated it in the interview.',
      kind: 'interview_answer',
      sessionId: 'session-1',
      questionId: 'morgan-locks-1',
      origin: 'seed',
    })

    expect(inserts[0]).toMatchObject({
      kind: 'interview_answer',
      session_id: 'session-1',
      question_id: 'morgan-locks-1',
      origin: 'seed',
    })
  })
})
