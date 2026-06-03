import { describe, it, expect } from 'vitest'
import {
  addScratchpadItem,
  createScratchpadItem,
  currentSceneFromHeadings,
  defaultScratchpadState,
  normalizeScratchpadState,
  pinScratchpadItem,
  removeScratchpadItem,
  resolvePinnedSceneHeading,
  setScratchpadItemType,
  toggleScratchpadItem,
  unpinScratchpadItem,
  updateScratchpadItemText,
  type ScratchpadState,
} from '../../client/src/lib/scriptScratchpad'

describe('defaultScratchpadState', () => {
  it('starts with no items', () => {
    expect(defaultScratchpadState()).toEqual({ items: [] })
  })
})

describe('createScratchpadItem', () => {
  it('creates a text item with a unique id by default', () => {
    const a = createScratchpadItem()
    const b = createScratchpadItem()
    expect(a.type).toBe('text')
    expect(a.checked).toBe(false)
    expect(a.pinnedScene).toBeNull()
    expect(a.id).not.toBe(b.id)
  })

  it('applies overrides', () => {
    const item = createScratchpadItem('task', { text: 'Beat it out', checked: true })
    expect(item.type).toBe('task')
    expect(item.text).toBe('Beat it out')
    expect(item.checked).toBe(true)
  })
})

describe('normalizeScratchpadState', () => {
  it('returns an empty scratchpad for garbage input', () => {
    expect(normalizeScratchpadState(null)).toEqual({ items: [] })
    expect(normalizeScratchpadState('nope')).toEqual({ items: [] })
    expect(normalizeScratchpadState({ items: 'nope' })).toEqual({ items: [] })
  })

  it('drops invalid items and defaults unknown types to text', () => {
    const normalized = normalizeScratchpadState({
      items: [
        null,
        42,
        { id: 'keep', type: 'mystery', text: 'hi' },
        { id: 'task-1', type: 'task', text: 'do it', checked: true },
      ],
    })
    expect(normalized.items).toHaveLength(2)
    expect(normalized.items[0]).toMatchObject({ id: 'keep', type: 'text', text: 'hi', checked: false })
    expect(normalized.items[1]).toMatchObject({ id: 'task-1', type: 'task', checked: true })
  })

  it('only honors checked for task items', () => {
    const normalized = normalizeScratchpadState({
      items: [{ id: 'b', type: 'bullet', text: 'x', checked: true }],
    })
    expect(normalized.items[0].checked).toBe(false)
  })

  it('generates an id when missing', () => {
    const normalized = normalizeScratchpadState({ items: [{ type: 'text', text: 'no id' }] })
    expect(normalized.items[0].id).toBeTruthy()
  })

  it('normalizes pinnedScene and rejects malformed pins', () => {
    const normalized = normalizeScratchpadState({
      items: [
        { id: '1', type: 'text', text: 'a', pinnedScene: { heading: 'INT. KITCHEN - DAY', index: 2 } },
        { id: '2', type: 'text', text: 'b', pinnedScene: { heading: 'no index' } },
        { id: '3', type: 'text', text: 'c', pinnedScene: 'bad' },
      ],
    })
    expect(normalized.items[0].pinnedScene).toEqual({ heading: 'INT. KITCHEN - DAY', index: 2 })
    expect(normalized.items[1].pinnedScene).toBeNull()
    expect(normalized.items[2].pinnedScene).toBeNull()
  })
})

