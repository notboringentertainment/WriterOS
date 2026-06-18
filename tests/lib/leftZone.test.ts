import { describe, it, expect } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { selectSurfaceStructure, selectConsoleState, surfaceLabel } from '../../client/src/lib/leftZone'

describe('surfaceLabel', () => {
  it('maps every surface to a human label', () => {
    expect(surfaceLabel('script')).toBe('Script')
    expect(surfaceLabel('outline')).toBe('Outline')
    expect(surfaceLabel('synopsis')).toBe('Synopsis')
    expect(surfaceLabel('treatment')).toBe('Treatment')
    expect(surfaceLabel('story-bible')).toBe('Story Bible')
  })
})

describe('selectSurfaceStructure', () => {
  it('renders an honest empty state for outline with no beats', () => {
    const state = defaultProjectState()
    state.documents.outline.content.units = []
    const s = selectSurfaceStructure('outline', state)
    expect(s.surface).toBe('outline')
    expect(s.heading).toBe('Outline')
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

  it('lists synopsis as its fixed prose sections', () => {
    const state = defaultProjectState()
    const s = selectSurfaceStructure('synopsis', state)
    expect(s.empty).toBe(false)
    expect(s.nodes.map(n => n.label)).toEqual(['Opening', 'Escalation', 'Middle', 'Climax', 'Resolution'])
  })

  it('lists treatment acts plus its main characters', () => {
    const state = defaultProjectState()
    state.documents.treatment.content.mainCharacters = [
      { id: 'c1', name: 'Lead', role: 'Protagonist', externalWant: '', internalNeed: '', flawOrWound: '', secretOrContradiction: '', arc: '', relationshipPressure: '' },
    ]
    const s = selectSurfaceStructure('treatment', state)
    const labels = s.nodes.map(n => n.label)
    expect(labels).toContain('Act One')
    expect(labels).toContain('Lead')
  })

  it('numbers multiple untitled treatment custom sections distinctly', () => {
    const state = defaultProjectState()
    state.documents.treatment.content.prose.customSections = [
      { id: 'cs1', heading: '', body: '' },
      { id: 'cs2', heading: '', body: '' },
      { id: 'cs3', heading: 'Named', body: '' },
    ]
    const labels = selectSurfaceStructure('treatment', state).nodes.map(n => n.label)
    expect(labels).toContain('Section 1')
    expect(labels).toContain('Section 2')
    expect(labels).toContain('Named')
    // no duplicate fallback labels
    const sectionLabels = labels.filter(l => l.startsWith('Section '))
    expect(new Set(sectionLabels).size).toBe(sectionLabels.length)
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
