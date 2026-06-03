import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultProjectState,
  migrateState,
  saveProjectState,
  loadProjectState,
} from '../../client/src/lib/projectState'
import {
  WRITEROS_SCRIPT_SCRATCHPAD_PATH,
  readWriterOSProjectPackage,
  serializeWriterOSProjectPackage,
} from '../../client/src/lib/projectPackage'
import type { StoredProject } from '../../client/src/lib/projectLibrary'
import type { ScratchpadItem } from '../../client/src/lib/scriptScratchpad'

function makeStoredProject(items: ScratchpadItem[]): StoredProject {
  const state = defaultProjectState()
  state.script.scratchpad = { items }
  return {
    id: 'project-scratchpad',
    createdAt: Date.parse('2026-06-01T10:00:00.000Z'),
    updatedAt: Date.parse('2026-06-02T11:30:00.000Z'),
    state,
  }
}

const SAMPLE_ITEM: ScratchpadItem = {
  id: 'item-1',
  type: 'task',
  text: 'Tighten the midpoint',
  checked: true,
  pinnedScene: { heading: 'INT. KITCHEN - DAY', index: 2 },
}

describe('ProjectState scratchpad persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('default project state seeds an empty scratchpad', () => {
    expect(defaultProjectState().script.scratchpad).toEqual({ items: [] })
  })

  it('migrateState fills a missing scratchpad for legacy state', () => {
    const legacy = defaultProjectState() as unknown as Record<string, unknown>
    const script = { ...(legacy.script as Record<string, unknown>) }
    delete script.scratchpad
    legacy.script = script

    const migrated = migrateState(legacy)
    expect(migrated.script.scratchpad).toEqual({ items: [] })
  })

  it('migrateState normalizes malformed scratchpad items', () => {
    const raw = defaultProjectState() as unknown as Record<string, unknown>
    ;(raw.script as Record<string, unknown>).scratchpad = {
      items: [
        null,
        { id: 'keep', type: 'mystery', text: 'note' },
        SAMPLE_ITEM,
      ],
    }

    const migrated = migrateState(raw)
    expect(migrated.script.scratchpad.items).toHaveLength(2)
    expect(migrated.script.scratchpad.items[0]).toMatchObject({ id: 'keep', type: 'text' })
    expect(migrated.script.scratchpad.items[1]).toMatchObject({ id: 'item-1', type: 'task', checked: true })
  })

  it('saveProjectState round-trips scratchpad items through localStorage', () => {
    const state = defaultProjectState()
    state.script.scratchpad = { items: [SAMPLE_ITEM] }
    saveProjectState(state)

    const loaded = loadProjectState()
    expect(loaded.script.scratchpad.items).toHaveLength(1)
    expect(loaded.script.scratchpad.items[0]).toEqual(SAMPLE_ITEM)
  })
})

describe('WriterOS package scratchpad persistence', () => {
  it('serializes the scratchpad to script/scratchpad.json', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject([SAMPLE_ITEM]))
    expect(projectPackage.files[WRITEROS_SCRIPT_SCRATCHPAD_PATH]).toBeDefined()
    expect(JSON.parse(projectPackage.files[WRITEROS_SCRIPT_SCRATCHPAD_PATH])).toEqual({ items: [SAMPLE_ITEM] })
  })

  it('round-trips scratchpad items including pinned scenes', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject([SAMPLE_ITEM]))
    const result = readWriterOSProjectPackage(projectPackage.files)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.state.script.scratchpad.items).toEqual([SAMPLE_ITEM])
  })

  it('falls back to an empty scratchpad when the file is missing', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject([SAMPLE_ITEM]))
    delete projectPackage.files[WRITEROS_SCRIPT_SCRATCHPAD_PATH]

    const result = readWriterOSProjectPackage(projectPackage.files)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.state.script.scratchpad).toEqual({ items: [] })
  })

  it('falls back with a warning when the scratchpad file is malformed', () => {
    const projectPackage = serializeWriterOSProjectPackage(makeStoredProject([SAMPLE_ITEM]))
    projectPackage.files[WRITEROS_SCRIPT_SCRATCHPAD_PATH] = JSON.stringify({ items: 'nope' })

    const result = readWriterOSProjectPackage(projectPackage.files)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.project.state.script.scratchpad).toEqual({ items: [] })
    expect(result.warnings.some(w => w.includes(WRITEROS_SCRIPT_SCRATCHPAD_PATH))).toBe(true)
  })
})
