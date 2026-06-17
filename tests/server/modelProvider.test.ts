import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture Anthropic client constructor opts + stream calls without hitting the API.
const ctorCalls: Array<Record<string, unknown>> = []
const streamMock = vi.fn()
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages: { stream: typeof streamMock; create: typeof createMock }
    constructor(opts: Record<string, unknown>) {
      ctorCalls.push(opts)
      this.messages = { stream: streamMock, create: createMock }
    }
  }
  return { default: MockAnthropic }
})

import { createModelProvider } from '../../server/ai/modelProvider'

const savedEnv = { ...process.env }

beforeEach(() => {
  ctorCalls.length = 0
  streamMock.mockReset()
  createMock.mockReset()
  process.env.AI_PROVIDER = 'anthropic'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('AnthropicProvider — streaming + resilience', () => {
  it('streams the completion (not a single blocking create) and returns accumulated text', async () => {
    streamMock.mockReturnValue({
      finalMessage: async () => ({ content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }] }),
    })

    const provider = createModelProvider()
    const out = await provider.generateResponse({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 5000,
    })

    expect(streamMock).toHaveBeenCalledTimes(1)
    expect(createMock).not.toHaveBeenCalled()
    expect(out).toBe('hello \nworld')
  })

  it('constructs the client with an explicit generous timeout and retries', async () => {
    streamMock.mockReturnValue({ finalMessage: async () => ({ content: [{ type: 'text', text: 'x' }] }) })

    const provider = createModelProvider()
    await provider.generateResponse({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }] })

    expect(ctorCalls[0]).toMatchObject({ timeout: expect.any(Number), maxRetries: expect.any(Number) })
    expect(ctorCalls[0].timeout as number).toBe(10 * 60 * 1000)
    expect(ctorCalls[0].maxRetries as number).toBe(2)
  })

  it('passes system, messages, temperature and max_tokens through to the stream call', async () => {
    streamMock.mockReturnValue({ finalMessage: async () => ({ content: [{ type: 'text', text: 'x' }] }) })

    const provider = createModelProvider()
    await provider.generateResponse({
      systemPrompt: 'SYS',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.4,
      maxTokens: 5000,
    })

    expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({
      system: 'SYS',
      temperature: 0.4,
      max_tokens: 5000,
      messages: [{ role: 'user', content: 'hi' }],
    }))
  })
})
