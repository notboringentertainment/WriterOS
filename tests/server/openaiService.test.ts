import { describe, it, expect } from 'vitest'
import {
  buildPersonaCapabilitySynthesisPrompt,
  createContextSummary,
  createWritingPartnerBrief,
  parseJsonObject,
  parsePersonaCapabilitySynthesisResponse,
  sanitizePersonaMessageFormatting,
} from '../../server/ai/openaiService'
import type { StoryMemory } from '../../shared/schema'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'

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

    expect(summary).toContain('WRITING PARTNER BRIEF:')
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

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).not.toContain('STORY BIBLE:')
    expect(summary.indexOf('SYNOPSIS SECTIONS:')).toBeLessThan(summary.indexOf('OUTLINE BEATS:'))
  })

  it('uses rich Synopsis document text for Sam when legacy sections are empty', () => {
    const summary = createContextSummary(storyMemory({
      project: {
        format: 'feature',
        logline: 'A medic exposes a rescue conspiracy before her brother vanishes.',
        synopsis: [
          'Feature logline: A medic exposes a rescue conspiracy before her brother vanishes.',
          'Opening: A medic hears a missing patient on the emergency line.',
          'Resolution: She exposes the network and saves her brother.',
        ].join('\n\n'),
        synopsisSections: {
          setup: '',
          act1Break: '',
          midpoint: '',
          act2Break: '',
          resolution: '',
        },
      },
    }), 'sam')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('SYNOPSIS:')
    expect(summary).toContain('Feature logline: A medic exposes')
    expect(summary).toContain('Opening: A medic hears')
    expect(summary).not.toContain('SYNOPSIS SECTIONS:')
  })

  it('emphasizes world context for Zoe without including synopsis sections', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'zoe')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).not.toContain('SYNOPSIS SECTIONS:')
    expect(summary.indexOf('STORY BIBLE:')).toBeLessThan(summary.indexOf('SCRIPT SCENES:'))
  })

  it('emphasizes character context for Casey with treatment and outline details', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'casey')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary.indexOf('CHARACTERS:')).toBeLessThan(summary.indexOf('STORY BIBLE:'))
    expect(summary.indexOf('CHARACTERS:')).toBeLessThan(summary.indexOf('OUTLINE BEATS:'))
  })

  it('shows Casey actual treatment and outline content when a character question needs it', () => {
    const summary = createContextSummary(storyMemory({
      project: {
        treatment: [
          'Character: Isaiah (role: emergency dispatcher; want: keep control of every rescue; need: admit he cannot save everyone)',
          'Opening: Isaiah keeps answering calls after his shift because silence feels like betrayal.',
        ].join('\n'),
      },
      characters: {
        isaiah: {
          id: 'isaiah',
          name: 'Isaiah',
          role: 'Emergency dispatcher',
          motivation: 'want: keep control of every rescue; need: admit he cannot save everyone',
          arc: 'Moves from control to trust.',
        },
      },
      outline: {
        acts: 3,
        beats: [
          {
            id: 'spine',
            act: 1,
            description: 'Story spine: What they need: Isaiah must admit he cannot save everyone.',
          },
        ],
      },
    }), 'casey', 'What does Isaiah need?')

    expect(summary).toContain('CHARACTERS:')
    expect(summary).toContain('need: admit he cannot save everyone')
    expect(summary).toContain('TREATMENT:')
    expect(summary).toContain('Opening: Isaiah keeps answering calls')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('Story spine: What they need: Isaiah must admit')
  })

  it('emphasizes structure context for Oliver without including story bible details', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'oliver')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).not.toContain('STORY BIBLE:')
    expect(summary).not.toContain('CHARACTERS:')
    expect(summary.indexOf('OUTLINE BEATS:')).toBeLessThan(summary.indexOf('SCRIPT SCENES:'))
  })

  it('emphasizes dialogue and voice context for Maya without including synopsis sections', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'maya')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).not.toContain('SYNOPSIS SECTIONS:')
    expect(summary).not.toContain('OUTLINE BEATS:')
    expect(summary.indexOf('SCRIPT SCENES:')).toBeLessThan(summary.indexOf('CHARACTERS:'))
  })

  it('gives Alex a full project-progress context in progress-first order', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'alex')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary).toContain('SCRIPT SCENES:')
    expect(summary).toContain('SYNOPSIS SECTIONS:')
    expect(summary).toContain('STORY BIBLE:')
    expect(summary).toContain('CHARACTERS:')
    expect(summary.indexOf('OUTLINE BEATS:')).toBeLessThan(summary.indexOf('SCRIPT SCENES:'))
    expect(summary.indexOf('SCRIPT SCENES:')).toBeLessThan(summary.indexOf('SYNOPSIS SECTIONS:'))
  })

  it('prioritizes authored treatment prose for Alex when available', () => {
    const summary = createContextSummary(storyMemory({
      project: {
        treatment: 'Opening: Sara ends a night shift as the silent emergency line rings.',
      },
      outline: {
        acts: 3,
        beats: [{ id: 'midpoint', act: 2, description: 'Midpoint: the caller is family.' }],
      },
    }), 'alex')

    expect(summary).toContain('TREATMENT:')
    expect(summary).toContain('Opening: Sara ends a night shift')
    expect(summary).toContain('OUTLINE BEATS:')
    expect(summary.indexOf('TREATMENT:')).toBeLessThan(summary.indexOf('OUTLINE BEATS:'))
  })

  it('uses the balanced context order for unknown personas', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'unknown')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
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

  it('includes actual script dialogue in Maya context', () => {
    const summary = createContextSummary(storyMemory({
      script: {
        excerpt: [
          'INT. SWITCHBOARD ROOM - NIGHT',
          'Isaiah lifts the receiver.',
          'ISAIAH',
          'I can still hear the line breathing.',
        ].join('\n'),
        sceneHeadings: ['INT. SWITCHBOARD ROOM - NIGHT'],
        dialogueSnippets: ['ISAIAH: I can still hear the line breathing.'],
        actionSnippets: ['Isaiah lifts the receiver.'],
        characterNames: ['ISAIAH'],
        excerptWordCount: 15,
        excerptWordLimit: 500,
        excerptTruncated: false,
      },
      characters: {
        isaiah: {
          id: 'isaiah',
          name: 'Isaiah',
          role: 'Dispatcher',
        },
      },
      outline: {
        acts: 3,
        beats: [],
        scenes: [{ id: 's1', heading: 'INT. SWITCHBOARD ROOM - NIGHT', index: 1 }],
      },
    }), 'maya')

    expect(summary).toContain('WRITING PARTNER BRIEF:')
    expect(summary).toContain('SCRIPT EXCERPT (15 words):')
    expect(summary).toContain('ISAIAH: I can still hear the line breathing.')
    expect(summary).toContain('ACTION SNIPPETS:')
    expect(summary.indexOf('SCRIPT SCENES:')).toBeLessThan(summary.indexOf('CHARACTERS:'))
  })

  it('selects later dialogue samples when the request names the speakers', () => {
    const earlyIsaiahLines = Array.from({ length: 14 }, (_, index) => `ISAIAH: Early line ${index}.`)
    const memory = storyMemory({
      script: {
        excerpt: 'Opening excerpt before the office scene.',
        sceneHeadings: ['INT. LIFELINE HQ - DANTE OFFICE - DAY'],
        dialogueSnippets: [
          ...earlyIsaiahLines,
          'ISAIAH: Just a heads-up, I have got a meeting with Qadir.',
          'DANTE: You are welcome.',
          'ISAIAH: So it was you. You gave him my direct line.',
          'DANTE: He has a thing for you.',
          'DANTE: Your war is over, brotha.',
        ],
        characterNames: ['ISAIAH', 'DANTE'],
        excerptWordCount: 6,
        excerptWordLimit: 500,
        excerptTruncated: false,
      },
      dialogue: {
        voiceNotes: 'Dante jokes to soften Isaiah.',
      },
    })

    const unfocusedSummary = createContextSummary(memory, 'maya')
    const focusedSummary = createContextSummary(memory, 'maya', 'Rate the dialogue between Isaiah and Dante.')

    expect(unfocusedSummary).not.toContain('DANTE: You are welcome.')
    expect(focusedSummary).toContain('DANTE: You are welcome.')
    expect(focusedSummary).toContain('ISAIAH: So it was you. You gave him my direct line.')
    expect(focusedSummary).not.toContain('ISAIAH: Early line 0.')
  })

  it('falls back to the first dialogue samples when requested speakers are not present', () => {
    const memory = storyMemory({
      script: {
        excerpt: 'Opening excerpt before the requested speaker appears.',
        sceneHeadings: ['INT. CALL CENTER - NIGHT'],
        dialogueSnippets: Array.from({ length: 13 }, (_, index) => `ISAIAH: Line ${index}.`),
        characterNames: ['DANTE'],
        excerptWordCount: 7,
        excerptWordLimit: 500,
        excerptTruncated: false,
      },
    })

    const summary = createContextSummary(memory, 'maya', 'Rate Dante dialogue.')

    expect(summary).toContain('ISAIAH: Line 0.')
    expect(summary).toContain('ISAIAH: Line 11.')
    expect(summary).not.toContain('ISAIAH: Line 12.')
  })

  it('includes client-selected script context metadata when present', () => {
    const summary = createContextSummary(storyMemory({
      script: {
        excerpt: 'INT. LIFELINE HQ - DANTE OFFICE - DAY\nDante shuts the office door.',
        sceneHeadings: ['INT. LIFELINE HQ - DANTE OFFICE - DAY'],
        dialogueSnippets: ['ISAIAH: So it was you.', 'DANTE: Your war is over, brotha.'],
        actionSnippets: ['Dante shuts the office door.'],
        characterNames: ['ISAIAH', 'DANTE'],
        excerptWordCount: 12,
        excerptWordLimit: 500,
        excerptTruncated: false,
        totalWordCount: 12000,
        estimatedPageCount: 48,
        sceneCount: 42,
        contextReason: 'requested-speakers',
        contextLabel: 'INT. LIFELINE HQ - DANTE OFFICE - DAY',
        pageRange: { start: 17, end: 18 },
        selectedText: 'Your war is over, brotha.',
      },
    }), 'maya')

    expect(summary).toContain('SCRIPT CONTEXT:')
    expect(summary).toContain('SELECTED TEXT:')
    expect(summary).toContain('Your war is over, brotha.')
    expect(summary).toContain('about 48 estimated pages')
    expect(summary).toContain('INT. LIFELINE HQ - DANTE OFFICE - DAY | estimated pages 17-18 | requested-speakers')
    expect(summary).toContain('DANTE: Your war is over, brotha.')
  })

  it('includes current Script Facts in persona script context', () => {
    const summary = createContextSummary(storyMemory({
      script: {
        excerpt: 'INT. SAFEHOUSE - NIGHT\nISAIAH\nI can hear it.',
        sceneHeadings: ['INT. SAFEHOUSE - NIGHT'],
        dialogueSnippets: ['ISAIAH: I can hear it.'],
        actionSnippets: [],
        characterNames: ['ISAIAH'],
        facts: {
          rebuiltAt: '2026-06-02T10:00:00.000Z',
          characters: [{ label: 'ISAIAH', count: 3 }],
          locations: [{ label: 'INT. SAFEHOUSE - NIGHT', count: 2 }],
          times: [{ label: 'NIGHT', count: 2 }],
        },
        excerptWordCount: 8,
        excerptWordLimit: 500,
        excerptTruncated: false,
      },
    }), 'maya')

    expect(summary).toContain('SCRIPT FACTS:')
    expect(summary).toContain('- Characters: ISAIAH (3)')
    expect(summary).toContain('- Locations: INT. SAFEHOUSE - NIGHT (2)')
    expect(summary).toContain('- Times: NIGHT (2)')
    expect(summary.indexOf('SCRIPT FACTS:')).toBeLessThan(summary.indexOf('SCRIPT CHARACTER NAMES:'))
  })

  it('marks truncated Script Facts lists with a remaining count', () => {
    const summary = createContextSummary(storyMemory({
      script: {
        facts: {
          rebuiltAt: '2026-06-02T10:00:00.000Z',
          characters: Array.from({ length: 14 }, (_, index) => ({
            label: `CHARACTER ${index + 1}`,
            count: 1,
          })),
          locations: [],
          times: [],
        },
      },
    }), 'maya')

    expect(summary).toContain('- Characters: CHARACTER 1; CHARACTER 2')
    expect(summary).toContain('CHARACTER 12; +2 more')
    expect(summary).not.toContain('CHARACTER 13')
  })

  it('builds a compact Writing Partner brief from script-derived scene headings', () => {
    const brief = createWritingPartnerBrief(storyMemory({
      project: {
        title: 'Lifeline',
        genre: 'Thriller',
        logline: 'A dispatcher hears a dead caller on an emergency line.',
      },
      script: {
        excerpt: 'INT. CALL CENTER - NIGHT\nThe emergency line rings.',
        sceneHeadings: ['INT. CALL CENTER - NIGHT', 'EXT. FREEWAY - NIGHT'],
        excerptWordCount: 8,
        excerptWordLimit: 500,
        excerptTruncated: false,
      },
      outline: {
        acts: 3,
        beats: [],
        scenes: [
          { id: 'legacy-1', heading: 'INT. OLD OUTLINE SCENE - DAY', index: 1 },
          { id: 'legacy-2', heading: 'EXT. OLD OUTLINE SCENE - DAY', index: 2 },
          { id: 'legacy-3', heading: 'INT. THIRD OLD OUTLINE SCENE - DAY', index: 3 },
        ],
      },
    }))

    expect(brief).toContain('Project: "Lifeline" | Thriller')
    expect(brief).toContain('Logline: A dispatcher hears a dead caller on an emergency line.')
    expect(brief).toContain('Script: 8 excerpt words available, 2 scene headings.')
    expect(brief).not.toContain('3 scene headings')
    expect(brief).not.toContain('INT. CALL CENTER - NIGHT')
  })

  it('keeps the Writing Partner brief compact when a specialist owns the full script pack', () => {
    const sensitiveLine = 'MARA: This exact dialogue belongs in the specialist pack.'
    const memory = populatedStoryMemory()
    memory.script = {
      excerpt: sensitiveLine,
      sceneHeadings: [],
      dialogueSnippets: [sensitiveLine],
      excerptWordCount: 500,
      excerptWordLimit: 500,
      excerptTruncated: true,
    }

    const brief = createWritingPartnerBrief(memory)
    const samSummary = createContextSummary(memory, 'sam')

    expect(brief).toContain('Script: 500 excerpt words available, capped at first 500 words')
    expect(brief).not.toContain(sensitiveLine)
    expect(samSummary).toContain('WRITING PARTNER BRIEF:')
    expect(samSummary).toContain('SYNOPSIS SECTIONS:')
    expect(samSummary).not.toContain('SCRIPT EXCERPT')
    expect(samSummary).not.toContain(sensitiveLine)
  })

  it('includes project format in the Writing Partner brief when supplied', () => {
    const brief = createWritingPartnerBrief(storyMemory({
      project: { title: 'Lifeline', genre: 'Thriller', format: 'series' },
    }))

    expect(brief).toContain('Project: "Lifeline" | Thriller')
    expect(brief).toContain('Format: series')
  })

  it('summarizes Script Facts availability in the Writing Partner brief', () => {
    const brief = createWritingPartnerBrief(storyMemory({
      script: {
        facts: {
          rebuiltAt: '2026-06-02T10:00:00.000Z',
          characters: [{ label: 'ISAIAH', count: 1 }, { label: 'DANTE', count: 1 }],
          locations: [{ label: 'INT. SAFEHOUSE - NIGHT', count: 1 }],
          times: [{ label: 'NIGHT', count: 1 }],
        },
      },
    }))

    expect(brief).toContain('Script Facts: 2 characters, 1 location, 1 time marker available.')
  })
})

