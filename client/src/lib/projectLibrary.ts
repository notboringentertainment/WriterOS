import { defaultProjectState, loadProjectState, migrateState, saveProjectState } from './projectState'
import { normalizeProjectTitle } from './projectIdentity'
import type { ProjectState } from './projectState'
import type { ProjectFormat } from '@shared/projectFormat'

const PROJECT_LIBRARY_KEY = 'writeros_project_library'
const ACTIVE_PROJECT_ID_KEY = 'writeros_active_project_id'

export interface StoredProject {
  id: string
  createdAt: number
  updatedAt: number
  state: ProjectState
}

export interface ProjectSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  format?: ProjectFormat
  sceneCount?: number
}

export interface ActiveProjectLibrary {
  activeProjectId: string
  state: ProjectState
  projects: StoredProject[]
}

function now() {
  return Date.now()
}

function createProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `project-${now()}-${Math.random().toString(36).slice(2)}`
}

function readProjectLibrary(): StoredProject[] {
  try {
    const raw = localStorage.getItem(PROJECT_LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<StoredProject>
        if (typeof candidate.id !== 'string' || !candidate.state) return null
        return {
          id: candidate.id,
          createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now(),
          updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now(),
          state: migrateState(candidate.state),
        }
      })
      .filter((item): item is StoredProject => item !== null)
  } catch {
    return []
  }
}

function writeProjectLibrary(projects: StoredProject[]) {
  localStorage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(projects))
}

function writeActiveProjectId(projectId: string) {
  localStorage.setItem(ACTIVE_PROJECT_ID_KEY, projectId)
}

export function summarizeProjects(projects: StoredProject[]): ProjectSummary[] {
  return projects.map(project => ({
    id: project.id,
    title: normalizeProjectTitle(project.state.meta.title),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    format: project.state.meta.format,
    sceneCount: project.state.script.scenes.length,
  }))
}

export function loadActiveProjectLibrary(): ActiveProjectLibrary {
  const projects = readProjectLibrary()
  const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
  const activeProject = projects.find(project => project.id === activeProjectId) ?? projects[0]

  if (activeProject) {
    writeActiveProjectId(activeProject.id)
    saveProjectState(activeProject.state)
    return {
      activeProjectId: activeProject.id,
      state: activeProject.state,
      projects,
    }
  }

  const seedProject: StoredProject = {
    id: createProjectId(),
    createdAt: now(),
    updatedAt: now(),
    state: loadProjectState(),
  }
  writeActiveProjectId(seedProject.id)
  writeProjectLibrary([seedProject])
  saveProjectState(seedProject.state)

  return {
    activeProjectId: seedProject.id,
    state: seedProject.state,
    projects: [seedProject],
  }
}

export function saveProjectToLibrary(projectId: string, state: ProjectState, projects: StoredProject[]) {
  const existing = projects.find(project => project.id === projectId)
  const nextProject: StoredProject = {
    id: projectId,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
    state,
  }
  const nextProjects = [
    nextProject,
    ...projects.filter(project => project.id !== projectId),
  ]
  writeProjectLibrary(nextProjects)
  writeActiveProjectId(projectId)
  saveProjectState(state)
  return nextProjects
}

export function activateStoredProject(project: StoredProject, projects: StoredProject[]): ActiveProjectLibrary {
  const migratedProject: StoredProject = {
    ...project,
    state: migrateState(project.state),
  }
  const nextProjects = [
    migratedProject,
    ...projects.filter(existingProject => existingProject.id !== migratedProject.id),
  ]

  writeProjectLibrary(nextProjects)
  writeActiveProjectId(migratedProject.id)
  saveProjectState(migratedProject.state)

  return {
    activeProjectId: migratedProject.id,
    state: migratedProject.state,
    projects: nextProjects,
  }
}

export function createBlankProject(projects: StoredProject[]) {
  const project: StoredProject = {
    id: createProjectId(),
    createdAt: now(),
    updatedAt: now(),
    state: defaultProjectState(),
  }
  const nextProjects = [project, ...projects]
  writeProjectLibrary(nextProjects)
  writeActiveProjectId(project.id)
  saveProjectState(project.state)
  return {
    activeProjectId: project.id,
    state: project.state,
    projects: nextProjects,
  }
}

export function getStoredProject(projectId: string, projects: StoredProject[]) {
  return projects.find(project => project.id === projectId)
}

export function deleteProjectFromLibrary(
  projectId: string,
  projects: StoredProject[],
): ActiveProjectLibrary {
  const target = projects.find(project => project.id === projectId)
  if (!target) {
    const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY) ?? projects[0]?.id ?? ''
    const active = projects.find(project => project.id === activeProjectId) ?? projects[0]
    return {
      activeProjectId: active?.id ?? '',
      state: active?.state ?? defaultProjectState(),
      projects,
    }
  }

  const remaining = projects.filter(project => project.id !== projectId)

  if (remaining.length === 0) {
    writeProjectLibrary([])
    return createBlankProject([])
  }

  const previousActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
  const nextActive =
    previousActiveId && previousActiveId !== projectId
      ? remaining.find(project => project.id === previousActiveId) ?? remaining[0]
      : remaining[0]

  writeProjectLibrary(remaining)
  writeActiveProjectId(nextActive.id)
  saveProjectState(nextActive.state)

  return {
    activeProjectId: nextActive.id,
    state: nextActive.state,
    projects: remaining,
  }
}
