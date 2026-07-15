import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ROOM_AGENT_IDS, SHARED_BLOCK_CONTRACT } from '../../server/room/memoryContract'
import type { PitchPacket } from '../../shared/pitchPacket'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
// This explicit flag is the migration-authorization gate. The suite writes
// append-only/export-immutable fixtures and therefore requires a disposable dev DB.
const enabled = Boolean(url && key && process.env.WRITEROS_MEETING_DB_INTEGRATION === '1')
const projectIds: string[] = []
let db: SupabaseClient

function freshProject(): string {
  const id = `itest-meeting-${Math.random().toString(36).slice(2, 10)}`
  projectIds.push(id)
  return id
}

async function insertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const result = await db.from(table).insert(row).select().single()
  if (result.error) throw new Error(`integration setup insert into ${table} failed: ${result.error.message}`)
  return result.data as T
}

async function ensureMemory(projectId: string): Promise<void> {
  const result = await db.rpc('ensure_project_memory', {
    p_project_id: projectId,
    p_agent_ids: ROOM_AGENT_IDS,
    p_blocks: SHARED_BLOCK_CONTRACT.map(block => ({ label: block.label, cap: block.cap, sentinel: block.sentinel })),
  })
  if (result.error) throw new Error(`integration memory setup failed: ${result.error.message}`)
}

async function decisionCount(projectId: string, sessionId?: string): Promise<number> {
  let query = db.from('meeting_decisions').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
  if (sessionId) query = query.eq('session_id', sessionId)
  const result = await query
  if (result.error) throw new Error(`integration decision count failed: ${result.error.message}`)
  return result.count ?? 0
}

const approved = <T,>(value: T) => ({ value, origin: 'writer' as const, approved: true, sourceRef: 'writer:integration' })
function approvedPacket(projectId: string): PitchPacket {
  return {
    packetVersion: 1, projectId, exportedAt: '2026-07-14T00:00:00.000Z', directionRevision: 0,
    title: approved('Integration Project'), logline: approved('A writer tests one irreversible choice.'), format: approved('Feature'),
    genre: approved('Drama'), tone: approved('Tense'), premise: approved('Choices leave a record.'), storyEngine: approved('Each revision creates a new consequence.'),
    coreCharacters: approved([{ name: 'Mara', role: 'writer', want: 'Clarity', need: 'Trust', flawOrWound: 'Control', secretOrContradiction: 'She caused the conflict', arc: 'Accepts revision' }]),
    locks: approved([{ statement: 'History remains immutable.', originMarker: '[SEED]' }]), openQuestions: approved([]),
  }
}

describe.skipIf(!enabled)('meeting revisions and pitch packets — authorized real dev database', () => {
  beforeAll(async () => {
    db = createClient(url!, key!)
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient')
    __setRoomDbForTests(db)
  })

  afterAll(async () => {
    const { __setRoomDbForTests } = await import('../../server/room/supabaseClient')
    __setRoomDbForTests(null)
    // meeting_decisions and exported pitch_packets are intentionally immutable.
    // Run only against disposable dev Supabase and reset it after this suite.
  })

  it('banks ledger + blocks + snapshot atomically and no-ops same-session rebank', async () => {
    const projectId = freshProject()
    await ensureMemory(projectId)
    const session = await insertRow<{ id: string }>('interview_sessions', { project_id: projectId, mode: 'full', state: 'readback', seed_text: 'integration round' })
    const locks = SHARED_BLOCK_CONTRACT.find(block => block.label === 'story_locks')!.sentinel
    const decisionId = randomUUID()
    const args = {
      p_project_id: projectId, p_session_id: session.id, p_bank_revision: 0, p_direction_revision: 0,
      p_concept_seed: 'integration round', p_locks_expected: locks, p_locks_next: `${locks}\n[SEED] History remains immutable.`,
      p_open_questions: 'Nothing delegated — writer holds all intent.',
      p_bank_snapshot: { applied_classifications: {}, open_questions: [], legacy_open_questions: [] },
      p_decisions: [{ id: decisionId, area: 'locks', field_path: 'story_locks', op: 'assert', content: { statement: 'History remains immutable.', mutability: 'locked', originMarker: '[SEED]' }, targets: [], created_at: new Date().toISOString() }],
    }

    const first = await db.rpc('bank_meeting_round', args)
    expect(first.error).toBeNull()
    expect(first.data).toBe('banked')
    expect(await decisionCount(projectId, session.id)).toBe(1)

    const second = await db.rpc('bank_meeting_round', { ...args, p_decisions: [{ ...args.p_decisions[0], id: randomUUID() }] })
    expect(second.error).toBeNull()
    expect(second.data).toBe('already_banked')
    expect(await decisionCount(projectId, session.id)).toBe(1)
  })

  it('synthesizes legacy recap without writes on read', async () => {
    const projectId = freshProject()
    await ensureMemory(projectId)
    const proposalId = randomUUID()
    const banked = await insertRow<{ id: string }>('interview_sessions', {
      project_id: projectId, mode: 'full', state: 'banked', seed_text: 'legacy round',
      bank_snapshot: { applied_classifications: { [proposalId]: 'locked' }, open_questions: [], legacy_open_questions: [] },
    })
    await insertRow('proposals', {
      id: proposalId, project_id: projectId, agent_id: 'morgan', surface: 'memory', field_path: 'story_locks', proposed_value: 'Legacy lock.',
      rationale: 'integration', status: 'adopted', kind: 'interview_answer', session_id: banked.id, question_id: 'morgan-locks', origin: 'seed',
    })
    await insertRow('interview_sessions', { project_id: projectId, mode: 'full', state: 'auditing', seed_text: 'new round' })
    const before = await decisionCount(projectId)

    const { getInterviewStatus } = await import('../../server/room/interview/runtime')
    const status = await getInterviewStatus(projectId)
    expect(status.recap.map(item => item.area)).toContain('locks')
    expect(status.recap[0]?.decisionId).toMatch(/^legacy:/)
    expect(await decisionCount(projectId)).toBe(before)
  })

  it('exports packet and session atomically through the production runtime', async () => {
    const projectId = freshProject()
    await ensureMemory(projectId)
    const session = await insertRow<{ id: string }>('interview_sessions', { project_id: projectId, mode: 'full', state: 'banked', seed_text: 'packet round' })
    const packet = await insertRow<{ id: string }>('pitch_packets', {
      project_id: projectId, session_id: session.id, packet: approvedPacket(projectId), packet_version: 1, status: 'approved', direction_revision: 0,
    })

    const { exportPitchPacket } = await import('../../server/room/interview/pitchPacketRuntime')
    const exported = await exportPitchPacket({ projectId, sessionId: session.id, packetId: packet.id })
    expect(exported.status).toBe('exported')
    const storedSession = await db.from('interview_sessions').select('state').eq('id', session.id).single()
    expect(storedSession.error).toBeNull()
    expect((storedSession.data as { state: string }).state).toBe('exported')
  })
})
