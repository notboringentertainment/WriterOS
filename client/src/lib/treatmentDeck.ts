import type { TreatmentDocumentContent } from '@shared/documents'

export type TreatmentConceptField = keyof TreatmentDocumentContent['concept']
export type TreatmentProseField = Exclude<keyof TreatmentDocumentContent['prose'], 'customSections'>
export type TreatmentVisualField = keyof TreatmentDocumentContent['visualAndTonal']
export type TreatmentOpenQuestionField = keyof TreatmentDocumentContent['openQuestions']

export interface TreatmentPromptDef {
  id: string
  groupLabel: string
  question: string
  helper: string
  paths: readonly string[]
}

export const TREATMENT_PROSE_FIELDS: readonly { field: TreatmentProseField; question: string; helper: string }[] = [
  {
    field: 'opening',
    question: 'How does the story open on screen?',
    helper: 'Establish the person, world, tone, and first disturbance in present tense.',
  },
  {
    field: 'actOne',
    question: 'What pulls them into the story?',
    helper: 'Tell the setup, first choices, conflict, and commitment into the story.',
  },
  {
    field: 'actTwo',
    question: 'How does the pressure build and turn?',
    helper: 'Follow escalation, reversals, discoveries, relationship pressure, and collapse.',
  },
  {
    field: 'actThree',
    question: 'How does it resolve?',
    helper: 'Tell the final plan, decisive choice, cost, resolution, and last image.',
  },
] as const

export const TREATMENT_VISUAL_FIELDS: readonly { field: TreatmentVisualField; label: string }[] = [
  { field: 'overallTone', label: "What's the atmosphere from scene to scene?" },
  { field: 'visualWorld', label: 'What does the world look like?' },
  { field: 'recurringImagesOrMotifs', label: 'What images or motifs keep returning?' },
  { field: 'musicOrSoundFeeling', label: 'What should it sound like?' },
  { field: 'pacing', label: 'How should the story move?' },
  { field: 'genreRules', label: 'What genre promises or rules matter?' },
  { field: 'compsAndReferences', label: 'What does this remind people of?' },
] as const

export const TREATMENT_OPEN_QUESTION_FIELDS: readonly { field: TreatmentOpenQuestionField; label: string }[] = [
  { field: 'story', label: 'Story decisions still needed' },
  { field: 'character', label: 'Character decisions still needed' },
  { field: 'worldOrMythology', label: 'World or mythology decisions still needed' },
  { field: 'production', label: 'Production decisions still needed' },
] as const

const CONCEPT_PROMPTS: readonly TreatmentPromptDef[] = [
  {
    id: 'concept-premise',
    groupLabel: 'The promise',
    question: 'What is the premise?',
    helper: 'The story promise in plain language.',
    paths: ['concept.premise'],
  },
  {
    id: 'concept-tone',
    groupLabel: 'The promise',
    question: 'What kind of story is this?',
    helper: 'The genre, tone, and experience the treatment should signal.',
    paths: ['concept.tone'],
  },
  {
    id: 'concept-theme',
    groupLabel: 'The promise',
    question: 'What truth is underneath it?',
    helper: 'The emotional or thematic argument under the plot.',
    paths: ['concept.theme'],
  },
  {
    id: 'concept-emotional-promise',
    groupLabel: 'The promise',
    question: 'What should the audience feel by the end?',
    helper: 'The emotional landing the treatment should earn.',
    paths: ['concept.emotionalPromise'],
  },
] as const

export const TREATMENT_SURFACE_DECK: readonly TreatmentPromptDef[] = [
  {
    id: 'logline',
    groupLabel: 'The core',
    question: 'What is the story in one sentence?',
    helper: 'Protagonist, goal, pressure, stakes, and hook.',
    paths: ['logline'],
  },
  ...CONCEPT_PROMPTS,
  {
    id: 'main-characters',
    groupLabel: 'Who carries it',
    question: 'Who carries it?',
    helper: 'Name the central characters and the pressure each one carries.',
    paths: ['mainCharacters'],
  },
  ...TREATMENT_PROSE_FIELDS.map((item): TreatmentPromptDef => ({
    id: `prose-${item.field}`,
    groupLabel: 'Story flow',
    question: item.question,
    helper: item.helper,
    paths: [`prose.${item.field}`],
  })),
  {
    id: 'story-passages',
    groupLabel: 'Story passages',
    question: 'What focused passages belong beyond the main flow?',
    helper: 'Add optional character, place, or major-turn passages when the treatment needs them.',
    paths: ['prose.customSections'],
  },
  ...TREATMENT_VISUAL_FIELDS.map((item): TreatmentPromptDef => ({
    id: `visual-${item.field}`,
    groupLabel: 'Texture',
    question: item.label,
    helper: 'Capture the texture a reader should understand from the treatment.',
    paths: [`visualAndTonal.${item.field}`],
  })),
  ...TREATMENT_OPEN_QUESTION_FIELDS.map((item): TreatmentPromptDef => ({
    id: `open-questions-${item.field}`,
    groupLabel: 'Open questions',
    question: item.label,
    helper: 'List unresolved decisions one per line.',
    paths: [`openQuestions.${item.field}`],
  })),
] as const

export function resolveTreatmentPath(
  content: TreatmentDocumentContent,
  path: string,
): { defined: boolean; value: unknown } {
  const segments = path.split('.')
  let cursor: unknown = content

  for (const segment of segments) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return { defined: false, value: undefined }
    }
    if (!(segment in (cursor as Record<string, unknown>))) {
      return { defined: false, value: undefined }
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }

  return { defined: true, value: cursor }
}
