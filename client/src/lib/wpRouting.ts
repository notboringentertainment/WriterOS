import type { ProjectState } from './projectState'
import { getProjectContextTitle } from './projectIdentity'
import {
  buildScriptIndex,
  getDialogueWindowBySpeakers,
  speakersFromMessage,
} from './scriptIndex'

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

export interface ScriptContext {
  excerpt: string
  sceneHeadings: string[]
  dialogueSnippets: string[]
  actionSnippets: string[]
  characterNames: string[]
  excerptWordCount: number
  excerptWordLimit: number
  excerptTruncated: boolean
  totalWordCount: number
  estimatedPageCount: number
  sceneCount: number
  contextReason?: string
  contextLabel?: string
  pageRange?: { start: number; end: number }
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

export function extractScriptContext(rawHtml: string, userMessage = ''): ScriptContext {
  const index = buildScriptIndex(rawHtml)
  const requestedSpeakers = speakersFromMessage(index, userMessage)
  const dialogueWindow = getDialogueWindowBySpeakers(index, requestedSpeakers, SCRIPT_CONTEXT_LIST_LIMIT)
  const sourceBlocks = dialogueWindow?.blocks.length ? dialogueWindow.blocks : index.blocks
  const plainText = sourceBlocks.length
    ? sourceBlocks.map(block => block.text).join('\n')
    : index.plainText
  const excerpt = capWords(plainText, SCRIPT_EXCERPT_WORD_LIMIT)
  const sceneHeadings = dialogueWindow?.sceneHeadings.length
    ? dialogueWindow.sceneHeadings
    : index.scenes.map(scene => scene.heading)
  const dialogueSnippets = dialogueWindow?.dialogueSnippets.length
    ? dialogueWindow.dialogueSnippets
    : index.blocks
      .filter(block => block.type === 'dialogue')
      .map(block => block.speaker ? `${block.speaker}: ${block.text}` : block.text)
  const actionSnippets = dialogueWindow?.actionSnippets.length
    ? dialogueWindow.actionSnippets
    : index.blocks
      .filter(block => block.type === 'action')
      .map(block => block.text)

  return {
    excerpt: excerpt.text,
    sceneHeadings: sceneHeadings.slice(0, SCRIPT_CONTEXT_LIST_LIMIT),
    dialogueSnippets: dialogueSnippets.slice(0, SCRIPT_CONTEXT_LIST_LIMIT),
    actionSnippets: actionSnippets.slice(0, SCRIPT_ACTION_SNIPPET_LIMIT),
    characterNames: index.speakers.slice(0, SCRIPT_CONTEXT_LIST_LIMIT),
    excerptWordCount: excerpt.wordCount,
    excerptWordLimit: SCRIPT_EXCERPT_WORD_LIMIT,
    excerptTruncated: excerpt.truncated,
    totalWordCount: index.totalWordCount,
    estimatedPageCount: index.estimatedPageCount,
    sceneCount: index.scenes.length,
    contextReason: dialogueWindow?.reason,
    contextLabel: dialogueWindow?.label,
    pageRange: dialogueWindow?.pageRange,
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

export function buildProjectContext(state: ProjectState, userMessage = ''): ProjectContext {
  const synopsisSections = state.synopsis.sections
  const storyBible = state.storyBible
  const world = storyBible.world

  return {
    title: getProjectContextTitle(state.meta.title),
    genre: text(state.meta.genre),
    logline: text(state.synopsis.logline),
    script: extractScriptContext(text(state.script.rawHtml), userMessage),
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
