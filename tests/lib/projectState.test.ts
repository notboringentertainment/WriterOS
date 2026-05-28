import { describe, it, expect, beforeEach } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  defaultProjectState,
  migrateState,
  saveProjectState,
  loadProjectState,
} from '../../client/src/lib/projectState'
import type { TranscriptMessage, ScriptScene } from '../../client/src/lib/projectState'
import { legacyToDocuments } from '../../client/src/lib/documentMigration'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { createEmptySeriesContent } from '../../shared/documents'

describe('defaultProjectState', () => {
  it('has schemaVersion equal to CURRENT_SCHEMA_VERSION', () => {
    expect(defaultProjectState().schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('has all required top-level keys', () => {
    const state = defaultProjectState()
    expect(state).toMatchObject({
      meta: expect.any(Object),
      script: expect.any(Object),
      outline: expect.any(Object),
      synopsis: expect.any(Object),
      storyBible: expect.any(Object),
      agents: expect.any(Object),
      memory: expect.any(Object),
    })
  })

  it('outline has 15 save-the-cat beats by default', () => {
    expect(defaultProjectState().outline.beats).toHaveLength(15)
  })

  it('defaults project format to feature', () => {
    expect(defaultProjectState().meta.format).toBe('feature')
  })

  it('defaults title page metadata to empty fields', () => {
    expect(defaultProjectState().meta.titlePage).toEqual({
      writtenBy: '',
      basedOn: '',
      contactInfo: '',
      draftLabel: '',
      draftDate: '',
      formatDisplay: '',
    })
  })

  it('default agents include alex', () => {
    expect(defaultProjectState().agents).toHaveProperty('alex')
  })

  it('default agents do not include marcus', () => {
    expect(defaultProjectState().agents).not.toHaveProperty('marcus')
  })

  it('agent transcripts are typed TranscriptMessage arrays', () => {
    const msg: TranscriptMessage = { id: '1', role: 'user', content: 'hi', speaker: 'Writer', ts: 1 }
    const state = defaultProjectState()
    state.agents.alex.transcript.push(msg)
    expect(state.agents.alex.transcript[0].content).toBe('hi')
  })
})

describe('migrateState', () => {
  it('returns default state for null input', () => {
    const result = migrateState(null)
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('returns default state for empty object', () => {
    const result = migrateState({})
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('passes through valid state at current version', () => {
    const state = defaultProjectState()
    state.meta.title = 'My Script'
    const result = migrateState(state)
    expect(result.meta.title).toBe('My Script')
  })

  it('migrates the display fallback title to an unset stored title', () => {
    const state = defaultProjectState()
    state.meta.title = 'Untitled Project'

    const result = migrateState(state)

    expect(result.meta.title).toBe('')
  })

  it('migrates old marcus agent state to alex', () => {
    const state = defaultProjectState() as any
    const msg: TranscriptMessage = { id: '1', role: 'assistant', content: 'Keep going.', speaker: 'Marcus', ts: 1 }
    state.agents.marcus = { transcript: [msg], lastTouched: 123 }
    delete state.agents.alex

    const result = migrateState(state)

    expect(result.agents.alex.transcript).toEqual([msg])
    expect(result.agents.alex.lastTouched).toBe(123)
    expect(result.agents).not.toHaveProperty('marcus')
  })

  it('fills missing nested agent defaults during migration', () => {
    const state = defaultProjectState() as any
    delete state.agents.zoe

    const result = migrateState(state)

    expect(result.agents.zoe).toEqual({ transcript: [], lastTouched: null })
  })

  it('normalizes unknown project formats to feature', () => {
    const state = defaultProjectState() as any
    state.meta.format = 'pilot'

    const result = migrateState(state)

    expect(result.meta.format).toBe('feature')
    expect(result.documents.synopsis.content.header.format).toBe('feature')
  })

  it('hydrates missing title page metadata during migration', () => {
    const state = defaultProjectState() as any
    delete state.meta.titlePage

    const result = migrateState(state)

    expect(result.meta.titlePage).toEqual({
      writtenBy: '',
      basedOn: '',
      contactInfo: '',
      draftLabel: '',
      draftDate: '',
      formatDisplay: '',
    })
  })

  it('normalizes title page metadata during migration', () => {
    const state = defaultProjectState() as any
    state.meta.titlePage = {
      writtenBy: '  Mara   Vale \r\n&\r\n Jonah   Reed ',
      basedOn: ' A   story \r\n by  Mira  Stone ',
      contactInfo: 'mara@example.com\r\n555-0100  ',
      draftLabel: ' Second   Draft ',
      draftDate: ' May   27 ',
      formatDisplay: ' Limited   Series ',
    }

    const result = migrateState(state)

    expect(result.meta.titlePage).toEqual({
      writtenBy: 'Mara Vale\n&\nJonah Reed',
      basedOn: 'A story\nby Mira Stone',
      contactInfo: 'mara@example.com\n555-0100',
      draftLabel: 'Second Draft',
      draftDate: 'May 27',
      formatDisplay: 'Limited Series',
    })
  })

  it('preserves explicit series project format', () => {
    const state = defaultProjectState() as any
    state.meta.format = 'series'

    const result = migrateState(state)

    expect(result.meta.format).toBe('series')
    expect(result.documents.synopsis.content.header.format).toBe('series')
  })

  it('promotes legacy synopsis header series format to project format', () => {
    const state = defaultProjectState() as any
    state.meta.format = 'feature'
    state.documents.synopsis.content.header.format = 'series'
    state.documents.synopsis.content.series = {
      ...createEmptySeriesContent(),
      showOverview: 'A renewable conflict in a sealed city.',
    }

    const result = migrateState(state)

    expect(result.meta.format).toBe('series')
    expect(result.documents.synopsis.content.header.format).toBe('series')
    expect(result.documents.synopsis.content.series).toEqual(state.documents.synopsis.content.series)
  })

  it('normalizes stale synopsis header format mirrors during migration', () => {
    const state = defaultProjectState() as any
    state.meta.format = ''
    state.documents.synopsis.content.header.format = 'feature_film'

    const result = migrateState(state)

    expect(result.meta.format).toBe('feature')
    expect(result.documents.synopsis.content.header.format).toBe('feature')
  })
})

describe('script field — typed shape', () => {
  it('defaultProjectState has rawHtml empty string', () => {
    expect(defaultProjectState().script.rawHtml).toBe('')
  })

  it('defaultProjectState has empty scenes array', () => {
    expect(defaultProjectState().script.scenes).toEqual([])
  })

  it('migrateState converts old unknown[] shape to new shape', () => {
    const old = { schemaVersion: 1, script: { scenes: [], elements: [], revisionHistory: [] } }
    const migrated = migrateState(old)
    expect(migrated.script.rawHtml).toBe('')
    expect(Array.isArray(migrated.script.scenes)).toBe(true)
  })

  it('migrateState preserves existing rawHtml', () => {
    const old = { schemaVersion: 1, script: { rawHtml: '<p>hello</p>', scenes: [] } }
    const migrated = migrateState(old)
    expect(migrated.script.rawHtml).toBe('<p>hello</p>')
  })

  it('ScriptScene type compiles — id, heading, index fields present', () => {
    const scene: ScriptScene = { id: 's1', heading: 'INT. ROOM - DAY', index: 1 }
    expect(scene.heading).toBe('INT. ROOM - DAY')
  })
})

describe('saveProjectState / loadProjectState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips state through localStorage', () => {
    const state = defaultProjectState()
    state.meta.title = 'Test Script'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.meta.title).toBe('Test Script')
  })

  it('loadProjectState returns default state when nothing stored', () => {
    const loaded = loadProjectState()
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

describe('migrateState — legacy states hydrate documents', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('populates documents from legacy synopsis/outline/storyBible when documents are absent', () => {
    const v2 = defaultProjectState() as any
    v2.schemaVersion = 2
    v2.synopsis.logline = 'A widow returns home.'
    v2.synopsis.sections.setup = 'OPENING'
    delete v2.documents

    const migrated = migrateState(v2)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.documents.synopsis.content.logline.text).toBe('A widow returns home.')
    expect(migrated.documents.synopsis.content.prose.opening).toBe('OPENING')
    expect(migrated.synopsis.logline).toBe('A widow returns home.')
    expect(migrated.synopsis.sections.setup).toBe('OPENING')
  })

  it('does not overwrite existing documents on already-v3 state', () => {
    const v3 = defaultProjectState() as any
    v3.documents.synopsis.content.logline.text = 'EXISTING'
    v3.synopsis.logline = 'LEGACY'

    const migrated = migrateState(v3)

    expect(migrated.documents.synopsis.content.logline.text).toBe('EXISTING')
    expect(migrated.synopsis.logline).toBe('LEGACY')
  })

  it('adds a treatment document when loading pre-treatment document bundles', () => {
    const v4 = defaultProjectState() as any
    v4.schemaVersion = 4
    delete v4.documents.treatment

    const migrated = migrateState(v4)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.documents.treatment.content.logline).toBe('')
    expect(migrated.documents.treatment.content.header.format).toBe('feature')
  })

  it('copies rich pre-v5 outline material into empty treatment without removing outline content', () => {
    const v4 = defaultProjectState() as any
    v4.schemaVersion = 4
    v4.documents.outline.content.spine.protagonist = 'Sara'
    v4.documents.outline.content.spine.externalGoal = 'save her brother'
    v4.documents.outline.content.spine.centralOpposition = 'a rescue network that hides failed calls'
    v4.documents.outline.content.spine.theme = 'Mercy under pressure'
    const opening = createOutlineUnit('feature.openingNormalWorld')
    opening.whatHappens = 'Sara ends a night shift in a city that treats emergency calls like confessions.'
    const inciting = createOutlineUnit('feature.incitingIncident')
    inciting.whatHappens = 'A call arrives from her brother three days after he vanished.'
    v4.documents.outline.content.units = [opening, inciting]

    const migrated = migrateState(v4)

    expect(migrated.documents.outline.content.spine.protagonist).toBe('Sara')
    expect(migrated.documents.outline.content.units).toHaveLength(2)
    expect(migrated.documents.treatment.content.concept.premise).toContain('Who we follow: Sara')
    expect(migrated.documents.treatment.content.concept.premise).toContain('save her brother')
    expect(migrated.documents.treatment.content.concept.theme).toBe('Mercy under pressure')
    expect(migrated.documents.treatment.content.prose.opening).toContain('Sara ends a night shift')
    expect(migrated.documents.treatment.content.prose.opening).toContain('A call arrives')
  })

  it('round-trips v3 state through localStorage', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'persisted logline'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.logline.text).toBe('persisted logline')
  })

  it('defaultProjectState includes documents matching legacyToDocuments(defaultProjectState())', () => {
    const state = defaultProjectState()
    const fromLegacy = legacyToDocuments(state, () => state.documents.synopsis.updatedAt)
    expect(state.documents.synopsis.content).toEqual(fromLegacy.synopsis.content)
    expect(state.documents.outline.content).toEqual(fromLegacy.outline.content)
    expect(state.documents.storyBible.content).toEqual(fromLegacy.storyBible.content)
    expect(state.documents.treatment.content).toEqual(fromLegacy.treatment.content)
  })
})

describe('saveProjectState — preserves document-only Synopsis fields', () => {
  beforeEach(() => localStorage.clear())

  it('preserves documents.synopsis.content.header.title across save/load', () => {
    const state = defaultProjectState()
    state.documents.synopsis.content.header.title = 'My Film'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.header.title).toBe('My Film')
  })

  it('preserves all six header fields including comps across save/load', () => {
    const state = defaultProjectState()
    state.documents.synopsis.content.header = {
      title: 'My Film',
      writer: 'Ben',
      format: 'feature',
      genre: 'drama',
      targetRuntime: '100m',
      comps: ['Heat', 'Manchester by the Sea'],
    }
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.header).toEqual(state.documents.synopsis.content.header)
  })

  it('saves synopsis header format as a mirror of canonical meta.format', () => {
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.synopsis.content.header.format = 'feature'
    state.documents.synopsis.content.series = createEmptySeriesContent()

    saveProjectState(state)
    const loaded = loadProjectState()

    expect(loaded.meta.format).toBe('series')
    expect(loaded.documents.synopsis.content.header.format).toBe('series')
  })

  it('preserves every key in content.qa across save/load', () => {
    const state = defaultProjectState()
    state.documents.synopsis.content.qa = {
      protagonistNamedEarly: true,
      goalClear: true,
      obstacleClear: false,
      stakesClear: true,
      endingRevealed: true,
      paragraphsConnectCausally: false,
      toneMatchesProject: true,
      noUnnecessarySubplot: false,
    }
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.qa).toEqual(state.documents.synopsis.content.qa)
  })

  it('preserves content.aiProductionImplications when set', () => {
    const state = defaultProjectState()
    state.documents.synopsis.content.aiProductionImplications = {
      visuallyImportantSequences: 'climax fire',
      continuitySensitiveMoments: 'sister reveal',
      difficultWorldOrVfx: 'wall of fire',
      likelyReferenceImageNeeds: 'firehouse interior',
    }
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.aiProductionImplications).toEqual(
      state.documents.synopsis.content.aiProductionImplications,
    )
  })

  it('preserves viewPreferences.activeView across save/load', () => {
    const state = defaultProjectState()
    state.documents.synopsis.viewPreferences = { activeView: 'document' }
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.viewPreferences?.activeView).toBe('document')
  })

  it('preserves viewPreferences.synopsisComposeMode across save/load', () => {
    const state = defaultProjectState()
    state.documents.synopsis.viewPreferences = { synopsisComposeMode: 'paragraphs' }
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.viewPreferences?.synopsisComposeMode).toBe('paragraphs')
  })

  it('mirrors state.synopsis.logline into documents.synopsis.content.logline.text', () => {
    const state = defaultProjectState()
    state.synopsis.logline = 'A widow returns home.'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.logline.text).toBe('A widow returns home.')
  })

  it('mirrors all five legacy state.synopsis.sections into documents.synopsis.content.prose', () => {
    const state = defaultProjectState()
    state.synopsis.sections = {
      setup: 'OPENING',
      act1Break: 'ESCALATION',
      midpoint: 'MIDDLE',
      act2Break: 'CLIMAX',
      resolution: 'RESOLUTION',
    }
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.content.prose).toEqual({
      opening: 'OPENING',
      escalation: 'ESCALATION',
      middle: 'MIDDLE',
      climax: 'CLIMAX',
      resolution: 'RESOLUTION',
    })
  })

  it('does NOT mutate documents.outline on save', () => {
    const state = defaultProjectState()
    // mutate outline document with content the legacy slice couldn't reproduce
    state.documents.outline.content.spine.protagonist = 'Sara'
    state.documents.outline.content.spine.theme = 'mercy under pressure'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.outline.content.spine.protagonist).toBe('Sara')
    expect(loaded.documents.outline.content.spine.theme).toBe('mercy under pressure')
  })

  it('does NOT mutate documents.treatment on save', () => {
    const state = defaultProjectState()
    state.documents.treatment.content.logline = 'Treatment-only logline'
    state.documents.treatment.content.concept.premise = 'P'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.treatment.content.logline).toBe('Treatment-only logline')
    expect(loaded.documents.treatment.content.concept.premise).toBe('P')
  })

  it('does NOT mutate documents.storyBible on save', () => {
    const state = defaultProjectState()
    state.documents.storyBible.content.cover.title = 'Bible Title'
    state.documents.storyBible.content.onePagePitch.logline = 'Bible logline'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.storyBible.content.cover.title).toBe('Bible Title')
    expect(loaded.documents.storyBible.content.onePagePitch.logline).toBe('Bible logline')
  })

  it('refreshes documents.synopsis.updatedAt on save', () => {
    const state = defaultProjectState()
    state.documents.synopsis.updatedAt = '2020-01-01T00:00:00.000Z'
    saveProjectState(state)
    const loaded = loadProjectState()
    expect(loaded.documents.synopsis.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
  })
})
