import { describe, expect, it, vi } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import {
  parseResearchTaskResult,
  runPersonaTask,
  type PersonaCapabilitySynthesisInput,
} from '../../server/persona-capability/runPersonaTask'
import type { PersonaCapabilityRequest } from '@shared/personaCapability'

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

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
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
  it('calls OpenSwarm with a fresh bounded task and returns only synthesized final text plus receipt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({
      response: JSON.stringify({
        findings: [
          { claim: 'The present gate is commonly dated to the Ottoman rebuilding.', sourceLabel: 'Archive', verified: true },
        ],
        sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
        missing: [],
        unverified: [],
      }),
    }))
    const synthesizeFinal = vi.fn(async (input: PersonaCapabilitySynthesisInput) => ({
      finalMessage: `Zoe final with ${input.sources[0].label}. [Archive]`,
      citedLabels: ['Archive'],
    }))

    const response = await runPersonaTask(makeRequest(), {
      fetchImpl,
      synthesizeFinal,
      baseUrl: 'http://localhost:8080',
      now: () => new Date('2026-05-14T20:00:00.000Z'),
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8080/open-swarm/get_response',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    )
    const upstreamBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(upstreamBody).toMatchObject({
      recipient_agent: 'Deep Research Agent',
      chat_history: [],
    })
    expect(upstreamBody).not.toHaveProperty('thread_id')

    expect(response.status).toBe('ok')
    expect(response.finalMessage).toBe('Zoe final with Archive. [Archive]')
    expect(JSON.stringify(response)).not.toContain('The present gate is commonly dated')
    expect(response.receipt.sources).toEqual([
      { label: 'Archive', url: 'https://example.com/archive', citedInFinal: true },
    ])
  })

  it('turns upstream errors into a soft-fail receipt without leaking raw upstream content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('raw upstream failure text', { status: 502 }))

    const response = await runPersonaTask(makeRequest(), {
      fetchImpl,
      synthesizeFinal: vi.fn(async () => ({ finalMessage: 'Zoe fallback.', citedLabels: [] })),
      baseUrl: 'http://localhost:8080',
    })

    expect(response.status).toBe('soft_fail')
    expect(response.receipt.failureReason).toBe('upstream_error')
    expect(response.receipt.sources).toEqual([])
    expect(JSON.stringify(response)).not.toContain('raw upstream failure text')
  })

  it('returns a timeout receipt when the upstream request is aborted', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    const response = await runPersonaTask(makeRequest(), {
      fetchImpl,
      synthesizeFinal: vi.fn(async () => ({ finalMessage: 'Zoe timeout fallback.', citedLabels: [] })),
      baseUrl: 'http://localhost:8080',
    })

    expect(response.status).toBe('timeout')
    expect(response.receipt.failureReason).toBe('timeout')
    expect(response.finalMessage).toBe('Zoe timeout fallback.')
  })
})
