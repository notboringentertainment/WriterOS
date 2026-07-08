import { describe, expect, it, vi } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import {
  parseResearchTaskResult,
  runPersonaTask,
  type PersonaCapabilitySynthesisInput,
} from '../../server/persona-capability/runPersonaTask'
import type { PersonaCapabilityRequest } from '@shared/personaCapability'
import type { NativeResearchToolResult } from '../../server/ai/agentRuntime/tools/research'

function makeRequest(overrides: Partial<PersonaCapabilityRequest> = {}): PersonaCapabilityRequest {
  return {
    personaId: 'zoe',
    taskKind: 'research_world_context',
    message: 'Research the construction period of Damascus Gate.',
    projectContext: buildProjectContext(defaultProjectState()),
    sourceSurface: 'writingPartner',
    clientRequestId: 'req-1',
    ...overrides,
  }
}

describe('parseResearchTaskResult', () => {
  it('keeps source-backed findings and demotes unsourced/unverified ones to unverified', () => {
    const result = parseResearchTaskResult(JSON.stringify({
      findings: [
        { claim: 'The current gate dates to the Ottoman period.', sourceLabel: 'Museum', verified: true },
        { claim: 'A local legend may help the transition.', unverified: true },
        { claim: 'Damascus Gate has a hidden underground tunnel.', verified: true },
      ],
      sources: [{ label: 'Museum', url: 'https://example.com' }],
      missing: ['Which entrance does the guide use?'],
      unverified: ['A disputed local story.'],
    }))

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      claim: 'The current gate dates to the Ottoman period.',
      verified: true,
      sourceLabel: 'Museum',
    })
    expect(result.sources).toEqual([{ label: 'Museum', url: 'https://example.com/' }])
    expect(result.missing).toEqual(['Which entrance does the guide use?'])
    expect(result.unverified).toEqual([
      'A disputed local story.',
      'A local legend may help the transition.',
      'Damascus Gate has a hidden underground tunnel.',
    ])
  })

  it('strips non-http(s) URLs from sources and findings but keeps the labels', () => {
    const result = parseResearchTaskResult(JSON.stringify({
      findings: [
        { claim: 'Verified claim.', sourceLabel: 'Archive', url: 'javascript:alert(1)', verified: true },
      ],
      sources: [
        { label: 'Archive', url: 'javascript:alert(1)' },
        { label: 'Atlas', url: 'data:text/html,evil' },
        { label: 'Library', url: 'not a url' },
        { label: 'Uppercase', url: 'HTTPS://EXAMPLE.COM/UPPER' },
        { label: 'Press', url: 'https://example.com/article' },
      ],
      missing: [],
      unverified: [],
    }))

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toEqual({
      claim: 'Verified claim.',
      verified: true,
      sourceLabel: 'Archive',
    })
    expect(result.sources).toEqual([
      { label: 'Archive' },
      { label: 'Atlas' },
      { label: 'Library' },
      { label: 'Uppercase', url: 'https://example.com/UPPER' },
      { label: 'Press', url: 'https://example.com/article' },
    ])
  })
})

