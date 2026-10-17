// server/morganHost/morganSession.ts
// One hosted Morgan session per project. A start is reserved synchronously (single-flight, cancellable).
// Every way a session ends goes through finish(): answer open cards and proposals, stop the process group,
// stop verified owned processes (Bash tools), close the channel, emit `ended` last, always settle `done`.
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { LiveChannel, type LiveSink } from './liveChannel'
import type { MorganLaunch, MorganProjectPaths } from './launchArgs'
import type { ChildProcessLike, SpawnChild } from './ptyProcess'
import { descendantsOf, processInfo, stopProcesses, ownedFile, type OwnedRegistry, type ProcInfo } from './ownership'
import type { SessionStore } from './sessionStore'
import type { ApprovalCard, MorganScreenEvent, PageProposal, PermissionAnswer, ProposalOutcome } from '../../shared/morganLive'

export function normalizeTrustScreen(buffer: string): string {
  return buffer.replace(/\x1b\[\d*[GC]/g, ' ').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

/** Which trust option the cursor is on, judged from the latest redraw; null when no cursor line is visible yet. */
export function trustCursor(buffer: string): 'yes' | 'no' | null {
  const screen = normalizeTrustScreen(buffer)
  const yes = screen.search(/❯\s*Yes, I trust this folder(?![\s\S]*❯)/)
  const no = screen.search(/❯\s*No, exit(?![\s\S]*❯)/)
  if (yes >= 0) return 'yes'
  if (no >= 0) return 'no'
  return null
}

export function detectTrustScreen(buffer: string): boolean {
  const normalized = normalizeTrustScreen(buffer)
  return /trust (?:this|the) (?:folder|directory)|Yes, I trust this folder|Quick safety check:[\s\S]*project you created or one you trust/i.test(normalized)
    || /quicksafetycheck|yes,?itrustthisfolder/i.test(normalized.replace(/\s/g, ''))
}

export interface MorganSessionDeps {
  spawnChild: SpawnChild
  claudePath(signal: AbortSignal): Promise<string>
  runDir: string
  port: string
  store: SessionStore
  resolveProject(projectId: string): Promise<MorganProjectPaths>
  launchFor(project: MorganProjectPaths, channel: { socketPath: string; token: string }, session: { kind: 'new' | 'resume'; id: string }): MorganLaunch
  validateProposal?(proposal: PageProposal, project: MorganProjectPaths): string | null // Task 6 wires proposals.ts; null = valid
  ownership?: OwnedRegistry
  ready?: Promise<void>                                         // production: the boot sweep; no start runs before it settles
  afterTurn?(projectId: string, project: MorganProjectPaths): Promise<string | null> // after each finished turn; a summary means the project changed on disk
  startTimeoutMs?: number
  maxHistory?: number
}

const START_FAILED = 'Morgan could not start. Claude Code may be waiting on a one-time question (for example whether to trust this folder). Open Terminal, go to the project folder, run `claude`, answer it, quit, then click Start Morgan again.'
const RESUME_FAILED = 'Morgan could not pick up the last conversation. Click Start Morgan to begin a new one.'
const STUCK = 'Morgan\'s last process did not stop. Restart WriterOS before starting Morgan again for this project.'

class Cancelled extends Error { constructor() { super('Morgan\'s start was cancelled.') } }

interface Pending { cancelled: boolean; abort: AbortController; promise: Promise<{ sessionId: string }> }

function duringStart<T>(pending: Pending, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Cancelled())
    if (pending.abort.signal.aborted) return cancel()
    pending.abort.signal.addEventListener('abort', cancel, { once: true })
    promise.then(resolve, reject).finally(() => pending.abort.signal.removeEventListener('abort', cancel))
  })
}
interface OpenApproval { card: ApprovalCard; resolve(a: PermissionAnswer): void }
interface OpenProposal { proposal: PageProposal; resolve(o: ProposalOutcome): void }

