import { describe, expect, it, vi } from 'vitest'
import { createProjectMemoryApi } from '../../client/src/lib/projectMemoryApi'
import type { WhatsStandingPayload } from '../../shared/whatsStandingPanel'

function validPayload(): WhatsStandingPayload {
  return {
    composed: {
      schemaVersion: 1,
      generatedAt: '2026-08-18T00:00:00.000Z',
      model: null,
      recipeVersion: 1,
      composerVersion: 1,
      sourceHash: 'a'.repeat(64),
      format: 'feature',
      blocks: [],
      fidelity: { status: 'clean', warnings: [] },
    },
    questions: [
      {
        annotationId: 'ann_1',
        status: 'new',
        questionText: 'Who is this referring to?',
        recordId: 'rec_1',
        candidates: [{ id: 'rec_2', headline: 'A candidate' }],
        questionVersion: 'b'.repeat(64),
      },
    ],
  }
}

describe('projectMemoryApi.whatsStanding', () => {
  it('GETs the panel payload and validates it', async () => {
    const payload = validPayload()
    const fetchStub = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(payload), { status: 200 }))
    const api = createProjectMemoryApi('token', fetchStub)
    const result = await api.whatsStanding('proj-1')
    expect(fetchStub.mock.calls[0][0]).toBe('/api/projects/proj-1/memory/whats-standing')
    expect(result.questions).toEqual(payload.questions)
  })

  it('POSTs an answer with the questionVersion echoed', async () => {
    const payload = validPayload()
    const fetchStub = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), { status: 200 }))
    const api = createProjectMemoryApi('token', fetchStub)
    await api.answerWhatsStanding('proj-1', 'ann_x', 'a'.repeat(64), { kind: 'cant-say' })
    const [url, init] = fetchStub.mock.calls[0]
    expect(url).toBe('/api/projects/proj-1/memory/whats-standing/answer')
    expect(JSON.parse(init!.body as string).questionVersion).toBe('a'.repeat(64))
  })

  it('surfaces a 409 with its status code and rejects invalid payloads', async () => {
    const conflict = vi.fn(async () => new Response(JSON.stringify({ error: 'annotation-conflict', message: 'moved' }), { status: 409 }))
    await expect(createProjectMemoryApi('t', conflict).whatsStanding('p'))
      .rejects.toMatchObject({ statusCode: 409 })
    const garbage = vi.fn(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }))
    await expect(createProjectMemoryApi('t', garbage).whatsStanding('p'))
      .rejects.toMatchObject({ code: 'invalid-response' })
  })
})
