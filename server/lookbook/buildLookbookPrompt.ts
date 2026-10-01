import { PERSONAS } from '../../shared/personas'

export const LOOKBOOK_CONTRACT =
  'You write questions for a Lookbook: what the camera sees in this beat. Ask only about place, time of day, light, what is in the room, wardrobe, the one image that tells us who these people are, and objects a later beat pays off. Three to five questions, each one sentence, each answerable by the writer in their own words. Never propose answers. Never question or contradict the project\'s canon; build on it. Do not repeat any prompt in `existingPrompts`. If this beat has nothing for the camera, return zero questions and nothingToSee true. Reply with JSON only: {"questions":[{"prompt":"…"}],"nothingToSee":false}.'

export interface LookbookBeatInput {
  movement: string
  title: string
  body: string
  existingPrompts: string[]
}

export function buildLookbookSystemPrompt(memoryPrompt = ''): string {
  const zoe = PERSONAS.zoe
  const voice = `You are ${zoe.name}, the ${zoe.role}. ${zoe.personality}. Your expertise: ${zoe.expertise.join(', ')}.`
  return [voice, LOOKBOOK_CONTRACT, memoryPrompt].filter(part => part.trim().length > 0).join('\n\n')
}

export function buildLookbookUserMessage(input: LookbookBeatInput): string {
  return JSON.stringify({
    movement: input.movement,
    title: input.title,
    body: input.body,
    existingPrompts: input.existingPrompts,
  }, null, 2)
}
