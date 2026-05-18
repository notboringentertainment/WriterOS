import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectState } from '../../client/src/lib/useProjectState'
import { defaultProjectState } from '../../client/src/lib/projectState'
import type { TranscriptMessage, ScriptScene } from '../../client/src/lib/projectState'
import { documentsToLegacy } from '../../client/src/lib/documentMigration'
import {
  createEmptySeriesContent,
  createEmptyStoryBibleContent,
  createEmptySynopsisContent,
  DOCUMENT_SCHEMA_VERSION,
} from '../../shared/documents'

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

  it('setProjectFormat updates the canonical project format', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setProjectFormat('series'))
    expect(result.current.state.meta.format).toBe('series')
    expect(result.current.state.documents.synopsis.content.header.format).toBe('series')
    expect(result.current.state.documents.storyBible.content.cover.format).toBe('series')

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.meta.format).toBe('series')
    expect(stored.documents.synopsis.content.header.format).toBe('series')
    expect(stored.documents.storyBible.content.cover.format).toBe('series')
  })

  it('setProjectFormat lazily initializes series content when entering series', () => {
    const { result } = renderHook(() => useProjectState())
    expect(result.current.state.documents.synopsis.content.series).toBeUndefined()

    act(() => result.current.setProjectFormat('series'))

    expect(result.current.state.documents.synopsis.content.series).toEqual(createEmptySeriesContent())
  })

  it('setProjectFormat preserves feature and existing series synopsis data', () => {
    const existingSeries = { ...createEmptySeriesContent(), showOverview: 'Existing overview' }
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.setSynopsisDocument(c => ({
      ...c,
      prose: { ...c.prose, opening: 'Feature opening.' },
      qa: { ...c.qa, endingRevealed: true },
      aiProductionImplications: {
        visuallyImportantSequences: 'Bridge chase',
        continuitySensitiveMoments: 'Ring changes hands',
        difficultWorldOrVfx: 'Floating city',
        likelyReferenceImageNeeds: 'Old maps',
      },
      series: existingSeries,
    })))

    act(() => result.current.setProjectFormat('series'))
    act(() => result.current.setProjectFormat('feature'))

    expect(result.current.state.documents.synopsis.content.prose.opening).toBe('Feature opening.')
    expect(result.current.state.documents.synopsis.content.qa.endingRevealed).toBe(true)
    expect(result.current.state.documents.synopsis.content.aiProductionImplications?.visuallyImportantSequences).toBe('Bridge chase')
    expect(result.current.state.documents.synopsis.content.series).toEqual(existingSeries)
  })

  it('setProjectFormat does not mutate outline or authored story bible content', () => {
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.setBeat('midpoint', { notes: 'The bargain collapses.' }))
    act(() => result.current.addCharacter({
      name: 'Elena',
      role: 'Lead',
      wound: 'Lost her city',
      want: 'Expose the council',
      need: 'Trust someone else',
      arc: 'Learns shared power',
    }))
    act(() => result.current.setWorld({
      setting: 'A sealed city with ritual gates',
      toneAnchors: 'Pressure, ceremony, glass',
      voiceNotes: 'Precise and humane',
    }))
    act(() => result.current.setThemes('Mercy under civic pressure'))
    act(() => result.current.setRules('No one crosses the east gate after dusk.'))

    const outlineBefore = JSON.parse(JSON.stringify(result.current.state.outline))
    const storyBibleBefore = JSON.parse(JSON.stringify(result.current.state.storyBible))
    const outlineDocumentBefore = JSON.parse(JSON.stringify(result.current.state.documents.outline))
    const storyBibleDocumentBefore = JSON.parse(JSON.stringify(result.current.state.documents.storyBible))

    act(() => result.current.setProjectFormat('series'))

    expect(result.current.state.outline).toEqual(outlineBefore)
    expect(result.current.state.storyBible).toEqual(storyBibleBefore)
    expect(result.current.state.documents.outline).toEqual(outlineDocumentBefore)
    expect({
      ...result.current.state.documents.storyBible,
      updatedAt: storyBibleDocumentBefore.updatedAt,
      content: {
        ...result.current.state.documents.storyBible.content,
        cover: storyBibleDocumentBefore.content.cover,
      },
    }).toEqual(storyBibleDocumentBefore)
    expect(result.current.state.documents.storyBible.content.cover.format).toBe('series')

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.outline).toEqual(outlineBefore)
    expect(stored.storyBible).toEqual(storyBibleBefore)
    expect(stored.documents.outline).toEqual(outlineDocumentBefore)
    expect({
      ...stored.documents.storyBible,
      updatedAt: storyBibleDocumentBefore.updatedAt,
      content: {
        ...stored.documents.storyBible.content,
        cover: storyBibleDocumentBefore.content.cover,
      },
    }).toEqual(storyBibleDocumentBefore)
    expect(stored.documents.storyBible.content.cover.format).toBe('series')
  })

  it('setMeta normalizes default display title to unset stored title', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setMeta({ title: 'Untitled Project' }))
    expect(result.current.state.meta.title).toBe('')
  })

  it('clearSynopsis empties every synopsis field and persists the change', () => {
    const { result } = renderHook(() => useProjectState())

    act(() => result.current.setSynopsisDocument(c => ({ ...c, logline: { ...c.logline, text: 'A hero rises.' } })))
    act(() => result.current.setSynopsisDocument(c => ({ ...c, prose: { ...c.prose, opening: 'Set in Chicago.' } })))
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
    const expectedContent = createEmptyStoryBibleContent()
    expectedContent.cover.format = 'feature'
    expect(result.current.state.documents.storyBible.content).toEqual(expectedContent)

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.storyBible).toEqual(result.current.state.storyBible)
    expect(stored.documents.storyBible.content).toEqual(expectedContent)
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

describe('useProjectState — setSynopsisDocument', () => {
  it('applies the updater to documents.synopsis.content', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(content => ({
      ...content,
      header: { ...content.header, title: 'My Film' },
    })))
    expect(result.current.state.documents.synopsis.content.header.title).toBe('My Film')
  })

  it('refreshes documents.synopsis.updatedAt', () => {
    const { result } = renderHook(() => useProjectState())
    const before = result.current.state.documents.synopsis.updatedAt
    act(() => result.current.setSynopsisDocument(content => ({
      ...content,
      logline: { ...content.logline, text: 'A new logline.' },
    })))
    const after = result.current.state.documents.synopsis.updatedAt
    expect(after).not.toBe(before)
  })

  it('mirrors the legacy slice into state.synopsis after every mutation', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(content => ({
      ...content,
      logline: { ...content.logline, text: 'Mirror me.' },
      prose: {
        opening: 'OPEN',
        escalation: 'ESC',
        middle: 'MID',
        climax: 'CLI',
        resolution: 'RES',
      },
    })))
    expect(result.current.state.synopsis).toEqual(
      documentsToLegacy(result.current.state.documents).synopsis,
    )
    expect(result.current.state.synopsis.logline).toBe('Mirror me.')
    expect(result.current.state.synopsis.sections.setup).toBe('OPEN')
    expect(result.current.state.synopsis.sections.resolution).toBe('RES')
  })

  it('persists documents.synopsis content to localStorage', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(content => ({
      ...content,
      header: { ...content.header, title: 'Persisted Film' },
    })))
    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.documents.synopsis.content.header.title).toBe('Persisted Film')
  })

  it('does not mutate other documents', () => {
    const { result } = renderHook(() => useProjectState())
    const outlineBefore = JSON.parse(JSON.stringify(result.current.state.documents.outline))
    const treatmentBefore = JSON.parse(JSON.stringify(result.current.state.documents.treatment))
    const bibleBefore = JSON.parse(JSON.stringify(result.current.state.documents.storyBible))

    act(() => result.current.setSynopsisDocument(content => ({
      ...content,
      header: { ...content.header, title: 'X' },
    })))

    expect(result.current.state.documents.outline).toEqual(outlineBefore)
    expect(result.current.state.documents.treatment).toEqual(treatmentBefore)
    expect(result.current.state.documents.storyBible).toEqual(bibleBefore)
  })

  it('preserves mirror invariant across arbitrary edit sequence', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(c => ({ ...c, logline: { ...c.logline, text: 'L1' } })))
    act(() => result.current.setSynopsisDocument(c => ({ ...c, prose: { ...c.prose, opening: 'O1' } })))
    act(() => result.current.setSynopsisDocument(c => ({ ...c, prose: { ...c.prose, resolution: 'R1' } })))
    act(() => result.current.setSynopsisDocument(c => ({ ...c, header: { ...c.header, title: 'T1' } })))
    expect(result.current.state.synopsis).toEqual(
      documentsToLegacy(result.current.state.documents).synopsis,
    )
  })
})

