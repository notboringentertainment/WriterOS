// server/morganHost/morganRoutes.ts
import type { Express, Request, Response } from 'express'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { WRITEROS_PROJECT_ID_PATTERN } from '../../shared/projectLibraryApi'
import type { ProjectLibraryConfig } from '../projectLibrary/config'
import { authenticated, sameOrigin } from '../projectLibrary/security'
import type { ProjectLibraryStore } from '../projectLibrary/store'
import { readStoryDriveLinks } from '../projectLibrary/storyDriveLinks'
import { preflight, realDeps } from './claudeCli'
import { buildMorganLaunch, defaultReadRoots, morganEnv, morganModel, ISOLATION_ARGS, PERMISSION_MODE, CLAUDE_MEM_DIR } from './launchArgs'
import { sweepStaleSockets } from './liveChannel'
import { ownedFile, stopProcesses, killOwnedNow } from './ownership'
import { MorganSessions } from './morganSession'
import { validateProposal } from './proposals'
import { spawnWithPty } from './ptyProcess'
import { writerosRoot } from './repoRoot'
import { fileSessionStore } from './sessionStore'
import { loginShellPath } from './shellPath'

export function morganHostEnabled(env: Record<string, string | undefined>): boolean {
  return env.WRITEROS_MORGAN_HOST === '1'
}


const StartSchema = z.object({ fresh: z.boolean().optional() }).default({})
const SubmitSchema = z.object({
  text: z.string().min(1).max(20000),
  context: z.object({ surface: z.string().max(60).optional(), title: z.string().max(200).optional() }).optional(),
})
const StopSchema = z.object({ turnId: z.string().min(1).max(200) })
const ApprovalSchema = z.object({ allow: z.boolean(), note: z.string().max(1000).optional() })
const ProposalAnswerSchema = z.object({ outcome: z.enum(['kept', 'dismissed', 'stale']), note: z.string().max(1000).optional() })

function projectId(req: Request, res: Response): string | null {
  const id = req.params.projectId
  if (!WRITEROS_PROJECT_ID_PATTERN.test(id)) {
    res.status(400).json({ error: 'bad-project', message: 'Project id is not valid.' })
    return null
  }
  return id
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

export function withContext(text: string, context?: { surface?: string }): string {
  const surface = context?.surface?.replace(/[\[\]\n]/g, '').trim()
  return surface ? `[WriterOS: Ben is on the ${surface} page]\n${text}` : text
}

export function registerMorganRoutes(app: Express, config: ProjectLibraryConfig, sessions: MorganSessions): void {
  const guard = [sameOrigin(config, 'Morgan'), authenticated(config, 'Morgan')]

  app.post('/api/morgan/:projectId/session', ...guard, async (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = StartSchema.safeParse(req.body ?? {})
    if (!body.success) return res.status(400).json({ error: 'bad-start', message: 'fresh must be true or false.' })
    try {
      res.json(await sessions.start(id, { fresh: body.data.fresh === true }))
    } catch (error) {
      const code = errorCode(error)
      const status = code === 'not-found' ? 404 : code === 'claude-unavailable' ? 503 : 500
      res.status(status).json({ error: code ?? 'start-failed', message: (error as Error).message })
    }
  })

  // Read by the browser with fetch (not EventSource) so the normal session header is sent.
  app.get('/api/morgan/:projectId/stream', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    if (!sessions.canStream(id)) return res.status(404).json({ error: 'no-session', message: 'Morgan is not running for this project.' })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    let open = true
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000)
    const finish = () => { if (!open) return; open = false; clearInterval(keepAlive); unsubscribe(); res.end() }
    // `ended` is the last event of a session (live or replayed): deliver it, then close the stream.
    const unsubscribe = sessions.subscribe(id, e => {
      if (!open) return
      res.write(`data: ${JSON.stringify(e)}\n\n`)
      if (e.type === 'ended') queueMicrotask(finish)
    })
    req.on('close', finish)
  })

  app.post('/api/morgan/:projectId/submit', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = SubmitSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-text', message: 'Message must be 1 to 20000 characters.' })
    try {
      res.json({ composerId: sessions.submit(id, withContext(body.data.text, body.data.context)) })
    } catch (error) {
      res.status(409).json({ error: 'no-session', message: (error as Error).message })
    }
  })

  app.post('/api/morgan/:projectId/approval/:requestId', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = ApprovalSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-answer', message: 'allow must be true or false.' })
    const answer = { allow: body.data.allow, ...(body.data.note ? { note: body.data.note } : {}) }
    if (!sessions.answerApproval(id, String(req.params.requestId), answer)) return res.status(404).json({ error: 'not-open', message: 'That request is no longer waiting.' })
    res.status(204).end()
  })

  app.post('/api/morgan/:projectId/proposal/:proposalId', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = ProposalAnswerSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-outcome', message: 'outcome must be kept, dismissed or stale.' })
    const outcome = { outcome: body.data.outcome, ...(body.data.note ? { note: body.data.note } : {}) }
    if (!sessions.answerProposal(id, String(req.params.proposalId), outcome)) return res.status(404).json({ error: 'not-open', message: 'That change is no longer waiting.' })
    res.status(204).end()
  })

  app.post('/api/morgan/:projectId/stop', ...guard, (req, res) => {
    const id = projectId(req, res); if (!id) return
    const body = StopSchema.safeParse(req.body)
    if (!body.success) return res.status(400).json({ error: 'bad-turn', message: 'turnId is required.' })
    sessions.stop(id, body.data.turnId)
    res.status(204).end()
  })

  app.delete('/api/morgan/:projectId/session', ...guard, async (req, res) => {
    const id = projectId(req, res); if (!id) return
    try { await sessions.end(id); res.status(204).end() }
    catch (error) { res.status(500).json({ error: 'end-failed', message: (error as Error).message }) }
  })
}

