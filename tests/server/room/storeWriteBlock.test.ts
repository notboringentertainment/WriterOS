import { afterEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeBlock } from '../../../server/room/store'
import { __setRoomDbForTests } from '../../../server/room/supabaseClient'

function fakeDb(existingRows: Array<{ id: string; char_cap: number }> = []) {
  const upserts: Array<{ row: Record<string, unknown>; options: Record<string, unknown> }> = []
  const lookupBuilder = {
    select: () => lookupBuilder,
    eq: () => lookupBuilder,
    is: () => lookupBuilder,
    limit: async () => ({ data: existingRows, error: null }),
  }
  const table = {
    select: lookupBuilder.select,
    upsert: async (row: Record<string, unknown>, options: Record<string, unknown>) => {
      upserts.push({ row, options })
      return { error: null }
    },
  }
  return { db: { from: () => table } as unknown as SupabaseClient, upserts }
}

afterEach(() => {
  __setRoomDbForTests(null)
})

describe('store.writeBlock', () => {
  it('writes through a single upsert scoped by the memory block uniqueness key', async () => {
    const { db, upserts } = fakeDb()
    __setRoomDbForTests(db)

    const result = await writeBlock({
      projectId: 'p1',
      agentId: null,
      label: 'story_locks',
      value: 'locked',
      updatedBy: 'writer',
      charCap: 3000,
    })

    expect(result).toEqual({ ok: true, nearCap: false })
    expect(upserts).toHaveLength(1)
    expect(upserts[0].options).toMatchObject({ onConflict: 'project_id,agent_id,label' })
    expect(upserts[0].row).toMatchObject({
      project_id: 'p1',
      agent_id: null,
      label: 'story_locks',
      value: 'locked',
      char_cap: 3000,
      updated_by: 'writer',
    })
  })

  it('preserves an existing cap for validation and the upsert row', async () => {
    const { db, upserts } = fakeDb([{ id: 'b1', char_cap: 10 }])
    __setRoomDbForTests(db)

    const result = await writeBlock({
      projectId: 'p1',
      agentId: 'casey',
      label: 'lane_notes',
      value: 'near limit',
      updatedBy: 'casey',
      charCap: 4000,
    })

    expect(result).toEqual({ ok: true, nearCap: true })
    expect(upserts[0].row).toMatchObject({ char_cap: 10 })
  })

  it('returns a cap error without upserting when value is too long', async () => {
    const { db, upserts } = fakeDb([{ id: 'b1', char_cap: 4 }])
    __setRoomDbForTests(db)

    const result = await writeBlock({
      projectId: 'p1',
      agentId: 'casey',
      label: 'lane_notes',
      value: 'too long',
      updatedBy: 'casey',
    })

    expect(result).toMatchObject({ ok: false })
    expect(upserts).toHaveLength(0)
  })
})