describe('persona capability synthesis prompt', () => {
  it('requires citations only from verified capability sources and protects Voice Profile citations', () => {
    const prompt = buildPersonaCapabilitySynthesisPrompt({
      personaId: 'zoe',
      taskKind: 'research_world_context',
      userRequest: 'Research Damascus Gate.',
      projectContext: buildProjectContext(defaultProjectState()),
      voiceProfile: {
        slice: 'world_context',
        archetype: 'Humanist genre pressure',
        coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
        storytellingDNA: { recurringThemes: ['identity under pressure'] },
        influences: { notes: 'Measured, humane, precise.' },
        visualLanguage: { instincts: ['clean frames'], notes: 'Beauty with restraint.' },
      },
      taskResult: {
        findings: [
          { claim: 'The current gate dates to the Ottoman period.', sourceLabel: 'Archive', verified: true },
          { claim: 'A disputed legend belongs in texture only.', verified: false },
        ],
        sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
        missing: [],
        unverified: ['Tour-guide patter needs a local source.'],
      },
      sources: [{ label: 'Archive', url: 'https://example.com/archive' }],
      status: 'ok',
    })

    expect(prompt).toContain('Use bracketed source labels like [label]')
    expect(prompt).toContain('Only cite labels from the allowed source label list')
    expect(prompt).toContain('Do not cite Voice Profile content')
    expect(prompt).toContain('Use plain text only')
    expect(prompt).toContain('A disputed legend belongs in texture only')
  })

  it('filters cited labels to known receipt sources', () => {
    const parsed = parsePersonaCapabilitySynthesisResponse(
      JSON.stringify({
        finalMessage: 'Use the Ottoman threshold as verified texture. [Archive] Do not cite this. [Invented]',
        citedLabels: ['Archive', 'Invented'],
      }),
      ['Archive']
    )

    expect(parsed.citedLabels).toEqual(['Archive'])
  })
})

