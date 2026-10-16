import express from 'express'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import { registerProjectLibraryRoutes } from '../../server/projectLibrary/routes'
import { createProjectLibraryStore } from '../../server/projectLibrary/store'
import { makeProfile } from '../helpers/phase1VoiceProfile'

let server: Server
let root: string
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  if (root) await rm(root, { recursive: true, force: true })
})

it('persists one voice profile per library, validates it, and enforces origin and session', async () => {
  root = await mkdtemp(path.join(tmpdir(), 'writeros-voice-'))
  const app = express()
  app.use(express.json())
  registerProjectLibraryRoutes(app, {
    enabled: true, rootPath: root, label: 'Test', sessionToken: 'test-token',
    allowedOrigins: new Set(['http://localhost:5277']),
  }, await createProjectLibraryStore(root))
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/project-library/voice-profile`
  const headers = { Origin: 'http://localhost:5277', 'X-WriterOS-Session': 'test-token', 'Content-Type': 'application/json' }
  expect((await fetch(url)).status).toBe(403)
  expect((await fetch(url, { headers: { Origin: headers.Origin } })).status).toBe(401)
  expect((await fetch(url, { method: 'PUT', headers: { ...headers, Origin: 'https://elsewhere.test' }, body: '{}' })).status).toBe(403)
  expect(await (await fetch(url, { headers })).json()).toEqual({ profile: null })
  expect((await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ profile: { version: 1 } }) })).status).toBe(400)
  const profile = makeProfile()
  expect((await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ profile }) })).status).toBe(200)
  expect(JSON.parse(await readFile(path.join(root, '.writeros-writer/voice-profile.json'), 'utf8'))).toEqual(profile)
  expect(await (await fetch(url, { headers })).json()).toEqual({ profile })
  expect((await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ profile: null }) })).status).toBe(200)
  expect(await (await fetch(url, { headers })).json()).toEqual({ profile: null })
})
