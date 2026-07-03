import { describe, expect, it } from 'vitest'
import { sliceVoiceProfileForWorldContext, type VoiceProfileDocument } from '../../shared/voiceProfile'

function makeProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    displayName: 'Ben',
    archetype: 'Humanist genre pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure'],
    storytellingDNA: {
      principles: ['emotion through action'],
      recurringThemes: ['identity under pressure'],
      notes: 'Keep wonder grounded in behavior.',
    },
    influences: {
      writers: ['Ursula K. Le Guin'],
      directors: ['Denis Villeneuve'],
      filmsAndShows: ['Arrival'],
      scenesAndLines: ['quiet impossible choice'],
      notes: 'Measured, humane, precise.',
    },
    characterInstincts: {
      drawnTo: ['competent people with private grief'],
      rejects: ['empty cynicism'],
      notes: 'Characters reveal values under pressure.',
    },
    dialogue: {
      rules: ['subtext before explanation'],
      instinctsByMode: 'spare when emotional',
      avoidances: ['generic banter'],
    },
    visualLanguage: {
      instincts: ['clean frames', 'lonely scale'],
      notes: 'Beauty with restraint.',
    },
    process: {
      whenFlowing: 'outline then draft',
      stuckPatterns: ['explaining the world too early'],
      supportNeeds: ['ask for the concrete choice'],
    },
    strengths: ['premise'],
    growthEdges: ['externalizing conflict earlier'],
    collaborationPreferences: {
      always: ['be direct'],
      never: ['flatten the weirdness'],
      feedbackStyle: 'specific and candid',
    },
    alexCoachingNotes: ['protect momentum'],
  }
}

describe('Voice Profile world-context slice', () => {
  it('includes only the Phase 2 world-context allowlist', () => {
    const slice = sliceVoiceProfileForWorldContext(makeProfile())

    expect(slice).toEqual({
      slice: 'world_context',
      displayName: 'Ben',
      archetype: 'Humanist genre pressure',
      coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
      storytellingDNA: {
        recurringThemes: ['identity under pressure'],
      },
      influences: {
        notes: 'Measured, humane, precise.',
      },
      visualLanguage: {
        instincts: ['clean frames', 'lonely scale'],
        notes: 'Beauty with restraint.',
      },
    })

    const serialized = JSON.stringify(slice)
    expect(serialized).not.toContain('characterInstincts')
    expect(serialized).not.toContain('subtext before explanation')
    expect(serialized).not.toContain('alexCoachingNotes')
    expect(serialized).not.toContain('be direct')
    expect(serialized).not.toContain('Ursula K. Le Guin')
  })
})
