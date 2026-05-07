export type EntryState =
  | 'blank_slate'
  | 'idea_only'
  | 'outline_complete'
  | 'pages_written_stuck'
  | 'draft_complete_lost'
  | 'revision_mode'

export type FeedbackStyle = 'direct' | 'gentle' | 'detailed'

export interface AssessmentProfile {
  entryState: EntryState
  existingWork: string[]
  immediateNeed: string
  feedbackStyle: FeedbackStyle
  writerName: string
  toolCalibration?: Record<string, unknown>
}

export interface Character {
  id: string
  name: string
  role: string
  backstory?: string
  motivation?: string
  arc?: string
}

export interface StoryBeat {
  id: string
  act: number
  description: string
  purpose?: string
}

export interface ScriptScene {
  id: string
  heading: string
  index: number
}

export interface StoryMemory {
  project: {
    title?: string
    genre?: string
    format?: 'screenplay' | 'novel' | 'series' | 'short'
    logline?: string
    synopsis?: string
    synopsisSections?: Record<string, string>
    themes?: string
  }
  script?: {
    excerpt?: string
    sceneHeadings?: string[]
    dialogueSnippets?: string[]
    actionSnippets?: string[]
    characterNames?: string[]
    excerptWordCount?: number
    excerptWordLimit?: number
    excerptTruncated?: boolean
    totalWordCount?: number
    estimatedPageCount?: number
    sceneCount?: number
    contextReason?: string
    contextLabel?: string
    pageRange?: { start: number; end: number }
    selectedText?: string
  }
  characters: Record<string, Character>
  outline: {
    acts: number
    beats: StoryBeat[]
    scenes?: ScriptScene[]
  }
  worldRules: {
    setting?: string
    toneAnchors?: string
    rules?: string
    magicSystem?: string
    technology?: string
  }
  dialogue: {
    samples?: string[]
    characterVoices?: Record<string, string>
    voiceNotes?: string
  }
  userProfile: AssessmentProfile
  decisions: Array<{
    what: string
    why: string
    when: string
  }>
}

export type { Persona } from './personas'
