import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import { addSseClient, broadcast } from '../../../server/room/sseHub'

function fakeResponse(options: { throwOnData?: boolean } = {}) {
  const listeners = new Map<string, () => void>()
  const res = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      if (options.throwOnData && chunk.startsWith('data:')) throw new Error('socket gone')
      return true
    }),
    on: vi.fn((event: string, cb: () => void) => {
      listeners.set(event, cb)
      return res
    }),
  }
  return { res: res as unknown as Response, write: res.write, close: () => listeners.get('close')?.() }
}

describe('sseHub.broadcast', () => {
  it('continues broadcasting to other clients when one write throws', () => {
    const bad = fakeResponse({ throwOnData: true })
    const good = fakeResponse()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    addSseClient('p1', bad.res)
    addSseClient('p1', good.res)
    broadcast('p1', { type: 'turn_ended', agentId: 'casey', turnId: 't1', action: 'passed' })

    expect(good.write).toHaveBeenCalledWith(expect.stringContaining('"turn_ended"'))
    expect(consoleSpy).toHaveBeenCalled()

    bad.close()
    good.close()
    consoleSpy.mockRestore()
  })
})
