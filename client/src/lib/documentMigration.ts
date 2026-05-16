import type { ProjectState } from './projectState'
import {
  createEmptyDocuments,
  createEmptyOutlineContent,
  createEmptyStoryBibleContent,
  createEmptySynopsisContent,
  createEmptyTreatmentContent,
  DOCUMENT_SCHEMA_VERSION,
  type OutlineDocumentContent,
  type ProjectDocuments,
  type StoryBibleDocumentContent,
  type SynopsisDocumentContent,
  type TreatmentDocumentContent,
} from '@shared/documents'

type NowFn = () => string

function synopsisLegacyToContent(legacy: ProjectState['synopsis']): SynopsisDocumentContent {
  const content = createEmptySynopsisContent()
  content.logline.text = legacy.logline
  content.prose = {
    opening: legacy.sections.setup,
    escalation: legacy.sections.act1Break,
    middle: legacy.sections.midpoint,
    climax: legacy.sections.act2Break,
    resolution: legacy.sections.resolution,
  }
  return content
}

function outlineLegacyToContent(legacy: ProjectState['outline']): OutlineDocumentContent {
  const content = createEmptyOutlineContent()
  content.mode = 'beat_sheet_save_the_cat'
  content.units = legacy.beats.map((beat, index) => ({
    id: beat.id,
    number: index + 1,
    actOrSequence: '',
    title: beat.name,
    location: '',
    characters: [],
    whatHappens: beat.description,
    conflict: '',
    turn: '',
    consequence: '',
    whyNext: '',
    linkedSceneIds: [...beat.linkedSceneIds],
    draftNotes: beat.notes,
  }))
  return content
}

function storyBibleLegacyToContent(legacy: ProjectState['storyBible']): StoryBibleDocumentContent {
  const content = createEmptyStoryBibleContent()
  content.premiseAndWorld.premise = legacy.world.setting
  content.premiseAndWorld.worldRules = legacy.rules
  content.toneAndStyle.comps = legacy.world.toneAnchors ? [legacy.world.toneAnchors] : []
  content.toneAndStyle.dialogueStyle = legacy.world.voiceNotes
  content.onePagePitch.whyThisMatters = legacy.themes
  content.characters = legacy.characters.map(char => ({
    id: char.id,
    name: char.name,
    role: char.role,
    want: char.want,
    need: char.need,
    flaw: char.wound,
    secret: '',
    contradiction: '',
    arc: char.arc,
    relationshipPressure: '',
    behavioralAnchors: '',
    speechPatterns: '',
    neverWriteThemAs: '',
    continuityFacts: '',
  }))
  return content
}

function treatmentLegacyToContent(): TreatmentDocumentContent {
  return createEmptyTreatmentContent()
}

export function legacyToDocuments(state: ProjectState, now: NowFn = () => new Date().toISOString()): ProjectDocuments {
  const ts = now()

  return {
    synopsis: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'prose',
      updatedAt: ts,
      content: synopsisLegacyToContent(state.synopsis),
    },
    outline: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'beat_sheet_save_the_cat',
      updatedAt: ts,
      content: outlineLegacyToContent(state.outline),
    },
    treatment: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'three_act_prose',
      updatedAt: ts,
      content: treatmentLegacyToContent(),
    },
    storyBible: {
      version: DOCUMENT_SCHEMA_VERSION,
      mode: 'development',
      updatedAt: ts,
      content: storyBibleLegacyToContent(state.storyBible),
    },
  }
}

export function createDocumentsForNewProject(now: NowFn = () => new Date().toISOString()): ProjectDocuments {
  return createEmptyDocuments(now)
}
