// Writers' Room — proposal adoption (client-side, D7).
// Phase 1 supports Story Bible character field paths, which is the only
// surface agents propose against in the spike. Anything else renders as a
// card whose Adopt is disabled with an honest note.

import type { StoryBibleCharacter, StoryBibleDocumentContent } from '@shared/documents'

const CHARACTER_PATH_RE = /^characters\[([^\]]+)\]\.([a-zA-Z]+)$/

const WRITABLE_CHARACTER_FIELDS: ReadonlyArray<keyof StoryBibleCharacter> = [
  'want', 'need', 'flaw', 'secret', 'contradiction', 'arc',
  'relationshipPressure', 'behavioralAnchors', 'speechPatterns',
  'neverWriteThemAs', 'continuityFacts', 'role',
]

export function canApplyProposal(surface: string, fieldPath: string): boolean {
  if (surface !== 'storyBible') return false
  const match = CHARACTER_PATH_RE.exec(fieldPath)
  if (!match) return false
  return (WRITABLE_CHARACTER_FIELDS as readonly string[]).includes(match[2])
}

// Returns the updated content, or null when the path can't be applied
// (unknown character / unsupported field) — caller surfaces that to the writer.
export function applyProposalToStoryBible(
  content: StoryBibleDocumentContent,
  fieldPath: string,
  value: string,
): StoryBibleDocumentContent | null {
  const match = CHARACTER_PATH_RE.exec(fieldPath)
  if (!match) return null
  const [, characterId, field] = match
  if (!(WRITABLE_CHARACTER_FIELDS as readonly string[]).includes(field)) return null

  const index = content.characters.findIndex((c) => c.id === characterId)
  if (index === -1) return null

  const characters = [...content.characters]
  characters[index] = { ...characters[index], [field]: value }
  return { ...content, characters }
}

// Renders active locks as the story_locks shared block text (§4.1).
export function renderStoryLocksBlock(content: StoryBibleDocumentContent): string {
  const active = (content.locks ?? []).filter((lock) => lock.status === 'active')
  if (active.length === 0) return ''
  return active.map((lock) => `[${lock.scope}] ${lock.statement}`).join('\n')
}
