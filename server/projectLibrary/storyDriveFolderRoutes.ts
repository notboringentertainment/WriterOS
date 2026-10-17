import type { Express, Response } from 'express'
import type { Dirent } from 'node:fs'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type {
  StoryDriveCanonResult,
  StoryDriveFolder,
  StoryDriveFoldersResponse,
  StoryDriveLinkResponse,
} from '../../shared/projectLibraryApi'
import type { BeatSheetSyncStatus } from '../projectMemory/beatSheetSync'
import { syncBeatSheet } from '../projectMemory/beatSheetSync'
import { AuthoredDocumentStateSchema, OutlineDocumentContentSchema } from '../../shared/documents'
import { acquirePackageWriteLock } from './packageLock'
import { guardExistingPath, type SafeExistingPath } from '../projectMemory/safePaths'
import type { ProjectLibraryConfig } from './config'
import { authenticated, sameOrigin } from './security'
import { ProjectLibraryStoreError, type ProjectLibraryStore } from './store'
import { claimStoryDriveLink, readStoryDriveLinks, type StoryDriveLinks } from './storyDriveLinks'

export interface StoryDriveFolderDeps {
  /** The folder holding one sub-folder per Story-drive project. */
  searchRoot: string
  importCanon(packagePath: string, storyDriveRoot: string): Promise<void>
  isMorganOpen?(projectId: string): boolean
}

export function defaultStoryDriveSearchRoot(env: NodeJS.ProcessEnv, home = os.homedir()): string {
  const configured = env.WRITEROS_STORY_DRIVE_ROOT?.trim()
  if (configured && path.isAbsolute(configured)) return configured
  return path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'My Scripts')
}

interface Candidate {
  name: string
  /** <search root>/<name>/wayfinder as discovered, before canonicalising. */
  wayfinderPath: string
  canonicalPath: string
}

async function lstatIfPresent(target: string) {
  try {
    return await lstat(target)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * A Story-drive folder WriterOS can link: a real `wayfinder/` holding a real
 * `tickets/` or `resolved/`. Same test appeal delivery applies, so every offered
 * folder can also take appeals.
 */
async function isLinkableWayfinder(wayfinderPath: string): Promise<boolean> {
  const info = await lstatIfPresent(wayfinderPath)
  if (!info || info.isSymbolicLink() || !info.isDirectory()) return false
  const [tickets, resolved] = await Promise.all([
    lstatIfPresent(path.join(wayfinderPath, 'tickets')),
    lstatIfPresent(path.join(wayfinderPath, 'resolved')),
  ])
  if (!tickets && !resolved) return false
  if (tickets && (tickets.isSymbolicLink() || !tickets.isDirectory())) return false
  if (resolved && (resolved.isSymbolicLink() || !resolved.isDirectory())) return false
  return true
}

async function discover(searchRoot: string): Promise<{ root: SafeExistingPath; candidates: Candidate[] }> {
  const root = await guardExistingPath(searchRoot, 'directory')
  let entries: Dirent[]
  try {
    entries = await readdir(root.path, { withFileTypes: true })
  } catch {
    return { root, candidates: [] }
  }
  const candidates: Candidate[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || !entry.isDirectory()) continue
    const wayfinderPath = path.join(root.path, entry.name, 'wayfinder')
    try {
      if (!await isLinkableWayfinder(wayfinderPath)) continue
      const canonicalPath = await realpath(wayfinderPath)
      if (!isInside(canonicalPath, root.canonicalPath)) continue
      candidates.push({ name: entry.name, wayfinderPath, canonicalPath })
    } catch {
      // An unreadable folder is simply not offered.
    }
  }
  return { root, candidates }
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * The ticket folder a registry entry really points at: `<root>/wayfinder` when
 * that exists (the sync reads it that way), else the root itself. Null when the
 * folder is gone.
 */
async function effectiveRoot(projectsRoot: string, root: string): Promise<string | null> {
  const resolved = path.resolve(projectsRoot, root)
  try {
    const nested = await lstatIfPresent(path.join(resolved, 'wayfinder'))
    if (nested?.isDirectory()) return await realpath(path.join(resolved, 'wayfinder'))
    return await realpath(resolved)
  } catch {
    return null
  }
}

async function ownersByRoot(projectsRoot: string, registry: StoryDriveLinks): Promise<Map<string, string>> {
  const owners = new Map<string, string>()
  for (const [projectId, link] of Object.entries(registry.links)) {
    const effective = await effectiveRoot(projectsRoot, link.root)
    if (effective && !owners.has(effective)) owners.set(effective, projectId)
  }
  return owners
}

function unavailable(error: unknown): BeatSheetSyncStatus {
  return { kind: 'unavailable', ticket: null, message: error instanceof Error ? error.message : String(error) }
}

async function readSavedOutline(
  rootPath: string,
  projectId: string,
  packagePath: string,
): Promise<StoryDriveLinkResponse['outline']> {
  const lock = await acquirePackageWriteLock({ workspaceRoot: rootPath, projectId })
  try {
    const raw = await readFile(path.join(packagePath, 'documents', 'outline.json'), 'utf8')
    return AuthoredDocumentStateSchema(OutlineDocumentContentSchema).parse(JSON.parse(raw))
  } catch (error) {
    console.warn('[story-drive link] could not read the saved outline:', error instanceof Error ? error.message : error)
    return null
  } finally {
    await lock.release()
  }
}

const CANON_FAILED = "WriterOS linked the folder but couldn't bring in its Story-drive canon."

async function runImport(deps: StoryDriveFolderDeps, packagePath: string, root: string): Promise<StoryDriveCanonResult> {
  try {
    await deps.importCanon(packagePath, root)
    return { status: 'imported' }
  } catch (error) {
    console.error('[story-drive link] canon import failed:', error instanceof Error ? error.message : error,
      (error as { stderr?: string } | null)?.stderr ?? '')
    return { status: 'failed', message: CANON_FAILED }
  }
}

const LinkRequestSchema = z.object({ folder: z.string().min(1).max(255) }).strict()

function fail(statusCode: number, code: string, message: string): never {
  throw new ProjectLibraryStoreError(message, statusCode, code)
}

function routeError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'invalid-request', message: 'Link request is invalid.' })
  }
  if (error instanceof ProjectLibraryStoreError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message })
  }
  console.error('Story-drive link route failed:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'story-drive-link-failed', message: 'WriterOS could not link the Story-drive folder.' })
}

