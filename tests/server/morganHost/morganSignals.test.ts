// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerRoutes } from '../../../server/routes'

vi.mock('dotenv/config', () => ({}))
vi.mock('../../../server/routes', () => ({ registerRoutes: vi.fn() }))
vi.mock('../../../server/vite', () => ({ setupVite: vi.fn(), serveStatic: vi.fn(), log: vi.fn() }))

afterEach(() => { vi.restoreAllMocks(); vi.resetModules() })

describe('Morgan shutdown signal registration', () => {
  for (const enabled of [false, true]) {
    it(enabled ? 'installs shutdown handlers when a Morgan host exists' : 'leaves signal handling unchanged when Morgan is disabled', async () => {
      vi.resetModules()
      const { registerRoutes: register } = await import('../../../server/routes')
      const listen = vi.fn()
      const host = enabled ? { sessions: { shutdown: vi.fn(async () => {}) }, killAllNow: vi.fn() } : null
      vi.mocked(register).mockResolvedValue({ server: { listen }, morganHost: host } as unknown as Awaited<ReturnType<typeof registerRoutes>>)
      const signals: string[] = []
      const originalOn = process.on.bind(process)
      vi.spyOn(process, 'on').mockImplementation((event, listener) => {
        if (event === 'SIGTERM' || event === 'SIGINT') { signals.push(event); return process }
        return originalOn(event, listener)
      })
      await import('../../../server/index')
      await vi.waitFor(() => expect(listen).toHaveBeenCalled())
      expect(signals).toEqual(enabled ? ['SIGTERM', 'SIGINT'] : [])
    })
  }
})
