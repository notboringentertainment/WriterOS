import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectState } from '../../client/src/lib/useProjectState'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { TranscriptMessage, ScriptScene } from '../../client/src/lib/projectState'

beforeEach(() => localStorage.clear())

describe('useProjectState', () => {
  it('returns state with unset stored title on first load', () => {
    const { result } = renderHook(() => useProjectState())
    expect(result.current.state.meta.title).toBe('')
  })

  it('setMeta updates meta fields', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setMeta({ title: 'My Film' }))
    expect(result.current.state.meta.title).toBe('My Film')
  })

  it('setMeta normalizes default display title to unset stored title', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setMeta({ title: 'Untitled Project' }))
    expect(result.current.state.meta.title).toBe('')
  })

  it('setSynopsisSection updates logline', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisSection('logline', 'A hero rises.'))
    expect(result.current.state.synopsis.logline).toBe('A hero rises.')
  })

  it('setSynopsisSection updates a section', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisSection('setup', 'Set in Chicago.'))
    expect(result.current.state.synopsis.sections.setup).toBe('Set in Chicago.')
  })

  it('clearSynopsis empties every synopsis field and persists the change', () => {
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.setSynopsisSection('logline', 'A hero rises.'))
    act(() => result.current.setSynopsisSection('setup', 'Set in Chicago.'))
    act(() => result.current.clearSynopsis())

    expect(result.current.state.synopsis).toEqual({
      logline: '',
      sections: { setup: '', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
    })

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.synopsis).toEqual(result.current.state.synopsis)
  })

  it('setBeat updates a single beat by id', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setBeat('midpoint', { notes: 'Hero wins battle, loses war' }))
    const midpoint = result.current.state.outline.beats.find(b => b.id === 'midpoint')
    expect(midpoint?.notes).toBe('Hero wins battle, loses war')
  })

  it('clearOutline resets beat notes, links, and order, then persists the change', () => {
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.setBeat('midpoint', { notes: 'Hero wins battle, loses war', linkedSceneIds: ['scene-1'] }))
    act(() => result.current.reorderBeats(0, 2))
    act(() => result.current.clearOutline())

    expect(result.current.state.outline).toEqual(defaultProjectState().outline)

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.outline).toEqual(result.current.state.outline)
  })

  it('reorderBeats moves one beat to another valid position', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.reorderBeats(0, 2))
    expect(result.current.state.outline.beats[2].id).toBe('opening-image')
  })

  it('reorderBeats ignores out-of-range indexes', () => {
    const { result } = renderHook(() => useProjectState())
    const originalOrder = result.current.state.outline.beats.map(b => b.id)

    act(() => result.current.reorderBeats(-1, 2))
    act(() => result.current.reorderBeats(0, 99))

    expect(result.current.state.outline.beats.map(b => b.id)).toEqual(originalOrder)
  })

  it('reorderBeats ignores same-index moves', () => {
    const { result } = renderHook(() => useProjectState())
    const originalOrder = result.current.state.outline.beats.map(b => b.id)

    act(() => result.current.reorderBeats(2, 2))

    expect(result.current.state.outline.beats.map(b => b.id)).toEqual(originalOrder)
  })

  it('addCharacter appends to storyBible.characters', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.addCharacter({ name: 'Alex', role: 'Protagonist', wound: '', want: '', need: '', arc: '' }))
    expect(result.current.state.storyBible.characters).toHaveLength(1)
    expect(result.current.state.storyBible.characters[0].name).toBe('Alex')
  })

  it('clearStoryBible empties characters and story bible fields, then persists the change', () => {
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.addCharacter({ name: 'Alex', role: 'Protagonist', wound: '', want: '', need: '', arc: '' }))
    act(() => result.current.setWorld({ setting: 'A sealed city', toneAnchors: 'Heat', voiceNotes: 'Spare' }))
    act(() => result.current.setThemes('Mercy under pressure'))
    act(() => result.current.setRules('No one leaves after sunset'))
    act(() => result.current.clearStoryBible())

    expect(result.current.state.storyBible).toEqual(defaultProjectState().storyBible)

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.storyBible).toEqual(result.current.state.storyBible)
  })

  it('persists state to localStorage on update', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setMeta({ title: 'Persisted' }))
    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.meta.title).toBe('Persisted')
  })

  it('addMessage appends to the selected agent transcript', () => {
    const { result } = renderHook(() => useProjectState())
    const msg: TranscriptMessage = { id: 'msg1', role: 'user', content: 'hello', speaker: 'Writer', ts: 1 }
    act(() => result.current.addMessage('alex', msg))
    expect(result.current.state.agents.alex.transcript).toHaveLength(1)
    expect(result.current.state.agents.alex.transcript[0].content).toBe('hello')
  })

  it('addMessage does not touch other agent transcripts', () => {
    const { result } = renderHook(() => useProjectState())
    const msg: TranscriptMessage = { id: 'msg2', role: 'assistant', content: 'hi', speaker: 'Oliver', ts: 2 }
    act(() => result.current.addMessage('oliver', msg))
    expect(result.current.state.agents.writingPartner.transcript).toHaveLength(0)
    expect(result.current.state.agents.alex.transcript).toHaveLength(0)
  })

  it('clearTranscript empties only the selected agent transcript', () => {
    const { result } = renderHook(() => useProjectState())
    const oliverMsg: TranscriptMessage = { id: 'msg1', role: 'assistant', content: 'hi', speaker: 'Oliver', ts: 1 }
    const samMsg: TranscriptMessage = { id: 'msg2', role: 'assistant', content: 'hello', speaker: 'Sam', ts: 2 }

    act(() => result.current.addMessage('oliver', oliverMsg))
    act(() => result.current.addMessage('sam', samMsg))
    act(() => result.current.clearTranscript('oliver'))

    expect(result.current.state.agents.oliver.transcript).toHaveLength(0)
    expect(result.current.state.agents.sam.transcript).toHaveLength(1)
  })

  it('updateScript stores rawHtml and scenes', () => {
    const { result } = renderHook(() => useProjectState())
    const scenes: ScriptScene[] = [{ id: 's1', heading: 'INT. ROOM - DAY', index: 1 }]
    act(() => result.current.updateScript('<p>hello</p>', scenes))
    expect(result.current.state.script.rawHtml).toBe('<p>hello</p>')
    expect(result.current.state.script.scenes).toEqual(scenes)
  })

  it('updateScript persists to localStorage', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.updateScript('<p>persisted</p>', []))
    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.script.rawHtml).toBe('<p>persisted</p>')
  })

  it('createProject starts a fresh project without deleting the current script', () => {
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.setMeta({ title: 'First Script' }))
    act(() => result.current.updateScript('<p data-element-type="action">Keep this page.</p>', []))
    const firstProjectId = result.current.activeProjectId

    act(() => result.current.createProject())

    expect(result.current.activeProjectId).not.toBe(firstProjectId)
    expect(result.current.state.meta.title).toBe('')
    expect(result.current.state.script.rawHtml).toBe('')
    expect(result.current.projects).toHaveLength(2)

    act(() => result.current.switchProject(firstProjectId))

    expect(result.current.state.meta.title).toBe('First Script')
    expect(result.current.state.script.rawHtml).toBe('<p data-element-type="action">Keep this page.</p>')
  })

  it('addMessage persists to localStorage', () => {
    const { result } = renderHook(() => useProjectState())
    const msg: TranscriptMessage = { id: 'msg3', role: 'user', content: 'persist me', speaker: 'Writer', ts: 3 }
    act(() => result.current.addMessage('writingPartner', msg))
    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.agents.writingPartner.transcript).toHaveLength(1)
    expect(stored.agents.writingPartner.transcript[0].content).toBe('persist me')
  })
})
