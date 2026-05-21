import type { Beat, Character, ProjectState } from './projectState'
import {
  createEmptyDocuments,
  createEmptyOutlineContent,
  createEmptyStoryBibleContent,
  createEmptySynopsisContent,
  createEmptyTreatmentContent,
  DOCUMENT_SCHEMA_VERSION,
  type AuthoredDocumentState,
  type OutlineDocumentContent,
  type ProjectDocuments,
  type StoryBibleDocumentContent,
  type SynopsisDocumentContent,
  type TreatmentDocumentContent,
} from '@shared/documents'
import type { ProjectFormat } from '@shared/projectFormat'
import { createOutlineUnit } from './outlineDeck'

type NowFn = () => string

const LEGACY_BEAT_TEMPLATES: Omit<Beat, 'notes' | 'linkedSceneIds'>[] = [
  { id: 'opening-image', name: 'Opening Image', description: 'A single scene that captures the "before" state of your story — tone, mood, world.' },
  { id: 'theme-stated', name: 'Theme Stated', description: "Someone (often not the hero) states what the story is really about. The hero doesn't get it yet." },
  { id: 'set-up', name: 'Set-Up', description: "Introduce the hero in their world. Establish what needs fixing — their flaw, their need." },
  { id: 'catalyst', name: 'Catalyst', description: "The inciting incident. Something happens that disrupts the hero's world. No going back." },
  { id: 'debate', name: 'Debate', description: 'The hero hesitates. Should they take the leap? Internal or external conflict about crossing the threshold.' },
  { id: 'break-into-two', name: 'Break into Two', description: 'The hero makes a choice and enters Act Two. The new world begins. Thesis vs. antithesis.' },
  { id: 'b-story', name: 'B Story', description: 'A new character or relationship is introduced. Often the love story; always carries the theme.' },
  { id: 'fun-and-games', name: 'Fun and Games', description: 'The promise of the premise. What the audience came to see. The hero tests the new world.' },
  { id: 'midpoint', name: 'Midpoint', description: 'A false victory or false defeat. Stakes are raised. Hero commits fully — no more playing around.' },
  { id: 'bad-guys-close', name: 'Bad Guys Close In', description: 'Internal and external forces push back against the hero. Team starts to fall apart.' },
  { id: 'all-is-lost', name: 'All Is Lost', description: "The opposite of the Midpoint. The hero's lowest point. Often a death — literal or symbolic." },
  { id: 'dark-night', name: 'Dark Night of the Soul', description: 'The hero wallows. Where did I go wrong? The darkest moment before the dawn.' },
  { id: 'break-into-three', name: 'Break into Three', description: 'The solution. Hero synthesizes A Story and B Story lessons to find the answer.' },
  { id: 'finale', name: 'Finale', description: 'Hero executes the plan, defeats antagonist, changes the world. The thesis wins.' },
  { id: 'final-image', name: 'Final Image', description: 'Mirror of the Opening Image. Prove the world has changed — and so has the hero.' },
]

const LEGACY_TO_FEATURE_UNIT: Record<string, string> = {
  'opening-image': 'feature.openingNormalWorld',
  'set-up': 'feature.openingNormalWorld',
  catalyst: 'feature.incitingIncident',
  debate: 'feature.actOneBreak',
  'break-into-two': 'feature.actOneBreak',
  'fun-and-games': 'feature.actTwoA',
  'bad-guys-close': 'feature.actTwoA',
  midpoint: 'feature.midpoint',
  'b-story': 'feature.allIsLostWithSubplot',
  'all-is-lost': 'feature.allIsLostWithSubplot',
  'dark-night': 'feature.climax',
  'break-into-three': 'feature.climax',
  finale: 'feature.climax',
  'final-image': 'feature.finalImage',
}

function joinNotes(values: string[]): string {
  return values.map(value => value.trim()).filter(Boolean).join('\n\n---\n\n')
}

function unitText(content: OutlineDocumentContent, unitId: string): string {
  const unit = content.units.find(item => item.id === unitId)
  return unit?.whatHappens.trim() || unit?.draftNotes.trim() || ''
}

