import { z } from 'zod'
import type { ProjectPackageReadResult } from '../client/src/lib/projectPackage'
import type { ProjectStorageListEntry } from '../client/src/lib/projectStorage'
import type { ServerProjectRef } from '../server/projectLibrary/store'
import { AuthoredDocumentStateSchema, OutlineDocumentContentSchema } from './documents'

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

export const BeatSheetSyncStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('not-linked') }),
  z.object({ kind: z.literal('no-beat-sheet') }),
  z.object({ kind: z.literal('unchanged'), ticket: z.string(), syncedAt: z.string(), beatCount: z.number() }),
  z.object({
    kind: z.literal('updated'),
    ticket: z.string(),
    syncedAt: z.string(),
    beatCount: z.number(),
    added: z.array(z.string()),
    removed: z.array(z.string()),
    changed: z.array(z.string()),
  }),
  z.object({ kind: z.literal('unavailable'), ticket: z.string().nullable(), message: z.string() }),
  z.object({ kind: z.literal('malformed'), ticket: z.string(), message: z.string() }),
  z.object({ kind: z.literal('reopened'), ticket: z.string(), message: z.string() }),
  z.object({ kind: z.literal('ambiguous'), message: z.string() }),
])
export type BeatSheetSyncStatusResponse = z.infer<typeof BeatSheetSyncStatusSchema>

export const BeatSheetRefreshResponseSchema = z.object({
  beatSheet: BeatSheetSyncStatusSchema,
  outline: AuthoredDocumentStateSchema(OutlineDocumentContentSchema).nullable(),
})
export type BeatSheetRefreshResponse = z.infer<typeof BeatSheetRefreshResponseSchema>

export interface ProjectLibraryReadResponse {
  result: ProjectPackageReadResult
  /** Absent when talking to a server that predates the Beat Sheet. */
  beatSheet?: BeatSheetSyncStatusResponse | null
}

export interface ProjectLibrarySaveResponse {
  ref: ServerProjectRef
}

export interface ProjectLibraryRemoveResponse {
  ok: true
  alreadyMissing: boolean
}
