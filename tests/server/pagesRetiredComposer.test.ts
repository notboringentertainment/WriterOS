import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { registerRoutes } from '../../server/routes'
import * as modelProvider from '../../server/ai/modelProvider'

afterEach(() => vi.restoreAllMocks())

describe('retired document composers', () => {
  it('refuses every old model surface without calling a provider', async () => {
    const createProvider = vi.spyOn(modelProvider, 'createModelProvider')
    const app = express()
    app.use(express.json())
    await registerRoutes(app)
    const server = http.createServer(app)
    await new Promise<void>(resolve => server.listen(0, resolve))
    const port = (server.address() as AddressInfo).port
    try {
      for (const surface of ['outline', 'synopsis', 'treatment']) {
        const response = await fetch(`http://localhost:${port}/api/compose-document`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface }),
        })
        expect(response.status).toBe(410)
        expect((await response.json()).message).toBe('This page is now written by Morgan')
      }
      expect(createProvider).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
