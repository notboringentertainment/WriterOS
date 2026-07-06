import { describe, expect, it } from 'vitest'
import {
  FEATURE_STORY_BIBLE_DECK,
  SERIES_STORY_BIBLE_DECK,
  buildStoryBiblePatch,
  getDeckForFormat,
  getMappingPaths,
  isComposite,
  resolveStoryBiblePath,
  storyBibleProbeContent,
  type StoryBiblePromptDef,
} from '../../client/src/lib/storyBibleDeck'
import {
  StoryBibleDocumentContentSchema,
  createEmptyStoryBibleContent,
} from '../../shared/documents'

const EXPECTED_FEATURE_IDS = [
  'feature-title',
  'feature-writer',
  'feature-genre',
  'feature-status',
  'feature-clean-sentence',
  'feature-nutshell',
  'feature-why-matters',
  'feature-reader-promise',
  'feature-central-question',
  'feature-different-angle',
  'feature-tone-words',
  'feature-comps',
  'feature-anti-comps',
  'feature-style-feel',
  'feature-tone-rules',
  'feature-never-feel-like',
  'feature-story-world',
  'feature-world-rules',
  'feature-public-history',
  'feature-hidden-history',
  'feature-mythology-reveals',
  'feature-characters',
  'feature-locks',
  'feature-starting-state',
  'feature-premise-alive',
  'feature-future-potential',
] as const

const EXPECTED_SERIES_IDS = [
  'series-title',
  'series-writer',
  'series-genre',
  'series-status',
  'series-clean-sentence',
  'series-nutshell',
  'series-why-matters',
  'series-reader-promise',
  'series-central-question',
  'series-different-angle',
  'series-tone-words',
  'series-comps',
  'series-anti-comps',
  'series-style-feel',
  'series-tone-rules',
  'series-never-feel-like',
  'series-story-world',
  'series-world-rules',
  'series-public-history',
  'series-hidden-history',
  'series-mythology-reveals',
  'series-characters',
  'series-locks',
  'series-repeatable-pressure',
  'series-premise-renewal',
  'series-pilot-pressure',
  'series-season-one-shape',
  'series-future-potential',
] as const

const ALL_PROMPTS: readonly StoryBiblePromptDef[] = [
  ...FEATURE_STORY_BIBLE_DECK,
  ...SERIES_STORY_BIBLE_DECK,
]

describe('FEATURE_STORY_BIBLE_DECK', () => {
  it('contains all V1 prompt IDs in fixed order', () => {
    expect(FEATURE_STORY_BIBLE_DECK.map((prompt) => prompt.id)).toEqual([
      ...EXPECTED_FEATURE_IDS,
    ])
  })

  it('marks every prompt as deck "feature"', () => {
    for (const prompt of FEATURE_STORY_BIBLE_DECK) {
      expect(prompt.deck).toBe('feature')
    }
  })
})

describe('SERIES_STORY_BIBLE_DECK', () => {
  it('contains all V1 prompt IDs in fixed order', () => {
    expect(SERIES_STORY_BIBLE_DECK.map((prompt) => prompt.id)).toEqual([
      ...EXPECTED_SERIES_IDS,
    ])
  })

  it('marks every prompt as deck "series"', () => {
    for (const prompt of SERIES_STORY_BIBLE_DECK) {
      expect(prompt.deck).toBe('series')
    }
  })
})

describe('story bible prompt input structure', () => {
  it('every prompt has at least one input', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(
        prompt.inputs.length,
        `prompt ${prompt.id} must have at least one input`,
      ).toBeGreaterThan(0)
    }
  })

  it('every input has a valid kind', () => {
    const validKinds = new Set(['text', 'textarea', 'comps', 'status', 'tone-words', 'characters', 'locks'])

    for (const prompt of ALL_PROMPTS) {
      for (const input of prompt.inputs) {
        expect(
          validKinds.has(input.kind),
          `prompt ${prompt.id} kind "${input.kind}" must be valid`,
        ).toBe(true)
      }
    }
  })

  it('composite prompts carry per-input labels and at least two mapping paths', () => {
    for (const prompt of ALL_PROMPTS) {
      if (isComposite(prompt)) {
        expect(getMappingPaths(prompt).length).toBeGreaterThanOrEqual(2)
        for (const input of prompt.inputs) {
          expect(input.label, `prompt ${prompt.id} input ${input.path} must have a label`).toBeDefined()
        }
      }
    }
  })
})

