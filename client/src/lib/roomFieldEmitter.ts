// Writers' Room — doc_field_changed emitter (§6.1, D4/D5).
// Diffs Story Bible character psychology fields on every content patch and
// emits room events with a LEADING-EDGE 90s debounce per field: the first
// change fires immediately (the acceptance test clock starts at the change),
// keystroke follow-ups inside the window are folded into one trailing refresh
// only if the value moved again.

import type { StoryBibleDocumentContent } from '@shared/documents'
import { postRoomEvent } from './roomApi'

export const WATCHED_CHARACTER_FIELDS = ['want', 'need', 'flaw', 'secret', 'arc'] as const
type WatchedField = (typeof WATCHED_CHARACTER_FIELDS)[number]

const DEBOUNCE_MS = 90_000

interface FieldWindow {
  openedAt: number
  oldValue: string // value before the burst began
  lastEmitted: string // newValue carried by the event we already sent
  latest: string
  trailingTimer: ReturnType<typeof setTimeout> | null
}

export interface FieldChange {
  projectId: string
  characterId: string
  characterName: string
  field: WatchedField
  oldValue: string
  newValue: string
}

type EmitFn = (change: FieldChange) => void

const defaultEmit: EmitFn = (change) => {
  void postRoomEvent(change.projectId, 'doc_field_changed', {
    surface: 'storyBible',
    fieldPath: `characters[${change.characterId}].${change.field}`,
    characterName: change.characterName,
    oldValue: change.oldValue,
    newValue: change.newValue,
  })
}

export function createRoomFieldEmitter(emit: EmitFn = defaultEmit, now: () => number = Date.now) {
  const windows = new Map<string, FieldWindow>()

  const fire = (key: string, change: FieldChange, window: FieldWindow) => {
    window.lastEmitted = change.newValue
    window.openedAt = now()
    emit(change)
  }

  const observe = (
    projectId: string,
    prev: StoryBibleDocumentContent,
    next: StoryBibleDocumentContent,
  ): void => {
    const prevById = new Map(prev.characters.map((c) => [c.id, c]))
    for (const character of next.characters) {
      const before = prevById.get(character.id)
      if (!before) continue // new character card — no "change" to react to yet
      for (const field of WATCHED_CHARACTER_FIELDS) {
        const oldValue = before[field] ?? ''
        const newValue = character[field] ?? ''
        if (oldValue === newValue) continue

        const key = `${projectId}:${character.id}:${field}`
        const existing = windows.get(key)
        const nowMs = now()

        if (!existing || nowMs - existing.openedAt >= DEBOUNCE_MS) {
          // Leading edge: emit immediately, open a suppression window.
          const window: FieldWindow = {
            openedAt: nowMs,
            oldValue,
            lastEmitted: newValue,
            latest: newValue,
            trailingTimer: null,
          }
          windows.set(key, window)
          fire(key, {
            projectId,
            characterId: character.id,
            characterName: character.name || character.id,
            field,
            oldValue,
            newValue,
          }, window)
          continue
        }

        // Inside the window: remember the latest value; schedule one trailing
        // refresh at window close if the value moved past what we emitted.
        existing.latest = newValue
        if (existing.trailingTimer) clearTimeout(existing.trailingTimer)
        const remaining = DEBOUNCE_MS - (nowMs - existing.openedAt)
        existing.trailingTimer = setTimeout(() => {
          existing.trailingTimer = null
          if (existing.latest !== existing.lastEmitted) {
            fire(key, {
              projectId,
              characterId: character.id,
              characterName: character.name || character.id,
              field,
              oldValue: existing.lastEmitted,
              newValue: existing.latest,
            }, existing)
          }
        }, remaining)
      }
    }
  }

  const reset = () => {
    for (const window of windows.values()) {
      if (window.trailingTimer) clearTimeout(window.trailingTimer)
    }
    windows.clear()
  }

  return { observe, reset }
}

// Singleton used by the app; tests build their own instances.
export const roomFieldEmitter = createRoomFieldEmitter()