describe('useProjectState — setStoryBibleDocument', () => {
  it('applies the updater to documents.storyBible.content', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setStoryBibleDocument(content => ({
      ...content,
      cover: { ...content.cover, title: 'Bible Title' },
    })))
    expect(result.current.state.documents.storyBible.content.cover.title).toBe('Bible Title')
  })

  it('mirrors the legacy story bible slice after every mutation', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setStoryBibleDocument(content => ({
      ...content,
      premiseAndWorld: {
        ...content.premiseAndWorld,
        premise: 'A sealed city',
        worldRules: 'No one leaves after dusk.',
      },
      onePagePitch: { ...content.onePagePitch, whyThisMatters: 'Mercy under pressure' },
      toneAndStyle: {
        ...content.toneAndStyle,
        comps: ['Chinatown', 'Nope'],
        dialogueStyle: 'Spare and cold',
      },
    })))

    expect(result.current.state.storyBible).toEqual(
      documentsToLegacy(result.current.state.documents).storyBible,
    )
    expect(result.current.state.storyBible.world.setting).toBe('A sealed city')
    expect(result.current.state.storyBible.world.toneAnchors).toBe('Chinatown, Nope')
    expect(result.current.state.storyBible.themes).toBe('Mercy under pressure')
  })

  it('persists documents.storyBible content to localStorage', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setStoryBibleDocument(content => ({
      ...content,
      onePagePitch: { ...content.onePagePitch, logline: 'A city eats its saints.' },
    })))

    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.documents.storyBible.content.onePagePitch.logline).toBe('A city eats its saints.')
  })

  it('keeps cover.format mirrored from ProjectState.meta.format', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setProjectFormat('series'))
    act(() => result.current.setStoryBibleDocument(content => ({
      ...content,
      cover: { ...content.cover, format: 'feature', title: 'Wrong mirror' },
    })))

    expect(result.current.state.documents.storyBible.content.cover.format).toBe('series')
  })

  it('does not mutate other documents', () => {
    const { result } = renderHook(() => useProjectState())
    const synopsisBefore = JSON.parse(JSON.stringify(result.current.state.documents.synopsis))
    const outlineBefore = JSON.parse(JSON.stringify(result.current.state.documents.outline))
    const treatmentBefore = JSON.parse(JSON.stringify(result.current.state.documents.treatment))

    act(() => result.current.setStoryBibleDocument(content => ({
      ...content,
      cover: { ...content.cover, title: 'X' },
    })))

    expect(result.current.state.documents.synopsis).toEqual(synopsisBefore)
    expect(result.current.state.documents.outline).toEqual(outlineBefore)
    expect(result.current.state.documents.treatment).toEqual(treatmentBefore)
  })
})

