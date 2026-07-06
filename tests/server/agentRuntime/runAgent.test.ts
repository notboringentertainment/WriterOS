import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendToolTurn } = vi.hoisted(() => ({ sendToolTurn: vi.fn() }))

vi.mock('../../../server/ai/morganRuntime/anthropicToolClient', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendToolTurn,
  isAnthropicConfigured: () => (process.env.ANTHROPIC_API_KEY ? true : false),
}))

import { runAgent } from '../../../server/ai/agentRuntime/runAgent'
import { getAgentToolset } from '../../../server/ai/agentRuntime/toolsets'
import type { AgentToolset } from '../../../server/ai/agentRuntime/types'
import type { ReachInventory } from '../../../server/ai/morganRuntime/types'
import type { MorganTraceEvent } from '../../../server/ai/morganRuntime/trace'

const inventory: ReachInventory = {
  canSee: ['logline'],
  cannotSee: ['pixels'],
  canDoNow: ['read'],
  cannotDoYet: ['edit'],
}

const inputBase = {
  personaId: 'testPersona',
  systemPrompt: 'SYS',
  userMessage: 'hi',
  history: [],
  inventory,
}

const testToolset: AgentToolset = {
  tools: [
    { name: 'readContext', description: 'Read context', input_schema: { type: 'object', properties: {} } },
    { name: 'finish', description: 'Finish', input_schema: { type: 'object', properties: {} } },
  ],
  terminalToolName: 'finish',
  dispatchTool: async (use, ctx) => {
    if (use.name === 'readContext') {
      return { kind: 'continue', toolUseId: use.id, content: JSON.stringify(ctx.inventory) }
    }
    if (use.name === 'finish') {
      const input = (use.input ?? {}) as { message?: string; suggestions?: string[] }
      return {
        kind: 'final',
        result: {
          ok: true,
          message: input.message ?? 'done',
          suggestions: input.suggestions ?? [],
        },
      }
    }
    return { kind: 'error', toolUseId: use.id, content: `unknown tool: ${use.name}` }
  },
}

beforeEach(() => {
  sendToolTurn.mockReset()
  process.env.ANTHROPIC_API_KEY = 'k'
})

