import {
  BeatSheetRefreshResponseSchema,
  BeatSheetSyncStatusSchema,
  type BeatSheetRefreshResponse,
  type BeatSheetSyncStatusResponse,
} from '@shared/projectLibraryApi'
import { z } from 'zod'

const beatSheetPath = (projectId: string, leaf: 'refresh' | 'status') =>
  `/api/project-library/projects/${encodeURIComponent(projectId)}/beat-sheet/${leaf}`

export async function postBeatSheetRefresh(
  projectId: string,
  sessionToken: string,
): Promise<BeatSheetRefreshResponse> {
  const res = await fetch(beatSheetPath(projectId, 'refresh'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-WriterOS-Session': sessionToken },
  })
  if (!res.ok) throw new Error(`Refresh failed (${res.status}).`)
  return BeatSheetRefreshResponseSchema.parse(await res.json())
}

export async function getBeatSheetStatus(
  projectId: string,
  sessionToken: string,
): Promise<BeatSheetSyncStatusResponse> {
  const res = await fetch(beatSheetPath(projectId, 'status'), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-WriterOS-Session': sessionToken },
  })
  if (!res.ok) throw new Error(`Status check failed (${res.status}).`)
  return z.object({ beatSheet: BeatSheetSyncStatusSchema }).parse(await res.json()).beatSheet
}
