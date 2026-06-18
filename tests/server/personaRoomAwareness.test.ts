import { describe, it, expect } from 'vitest'
import { createPersonaSystemPrompt } from '../../server/ai/openaiService'
import { buildRoomAwarenessBlock, ROOM_LANES, PERSONAS } from '../../shared/personas'
import type { AssessmentProfile, StoryMemory } from '../../shared/schema'

const userProfile: AssessmentProfile = {
  entryState: 'idea_only',
  existingWork: [],
  immediateNeed: '',
  feedbackStyle: 'direct',
  writerName: 'Writer',
}

const storyMemory: StoryMemory = {
  project: {},
  characters: {},
  outline: { acts: 3, beats: [] },
  worldRules: {},
  dialogue: {},
  userProfile,
  decisions: [],
}

function promptFor(personaId: string): string {
  return createPersonaSystemPrompt(PERSONAS[personaId], userProfile, storyMemory, '')
}

describe('buildRoomAwarenessBlock', () => {
  it('names every roster member with their public lane', () => {
    const block = buildRoomAwarenessBlock()
    for (const lane of ROOM_LANES) {
      expect(block).toContain(lane.name)
    }
    // canonical lane keywords are present
    expect(block).toMatch(/logline/i)        // Sam
    expect(block).toMatch(/want\/need|wound/i) // Casey
    expect(block).toMatch(/beats|sequencing/i) // Oliver
    expect(block).toMatch(/subtext/i)        // Maya
    expect(block).toMatch(/continuity/i)     // Zoe
    expect(block).toMatch(/blocks|momentum/i) // Alex
  })

  it('describes Morgan as host/showrunner, not a structure/thematics specialist', () => {
    const block = buildRoomAwarenessBlock()
    const morganLine = block.split('\n').find(l => l.includes('Morgan'))
    expect(morganLine).toBeTruthy()
    expect(morganLine!).toMatch(/showrunner|host/i)
    expect(morganLine!).toMatch(/triage|synthesis|big-picture/i)
    expect(morganLine!).not.toMatch(/structure|thematics|beats/i)
  })

  it('states the room routing behavior rules', () => {
    const block = buildRoomAwarenessBlock()
    expect(block).toMatch(/recommend/i)          // recommend another specialist
    expect(block).toMatch(/overlap/i)            // overlap → own-lane answer first
    expect(block).toMatch(/uncertain[\s\S]*Morgan/i) // uncertain → route to Morgan
    expect(block).toMatch(/never invent/i)       // no invented roles
    expect(block).toMatch(/hidden prompt|internal reasoning/i) // no private-knowledge claims
  })
})

describe('createPersonaSystemPrompt room awareness', () => {
  it("includes the shared routing map in Alex's prompt", () => {
    const prompt = promptFor('alex')
    // The exact shared block is embedded verbatim
    expect(prompt).toContain(buildRoomAwarenessBlock())
    // And it carries the other specialists' lanes, not just Alex's own
    expect(prompt).toMatch(/Oliver/)
    expect(prompt).toMatch(/Zoe/)
  })

  it('describes Morgan as host/showrunner in the host prompt, not a structure specialist', () => {
    const prompt = promptFor('writingPartner')
    expect(prompt).toContain(buildRoomAwarenessBlock())
    const morganLine = prompt.split('\n').find(l => l.includes('Morgan') && /showrunner|host/i.test(l))
    expect(morganLine).toBeTruthy()
    expect(morganLine!).not.toMatch(/structure|thematics/i)
  })
})