export function registerStoryDriveFolderRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
  deps: StoryDriveFolderDeps,
): void {
  const requireSameOrigin = sameOrigin(config)
  const requireSession = authenticated(config)

  function library(): { rootPath: string; store: ProjectLibraryStore } {
    if (!config.enabled || !store || !config.rootPath) fail(503, 'disabled', 'Server project library is disabled.')
    return { rootPath: config.rootPath, store }
  }

  app.get('/api/project-library/story-drive/folders', requireSameOrigin, requireSession, async (_req, res) => {
    try {
      const { rootPath, store: projects } = library()
      let found: Awaited<ReturnType<typeof discover>>
      try {
        found = await discover(deps.searchRoot)
      } catch {
        const body: StoryDriveFoldersResponse = { searchRoot: deps.searchRoot, folders: [] }
        return res.json(body)
      }
      const owners = await ownersByRoot(rootPath, await readStoryDriveLinks(rootPath))
      const titles = new Map<string, string>()
      for (const entry of await projects.listProjects()) {
        if (entry.status === 'ready') titles.set(entry.ref.id, entry.ref.summary.title)
      }
      const folders: StoryDriveFolder[] = found.candidates.map(candidate => {
        const owner = owners.get(candidate.canonicalPath)
        return {
          id: candidate.name,
          name: candidate.name,
          linkedTo: owner ? { projectId: owner, title: titles.get(owner) ?? 'another project' } : null,
        }
      })
      const body: StoryDriveFoldersResponse = { searchRoot: deps.searchRoot, folders }
      res.json(body)
    } catch (error) {
      routeError(res, error)
    }
  })

  app.post('/api/project-library/projects/:projectId/story-drive-link', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const { rootPath, store: projects } = library()
      const projectId = req.params.projectId
      const { folder } = LinkRequestSchema.parse(req.body)
      const packagePath = await projects.resolveProjectPackagePath(projectId)

      let found: Awaited<ReturnType<typeof discover>>
      try {
        found = await discover(deps.searchRoot)
      } catch {
        fail(400, 'unknown-folder', "That Story-drive folder isn't available any more.")
      }
      const candidate = found.candidates.find(entry => entry.name === folder)
      if (!candidate) fail(400, 'unknown-folder', "That Story-drive folder isn't available any more.")
      const selected = await guardExistingPath(candidate.wayfinderPath, 'directory')
      if (!isInside(selected.canonicalPath, found.root.canonicalPath)) {
        fail(400, 'unknown-folder', "That Story-drive folder isn't available any more.")
      }

      const claim = await claimStoryDriveLink(rootPath, projectId, { root: selected.canonicalPath }, {
        isTaken: async registry => (await ownersByRoot(rootPath, registry)).has(selected.canonicalPath),
        beforeWrite: async () => {
          await found.root.verify()
          await selected.verify()
        },
      })
      if (!claim.ok) {
        if (claim.conflict === 'project-linked') fail(409, 'already-linked', 'This project is already linked to a Story-drive folder.')
        fail(409, 'folder-taken', 'That Story-drive folder is already linked to another project.')
      }

      // Sync before the import: the import runs its own sync, which would
      // otherwise take the update and leave this response without the beats.
      let beatSheet: BeatSheetSyncStatus
      let outline: StoryDriveLinkResponse['outline'] = null
      try {
        const synced = await syncBeatSheet({ workspaceRoot: rootPath, packagePath, projectId, timeoutMs: 10_000 })
        beatSheet = synced.status
        outline = synced.outline ?? null
      } catch (error) {
        console.warn('[story-drive link] beat sheet sync failed:', error instanceof Error ? error.message : error)
        beatSheet = unavailable(error)
      }
      const canon = await runImport(deps, packagePath, selected.canonicalPath)
      // Another tab may have synced first and taken the update; send the saved
      // beats whenever there are any, so this tab never stays empty.
      if (beatSheet.kind === 'updated' || beatSheet.kind === 'unchanged') {
        outline = await readSavedOutline(rootPath, projectId, packagePath) ?? outline
      }
      const body: StoryDriveLinkResponse = {
        link: { folderName: candidate.name },
        beatSheet,
        outline,
        canon,
        morganOpen: deps.isMorganOpen?.(projectId) ?? false,
      }
      res.json(body)
    } catch (error) {
      routeError(res, error)
    }
  })

  app.post('/api/project-library/projects/:projectId/story-drive-link/import-canon', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const { rootPath, store: projects } = library()
      const projectId = req.params.projectId
      const packagePath = await projects.resolveProjectPackagePath(projectId)
      const link = (await readStoryDriveLinks(rootPath)).links[projectId]
      if (!link) fail(409, 'not-linked', "This project isn't linked to a Story-drive folder.")
      const canon = await runImport(deps, packagePath, path.resolve(rootPath, link.root))
      res.json({ canon })
    } catch (error) {
      routeError(res, error)
    }
  })
}
