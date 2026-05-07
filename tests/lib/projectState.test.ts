import { describe, it, expect, beforeEach } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  defaultProjectState,
  migrateState,
  saveProjectState,
  loadProjectState,
} from '../../client/src/lib/projectState'
import type { TranscriptMessage, ScriptScene } from '../../client/src/lib/projectState'

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
