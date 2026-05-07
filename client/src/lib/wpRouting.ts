import type { ProjectState } from './projectState'

export type PersonaId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'

export interface ProjectContext {
  title?: string
  genre?: string
  logline?: string
  synopsis: {
    logline: string
    sections: ProjectState['synopsis']['sections']
  }
  characters: Array<Pick<ProjectState['storyBible']['characters'][number], 'id' | 'name' | 'role' | 'wound' | 'want' | 'need' | 'arc'>>
  beats: Array<Pick<ProjectState['outline']['beats'][number], 'id' | 'name' | 'description' | 'notes' | 'linkedSceneIds'>>
  scenes: ProjectState['script']['scenes']
  storyBible: {
    themes: string
    rules: string
    world: ProjectState['storyBible']['world']
  }
  world: ProjectState['storyBible']['world']
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

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

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
  const synopsisSections = state.synopsis.sections
  const storyBible = state.storyBible
  const world = storyBible.world

  return {
    title: text(state.meta.title),
    genre: text(state.meta.genre),
    logline: text(state.synopsis.logline),
    synopsis: {
      logline: text(state.synopsis.logline),
      sections: {
        setup: text(synopsisSections.setup),
        act1Break: text(synopsisSections.act1Break),
        midpoint: text(synopsisSections.midpoint),
        act2Break: text(synopsisSections.act2Break),
        resolution: text(synopsisSections.resolution),
      },
    },
    characters: state.storyBible.characters.map(c => ({
      id: text(c.id),
      name: text(c.name),
      role: text(c.role),
      wound: text(c.wound),
      want: text(c.want),
      need: text(c.need),
      arc: text(c.arc),
    })),
    beats: state.outline.beats.map(b => ({
      id: text(b.id),
      name: text(b.name),
      description: text(b.description),
      notes: text(b.notes),
      linkedSceneIds: Array.isArray(b.linkedSceneIds) ? b.linkedSceneIds : [],
    })),
    scenes: state.script.scenes,
    storyBible: {
      themes: text(storyBible.themes),
      rules: text(storyBible.rules),
      world: {
        setting: text(world.setting),
        toneAnchors: text(world.toneAnchors),
        voiceNotes: text(world.voiceNotes),
      },
    },
    world: {
      setting: text(world.setting),
      toneAnchors: text(world.toneAnchors),
      voiceNotes: text(world.voiceNotes),
    },
  }
}
