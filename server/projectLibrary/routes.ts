import type { Express, Response } from 'express'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isVoiceProfileDocument } from '../../client/src/lib/voiceProfile'
import { z } from 'zod'
import { PageDocumentSchema, PageNameSchema } from '../../shared/pages'
import { migrateState } from '../../client/src/lib/projectState'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import { serializeWriterOSProjectPackage } from '../../client/src/lib/projectPackage'
import { LookbookDocumentSchema } from '../../shared/lookbook'
import { LooksDocumentSchema } from '../../shared/looks'
import { SaveProjectRequestSchema } from '../../shared/projectLibraryApi'
import type { ProjectLibraryConfig } from './config'
import { authenticated, sameOrigin } from './security'
import {
  ProjectLibraryStoreError,
  type ProjectLibraryStore,
} from './store'
import { keepServerOwnedBeatFields, refreshBeatSheetOnOpen } from './beatSheetRoutes'
import { observeWriterOSSave } from '../projectMemory/writerOSObserver'
import { morganHostEnabled } from '../morganHost/morganRoutes'

function dataStore(config: ProjectLibraryConfig, store: ProjectLibraryStore | null): ProjectLibraryStore {
  if (!config.enabled || !store) {
    throw new ProjectLibraryStoreError('Server project library is disabled.', 503, 'disabled')
  }
  return store
}

function routeError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'invalid-request', message: 'Project request is invalid.' })
  }
  if (error instanceof ProjectLibraryStoreError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message })
  }
  console.error('Project library route failed:', error instanceof Error ? error.message : error)
  return res.status(500).json({ error: 'project-library-failed', message: 'WriterOS could not access the project library.' })
}

