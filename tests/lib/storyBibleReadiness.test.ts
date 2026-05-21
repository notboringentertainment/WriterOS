import { describe, expect, it } from 'vitest'
import {
  FEATURE_STORY_BIBLE_READINESS_CHECKS,
  SERIES_STORY_BIBLE_READINESS_CHECKS,
  deriveFeatureStoryBibleReadiness,
  deriveSeriesStoryBibleReadiness,
  deriveStoryBibleReadiness,
} from '../../client/src/lib/storyBibleReadiness'
import { createEmptyStoryBibleContent } from '../../shared/documents'

function findCheck(
  checks: ReturnType<typeof deriveFeatureStoryBibleReadiness>,
  id: string,
) {
  const check = checks.find((item) => item.id === id)
  expect(check, `missing check ${id}`).toBeDefined()
  return check!
}

describe('Story Bible readiness question discipline', () => {
  it('feature readiness exposes six plain-language questions', () => {
    expect(FEATURE_STORY_BIBLE_READINESS_CHECKS).toHaveLength(6)
    for (const check of FEATURE_STORY_BIBLE_READINESS_CHECKS) {
      expect(check.question.trim().length).toBeGreaterThan(0)
      expect(check.question.trim()).toMatch(/\?$/)
    }
  })

  it('series readiness exposes six plain-language questions', () => {
    expect(SERIES_STORY_BIBLE_READINESS_CHECKS).toHaveLength(6)
    for (const check of SERIES_STORY_BIBLE_READINESS_CHECKS) {
      expect(check.question.trim().length).toBeGreaterThan(0)
      expect(check.question.trim()).toMatch(/\?$/)
    }
  })
})

describe('deriveFeatureStoryBibleReadiness', () => {
  it('returns six derived signals regardless of input', () => {
    expect(deriveFeatureStoryBibleReadiness(createEmptyStoryBibleContent())).toHaveLength(6)
  })

  it('marks engine-clear satisfied when featurePropulsion is filled', () => {
    const content = createEmptyStoryBibleContent()
    content.storyEngine.featurePropulsion = 'A sealed city forces every scene through scarcity.'
    const checks = deriveFeatureStoryBibleReadiness(content)
    expect(findCheck(checks, 'feature-engine-clear').satisfied).toBe(true)
  })

  it('marks cast-real only when a named character has want, need, or flaw filled', () => {
    const content = createEmptyStoryBibleContent()
    content.characters.push({
      id: 'stub',
      name: '',
      role: '',
      want: '',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    expect(findCheck(deriveFeatureStoryBibleReadiness(content), 'feature-cast-real').satisfied).toBe(
      false,
    )

    content.characters.push({
      id: 'name-only',
      name: 'Elena',
      role: '',
      want: '',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    expect(findCheck(deriveFeatureStoryBibleReadiness(content), 'feature-cast-real').satisfied).toBe(
      false,
    )

    content.characters.push({
      id: 'active',
      name: 'Elena',
      role: '',
      want: 'Get her brother out.',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    expect(findCheck(deriveFeatureStoryBibleReadiness(content), 'feature-cast-real').satisfied).toBe(
      true,
    )
  })

  it('marks tone-specific only when tone words, dialogue style, and visual style are filled', () => {
    const content = createEmptyStoryBibleContent()
    content.toneAndStyle.toneWords = ['intimate']
    content.toneAndStyle.dialogueStyle = 'Sparse and guarded.'
    expect(
      findCheck(deriveFeatureStoryBibleReadiness(content), 'feature-tone-specific').satisfied,
    ).toBe(false)

    content.toneAndStyle.visualStyle = 'Clean frames with pressure in the edges.'
    expect(
      findCheck(deriveFeatureStoryBibleReadiness(content), 'feature-tone-specific').satisfied,
    ).toBe(true)
  })

  it('treats whitespace-only text as not filled', () => {
    const content = createEmptyStoryBibleContent()
    content.storyEngine.featurePropulsion = '  \n\t'
    expect(findCheck(deriveFeatureStoryBibleReadiness(content), 'feature-engine-clear').satisfied).toBe(
      false,
    )
  })

  it('is deterministic for identical input', () => {
    const content = createEmptyStoryBibleContent()
    content.onePagePitch.logline = 'A clean sentence.'
    expect(deriveFeatureStoryBibleReadiness(content)).toEqual(
      deriveFeatureStoryBibleReadiness(content),
    )
  })
})

describe('deriveSeriesStoryBibleReadiness', () => {
  it('returns six derived signals regardless of input', () => {
    expect(deriveSeriesStoryBibleReadiness(createEmptyStoryBibleContent())).toHaveLength(6)
  })

  it('marks series-engine-specific satisfied when seriesEngine is filled', () => {
    const content = createEmptyStoryBibleContent()
    content.storyEngine.seriesEngine = 'Every episode forces a bargain between safety and truth.'
    const checks = deriveSeriesStoryBibleReadiness(content)
    expect(findCheck(checks, 'series-engine-specific').satisfied).toBe(true)
  })

  it('marks pilot-has-own-engine only when pilotEngine is filled in addition to seriesEngine', () => {
    const content = createEmptyStoryBibleContent()
    content.storyEngine.pilotEngine = 'The first bargain exposes the city secret.'
    expect(
      findCheck(deriveSeriesStoryBibleReadiness(content), 'series-pilot-has-own-engine').satisfied,
    ).toBe(false)

    content.storyEngine.seriesEngine = 'Every episode forces a bargain between safety and truth.'
    expect(
      findCheck(deriveSeriesStoryBibleReadiness(content), 'series-pilot-has-own-engine').satisfied,
    ).toBe(true)
  })

  it('marks cast pressure only for a named character with recurring pressure or arc', () => {
    const content = createEmptyStoryBibleContent()
    content.characters.push({
      id: 'stub',
      name: 'Elena',
      role: '',
      want: '',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    expect(
      findCheck(deriveSeriesStoryBibleReadiness(content), 'series-cast-sustains-pressure').satisfied,
    ).toBe(false)

    content.characters[0].relationshipPressure = 'Her brother needs her silence.'
    expect(
      findCheck(deriveSeriesStoryBibleReadiness(content), 'series-cast-sustains-pressure').satisfied,
    ).toBe(true)
  })

  it('is deterministic for identical input', () => {
    const content = createEmptyStoryBibleContent()
    content.storyEngine.seriesEngine = 'A renewable pressure.'
    expect(deriveSeriesStoryBibleReadiness(content)).toEqual(
      deriveSeriesStoryBibleReadiness(content),
    )
  })
})

describe('deriveStoryBibleReadiness', () => {
  it('branches by project format', () => {
    const content = createEmptyStoryBibleContent()
    expect(deriveStoryBibleReadiness(content, 'feature')).toEqual(
      deriveFeatureStoryBibleReadiness(content),
    )
    expect(deriveStoryBibleReadiness(content, 'series')).toEqual(
      deriveSeriesStoryBibleReadiness(content),
    )
  })
})
