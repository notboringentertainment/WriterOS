import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ctorCalls: Array<Record<string, unknown>> = []
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages: { create: typeof createMock }
    constructor(o: Record<string, unknown>) {
      ctorCalls.push(o)
      this.messages = { create: createMock }
    }
  }
  return { default: MockAnthropic }
})

import { sendToolTurn, isAnthropicConfigured, userTurn } from '../../../server/ai/morganRuntime/anthropicToolClient'

const savedEnv = { ...process.env }
beforeEach(() => {
  ctorCalls.length = 0
  createMock.mockReset()
  process.env.ANTHROPIC_API_KEY = 'k'
})
afterEach(() => {
  process.env = { ...savedEnv }
})

describe('anthropic tool client', () => {
  it('isAnthropicConfigured reflects the API key', () => {
    expect(isAnthropicConfigured()).toBe(true)
    delete process.env.ANTHROPIC_API_KEY
    expect(isAnthropicConfigured()).toBe(false)
  })

  it('sends system + messages + tools and parses tool_use blocks into a ToolTurn', async () => {
    createMock.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 'u1', name: 'respond_to_writer', input: { message: 'hi' } },
      ],
    })
    const turn = await sendToolTurn({
      system: 'SYS',
      messages: [userTurn('hi')],
      tools: [{ name: 'respond_to_writer', description: 'd', input_schema: { type: 'object' } }],
    })
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ system: 'SYS', tools: expect.any(Array) }))
    expect(turn.stopReason).toBe('tool_use')
    expect(turn.toolUses).toEqual([{ id: 'u1', name: 'respond_to_writer', input: { message: 'hi' } }])
    expect(turn.text).toMatch(/thinking/)
    expect(turn.assistantContent).toBeTruthy()
  })

  it('constructs the client with an explicit timeout + retries', async () => {
    createMock.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }] })
    await sendToolTurn({ system: 's', messages: [userTurn('hi')], tools: [] })
    expect(ctorCalls[0]).toMatchObject({ timeout: expect.any(Number), maxRetries: expect.any(Number) })
  })
})
