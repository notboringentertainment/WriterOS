// Script Scratchpad — persistent, script-adjacent working notes (PRD Slice 3).
//
// The scratchpad is a flat, ordered list of typed items. Each item is one of:
//   - `text`   : a plain note line (rich-text body deferred to a later slice)
//   - `bullet` : a simple bullet-list entry
//   - `task`   : a checkbox entry for beat/task tracking
//
// An item may optionally be pinned to a script scene. The pin stores a snapshot
// of the scene heading + 1-based index so the note stays meaningful even as the
// script changes. The scratchpad never mutates screenplay content and is not
// fed to agents unless a later context rule explicitly opts it in.

export type ScratchpadItemType = 'text' | 'bullet' | 'task'

export const SCRATCHPAD_ITEM_TYPES: readonly ScratchpadItemType[] = ['text', 'bullet', 'task']

export interface ScratchpadPinnedScene {
  heading: string
  index: number
}

export interface ScratchpadItem {
  id: string
  type: ScratchpadItemType
  text: string
  checked: boolean
  pinnedScene: ScratchpadPinnedScene | null
}

export interface ScratchpadState {
  items: ScratchpadItem[]
}

export function defaultScratchpadState(): ScratchpadState {
  return { items: [] }
}

let idCounter = 0

export function createScratchpadItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `scratchpad-${crypto.randomUUID()}`
  }
  idCounter += 1
  return `scratchpad-${idCounter}-${Math.floor(performance.now?.() ?? 0)}`
}

export function createScratchpadItem(
  type: ScratchpadItemType = 'text',
  overrides: Partial<ScratchpadItem> = {},
): ScratchpadItem {
  return {
    id: createScratchpadItemId(),
    type,
    text: '',
    checked: false,
    pinnedScene: null,
    ...overrides,
  }
}

function isScratchpadItemType(value: unknown): value is ScratchpadItemType {
  return value === 'text' || value === 'bullet' || value === 'task'
}

function normalizePinnedScene(value: unknown): ScratchpadPinnedScene | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const index =
    typeof raw.index === 'number' && Number.isFinite(raw.index) && raw.index >= 0
      ? Math.floor(raw.index)
      : null
  if (index === null) return null
  return {
    heading: typeof raw.heading === 'string' ? raw.heading : '',
    index,
  }
}

function normalizeScratchpadItem(value: unknown): ScratchpadItem | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const type = isScratchpadItemType(raw.type) ? raw.type : 'text'
  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : createScratchpadItemId(),
    type,
    text: typeof raw.text === 'string' ? raw.text : '',
    checked: type === 'task' && raw.checked === true,
    pinnedScene: normalizePinnedScene(raw.pinnedScene),
  }
}

export function normalizeScratchpadState(value: unknown): ScratchpadState {
  if (!value || typeof value !== 'object') return defaultScratchpadState()
  const raw = value as Record<string, unknown>
  const items = Array.isArray(raw.items)
    ? raw.items
        .map(normalizeScratchpadItem)
        .filter((item): item is ScratchpadItem => item !== null)
    : []
  return { items }
}

// --- Pure state operations (used by the panel via the project-state setter) ---

export function addScratchpadItem(
  state: ScratchpadState,
  type: ScratchpadItemType = 'text',
): ScratchpadState {
  return { items: [...state.items, createScratchpadItem(type)] }
}

function mapItem(
  state: ScratchpadState,
  id: string,
  transform: (item: ScratchpadItem) => ScratchpadItem,
): ScratchpadState {
  return {
    items: state.items.map(item => (item.id === id ? transform(item) : item)),
  }
}

export function updateScratchpadItemText(
  state: ScratchpadState,
  id: string,
  text: string,
): ScratchpadState {
  return mapItem(state, id, item => ({ ...item, text }))
}

export function setScratchpadItemType(
  state: ScratchpadState,
  id: string,
  type: ScratchpadItemType,
): ScratchpadState {
  return mapItem(state, id, item => ({
    ...item,
    type,
    // `checked` only has meaning for tasks; clear it when leaving the task type.
    checked: type === 'task' ? item.checked : false,
  }))
}

export function toggleScratchpadItem(state: ScratchpadState, id: string): ScratchpadState {
  return mapItem(state, id, item => ({ ...item, checked: !item.checked }))
}

export function removeScratchpadItem(state: ScratchpadState, id: string): ScratchpadState {
  return { items: state.items.filter(item => item.id !== id) }
}

export function pinScratchpadItem(
  state: ScratchpadState,
  id: string,
  scene: ScratchpadPinnedScene,
): ScratchpadState {
  return mapItem(state, id, item => ({ ...item, pinnedScene: scene }))
}

export function unpinScratchpadItem(state: ScratchpadState, id: string): ScratchpadState {
  return mapItem(state, id, item => ({ ...item, pinnedScene: null }))
}

// --- Current-scene resolution for pinning ---

export interface SceneHeadingPosition {
  index: number
  text: string
  nodePos: number
}

/**
 * Resolve a stored pin to a live scene heading. Index is positional and drifts
 * as the script changes, so prefer an exact (index + heading) match, then fall
 * back to the heading text if scenes have renumbered, and only use the stored
 * index when the heading text itself changed. Returns null when nothing matches.
 */
export function resolvePinnedSceneHeading<H extends { index: number; text: string }>(
  headings: H[],
  scene: ScratchpadPinnedScene,
): H | null {
  return (
    headings.find(h => h.index === scene.index && h.text === scene.heading) ??
    headings.find(h => h.text === scene.heading) ??
    headings.find(h => h.index === scene.index) ??
    null
  )
}

/**
 * Resolve the scene the editor cursor currently sits in. The current scene is
 * the last heading whose document position is at or before the cursor. Returns
 * null when the script has no scene headings or the cursor precedes the first.
 */
export function currentSceneFromHeadings(
  headings: SceneHeadingPosition[],
  cursorPos: number,
): ScratchpadPinnedScene | null {
  let current: SceneHeadingPosition | null = null
  for (const heading of headings) {
    if (heading.nodePos <= cursorPos) {
      current = heading
    } else {
      break
    }
  }
  if (!current) return null
  return { heading: current.text, index: current.index }
}
