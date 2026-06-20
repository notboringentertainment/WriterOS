import { describe, it, expect, vi, beforeEach } from 'vitest'

const providerCalls: Array<{ systemPrompt: string; maxTokens?: number }> = []

vi.mock('../../server/ai/modelProvider', () => ({
  createModelProvider: () => ({
    name: 'test',
    model: 'test-model',
    isConfigured: () => true,
    generateResponse: vi.fn(async (input: { systemPrompt: string; maxTokens?: number }) => {
      providerCalls.push({ systemPrompt: input.systemPrompt, maxTokens: input.maxTokens })
      return JSON.stringify({ message: 'ok', suggestions: [] })
    }),
  }),
}))

import { createPersonaSystemPrompt, OpenAIService } from '../../server/ai/openaiService'
import { PERSONAS } from '../../shared/personas'
import type { AssessmentProfile, StoryMemory } from '../../shared/schema'

function userProfile(): AssessmentProfile {
  return {
    entryState: 'idea_only',
    existingWork: [],
    immediateNeed: 'a strategic next step',
    feedbackStyle: 'direct',
    writerName: 'Writer',
  }
}

function storyMemory(): StoryMemory {
  return {
    project: {
      title: 'Lifeline',
      genre: 'Contained thriller',
      format: 'feature',
      logline: 'A dispatcher hears a dead caller on an emergency line.',
      synopsisSections: {
        setup: 'A city dispatcher hears a voice she buried years ago.',
        act1Break: 'She traces the call to a blocked emergency relay.',
        midpoint: 'The caller knows details from inside her own precinct.',
        act2Break: 'Her closest ally is tied to the cover-up.',
        resolution: 'She exposes the relay and chooses the truth over the badge.',
      },
      treatment: 'Opening: A dispatcher stays late as the impossible call arrives.',
      themes: 'Institutional loyalty versus moral courage.',
    },
    characters: {
      mara: {
        id: 'mara',
        name: 'Mara',
        role: 'Dispatcher',
        backstory: 'Lost her brother after a failed call.',
        motivation: 'Prove the system failed him.',
        arc: 'Moves from control to public truth.',
      },
    },
    outline: {
      acts: 3,
      beats: [{ id: 'opening', act: 1, description: 'Opening Image: the line rings after midnight.' }],
      scenes: [{ id: 's1', heading: 'INT. CALL CENTER - NIGHT', index: 1 }],
    },
    worldRules: {
      setting: 'A privatized emergency dispatch network.',
      toneAnchors: 'Michael Mann pressure with procedural intimacy.',
      rules: 'Every call leaves a sealed audit trail.',
    },
    dialogue: {
      voiceNotes: 'Spare, clipped, and morally loaded.',
    },
    script: {
      excerpt: 'INT. CALL CENTER - NIGHT\nThe abandoned line rings.',
      sceneHeadings: ['INT. CALL CENTER - NIGHT'],
      dialogueSnippets: ['MARA: I know that breathing.'],
      actionSnippets: ['Mara lifts the receiver.'],
      characterNames: ['MARA'],
      excerptWordCount: 9,
      excerptWordLimit: 500,
      excerptTruncated: false,
    },
    userProfile: userProfile(),
    decisions: [],
  }
}

beforeEach(() => {
  providerCalls.length = 0
})

describe('Morgan Showrunner prompt', () => {
  it('gives writingPartner a distinct Morgan Showrunner identity instead of the generic specialist prompt', () => {
    const morganPrompt = createPersonaSystemPrompt(
      PERSONAS.writingPartner,
      userProfile(),
      storyMemory(),
      'Give me a showrunner read.',
    )
    const samPrompt = createPersonaSystemPrompt(
      PERSONAS.sam,
      userProfile(),
      storyMemory(),
      'Give me a showrunner read.',
    )

    expect(morganPrompt).toContain('You are Morgan, the Showrunner')
    expect(morganPrompt).toContain('MORGAN OPERATING CONTRACT')
    expect(morganPrompt).toMatch(/host/i)
    expect(morganPrompt).toMatch(/triage/i)
    expect(morganPrompt).toMatch(/synthesize/i)
    expect(morganPrompt).toMatch(/not a passive router/i)
    expect(morganPrompt).toMatch(/no silent edits/i)
    expect(morganPrompt).not.toContain('You are Writing Partner, a Creative Director')
    expect(samPrompt).toContain('You are Sam, a Synopsis Specialist')
    expect(samPrompt).not.toContain('MORGAN OPERATING CONTRACT')
  })

  it('keeps Morgan grounded in the full project context sections', () => {
    const prompt = createPersonaSystemPrompt(
      PERSONAS.writingPartner,
      userProfile(),
      storyMemory(),
      'What should I work on next?',
    )

    expect(prompt).toContain('WRITING PARTNER BRIEF:')
    expect(prompt).toContain('SYNOPSIS SECTIONS:')
    expect(prompt).toContain('CHARACTERS:')
    expect(prompt).toContain('OUTLINE BEATS:')
    expect(prompt).toContain('TREATMENT:')
    expect(prompt).toContain('SCRIPT SCENES:')
    expect(prompt).toContain('STORY BIBLE:')
  })
})

describe('Morgan response headroom', () => {
  it('calls the model with more max token headroom for Morgan than for specialists', async () => {
    const service = new OpenAIService()
    const profile = userProfile()
    const memory = storyMemory()

    await service.generatePersonaResponse(PERSONAS.writingPartner, 'Give me a showrunner read.', profile, memory, [])
    await service.generatePersonaResponse(PERSONAS.sam, 'Help with the logline.', profile, memory, [])

    expect(providerCalls).toHaveLength(2)
    expect(providerCalls[0].maxTokens).toBeGreaterThan(providerCalls[1].maxTokens ?? 0)
    expect(providerCalls[1].maxTokens).toBe(800)
  })
})