describe('runAgent kernel', () => {
  it('returns an honest error without calling the model when the toolset is empty', async () => {
    const result = await runAgent({
      ...inputBase,
      toolset: {
        tools: [],
        terminalToolName: 'finish',
        dispatchTool: async () => {
          throw new Error('should not dispatch')
        },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.message).not.toMatch(/here to help/i)
    expect(sendToolTurn).not.toHaveBeenCalled()
  })

  it('runs an injected toolset until its terminal tool returns a final response', async () => {
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [{ type: 'tool_use', id: 'read' }],
        toolUses: [{ id: 'read', name: 'readContext', input: {} }],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [],
        toolUses: [{ id: 'finish', name: 'finish', input: { message: 'Kernel final.', suggestions: ['next'] } }],
      })

    const result = await runAgent({ ...inputBase, toolset: testToolset })

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Kernel final.')
    expect(result.suggestions).toEqual(['next'])
    expect(sendToolTurn).toHaveBeenCalledTimes(2)
  })

  it('retries once with a terminal-tool nudge before returning an honest malformed error', async () => {
    sendToolTurn.mockResolvedValue({ stopReason: 'end_turn', text: 'plain text', assistantContent: [], toolUses: [] })

    const result = await runAgent({ ...inputBase, toolset: testToolset })

    expect(result.ok).toBe(false)
    expect(result.message).not.toMatch(/here to help/i)
    expect(sendToolTurn.mock.calls.length).toBeGreaterThanOrEqual(2)
    const retryMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>
    expect(JSON.stringify(retryMessages)).toMatch(/finish tool/)
  })

  it('caps each loop pass before the retry and then fails closed without a terminal tool', async () => {
    sendToolTurn.mockResolvedValue({
      stopReason: 'tool_use',
      text: '',
      assistantContent: [{ type: 'tool_use', id: 'read' }],
      toolUses: [{ id: 'read', name: 'readContext', input: {} }],
    })

    const result = await runAgent({ ...inputBase, toolset: testToolset })

    expect(result.ok).toBe(false)
    expect(sendToolTurn).toHaveBeenCalledTimes(8)
  })

  it('feeds unknown tool dispatch errors back to the model before accepting a terminal response', async () => {
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [{ type: 'tool_use', id: 'bad' }],
        toolUses: [{ id: 'bad', name: 'mysteryTool', input: {} }],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [],
        toolUses: [{ id: 'finish', name: 'finish', input: { message: 'Recovered.' } }],
      })

    const result = await runAgent({ ...inputBase, toolset: testToolset })
    const secondCallMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>

    expect(result.message).toBe('Recovered.')
    expect(JSON.stringify(secondCallMessages)).toMatch(/unknown tool: mysteryTool/)
  })

  it('uses the host toolset to preserve Morgan one-consult-per-turn guard', async () => {
    const deps = { callSpecialist: async () => { throw new Error('should not call specialists') } }
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [{ type: 'tool_use', id: 'z' }, { type: 'tool_use', id: 's' }],
        toolUses: [
          { id: 'z', name: 'askSpecialist', input: { specialistId: 'zoe', question: 'world?' } },
          { id: 's', name: 'askSpecialist', input: { specialistId: 'sam', question: 'pitch?' } },
        ],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [],
        toolUses: [{ id: 'r', name: 'respond_to_writer', input: { message: 'done' } }],
      })

    await runAgent({ ...inputBase, personaId: 'writingPartner', toolset: getAgentToolset('writingPartner'), deps })
    const secondCallMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>
    const toolResults = secondCallMessages
      .filter((m) => m.role === 'user' && Array.isArray(m.content))
      .flatMap((m) => m.content as Array<{ tool_use_id: string; content: string }>)

    expect(toolResults.filter(result => /one specialist at a time/i.test(result.content))).toHaveLength(2)
  })

  it('uses the host toolset to reject a terminal response emitted before the consult result is seen', async () => {
    const deps = { callSpecialist: async () => ({ message: 'ZOE_READ' }) }
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [{ type: 'tool_use', id: 'z' }, { type: 'tool_use', id: 'early' }],
        toolUses: [
          { id: 'z', name: 'askSpecialist', input: { specialistId: 'zoe', question: 'world?' } },
          { id: 'early', name: 'respond_to_writer', input: { message: 'EARLY' } },
        ],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [],
        toolUses: [{ id: 'r', name: 'respond_to_writer', input: { message: 'AFTER' } }],
      })

    const result = await runAgent({ ...inputBase, personaId: 'writingPartner', toolset: getAgentToolset('writingPartner'), deps })
    const secondCallMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>
    const toolResults = secondCallMessages
      .filter((m) => m.role === 'user' && Array.isArray(m.content))
      .flatMap((m) => m.content as Array<{ tool_use_id: string; content: string }>)

    expect(result.message).toBe('AFTER')
    expect(toolResults.some(result => result.tool_use_id === 'z' && result.content === 'ZOE_READ')).toBe(true)
    expect(toolResults.some(result => result.tool_use_id === 'early' && /before seeing the specialist answer/i.test(result.content))).toBe(true)
  })

  it('returns a tool result for every premature terminal tool call before continuing', async () => {
    const deps = { callSpecialist: async () => ({ message: 'ZOE_READ' }) }
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [{ type: 'tool_use', id: 'z' }, { type: 'tool_use', id: 'early1' }, { type: 'tool_use', id: 'early2' }],
        toolUses: [
          { id: 'z', name: 'askSpecialist', input: { specialistId: 'zoe', question: 'world?' } },
          { id: 'early1', name: 'respond_to_writer', input: { message: 'EARLY 1' } },
          { id: 'early2', name: 'respond_to_writer', input: { message: 'EARLY 2' } },
        ],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [],
        toolUses: [{ id: 'r', name: 'respond_to_writer', input: { message: 'AFTER' } }],
      })

    await runAgent({ ...inputBase, personaId: 'writingPartner', toolset: getAgentToolset('writingPartner'), deps })
    const secondCallMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>
    const toolResultIds = secondCallMessages
      .filter((m) => m.role === 'user' && Array.isArray(m.content))
      .flatMap((m) => m.content as Array<{ tool_use_id: string }>)
      .map(result => result.tool_use_id)

    expect(toolResultIds).toEqual(expect.arrayContaining(['z', 'early1', 'early2']))
  })

  it('uses the host toolset to block unverified specialist attribution', async () => {
    sendToolTurn
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [{ type: 'tool_use', id: 'fake' }],
        toolUses: [{ id: 'fake', name: 'respond_to_writer', input: { message: "Casey's read is strong." } }],
      })
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        assistantContent: [],
        toolUses: [{ id: 'r', name: 'respond_to_writer', input: { message: 'Morgan answer.' } }],
      })

    const result = await runAgent({ ...inputBase, personaId: 'writingPartner', toolset: getAgentToolset('writingPartner') })

    expect(result.message).toBe('Morgan answer.')
    const secondCallMessages = sendToolTurn.mock.calls[1][0].messages as Array<{ role: string; content: unknown }>
    expect(JSON.stringify(secondCallMessages)).toMatch(/not consulted Casey/)
  })

  it('emits run-start trace events with the configured persona id', async () => {
    const events: MorganTraceEvent[] = []
    sendToolTurn.mockResolvedValueOnce({
      stopReason: 'tool_use',
      text: '',
      assistantContent: [],
      toolUses: [{ id: 'r', name: 'finish', input: { message: 'done' } }],
    })

    await runAgent({ ...inputBase, toolset: testToolset, trace: event => events.push(event), runId: 'agent_test' })

    expect(events[0]).toMatchObject({ kind: 'run.started', runId: 'agent_test', personaId: 'testPersona' })
  })
})
