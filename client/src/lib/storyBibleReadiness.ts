import type { StoryBibleCharacter, StoryBibleDocumentContent } from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'

export interface StoryBibleReadinessCheck {
  id: string
  question: string
}

export interface DerivedStoryBibleReadinessCheck extends StoryBibleReadinessCheck {
  satisfied: boolean
}

export const FEATURE_STORY_BIBLE_READINESS_CHECKS: readonly StoryBibleReadinessCheck[] = [
  {
    id: 'feature-project-one-sentence',
    question: 'Can a reader say the project back in one sentence?',
  },
  {
    id: 'feature-tone-specific',
    question: 'Is the tone specific enough for another writer to reproduce?',
  },
  {
    id: 'feature-world-rules-generate-conflict',
    question: 'Do the world rules actually generate conflict?',
  },
  {
    id: 'feature-cast-real',
    question: 'Does the cast have at least one character who feels active on the page?',
  },
  {
    id: 'feature-engine-clear',
    question: 'Is the story engine specific enough to predict scenes?',
  },
  {
    id: 'feature-tone-rules-consistent',
    question: 'Are the tone rules consistent with the genre?',
  },
] as const

export const SERIES_STORY_BIBLE_READINESS_CHECKS: readonly StoryBibleReadinessCheck[] = [
  {
    id: 'series-show-one-sentence',
    question: 'Can a buyer say the show back in one sentence?',
  },
  {
    id: 'series-engine-specific',
    question: 'Is the repeatable engine specific, not generic?',
  },
  {
    id: 'series-pilot-has-own-engine',
    question: 'Does the pilot have its own engine on top of the show engine?',
  },
  {
    id: 'series-season-visible-shape',
    question: 'Does season one have a visible shape?',
  },
  {
    id: 'series-cast-sustains-pressure',
    question: 'Can the cast sustain recurring pressure across seasons?',
  },
  {
    id: 'series-never-feel-like',
    question: 'Does the bible say what this show must never feel like?',
  },
] as const

function isFilled(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function hasFilledToken(values: readonly string[] | undefined | null): boolean {
  return Array.isArray(values) && values.some(isFilled)
}

function hasFeatureCharacterSubstance(character: StoryBibleCharacter): boolean {
  return (
    isFilled(character.name) &&
    [character.want, character.need, character.flaw].some(isFilled)
  )
}

function hasSeriesCharacterPressure(character: StoryBibleCharacter): boolean {
  return (
    isFilled(character.name) &&
    [character.relationshipPressure, character.arc, character.want].some(isFilled)
  )
}

export function deriveFeatureStoryBibleReadiness(
  content: StoryBibleDocumentContent,
): readonly DerivedStoryBibleReadinessCheck[] {
  return [
    {
      ...FEATURE_STORY_BIBLE_READINESS_CHECKS[0],
      satisfied: isFilled(content.onePagePitch.logline),
    },
    {
      ...FEATURE_STORY_BIBLE_READINESS_CHECKS[1],
      satisfied:
        hasFilledToken(content.toneAndStyle.toneWords) &&
        isFilled(content.toneAndStyle.dialogueStyle) &&
        isFilled(content.toneAndStyle.visualStyle),
    },
    {
      ...FEATURE_STORY_BIBLE_READINESS_CHECKS[2],
      satisfied: isFilled(content.premiseAndWorld.worldRules),
    },
    {
      ...FEATURE_STORY_BIBLE_READINESS_CHECKS[3],
      satisfied: content.characters.some(hasFeatureCharacterSubstance),
    },
    {
      ...FEATURE_STORY_BIBLE_READINESS_CHECKS[4],
      satisfied: isFilled(content.storyEngine.featurePropulsion),
    },
    {
      ...FEATURE_STORY_BIBLE_READINESS_CHECKS[5],
      satisfied:
        isFilled(content.toneAndStyle.pacingRules) &&
        isFilled(content.toneAndStyle.humorRules) &&
        isFilled(content.toneAndStyle.violenceOrIntensityRules) &&
        isFilled(content.toneAndStyle.mustNeverFeelLike),
    },
  ]
}

export function deriveSeriesStoryBibleReadiness(
  content: StoryBibleDocumentContent,
): readonly DerivedStoryBibleReadinessCheck[] {
  return [
    {
      ...SERIES_STORY_BIBLE_READINESS_CHECKS[0],
      satisfied: isFilled(content.onePagePitch.logline),
    },
    {
      ...SERIES_STORY_BIBLE_READINESS_CHECKS[1],
      satisfied: isFilled(content.storyEngine.seriesEngine),
    },
    {
      ...SERIES_STORY_BIBLE_READINESS_CHECKS[2],
      satisfied:
        isFilled(content.storyEngine.seriesEngine) &&
        isFilled(content.storyEngine.pilotEngine),
    },
    {
      ...SERIES_STORY_BIBLE_READINESS_CHECKS[3],
      satisfied: isFilled(content.storyEngine.seasonArc),
    },
    {
      ...SERIES_STORY_BIBLE_READINESS_CHECKS[4],
      satisfied: content.characters.some(hasSeriesCharacterPressure),
    },
    {
      ...SERIES_STORY_BIBLE_READINESS_CHECKS[5],
      satisfied: isFilled(content.toneAndStyle.mustNeverFeelLike),
    },
  ]
}

export function deriveStoryBibleReadiness(
  content: StoryBibleDocumentContent,
  format: ProjectFormat,
): readonly DerivedStoryBibleReadinessCheck[] {
  return format === 'series'
    ? deriveSeriesStoryBibleReadiness(content)
    : deriveFeatureStoryBibleReadiness(content)
}

export const deriveFeatureReadiness = deriveFeatureStoryBibleReadiness
export const deriveSeriesReadiness = deriveSeriesStoryBibleReadiness
