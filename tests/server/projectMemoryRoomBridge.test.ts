import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectMemoryStore, type ProjectMemoryStore } from '../../server/projectMemory/store'
import {
  bridgeMeetingBankToMemory,
  bridgeMeetingDecisionsToMemory,
  bridgeRoomStateToMemory,
  bridgeStoryLocksToMemory,
} from '../../server/projectMemory/roomBridge'
import type { MeetingDecisionRow } from '../../server/room/interview/types'

const capturedAt = '2026-08-13T20:00:00.000Z'
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function makeProjectPackage(projectId = 'room-bridge-project-1') {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'writeros-room-bridge-'))
  temporaryRoots.push(workspaceRoot)
  const projectPath = path.join(workspaceRoot, 'Room Bridge Test.writeros')
  await mkdir(projectPath)
  await writeFile(path.join(projectPath, 'project.json'), `${JSON.stringify({
    schemaVersion: 1,
    projectId,
    title: 'Room Bridge Test',
    format: 'feature',
    createdAt: capturedAt,
    updatedAt: capturedAt,
    openedAt: capturedAt,
    sourceImport: null,
    appVersion: '0.2.0',
  }, null, 2)}\n`, 'utf8')
  return { workspaceRoot, projectPath, projectId }
}

function decisionRow(overrides: Partial<MeetingDecisionRow> & { id: string }): MeetingDecisionRow {
  return {
    project_id: 'room-bridge-project-1',
    session_id: 'session-1',
    area: 'question:ending',
    field_path: 'story_locks',
    op: 'assert',
    content: { statement: 'The ending is fixed.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' },
    targets: [],
    created_at: capturedAt,
    ...overrides,
  }
}

const SENTINEL_LOCKS = '## Surface-declared locks\nNone declared.\n\n## Meeting locks\nNone declared.'

describe('bridgeStoryLocksToMemory', () => {
  it('does nothing when project memory cannot be resolved (disabled)', async () => {
    const memoryStore = { publish: vi.fn(), readSnapshot: vi.fn(), applyAction: vi.fn(), reconcilePublication: vi.fn(), rebuild: vi.fn() } as unknown as ProjectMemoryStore
    const outcome = await bridgeStoryLocksToMemory(
      { projectId: 'p1', storyLocksValue: 'Ace lives.' },
      { memoryStore, resolveProjectPath: async () => null },
    )
    expect(outcome).toEqual({ status: 'disabled', publishedCount: 0 })
    expect(memoryStore.publish).not.toHaveBeenCalled()
  })

  it('treats the contract sentinel as nothing to bridge', async () => {
    const { projectPath, projectId } = await makeProjectPackage()
    const memoryStore = createProjectMemoryStore()
    const outcome = await bridgeStoryLocksToMemory(
      { projectId, storyLocksValue: SENTINEL_LOCKS },
      { memoryStore, resolveProjectPath: async () => projectPath },
    )
    expect(outcome).toEqual({ status: 'disabled', publishedCount: 0 })
  })

  it('publishes non-sentinel locks as explicit active canon, idempotent on retry, superseding on change', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-2')
    const memoryStore = createProjectMemoryStore()
    const locksValue = '## Surface-declared locks\n- Ace lives\n\n## Meeting locks\nNone declared.'
    const deps = { memoryStore, resolveProjectPath: async () => projectPath }

    const first = await bridgeStoryLocksToMemory({ projectId, storyLocksValue: locksValue }, deps)
    expect(first).toEqual({ status: 'synced', publishedCount: 1 })

    // Same content again: idempotent no-op, not a second published record.
    const repeat = await bridgeStoryLocksToMemory({ projectId, storyLocksValue: locksValue }, deps)
    expect(repeat).toEqual({ status: 'synced', publishedCount: 0 })

    let snapshot = await memoryStore.readSnapshot(projectPath)
    const canonRecords = snapshot.records.filter(record => record.kind === 'canon')
    expect(canonRecords).toHaveLength(1)
    expect(canonRecords[0]).toMatchObject({ status: 'active', source: { workflow: 'writeros-room', approval: 'explicit' } })

    // Changed content supersedes the prior active canon record.
    const nextLocksValue = '## Surface-declared locks\n- Ace lives\n- Bea dies\n\n## Meeting locks\nNone declared.'
    const changed = await bridgeStoryLocksToMemory({ projectId, storyLocksValue: nextLocksValue }, deps)
    expect(changed).toEqual({ status: 'synced', publishedCount: 1 })

    snapshot = await memoryStore.readSnapshot(projectPath)
    const activeCanon = snapshot.records.filter(record => record.kind === 'canon' && record.status === 'active')
    expect(activeCanon).toHaveLength(1)
    expect(activeCanon[0].detail).toContain('Bea dies')
    expect(snapshot.records.filter(record => record.kind === 'canon' && record.status === 'superseded')).toHaveLength(1)
  })

  it('reports pending (never throws) when the underlying store fails', async () => {
    const memoryStore = {
      publish: vi.fn(async () => { throw new Error('ledger unavailable') }),
      readSnapshot: vi.fn(async () => ({ schemaVersion: 1 as const, projectId: 'p1', revision: 0, records: [], conflicts: [] })),
      applyAction: vi.fn(), reconcilePublication: vi.fn(), rebuild: vi.fn(),
    } as unknown as ProjectMemoryStore
    const outcome = await bridgeStoryLocksToMemory(
      { projectId: 'p1', storyLocksValue: 'Ace lives.' },
      { memoryStore, resolveProjectPath: async () => '/fake/path' },
    )
    expect(outcome.status).toBe('pending')
    expect(outcome.message).toBeTruthy()
  })
})

