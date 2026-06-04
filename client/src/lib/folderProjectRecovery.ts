import type { StoredProject } from './projectLibrary'

export function preferNewerMigratedBackup(
  folderProject: StoredProject,
  storedProjects: readonly StoredProject[],
): StoredProject {
  const backup = storedProjects.find(project =>
    project.id === folderProject.id &&
    Boolean(project.migratedToFolder) &&
    project.updatedAt > folderProject.updatedAt
  )

  return backup ?? folderProject
}
