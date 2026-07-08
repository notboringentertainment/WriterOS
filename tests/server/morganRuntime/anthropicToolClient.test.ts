import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ctorCalls: Array<Record<string, unknown>> = []
const createMock = vi.fn()
const streamMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages: { create: typeof createMock; stream: typeof streamMock }
    constructor(o: Record<string, unknown>) {
      ctorCalls.push(o)
      this.messages = { create: createMock, stream: streamMock }
    }
  }
  return { default: MockAnthropic }
})

import { sendToolTurn, isAnthropicConfigured, userTurn } from '../../../server/ai/morganRuntime/anthropicToolClient'

const savedEnv = { ...process.env }
beforeEach(() => {
  ctorCalls.length = 0
  createMock.mockReset()
  streamMock.mockReset()
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
    streamMock.mockReturnValue({
      finalMessage: async () => ({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 'u1', name: 'respond_to_writer', input: { message: 'hi' } },
      ],
      }),
    })
    const turn = await sendToolTurn({
      system: 'SYS',
      messages: [userTurn('hi')],
      tools: [{ name: 'respond_to_writer', description: 'd', input_schema: { type: 'object' } }],
    })
    expect(streamMock.mock.calls[0][0]).toEqual(expect.objectContaining({ system: 'SYS', tools: expect.any(Array) }))
    expect(createMock).not.toHaveBeenCalled()
    expect(turn.stopReason).toBe('tool_use')
    expect(turn.toolUses).toEqual([{ id: 'u1', name: 'respond_to_writer', input: { message: 'hi' } }])
    expect(turn.text).toMatch(/thinking/)
    expect(turn.assistantContent).toBeTruthy()
  })

  it('passes through server tool result blocks and resumes pause_turn responses', async () => {
    streamMock
      .mockReturnValueOnce({
        finalMessage: async () => ({
          stop_reason: 'pause_turn',
          usage: { input_tokens: 11, output_tokens: 7 },
          content: [
            { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'Damascus Gate' } },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srv_1',
              content: [{ type: 'web_search_result', title: 'Archive', url: 'https://example.com/archive', encrypted_content: 'x', page_age: null }],
            },
          ],
        }),
      })
      .mockReturnValueOnce({
        finalMessage: async () => ({
          stop_reason: 'end_turn',
          usage: { input_tokens: 13, output_tokens: 5 },
          content: [{ type: 'text', text: 'done' }],
        }),
      })
    const onUsage = vi.fn()

    const turn = await sendToolTurn({
      system: 'SYS',
      messages: [userTurn('hi')],
      tools: [{ name: 'web_search', type: 'web_search_20260209', max_uses: 3 } as any],
      onUsage,
    })

    expect(streamMock).toHaveBeenCalledTimes(2)
    expect(streamMock.mock.calls[1][0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: expect.arrayContaining([
        expect.objectContaining({ type: 'server_tool_use' }),
        expect.objectContaining({ type: 'web_search_tool_result' }),
      ]) }),
    ]))
    expect(turn.stopReason).toBe('end_turn')
    expect(turn.assistantContent).toEqual([{ type: 'text', text: 'done' }])
    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenNthCalledWith(1, { inputTokens: 11, outputTokens: 7 })
    expect(onUsage).toHaveBeenNthCalledWith(2, { inputTokens: 13, outputTokens: 5 })
  })

  it('constructs the client with an explicit timeout + retries', async () => {
    streamMock.mockReturnValue({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }] }) })
    await sendToolTurn({ system: 's', messages: [userTurn('hi')], tools: [] })
    expect(ctorCalls[0]).toMatchObject({ timeout: expect.any(Number), maxRetries: expect.any(Number) })
  })
})