describe('useProjectState — Story Bible legacy migration guard', () => {
  it('migrates legacy fields into documents.storyBible once and sets the guard', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setWorld({
      setting: 'A sealed city',
      toneAnchors: 'Chinatown, Nope',
      voiceNotes: 'Spare and cold',
    }))
    act(() => result.current.setThemes('Mercy under pressure'))
    act(() => result.current.setRules('No one leaves after dusk.'))

    act(() => result.current.migrateStoryBibleLegacyToDocument())

    expect(result.current.state.documents.storyBible.viewPreferences?.migratedFromLegacyStoryBible).toBe(true)
    expect(result.current.state.documents.storyBible.content.premiseAndWorld.premise).toBe('A sealed city')
    expect(result.current.state.documents.storyBible.content.toneAndStyle.comps).toEqual(['Chinatown', 'Nope'])
    expect(result.current.state.documents.storyBible.content.onePagePitch.whyThisMatters).toBe('Mercy under pressure')
  })

  it('does not re-migrate when the guard is already set', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.migrateStoryBibleLegacyToDocument())
    act(() => result.current.setStoryBibleDocument(content => ({
      ...content,
      onePagePitch: { ...content.onePagePitch, whyThisMatters: 'Document-owned theme' },
    })))

    act(() => result.current.migrateStoryBibleLegacyToDocument())

    expect(result.current.state.documents.storyBible.content.onePagePitch.whyThisMatters).toBe('Document-owned theme')
  })
})

