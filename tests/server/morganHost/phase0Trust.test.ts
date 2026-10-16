// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { MorganSessions } from '../../../server/morganHost/morganSession'
import { spawnWithPty } from '../../../server/morganHost/ptyProcess'
import { TOKEN_HEADER } from '../../../mod/writeros-morgan/hooks/protocol'
import { rowTemplate } from '../../helpers/morganProtocol'
import type { MorganScreenEvent } from '../../../shared/morganLive'

it.each(['story', 'package', 'other'])('answers only the project folders automatically: %s', async kind => {
  const dir = mkdtempSync(path.join(tmpdir(), 'm-trust-'))
  const storyDriveRoot = path.join(dir, 'story')
  const packagePath = path.join(dir, 'project.writeros')
  mkdirSync(storyDriveRoot)
  mkdirSync(packagePath)
  const folder = kind === 'story' ? storyDriveRoot : kind === 'package' ? packagePath : path.join(dir, 'other')
  const displayedFolder = kind === 'other' ? folder : realpathSync(folder)
  const writes: string[] = []
  const sessions = new MorganSessions({
    runDir: dir, port: '9997', startTimeoutMs: 2000,
    store: { get: async () => null, set: async () => {}, clear: async () => {} },
    claudePath: async () => 'claude', resolveProject: async () => ({ packagePath, storyDriveRoot }),
    launchFor: (_project, ch, session) => ({ cwd: dir, settings: {} as never, args: ['--session-id', session.id],
      env: { PATH: process.env.PATH!, HOME: dir, WRITEROS_MORGAN_SOCKET: ch.socketPath,
        WRITEROS_MORGAN_TOKEN: ch.token, FAKE_MODE: 'trust', FAKE_TOKEN_HEADER: TOKEN_HEADER,
        FAKE_ROW_TEMPLATE: JSON.stringify(rowTemplate()) } }),
    spawnChild: (_file, args, opts) => {
      const child = spawnWithPty(process.execPath, [path.resolve(__dirname, '../../fakes/fake-claude-morgan.mjs'), ...args], opts)
      let first = true
      return { ...child, write: data => { writes.push(data); child.write(data) },
        onData: handler => child.onData(data => {
          handler((first ? `Accessing workspace:\r\n ${displayedFolder}\r\n` : '') + data)
          first = false
        }) }
    },
  })
  const events: MorganScreenEvent[] = []
  try {
    await sessions.start('p')
    sessions.subscribe('p', e => events.push(e))
    const deadline = Date.now() + 4000
    while (!events.some(e => e.type === (kind === 'other' ? 'approval' : 'hello'))) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${JSON.stringify(events)}`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    if (kind === 'other') {
      expect(writes).toEqual([])
      expect(events.find(e => e.type === 'approval')).toMatchObject({ card: { tool: 'FolderTrust', input: JSON.stringify({ folder }) } })
    } else {
      expect(writes).toEqual(['\x1b[B', '\r'])
      expect(events.some(e => e.type === 'approval')).toBe(false)
    }
  } finally { await sessions.shutdown(); rmSync(dir, { recursive: true, force: true }) }
})