describe('story bible prompt content discipline', () => {
  it('every prompt has a non-empty plain-language question', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(
        prompt.question.trim().length,
        `prompt ${prompt.id} must have a question`,
      ).toBeGreaterThan(0)
      expect(
        /[?.]$/.test(prompt.question.trim()),
        `prompt ${prompt.id} must read as a plain-language story prompt`,
      ).toBe(true)
    }
  })

  it('no prompt renders its documentLabel as its question', () => {
    for (const prompt of ALL_PROMPTS) {
      const docParts = prompt.documentLabel
        .split('/')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
      const question = prompt.question.trim().toLowerCase()

      for (const part of docParts) {
        expect(
          question,
          `prompt ${prompt.id} must not use documentLabel "${part}" as its question`,
        ).not.toBe(part)
      }
    }
  })

  it('both decks expose a locks prompt mapped to the top-level locks array', () => {
    for (const deck of [FEATURE_STORY_BIBLE_DECK, SERIES_STORY_BIBLE_DECK]) {
      const locksPrompt = deck.find((prompt) => prompt.inputs.some((input) => input.kind === 'locks'))
      expect(locksPrompt).toBeDefined()
      expect(getMappingPaths(locksPrompt!)).toEqual(['locks'])
    }
  })

  it('does not include cover.format as an editable mapping path', () => {
    const paths = ALL_PROMPTS.flatMap((prompt) => [...getMappingPaths(prompt)])
    expect(paths).not.toContain('cover.format')
  })

  it('every mapping path resolves against StoryBibleDocumentContent', () => {
    const probe = storyBibleProbeContent()
    expect(StoryBibleDocumentContentSchema.safeParse(probe).success).toBe(true)

    for (const prompt of ALL_PROMPTS) {
      for (const path of getMappingPaths(prompt)) {
        const result = resolveStoryBiblePath(probe, path)
        expect(result.defined, `prompt ${prompt.id} path "${path}" must resolve`).toBe(true)
      }
    }
  })
})

describe('getDeckForFormat', () => {
  it('returns the feature deck for "feature"', () => {
    expect(getDeckForFormat('feature')).toBe(FEATURE_STORY_BIBLE_DECK)
  })

  it('returns the series deck for "series"', () => {
    expect(getDeckForFormat('series')).toBe(SERIES_STORY_BIBLE_DECK)
  })

  it('keeps feature-only and series-only story engine paths format-specific', () => {
    const featurePaths = FEATURE_STORY_BIBLE_DECK.flatMap((prompt) => [...getMappingPaths(prompt)])
    const seriesPaths = SERIES_STORY_BIBLE_DECK.flatMap((prompt) => [...getMappingPaths(prompt)])

    expect(featurePaths).toContain('storyEngine.featurePropulsion')
    expect(featurePaths).not.toContain('storyEngine.seriesEngine')
    expect(featurePaths).not.toContain('storyEngine.pilotEngine')
    expect(featurePaths).not.toContain('storyEngine.seasonArc')

    expect(seriesPaths).toContain('storyEngine.seriesEngine')
    expect(seriesPaths).toContain('storyEngine.pilotEngine')
    expect(seriesPaths).toContain('storyEngine.seasonArc')
    expect(seriesPaths).not.toContain('storyEngine.featurePropulsion')
  })
})

describe('resolveStoryBiblePath', () => {
  it('returns defined for known leaves and character array paths', () => {
    const probe = storyBibleProbeContent()
    expect(resolveStoryBiblePath(probe, 'cover.title').defined).toBe(true)
    expect(resolveStoryBiblePath(probe, 'characters').defined).toBe(true)
    expect(resolveStoryBiblePath(probe, 'characters.0.name').defined).toBe(true)
  })

  it('returns not-defined for unknown or missing paths', () => {
    const probe = storyBibleProbeContent()
    expect(resolveStoryBiblePath(probe, 'cover.bogus').defined).toBe(false)
    expect(resolveStoryBiblePath(probe, 'characters.9.name').defined).toBe(false)
    expect(resolveStoryBiblePath(probe, 'storyEngine.does.not.exist').defined).toBe(false)
  })
})

describe('storyBibleProbeContent', () => {
  it('is a schema-valid probe with one character row', () => {
    const probe = storyBibleProbeContent()
    expect(StoryBibleDocumentContentSchema.safeParse(probe).success).toBe(true)
    expect(probe.characters).toHaveLength(1)
  })
})

describe('buildStoryBiblePatch', () => {
  it('builds a top-level patch for a single-segment path', () => {
    const content = storyBibleProbeContent()
    const patch = buildStoryBiblePatch(content, 'characters', [])
    expect(patch).toEqual({ characters: [] })
  })

  it('preserves untouched sibling fields when patching nested paths', () => {
    const content = storyBibleProbeContent()
    content.onePagePitch.whyThisMatters = 'Because mercy under pressure matters.'
    const patch = buildStoryBiblePatch(content, 'onePagePitch.logline', 'A city seals itself.')
    expect(patch.onePagePitch?.logline).toBe('A city seals itself.')
    expect(patch.onePagePitch?.whyThisMatters).toBe('Because mercy under pressure matters.')
  })

  it('patches a three-level nested character path', () => {
    const content = storyBibleProbeContent()
    const patch = buildStoryBiblePatch(content, 'characters.0.name', 'Elena')
    expect(patch.characters?.[0].name).toBe('Elena')
    expect(patch.characters?.[0].id).toBe('character-probe')
  })

  it('does not mutate the input content', () => {
    const content = storyBibleProbeContent()
    const before = JSON.stringify(content)
    buildStoryBiblePatch(content, 'cover.title', 'New Title')
    buildStoryBiblePatch(content, 'characters.0.name', 'Elena')
    expect(JSON.stringify(content)).toBe(before)
  })

  it('is deterministic for identical input', () => {
    const content = createEmptyStoryBibleContent()
    const a = buildStoryBiblePatch(content, 'storyEngine.featurePropulsion', 'A pressure.')
    const b = buildStoryBiblePatch(content, 'storyEngine.featurePropulsion', 'A pressure.')
    expect(a).toEqual(b)
  })
})
