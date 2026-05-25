import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  activateStoredProject,
  loadActiveProjectLibrary,
  createBlankProject,
  saveProjectToLibrary,
  deleteProjectFromLibrary,
} from '../../client/src/lib/projectLibrary'
import { defaultProjectState } from '../../client/src/lib/projectState'

const LIBRARY_KEY = 'writeros_project_library'
const ACTIVE_KEY = 'writeros_active_project_id'

function seedLibrary() {
  localStorage.clear()
  const initial = loadActiveProjectLibrary()
  const second = createBlankProject(initial.projects)
  const third = createBlankProject(second.projects)
  return third
}

describe('deleteProjectFromLibrary', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes a non-active project and keeps the active project unchanged', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    const otherProject = seeded.projects.find(p => p.id !== activeId)!

    const result = deleteProjectFromLibrary(otherProject.id, seeded.projects)

    expect(result.projects.find(p => p.id === otherProject.id)).toBeUndefined()
    expect(result.activeProjectId).toBe(activeId)
    expect(result.projects).toHaveLength(seeded.projects.length - 1)
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(activeId)
    const stored = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]')
    expect(stored.find((p: { id: string }) => p.id === otherProject.id)).toBeUndefined()
  })

  it('clears active selection when the deleted project was active (Slice 5a: route Home, do not auto-switch)', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId

    const result = deleteProjectFromLibrary(activeId, seeded.projects)

    expect(result.projects.find(p => p.id === activeId)).toBeUndefined()
    expect(result.activeProjectId).toBe('')
    expect(result.state.meta.title).toBe('')
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    // Library itself still contains the remaining projects.
    expect(result.projects).toHaveLength(seeded.projects.length - 1)
  })

  it('returns the empty-library sentinel when the deleted project is the only one (Slice 5a)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-18T12:00:00.000Z'))
    localStorage.clear()
    const onlyLibrary = loadActiveProjectLibrary()
    expect(onlyLibrary.projects).toHaveLength(1)
    const onlyId = onlyLibrary.activeProjectId

    const result = deleteProjectFromLibrary(onlyId, onlyLibrary.projects)

    expect(result.projects).toHaveLength(0)
    expect(result.activeProjectId).toBe('')
    expect(result.state.meta.title).toBe('')
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    // Empty library is persisted, not removed — distinguishes "intentionally
    // cleared" from "first run" on next loadActiveProjectLibrary call.
    expect(localStorage.getItem(LIBRARY_KEY)).toBe('[]')
  })

  it('respects intentionally-empty library on reload (no auto-seed)', () => {
    localStorage.clear()
    const onlyLibrary = loadActiveProjectLibrary()
    const onlyId = onlyLibrary.activeProjectId
    deleteProjectFromLibrary(onlyId, onlyLibrary.projects)

    const reloaded = loadActiveProjectLibrary()
    expect(reloaded.projects).toHaveLength(0)
    expect(reloaded.activeProjectId).toBe('')
  })

  it('auto-seeds a starter project on first ever load (no persisted library)', () => {
    localStorage.clear()
    const fresh = loadActiveProjectLibrary()
    expect(fresh.projects).toHaveLength(1)
    expect(fresh.activeProjectId).toBe(fresh.projects[0].id)
  })

  it('returns the library unchanged when the project id is not found', () => {
    const seeded = seedLibrary()
    const originalActive = seeded.activeProjectId
    const originalLength = seeded.projects.length

    const result = deleteProjectFromLibrary('does-not-exist', seeded.projects)

    expect(result.projects).toHaveLength(originalLength)
    expect(result.activeProjectId).toBe(originalActive)
    expect(result.projects.map(p => p.id).sort()).toEqual(seeded.projects.map(p => p.id).sort())
  })
})

describe('saveProjectToLibrary (regression coverage for saveNow path)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('bumps updatedAt on every save', async () => {
    const seeded = loadActiveProjectLibrary()
    const projectId = seeded.activeProjectId
    const firstUpdatedAt = seeded.projects[0].updatedAt

    await new Promise(r => setTimeout(r, 2))
    const next = saveProjectToLibrary(projectId, seeded.state, seeded.projects)

    expect(next[0].id).toBe(projectId)
    expect(next[0].updatedAt).toBeGreaterThan(firstUpdatedAt)
  })
})

describe('activateStoredProject', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('activates an externally loaded project without changing its timestamps', () => {
    const seeded = loadActiveProjectLibrary()
    const externalState = defaultProjectState()
    externalState.meta.title = 'Harbor Lights'
    const externalProject = {
      id: 'external-project',
      createdAt: Date.parse('2026-05-01T10:00:00.000Z'),
      updatedAt: Date.parse('2026-05-02T11:30:00.000Z'),
      state: externalState,
    }

    const result = activateStoredProject(externalProject, seeded.projects)

    expect(result.activeProjectId).toBe('external-project')
    expect(result.projects[0]).toMatchObject({
      id: 'external-project',
      createdAt: externalProject.createdAt,
      updatedAt: externalProject.updatedAt,
      state: { meta: { title: 'Harbor Lights' } },
    })
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('external-project')
  })
})
