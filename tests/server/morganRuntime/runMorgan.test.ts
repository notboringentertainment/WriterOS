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

  it('builds valid Anthropic history for a multi-tool turn: one assistant message, one combined tool_result turn', async () => {
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use', text: '',
        assistantContent: [{ type: 'tool_use', id: 'a' }, { type: 'tool_use', id: 'b' }],
        toolUses: [
          { id: 'a', name: 'readProjectContext', input: {} },
          { id: 'b', name: 'readProjectContext', input: {} },
        ],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use', text: '', assistantContent: [],
        toolUses: [{ id: 'c', name: 'respond_to_writer', input: { message: 'done' } }],
      })
    await runMorgan(inputBase)

    const secondCallMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>
    const assistantCount = secondCallMessages.filter((m) => m.role === 'assistant').length
    expect(assistantCount).toBe(1)
    const toolResultTurns = secondCallMessages.filter((m) => m.role === 'user' && Array.isArray(m.content))
    expect(toolResultTurns).toHaveLength(1)
    // order (NOT sorted) must match turn.toolUses — guards Promise.all ordering under async dispatch
    const ids = (toolResultTurns[0].content as Array<{ tool_use_id: string }>).map((c) => c.tool_use_id)
    expect(ids).toEqual(['a', 'b'])
  })

  it('returns an honest error when the client throws', async () => {
    sendToolTurn.mockRejectedValue(new Error('network boom'))
    const r = await runMorgan(inputBase)
    expect(r.ok).toBe(false)
    expect(r.message).not.toMatch(/here to help/i)
  })
})
