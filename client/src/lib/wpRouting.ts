import type { ProjectState } from './projectState'
import { getProjectContextTitle } from './projectIdentity'
import {
  buildScriptIndex,
  getDialogueWindowBySpeakers,
  getFocusContext,
  getPageRangeContext,
  getSceneContext,
  getScriptOverviewContext,
  pageRangeLabel,
  speakersFromMessage,
  type ScriptFocusState,
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
    format: string
    showOverview: string
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
  selectedText?: string
}

export interface ProjectContextOptions {
  script?: {
    rawHtml?: string
    scenes?: ProjectState['script']['scenes']
    focus?: ScriptFocusState
  }
}

const PERSONA_MENTIONS: Record<string, PersonaId> = {
  partner: 'writingPartner',
  writingpartner: 'writingPartner',
  sam: 'sam',
  casey: 'casey',
  oliver: 'oliver',
  maya: 'maya',
  zoe: 'zoe',
  alex: 'alex',
}

const MENTION_RE = /^@(\w+)\s*/
const OPEN_SWARM_RE = /^\/(?:swarm|openswarm)\s+([\s\S]*)$/i

export function parseMention(text: string): { personaId: PersonaId; strippedText: string } | null {
  const match = MENTION_RE.exec(text)
  if (!match) return null
  const key = match[1].toLowerCase()
  const personaId = PERSONA_MENTIONS[key]
  if (!personaId) return null
  return { personaId, strippedText: text.slice(match[0].length) }
}

export function parseOpenSwarmCommand(text: string): string | null {
  const match = OPEN_SWARM_RE.exec(text.trimStart())
  if (!match) return null
  const strippedText = match[1].trim()
  return strippedText || null
}

export type ActiveTab = 'script' | 'synopsis' | 'outline' | 'story-bible'

const ZOE_SECTIONS = new Set(['world', 'rules'])
const STORY_BIBLE_CASEY_INTENT_RE = /\b(character|protagonist|antagonist|hero|villain|state of mind|psychology|psychological|psyche|mental|emotion|emotional|motivation|motivated|motivate|motivates|motive|want|need|wound|flaw|arc|backstory|trauma|fear|desire|guilt|grief|relationship|theme|thematic|tone|voice)\b/i
const STORY_BIBLE_ZOE_INTENT_RE = /\b(world|worldbuilding|world-building|setting|location|place|city|environment|culture|cultural|society|rules|rule|logic|constraint|constraints|system|systems|technology|mythology|continuity|geography|politics|institution|institutions)\b/i

const WRITING_PARTNER_SPEAKER_LABELS: Record<PersonaId, string> = {
  writingPartner: 'Writing Partner',
  sam: 'Sam',
  casey: 'Casey',
  oliver: 'Oliver',
  maya: 'Maya',
  zoe: 'Zoe',
  alex: 'Alex',
}

export function formatWritingPartnerSpeaker(personaId: PersonaId): string {
  if (personaId === 'writingPartner') return 'Writing Partner'
  return `Writing Partner (@${WRITING_PARTNER_SPEAKER_LABELS[personaId]})`
}

export function getActiveHelperText(
  inputText: string,
  activeTab: ActiveTab,
  storyBibleSection: string | null
): string {
  if (parseOpenSwarmCommand(inputText)) return 'OpenSwarm Writing Partner'

  const mentionResult = parseMention(inputText.trimStart())
  const personaId = mentionResult
    ? mentionResult.personaId
    : getDefaultPersona(activeTab, storyBibleSection, inputText)

  if (personaId === 'writingPartner') return 'Writing Partner'
  return `Writing Partner will ask @${WRITING_PARTNER_SPEAKER_LABELS[personaId]}`
}

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

function wantsCurrentFocus(userMessage: string): boolean {
  return /\b(this scene|this page|this line|these lines|current scene|current page|current line|selected text|selection|on the page|right here|here in the script)\b/i.test(userMessage)
}

function wantsSceneRequest(userMessage: string): boolean {
  return /\b(opening|first|final|last|ending)\s+scene\b/i.test(userMessage) ||
    /\b(scene|sequence|exchange|moment)\b/i.test(userMessage) ||
    /\b(int|ext|interior|exterior)\.?\b/i.test(userMessage)
}

function wantsScriptOverview(userMessage: string): boolean {
  return /\b(whole script|entire script|full script|script overall|overall script|big picture|draft|first act|second act|third act|act one|act two|act three|structure|structural|pacing|weak spots|weaknesses|climax|opening|ending|arc|throughline|payoff|pay off|setup|resolution)\b/i.test(userMessage)
}