interface Live {
  sessionId: string
  storeKey: string
  resumed: boolean
  child: ChildProcessLike
  channel: LiveChannel
  hello: MorganScreenEvent | null
  history: MorganScreenEvent[]
  truncated: boolean
  approvals: Map<string, OpenApproval>
  proposals: Map<string, OpenProposal>
  listeners: Set<(e: MorganScreenEvent) => void>
  ending: 'stopped' | 'server-shutdown' | 'start-failed' | null
  stopping: boolean
  endMessage?: string
  finishing: Promise<void> | null
  done: Promise<void>
  markDone: () => void
  startTimer: ReturnType<typeof setTimeout> | null
  refresh: Promise<void>
  afterTurn: Promise<void>
  trustBuffer: string
  trustAsked: boolean
  owned: Map<number, ProcInfo>                 // descendants seen while the leader was alive (refreshed every 2 s and before any stop)
  watch: ReturnType<typeof setInterval> | null
  persisting: Promise<unknown>                 // remembering the session id; awaited before `done`
}

function log(step: string, error: unknown): void { console.error(`[morgan] ${step} failed`, error) }

export class MorganSessions {
  private live = new Map<string, Live>()
  private starting = new Map<string, Pending>()
  private ending = new Map<string, Promise<void>>()
  private finished = new Map<string, MorganScreenEvent[]>()
  private stuck = new Set<string>()
  private abort = new AbortController()
  private closed = false

  private readonly registry: OwnedRegistry
  constructor(private readonly deps: MorganSessionDeps) { this.registry = deps.ownership ?? ownedFile(deps.runDir) }

  private refreshOwned(s: Live): Promise<void> {
    const refresh = async () => {
      const root = await processInfo(s.child.pid)
      if (root && (!s.owned.has(root.pid) || s.owned.get(root.pid)!.started === root.started)) {
        s.owned.set(root.pid, root)
        for (const p of await descendantsOf(root.pid)) s.owned.set(p.pid, p)
      }
      await this.registry.add([...s.owned.values()])
    }
    s.refresh = s.refresh.then(refresh, refresh)
    return s.refresh
  }

  has(projectId: string): boolean { return this.live.has(projectId) }
  canStream(projectId: string): boolean { return this.live.has(projectId) || this.finished.has(projectId) }

  start(projectId: string, opts: { fresh?: boolean } = {}): Promise<{ sessionId: string; existing: boolean }> {
    if (this.closed) return Promise.reject(new Cancelled())
    if (this.stuck.has(projectId)) return Promise.reject(new Error(STUCK))
    const pending = this.starting.get(projectId)
    if (pending) return pending.promise.then(r => ({ ...r, existing: true }))
    const running = this.live.get(projectId)
    if (running && !running.finishing && !this.ending.has(projectId)) return Promise.resolve({ sessionId: running.sessionId, existing: true })
    const next: Pending = { cancelled: false, abort: new AbortController(), promise: undefined as never }
    const previousEnding = this.ending.get(projectId)
    next.promise = (async () => {
      await duringStart(next, this.deps.ready ?? Promise.resolve())   // the boot sweep must not run over a new session
      await duringStart(next, previousEnding ?? Promise.resolve())
      await this.live.get(projectId)?.done
      if (this.stuck.has(projectId)) throw new Error(STUCK)
      return this.spawn(projectId, next, opts.fresh === true)
    })().finally(() => { if (this.starting.get(projectId) === next) this.starting.delete(projectId) })
    this.starting.set(projectId, next)
    return next.promise.then(r => ({ ...r, existing: false }))
  }

