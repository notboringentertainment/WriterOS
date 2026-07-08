import { afterEach, describe, expect, it } from 'vitest'
import { resolveProposal } from '../../../server/room/store'
import { __setRoomDbForTests } from '../../../server/room/supabaseClient'
import type { SupabaseClient } from '@supabase/supabase-js'

// Minimal fake of the supabase query-builder chain used by resolveProposal.
// Records every .eq() filter so tests can assert the project scoping.
function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const eqCalls: Array<[string, unknown]> = []
  const builder = {
    update: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value])
      return builder
    },
    select: () => builder,
    maybeSingle: async () => result,
  }
  const db = { from: (table: string) => ({ table, ...builder }) } as unknown as SupabaseClient
  return { db, eqCalls }
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
})
