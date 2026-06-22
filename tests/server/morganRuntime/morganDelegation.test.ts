import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AssessmentProfile, StoryMemory } from '../../../shared/schema'

const { runMorgan } = vi.hoisted(() => ({ runMorgan: vi.fn() }))
vi.mock('../../../server/ai/morganRuntime', () => ({
  runMorgan,
  buildReachInventory: () => ({ canSee: ['logline'], cannotSee: ['pixels'], canDoNow: ['read'], cannotDoYet: ['edit'] }),
  renderReachContract: () => 'MORGAN REACH: can see logline',
}))

const { providerCalls } = vi.hoisted(() => ({ providerCalls: [] as string[] }))
vi.mock('../../../server/ai/modelProvider', () => ({
  createModelProvider: () => ({
    name: 't', model: 't', isConfigured: () => true,
    generateResponse: vi.fn(async (i: { systemPrompt: string }) => {
      providerCalls.push(i.systemPrompt)
      return JSON.stringify({ message: 'specialist', suggestions: [] })
    }),
  }),
}))

import { OpenAIService, createPersonaSystemPrompt } from '../../../server/ai/openaiService'
import { PERSONAS } from '../../../shared/personas'

function userProfile(): AssessmentProfile {
  return { entryState: 'idea_only', existingWork: [], immediateNeed: 'a next step', feedbackStyle: 'direct', writerName: 'Writer' }
}
function storyMemory(): StoryMemory {
  return {
    project: { title: 'Lifeline', genre: 'Thriller', format: 'feature', logline: 'A dispatcher hears a dead caller.' },
    characters: {}, outline: { acts: 3, beats: [], scenes: [] },
    worldRules: { setting: '', toneAnchors: '', rules: '' }, dialogue: { voiceNotes: '' },
    userProfile: userProfile(), decisions: [],
  }
}

beforeEach(() => { runMorgan.mockReset(); providerCalls.length = 0 })

describe('Morgan delegation', () => {
  it('routes Morgan through the runtime, not the single-shot provider', async () => {
    runMorgan.mockResolvedValue({ ok: true, message: 'runtime read', suggestions: ['x'] })
    const r = await new OpenAIService().generatePersonaResponse(PERSONAS.writingPartner, 'reach?', userProfile(), storyMemory(), [])
    expect(runMorgan).toHaveBeenCalledTimes(1)
    expect(r.message).toBe('runtime read')
    expect(r.suggestions).toEqual(['x'])
    expect(providerCalls).toHaveLength(0)
  })

  it('still routes specialists through the existing single-shot provider', async () => {
    await new OpenAIService().generatePersonaResponse(PERSONAS.sam, 'logline?', userProfile(), storyMemory(), [])
    expect(runMorgan).not.toHaveBeenCalled()
    expect(providerCalls).toHaveLength(1)
  })

  it('passes a callSpecialist dep into runMorgan that routes a specialist through the single-shot persona path (no recursion)', async () => {
    runMorgan.mockResolvedValue({ ok: true, message: 'runtime read', suggestions: [] })
    await new OpenAIService().generatePersonaResponse(PERSONAS.writingPartner, 'reach?', userProfile(), storyMemory(), [])

    const deps = runMorgan.mock.calls[0][0].deps
    expect(typeof deps?.callSpecialist).toBe('function')

    const ans = await deps.callSpecialist({ specialistId: 'casey', question: 'arc?' })
    expect(ans.message).toBe('specialist')          // single-shot provider's reply, unwrapped to { message }
    expect(providerCalls).toHaveLength(1)            // specialist used the single-shot provider...
    expect(providerCalls[0]).toMatch(/Respond with JSON/i) // ...with a specialist prompt, not Morgan's tool prompt
    expect(runMorgan).toHaveBeenCalledTimes(1)       // no re-entry into the runtime (no recursion)
  })

  it('tool-mode Morgan prompt instructs respond_to_writer and drops the JSON closer; json-mode unchanged', () => {
    const toolP = createPersonaSystemPrompt(PERSONAS.writingPartner, userProfile(), storyMemory(), 'hi', undefined, 'tool')
    expect(toolP).toMatch(/respond_to_writer/)
    expect(toolP).not.toMatch(/Respond with JSON/i)
    const jsonP = createPersonaSystemPrompt(PERSONAS.writingPartner, userProfile(), storyMemory(), 'hi')
    expect(jsonP).toMatch(/Respond with JSON/i)
  })
})
