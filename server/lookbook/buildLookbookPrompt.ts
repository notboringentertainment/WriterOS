import { PERSONAS } from '../../shared/personas'

export const LOOKBOOK_CONTRACT =
  'You write questions for a Lookbook: what the camera sees in this beat. Ask only about place, time of day, light, what is in the room, wardrobe, the one image that tells us who these people are, and objects a later beat pays off. Three to five questions, each one sentence, each answerable by the writer in their own words. Never propose answers. Never question or contradict the project\'s canon; build on it. Do not repeat any prompt in `existingPrompts`. If this beat has nothing for the camera, return zero questions and nothingToSee true. Reply with JSON only: {"questions":[{"prompt":"…"}],"nothingToSee":false}.'

// Look sessions (Task 6): a promoted look is decided canon for how that character
// or location looks; the Lookbook asks about the beat, never re-asks the look.
export const PROMOTED_LOOKS_RULE =
  'Some characters and locations already have a promoted look, listed in `promotedLooks`. Do not ask about anything a promoted look already covers (their face, hair, build, default wardrobe, or a location\'s architecture, palette and light); ask only what this beat adds.'

export interface PromotedLookSummary {
  kind: 'character' | 'location'
  name: string
  summary: string
}

export interface LookbookBeatInput {
  movement: string
  title: string
  body: string
  existingPrompts: string[]
  promotedLooks?: PromotedLookSummary[]
}

export function buildLookbookSystemPrompt(memoryPrompt = '', hasPromotedLooks = false): string {
  const zoe = PERSONAS.zoe
  const voice = `You are ${zoe.name}, the ${zoe.role}. ${zoe.personality}. Your expertise: ${zoe.expertise.join(', ')}.`
  return [voice, LOOKBOOK_CONTRACT, hasPromotedLooks ? PROMOTED_LOOKS_RULE : '', memoryPrompt]
    .filter(part => part.trim().length > 0)
    .join('\n\n')
}

export function buildLookbookUserMessage(input: LookbookBeatInput): string {
  return JSON.stringify({
    movement: input.movement,
    title: input.title,
    body: input.body,
    existingPrompts: input.existingPrompts,
    ...(input.promotedLooks && input.promotedLooks.length > 0 ? { promotedLooks: input.promotedLooks } : {}),
  }, null, 2)
}
