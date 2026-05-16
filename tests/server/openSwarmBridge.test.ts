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
    state.synopsis.logline = 'A medic must expose a corrupt rescue network before her brother disappears.'
    state.outline.beats = state.outline.beats.map(beat =>
      beat.id === 'midpoint'
        ? { ...beat, notes: 'The rescue turns personal when the missing patient is family.' }
        : beat
    )

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
    expect(prompt).toContain('Context inventory:')
    expect(prompt).toContain('Voice Profile: supplied')
    expect(prompt).toContain('Synopsis: 1 filled field')
    expect(prompt).toContain('Outline: 1 beat note supplied')
    expect(prompt).toContain('Midpoint: The rescue turns personal when the missing patient is family.')
    expect(prompt).toContain('Task response contract:')
    expect(prompt).toContain('Treat the user question as a task request')
    expect(prompt).toContain('Respond like a concise review memo or task report')
    expect(prompt).toContain('Use plain text only')
    expect(prompt).toContain('Do not use Markdown heading markers')
    expect(prompt).toContain('Use compact section labels that end with a colon')
    expect(prompt).toContain('Target 250-450 words')
  })

  it('is explicit when no Voice Profile is supplied', () => {
    const prompt = buildOpenSwarmWritingPartnerPrompt(
      'Review this premise.',
      buildProjectContext(defaultProjectState())
    )

    expect(prompt).toContain('Writer Voice Profile supplied by WriterOS:')
    expect(prompt).toContain('None supplied by WriterOS for this request')
  })

  it('does not treat default outline beat descriptions as project-authored context', () => {
    const prompt = buildOpenSwarmWritingPartnerPrompt(
      'Review this premise.',
      buildProjectContext(defaultProjectState()),
      makeVoiceProfile()
    )

    expect(prompt).toContain('Outline: 0 beat notes supplied')
    expect(prompt).toContain('Outline beats:\n- None supplied')
    expect(prompt).toContain('Do not ask the user to paste material into chat')
    expect(prompt).toContain('name the WriterOS surface to fill')
    expect(prompt).not.toContain('Theme Stated: Someone')
    expect(prompt).not.toContain('Opening Image: A single scene')
  })

  it('emits format and showOverview in the project context block', () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.synopsis.content.header.format = 'feature'
    state.documents.synopsis.content.series = {
      seriesType: 'ongoing',
      episodeLength: 'hour',
      showOverview: 'A renewable conflict in a sealed city.',
      pilot: { logline: '', prose: '' },
      seasonOneArc: '',
      futureSeasons: [],
      characters: [],
      compsAndWhyThisShowNow: '',
    }

    const prompt = buildOpenSwarmWritingPartnerPrompt(
      'Review this series premise.',
      buildProjectContext(state)
    )

    expect(prompt).toContain('- Format: series')
    expect(prompt).toContain('- Show Overview: A renewable conflict in a sealed city.')
  })

  it('falls back to feature and Not supplied when format and showOverview are empty', () => {
    const prompt = buildOpenSwarmWritingPartnerPrompt(
      'Review this premise.',
      buildProjectContext(defaultProjectState())
    )

    expect(prompt).toContain('- Format: feature')
    expect(prompt).toContain('- Show Overview: Not supplied')
  })
})
