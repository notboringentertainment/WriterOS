// tests/server/morganHost/morganSession.test.ts
// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MorganSessions, type MorganSessionDeps } from '../../../server/morganHost/morganSession'
import { groupAlive, spawnWithPty, type SpawnChild } from '../../../server/morganHost/ptyProcess'
import type { MorganScreenEvent } from '../../../shared/morganLive'
import { TOKEN_HEADER } from '../../../mod/writeros-morgan/hooks/protocol'
import { rowTemplate } from '../../helpers/morganProtocol'
import { validateProposal } from '../../../server/morganHost/proposals'
import type { OwnedRegistry } from '../../../server/morganHost/ownership'

const fake = path.resolve(__dirname, '../../fakes/fake-claude-morgan.mjs')
const PORT = '9997'
const made: { sessions: MorganSessions; runDir: string; pids: number[] }[] = []

function memoryStore() {
  const ids = new Map<string, string>()
  return { get: async (p: string) => ids.get(p) ?? null, set: async (p: string, id: string) => { ids.set(p, id) }, clear: async (p: string) => { ids.delete(p) }, ids }
}

function make(mode = '', extra: Partial<MorganSessionDeps> = {}, fakeEnv: Record<string, string> = {}) {
  const runDir = mkdtempSync(path.join(tmpdir(), 'm-'))
  const pids: number[] = []
  const launches: string[][] = []
  const store = memoryStore()
  const spawnChild: SpawnChild = (_file, args, opts) => {
    launches.push(args)
    const child = spawnWithPty(process.execPath, [fake, ...args], opts)
    pids.push(child.pid)
    return child
  }
  const sessions = new MorganSessions({
    spawnChild,
    claudePath: async () => 'claude',
    runDir,
    port: PORT,
    store,
    resolveProject: async id => { if (id === 'missing') throw new Error('No such project.'); return { packagePath: runDir, storyDriveRoot: null } },
    launchFor: (_p, ch, session) => ({
      cwd: runDir, settings: {} as never,
      args: session.kind === 'resume' ? ['--resume', session.id] : ['--session-id', session.id],
      env: { PATH: process.env.PATH!, HOME: process.env.HOME!, WRITEROS_MORGAN_SOCKET: ch.socketPath, WRITEROS_MORGAN_TOKEN: ch.token,
             FAKE_MODE: mode, FAKE_TOKEN_HEADER: TOKEN_HEADER, FAKE_ROW_TEMPLATE: JSON.stringify(rowTemplate()), ...fakeEnv },
    }),
    startTimeoutMs: 2000,
    ...extra,
  })
  made.push({ sessions, pids, runDir })
  return { sessions, pids, runDir, launches, store }
}

const until = async (events: MorganScreenEvent[], pred: (e: MorganScreenEvent) => boolean, ms = 5000) => {
  const t0 = Date.now()
  while (!events.some(pred)) {
    if (Date.now() - t0 > ms) throw new Error(`timed out; saw ${JSON.stringify(events.map(e => e.type))}`)
    await new Promise(r => setTimeout(r, 25))
  }
}
const text = (e: MorganScreenEvent) => (e.type === 'events' ? JSON.stringify(e.events) : '')
const sockets = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.sock'))

let current: MorganSessions | null = null
afterEach(async () => {
  await current?.shutdown(); current = null
  for (const m of made.splice(0)) {
    await m.sessions.shutdown()
    for (const pid of m.pids) { try { process.kill(-pid, 'SIGKILL') } catch {} }
    rmSync(m.runDir, { recursive: true, force: true })
  }
})

