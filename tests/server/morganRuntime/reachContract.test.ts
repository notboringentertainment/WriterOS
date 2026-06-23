import { describe, it, expect } from 'vitest'
import { buildReachInventory, renderReachContract } from '../../../server/ai/morganRuntime/reachContract'
import type { StoryMemory } from '../../../shared/schema'

const base = (over: Partial<StoryMemory> = {}): StoryMemory => ({
  project: { title: 'Lifeline', genre: 'Thriller', format: 'feature', logline: 'A dispatcher hears a dead caller.' },
  characters: {},
  outline: { acts: 3, beats: [], scenes: [] },
  worldRules: { setting: '', toneAnchors: '', rules: '' },
  dialogue: { voiceNotes: '' },
  userProfile: { entryState: 'idea_only', existingWork: [], immediateNeed: '', feedbackStyle: 'direct', writerName: 'Writer' },
  decisions: [],
  ...over,
})

describe('reach inventory', () => {
  it('lists populated project surfaces in canSee, derived from real state', () => {
    const inv = buildReachInventory(base({ characters: { a: { id: 'a', name: 'Mara', role: 'Dispatcher' } } }))
    expect(inv.canSee.join(' ')).toMatch(/logline/i)
    expect(inv.canSee.join(' ')).toMatch(/character/i)
  })

  it('omits unpopulated surfaces from canSee (no false claims)', () => {
    const inv = buildReachInventory(base({ project: { title: '', genre: '', format: 'feature', logline: '' } }))
    expect(inv.canSee.join(' ')).not.toMatch(/logline/i)
  })

  it('always states fixed honest limits and cannotDoYet', () => {
    const inv = buildReachInventory(base())
    expect(inv.cannotSee.join(' ')).toMatch(/pixel|screen|live web/i)
    expect(inv.cannotDoYet.join(' ')).toMatch(/specialist|edit|web/i)
  })

  it('after M2 flip: canDoNow includes consulting a specialist directly', () => {
    const inv = buildReachInventory(base())
    expect(inv.canDoNow.some((s) => /consult.*specialist/i.test(s))).toBe(true)
  })

  it('after M2 flip: cannotDoYet no longer contains the specific "call the specialists directly" line', () => {
    const inv = buildReachInventory(base())
    expect(inv.cannotDoYet.some((s) => /call the specialists directly/i.test(s))).toBe(false)
  })

  it('still honestly limits edits, live web, and parallel room orchestration', () => {
    const inv = buildReachInventory(base())
    expect(inv.cannotDoYet.some((s) => /edit|rewrite/i.test(s))).toBe(true)
    expect(inv.cannotDoYet.some((s) => /web/i.test(s))).toBe(true)
    expect(inv.cannotDoYet.some((s) => /parallel|more than one|at once/i.test(s))).toBe(true)
  })

  it('renders a prompt block with all four sections', () => {
    const text = renderReachContract(buildReachInventory(base()))
    expect(text).toMatch(/can see/i)
    expect(text).toMatch(/cannot see/i)
    expect(text).toMatch(/can do now/i)
    expect(text).toMatch(/cannot.*yet/i)
  })
})
