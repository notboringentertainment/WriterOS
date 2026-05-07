import { describe, it, expect } from 'vitest'
import { createContextSummary, parseJsonObject } from '../../server/ai/openaiService'
import type { StoryMemory } from '../../shared/schema'

function storyMemory(overrides: Partial<StoryMemory> = {}): StoryMemory {
  return {
    project: {},
    characters: {},
    outline: { acts: 3, beats: [] },
    worldRules: {},
    dialogue: {},
    userProfile: {
      entryState: 'idea_only',
      existingWork: [],
      immediateNeed: '',
      feedbackStyle: 'direct',
      writerName: 'Writer',
    },
    decisions: [],
    ...overrides,
  }
}

function populatedStoryMemory(): StoryMemory {
  return storyMemory({
    project: {
      synopsisSections: {
        setup: 'A city under quiet surveillance.',
        act1Break: 'The courier accepts the package.',
        midpoint: '',
        act2Break: 'Her ally betrays her.',
        resolution: '',
      },
      themes: 'Grief can become civic courage.',
    },
    characters: {
      c1: {
        id: 'c1',
        name: 'Elena',
        role: 'Courier',
        backstory: 'Lost her sister',
        motivation: 'Justice',
        arc: 'Learns to rely on others',
      },
    },
    outline: {
      acts: 3,
      beats: [
        { id: 'opening-image', act: 1, description: 'Opening Image: Rain over the city.' },
      ],
      scenes: [{ id: 's1', heading: 'INT. OFFICE - NIGHT', index: 1 }],
    },
    worldRules: {
      setting: 'Near-future Tokyo',
      toneAnchors: 'Michael Mann meets Arrival',
      rules: 'Drones cannot enter temples.',
    },
    dialogue: {
      voiceNotes: 'Spare and intimate',
    },
  })
}

describe('createContextSummary', () => {
  it('returns an empty-state summary when no structured details are filled', () => {
    expect(createContextSummary(storyMemory())).toBe('No structured project details yet.')
  })

  it('formats structured project memory with readable section labels', () => {
    const summary = createContextSummary(populatedStoryMemory())

    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('- Act 1 Break: The courier accepts the package.')
    expect(summary).toContain('- Act 2 Break: Her ally betrays her.')
    expect(summary).not.toContain('act1Break')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).toContain('Elena (role: Courier; wound/backstory: Lost her sister; motivation: Justice; arc: Learns to rely on others)')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('- Opening Image: Rain over the city.')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('- 1. INT. OFFICE - NIGHT')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('- Voice notes: Spare and intimate')
  })

  it('emphasizes synopsis context for Sam without including world bible details', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'sam')

    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).not.toContain('STORY BIBLE:')
    expect(summary.indexOf('SYNOPSIS SECTIONS:')).toBeLessThan(summary.indexOf('OUTLINE BEATS:'))
  })

  it('emphasizes world context for Zoe without including synopsis sections', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'zoe')

    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).not.toContain('SYNOPSIS SECTIONS:')
    expect(summary.indexOf('STORY BIBLE:')).toBeLessThan(summary.indexOf('SCRIPT SCENES:'))
  })

  it('emphasizes character context for Casey without including outline beats', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'casey')

    expect(summary).toContain('CHARACTERS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).not.toContain('OUTLINE BEATS:')
    expect(summary.indexOf('CHARACTERS:')).toBeLessThan(summary.indexOf('STORY BIBLE:'))
  })

  it('emphasizes structure context for Oliver without including story bible details', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'oliver')

    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).not.toContain('STORY BIBLE:')
    expect(summary).not.toContain('CHARACTERS:')
    expect(summary.indexOf('OUTLINE BEATS:')).toBeLessThan(summary.indexOf('SCRIPT SCENES:'))
  })

  it('emphasizes dialogue and voice context for Maya without including synopsis sections', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'maya')

    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).not.toContain('SYNOPSIS SECTIONS:')
    expect(summary).not.toContain('OUTLINE BEATS:')
    expect(summary.indexOf('SCRIPT SCENES:')).toBeLessThan(summary.indexOf('CHARACTERS:'))
  })

  it('gives Alex a full project-progress context in progress-first order', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'alex')

    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary.indexOf('OUTLINE BEATS:')).toBeLessThan(summary.indexOf('SCRIPT SCENES:'))
    expect(summary.indexOf('SCRIPT SCENES:')).toBeLessThan(summary.indexOf('SYNOPSIS SECTIONS:'))
  })

  it('uses the balanced context order for unknown personas', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'unknown')

    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary.indexOf('SYNOPSIS SECTIONS:')).toBeLessThan(summary.indexOf('CHARACTERS:'))
    expect(summary.indexOf('CHARACTERS:')).toBeLessThan(summary.indexOf('OUTLINE BEATS:'))
  })

  it('truncates long values in summary lines', () => {
    const summary = createContextSummary(storyMemory({
      worldRules: {
        setting: 'A'.repeat(260),
      },
    }))

    expect(summary).toContain(`${'A'.repeat(219)}…`)
    expect(summary).not.toContain('A'.repeat(260))
  })
})

describe('parseJsonObject', () => {
  it('parses raw JSON responses', () => {
    expect(parseJsonObject('{"message":"hello"}')).toEqual({ message: 'hello' })
  })

  it('parses Claude-style fenced JSON responses', () => {
    expect(parseJsonObject('```json\n{"message":"hello"}\n```')).toEqual({ message: 'hello' })
  })
})