describe('MorganSessions', () => {
  it('End settles approvals before waiting for process termination', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r });
    let entered!: () => void;
    const terminating = new Promise<void>(r => { entered = r });
    const spawnChild: SpawnChild = (_file, args, opts) => {
      const child = spawnWithPty(process.execPath, [fake, ...args], opts);
      return { ...child, terminate: async grace => { entered(); await gate; return child.terminate(grace); } };
    };
    const { sessions } = make('approval', { spawnChild }); current = sessions;
    await sessions.start('p1'); const seen: MorganScreenEvent[] = []; sessions.subscribe('p1', e => seen.push(e));
    await until(seen, e => e.type === 'approval');
    const ending = sessions.end('p1');
    try {
      await terminating;
      expect(sessions.answerApproval('p1', 'r1', { allow: true })).toBe(false);
      expect(seen).toContainEqual({ type: 'approval-answered', requestId: 'r1', allow: false });
      expect(() => sessions.submit('p1', 'continue')).toThrow(/not running/);
    } finally { release(); await ending; }
  });
  it('recovers ownership snapshots after one failed registry write', async () => {
    let writes = 0; let persisted: { pid: number; pgid: number; started: string }[] = [];
    const ownership: OwnedRegistry = {
      all: async () => persisted,
      add: async list => { writes++; if (writes === 2) throw new Error('temporary storage failure'); persisted = list; },
      remove: async list => { persisted = persisted.filter(p => !list.some(o => o.pid === p.pid && o.started === p.started)); },
    };
    const { sessions } = make('bash', { ownership }); current = sessions;
    await sessions.start('p1'); const seen: MorganScreenEvent[] = []; sessions.subscribe('p1', e => seen.push(e));
    await until(seen, e => text(e).includes('bash '));
    await new Promise(r => setTimeout(r, 4300));
    expect(writes).toBeGreaterThanOrEqual(3);
    const childPid = Number(seen.filter(e => e.type === 'events').flatMap(e => e.type === 'events' ? e.events : []).flatMap(e => e.kind === 'row' ? e.blocks : []).find(b => b.type === 'text' && b.text.startsWith('bash '))?.text?.split(' ')[1]);
    expect(persisted.some(p => p.pid === childPid)).toBe(true);
    await sessions.end('p1');
    expect(groupAlive(childPid)).toBe(false);
    expect(persisted).toEqual([]);
  }, 10000);
  it('turns folder trust into one approval and continues only after Down + Enter', async () => {
    const writes: { data: string; at: number }[] = [];
    const spawnChild: SpawnChild = (_file, args, opts) => {
      const child = spawnWithPty(process.execPath, [fake, ...args], opts);
      return { ...child, write: data => { writes.push({ data, at: Date.now() }); child.write(data); } };
    };
    const { sessions } = make('trust', { startTimeoutMs: 300, spawnChild }); current = sessions;
    await sessions.start('p1');
    const seen: MorganScreenEvent[] = [];
    sessions.subscribe('p1', e => seen.push(e));
    await until(seen, e => e.type === 'approval' && e.card.requestId === 'folder-trust');
    await new Promise(r => setTimeout(r, 400));
    expect(sessions.has('p1')).toBe(true);
    expect(seen.filter(e => e.type === 'approval')).toHaveLength(1);
    expect(sessions.answerApproval('p1', 'folder-trust', { allow: true })).toBe(true);
    await until(seen, e => e.type === 'hello');
    await until(seen, e => text(e).includes('Ready.'));
    expect(writes.map(w => w.data)).toEqual(['\x1b[B', '\r']);
  });
  it('sends Down again when the first one is dropped, and presses Enter only on Yes', async () => {
    const writes: string[] = [];
    const spawnChild: SpawnChild = (_file, args, opts) => {
      const child = spawnWithPty(process.execPath, [fake, ...args], opts);
      return { ...child, write: data => { writes.push(data); child.write(data); } };
    };
    const { sessions } = make('trust', { startTimeoutMs: 6000, spawnChild }, { FAKE_TRUST_READY_MS: '3000' }); current = sessions;
    await sessions.start('p1');
    const seen: MorganScreenEvent[] = [];
    sessions.subscribe('p1', e => seen.push(e));
    await until(seen, e => e.type === 'approval' && e.card.requestId === 'folder-trust');
    sessions.answerApproval('p1', 'folder-trust', { allow: true });
    await until(seen, e => text(e).includes('Ready.'));
    expect(writes.filter(w => w === '\x1b[B').length).toBeGreaterThan(1);
    expect(writes.at(-1)).toBe('\r');
    expect(writes.filter(w => w === '\r')).toHaveLength(1);
  });
  it('denying folder trust ends the child and closes the socket', async () => {
    const { sessions, pids, runDir } = make('trust'); current = sessions;
    await sessions.start('p1');
    const seen: MorganScreenEvent[] = []; sessions.subscribe('p1', e => seen.push(e));
    await until(seen, e => e.type === 'approval');
    sessions.answerApproval('p1', 'folder-trust', { allow: false });
    await until(seen, e => e.type === 'ended');
    expect(groupAlive(pids[0])).toBe(false);
    expect(sockets(runDir)).toEqual([]);
    expect(seen.find(e => e.type === 'ended')).toMatchObject({ message: 'Morgan needs your OK to work in this folder.' });
  });
  it('does not forward no-hello while waiting for folder trust, even to a late subscriber', async () => {
    const { sessions } = make('trust', { startTimeoutMs: 1000 }); current = sessions;
    await sessions.start('p1');
    const seen: MorganScreenEvent[] = [];
    sessions.subscribe('p1', e => seen.push(e));
    await until(seen, e => e.type === 'approval' && e.card.requestId === 'folder-trust');
    // Let the real channel's 8 s HELLO_MS deadline expire while Ben reads the card.
    await new Promise(r => setTimeout(r, 8100));
    expect(sessions.has('p1')).toBe(true);
    const late: MorganScreenEvent[] = [];
    sessions.subscribe('p1', e => late.push(e));
    expect(seen.filter(e => e.type === 'lost')).toEqual([]);
    expect(late.filter(e => e.type === 'lost')).toEqual([]);
    expect(sessions.answerApproval('p1', 'folder-trust', { allow: true })).toBe(true);
    await until(seen, e => text(e).includes('Ready.'));
    expect(seen.some(e => e.type === 'hello')).toBe(true);
    expect(seen.filter(e => e.type === 'lost')).toEqual([]);
  }, 15000);
  it('starts a session and relays the first row', async () => {
    const { sessions } = make(); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('Ready.'))
  })

  it('concurrent starts spawn exactly one process', async () => {
    const { sessions, pids } = make('slow'); current = sessions
    const [a, b] = await Promise.all([sessions.start('p1'), sessions.start('p1')])
    expect(a.sessionId).toBe(b.sessionId)
    expect([a.existing, b.existing].sort()).toEqual([false, true])
    expect(pids).toHaveLength(1)
  })

  it('a late subscriber gets hello and everything so far', async () => {
    const { sessions } = make(); current = sessions
    const first: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => first.push(e))
    await until(first, e => text(e).includes('Ready.'))
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late[0].type).toBe('hello')
    expect(late.some(e => text(e).includes('Ready.'))).toBe(true)
  })

  it('submits text and relays the reply', async () => {
    const { sessions } = make(); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('Ready.'))
    sessions.submit('p1', 'Where did beat one come from?')
    await until(seen, e => text(e).includes('Heard: Where did beat one come from?'))
  })

  it('an approval card reaches the page and Ben\'s answer reaches Morgan', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    const card = seen.find(e => e.type === 'approval') as Extract<MorganScreenEvent, { type: 'approval' }>
    expect(card.card.summary).toBe('Edit 28.md (/x/28.md)')
    expect(sessions.answerApproval('p1', card.card.requestId, { allow: false, note: 'not that file' })).toBe(true)
    await until(seen, e => text(e).includes('approval: deny (not that file)'))
    expect(seen.some(e => e.type === 'approval-answered' && e.allow === false)).toBe(true)
    expect(sessions.answerApproval('p1', card.card.requestId, { allow: true })).toBe(false) // already answered
  })

  it('an unanswered card is still there for a tab that opens later', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late.some(e => e.type === 'approval')).toBe(true)
  })

  it('ending the session answers open cards with deny', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    await sessions.end('p1')
    expect(seen.some(e => e.type === 'approval-answered' && e.allow === false)).toBe(true)
    expect(seen.at(-1)?.type).toBe('ended')
  })

  it.each(['script', 'page'])('a %s proposal reaches the client and Ben\'s Keep reaches Morgan', async surface => {
    const proposal = { surface: 'page', page: 'synopsis', baseRevision: 0, markdown: '# Synopsis\n\nA courier crosses the city.', summary: 'Write the synopsis' }
    const { sessions } = make('propose', { validateProposal: p => validateProposal(p) }, surface === 'page' ? { FAKE_PROPOSAL: JSON.stringify(proposal) } : {}); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'proposal')
    const p = seen.find(e => e.type === 'proposal') as Extract<MorganScreenEvent, { type: 'proposal' }>
    expect(p.proposal.surface).toBe(surface)
    if (surface === 'page') expect(p.proposal).toEqual(proposal)
    expect(sessions.answerProposal('p1', p.proposalId, { outcome: 'kept' })).toBe(true)
    await until(seen, e => text(e).includes('proposal: kept'))
  })

  it('an invalid proposal is answered without reaching the page', async () => {
    const { sessions } = make('propose', { validateProposal: () => 'blocks[0].type: unknown element' }); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('proposal: invalid'))
    expect(seen.some(e => e.type === 'proposal')).toBe(false)
  })

  it('Stop answers an open card with deny', async () => {
    const { sessions } = make('approval'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'approval')
    sessions.stop('p1', 'turn-1')
    await until(seen, e => text(e).includes('approval: deny (the writer stopped this turn)'))
  })

  it('an detached child is still stopped after its parent exits on its own', async () => {
    // FAKE_MODE 'orphan' (add to the fake): starts `env -i /bin/sleep 60` detached, reports its pid, waits 3 s, exits.
    const { sessions } = make('orphan'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => /orphan \d+/.test(text(e)))
    const pid = Number(text(seen.find(e => /orphan \d+/.test(text(e)))!).match(/orphan (\d+)/)![1])
    await until(seen, e => e.type === 'ended', 8000)
    expect(groupAlive(pid)).toBe(false)
  }, 15_000)

  it('a Bash-like detached child is stopped with the session', async () => {
    const { sessions } = make('bash'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => /bash \d+/.test(text(e)))
    const pid = Number(text(seen.find(e => /bash \d+/.test(text(e)))!).match(/bash (\d+)/)![1])
    await sessions.end('p1')
    expect(groupAlive(pid)).toBe(false)
  }, 10_000)

  it('remembers the conversation and resumes it next time', async () => {
    const { sessions, launches, store, runDir } = make(); current = sessions
    const first = await sessions.start('p1')
    const seen: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('Ready.'))
    expect(store.ids.get(`p1\n${runDir}`)).toBe(first.sessionId)
    await sessions.end('p1')
    await sessions.start('p1')
    expect(launches[1]).toEqual(['--resume', first.sessionId])
  })

  it('a failed resume forgets the conversation and says so; the next Start is fresh', async () => {
    const { sessions, store, launches, runDir } = make('silent'); current = sessions
    store.ids.set(`p1\n${runDir}`, 'old-id')
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'ended', 6000)
    const ended = seen.find(e => e.type === 'ended') as Extract<MorganScreenEvent, { type: 'ended' }>
    expect(ended.message).toMatch(/could not pick up/i)
    expect(store.ids.has(`p1\n${runDir}`)).toBe(false)
    await sessions.start('p1')
    expect(launches[1][0]).toBe('--session-id')
  })

  it('does not resume a conversation remembered for a different folder', async () => {
    const { sessions, store, launches } = make(); current = sessions
    store.ids.set('p1\n/some/other/folder', 'other-folder-id')
    store.ids.set('p1', 'old-unkeyed-id')
    await sessions.start('p1')
    expect(launches[0][0]).toBe('--session-id')
  })

  it('"New conversation" starts fresh even when one is remembered', async () => {
    const { sessions, store, launches } = make(); current = sessions
    store.ids.set('p1', 'old-id')
    await sessions.start('p1', { fresh: true })
    expect(launches[0][0]).toBe('--session-id')
  })

  it('end() resolves only after the group is gone and the socket is closed; restart is a new process', async () => {
    const { sessions, pids, runDir } = make(); current = sessions
    await sessions.start('p1')
    await sessions.end('p1')
    expect(groupAlive(pids[0])).toBe(false)
    expect(sockets(runDir)).toEqual([])
    await sessions.start('p1', { fresh: true })
    expect(pids).toHaveLength(2)
  })

  it('end() during a start cancels it: no process is left', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const { sessions, pids, runDir } = make('', { resolveProject: async () => { await gate; return { packagePath: tmpdir(), storyDriveRoot: null } } })
    current = sessions
    const starting = sessions.start('p1').catch(e => e)
    const ending = sessions.end('p1')
    release()
    await ending
    expect(await starting).toBeInstanceOf(Error)
    expect(pids).toHaveLength(0)
    expect(sockets(runDir)).toEqual([])
  })

  it('a child that exits on its own: ended(exited) reaches a subscriber who connects afterwards', async () => {
    const { sessions } = make('crash'); current = sessions
    await sessions.start('p1')
    await new Promise(r => setTimeout(r, 1000))
    expect(sessions.has('p1')).toBe(false)
    expect(sessions.canStream('p1')).toBe(true)
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late.at(-1)).toMatchObject({ type: 'ended', reason: 'exited' })
  })

  it('after a natural exit, Start waits for cleanup and resumes in a fresh process', async () => {
    const { sessions, pids } = make('crash'); current = sessions
    const first = await sessions.start('p1')
    await new Promise(r => setTimeout(r, 300))
    const second = await sessions.start('p1')
    expect(second.existing).toBe(false)
    expect(second.sessionId).toBe(first.sessionId)
    expect(pids).toHaveLength(2)
  })

  it('a child that never says hello ends as start-failed with a plain message, and is killed', async () => {
    const { sessions, pids } = make('silent'); current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1', { fresh: true })
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => e.type === 'ended' && e.reason === 'start-failed', 6000)
    const ended = seen.find(e => e.type === 'ended') as Extract<MorganScreenEvent, { type: 'ended' }>
    expect(ended.message).toMatch(/could not start/i)
    expect(groupAlive(pids[0])).toBe(false)
  })

  it('an unknown project fails without leaving a socket behind', async () => {
    const { sessions, runDir } = make(); current = sessions
    await expect(sessions.start('missing')).rejects.toThrow(/No such project/)
    expect(sockets(runDir)).toEqual([])
  })

  it('a failure after spawning stops the child and rejects without hanging', async () => {
    const { sessions, pids } = make('', { store: { get: async () => null, set: async () => { throw new Error('disk full') }, clear: async () => {} } })
    current = sessions
    const seen: MorganScreenEvent[] = []
    await sessions.start('p1')
    sessions.subscribe('p1', e => seen.push(e))
    // Remembering the session id fails on hello: Morgan keeps running; resume is just unavailable for this conversation.
    await until(seen, e => text(e).includes('Ready.'))
    expect(groupAlive(pids[0])).toBe(true)
  })

  it('a process that will not die marks the project stuck, and end() still returns', async () => {
    const stubborn: SpawnChild = () => ({ pid: 999999, write: () => {}, onData: () => {}, onExit: () => {}, terminate: async () => false })
    const { sessions } = make('', { spawnChild: stubborn, startTimeoutMs: 60_000 }) // descendantsOf(999999) is empty
    current = sessions
    await sessions.start('p1')
    await sessions.end('p1')
    await expect(sessions.start('p1')).rejects.toThrow(/did not stop/)
  })

  it('shutdown() ends running sessions at once even while another start is stuck', async () => {
    const gate = new Promise<void>(() => {})
    let entered!: () => void
    const inResolver = new Promise<void>(r => { entered = r })
    const { sessions, pids } = make('', {
      resolveProject: async id => { if (id === 'stuck') { entered(); await gate } return { packagePath: tmpdir(), storyDriveRoot: null } },
    })
    await sessions.start('p1')
    void sessions.start('stuck').catch(() => {})
    await inResolver
    const shutdown = sessions.shutdown()
    await shutdown
    expect(groupAlive(pids[0])).toBe(false)
  }, 10_000)

  it('shutdown() aborts a preflight in progress', async () => {
    let aborted = false
    let entered!: () => void
    const inPreflight = new Promise<void>(r => { entered = r })
    const { sessions } = make('', { claudePath: signal => new Promise((_r, reject) => {
      entered()
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
    }) })
    const starting = sessions.start('p1').catch(e => e)
    await inPreflight
    await sessions.shutdown()
    expect(aborted).toBe(true)
    expect(await starting).toBeInstanceOf(Error)
  })

  it('history keeps hello and marks truncation past the cap', async () => {
    const { sessions } = make('chatty', { maxHistory: 3 }, { FAKE_ROWS: '6' }); current = sessions
    await sessions.start('p1')
    const seen: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => seen.push(e))
    await until(seen, e => text(e).includes('row 6'))
    const late: MorganScreenEvent[] = []
    sessions.subscribe('p1', e => late.push(e))
    expect(late[0].type).toBe('hello')
    expect(late[1].type).toBe('truncated')
    expect(late).toHaveLength(2 + 3)
  })
})
