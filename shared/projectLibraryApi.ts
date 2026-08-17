import { z } from 'zod'
import type { ProjectPackageReadResult } from '../client/src/lib/projectPackage'
import type { ProjectStorageListEntry } from '../client/src/lib/projectStorage'
import type { ServerProjectRef } from '../server/projectLibrary/store'

export const WRITEROS_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export const StoredProjectRequestSchema = z.object({
  id: z.string().trim().regex(WRITEROS_PROJECT_ID_PATTERN),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  state: z.record(z.unknown()),
  archivedAt: z.string().datetime().optional(),
  migratedToFolder: z.object({
    folderLabel: z.string(),
    packageName: z.string(),
    migratedAt: z.string().datetime(),
  }).strict().optional(),
}).strict()

export const SaveProjectRequestSchema = z.object({
  project: StoredProjectRequestSchema,
}).strict()

export type ProjectLibraryBootstrap =
  | { enabled: false }
  | { enabled: true; label: string; sessionToken: string }

export interface ProjectLibraryListResponse {
  entries: Array<ProjectStorageListEntry<ServerProjectRef>>
}

export interface ProjectLibraryReadResponse {
  result: ProjectPackageReadResult
}

export interface ProjectLibrarySaveResponse {
  ref: ServerProjectRef
}
