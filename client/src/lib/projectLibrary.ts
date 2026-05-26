import { defaultProjectState, loadProjectState, migrateState, saveProjectState, stripProjectRawSource } from './projectState'
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
  // ISO-8601 timestamp set when the writer archives the project. Absent =
  // active. Archived projects are hidden from the Home Active list and from
  // active-project selection on reload; they remain restorable from the
  // Home Archive view.
  archivedAt?: string
  // Slice 4: marker stamped when this project has been migrated to a
  // folder-backed package via the File System Access adapter. Constraint-only
  // for this slice — the marker is preserved through read/write but not yet
  // surfaced in UI. `packageName` is the on-disk folder name; `folderLabel`
  // is the user-readable parent folder; `migratedAt` is the ISO-8601 stamp.
  migratedToFolder?: {
    folderLabel: string
    packageName: string
    migratedAt: string
  }
}

export interface ProjectSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  format?: ProjectFormat
  sceneCount?: number
  archivedAt?: string
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

function hasPersistedProjectLibrary(): boolean {
  return localStorage.getItem(PROJECT_LIBRARY_KEY) !== null
}

// Test-only re-export: exposes the otherwise-private readProjectLibrary so
// tests can verify raw localStorage round-trips without going through the
// loadActiveProjectLibrary auto-seed / active-selection logic.
export const __testReadProjectLibrary = (): StoredProject[] => readProjectLibrary()

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
        if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0 || !candidate.state) return null
        const archivedAt = typeof candidate.archivedAt === 'string' ? candidate.archivedAt : undefined
        const migratedToFolder =
          candidate.migratedToFolder &&
          typeof candidate.migratedToFolder === 'object' &&
          typeof candidate.migratedToFolder.folderLabel === 'string' &&
          typeof candidate.migratedToFolder.packageName === 'string' &&
          typeof candidate.migratedToFolder.migratedAt === 'string'
            ? {
                folderLabel: candidate.migratedToFolder.folderLabel,
                packageName: candidate.migratedToFolder.packageName,
                migratedAt: candidate.migratedToFolder.migratedAt,
              }
            : undefined
        return {
          id: candidate.id,
          createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now(),
          updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now(),
          state: migrateState(candidate.state),
          ...(archivedAt ? { archivedAt } : {}),
          ...(migratedToFolder ? { migratedToFolder } : {}),
        }
      })
      .filter((item): item is StoredProject => item !== null)
  } catch {
    return []
  }
}

function writeProjectLibrary(projects: StoredProject[]) {
  localStorage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(projects.map(project => ({
    ...project,
    state: stripProjectRawSource(project.state),
  }))))
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
    ...(project.archivedAt ? { archivedAt: project.archivedAt } : {}),
  }))
}

// Slice 4: projects that have been migrated to a folder-backed package are
// preserved in the localStorage library (so we can restore the marker on
// re-read) but must never be auto-activated or surfaced as a candidate for
// active selection. They live in a parallel "moved" state; the writer
// re-enters them via the folder-open flow.
export function projectsForActiveLibrary(projects: StoredProject[]): StoredProject[] {
  return projects.filter(project => !project.migratedToFolder)
}

// Slice 4: descriptor passed to markProjectsMigrated when one or more projects
// have been migrated to folder-backed packages on disk.
export interface MigrationMarker {
  projectId: string
  folderLabel: string
  packageName: string
  migratedAt: string
}

// Slice 4: stamps `migratedToFolder` onto the matching projects and persists
// the library. Non-matching projects are returned unchanged. This does not
// delete any localStorage entries — the marker is the only mutation.
export function markProjectsMigrated(
  projects: StoredProject[],
  markers: MigrationMarker[],
): StoredProject[] {
  const byId = new Map(markers.map(marker => [marker.projectId, marker]))
  const next = projects.map(project => {
    const marker = byId.get(project.id)
    if (!marker) return project
    return {
      ...project,
      migratedToFolder: {
        folderLabel: marker.folderLabel,
        packageName: marker.packageName,
        migratedAt: marker.migratedAt,
      },
    }
  })
  writeProjectLibrary(next)
  return next
}

// Slice 4: pure read helper for "what still needs migrating". Archived
// projects are deliberately excluded in V1 so migration never converts a
// browser Archive entry into an active root-level `.writeros` package.
export function getUnmigratedProjects(projects: StoredProject[]): StoredProject[] {
  return projects.filter(project => project.id.trim().length > 0 && !project.migratedToFolder && !project.archivedAt)
}