function legacyUnitText(content: OutlineDocumentContent, legacyBeatId: string): string {
  const unit = content.units.find(item => item.id === legacyBeatId)
  return unit?.draftNotes.trim() || unit?.whatHappens.trim() || ''
}

function labeledText(entries: Array<[string, string | undefined]>): string {
  return entries
    .map(([label, value]) => {
      const text = value?.trim()
      return text ? `${label}: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function episodeSummary(content: OutlineDocumentContent): string {
  return content.episodes
    .map(episode => {
      const details = [episode.hookLogline, episode.aStory, episode.bcStory, episode.changeByEnd, episode.endingHook]
        .map(value => value.trim())
        .filter(Boolean)
        .join(' / ')
      return details ? `${episode.label}: ${details}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function seriesNotesByLegacyId(content: OutlineDocumentContent): Record<string, string> {
  const series = content.seriesEngine
  const season = content.seasonArc
  const spine = content.spine
  const episodes = episodeSummary(content)

  return {
    'opening-image': labeledText([
      ['Show pitch', series.showPitch],
      ['World pressure', series.worldPressure],
    ]),
    'theme-stated': labeledText([
      ['Theme', spine.theme],
      ['Long question', series.serialQuestion],
      ['Season question', season.seasonQuestion],
    ]),
    'set-up': labeledText([
      ['Who we follow', spine.protagonist],
      ['What they want', spine.externalGoal],
      ['What they need', spine.internalNeed],
      ['What failure costs', spine.coreStakes],
    ]),
    catalyst: labeledText([
      ['Pilot promise', series.pilotPromise],
    ]),
    debate: labeledText([
      ['Why the premise lasts', series.premiseLongevity],
    ]),
    'break-into-two': labeledText([
      ['Pilot promise', series.pilotPromise],
      ['Repeatable conflict', series.repeatableConflict],
    ]),
    'b-story': labeledText([
      ['Central opposition', spine.centralOpposition],
    ]),
    'fun-and-games': labeledText([
      ['Repeatable conflict', series.repeatableConflict],
      ['Typical episode shape', series.episodeEngine],
      ['Episode map', episodes],
    ]),
    midpoint: labeledText([
      ['Season midpoint', season.seasonMidpoint],
    ]),
    'bad-guys-close': labeledText([
      ['Season pressure system', season.seasonAntagonist],
    ]),
    'all-is-lost': labeledText([
      ['Season climax', season.seasonClimax],
    ]),
    'dark-night': labeledText([
      ['Season question', season.seasonQuestion],
    ]),
    'break-into-three': labeledText([
      ['Season ending / hook', season.seasonEndingHook],
    ]),
    finale: labeledText([
      ['Season climax', season.seasonClimax],
      ['Season ending / hook', season.seasonEndingHook],
    ]),
    'final-image': labeledText([
      ['Series north star', spine.ending],
      ['Season ending / hook', season.seasonEndingHook],
    ]),
  }
}

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
  return mergeOutlineLegacyIntoContent(createEmptyOutlineContent(), legacy)
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

function preferLegacy(legacyValue: string, existingValue: string): string {
  return legacyValue.trim() ? legacyValue : existingValue
}

export function storyBibleLegacyToContent(legacy: ProjectState['storyBible']): StoryBibleDocumentContent {
  const content = createEmptyStoryBibleContent()
  content.premiseAndWorld.premise = legacy.world.setting
  content.premiseAndWorld.worldRules = legacy.rules
  content.toneAndStyle.comps = splitList(legacy.world.toneAnchors)
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

export function mergeStoryBibleLegacyIntoContent(
  existing: StoryBibleDocumentContent,
  legacy: ProjectState['storyBible'],
): StoryBibleDocumentContent {
  const legacyContent = storyBibleLegacyToContent(legacy)
  const existingCharactersById = new Map(existing.characters.map(character => [character.id, character]))
  const migratedCharacters = legacyContent.characters.map(character => {
    const existingCharacter = existingCharactersById.get(character.id)
    if (!existingCharacter) return character

    return {
      ...existingCharacter,
      name: preferLegacy(character.name, existingCharacter.name),
      role: preferLegacy(character.role, existingCharacter.role),
      want: preferLegacy(character.want, existingCharacter.want),
      need: preferLegacy(character.need, existingCharacter.need),
      flaw: preferLegacy(character.flaw, existingCharacter.flaw),
      arc: preferLegacy(character.arc, existingCharacter.arc),
    }
  })
  const migratedIds = new Set(migratedCharacters.map(character => character.id))
  const preservedDocumentOnlyCharacters = existing.characters.filter(character => !migratedIds.has(character.id))

  return {
    ...existing,
    onePagePitch: {
      ...existing.onePagePitch,
      whyThisMatters: preferLegacy(
        legacyContent.onePagePitch.whyThisMatters,
        existing.onePagePitch.whyThisMatters,
      ),
    },
    toneAndStyle: {
      ...existing.toneAndStyle,
      comps: legacyContent.toneAndStyle.comps.length > 0
        ? legacyContent.toneAndStyle.comps
        : existing.toneAndStyle.comps,
      dialogueStyle: preferLegacy(
        legacyContent.toneAndStyle.dialogueStyle,
        existing.toneAndStyle.dialogueStyle,
      ),
    },
    premiseAndWorld: {
      ...existing.premiseAndWorld,
      premise: preferLegacy(
        legacyContent.premiseAndWorld.premise,
        existing.premiseAndWorld.premise,
      ),
      worldRules: preferLegacy(
        legacyContent.premiseAndWorld.worldRules,
        existing.premiseAndWorld.worldRules,
      ),
    },
    characters: [...migratedCharacters, ...preservedDocumentOnlyCharacters],
  }
}

export function normalizeOutlineContent(existing: Partial<OutlineDocumentContent> | undefined): OutlineDocumentContent {
  const defaults = createEmptyOutlineContent()
  if (!existing) return defaults

  return {
    ...defaults,
    ...existing,
    spine: {
      ...defaults.spine,
      ...(existing.spine ?? {}),
    },
    seriesEngine: {
      ...defaults.seriesEngine,
      ...(existing.seriesEngine ?? {}),
    },
    seasonArc: {
      ...defaults.seasonArc,
      ...(existing.seasonArc ?? {}),
    },
    units: Array.isArray(existing.units) ? existing.units : defaults.units,
    episodes: Array.isArray(existing.episodes) ? existing.episodes : defaults.episodes,
    aiProductionColumns: {
      ...defaults.aiProductionColumns,
      ...(existing.aiProductionColumns ?? {}),
    },
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function valuesHaveText(values: unknown[]): boolean {
  return values.some(value => {
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return valuesHaveText(value)
    if (value && typeof value === 'object') return valuesHaveText(Object.values(value))
    return false
  })
}

export function normalizeTreatmentContent(
  existing: Partial<TreatmentDocumentContent> | undefined,
): TreatmentDocumentContent {
  const defaults = createEmptyTreatmentContent()
  if (!existing) return defaults

  return {
    ...defaults,
    ...existing,
    header: {
      ...defaults.header,
      ...(existing.header ?? {}),
    },
    concept: {
      ...defaults.concept,
      ...(existing.concept ?? {}),
    },
    mainCharacters: Array.isArray(existing.mainCharacters)
      ? existing.mainCharacters.map(character => ({
          id: typeof character.id === 'string' ? character.id : crypto.randomUUID(),
          name: typeof character.name === 'string' ? character.name : '',
          role: typeof character.role === 'string' ? character.role : '',
          externalWant: typeof character.externalWant === 'string' ? character.externalWant : '',
          internalNeed: typeof character.internalNeed === 'string' ? character.internalNeed : '',
          flawOrWound: typeof character.flawOrWound === 'string' ? character.flawOrWound : '',
          secretOrContradiction: typeof character.secretOrContradiction === 'string' ? character.secretOrContradiction : '',
          arc: typeof character.arc === 'string' ? character.arc : '',
          relationshipPressure: typeof character.relationshipPressure === 'string' ? character.relationshipPressure : '',
        }))
      : defaults.mainCharacters,
    prose: {
      ...defaults.prose,
      ...(existing.prose ?? {}),
      customSections: Array.isArray(existing.prose?.customSections)
        ? existing.prose.customSections.map(section => ({
            id: typeof section.id === 'string' ? section.id : crypto.randomUUID(),
            heading: typeof section.heading === 'string' ? section.heading : '',
            body: typeof section.body === 'string' ? section.body : '',
          }))
        : defaults.prose.customSections,
    },
    visualAndTonal: {
      ...defaults.visualAndTonal,
      ...(existing.visualAndTonal ?? {}),
    },
    openQuestions: {
      ...defaults.openQuestions,
      ...(existing.openQuestions ?? {}),
      story: Array.isArray(existing.openQuestions?.story) ? existing.openQuestions.story : defaults.openQuestions.story,
      character: Array.isArray(existing.openQuestions?.character) ? existing.openQuestions.character : defaults.openQuestions.character,
      worldOrMythology: Array.isArray(existing.openQuestions?.worldOrMythology)
        ? existing.openQuestions.worldOrMythology
        : defaults.openQuestions.worldOrMythology,
      production: Array.isArray(existing.openQuestions?.production)
        ? existing.openQuestions.production
        : defaults.openQuestions.production,
    },
    aiProductionImplications: existing.aiProductionImplications,
  }
}

export function isTreatmentContentEmpty(content: TreatmentDocumentContent): boolean {
  return !valuesHaveText([
    content.logline,
    content.concept,
    content.mainCharacters,
    content.prose,
    content.visualAndTonal,
    content.openQuestions,
    content.aiProductionImplications,
  ])
}

function treatmentSection(id: string, heading: string, body: string) {
  return isFilled(body) ? { id, heading, body } : null
}

export function outlineContentToTreatmentContent(
  outline: OutlineDocumentContent,
  format: ProjectFormat,
): TreatmentDocumentContent {
  const content = normalizeOutlineContent(outline)
  const treatment = createEmptyTreatmentContent()
  const spine = content.spine
  const series = content.seriesEngine
  const season = content.seasonArc
  const opening = unitText(content, 'feature.openingNormalWorld')
  const inciting = unitText(content, 'feature.incitingIncident')
  const commitment = unitText(content, 'feature.actOneBreak')
  const actTwoA = unitText(content, 'feature.actTwoA')
  const midpoint = unitText(content, 'feature.midpoint')
  const collapse = unitText(content, 'feature.allIsLostWithSubplot')
  const climax = unitText(content, 'feature.climax')
  const finalImage = unitText(content, 'feature.finalImage')

  treatment.concept = {
    ...treatment.concept,
    premise: labeledText([
      ['Who we follow', spine.protagonist],
      ['What they want', spine.externalGoal],
      ['What pushes back', spine.centralOpposition],
      ['What failure costs', spine.coreStakes],
      ...(format === 'series'
        ? [
            ['Show pitch', series.showPitch] as [string, string | undefined],
            ['Repeatable conflict', series.repeatableConflict] as [string, string | undefined],
            ['World pressure', series.worldPressure] as [string, string | undefined],
          ]
        : []),
    ]),
    theme: spine.theme,
    emotionalPromise: labeledText([
      ['What they need', spine.internalNeed],
      ['Ending', spine.ending],
    ]),
  }

  if (isFilled(spine.protagonist)) {
    treatment.mainCharacters = [{
      id: 'outline-protagonist',
      name: spine.protagonist,
      role: 'Protagonist',
      externalWant: spine.externalGoal,
      internalNeed: spine.internalNeed,
      flawOrWound: '',
      secretOrContradiction: '',
      arc: '',
      relationshipPressure: spine.centralOpposition,
    }]
  }

  treatment.prose = {
    ...treatment.prose,
    opening: joinNotes([opening, inciting]),
    actOne: commitment,
    actTwo: joinNotes([actTwoA, midpoint, collapse]),
    actThree: joinNotes([climax, finalImage, spine.ending]),
    customSections: [
      treatmentSection('outline-series-engine', 'Series engine', labeledText([
        ['Show pitch', series.showPitch],
        ['Repeatable conflict', series.repeatableConflict],
        ['Why it lasts', series.premiseLongevity],
        ['Typical episode shape', series.episodeEngine],
        ['Long question', series.serialQuestion],
        ['Pilot promise', series.pilotPromise],
      ])),
      treatmentSection('outline-season-arc', 'Season arc', labeledText([
        ['Season question', season.seasonQuestion],
        ['Pressure system', season.seasonAntagonist],
        ['Midpoint', season.seasonMidpoint],
        ['Climax', season.seasonClimax],
        ['Ending / hook', season.seasonEndingHook],
      ])),
      treatmentSection('outline-episode-map', 'Episode map', episodeSummary(content)),
    ].filter((section): section is NonNullable<typeof section> => section !== null),
  }

  treatment.visualAndTonal = {
    ...treatment.visualAndTonal,
    visualWorld: series.worldPressure,
  }

  return treatment
}

export function mergeOutlineLegacyIntoContent(
  existing: OutlineDocumentContent,
  legacy: ProjectState['outline'],
): OutlineDocumentContent {
  const content = normalizeOutlineContent(existing)
  const legacyById = new Map(legacy.beats.map(beat => [beat.id, beat]))
  const unitsById = new Map(content.units.map(unit => [unit.id, unit]))

  for (const unitId of new Set(Object.values(LEGACY_TO_FEATURE_UNIT))) {
    if (!unitsById.has(unitId)) {
      const unit = createOutlineUnit(unitId)
      unitsById.set(unitId, unit)
    }
  }

  for (const [legacyId, featureUnitId] of Object.entries(LEGACY_TO_FEATURE_UNIT)) {
    const legacyBeat = legacyById.get(legacyId)
    if (!legacyBeat?.notes.trim()) continue

    const unit = unitsById.get(featureUnitId) ?? createOutlineUnit(featureUnitId)
    const linkedSceneIds = Array.from(new Set([...unit.linkedSceneIds, ...legacyBeat.linkedSceneIds]))
    unitsById.set(featureUnitId, {
      ...unit,
      linkedSceneIds,
      whatHappens: unit.whatHappens.trim()
        ? unit.whatHappens
        : joinNotes([
            unit.whatHappens,
            ...legacy.beats
              .filter(beat => LEGACY_TO_FEATURE_UNIT[beat.id] === featureUnitId)
              .map(beat => beat.notes),
          ]),
    })
  }

  const themeBeat = legacyById.get('theme-stated')

  return {
    ...content,
    spine: {
      ...content.spine,
      theme: preferLegacy(themeBeat?.notes ?? '', content.spine.theme),
    },
    units: Array.from(unitsById.values()).sort((a, b) => a.number - b.number),
  }
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

export function mirrorSynopsisFromLegacy(
  existingDoc: AuthoredDocumentState<SynopsisDocumentContent>,
  legacy: ProjectState['synopsis'],
  now: NowFn = () => new Date().toISOString(),
): AuthoredDocumentState<SynopsisDocumentContent> {
  return {
    ...existingDoc,
    updatedAt: now(),
    content: {
      ...existingDoc.content,
      logline: {
        ...existingDoc.content.logline,
        text: legacy.logline,
      },
      prose: {
        opening: legacy.sections.setup,
        escalation: legacy.sections.act1Break,
        middle: legacy.sections.midpoint,
        climax: legacy.sections.act2Break,
        resolution: legacy.sections.resolution,
      },
    },
  }
}

export function createDocumentsForNewProject(now: NowFn = () => new Date().toISOString()): ProjectDocuments {
  return createEmptyDocuments(now)
}

export interface LegacyProjectSlice {
  synopsis: ProjectState['synopsis']
  outline: ProjectState['outline']
  storyBible: ProjectState['storyBible']
}

export function documentsToLegacy(
  docs: ProjectDocuments,
  options: { outlineFormat?: ProjectFormat } = {},
): LegacyProjectSlice {
  const synopsis: ProjectState['synopsis'] = {
    logline: docs.synopsis.content.logline.text,
    sections: {
      setup: docs.synopsis.content.prose.opening,
      act1Break: docs.synopsis.content.prose.escalation,
      midpoint: docs.synopsis.content.prose.middle,
      act2Break: docs.synopsis.content.prose.climax,
      resolution: docs.synopsis.content.prose.resolution,
    },
  }

  const content = normalizeOutlineContent(docs.outline.content)
  const featureNotesByLegacyId: Record<string, string> = {
    'opening-image': unitText(content, 'feature.openingNormalWorld') || legacyUnitText(content, 'opening-image'),
    'theme-stated': content.spine.theme || legacyUnitText(content, 'theme-stated'),
    'set-up': unitText(content, 'feature.openingNormalWorld') || legacyUnitText(content, 'set-up'),
    catalyst: unitText(content, 'feature.incitingIncident') || legacyUnitText(content, 'catalyst'),
    debate: unitText(content, 'feature.actOneBreak') || legacyUnitText(content, 'debate'),
    'break-into-two': unitText(content, 'feature.actOneBreak') || legacyUnitText(content, 'break-into-two'),
    'b-story': unitText(content, 'feature.allIsLostWithSubplot') || legacyUnitText(content, 'b-story'),
    'fun-and-games': unitText(content, 'feature.actTwoA') || legacyUnitText(content, 'fun-and-games'),
    midpoint: unitText(content, 'feature.midpoint') || legacyUnitText(content, 'midpoint'),
    'bad-guys-close': unitText(content, 'feature.actTwoA') || legacyUnitText(content, 'bad-guys-close'),
    'all-is-lost': unitText(content, 'feature.allIsLostWithSubplot') || legacyUnitText(content, 'all-is-lost'),
    'dark-night': unitText(content, 'feature.climax') || legacyUnitText(content, 'dark-night'),
    'break-into-three': unitText(content, 'feature.climax') || legacyUnitText(content, 'break-into-three'),
    finale: unitText(content, 'feature.climax') || legacyUnitText(content, 'finale'),
    'final-image': unitText(content, 'feature.finalImage') || legacyUnitText(content, 'final-image'),
  }
  const seriesNotes = seriesNotesByLegacyId(content)
  const notesByLegacyId = options.outlineFormat === 'series'
    ? Object.fromEntries(
        LEGACY_BEAT_TEMPLATES.map(template => [
          template.id,
          seriesNotes[template.id] || featureNotesByLegacyId[template.id] || '',
        ]),
      )
    : featureNotesByLegacyId
  const linkedScenesByLegacyId = new Map(content.units.map(unit => [unit.id, unit.linkedSceneIds]))
  const beats: Beat[] = LEGACY_BEAT_TEMPLATES.map(template => {
    const featureUnitId = LEGACY_TO_FEATURE_UNIT[template.id]
    const linkedSceneIds = featureUnitId
      ? linkedScenesByLegacyId.get(featureUnitId) ?? []
      : linkedScenesByLegacyId.get(template.id) ?? []

    return {
      ...template,
      notes: notesByLegacyId[template.id] ?? '',
      linkedSceneIds: [...linkedSceneIds],
    }
  })
  const outline: ProjectState['outline'] = {
    beatType: 'save-the-cat',
    beats,
  }

  const characters: Character[] = docs.storyBible.content.characters.map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    wound: c.flaw,
    want: c.want,
    need: c.need,
    arc: c.arc,
  }))
  const storyBible: ProjectState['storyBible'] = {
    characters,
    world: {
      setting: docs.storyBible.content.premiseAndWorld.premise,
      toneAnchors: docs.storyBible.content.toneAndStyle.comps.join(', '),
      voiceNotes: docs.storyBible.content.toneAndStyle.dialogueStyle,
    },
    themes: docs.storyBible.content.onePagePitch.whyThisMatters,
    rules: docs.storyBible.content.premiseAndWorld.worldRules,
  }

  return { synopsis, outline, storyBible }
}
