import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  activateStoredProject,
  archiveProjectInLibrary,
  loadActiveProjectLibrary,
  createBlankProject,
  saveProjectToLibrary,
  deleteProjectFromLibrary,
  restoreProjectInLibrary,
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

describe('archiveProjectInLibrary (Slice 5a-2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sets archivedAt on the target project and persists', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    const other = seeded.projects.find(p => p.id !== activeId)!

    const result = archiveProjectInLibrary(other.id, seeded.projects)

    const archived = result.projects.find(p => p.id === other.id)
    expect(archived?.archivedAt).toBeTruthy()
    const stored = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]')
    expect(stored.find((p: { id: string; archivedAt?: string }) => p.id === other.id)?.archivedAt).toBeTruthy()
    // Active project unchanged when a non-active project is archived.
    expect(result.activeProjectId).toBe(activeId)
  })

  it('clears active selection when the active project is archived', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId

    const result = archiveProjectInLibrary(activeId, seeded.projects)

    expect(result.activeProjectId).toBe('')
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(result.projects.find(p => p.id === activeId)?.archivedAt).toBeTruthy()
  })

  it('no-ops on an already-archived project', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    const other = seeded.projects.find(p => p.id !== activeId)!
    const first = archiveProjectInLibrary(other.id, seeded.projects)
    const firstStamp = first.projects.find(p => p.id === other.id)?.archivedAt

    const second = archiveProjectInLibrary(other.id, first.projects)

    expect(second.projects.find(p => p.id === other.id)?.archivedAt).toBe(firstStamp)
  })
})

describe('restoreProjectInLibrary (Slice 5a-2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears archivedAt and persists', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    const other = seeded.projects.find(p => p.id !== activeId)!
    const archived = archiveProjectInLibrary(other.id, seeded.projects)

    const result = restoreProjectInLibrary(other.id, archived.projects)

    expect(result.projects.find(p => p.id === other.id)?.archivedAt).toBeUndefined()
    const stored = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]')
    expect(stored.find((p: { id: string; archivedAt?: string }) => p.id === other.id)?.archivedAt).toBeUndefined()
  })

  it('does not auto-activate a restored project', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    const other = seeded.projects.find(p => p.id !== activeId)!
    const archived = archiveProjectInLibrary(other.id, seeded.projects)
    // Active was untouched.
    expect(archived.activeProjectId).toBe(activeId)

    const result = restoreProjectInLibrary(other.id, archived.projects)

    expect(result.activeProjectId).toBe(activeId)
  })

  it('no-ops on a not-archived project', () => {
    const seeded = seedLibrary()
    const other = seeded.projects.find(p => p.id !== seeded.activeProjectId)!

    const result = restoreProjectInLibrary(other.id, seeded.projects)

    expect(result.projects.find(p => p.id === other.id)?.archivedAt).toBeUndefined()
  })
})

describe('loadActiveProjectLibrary skips archived projects (Slice 5a-2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not auto-select an archived project as active on reload', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    archiveProjectInLibrary(activeId, seeded.projects)

    const reloaded = loadActiveProjectLibrary()

    expect(reloaded.projects.length).toBeGreaterThan(0)
    expect(reloaded.activeProjectId).not.toBe('')
    const reloadedActive = reloaded.projects.find(p => p.id === reloaded.activeProjectId)
    expect(reloadedActive).toBeDefined()
    expect(reloadedActive?.archivedAt).toBeFalsy()
  })

  it('lands Home with no active when every persisted project is archived', () => {
    localStorage.clear()
    const only = loadActiveProjectLibrary()
    const id = only.activeProjectId
    archiveProjectInLibrary(id, only.projects)

    const reloaded = loadActiveProjectLibrary()
    expect(reloaded.activeProjectId).toBe('')
    // Archived project is preserved in storage so the writer can restore it.
    expect(reloaded.projects).toHaveLength(1)
    expect(reloaded.projects[0].archivedAt).toBeTruthy()
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
