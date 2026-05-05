import type { ProjectState } from './projectState'

export type PersonaId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'

export interface ProjectContext {
  title?: string
  genre?: string
  logline?: string
  characters: string[]
  beats: string[]
  world: { setting?: string }
}

const SPECIALIST_MENTIONS: Record<string, Exclude<PersonaId, 'writingPartner'>> = {
  sam: 'sam',
  casey: 'casey',
  oliver: 'oliver',
  maya: 'maya',
  zoe: 'zoe',
  alex: 'alex',
}

const MENTION_RE = /^@(\w+)\s*/

export function parseMention(text: string): { personaId: PersonaId; strippedText: string } | null {
  const match = MENTION_RE.exec(text)
  if (!match) return null
  const key = match[1].toLowerCase()
  const personaId = SPECIALIST_MENTIONS[key]
  if (!personaId) return null
  return { personaId, strippedText: text.slice(match[0].length) }
}

export type ActiveTab = 'script' | 'synopsis' | 'outline' | 'story-bible'

const ZOE_SECTIONS = new Set(['world', 'rules'])

export function getDefaultPersona(activeTab: ActiveTab, storyBibleSection: string | null): PersonaId {
  switch (activeTab) {
    case 'script':   return 'writingPartner'
    case 'synopsis': return 'sam'
    case 'outline':  return 'oliver'
    case 'story-bible':
      return storyBibleSection && ZOE_SECTIONS.has(storyBibleSection) ? 'zoe' : 'casey'
  }
}

export function buildProjectContext(state: ProjectState): ProjectContext {
  return {
    title: state.meta.title,
    genre: state.meta.genre,
    logline: state.synopsis.logline,
    characters: state.storyBible.characters.map(c => c.name),
    beats: state.outline.beats.map(b => b.name),
    world: { setting: state.storyBible.world.setting },
  }
}
