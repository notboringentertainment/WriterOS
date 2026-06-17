import type { ProjectState } from './projectState'
import { getProjectContextTitle } from './projectIdentity'
import { normalizeProjectFormat, type ProjectFormat } from '@shared/projectFormat'
import type { SynopsisDocumentContent, SynopsisSeriesContent, TreatmentDocumentContent } from '@shared/documents'
import type { SurfaceAwareness } from '@shared/surfaceAwareness'
import { normalizeOutlineContent } from './documentMigration'
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
import { isScriptFactsCacheStale, type ScriptFactEntry, type ScriptFactsCache } from './scriptFacts'

export type PersonaId = 'writingPartner' | 'sam' | 'casey' | 'oliver' | 'maya' | 'zoe' | 'alex'

export interface ProjectContext {
  title?: string
  genre?: string
  format: ProjectFormat
  logline?: string
  // Surface Awareness Contract — attached only at the wp-chat call sites (not OpenSwarm /
  // persona-capability). Absent → omitted from the payload (output unchanged).
  surface?: SurfaceAwareness
  script: ScriptContext
  synopsis: {
    logline: string
    loglineParts: SynopsisDocumentContent['logline']
    prose: SynopsisDocumentContent['prose']
    qa: SynopsisDocumentContent['qa']
    series?: SynopsisSeriesContent
    sections: ProjectState['synopsis']['sections']
    /** @deprecated Use top-level ProjectContext.format. TODO: remove after Outline/Story Bible format selectors land. */
    format: ProjectFormat
    /** @deprecated Use synopsis.series.showOverview when ProjectContext.format is series. */
    showOverview: string
  }
  characters: Array<Pick<ProjectState['storyBible']['characters'][number], 'id' | 'name' | 'role' | 'wound' | 'want' | 'need' | 'arc'>>
  beats: Array<Pick<ProjectState['outline']['beats'][number], 'id' | 'name' | 'description' | 'notes' | 'linkedSceneIds'>>
  treatment: {
    logline: string
    concept: TreatmentDocumentContent['concept']
    mainCharacters: TreatmentDocumentContent['mainCharacters']
    prose: TreatmentDocumentContent['prose']
    visualAndTonal: TreatmentDocumentContent['visualAndTonal']
    openQuestions: TreatmentDocumentContent['openQuestions']
  }
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
  facts?: ScriptFactsContext
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

export interface ScriptFactContextEntry {
  label: string
  count: number
}

export interface ScriptFactsContext {
  rebuiltAt: string
  characters: ScriptFactContextEntry[]
  locations: ScriptFactContextEntry[]
  times: ScriptFactContextEntry[]
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

export type ActiveTab = 'script' | 'synopsis' | 'outline' | 'treatment' | 'story-bible'

const ZOE_SECTIONS = new Set(['world', 'rules'])
const STORY_BIBLE_CASEY_INTENT_RE = /\b(character|protagonist|antagonist|hero|villain|state of mind|psychology|psychological|psyche|mental|emotion|emotional|motivation|motivated|motivate|motivates|motive|want|need|wound|flaw|arc|backstory|trauma|fear|desire|guilt|grief|relationship|theme|thematic|tone|voice)\b/i
const STORY_BIBLE_ZOE_INTENT_RE = /\b(world|worldbuilding|world-building|setting|location|place|city|environment|culture|cultural|society|rules|rule|logic|constraint|constraints|system|systems|technology|mythology|continuity|geography|politics|institution|institutions)\b/i

const WRITING_PARTNER_SPEAKER_LABELS: Record<PersonaId, string> = {
  writingPartner: 'Morgan',
  sam: 'Sam',
  casey: 'Casey',
  oliver: 'Oliver',
  maya: 'Maya',
  zoe: 'Zoe',
  alex: 'Alex',
}

export function formatWritingPartnerSpeaker(personaId: PersonaId): string {
  if (personaId === 'writingPartner') return 'Morgan'
  return `Morgan (@${WRITING_PARTNER_SPEAKER_LABELS[personaId]})`
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

  if (personaId === 'writingPartner') return 'Morgan'
  return `Morgan will ask @${WRITING_PARTNER_SPEAKER_LABELS[personaId]}`
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : []
}

function labeled(entries: Array<[string, string | undefined]>): string {
  return entries
    .map(([label, value]) => {
      const clean = value?.trim()
      return clean ? `${label}: ${clean}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function documentOutlineBeats(state: ProjectState, format: ProjectFormat): ProjectContext['beats'] {
  const content = normalizeOutlineContent(state.documents.outline.content)
  const beats: ProjectContext['beats'] = []
  const spineNotes = labeled([
    ['Who we follow', content.spine.protagonist],
    ['What they want', content.spine.externalGoal],
    ['What they need', content.spine.internalNeed],
    ['What pushes back', content.spine.centralOpposition],
    ['What failure costs', content.spine.coreStakes],
    ['Theme / question', content.spine.theme],
    ['Ending', content.spine.ending],
  ])

  if (spineNotes) {
    beats.push({
      id: 'outline-spine',
      name: 'Story spine',
      description: 'Core story pressure and destination',
      notes: spineNotes,
      linkedSceneIds: [],
    })
  }

  for (const unit of [...content.units].sort((a, b) => a.number - b.number)) {
    const notes = labeled([
      ['What happens', unit.whatHappens],
      ['Conflict', unit.conflict],
      ['Turn / change', unit.turn],
      ['Consequence', unit.consequence],
      ['Why next', unit.whyNext],
      ['Notes', unit.draftNotes],
    ])
    if (!notes) continue
    beats.push({
      id: text(unit.id),
      name: text(unit.title) || `Outline beat ${unit.number}`,
      description: text(unit.actOrSequence),
      notes,
      linkedSceneIds: Array.isArray(unit.linkedSceneIds) ? unit.linkedSceneIds : [],
    })
  }

  if (format === 'series') {
    const seriesNotes = labeled([
      ['Show pitch', content.seriesEngine.showPitch],
      ['Repeatable conflict', content.seriesEngine.repeatableConflict],
      ['Why it lasts', content.seriesEngine.premiseLongevity],
      ['Long question', content.seriesEngine.serialQuestion],
      ['Typical episode shape', content.seriesEngine.episodeEngine],
      ['World pressure', content.seriesEngine.worldPressure],
      ['Pilot promise', content.seriesEngine.pilotPromise],
    ])
    if (seriesNotes) {
      beats.push({
        id: 'series-engine',
        name: 'Series engine',
        description: 'Repeatable story pressure',
        notes: seriesNotes,
        linkedSceneIds: [],
      })
    }

    const seasonNotes = labeled([
      ['Season question', content.seasonArc.seasonQuestion],
      ['Season pressure system', content.seasonArc.seasonAntagonist],
      ['Season midpoint', content.seasonArc.seasonMidpoint],
      ['Season climax', content.seasonArc.seasonClimax],
      ['Season ending / hook', content.seasonArc.seasonEndingHook],
    ])
    if (seasonNotes) {
      beats.push({
        id: 'season-arc',
        name: 'Season arc',
        description: 'Season-level story movement',
        notes: seasonNotes,
        linkedSceneIds: [],
      })
    }

    for (const episode of content.episodes) {
      const episodeNotes = labeled([
        ['Title', episode.title],
        ['Hook', episode.hookLogline],
        ['A story', episode.aStory],
        ['B/C story', episode.bcStory],
        ['What changes', episode.changeByEnd],
        ['Ending hook', episode.endingHook],
      ])
      if (!episodeNotes) continue
      beats.push({
        id: text(episode.id),
        name: text(episode.label) || `Episode ${episode.number}`,
        description: 'Episode map',
        notes: episodeNotes,
        linkedSceneIds: [],
      })
    }
  }

  return beats
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

function factEntriesForContext(entries: ScriptFactEntry[]): ScriptFactContextEntry[] {
  return entries
    .filter(entry => entry.label.trim() && entry.count > 0)
    .slice(0, SCRIPT_CONTEXT_LIST_LIMIT)
    .map(entry => ({
      label: entry.label,
      count: entry.count,
    }))
}

function scriptFactsForContext(rawHtml: string, facts: ScriptFactsCache): ScriptFactsContext | undefined {
  if (!facts.rebuiltAt || isScriptFactsCacheStale(facts, rawHtml)) return undefined

  return {
    rebuiltAt: facts.rebuiltAt,
    characters: factEntriesForContext(facts.characters),
    locations: factEntriesForContext(facts.locations),
    times: factEntriesForContext(facts.times),
  }
}

export function extractScriptContext(
  rawHtml: string,
  userMessage = '',
  focus?: ScriptFocusState,
  facts?: ScriptFactsCache,
): ScriptContext {
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
    facts: facts ? scriptFactsForContext(rawHtml, facts) : undefined,
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
    case 'treatment': return 'alex'
    case 'story-bible':
      return getStoryBiblePersona(storyBibleSection, userMessage)
  }
}

export function buildProjectContext(state: ProjectState, userMessage = '', options: ProjectContextOptions = {}): ProjectContext {
  const synopsisSections = state.synopsis.sections
  const synopsisContent = state.documents.synopsis.content
  const storyBible = state.storyBible
  const world = storyBible.world
  const treatmentContent = state.documents.treatment.content
  const scriptRawHtml = options.script?.rawHtml ?? state.script.rawHtml
  const scriptScenes = options.script?.scenes ?? state.script.scenes
  const projectFormat = normalizeProjectFormat(state.meta.format)
  const activeSeries = projectFormat === 'series' && synopsisContent.series
    ? {
      seriesType: synopsisContent.series.seriesType,
      episodeLength: synopsisContent.series.episodeLength,
      showOverview: text(synopsisContent.series.showOverview),
      pilot: {
        logline: text(synopsisContent.series.pilot.logline),
        prose: text(synopsisContent.series.pilot.prose),
      },
      seasonOneArc: text(synopsisContent.series.seasonOneArc),
      futureSeasons: synopsisContent.series.futureSeasons.map(season => ({
        id: text(season.id),
        label: text(season.label),
        summary: text(season.summary),
      })),
      characters: synopsisContent.series.characters.map(character => ({
        id: text(character.id),
        name: text(character.name),
        role: text(character.role),
        bio: text(character.bio),
        arcPerSeason: textArray(character.arcPerSeason),
      })),
      compsAndWhyThisShowNow: text(synopsisContent.series.compsAndWhyThisShowNow),
    }
    : undefined
  const synopsisLogline = text(synopsisContent.logline.text) || text(state.synopsis.logline)

  return {
    title: getProjectContextTitle(state.meta.title),
    genre: text(state.meta.genre),
    format: projectFormat,
    logline: synopsisLogline,
    script: extractScriptContext(text(scriptRawHtml), userMessage, options.script?.focus, state.script.facts),
    synopsis: {
      logline: synopsisLogline,
      loglineParts: {
        text: text(synopsisContent.logline.text),
        protagonist: text(synopsisContent.logline.protagonist),
        goal: text(synopsisContent.logline.goal),
        obstacle: text(synopsisContent.logline.obstacle),
        stakes: text(synopsisContent.logline.stakes),
        hook: text(synopsisContent.logline.hook),
      },
      prose: {
        opening: text(synopsisContent.prose.opening),
        escalation: text(synopsisContent.prose.escalation),
        middle: text(synopsisContent.prose.middle),
        climax: text(synopsisContent.prose.climax),
        resolution: text(synopsisContent.prose.resolution),
      },
      qa: {
        protagonistNamedEarly: Boolean(synopsisContent.qa.protagonistNamedEarly),
        goalClear: Boolean(synopsisContent.qa.goalClear),
        obstacleClear: Boolean(synopsisContent.qa.obstacleClear),
        stakesClear: Boolean(synopsisContent.qa.stakesClear),
        endingRevealed: Boolean(synopsisContent.qa.endingRevealed),
        paragraphsConnectCausally: Boolean(synopsisContent.qa.paragraphsConnectCausally),
        toneMatchesProject: Boolean(synopsisContent.qa.toneMatchesProject),
        noUnnecessarySubplot: Boolean(synopsisContent.qa.noUnnecessarySubplot),
      },
      series: activeSeries,
      sections: {
        setup: text(synopsisSections.setup),
        act1Break: text(synopsisSections.act1Break),
        midpoint: text(synopsisSections.midpoint),
        act2Break: text(synopsisSections.act2Break),
        resolution: text(synopsisSections.resolution),
      },
      format: projectFormat,
      showOverview: activeSeries ? text(activeSeries.showOverview) : '',
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
    beats: documentOutlineBeats(state, projectFormat),
    treatment: {
      logline: text(treatmentContent.logline),
      concept: {
        premise: text(treatmentContent.concept.premise),
        tone: text(treatmentContent.concept.tone),
        theme: text(treatmentContent.concept.theme),
        emotionalPromise: text(treatmentContent.concept.emotionalPromise),
      },
      mainCharacters: treatmentContent.mainCharacters.map(character => ({
        id: text(character.id),
        name: text(character.name),
        role: text(character.role),
        externalWant: text(character.externalWant),
        internalNeed: text(character.internalNeed),
        flawOrWound: text(character.flawOrWound),
        secretOrContradiction: text(character.secretOrContradiction),
        arc: text(character.arc),
        relationshipPressure: text(character.relationshipPressure),
      })),
      prose: {
        opening: text(treatmentContent.prose.opening),
        actOne: text(treatmentContent.prose.actOne),
        actTwo: text(treatmentContent.prose.actTwo),
        actThree: text(treatmentContent.prose.actThree),
        customSections: treatmentContent.prose.customSections.map(section => ({
          id: text(section.id),
          heading: text(section.heading),
          body: text(section.body),
        })),
      },
      visualAndTonal: {
        overallTone: text(treatmentContent.visualAndTonal.overallTone),
        visualWorld: text(treatmentContent.visualAndTonal.visualWorld),
        recurringImagesOrMotifs: text(treatmentContent.visualAndTonal.recurringImagesOrMotifs),
        musicOrSoundFeeling: text(treatmentContent.visualAndTonal.musicOrSoundFeeling),
        pacing: text(treatmentContent.visualAndTonal.pacing),
        genreRules: text(treatmentContent.visualAndTonal.genreRules),
        compsAndReferences: text(treatmentContent.visualAndTonal.compsAndReferences),
      },
      openQuestions: {
        story: textArray(treatmentContent.openQuestions.story),
        character: textArray(treatmentContent.openQuestions.character),
        worldOrMythology: textArray(treatmentContent.openQuestions.worldOrMythology),
        production: textArray(treatmentContent.openQuestions.production),
      },
    },
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