export function registerProjectLibraryRoutes(
  app: Express,
  config: ProjectLibraryConfig,
  store: ProjectLibraryStore | null,
): void {
  const requireSameOrigin = sameOrigin(config)
  const requireSession = authenticated(config)

  app.get('/api/projects/:projectId/pages/:page', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const name = PageNameSchema.parse(req.params.page)
      const activeStore = dataStore(config, store)
      if (!activeStore.readPage) throw new Error('Page storage unavailable')
      return res.json({ page: await activeStore.readPage(req.params.projectId, name) })
    } catch (error) { return routeError(res, error) }
  })
  app.put('/api/projects/:projectId/pages/:page', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const name = PageNameSchema.parse(req.params.page)
      const data = z.object({ expectedRevision: z.number().int().nonnegative(), page: PageDocumentSchema }).parse(req.body)
      if (data.page.page !== name) return res.status(400).json({ message: 'The page name does not match.' })
      const activeStore = dataStore(config, store)
      if (!activeStore.writePage) throw new Error('Page storage unavailable')
      const result = await activeStore.writePage(req.params.projectId, data.page, data.expectedRevision)
      if (result.stale) return res.status(409).json({ error: 'stale-page', message: 'This page has changed. Read the latest version before trying again.', currentPage: result.page })
      return res.json({ page: result.page })
    } catch (error) { return routeError(res, error) }
  })

  const voicePath = () => {
    dataStore(config, store)
    if (!config.rootPath) throw new ProjectLibraryStoreError('Project library is disabled.', 503, 'disabled')
    return path.join(config.rootPath, '.writeros-writer', 'voice-profile.json')
  }
  app.get('/api/project-library/voice-profile', requireSameOrigin, requireSession, async (_req, res) => {
    // Registered before the library-wide no-store below, so it sets its own.
    res.setHeader('Cache-Control', 'no-store')
    try {
      const filename = voicePath()
      let profile: unknown = null
      try { profile = JSON.parse(await readFile(filename, 'utf8')) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (profile && typeof profile === 'object' && 'profile' in profile && profile.profile === null &&
        'clearedAt' in profile && typeof profile.clearedAt === 'string') {
        return res.json({ profile: null, clearedAt: profile.clearedAt })
      }
      if (profile !== null && !isVoiceProfileDocument(profile)) throw new Error('Invalid voice profile')
      return res.json({ profile })
    } catch (error) { return routeError(res, error) }
  })
  // One voice-profile write at a time, so the newer-than check and the write can't interleave.
  let voiceWrites: Promise<unknown> = Promise.resolve()
  app.put('/api/project-library/voice-profile', requireSameOrigin, requireSession, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const turn = voiceWrites.then(() => writeVoiceProfile(req.body?.profile))
    voiceWrites = turn.catch(() => undefined)
    try {
      const result = await turn
      if (result === 'invalid') return res.status(400).json({ message: 'Voice profile is incomplete.' })
      if (result === 'stale') return res.status(409).json({ error: 'stale', message: 'A newer voice profile is already saved.' })
      return res.json({ ok: true })
    } catch (error) { return routeError(res, error) }
  })
  async function writeVoiceProfile(profile: unknown): Promise<'ok' | 'invalid' | 'stale'> {
    const filename = voicePath()
    if (profile !== null && !isVoiceProfileDocument(profile)) return 'invalid'
    // A second tab's late save must not replace a newer profile or undo a later clear.
    if (profile !== null) {
      let stored: unknown = null
      try { stored = JSON.parse(await readFile(filename, 'utf8')) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const storedAt = isVoiceProfileDocument(stored) ? stored.updatedAt
        : stored && typeof stored === 'object' && 'clearedAt' in stored && typeof stored.clearedAt === 'string' ? stored.clearedAt
        : null
      if (storedAt !== null && Date.parse(profile.updatedAt) < Date.parse(storedAt)) return 'stale'
    }
    await mkdir(path.dirname(filename), { recursive: true })
    const temporary = filename + '.' + randomUUID() + '.tmp'
    await writeFile(temporary, JSON.stringify(profile === null
      ? { profile: null, clearedAt: new Date().toISOString() } : profile, null, 2), { mode: 0o600 })
    await rename(temporary, filename)
    return 'ok'
  }

  app.use('/api/project-library', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.get('/api/project-library/bootstrap', requireSameOrigin, (_req, res) => {
    if (!config.enabled || !config.label) {
      return res.json({ enabled: false, morganHost: false })
    }
    return res.json({
      enabled: true,
      label: config.label,
      sessionToken: config.sessionToken,
      morganHost: morganHostEnabled(process.env) && Boolean(config.rootPath),
    })
  })

  app.get('/api/project-library/projects', requireSameOrigin, requireSession, async (_req, res) => {
    try {
      const entries = await dataStore(config, store).listProjects()
      return res.json({ entries })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.get('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const activeStore = dataStore(config, store)
      const beatSheet = await refreshBeatSheetOnOpen(config, activeStore, req.params.projectId)
      const result = await activeStore.readProject(req.params.projectId)
      return res.json({ result, beatSheet })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.delete('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const result = await dataStore(config, store).removeProject(req.params.projectId)
      return res.json({ ok: true, alreadyMissing: result.alreadyMissing })
    } catch (error) {
      return routeError(res, error)
    }
  })

  app.put('/api/project-library/projects/:projectId', requireSameOrigin, requireSession, async (req, res) => {
    try {
      const data = SaveProjectRequestSchema.parse(req.body)
      if (req.params.projectId !== data.project.id) {
        throw new ProjectLibraryStoreError('URL project id must match request project id.', 400, 'id-mismatch')
      }
      // migrateState drops an invalid Lookbook from state; refuse the save so a
      // damaged payload can never be mistaken for "no Lookbook" and touch disk.
      const rawLookbook = (data.project.state as { documents?: { lookbook?: unknown } } | undefined)?.documents?.lookbook
      if (rawLookbook !== undefined && !LookbookDocumentSchema.safeParse(rawLookbook).success) {
        return res.status(400).json({
          error: 'invalid-lookbook',
          message: 'The Lookbook in this save is not valid; nothing was written.',
        })
      }
      // Same rule for look drafts (documents/looks.json).
      const rawLooks = (data.project.state as { documents?: { looks?: unknown } } | undefined)?.documents?.looks
      if (rawLooks !== undefined && !LooksDocumentSchema.safeParse(rawLooks).success) {
        return res.status(400).json({
          error: 'invalid-looks',
          message: 'The look drafts in this save are not valid; nothing was written.',
        })
      }
      const project: StoredProject = {
        ...data.project,
        state: migrateState(data.project.state),
      }
      const activeStore = dataStore(config, store)

      // Best-effort "before" snapshot for the WriterOS memory observer. A new
      // project (or a read failure) simply means there is nothing prior to
      // diff against — it must never block or fail the save itself.
      let priorFiles: Record<string, string | undefined> | null = null
      let priorProject: StoredProject | null = null
      try {
        const priorRead = await activeStore.readProject(project.id)
        if (priorRead.ok) {
          priorProject = priorRead.project
          priorFiles = activeStore.readPackageSnapshot ? await activeStore.readPackageSnapshot(project.id) : serializeWriterOSProjectPackage(priorRead.project).files
        }
      } catch (error) {
        if (!(error instanceof ProjectLibraryStoreError) || error.code !== 'not-found') {
          console.warn('[project-library] prior read for memory observer failed:', error instanceof Error ? error.message : error)
        }
      }

      // A stale browser copy must not undo a Story-drive beat sync.
      const effective = keepServerOwnedBeatFields(priorProject, project)
      if (effective.replaced) console.info(`[beat-sheet] kept on-disk beats for ${project.id}`)

      const ref = await activeStore.writeProject(effective.project)

      // Diff + queue happens after the save succeeds but before the response
      // returns; the LLM analysis itself runs afterwards in the background
      // and can never fail this save (see server/projectMemory/writerOSObserver.ts).
      // Only edits to an already-existing package are diffed — the empty
      // scaffold produced at project creation has nothing prior to compare
      // against and nothing worth analyzing yet.
      if (priorFiles !== null) {
        try {
          const currentFiles = activeStore.readPackageSnapshot ? await activeStore.readPackageSnapshot(project.id) : serializeWriterOSProjectPackage(effective.project).files
          const projectPath = await activeStore.resolveProjectPackagePath(project.id)
          await observeWriterOSSave({ projectId: project.id, projectPath, priorFiles, currentFiles })
        } catch (error) {
          console.warn('[project-library] WriterOS memory observer failed:', error instanceof Error ? error.message : error)
        }
      }

      return res.json({ ref })
    } catch (error) {
      return routeError(res, error)
    }
  })
}