function pageRangeFromMessage(userMessage: string): { start: number; end: number } | null {
  const match = /\bpages?\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?/i.exec(userMessage)
  if (!match) return null
  const start = parseInt(match[1], 10)
  const end = match[2] ? parseInt(match[2], 10) : start
  if (start < 1) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

export function extractScriptContext(rawHtml: string, userMessage = '', focus?: ScriptFocusState): ScriptContext {
  const index = buildScriptIndex(rawHtml)
  const requestedPageRange = pageRangeFromMessage(userMessage)
  const hasPageRequest = requestedPageRange !== null
  const pageRangeWindow = requestedPageRange
    ? getPageRangeContext(index, requestedPageRange.start, requestedPageRange.end)
    : null
  const missingPageWindow = requestedPageRange && !pageRangeWindow
    ? {
      reason: 'requested-page-range' as const,
      label: pageRangeLabel(requestedPageRange),
      pageRange: requestedPageRange,
      sceneHeadings: [],
      blocks: [],
      dialogueSnippets: [],
      actionSnippets: [],
      selectedText: undefined,
    }
    : null
  const requestedSpeakers = !hasPageRequest ? speakersFromMessage(index, userMessage) : []
  const sceneWindow = !hasPageRequest && wantsSceneRequest(userMessage)
    ? getSceneContext(index, userMessage, requestedSpeakers)
    : null
  const selectedFocusWindow = !hasPageRequest && !sceneWindow && focus?.selectedText?.trim()
    ? getFocusContext(index, focus)
    : null
  const overviewWindow = !hasPageRequest && !sceneWindow && !selectedFocusWindow && wantsScriptOverview(userMessage)
    ? getScriptOverviewContext(index, SCRIPT_CONTEXT_LIST_LIMIT)
    : null
  const dialogueWindow = !hasPageRequest && !sceneWindow && !selectedFocusWindow && !overviewWindow
    ? getDialogueWindowBySpeakers(index, requestedSpeakers, SCRIPT_CONTEXT_LIST_LIMIT)
    : null
  const focusWindow = !hasPageRequest && !sceneWindow && !selectedFocusWindow && !overviewWindow && !dialogueWindow && wantsCurrentFocus(userMessage)
    ? getFocusContext(index, focus)
    : null
  const contextWindow = pageRangeWindow ?? missingPageWindow ?? sceneWindow ?? selectedFocusWindow ?? overviewWindow ?? dialogueWindow ?? focusWindow
  const sourceBlocks = contextWindow ? contextWindow.blocks : index.blocks
  const plainText = sourceBlocks.length
    ? sourceBlocks.map(block => block.text).join('\n')
    : contextWindow ? '' : index.plainText
  const excerpt = capWords(plainText, SCRIPT_EXCERPT_WORD_LIMIT)
  const sceneHeadings = contextWindow
    ? contextWindow.sceneHeadings
    : index.scenes.map(scene => scene.heading)
  const dialogueSnippets = contextWindow
    ? contextWindow.dialogueSnippets
    : index.blocks
      .filter(block => block.type === 'dialogue')
      .map(block => block.speaker ? `${block.speaker}: ${block.text}` : block.text)
  const actionSnippets = contextWindow
    ? contextWindow.actionSnippets
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
    contextReason: contextWindow?.reason,
    contextLabel: contextWindow?.label,
    pageRange: contextWindow?.pageRange,
    selectedText: contextWindow?.selectedText,
  }
}

function getStoryBiblePersona(storyBibleSection: string | null, userMessage: string): PersonaId {
  const trimmedMessage = userMessage.trim()
  if (trimmedMessage) {
    const wantsCasey = STORY_BIBLE_CASEY_INTENT_RE.test(trimmedMessage)
    const wantsZoe = STORY_BIBLE_ZOE_INTENT_RE.test(trimmedMessage)

    if (wantsCasey && !wantsZoe) return 'casey'
    if (wantsZoe && !wantsCasey) return 'zoe'
  }

  return storyBibleSection && ZOE_SECTIONS.has(storyBibleSection) ? 'zoe' : 'casey'
}

export function getDefaultPersona(
  activeTab: ActiveTab,
  storyBibleSection: string | null,
  userMessage = ''
): PersonaId {
  switch (activeTab) {
    case 'script':   return 'writingPartner'
    case 'synopsis': return 'sam'
    case 'outline':  return 'oliver'
    case 'story-bible':
      return getStoryBiblePersona(storyBibleSection, userMessage)
  }
}

export function buildProjectContext(state: ProjectState, userMessage = '', options: ProjectContextOptions = {}): ProjectContext {
  const synopsisSections = state.synopsis.sections
  const storyBible = state.storyBible
  const world = storyBible.world
  const scriptRawHtml = options.script?.rawHtml ?? state.script.rawHtml
  const scriptScenes = options.script?.scenes ?? state.script.scenes

  return {
    title: getProjectContextTitle(state.meta.title),
    genre: text(state.meta.genre),
    logline: text(state.synopsis.logline),
    script: extractScriptContext(text(scriptRawHtml), userMessage, options.script?.focus),
    synopsis: {
      logline: text(state.synopsis.logline),
      sections: {
        setup: text(synopsisSections.setup),
        act1Break: text(synopsisSections.act1Break),
        midpoint: text(synopsisSections.midpoint),
        act2Break: text(synopsisSections.act2Break),
        resolution: text(synopsisSections.resolution),
      },
      format: text(state.documents.synopsis.content.header.format),
      showOverview: text(state.documents.synopsis.content.series?.showOverview ?? ''),
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
    scenes: scriptScenes,
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
