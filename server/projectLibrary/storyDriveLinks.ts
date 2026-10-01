import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { WRITEROS_PROJECT_ID_PATTERN } from '../../shared/projectLibraryApi'
import { acquirePackageWriteLock } from './packageLock'

export const STORY_DRIVE_LINKS_FILE = '.writeros-story-drive-links.json'
const REGISTRY_LOCK_ID = 'story-drive-links'

export const StoryDriveLinkSchema = z.object({
  root: z.string().min(1),
  beatSheet: z.string().regex(/^resolved\/[A-Za-z0-9._-]+\.md$/).optional(),
}).strict()
export type StoryDriveLink = z.infer<typeof StoryDriveLinkSchema>

export const StoryDriveLinksSchema = z.object({
  version: z.literal(1),
  links: z.record(z.string().regex(WRITEROS_PROJECT_ID_PATTERN), StoryDriveLinkSchema),
}).strict()
export type StoryDriveLinks = z.infer<typeof StoryDriveLinksSchema>

export class StoryDriveLinksError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoryDriveLinksError'
  }
}

export async function readStoryDriveLinks(projectsRoot: string): Promise<StoryDriveLinks> {
  const filePath = path.join(projectsRoot, STORY_DRIVE_LINKS_FILE)
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { version: 1, links: {} }
    }
    throw error
  }
  try {
    return StoryDriveLinksSchema.parse(JSON.parse(raw))
  } catch (error) {
    throw new StoryDriveLinksError(
      `The Story-drive link registry is not valid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function writeStoryDriveLink(
  projectsRoot: string,
  projectId: string,
  link: StoryDriveLink,
): Promise<{ changed: boolean }> {
  const validId = z.string().regex(WRITEROS_PROJECT_ID_PATTERN).parse(projectId)
  const validLink = StoryDriveLinkSchema.parse(link)
  const lock = await acquirePackageWriteLock({ workspaceRoot: projectsRoot, projectId: REGISTRY_LOCK_ID })
  try {
    const registry = await readStoryDriveLinks(projectsRoot)
    const existing = registry.links[validId]
    if (existing && JSON.stringify(existing) === JSON.stringify(validLink)) return { changed: false }
    const next: StoryDriveLinks = { version: 1, links: { ...registry.links, [validId]: validLink } }
    await mkdir(projectsRoot, { recursive: true })
    await atomicReplace(path.join(projectsRoot, STORY_DRIVE_LINKS_FILE), `${JSON.stringify(next, null, 2)}\n`)
    return { changed: true }
  } finally {
    await lock.release()
  }
}

async function atomicReplace(filePath: string, contents: string): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomBytes(12).toString('hex')}.tmp`,
  )
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