describe('bridgeRoomStateToMemory', () => {
  it('bridges concept_seed and project_state as development, and open_questions as individual open_question records', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-3')
    const memoryStore = createProjectMemoryStore()
    const outcome = await bridgeRoomStateToMemory({
      projectId,
      conceptSeed: '## Project Meeting Round\nA noir about a lighthouse keeper.',
      projectState: 'Currently drafting Act 2.',
      openQuestions: '- Does the rival survive?\n- Who lit the fire?',
    }, { memoryStore, resolveProjectPath: async () => projectPath })

    expect(outcome.status).toBe('synced')
    expect(outcome.publishedCount).toBe(4)

    const snapshot = await memoryStore.readSnapshot(projectPath)
    const development = snapshot.records.filter(record => record.kind === 'development')
    expect(development).toHaveLength(2)
    expect(development.every(record => record.status === 'active')).toBe(true)
    const openQuestions = snapshot.records.filter(record => record.kind === 'open_question')
    expect(openQuestions.map(record => record.claim).sort()).toEqual([
      'Does the rival survive?',
      'Who lit the fire?',
    ])
  })

  it('skips sentinel/undefined blocks entirely', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-4')
    const memoryStore = createProjectMemoryStore()
    const outcome = await bridgeRoomStateToMemory({
      projectId,
      conceptSeed: 'No concept seed banked yet. Offer the Project Meeting.',
      openQuestions: 'Nothing delegated — writer holds all intent.',
    }, { memoryStore, resolveProjectPath: async () => projectPath })

    expect(outcome).toEqual({ status: 'synced', publishedCount: 0 })
  })
})

