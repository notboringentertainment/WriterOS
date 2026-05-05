export const CURRENT_SCHEMA_VERSION = 1
const STORAGE_KEY = 'writeros_project_state'

export type AgentId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  speaker: string
  ts: number
}

export interface Beat {
  id: string
  name: string
  description: string
  notes: string
  linkedSceneIds: string[]
}

export interface Character {
  id: string
  name: string
  role: string
  wound: string
  want: string
  need: string
  arc: string
}

export interface ProjectState {
  schemaVersion: number
  meta: { title: string; genre: string; format: string; wordCount: number; pageCount: number }
  script: { scenes: unknown[]; elements: unknown[]; revisionHistory: unknown[] }
  outline: { beatType: string; beats: Beat[] }
  synopsis: { logline: string; sections: { setup: string; act1Break: string; midpoint: string; act2Break: string; resolution: string } }
  storyBible: { characters: Character[]; world: { setting: string; toneAnchors: string; voiceNotes: string }; themes: string; rules: string }
  agents: {
    writingPartner: { transcript: TranscriptMessage[]; lastActive: number | null }
    sam:    { transcript: TranscriptMessage[]; lastTouched: number | null }
    casey:  { transcript: TranscriptMessage[]; lastTouched: number | null }
    oliver: { transcript: TranscriptMessage[]; lastTouched: number | null }
    maya:   { transcript: TranscriptMessage[]; lastTouched: number | null }
    zoe:    { transcript: TranscriptMessage[]; lastTouched: number | null }
    alex:   { transcript: TranscriptMessage[]; lastTouched: number | null }
  }
  memory: { decisions: unknown[]; flags: unknown[]; handoffs: unknown[] }
}

const SAVE_THE_CAT_BEATS: Omit<Beat, 'notes' | 'linkedSceneIds'>[] = [
  { id: 'opening-image',    name: 'Opening Image',          description: 'A single scene that captures the "before" state of your story — tone, mood, world.' },
  { id: 'theme-stated',     name: 'Theme Stated',           description: "Someone (often not the hero) states what the story is really about. The hero doesn't get it yet." },
  { id: 'set-up',           name: 'Set-Up',                 description: "Introduce the hero in their world. Establish what needs fixing — their flaw, their need." },
  { id: 'catalyst',         name: 'Catalyst',               description: "The inciting incident. Something happens that disrupts the hero's world. No going back." },
  { id: 'debate',           name: 'Debate',                 description: "The hero hesitates. Should they take the leap? Internal or external conflict about crossing the threshold." },
  { id: 'break-into-two',   name: 'Break into Two',         description: 'The hero makes a choice and enters Act Two. The new world begins. Thesis vs. antithesis.' },
  { id: 'b-story',          name: 'B Story',                description: 'A new character or relationship is introduced. Often the love story; always carries the theme.' },
  { id: 'fun-and-games',    name: 'Fun and Games',          description: 'The promise of the premise. What the audience came to see. The hero tests the new world.' },
  { id: 'midpoint',         name: 'Midpoint',               description: 'A false victory or false defeat. Stakes are raised. Hero commits fully — no more playing around.' },
  { id: 'bad-guys-close',   name: 'Bad Guys Close In',      description: 'Internal and external forces push back against the hero. Team starts to fall apart.' },
  { id: 'all-is-lost',      name: 'All Is Lost',            description: "The opposite of the Midpoint. The hero's lowest point. Often a death — literal or symbolic." },
  { id: 'dark-night',       name: 'Dark Night of the Soul', description: 'The hero wallows. Where did I go wrong? The darkest moment before the dawn.' },
  { id: 'break-into-three', name: 'Break into Three',       description: 'The solution. Hero synthesizes A Story and B Story lessons to find the answer.' },
  { id: 'finale',           name: 'Finale',                 description: 'Hero executes the plan, defeats antagonist, changes the world. The thesis wins.' },
  { id: 'final-image',      name: 'Final Image',            description: 'Mirror of the Opening Image. Prove the world has changed — and so has the hero.' },
]

export function defaultProjectState(): ProjectState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { title: 'Untitled Project', genre: '', format: 'feature', wordCount: 0, pageCount: 0 },
    script: { scenes: [], elements: [], revisionHistory: [] },
    outline: {
      beatType: 'save-the-cat',
      beats: SAVE_THE_CAT_BEATS.map(b => ({ ...b, notes: '', linkedSceneIds: [] })),
    },
    synopsis: {
      logline: '',
      sections: { setup: '', act1Break: '', midpoint: '', act2Break: '', resolution: '' },
    },
    storyBible: {
      characters: [],
      world: { setting: '', toneAnchors: '', voiceNotes: '' },
      themes: '',
      rules: '',
    },
    agents: {
      writingPartner: { transcript: [], lastActive: null },
      sam:    { transcript: [], lastTouched: null },
      casey:  { transcript: [], lastTouched: null },
      oliver: { transcript: [], lastTouched: null },
      maya:   { transcript: [], lastTouched: null },
      zoe:    { transcript: [], lastTouched: null },
      alex:   { transcript: [], lastTouched: null },
    },
    memory: { decisions: [], flags: [], handoffs: [] },
  }
}

export function migrateState(raw: unknown): ProjectState {
  if (!raw || typeof raw !== 'object') return defaultProjectState()
  const obj = raw as Record<string, unknown>
  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0
  let state = { ...obj }
  // future: if (version < 2) state = migrateV1toV2(state)
  void version
  state.schemaVersion = CURRENT_SCHEMA_VERSION
  const defaults = defaultProjectState()
  for (const key of Object.keys(defaults) as (keyof ProjectState)[]) {
    if (!(key in state)) (state as Record<string, unknown>)[key] = defaults[key]
  }
  const rawAgents = state.agents && typeof state.agents === 'object'
    ? state.agents as Record<string, unknown>
    : {}
  const agents = { ...defaults.agents } as Record<
    AgentId,
    { transcript: TranscriptMessage[]; lastActive?: number | null; lastTouched?: number | null }
  >
  for (const key of Object.keys(agents) as AgentId[]) {
    const fallbackKey = key === 'alex' ? 'marcus' : key
    const existing = rawAgents[key] ?? rawAgents[fallbackKey]
    if (existing && typeof existing === 'object') {
      agents[key] = { ...agents[key], ...existing }
    }
  }
  state.agents = agents as ProjectState['agents']
  return state as unknown as ProjectState
}

export function saveProjectState(state: ProjectState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadProjectState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return migrateState(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultProjectState()
  }
}
