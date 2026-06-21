// M1 acceptance proofs. LLM output is non-deterministic, so these assert the
// STRUCTURE that makes Morgan reliable (runtime used, reach injected, honest
// recovery) — not literal answer strings. The live "there she is" 4-question
// check is Ben's manual/browser pass at review.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendToolTurn } = vi.hoisted(() => ({ sendToolTurn: vi.fn() }))
vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendToolTurn,
  isAnthropicConfigured: () => (process.env.ANTHROPIC_API_KEY ? true : false),
}))

import { runMorgan } from '../../../server/ai/morganRuntime'
import type { ReachInventory } from '../../../server/ai/morganRuntime/types'

const inv: ReachInventory = {
  canSee: ['the logline'],
  cannotSee: ['the literal pixels'],
  canDoNow: ['give a showrunner read'],
  cannotDoYet: ['call specialists directly'],
}
const input = (over: Partial<Parameters<typeof runMorgan>[0]> = {}) => ({
  systemPrompt: 'SYS', userMessage: 'hi', history: [], inventory: inv, ...over,
})

beforeEach(() => { sendToolTurn.mockReset(); process.env.ANTHROPIC_API_KEY = 'k' })

describe('M1 acceptance', () => {
  it('answers a normal greeting through the runtime without collapsing into generic filler', async () => {
    sendToolTurn.mockResolvedValueOnce({
      stopReason: 'tool_use', text: '', assistantContent: [],
      toolUses: [{ id: 'a', name: 'respond_to_writer', input: { message: "Hey — let's get into it. What are we working on?" } }],
    })
    const r = await runMorgan(input({ userMessage: "hi Morgan let's chat" }))
    expect(r.ok).toBe(true)
    expect(r.message).not.toMatch(/I'm here to help! What would you like to work on\?/)
    expect(sendToolTurn).toHaveBeenCalled()
  })

  it('recovers honestly (no hollow filler) when the model never delivers via the terminal tool', async () => {
    sendToolTurn.mockResolvedValue({ stopReason: 'end_turn', text: 'rambling', assistantContent: [], toolUses: [] })
    const r = await runMorgan(input({ userMessage: 'Is that all you have to say?' }))
    expect(r.ok).toBe(false)
    expect(r.message).not.toMatch(/here to help/i)
  })

  it('fails honestly when the Claude backend is unconfigured — never silently degrades', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await runMorgan(input())
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/configured|backend|Claude/i)
    expect(sendToolTurn).not.toHaveBeenCalled()
  })
})
