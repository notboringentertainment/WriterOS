import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendToolTurn } = vi.hoisted(() => ({ sendToolTurn: vi.fn() }))

vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendToolTurn,
  isAnthropicConfigured: () => (process.env.ANTHROPIC_API_KEY ? true : false),
}))

import { runMorgan } from '../../../server/ai/morganRuntime/runMorgan'
import type { ReachInventory } from '../../../server/ai/morganRuntime/types'

const inv: ReachInventory = { canSee: ['logline'], cannotSee: ['pixels'], canDoNow: ['read'], cannotDoYet: ['edit'] }
const inputBase = { systemPrompt: 'SYS', userMessage: 'hi', history: [], inventory: inv }

beforeEach(() => {
  sendToolTurn.mockReset()
  process.env.ANTHROPIC_API_KEY = 'k'
})

describe('runMorgan loop', () => {
  it('runs read tool then terminal respond, returning its message/suggestions', async () => {
    sendToolTurn
      .mockResolvedValueOnce({ stopReason: 'tool_use', text: '', assistantContent: [], toolUses: [{ id: 'a', name: 'readProjectContext', input: {} }] })
      .mockResolvedValueOnce({ stopReason: 'tool_use', text: '', assistantContent: [], toolUses: [{ id: 'b', name: 'respond_to_writer', input: { message: 'Showrunner read.', suggestions: ['s'] } }] })
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(true)
    expect(r.message).toBe('Showrunner read.')
    expect(r.suggestions).toEqual(['s'])
    expect(sendToolTurn).toHaveBeenCalledTimes(2)
  })

  it('returns an honest error (not hollow filler) when Anthropic is unconfigured', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(false)
    expect(r.message).not.toMatch(/here to help/i)
    expect(r.message).toMatch(/configured|backend|Claude/i)
    expect(sendToolTurn).not.toHaveBeenCalled()
  })

  it('retries once on a no-terminal turn, then errors honestly if still no terminal', async () => {
    sendToolTurn.mockResolvedValue({ stopReason: 'end_turn', text: 'just text', assistantContent: [], toolUses: [] })
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(false)
    expect(r.message).not.toMatch(/here to help/i)
    expect(sendToolTurn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('returns an honest error when the client throws', async () => {
    sendToolTurn.mockRejectedValue(new Error('network boom'))
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(false)
    expect(r.message).not.toMatch(/here to help/i)
  })
})
