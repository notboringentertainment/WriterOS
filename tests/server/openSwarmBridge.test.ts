import { describe, expect, it } from 'vitest'
import { buildOpenSwarmWritingPartnerPrompt, openSwarmWritingPartnerSchema } from '../../server/routes'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import type { VoiceProfileDocument } from '@shared/voiceProfile'

function makeVoiceProfile(): VoiceProfileDocument {
  return {
    version: 1,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    displayName: 'Ben',
    archetype: 'Humanist genre pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure', 'genre momentum'],
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
      notes: 'Characters should reveal values under pressure.',
    },
    dialogue: {
      rules: ['subtext before explanation'],
      instinctsByMode: 'spare when emotional, sharper when defensive',
      avoidances: ['generic banter'],
    },
    visualLanguage: {
      instincts: ['clean frames', 'lonely scale'],
      notes: 'Beauty with restraint.',
    },
    process: {
      whenFlowing: 'outline enough to know the pressure, then draft into discovery',
      stuckPatterns: ['explaining the world too early'],
      supportNeeds: ['ask for the concrete choice'],
    },
    strengths: ['premise', 'tone'],
    growthEdges: ['externalizing conflict earlier'],
    collaborationPreferences: {
      always: ['be direct'],
      never: ['flatten the weirdness'],
      feedbackStyle: 'specific and candid',
    },
    alexCoachingNotes: ['protect momentum'],
  }
}

describe('OpenSwarm Writing Partner prompt', () => {
  it('accepts the current client buildProjectContext output as the bridge request shape', () => {
    expect(() => openSwarmWritingPartnerSchema.parse({
      message: 'Review this premise.',
      projectContext: buildProjectContext(defaultProjectState()),
    })).not.toThrow()
  })

  it('includes completed Voice Profile as a writer-scoped handoff section', () => {
    const state = defaultProjectState()
    state.storyBible.world.voiceNotes = 'Project-specific: spare, procedural, intimate.'

    const prompt = buildOpenSwarmWritingPartnerPrompt(
      'Review this against my voice.',
      buildProjectContext(state),
      makeVoiceProfile()
    )

    expect(prompt).toContain('Writer Voice Profile supplied by WriterOS:')
    expect(prompt).toContain('Core statement: I write intimate stories')
    expect(prompt).toContain('Dialogue rules: subtext before explanation')
    expect(prompt).toContain('Voice Profile is writer-scoped and project-agnostic')
    expect(prompt).toContain('Project voice notes: Project-specific: spare, procedural, intimate.')
  })

  it('is explicit when no Voice Profile is supplied', () => {
    const prompt = buildOpenSwarmWritingPartnerPrompt(
      'Review this premise.',
      buildProjectContext(defaultProjectState())
    )

    expect(prompt).toContain('Writer Voice Profile supplied by WriterOS:')
    expect(prompt).toContain('None supplied by WriterOS for this request')
  })
})