  private emitTo(s: Live, e: MorganScreenEvent): void {
    if (e.type === 'hello') {
      s.hello = e; s.history = []; s.truncated = false
      if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null }
    } else if (e.type !== 'approval' && e.type !== 'proposal') { // open items live in their own maps, never trimmed
      s.history.push(e)
      const max = this.deps.maxHistory ?? 5000
      if (s.history.length > max) { s.history.splice(0, s.history.length - max); s.truncated = true }
    }
    for (const l of s.listeners) { try { l(e) } catch (error) { log('listener', error) } }
  }

  private async spawn(projectId: string, pending: Pending, fresh: boolean): Promise<{ sessionId: string }> {
    const check = () => { if (pending.cancelled || this.closed) throw new Cancelled() }
    check()
    const project = await duringStart(pending, this.deps.resolveProject(projectId))
    check()
    const claude = await duringStart(pending, this.deps.claudePath(this.abort.signal))
    check()
    // A remembered conversation belongs to the folder it ran in: relinking the project to another
    // Story-drive folder (or another package) starts fresh instead of resuming into the old folder.
    const storeKey = `${projectId}\n${project.storyDriveRoot ?? project.packagePath}`
    const remembered = fresh ? null : await duringStart(pending, this.deps.store.get(storeKey).catch(() => null))
    check()

    const session = remembered ? { kind: 'resume' as const, id: remembered } : { kind: 'new' as const, id: randomUUID() }
    let live: Live | null = null
    const emit = (e: MorganScreenEvent) => { if (live) this.emitTo(live, e) }
    const sink: LiveSink = {
      hello: hello => {
        emit({ type: 'hello', hello })
        const s = live
        if (s) {
          if (s.resumed) emit({ type: 'resumed', ok: true })
          s.persisting = this.deps.store.set(s.storeKey, hello.sessionId ?? s.sessionId).catch(error => log('remember session', error))
        }
      },
      events: (epoch, events) => {
        emit({ type: 'events', epoch, events })
        const turnEnded = events.some(e => e.kind === 'turn' && e.phase === 'complete' && e.agentId === undefined)
        const s = live
        if (!turnEnded || !s || !this.deps.afterTurn) return
        // One sync at a time per session, in turn order.
        s.afterTurn = s.afterTurn.then(async () => {
          const summary = await this.deps.afterTurn!(projectId, project)
          if (summary) emit({ type: 'project-changed', summary })
        }).catch(error => log('after turn', error))
      },
      lost: (epoch, reason) => {
        // Folder trust can wait for the writer longer than the channel's hello deadline.
        if (reason === 'no-hello' && live?.approvals.has('folder-trust')) return
        emit({ type: 'lost', epoch, reason })
      },
      composer: update => emit({ type: 'composer', update }),
      recovered: epoch => emit({ type: 'recovered', epoch }),
    }
    const channel = await LiveChannel.create({
      runDir: this.deps.runDir,
      now: () => Date.now(),
      setTimer: (fn, ms) => { const t = setTimeout(fn, ms); return { cancel: () => clearTimeout(t) } },
      sink,
      onPermission: ask => new Promise<PermissionAnswer>(resolve => {
        const s = live
        if (!s || s.finishing || s.ending) return resolve({ allow: false, note: 'the session is ending' })
        const card: ApprovalCard = { requestId: ask.requestId, tool: ask.tool, summary: ask.summary, input: ask.input }
        s.approvals.set(ask.requestId, { card, resolve })
        emit({ type: 'approval', card })
      }),
      onAbandon: (kind, id) => {
        if (kind === 'permission') this.answerApproval(projectId, id, { allow: false, note: 'Morgan stopped waiting' })
        else this.answerProposal(projectId, id, { outcome: 'dismissed', note: 'Morgan stopped waiting' })
      },
      onProposal: ask => new Promise<ProposalOutcome>(resolve => {
        const s = live
        if (!s || s.finishing || s.ending) return resolve({ outcome: 'session-ended' })
        const problem = this.deps.validateProposal?.(ask.proposal, project) ?? null
        if (problem) return resolve({ outcome: 'invalid', message: problem })
        s.proposals.set(ask.proposalId, { proposal: ask.proposal, resolve })
        emit({ type: 'proposal', proposalId: ask.proposalId, proposal: ask.proposal })
      }),
    })
    if (!(channel instanceof LiveChannel)) throw new Error(`Morgan's channel could not open (${channel.unavailable}).`)

    let child: ChildProcessLike
    try {
      check()
      const launch = this.deps.launchFor(project, { socketPath: channel.socketPath, token: channel.token }, session)
      child = this.deps.spawnChild(claude, launch.args, { cwd: launch.cwd, env: launch.env })
    } catch (error) {
      await channel.close().catch(e => log('channel close', e))
      throw error
    }

    let markDone!: () => void
    const s: Live = {
      sessionId: session.id, storeKey, resumed: session.kind === 'resume', child, channel,
      hello: null, history: [], truncated: false, approvals: new Map(), proposals: new Map(), listeners: new Set(),
      ending: null, stopping: false, finishing: null, done: new Promise<void>(r => { markDone = r }), markDone: () => markDone(), startTimer: null,
      refresh: Promise.resolve(), afterTurn: Promise.resolve(), trustBuffer: '', trustAsked: false, owned: new Map(), watch: null, persisting: Promise.resolve(),
    }
    live = s
    s.watch = setInterval(() => { void this.refreshOwned(s).catch(error => log('ownership refresh', error)) }, 2000)
    this.finished.delete(projectId)
    this.live.set(projectId, s)
    child.onExit(code => { void this.finish(projectId, s, code) })
    s.startTimer = setTimeout(() => {
      s.ending ??= 'start-failed'
      void this.stopSession(projectId, s)
    }, this.deps.startTimeoutMs ?? 10000)
    let waitingForTrustFolder = false;
    // After the writer allows the folder: Enter is pressed only once the screen shows the cursor on
    // "Yes, I trust this folder". An early Down can be dropped while the menu starts, and Enter on
    // "No, exit" ends the session.
    let confirmingTrust: { screen: string; downs: number; timer: ReturnType<typeof setInterval> | null } | null = null;
    const confirmTrust = () => {
      if (!confirmingTrust) return;
      if (confirmingTrust.timer) clearInterval(confirmingTrust.timer);
      confirmingTrust = null;
      if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null; }
      if (s.hello || s.finishing || s.ending) return;
      child.write('\r');
      s.trustBuffer = '';
      s.trustAsked = false;
      s.startTimer = setTimeout(() => { s.ending ??= 'start-failed'; void this.stopSession(projectId, s) }, this.deps.startTimeoutMs ?? 10000);
    };
    const MAX_TRUST_DOWNS = 6;
    const decideTrust = (waitForFolder = true) => {
      if (s.hello || s.trustAsked || s.finishing || s.ending) return;
      if (!detectTrustScreen(s.trustBuffer)) return;
      const requestId = 'folder-trust';
      const lines = normalizeTrustScreen(s.trustBuffer).split(/[\r\n]+/);
      if (waitForFolder) lines.pop();
      const folders = lines
        .map(line => line.trim().replace(/^[│┃]\s*|\s*[│┃]$/g, '').trim())
        .filter(line => path.isAbsolute(line));
      const folder = folders.length === 1 ? folders[0] : null;
      if (folder === null && waitForFolder) {
        if (!waitingForTrustFolder) {
          waitingForTrustFolder = true;
          if (s.startTimer) clearTimeout(s.startTimer);
          s.startTimer = setTimeout(() => decideTrust(false), 2000);
        }
        return;
      }
      waitingForTrustFolder = false;
      s.trustAsked = true;
      if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null; }
      const ownFolder = folder !== null && [project.packagePath, project.storyDriveRoot]
        .some(own => {
          try { return own !== null && realpathSync(own) === realpathSync(folder); }
          catch { return false; }
        });
      const card: ApprovalCard = { requestId, tool: 'FolderTrust', summary: folder
        ? `Let Morgan work in ${folder}? Claude Code asks this once per folder.`
        : 'Claude Code is asking to trust a folder. WriterOS could not identify which folder.', input: JSON.stringify({ folder }) };
      const resolveTrust = (answer: PermissionAnswer) => {
        if (answer.allow) {
          if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null; }
          confirmingTrust = { screen: s.trustBuffer, downs: 1, timer: null };
          child.write('\x1b[B');
          confirmingTrust.timer = setInterval(() => {
            const pending = confirmingTrust;
            if (!pending) return;
            if (s.finishing || s.ending) { if (pending.timer) clearInterval(pending.timer); confirmingTrust = null; return; }
            if (trustCursor(pending.screen) === 'yes') { confirmTrust(); return; }
            if (pending.downs >= MAX_TRUST_DOWNS) {
              if (pending.timer) clearInterval(pending.timer);
              confirmingTrust = null;
              s.endMessage = "Morgan couldn't get past Claude Code's folder question. Start Morgan again.";
              s.ending ??= 'start-failed';
              void this.stopSession(projectId, s);
              return;
            }
            // Still on "No, exit" (or not drawn yet): the Down was dropped, so send it again.
            if (trustCursor(pending.screen) !== 'yes') { pending.downs += 1; child.write('\x1b[B'); }
          }, 500);
        } else {
          s.endMessage = 'Morgan needs your OK to work in this folder.';
          s.ending ??= 'stopped';
          void this.stopSession(projectId, s);
        }
      };
      if (ownFolder) { resolveTrust({ allow: true }); return; }
      s.approvals.set(requestId, { card, resolve: resolveTrust });
      emit({ type: 'approval', card });
    };
    child.onData(data => {
      if (confirmingTrust) {
        confirmingTrust.screen = (confirmingTrust.screen + data).slice(-8192);
        if (trustCursor(confirmingTrust.screen) === 'yes') confirmTrust();
        return;
      }
      if (s.hello || s.trustAsked || s.finishing || s.ending) return;
      s.trustBuffer = (s.trustBuffer + data).slice(-8192);
      decideTrust();
    });
    try { await this.refreshOwned(s) }
    catch (error) {
      s.refresh = Promise.resolve();
      s.ending = 'start-failed';
      await this.stopSession(projectId, s);
      throw error;
    }
    return { sessionId: s.sessionId }
  }

  answerApproval(projectId: string, requestId: string, answer: PermissionAnswer): boolean {
    const s = this.live.get(projectId)
    const open = s?.approvals.get(requestId)
    if (!s || !open || (s.ending && answer.allow)) return false
    s.approvals.delete(requestId)
    open.resolve(answer)
    this.emitTo(s, { type: 'approval-answered', requestId, allow: answer.allow })
    return true
  }

  answerProposal(projectId: string, proposalId: string, outcome: ProposalOutcome): boolean {
    const s = this.live.get(projectId)
    const open = s?.proposals.get(proposalId)
    if (!s || !open || (s.ending && outcome.outcome !== 'session-ended' && outcome.outcome !== 'dismissed')) return false
    s.proposals.delete(proposalId)
    open.resolve(outcome)
    this.emitTo(s, { type: 'proposal-answered', proposalId, outcome: outcome.outcome })
    return true
  }

  private async stopSession(projectId: string, s: Live): Promise<void> {
    if (s.stopping) return s.done
    s.stopping = true
    s.ending ??= this.closed ? 'server-shutdown' : 'stopped'
    for (const id of [...s.approvals.keys()]) this.answerApproval(projectId, id, { allow: false, note: 'the session ended' })
    for (const id of [...s.proposals.keys()]) this.answerProposal(projectId, id, { outcome: 'session-ended' })
    await this.refreshOwned(s).catch(error => log('ownership refresh', error)) // while the leader is still alive, so detached children are still its descendants
    let gone = false
    try { gone = await s.child.terminate() } catch (error) { log('terminate', error) }
    void this.finish(projectId, s, null, gone)
    await s.done
  }

  private finish(projectId: string, s: Live, code: number | null, groupGone?: boolean): Promise<void> {
    if (s.finishing) return s.finishing
    s.finishing = (async () => {
      try {
        if (s.startTimer) { clearTimeout(s.startTimer); s.startTimer = null }
        for (const [id, open] of s.approvals) { open.resolve({ allow: false, note: 'the session ended' }); this.emitTo(s, { type: 'approval-answered', requestId: id, allow: false }) }
        s.approvals.clear()
        for (const [id, open] of s.proposals) { open.resolve({ outcome: 'session-ended' }); this.emitTo(s, { type: 'proposal-answered', proposalId: id, outcome: 'session-ended' }) }
        s.proposals.clear()
        try { s.channel.ptyExited() } catch (error) { log('settle composer', error) }
        if (s.watch) { clearInterval(s.watch); s.watch = null }
        await this.refreshOwned(s).catch(error => log('ownership refresh', error)) // catches anything still attached; children already re-parented are in `owned` from earlier snapshots
        const descendants = [...s.owned.values()]
        let gone = groupGone ?? false
        if (groupGone === undefined) {
          try { gone = await s.child.terminate() } catch (error) { log('terminate', error); gone = false }
        }
        try {
          const survivors = await stopProcesses(descendants);
          if (survivors.length > 0) gone = false;
          await this.registry.remove(descendants.filter(p => !survivors.includes(p.pid)));
        } catch (error) { log('sweep', error); gone = false }
        try { await s.channel.close() } catch (error) { log('channel close', error) }
        if (!gone) this.stuck.add(projectId)
        const reason = s.ending ?? 'exited'
        const failedResume = s.resumed && !s.hello
        if (failedResume) { try { await this.deps.store.clear(s.storeKey) } catch (error) { log('forget session', error) } }
        const message = !gone ? STUCK : s.endMessage ?? (failedResume ? RESUME_FAILED : reason === 'start-failed' ? START_FAILED : undefined)
        this.emitTo(s, { type: 'ended', reason, code, ...(message ? { message } : {}) })
        this.finished.set(projectId, [...(s.hello ? [s.hello] : []), ...(s.truncated ? [{ type: 'truncated' } as const] : []), ...s.history])
        await s.persisting
      } catch (error) {
        log('finish', error)
      } finally {
        if (this.live.get(projectId) === s) this.live.delete(projectId)
        s.listeners.clear()
        s.markDone()
      }
    })()
    return s.finishing
  }

  subscribe(projectId: string, listener: (e: MorganScreenEvent) => void): () => void {
    const s = this.live.get(projectId)
    if (!s) {
      for (const e of this.finished.get(projectId) ?? []) listener(e)
      return () => {}
    }
    if (s.hello) listener(s.hello)
    if (s.truncated) listener({ type: 'truncated' })
    for (const e of s.history) listener(e)
    for (const open of s.approvals.values()) listener({ type: 'approval', card: open.card })
    for (const [proposalId, open] of s.proposals) listener({ type: 'proposal', proposalId, proposal: open.proposal })
    s.listeners.add(listener)
    return () => { s.listeners.delete(listener) }
  }

  submit(projectId: string, text: string): string {
    const s = this.live.get(projectId)
    if (!s || s.finishing || s.ending) throw new Error('Morgan is not running for this project.')
    return s.channel.submit(text)
  }

  stop(projectId: string, turnId: string): void {
    const s = this.live.get(projectId)
    if (!s) return
    // Stopping the turn answers whatever it was waiting on, so nothing is left hanging.
    for (const id of [...s.approvals.keys()]) this.answerApproval(projectId, id, { allow: false, note: 'the writer stopped this turn' })
    for (const id of [...s.proposals.keys()]) this.answerProposal(projectId, id, { outcome: 'dismissed', note: 'the writer stopped this turn' })
    s.channel.stop(turnId)
  }

  end(projectId: string): Promise<void> {
    const inFlight = this.ending.get(projectId)
    if (inFlight) return inFlight
    const pending = this.starting.get(projectId)
    if (!pending && !this.live.has(projectId)) return Promise.resolve()
    const running = this.live.get(projectId)
    if (running) running.ending ??= this.closed ? 'server-shutdown' : 'stopped'
    const p = (async () => {
      if (pending) { pending.cancelled = true; pending.abort.abort(); await pending.promise.catch(() => {}) }
      const s = this.live.get(projectId)
      if (!s) return
      s.ending ??= this.closed ? 'server-shutdown' : 'stopped'
      await this.stopSession(projectId, s)
    })().finally(() => this.ending.delete(projectId))
    this.ending.set(projectId, p)
    return p
  }

  async shutdown(): Promise<void> {
    this.closed = true
    this.abort.abort()
    const ids = new Set([...this.live.keys(), ...this.starting.keys()])
    await Promise.all([...ids].map(id => this.end(id)))
  }
}
