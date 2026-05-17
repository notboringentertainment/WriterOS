import { describe, it, expect, beforeEach } from 'vitest'
import {
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

  it('deletes the active project and switches to the most-recent remaining project', () => {
    const seeded = seedLibrary()
    const activeId = seeded.activeProjectId
    const nextExpectedActive = seeded.projects.find(p => p.id !== activeId)!.id

    const result = deleteProjectFromLibrary(activeId, seeded.projects)

    expect(result.projects.find(p => p.id === activeId)).toBeUndefined()
    expect(result.activeProjectId).toBe(nextExpectedActive)
    expect(result.state).toEqual(result.projects.find(p => p.id === nextExpectedActive)!.state)
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(nextExpectedActive)
  })

  it('seeds a blank project when the deleted project is the only one', () => {
    localStorage.clear()
    const onlyLibrary = loadActiveProjectLibrary()
    expect(onlyLibrary.projects).toHaveLength(1)
    const onlyId = onlyLibrary.activeProjectId

    const result = deleteProjectFromLibrary(onlyId, onlyLibrary.projects)

    expect(result.projects).toHaveLength(1)
    expect(result.projects[0].id).not.toBe(onlyId)
    expect(result.activeProjectId).toBe(result.projects[0].id)
    expect(result.state).toEqual(defaultProjectState())
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(result.activeProjectId)
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
