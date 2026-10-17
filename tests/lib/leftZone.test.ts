import { describe, it, expect } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { selectSurfaceStructure, selectConsoleState, surfaceLabel } from '../../client/src/lib/leftZone'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'

describe('surfaceLabel', () => {
  it('maps every surface to a human label', () => {
    expect(surfaceLabel('script')).toBe('Script')
    expect(surfaceLabel('outline')).toBe('Beat Sheet')
    expect(surfaceLabel('synopsis')).toBe('Synopsis')
    expect(surfaceLabel('treatment')).toBe('Treatment')
    expect(surfaceLabel('story-bible')).toBe('Story Bible')
  })
})

describe('selectSurfaceStructure', () => {
  it('shows series movement beats without counting empty feature scaffold', () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.outline.content.units = [
      createOutlineUnit('feature.openingNormalWorld'),
      { ...createOutlineUnit('pilot.beat01'), number: 1, title: 'The arrival', actOrSequence: 'Movement one', whatHappens: 'The case begins.' },
    ]
    state.documents.outline.content.beatSheetSource = { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-10-16T00:00:00.000Z', beatCount: 2, label: null }
    const structure = selectSurfaceStructure('outline', state)
    expect(structure.nodes).toEqual([{ id: 'pilot.beat01', label: 'The arrival', detail: 'Movement one' }])
    expect(selectConsoleState(state, 'outline', null).counts).toEqual([{ label: 'beats', value: 1 }])
  })

  it('lists no beats for an unlinked project, whatever hand-written units it holds', () => {
    const state = defaultProjectState()
    state.documents.outline.content.units = [{ ...createOutlineUnit('u1'), number: 1, title: 'Hand beat', whatHappens: 'Text.' }]
    expect(selectSurfaceStructure('outline', state).nodes).toEqual([])
    expect(selectConsoleState(state, 'outline', null).counts).toEqual([{ label: 'beats', value: 0 }])
  })

  it('renders an honest empty state for outline with no beats', () => {
    const state = defaultProjectState()
    state.documents.outline.content.units = []
    const s = selectSurfaceStructure('outline', state)
    expect(s.surface).toBe('outline')
    expect(s.heading).toBe('Beat Sheet')
    expect(s.empty).toBe(true)
    expect(s.nodes).toHaveLength(0)
    expect(s.emptyHint).toBeTruthy()
  })

  it('lists outline beats with act/sequence detail', () => {
    const state = defaultProjectState()
    state.documents.outline.content.units = [
      { id: 'u1', number: 1, actOrSequence: 'Act 1', title: 'Cold open', location: '', characters: [], whatHappens: '', conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' },
      { id: 'u2', number: 2, actOrSequence: 'Act 1', title: '', location: '', characters: [], whatHappens: '', conflict: '', turn: '', consequence: '', whyNext: '', linkedSceneIds: [], draftNotes: '' },
    ]
    state.documents.outline.content.beatSheetSource = { ticket: 'T-1', sourceHash: 'h', syncedAt: '2026-10-16T00:00:00.000Z', beatCount: 2, label: null }
    const s = selectSurfaceStructure('outline', state)
    expect(s.empty).toBe(false)
    expect(s.nodes).toHaveLength(2)
    expect(s.nodes[0].label).toBe('Cold open')
    expect(s.nodes[0].detail).toBe('Act 1')
    // unit with no title falls back to its beat number — never blank
    expect(s.nodes[1].label).toContain('2')
  })

  it('renders the script as a flat scene list, empty when no scenes', () => {
    const state = defaultProjectState()
    state.script.scenes = []
    expect(selectSurfaceStructure('script', state).empty).toBe(true)

    state.script.scenes = [
      { id: 's1', heading: 'INT. CAR - NIGHT', index: 0 },
      { id: 's2', heading: '', index: 1 },
    ]
    const s = selectSurfaceStructure('script', state)
    expect(s.empty).toBe(false)
    expect(s.nodes[0].label).toBe('INT. CAR - NIGHT')
    expect(s.nodes[1].label).toContain('2') // headless scene falls back to its number
  })

  it('lists the synopsis page by its headings, and nothing from the frozen legacy prose', () => {
    const state = defaultProjectState()
    state.documents.synopsis.content.prose.opening = 'Old opening.'
    expect(selectSurfaceStructure('synopsis', state)).toMatchObject({ nodes: [], empty: true, emptyHint: 'No synopsis written yet.' })
    state.pages.synopsis = { page: 'synopsis', markdown: '# Synopsis\n\nIntro.\n\n## The turn\n\nText.', status: 'draft', revision: 1 }
    expect(selectSurfaceStructure('synopsis', state).nodes.map(n => n.label)).toEqual(['Synopsis', 'The turn'])
  })

  it('lists the treatment page by its headings and counts them', () => {
    const state = defaultProjectState()
    state.pages.treatment = { page: 'treatment', markdown: '## Act One\n\nA.\n\n## Act Two\n\nB.', status: 'approved', revision: 2 }
    expect(selectSurfaceStructure('treatment', state).nodes.map(n => n.label)).toEqual(['Act One', 'Act Two'])
    expect(selectConsoleState(state, 'treatment', null).counts).toEqual([{ label: 'sections', value: 2 }])
  })

  it('lists story-bible sections plus its characters', () => {
    const state = defaultProjectState()
    state.documents.storyBible.content.characters = [
      { id: 'c1', name: 'Antagonist', role: 'Villain', want: '', need: '', flaw: '', secret: '', contradiction: '', arc: '', relationshipPressure: '', behavioralAnchors: '', speechPatterns: '', neverWriteThemAs: '', continuityFacts: '' },
    ]
    const s = selectSurfaceStructure('story-bible', state)
    const labels = s.nodes.map(n => n.label)
    expect(labels).toContain('Antagonist')
    expect(s.empty).toBe(false)
  })
})

describe('selectConsoleState', () => {
  it('reports the display title, surface, persona and counts', () => {
    const state = defaultProjectState()
    state.meta.title = 'The Long Hallway'
    state.script.scenes = [
      { id: 's1', heading: 'A', index: 0 },
      { id: 's2', heading: 'B', index: 1 },
    ]
    const c = selectConsoleState(state, 'script', null)
    expect(c.title).toBe('The Long Hallway')
    expect(c.surface).toBe('script')
    expect(c.surfaceLabel).toBe('Script')
    expect(c.persona).toBe('Morgan') // script routes to the host (writingPartner)
    expect(c.counts).toEqual([{ label: 'scenes', value: 2 }])
  })

  it('falls back to Untitled Project for a blank title', () => {
    const state = defaultProjectState()
    state.meta.title = ''
    expect(selectConsoleState(state, 'outline', null).title).toBe('Untitled Project')
  })

  it('shows a specialist persona on a specialist surface, still under Morgan', () => {
    const state = defaultProjectState()
    const c = selectConsoleState(state, 'outline', null)
    expect(c.persona.startsWith('Morgan')).toBe(true)
    expect(c.counts[0].label).toBe('beats')
  })
})
