import type { TreatmentDocumentContent } from '@shared/documents'
import type { PersonaId } from './wpRouting'

export type TreatmentCustomSection = TreatmentDocumentContent['prose']['customSections'][number]

export interface TreatmentPassageTemplate {
  id: string
  label: string
  heading: string
  placeholder: string
  specialist: PersonaId
}

export const GENERIC_PASSAGE_PLACEHOLDER =
  'Write this passage as it plays on screen — present tense, what we see and hear.'

export const TREATMENT_PASSAGE_TEMPLATES: readonly TreatmentPassageTemplate[] = [
  {
    id: 'character',
    label: 'Character passage',
    heading: 'Character passage',
    placeholder:
      'Follow one character through the whole story — what they want, what breaks them, where they end up.',
    specialist: 'casey',
  },
  {
    id: 'world',
    label: 'Place or world passage',
    heading: 'Place or world passage',
    placeholder:
      'The place and its rules — how it looks, how it works, what it feels like to be there.',
    specialist: 'zoe',
  },
  {
    id: 'turn',
    label: 'Major turn',
    heading: 'Major turn',
    placeholder:
      'One moment where the story changes direction — what flips, and what it costs.',
    specialist: 'oliver',
  },
  {
    id: 'sequence',
    label: 'Big sequence',
    heading: 'Big sequence',
    placeholder:
      'One extended stretch of story as it plays on screen, moment to moment.',
    specialist: 'oliver',
  },
  {
    id: 'side-thread',
    label: 'Side thread',
    heading: 'Side thread',
    placeholder:
      'A secondary storyline — how it starts, how it weaves in, how it pays off.',
    specialist: 'oliver',
  },
  {
    id: 'free',
    label: 'Free passage',
    heading: 'New passage',
    placeholder: '',
    specialist: 'alex',
  },
]

export function createPassageSection(template: TreatmentPassageTemplate): TreatmentCustomSection {
  return { id: crypto.randomUUID(), heading: template.heading, body: '' }
}

export function getPassagePlaceholder(heading: string): string {
  const match = TREATMENT_PASSAGE_TEMPLATES.find(template => template.heading === heading)
  return match ? match.placeholder : GENERIC_PASSAGE_PLACEHOLDER
}
