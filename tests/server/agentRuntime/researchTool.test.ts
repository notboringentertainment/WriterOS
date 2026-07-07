import { describe, expect, it, vi } from 'vitest'
import { defaultProjectState } from '../../../client/src/lib/projectState'
import { buildProjectContext } from '../../../client/src/lib/wpRouting'
import { runNativeResearchTool } from '../../../server/ai/agentRuntime/tools/research'
import type { PersonaCapabilityRequest } from '../../../shared/personaCapability'

function makeRequest(overrides: Partial<PersonaCapabilityRequest> = {}): PersonaCapabilityRequest {
  const state = defaultProjectState()
  state.meta.format = 'series'
  return {
    personaId: 'zoe',
    taskKind: 'research_world_context',
    message: 'Research the construction period of Damascus Gate.',
    projectContext: buildProjectContext(state),
    sourceSurface: 'writingPartner',
    clientRequestId: 'req-1',
    ...overrides,
  }
}

const searchResult = (overrides: Record<string, unknown> = {}) => ({
  type: 'web_search_result',
  title: 'Jerusalem City Archives',
  url: 'https://example.com/archive',
  encrypted_content: 'encrypted',
  page_age: null,
  ...overrides,
})

const resultBlock = (content: unknown) => ({
  type: 'web_search_tool_result',
  tool_use_id: 'srv_1',
  content,
})

const textBlock = (text: string, citations: unknown[] = []) => ({
  type: 'text',
  text,
  citations,
})

describe('runNativeResearchTool', () => {
  it('streams with the Anthropic web search server tool and maps sources/citations from content blocks', async () => {
    const sendMessage = vi.fn(async (_input: unknown) => ({
      stopReason: 'end_turn',
      content: [
        resultBlock([searchResult()]),
        textBlock(JSON.stringify({
          findings: [
            { claim: 'The gate was rebuilt in the Ottoman period.', sourceLabel: 'Jerusalem City Archives', verified: true },
          ],
          sources: [{ label: 'Model supplied source', url: 'https://model.example/source' }],
          missing: [],
          unverified: [],
        }), [{
          type: 'web_search_result_location',
          url: 'https://example.com/archive',
          title: 'Jerusalem City Archives',
          cited_text: 'Ottoman period',
          encrypted_index: 'idx',
        }]),
      ],
    }))

    const result = await runNativeResearchTool(makeRequest(), { sendMessage })

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      tools: [expect.objectContaining({ type: 'web_search_20260209', name: 'web_search', max_uses: 3 })],
    }))
    const firstCall = sendMessage.mock.calls[0]?.[0] as { messages: unknown[] }
    expect(firstCall).toBeTruthy()
    expect(JSON.stringify(firstCall.messages)).toContain('Format: series')
    expect(result.taskResult.findings).toEqual([
      {
        claim: 'The gate was rebuilt in the Ottoman period.',
        sourceLabel: 'Jerusalem City Archives',
        verified: true,
      },
    ])
    expect(result.taskResult.sources).toEqual([
      { label: 'Jerusalem City Archives', url: 'https://example.com/archive' },
    ])
    expect(result.citedSourceUrls).toEqual(['https://example.com/archive'])
  })

  it.each(['max_uses_exceeded', 'too_many_requests', 'unavailable'])(
    'turns server-tool %s errors into upstream_error failures without leaking raw codes',
    async (errorCode) => {
      const sendMessage = vi.fn(async (_input: unknown) => ({
        stopReason: 'end_turn',
        content: [resultBlock({ type: 'web_search_tool_result_error', error_code: errorCode })],
      }))

      await expect(runNativeResearchTool(makeRequest(), { sendMessage })).rejects.toMatchObject({
        failureReason: 'upstream_error',
      })
    }
  )

  it('keeps successful sources when another web search result block errors', async () => {
    const sendMessage = vi.fn(async (_input: unknown) => ({
      stopReason: 'end_turn',
      content: [
        resultBlock([searchResult()]),
        resultBlock({ type: 'web_search_tool_result_error', error_code: 'too_many_requests' }),
        textBlock(JSON.stringify({
          findings: [
            { claim: 'A usable source survived the partial failure.', sourceLabel: 'Jerusalem City Archives', verified: true },
          ],
          sources: [],
          missing: [],
          unverified: [],
        })),
      ],
    }))

    const result = await runNativeResearchTool(makeRequest(), { sendMessage })

    expect(result.taskResult.sources).toEqual([
      { label: 'Jerusalem City Archives', url: 'https://example.com/archive' },
    ])
    expect(result.partialFailure).toBe(true)
  })

  it('retries malformed model JSON once before succeeding', async () => {
    const sendMessage = vi.fn(async (_input: unknown) => ({
      stopReason: 'end_turn',
      content: [] as unknown[],
    }))
    sendMessage
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        content: [resultBlock([searchResult()]), textBlock('not json')],
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        content: [resultBlock([searchResult()]), textBlock(JSON.stringify({
          findings: [
            { claim: 'Retry returned structured JSON.', sourceLabel: 'Jerusalem City Archives', verified: true },
          ],
          sources: [],
          missing: [],
          unverified: [],
        }))],
      })

    const result = await runNativeResearchTool(makeRequest(), { sendMessage })

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(result.taskResult.findings[0].claim).toBe('Retry returned structured JSON.')
  })
})
