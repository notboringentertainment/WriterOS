import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the systemPrompt handed to the model so we can assert on the persona
// system prompt without exposing the private createPersonaSystemPrompt.
const captured: { systemPrompt: string | null } = { systemPrompt: null }

vi.mock('../../server/ai/modelProvider', () => ({
  createModelProvider: () => ({
    name: 'test',
    model: 'test-model',
    isConfigured: () => true,
    generateResponse: vi.fn(async (input: { systemPrompt: string }) => {
      captured.systemPrompt = input.systemPrompt
      return JSON.stringify({ message: 'ok', suggestions: [] })
    }),
  }),
}))

import { OpenAIService } from '../../server/ai/openaiService'
import { PERSONAS } from '../../shared/personas'
import type { StoryMemory, AssessmentProfile } from '../../shared/schema'
import type { VoiceProfileDocument } from '../../shared/voiceProfile'

const WARM_LINE = '- Warm and encouraging, but specific and actionable'
const REGISTER_MARKER = 'YOUR STANCE'

function userProfile(): AssessmentProfile {
  return {
    entryState: 'idea_only',
    existingWork: [],
    immediateNeed: '',
    feedbackStyle: 'direct',
    writerName: 'Writer',
  }
}

function storyMemory(): StoryMemory {
  return {
    project: {},
    characters: {},
    outline: { acts: 3, beats: [] },
    worldRules: {},
    dialogue: {},
    userProfile: userProfile(),
    decisions: [],
  }
}

function voiceProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    displayName: 'Ben',
    archetype: 'The Moral-Complexity Dramatist',
    coreStatement: 'Elevated genre with a conscience.',
    creativeNorthStars: ['Earn every beat'],
    storytellingDNA: { principles: ['No filler'], recurringThemes: ['loyalty', 'compromise'], notes: '' },
    influences: { writers: [], directors: [], filmsAndShows: [], scenesAndLines: [], notes: 'Sheridan, Mann' },
    characterInstincts: { drawnTo: [], rejects: [], notes: '' },
    dialogue: { rules: [], instinctsByMode: '', avoidances: [] },
    visualLanguage: { instincts: ['negative space'], notes: '' },
    process: { whenFlowing: '', stuckPatterns: [], supportNeeds: [] },
    strengths: [],
    growthEdges: [],
    collaborationPreferences: { always: [], never: [], feedbackStyle: 'blunt, no cushioning' },
    alexCoachingNotes: [],
  }
}

async function promptFor(profile?: VoiceProfileDocument): Promise<string> {
  captured.systemPrompt = null
  const service = new OpenAIService()
  await service.generatePersonaResponse(
    PERSONAS.sam,
    'Help me with my logline.',
    userProfile(),
    storyMemory(),
    [],
    profile,
  )
  if (captured.systemPrompt == null) throw new Error('systemPrompt not captured')
  return captured.systemPrompt
}

beforeEach(() => {
  captured.systemPrompt = null
})

describe('persona system prompt — voice profile conditioning', () => {
  it('keeps the original "Warm and encouraging" line and no register block when no profile (byte-stable no-profile path)', async () => {
    const prompt = await promptFor(undefined)
    expect(prompt).toContain(WARM_LINE)
    expect(prompt).not.toContain(REGISTER_MARKER)
  })

  it('replaces the warm line with the literal register stance when a profile is present', async () => {
    const prompt = await promptFor(voiceProfile())
    expect(prompt).toContain(REGISTER_MARKER)
    expect(prompt).not.toContain(WARM_LINE)
  })

  it('renders a shared voice-profile subset block from the writer profile', async () => {
    const prompt = await promptFor(voiceProfile())
    expect(prompt).toContain('The Moral-Complexity Dramatist') // archetype
    expect(prompt).toContain('Elevated genre with a conscience.') // core statement
  })
})
