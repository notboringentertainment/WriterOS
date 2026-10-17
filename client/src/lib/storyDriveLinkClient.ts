import {
  StoryDriveFoldersResponseSchema,
  StoryDriveImportCanonResponseSchema,
  StoryDriveLinkResponseSchema,
  type StoryDriveCanonResult,
  type StoryDriveFoldersResponse,
  type StoryDriveLinkResponse,
} from '@shared/projectLibraryApi'

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

export async function getStoryDriveFolders(sessionToken: string): Promise<StoryDriveFoldersResponse> {
  const res = await fetch('/api/project-library/story-drive/folders', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-WriterOS-Session': sessionToken },
  })
  if (!res.ok) throw await failure(res, "WriterOS couldn't list the Story-drive folders.")
  return StoryDriveFoldersResponseSchema.parse(await res.json())
}

export async function postStoryDriveLink(
  projectId: string,
  folder: string,
  sessionToken: string,
): Promise<StoryDriveLinkResponse> {
  const res = await fetch(projectPath(projectId, 'story-drive-link'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-WriterOS-Session': sessionToken },
    body: JSON.stringify({ folder }),
  })
  if (!res.ok) throw await failure(res, "WriterOS couldn't link the Story-drive folder.")
  return StoryDriveLinkResponseSchema.parse(await res.json())
}

export async function postStoryDriveImportCanon(
  projectId: string,
  sessionToken: string,
): Promise<StoryDriveCanonResult> {
  const res = await fetch(projectPath(projectId, 'story-drive-link/import-canon'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-WriterOS-Session': sessionToken },
  })
  if (!res.ok) throw await failure(res, "WriterOS couldn't bring in the Story-drive canon.")
  return StoryDriveImportCanonResponseSchema.parse(await res.json()).canon
}