describe('scratchpad operations', () => {
  function base(): ScratchpadState {
    return normalizeScratchpadState({
      items: [
        { id: 'a', type: 'text', text: 'note', checked: false, pinnedScene: null },
        { id: 'b', type: 'task', text: 'todo', checked: false, pinnedScene: null },
      ],
    })
  }

  it('adds an item of the requested type at the end', () => {
    const next = addScratchpadItem(base(), 'bullet')
    expect(next.items).toHaveLength(3)
    expect(next.items[2].type).toBe('bullet')
  })

  it('updates item text immutably', () => {
    const start = base()
    const next = updateScratchpadItemText(start, 'a', 'changed')
    expect(next.items[0].text).toBe('changed')
    expect(start.items[0].text).toBe('note')
  })

  it('toggles task checked state', () => {
    const next = toggleScratchpadItem(base(), 'b')
    expect(next.items[1].checked).toBe(true)
    expect(toggleScratchpadItem(next, 'b').items[1].checked).toBe(false)
  })

  it('clears checked when changing away from task type', () => {
    const checked = toggleScratchpadItem(base(), 'b')
    const next = setScratchpadItemType(checked, 'b', 'bullet')
    expect(next.items[1].type).toBe('bullet')
    expect(next.items[1].checked).toBe(false)
  })

  it('removes an item by id', () => {
    const next = removeScratchpadItem(base(), 'a')
    expect(next.items.map(i => i.id)).toEqual(['b'])
  })

  it('pins and unpins an item', () => {
    const pinned = pinScratchpadItem(base(), 'a', { heading: 'INT. CAR - NIGHT', index: 3 })
    expect(pinned.items[0].pinnedScene).toEqual({ heading: 'INT. CAR - NIGHT', index: 3 })
    const unpinned = unpinScratchpadItem(pinned, 'a')
    expect(unpinned.items[0].pinnedScene).toBeNull()
  })
})

describe('currentSceneFromHeadings', () => {
  const headings = [
    { index: 1, text: 'INT. KITCHEN - DAY', nodePos: 0 },
    { index: 2, text: 'EXT. STREET - NIGHT', nodePos: 40 },
    { index: 3, text: 'INT. CAR - NIGHT', nodePos: 90 },
  ]

  it('returns the last heading at or before the cursor', () => {
    expect(currentSceneFromHeadings(headings, 50)).toEqual({ heading: 'EXT. STREET - NIGHT', index: 2 })
    expect(currentSceneFromHeadings(headings, 0)).toEqual({ heading: 'INT. KITCHEN - DAY', index: 1 })
    expect(currentSceneFromHeadings(headings, 999)).toEqual({ heading: 'INT. CAR - NIGHT', index: 3 })
  })

  it('returns null when there are no headings', () => {
    expect(currentSceneFromHeadings([], 10)).toBeNull()
  })

  it('returns null when the cursor precedes the first heading', () => {
    expect(currentSceneFromHeadings([{ index: 1, text: 'INT. X', nodePos: 5 }], 2)).toBeNull()
  })
})

describe('resolvePinnedSceneHeading', () => {
  const headings = [
    { index: 1, text: 'INT. KITCHEN - DAY', nodePos: 0 },
    { index: 2, text: 'EXT. PARK - NIGHT', nodePos: 40 },
  ]

  it('prefers an exact index + heading match', () => {
    const scene = { heading: 'EXT. PARK - NIGHT', index: 2 }
    expect(resolvePinnedSceneHeading(headings, scene)).toBe(headings[1])
  })

  it('follows the heading when the stored index has drifted', () => {
    // Pin was made when KITCHEN was scene 2; KITCHEN is now scene 1.
    const scene = { heading: 'INT. KITCHEN - DAY', index: 2 }
    const resolved = resolvePinnedSceneHeading(headings, scene)
    expect(resolved).toBe(headings[0])
    expect(resolved?.index).toBe(1)
    // Must NOT return whatever currently sits at the stale index 2.
    expect(resolved?.text).not.toBe('EXT. PARK - NIGHT')
  })

  it('falls back to the stored index when the heading text changed', () => {
    const scene = { heading: 'INT. KITCHEN - MORNING (renamed)', index: 2 }
    expect(resolvePinnedSceneHeading(headings, scene)).toBe(headings[1])
  })

  it('returns null when nothing matches', () => {
    expect(resolvePinnedSceneHeading([], { heading: 'INT. X', index: 9 })).toBeNull()
    expect(resolvePinnedSceneHeading(headings, { heading: 'INT. VOID', index: 9 })).toBeNull()
  })
})