// Production wiring. Preflight runs on the first start, not at server boot, so a missing or old
// Claude Code shows as a 503 message in Morgan's screen instead of stopping WriterOS.
export function createMorganHost(
  config: ProjectLibraryConfig & { rootPath: string },
  store: ProjectLibraryStore,
  env: Record<string, string | undefined>,
): { sessions: MorganSessions; killAllNow(): void } {
  const root = writerosRoot()
  const port = env.PORT || '5000'
  const runDir = path.join(os.homedir(), '.writeros', 'run', port)
  mkdirSync(runDir, { recursive: true, mode: 0o700 })
  chmodSync(runDir, 0o700)
  const ownership = ownedFile(runDir)
  const ready = (async () => {
    await sweepStaleSockets(runDir);
    const list = await ownership.all();
    const survivors = await stopProcesses(list);
    await ownership.remove(list.filter(p => !survivors.includes(p.pid)));
    if (survivors.length) console.error('[morgan] old processes did not stop; retained in owned.json');
  })();
  // Attach a handler at boot; start() still sees and rejects a failed sweep.
  void ready.catch(error => console.error('[morgan] boot sweep failed', error));

  const loginPath = loginShellPath(env.PATH, (shell, args) => execFileSync(shell, args, { encoding: 'utf8' }))
  const baseEnv = morganEnv(env, loginPath)
  const configured = (env.MORGAN_READ_DIRS ?? '').split(':').filter(d => path.isAbsolute(d))
  const readRoots = (configured.length > 0 ? configured : defaultReadRoots(os.homedir(), env.MORGAN_CLAUDE_MEM_DIR ?? CLAUDE_MEM_DIR)).filter(d => existsSync(d))
  const host = {
    writerosRoot: root,
    modDir: path.join(root, 'mod', 'writeros-morgan'),
    personaFile: path.join(root, 'server', 'morganHost', 'persona.md'),
    readRoots,
  }

  // A success is cached; a failure is not, so Ben can fix Claude Code and click Start again.
  let checked: Promise<string> | null = null
  const claudePath = (signal: AbortSignal) => {
    if (checked) return checked
    const attempt = preflight(realDeps(baseEnv, ISOLATION_ARGS, signal)).then(result => {
      if (!result.ok) throw Object.assign(new Error(result.message), { code: 'claude-unavailable' })
      return result.path
    })
    checked = attempt
    attempt.catch(() => { if (checked === attempt) checked = null })
    return attempt
  }

  const sessions = new MorganSessions({
    spawnChild: spawnWithPty,
    claudePath,
    runDir,
    port,
    store: fileSessionStore(path.join(os.homedir(), '.writeros', 'morgan', port)),
    validateProposal,
    ownership,
    ready,
    resolveProject: async projectId => {
      let packagePath: string
      try { packagePath = await store.resolveProjectPackagePath(projectId) }
      catch (error) { throw Object.assign(new Error('That project is not in the WriterOS library.'), { code: 'not-found', cause: error }) }
      const links = await readStoryDriveLinks(config.rootPath)
      return { packagePath, storyDriveRoot: links.links[projectId]?.root ? path.resolve(config.rootPath, links.links[projectId].root) : null }
    },
    launchFor: (project, channel, session) => buildMorganLaunch({
      project, host, model: morganModel(env), session,
      socketPath: channel.socketPath, token: channel.token,
      parentEnv: env, loginPath, isolationArgs: ISOLATION_ARGS, permissionMode: PERMISSION_MODE,
    }),
  })
  return { sessions, killAllNow: () => killOwnedNow(runDir) }
}