describe('runPersonaTask', () => {
  it('passes the bounded request into the native research tool', async () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    const runResearch = vi.fn(async (): Promise<NativeResearchToolResult> => ({
      taskResult: {
        findings: [],
        sources: [],
        missing: [],
        unverified: [],
      },
      citedSourceUrls: [],
    }))

    await runPersonaTask(makeRequest({ projectContext: buildProjectContext(state) }), {
      runResearch,
      synthesizeFinal: vi.fn(async () => ({ finalMessage: 'Zoe final.', citedLabels: [] })),
    })

    expect(runResearch).toHaveBeenCalledWith(expect.objectContaining({
      projectContext: expect.objectContaining({ format: 'series' }),
      taskKind: 'research_world_context',
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('calls the native research tool and returns only synthesized final text plus receipt', async () => {
    const runResearch = vi.fn(async (): Promise<NativeResearchToolResult> => ({
      taskResult: {
        findings: [
          { claim: 'The present gate is commonly dated to the Ottoman rebuilding.', sourceLabel: 'Archive', verified: true },
        ],
        sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
        missing: [],
        unverified: [],
      },
      citedSourceUrls: [],
    }))
    const synthesizeFinal = vi.fn(async (input: PersonaCapabilitySynthesisInput) => ({
      finalMessage: `Zoe final with ${input.sources[0].label}. [Archive]`,
      citedLabels: ['Archive'],
    }))

    const response = await runPersonaTask(makeRequest(), {
      runResearch,
      synthesizeFinal,
      now: () => new Date('2026-05-14T20:00:00.000Z'),
    })

    expect(response.status).toBe('ok')
    expect(response.finalMessage).toBe('Zoe final with Archive. [Archive]')
    expect(JSON.stringify(response)).not.toContain('The present gate is commonly dated')
    expect(response.receipt.sources).toEqual([
      { label: 'Archive', url: 'https://example.com/archive', citedInFinal: true },
    ])
  })

  it('uses research citation URLs as receipt citation evidence even when synthesis cites by label', async () => {
    const runResearch = vi.fn(async (): Promise<NativeResearchToolResult> => ({
      taskResult: {
        findings: [
          { claim: 'The present gate is commonly dated to the Ottoman rebuilding.', sourceLabel: 'Archive', verified: true },
        ],
        sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
        missing: [],
        unverified: [],
      },
      citedSourceUrls: ['https://example.com/archive'],
    }))

    const response = await runPersonaTask(makeRequest(), {
      runResearch,
      synthesizeFinal: vi.fn(async () => ({ finalMessage: 'Zoe final.', citedLabels: [] })),
    })

    expect(response.receipt.sources).toEqual([
      { label: 'Archive', url: 'https://example.com/archive', citedInFinal: true },
    ])
  })

  it('turns research tool errors into a soft-fail receipt without leaking raw upstream content', async () => {
    const runResearch = vi.fn().mockRejectedValue(
      Object.assign(new Error('raw web_search_tool_result_error max_uses_exceeded'), { failureReason: 'upstream_error' })
    )

    const response = await runPersonaTask(makeRequest(), {
      runResearch,
      synthesizeFinal: vi.fn(async () => ({ finalMessage: 'Zoe fallback.', citedLabels: [] })),
    })

    expect(response.status).toBe('soft_fail')
    expect(response.receipt.failureReason).toBe('upstream_error')
    expect(response.receipt.sources).toEqual([])
    expect(JSON.stringify(response)).not.toContain('web_search_tool_result_error')
    expect(JSON.stringify(response)).not.toContain('max_uses_exceeded')
  })

  it('returns a timeout receipt when the native research tool times out', async () => {
    const runResearch = vi.fn().mockRejectedValue(Object.assign(new Error('research timeout'), { failureReason: 'timeout' }))

    const response = await runPersonaTask(makeRequest(), {
      runResearch,
      synthesizeFinal: vi.fn(async () => ({ finalMessage: 'Zoe timeout fallback.', citedLabels: [] })),
    })

    expect(response.status).toBe('timeout')
    expect(response.receipt.failureReason).toBe('timeout')
    expect(response.finalMessage).toBe('Zoe timeout fallback.')
  })

  it('returns a timeout receipt when research resolves after the soft timeout fires', async () => {
    vi.useFakeTimers()
    const runResearch = vi.fn(async (): Promise<NativeResearchToolResult> => {
      await new Promise(resolve => setTimeout(resolve, 240_001))
      return {
        taskResult: {
          findings: [{ claim: 'Too late to use.', sourceLabel: 'Archive', verified: true }],
          sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
          missing: [],
          unverified: [],
        },
        citedSourceUrls: [],
      }
    })
    const synthesizeFinal = vi.fn(async () => ({ finalMessage: 'Zoe timeout fallback.', citedLabels: [] }))

    try {
      const promise = runPersonaTask(makeRequest(), {
        runResearch,
        synthesizeFinal,
      })
      await vi.advanceTimersByTimeAsync(240_001)
      const response = await promise

      expect(response.status).toBe('timeout')
      expect(response.receipt.failureReason).toBe('timeout')
      expect(response.receipt.sources).toEqual([])
      expect(synthesizeFinal).toHaveBeenCalledWith(expect.objectContaining({
        status: 'timeout',
        sources: [],
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns cancelled and skips synthesis when the client aborts before synthesis', async () => {
    const controller = new AbortController()
    const runResearch = vi.fn(async (): Promise<NativeResearchToolResult> => {
      controller.abort()
      return {
        taskResult: {
          findings: [{ claim: 'Should not synthesize.', sourceLabel: 'Archive', verified: true }],
          sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
          missing: [],
          unverified: [],
        },
        citedSourceUrls: [],
      }
    })
    const synthesizeFinal = vi.fn(async () => ({ finalMessage: 'Should not run.', citedLabels: [] }))

    const response = await runPersonaTask(makeRequest(), {
      runResearch,
      synthesizeFinal,
      signal: controller.signal,
    })

    expect(response.status).toBe('cancelled')
    expect(response.receipt.failureReason).toBe('aborted')
    expect(response.finalMessage).toBe('')
    expect(synthesizeFinal).not.toHaveBeenCalled()
  })
})
