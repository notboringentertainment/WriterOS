import type { ProjectState } from './projectState'
import { getProjectContextTitle } from './projectIdentity'

export type PersonaId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'

export interface ProjectContext {
  title?: string
  genre?: string
  logline?: string
  script: ScriptContext
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

export const SCRIPT_EXCERPT_WORD_LIMIT = 500
const SCRIPT_CONTEXT_LIST_LIMIT = 80
const SCRIPT_ACTION_SNIPPET_LIMIT = 24

interface ScriptBlock {
  type: string
  text: string
}

export interface ScriptContext {
  excerpt: string
  sceneHeadings: string[]
  dialogueSnippets: string[]
  actionSnippets: string[]
  characterNames: string[]
  excerptWordCount: number
  excerptWordLimit: number
  excerptTruncated: boolean
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripHtmlFallback(rawHtml: string): string {
  return normalizeWhitespace(
    rawHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
}

function parseScriptBlocks(rawHtml: string): ScriptBlock[] {
  if (!rawHtml.trim() || typeof DOMParser === 'undefined') return []

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  const elements = Array.from(doc.body.querySelectorAll<HTMLElement>('[data-element-type], p'))

  return elements
    .map(el => ({
      type: el.getAttribute('data-element-type') ?? 'action',
      text: normalizeWhitespace(el.textContent ?? ''),
    }))
    .filter(block => block.text.length > 0)
}

function capWords(value: string, maxWords: number): { text: string; wordCount: number; truncated: boolean } {
  const trimmed = value.trim()
  const matches = Array.from(trimmed.matchAll(/\S+/g))
  if (matches.length <= maxWords) {
    return { text: trimmed, wordCount: matches.length, truncated: false }
  }

  const lastWord = matches[maxWords - 1]
  const end = (lastWord.index ?? 0) + lastWord[0].length
  return { text: trimmed.slice(0, end).trim(), wordCount: maxWords, truncated: true }
}

export function extractScriptContext(rawHtml: string): ScriptContext {
  const blocks = parseScriptBlocks(rawHtml)
  const plainText = blocks.length
    ? blocks.map(block => block.text).join('\n')
    : stripHtmlFallback(rawHtml)
  const excerpt = capWords(plainText, SCRIPT_EXCERPT_WORD_LIMIT)
  const sceneHeadings: string[] = []
  const dialogueSnippets: string[] = []
  const actionSnippets: string[] = []
  const characterNames: string[] = []
  let activeCharacter = ''

  for (const block of blocks) {
    if (block.type === 'scene-heading') {
      activeCharacter = ''
      sceneHeadings.push(block.text)
      continue
    }

    if (block.type === 'character') {
      activeCharacter = block.text
      if (!characterNames.includes(block.text)) characterNames.push(block.text)
      continue
    }

    if (block.type === 'dialogue') {
      dialogueSnippets.push(activeCharacter ? `${activeCharacter}: ${block.text}` : block.text)
      continue
    }

    if (block.type === 'action') {
      actionSnippets.push(block.text)
    }
  }

  return {
    excerpt: excerpt.text,
    sceneHeadings: sceneHeadings.slice(0, SCRIPT_CONTEXT_LIST_LIMIT),
    dialogueSnippets: dialogueSnippets.slice(0, SCRIPT_CONTEXT_LIST_LIMIT),
    actionSnippets: actionSnippets.slice(0, SCRIPT_ACTION_SNIPPET_LIMIT),
    characterNames: characterNames.slice(0, SCRIPT_CONTEXT_LIST_LIMIT),
    excerptWordCount: excerpt.wordCount,
    excerptWordLimit: SCRIPT_EXCERPT_WORD_LIMIT,
    excerptTruncated: excerpt.truncated,
  }
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
    title: getProjectContextTitle(state.meta.title),
    genre: text(state.meta.genre),
    logline: text(state.synopsis.logline),
    script: extractScriptContext(text(state.script.rawHtml)),
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