export function loadActiveProjectLibrary(): ActiveProjectLibrary {
  const projects = readProjectLibrary()
  const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)

  // Slice 4: if the stored active id points to a project that has been
  // migrated to a folder-backed package, refuse to activate it. The
  // localStorage copy is constraint-only — the canonical content lives on
  // disk and must be re-entered via the folder-open flow. We keep the
  // migrated project in the returned `projects` array so other read paths
  // can still see the marker.
  const storedActive = projects.find(project => project.id === activeProjectId)
  if (storedActive?.migratedToFolder) {
    localStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
    return {
      activeProjectId: '',
      state: defaultProjectState(),
      projects,
    }
  }

  // Archived and migrated projects are never auto-selected as the active
  // project. Archived: writer can restore from the Home Archive view.
  // Migrated: writer re-opens from disk via the folder-open flow.
  const activeCandidates = projectsForActiveLibrary(projects).filter(
    project => !project.archivedAt,
  )
  const requestedActive = projects.find(project => project.id === activeProjectId)
  const activeProject =
    requestedActive && !requestedActive.archivedAt && !requestedActive.migratedToFolder
      ? requestedActive
      : activeCandidates[0]

  if (activeProject) {
    writeActiveProjectId(activeProject.id)
    saveProjectState(activeProject.state)
    return {
      activeProjectId: activeProject.id,
      state: activeProject.state,
      projects,
    }
  }

  // Distinguish "first run" from "intentionally cleared via delete-all" /
  // "everything archived":
  // - never persisted        -> seed a starter project (onboarding behavior)
  // - persisted as []        -> respect empty state; user lands on Home
  // - all archived           -> keep archived projects; land Home with no active
  if (hasPersistedProjectLibrary()) {
    localStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
    return {
      activeProjectId: '',
      state: defaultProjectState(),
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
  if (projectId.trim().length === 0) return projects

  const existing = projects.find(project => project.id === projectId)
  const nextProject: StoredProject = {
    id: projectId,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
    state,
    ...(existing?.archivedAt ? { archivedAt: existing.archivedAt } : {}),
    ...(existing?.migratedToFolder ? { migratedToFolder: existing.migratedToFolder } : {}),
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

export function createProjectFromState(projects: StoredProject[], state: ProjectState) {
  const project: StoredProject = {
    id: createProjectId(),
    createdAt: now(),
    updatedAt: now(),
    state: migrateState(state),
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

export function archiveProjectInLibrary(
  projectId: string,
  projects: StoredProject[],
): ActiveProjectLibrary {
  const target = projects.find(project => project.id === projectId)
  if (!target || target.archivedAt) {
    const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY) ?? projects[0]?.id ?? ''
    const active = projects.find(
      project => project.id === activeProjectId && !project.archivedAt && !project.migratedToFolder,
    )
    return {
      activeProjectId: active?.id ?? '',
      state: active?.state ?? defaultProjectState(),
      projects,
    }
  }

  const archivedAt = new Date().toISOString()
  const nextProjects = projects.map(project =>
    project.id === projectId ? { ...project, archivedAt } : project,
  )

  const previousActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
  const archivedActive = previousActiveId === projectId

  writeProjectLibrary(nextProjects)

  if (archivedActive) {
    // Archiving the active project closes the active session and returns
    // the writer to Home, mirroring the delete-active contract.
    localStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
    return {
      activeProjectId: '',
      state: defaultProjectState(),
      projects: nextProjects,
    }
  }

  return {
    activeProjectId: previousActiveId ?? '',
    state: nextProjects.find(project => project.id === previousActiveId)?.state ?? defaultProjectState(),
    projects: nextProjects,
  }
}

export function restoreProjectInLibrary(
  projectId: string,
  projects: StoredProject[],
): ActiveProjectLibrary {
  const target = projects.find(project => project.id === projectId)
  if (!target || !target.archivedAt) {
    const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY) ?? ''
    const active = projects.find(
      project => project.id === activeProjectId && !project.archivedAt && !project.migratedToFolder,
    )
    return {
      activeProjectId: active?.id ?? '',
      state: active?.state ?? defaultProjectState(),
      projects,
    }
  }

  const nextProjects = projects.map(project =>
    project.id === projectId ? { ...project, archivedAt: undefined } : project,
  )

  // Restore is non-destructive: keep the existing active selection. The
  // writer can open the restored project explicitly from the Active list.
  writeProjectLibrary(nextProjects)
  const previousActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
  return {
    activeProjectId: previousActiveId ?? '',
    state: nextProjects.find(project => project.id === previousActiveId)?.state ?? defaultProjectState(),
    projects: nextProjects,
  }
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
    // Persist the empty library explicitly so loadActiveProjectLibrary respects
    // the user's intent and does not auto-seed a blank starter project.
    writeProjectLibrary([])
    localStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
    return {
      activeProjectId: '',
      state: defaultProjectState(),
      projects: [],
    }
  }

  const previousActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
  // Active fallback excludes both archived and migrated projects — a
  // migrated project's localStorage copy is constraint-only and must not
  // be re-activated implicitly.
  const remainingActiveCandidates = projectsForActiveLibrary(remaining).filter(
    project => !project.archivedAt,
  )
  const nextActive =
    previousActiveId && previousActiveId !== projectId
      ? remainingActiveCandidates.find(project => project.id === previousActiveId)
      : undefined
  // If the deleted project was active, clear active selection and route Home;
  // do not silently switch focus to a neighbor project.
  const deletedActive = previousActiveId === projectId

  writeProjectLibrary(remaining)
  if (deletedActive || !nextActive) {
    // Either the active project was deleted, or the previous active selection
    // is gone / now archived. Either way, land Home with no active session.
    localStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
    return {
      activeProjectId: '',
      state: defaultProjectState(),
      projects: remaining,
    }
  }

  writeActiveProjectId(nextActive.id)
  saveProjectState(nextActive.state)

  return {
    activeProjectId: nextActive.id,
    state: nextActive.state,
    projects: remaining,
  }
}
