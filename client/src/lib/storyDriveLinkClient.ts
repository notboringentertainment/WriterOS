import {
  StoryDriveFoldersResponseSchema,
  StoryDriveImportCanonResponseSchema,
  StoryDriveLinkResponseSchema,
  type StoryDriveCanonResult,
  type StoryDriveFoldersResponse,
  type StoryDriveLinkResponse,
} from '@shared/projectLibraryApi'

/** The adapter's fetch: it adds the session header and refreshes the session once after a 401. */
export type LibraryFetch = (input: string, init?: RequestInit) => Promise<Response>

const projectPath = (projectId: string, leaf: string) =>
  `/api/project-library/projects/${encodeURIComponent(projectId)}/${leaf}`

/** The server's own plain message when it sent one, else a generic line. */
async function failure(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json() as { message?: unknown }
    if (typeof body.message === 'string' && body.message) return new Error(body.message)
  } catch {
    // Not JSON; use the fallback.
  }
  return new Error(fallback)
}

export async function getStoryDriveFolders(send: LibraryFetch): Promise<StoryDriveFoldersResponse> {
  const res = await send('/api/project-library/story-drive/folders', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw await failure(res, "WriterOS couldn't list the Story-drive folders.")
  return StoryDriveFoldersResponseSchema.parse(await res.json())
}

export async function postStoryDriveLink(
  projectId: string,
  folder: string,
  send: LibraryFetch,
): Promise<StoryDriveLinkResponse> {
  const res = await send(projectPath(projectId, 'story-drive-link'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  })
  if (!res.ok) throw await failure(res, "WriterOS couldn't link the Story-drive folder.")
  return StoryDriveLinkResponseSchema.parse(await res.json())
}

export async function postStoryDriveImportCanon(
  projectId: string,
  send: LibraryFetch,
): Promise<StoryDriveCanonResult> {
  const res = await send(projectPath(projectId, 'story-drive-link/import-canon'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw await failure(res, "WriterOS couldn't bring in the Story-drive canon.")
  return StoryDriveImportCanonResponseSchema.parse(await res.json()).canon
}