describe('sanitizePersonaMessageFormatting', () => {
  it('removes markdown emphasis from persona messages before transcript display', () => {
    expect(
      sanitizePersonaMessageFormatting(
        "Based on Lifeline, the theme is **trust versus betrayal** and *human connection*."
      )
    ).toBe('Based on Lifeline, the theme is trust versus betrayal and human connection.')
  })

  it('removes markdown heading markers while keeping readable text', () => {
    expect(sanitizePersonaMessageFormatting('### Verdict\nThis works.')).toBe('Verdict\nThis works.')
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

describe('createContextSummary — surface awareness', () => {
  const intakeSurface = {
    kind: 'intake' as const,
    surface: 'outline' as const,
    surfaceTitle: 'Outline',
    format: 'feature' as const,
    questions: [
      { id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the person or group whose choices drive the story.', status: 'unanswered' as const },
      { id: 'spine.theme', label: 'What truth is the story testing?', helper: 'A rough theme is enough.', status: 'unanswered' as const },
    ],
    nextQuestion: { id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the person or group whose choices drive the story.', status: 'unanswered' as const },
    selectionSource: 'first_unanswered' as const,
    answeredCount: 0,
    totalCount: 2,
    nextRecommendedAction: 'answer_next_question' as const,
  }

  it('renders a SURFACE AWARENESS block naming the surface and the next question', () => {
    const summary = createContextSummary(populatedStoryMemory(), 'sam')
    expect(summary).not.toContain('SURFACE AWARENESS')

    const withSurface = createContextSummary({ ...populatedStoryMemory(), surface: intakeSurface }, 'sam')
    expect(withSurface).toContain('SURFACE AWARENESS')
    expect(withSurface).toContain('Outline')
    expect(withSurface).toContain('Who are we following?')
    expect(withSurface).toContain('Name the person or group whose choices drive the story.')
    expect(withSurface).toContain('0/2')
  })

  it('carries the grounding instruction inside the surface block (not in unconditional rules)', () => {
    const withSurface = createContextSummary({ ...populatedStoryMemory(), surface: intakeSurface }, 'sam')
    // The instruction tells the agent to ground "what's next here" in the named question.
    expect(withSurface.toLowerCase()).toMatch(/ground|name the question|the writer is on/)
  })

  it('authorizes the agent to treat the surface block as real app state and forbids denial', () => {
    const withSurface = createContextSummary({ ...populatedStoryMemory(), surface: intakeSurface }, 'sam')
    const lower = withSurface.toLowerCase()
    // Must counter the model's default "I can't see your page" denial.
    expect(lower).toMatch(/provided by the app|live (app )?state|real .*state|authoritative/)
    expect(lower).toMatch(/do not (say|claim|tell).*(can'?t|cannot).*(see|access|view)/)
  })

  it('does not reference a named question when nextQuestion is null', () => {
    const noNext = { ...intakeSurface, nextQuestion: null }
    const summary = createContextSummary({ ...populatedStoryMemory(), surface: noNext }, 'sam')
    expect(summary).toContain('SURFACE AWARENESS')
    expect(summary).not.toContain('question named above')
    expect(summary).not.toContain('next unanswered question is')
  })

  it('renders NOTHING and stays byte-identical when surface is absent or none (F1 guard)', () => {
    const baseline = createContextSummary(populatedStoryMemory(), 'sam')
    expect(createContextSummary({ ...populatedStoryMemory(), surface: undefined }, 'sam')).toBe(baseline)
    expect(createContextSummary({ ...populatedStoryMemory(), surface: { kind: 'none' } }, 'sam')).toBe(baseline)
  })
})