describe('bridgeMeetingDecisionsToMemory', () => {
  it('maps locked decisions to canon and leaning/open decisions to the decision kind', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-5')
    const memoryStore = createProjectMemoryStore()
    const decisions: MeetingDecisionRow[] = [
      decisionRow({ id: 'decision-locked-1', content: { statement: 'The ending is fixed.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' } }),
      decisionRow({ id: 'decision-leaning-1', area: 'question:tone', content: { statement: 'Leaning toward a bittersweet tone.', mutability: 'leaning', originMarker: '[SEED]', disposition: 'field_mapped' } }),
    ]

    const outcome = await bridgeMeetingDecisionsToMemory({ projectId, decisions }, { memoryStore, resolveProjectPath: async () => projectPath })
    expect(outcome).toEqual({ status: 'synced', publishedCount: 2 })

    const snapshot = await memoryStore.readSnapshot(projectPath)
    const canon = snapshot.records.find(record => record.kind === 'canon')
    const decision = snapshot.records.find(record => record.kind === 'decision')
    expect(canon).toMatchObject({ status: 'active', claim: 'The ending is fixed.' })
    expect(decision).toMatchObject({ status: 'active', claim: 'Leaning toward a bittersweet tone.' })
  })

  it('reconciles by immutable decision-row id: identical retry is a no-op, a superseding row supersedes the bridged record', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-6')
    const memoryStore = createProjectMemoryStore()
    const deps = { memoryStore, resolveProjectPath: async () => projectPath }
    const original = decisionRow({ id: 'decision-1', content: { statement: 'The ending is fixed.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' } })

    const first = await bridgeMeetingDecisionsToMemory({ projectId, decisions: [original] }, deps)
    expect(first.publishedCount).toBe(1)
    const repeat = await bridgeMeetingDecisionsToMemory({ projectId, decisions: [original] }, deps)
    expect(repeat.publishedCount).toBe(0)

    const revised = decisionRow({
      id: 'decision-2',
      content: { statement: 'The ending is now ambiguous.', mutability: 'locked', originMarker: '[SEED]', disposition: 'field_mapped' },
      targets: ['decision-1'],
    })
    const superseding = await bridgeMeetingDecisionsToMemory({ projectId, decisions: [original, revised] }, deps)
    expect(superseding.publishedCount).toBe(1)

    const snapshot = await memoryStore.readSnapshot(projectPath)
    const active = snapshot.records.filter(record => record.status === 'active' && record.kind === 'canon')
    const superseded = snapshot.records.filter(record => record.status === 'superseded' && record.kind === 'canon')
    expect(active).toHaveLength(1)
    expect(active[0].claim).toBe('The ending is now ambiguous.')
    expect(superseded).toHaveLength(1)
  })

  it('ignores decision rows without a statement (retract/redirect)', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-7')
    const memoryStore = createProjectMemoryStore()
    const outcome = await bridgeMeetingDecisionsToMemory({
      projectId,
      decisions: [decisionRow({ id: 'retract-1', op: 'retract', content: {}, targets: [] })],
    }, { memoryStore, resolveProjectPath: async () => projectPath })
    expect(outcome).toEqual({ status: 'synced', publishedCount: 0 })
  })
})

describe('bridgeMeetingBankToMemory', () => {
  it('orchestrates locks, development state, and decisions in one call', async () => {
    const { projectPath, projectId } = await makeProjectPackage('room-bridge-project-8')
    const memoryStore = createProjectMemoryStore()
    const outcome = await bridgeMeetingBankToMemory({
      projectId,
      conceptSeed: 'A noir about a lighthouse keeper.',
      storyLocks: '## Surface-declared locks\n- Ace lives\n\n## Meeting locks\nNone declared.',
      openQuestions: '- Who lit the fire?',
      decisions: [decisionRow({ id: 'decision-bank-1' })],
    }, { memoryStore, resolveProjectPath: async () => projectPath })

    expect(outcome.status).toBe('synced')
    expect(outcome.publishedCount).toBe(4)
    const snapshot = await memoryStore.readSnapshot(projectPath)
    expect(snapshot.records.map(record => record.kind).sort()).toEqual(['canon', 'canon', 'development', 'open_question'])
  })

  it('reports "banked, memory sync pending" without throwing when a sub-bridge fails', async () => {
    const memoryStore = {
      publish: vi.fn(async () => { throw new Error('ledger unavailable') }),
      readSnapshot: vi.fn(async () => ({ schemaVersion: 1 as const, projectId: 'p1', revision: 0, records: [], conflicts: [] })),
      applyAction: vi.fn(), reconcilePublication: vi.fn(), rebuild: vi.fn(),
    } as unknown as ProjectMemoryStore
    const outcome = await bridgeMeetingBankToMemory({
      projectId: 'p1',
      conceptSeed: 'Seed.',
      storyLocks: '## Surface-declared locks\n- Ace lives\n\n## Meeting locks\nNone declared.',
      openQuestions: '- Who lit the fire?',
      decisions: [],
    }, { memoryStore, resolveProjectPath: async () => '/fake/path' })

    expect(outcome).toEqual({ status: 'pending', publishedCount: 0, message: 'banked, memory sync pending' })
  })

  it('reports disabled when project memory cannot be resolved at all', async () => {
    const outcome = await bridgeMeetingBankToMemory({
      projectId: 'p1',
      conceptSeed: 'No concept seed banked yet. Offer the Project Meeting.',
      storyLocks: SENTINEL_LOCKS,
      openQuestions: 'Nothing delegated — writer holds all intent.',
      decisions: [],
    }, { resolveProjectPath: async () => null })

    expect(outcome).toEqual({ status: 'disabled', publishedCount: 0 })
  })
})
