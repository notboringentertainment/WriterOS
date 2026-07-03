import type { StoryBibleCharacter } from '../../shared/documents'

export function makeStoryBibleCharacter(overrides: Partial<StoryBibleCharacter> = {}): StoryBibleCharacter {
  return {
    id: '',
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
    ...overrides,
  }
}