describe('useProjectState — setSynopsisViewPreferences', () => {
  it('merges activeView into viewPreferences', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisViewPreferences({ activeView: 'document' }))
    expect(result.current.state.documents.synopsis.viewPreferences?.activeView).toBe('document')
  })

  it('merges synopsisComposeMode into viewPreferences', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisViewPreferences({ synopsisComposeMode: 'paragraphs' }))
    expect(result.current.state.documents.synopsis.viewPreferences?.synopsisComposeMode).toBe('paragraphs')
  })

  it('preserves other view preferences when patching one key', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisViewPreferences({ activeView: 'document' }))
    act(() => result.current.setSynopsisViewPreferences({ synopsisComposeMode: 'prose' }))
    const prefs = result.current.state.documents.synopsis.viewPreferences
    expect(prefs?.activeView).toBe('document')
    expect(prefs?.synopsisComposeMode).toBe('prose')
  })

  it('persists viewPreferences to localStorage', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisViewPreferences({ activeView: 'document' }))
    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    expect(stored.documents.synopsis.viewPreferences?.activeView).toBe('document')
  })
})

describe('useProjectState — clearSynopsis dual reset', () => {
  it('resets state.synopsis to defaultProjectState().synopsis', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(c => ({
      ...c,
      logline: { ...c.logline, text: 'A logline.' },
      prose: { opening: 'O', escalation: 'E', middle: 'M', climax: 'C', resolution: 'R' },
    })))
    act(() => result.current.clearSynopsis())
    expect(result.current.state.synopsis).toEqual(defaultProjectState().synopsis)
  })

  it('resets documents.synopsis.content to empty', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(c => ({
      ...c,
      header: { ...c.header, title: 'My Film' },
      logline: { ...c.logline, text: 'A logline.' },
    })))
    act(() => result.current.clearSynopsis())
    const expected = createEmptySynopsisContent()
    expected.header.format = 'feature'
    expect(result.current.state.documents.synopsis.content).toEqual(expected)
  })

  it('resets documents.synopsis.content to empty series shape when project format is series', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setProjectFormat('series'))
    act(() => result.current.setSynopsisDocument(c => ({
      ...c,
      logline: { ...c.logline, text: 'A logline.' },
      series: { ...createEmptySeriesContent(), showOverview: 'To be cleared.' },
    })))

    act(() => result.current.clearSynopsis())

    const expected = createEmptySynopsisContent()
    expected.header.format = 'series'
    expected.series = createEmptySeriesContent()
    expect(result.current.state.documents.synopsis.content).toEqual(expected)
  })

  it('clears documents.synopsis viewPreferences', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisViewPreferences({ activeView: 'document', synopsisComposeMode: 'paragraphs' }))
    act(() => result.current.clearSynopsis())
    // After clear, viewPreferences should be absent or empty.
    const prefs = result.current.state.documents.synopsis.viewPreferences
    expect(prefs === undefined || Object.keys(prefs).length === 0).toBe(true)
  })

  it('preserves mirror invariant after clear', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(c => ({
      ...c,
      logline: { ...c.logline, text: 'Hello.' },
    })))
    act(() => result.current.clearSynopsis())
    expect(result.current.state.synopsis).toEqual(
      documentsToLegacy(result.current.state.documents).synopsis,
    )
  })

  it('does not affect other documents', () => {
    const { result } = renderHook(() => useProjectState())
    const outlineBefore = JSON.parse(JSON.stringify(result.current.state.documents.outline))
    const treatmentBefore = JSON.parse(JSON.stringify(result.current.state.documents.treatment))
    const bibleBefore = JSON.parse(JSON.stringify(result.current.state.documents.storyBible))
    act(() => result.current.clearSynopsis())
    expect(result.current.state.documents.outline).toEqual(outlineBefore)
    expect(result.current.state.documents.treatment).toEqual(treatmentBefore)
    expect(result.current.state.documents.storyBible).toEqual(bibleBefore)
  })

  it('persists the cleared state to localStorage', () => {
    const { result } = renderHook(() => useProjectState())
    act(() => result.current.setSynopsisDocument(c => ({
      ...c,
      header: { ...c.header, title: 'Persisted' },
    })))
    act(() => result.current.clearSynopsis())
    const stored = JSON.parse(localStorage.getItem('writeros_project_state')!)
    const expected = createEmptySynopsisContent()
    expected.header.format = 'feature'
    expect(stored.synopsis).toEqual(defaultProjectState().synopsis)
    expect(stored.documents.synopsis.content).toEqual(expected)
  })

  it('refreshes documents.synopsis.updatedAt on clear', () => {
    const { result } = renderHook(() => useProjectState())
    const before = result.current.state.documents.synopsis.updatedAt
    act(() => result.current.clearSynopsis())
    const after = result.current.state.documents.synopsis.updatedAt
    expect(after).not.toBe(before)
    expect(typeof after).toBe('string')
  })
})
