import type { OutlineDocumentContent, OutlineEpisode, OutlineUnit } from '@shared/documents'

export type OutlineDeckFormat = 'feature' | 'series'

export type OutlineDeckSection =
  | 'spine'
  | 'beginning'
  | 'middle'
  | 'end'
  | 'showDNA'
  | 'world'
  | 'pilot'
  | 'seasonSpine'
  | 'episodeEngine'
  | 'episodeMap'

export interface OutlineCardBinding {
  label: string
  path: string
}

export interface OutlineCardDef {
  id: string
  deck: OutlineDeckFormat
  section: OutlineDeckSection
  sectionLabel: string
  structuralLabel: string
  question: string
  helper: string
  placeholder?: string
  mappingPath: string | OutlineCardBinding[]
}

interface FeatureUnitDef {
  id: string
  number: number
  actOrSequence: string
  title: string
}

const FEATURE_UNITS: FeatureUnitDef[] = [
  { id: 'feature.openingNormalWorld', number: 1, actOrSequence: 'Act I', title: 'Opening / Normal world' },
  { id: 'feature.incitingIncident', number: 2, actOrSequence: 'Act I', title: 'Inciting incident' },
  { id: 'feature.actOneBreak', number: 3, actOrSequence: 'Act I', title: 'Debate / Act One break' },
  { id: 'feature.actTwoA', number: 4, actOrSequence: 'Act II', title: 'Act Two A' },
  { id: 'feature.midpoint', number: 5, actOrSequence: 'Act II', title: 'Midpoint' },
  { id: 'feature.allIsLostWithSubplot', number: 6, actOrSequence: 'Act II', title: 'All-is-lost (with subplot)' },
  { id: 'feature.climax', number: 7, actOrSequence: 'Act III', title: 'New insight + Climax' },
  { id: 'feature.finalImage', number: 8, actOrSequence: 'Act III', title: 'Final image' },
]

const FEATURE_UNIT_BY_ID = new Map(FEATURE_UNITS.map(unit => [unit.id, unit]))

function spineCard(
  deck: OutlineDeckFormat,
  order: number,
  id: string,
  question: string,
  helper: string,
  structuralLabel: string,
  path: string | OutlineCardBinding[],
): OutlineCardDef {
  return {
    id,
    deck,
    section: 'spine',
    sectionLabel: 'Foundations',
    structuralLabel,
    question,
    helper,
    mappingPath: path,
    placeholder: order === 7 ? 'A rough guess is enough.' : undefined,
  }
}

const FEATURE_SPINE: OutlineCardDef[] = [
  spineCard('feature', 1, 'spine.protagonist', 'Who are we following?', 'Name the person or group whose choices drive the story.', 'Protagonist', 'spine.protagonist'),
  spineCard('feature', 2, 'spine.wantNeed', 'What are they chasing, and what do they really need?', 'Keep the visible goal separate from the inner change.', 'Want / need', [
    { label: 'What they want', path: 'spine.externalGoal' },
    { label: 'What they need', path: 'spine.internalNeed' },
  ]),
  spineCard('feature', 3, 'spine.pressure', 'What pushes back, and what does failure cost?', 'Name the pressure and the human stakes.', 'Opposition / stakes', [
    { label: 'What pushes back', path: 'spine.centralOpposition' },
    { label: 'What failure costs', path: 'spine.coreStakes' },
  ]),
  spineCard('feature', 4, 'spine.theme', 'What truth is the story testing?', 'A rough theme, question, or argument is enough.', 'Theme', 'spine.theme'),
  spineCard('feature', 5, 'spine.ending', 'Where does the story end up?', 'Spoil the ending for yourself so the path has a target.', 'Ending', 'spine.ending'),
]

const SERIES_SPINE: OutlineCardDef[] = FEATURE_SPINE.map(card => ({
  ...card,
  deck: 'series' as const,
}))

export const FEATURE_DECK: OutlineCardDef[] = [
  ...FEATURE_SPINE,
  {
    id: 'feature.openingNormalWorld',
    deck: 'feature',
    section: 'beginning',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Opening / Normal world',
    question: 'Where does the story begin?',
    helper: 'The starting situation, and the instability already hiding inside it.',
    mappingPath: [
      { label: 'Starting situation', path: 'units[id=feature.openingNormalWorld].whatHappens' },
      { label: 'Why this cannot stay still', path: 'units[id=feature.openingNormalWorld].whyNext' },
    ],
  },
  {
    id: 'feature.incitingIncident',
    deck: 'feature',
    section: 'beginning',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Inciting incident',
    question: "What disrupts it?",
    helper: 'The event, discovery, or pressure that forces a response.',
    mappingPath: [
      { label: 'Disruption', path: 'units[id=feature.incitingIncident].whatHappens' },
      { label: 'Immediate consequence', path: 'units[id=feature.incitingIncident].consequence' },
    ],
  },
  {
    id: 'feature.actOneBreak',
    deck: 'feature',
    section: 'beginning',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Debate / Act One break',
    question: 'What choice locks the story in?',
    helper: 'The decision or event that makes going back impossible.',
    mappingPath: [
      { label: 'Commitment', path: 'units[id=feature.actOneBreak].whatHappens' },
      { label: 'Why this leads to the next step', path: 'units[id=feature.actOneBreak].whyNext' },
    ],
  },
  {
    id: 'feature.midpoint',
    deck: 'feature',
    section: 'middle',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Midpoint',
    question: 'What changes the direction halfway through?',
    helper: 'A reveal, win, loss, reversal, or point of no return.',
    mappingPath: [
      { label: 'Turn', path: 'units[id=feature.midpoint].whatHappens' },
      { label: 'What changes because of it', path: 'units[id=feature.midpoint].consequence' },
    ],
  },
  {
    id: 'feature.allIsLostWithSubplot',
    deck: 'feature',
    section: 'middle',
    sectionLabel: 'Blueprint',
    structuralLabel: 'All-is-lost (with subplot)',
    question: 'Where does pressure break something important?',
    helper: 'The collapse, loss, or consequence that forces the final move.',
    mappingPath: [
      { label: 'Breaking point', path: 'units[id=feature.allIsLostWithSubplot].whatHappens' },
      { label: 'Why the old approach no longer works', path: 'units[id=feature.allIsLostWithSubplot].consequence' },
    ],
  },
  {
    id: 'feature.climax',
    deck: 'feature',
    section: 'end',
    sectionLabel: 'Blueprint',
    structuralLabel: 'New insight + Climax',
    question: 'What final choice resolves the pressure?',
    helper: 'The decisive action, cost, and final image or new state.',
    mappingPath: [
      { label: 'Final move', path: 'units[id=feature.climax].whatHappens' },
      { label: 'Last image / new state', path: 'units[id=feature.finalImage].whatHappens' },
    ],
  },
]

export const SERIES_DECK: OutlineCardDef[] = [
  ...SERIES_SPINE,
  {
    id: 'series.showPitch',
    deck: 'series',
    section: 'showDNA',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Show pitch',
    question: 'What keeps generating stories?',
    helper: 'The repeatable pressure, weekly shape, and long question.',
    mappingPath: [
      { label: 'Repeatable pressure', path: 'seriesEngine.repeatableConflict' },
      { label: 'Typical episode shape', path: 'seriesEngine.episodeEngine' },
      { label: 'Long question', path: 'seriesEngine.serialQuestion' },
    ],
  },
  {
    id: 'series.seasonQuestion',
    deck: 'series',
    section: 'seasonSpine',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Season question',
    question: 'What question does this season answer?',
    helper: 'A bounded question that can resolve while the show can continue.',
    mappingPath: 'seasonArc.seasonQuestion',
  },
  {
    id: 'series.seasonMidpoint',
    deck: 'series',
    section: 'seasonSpine',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Season midpoint',
    question: 'Where does the season change direction?',
    helper: 'The turn that changes what the season means.',
    mappingPath: 'seasonArc.seasonMidpoint',
  },
  {
    id: 'series.seasonClimax',
    deck: 'series',
    section: 'seasonSpine',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Season climax / hook',
    question: 'What pressure peaks, and what pulls us forward?',
    helper: 'The season climax, resolution, and hook into what comes next.',
    mappingPath: [
      { label: 'Peak pressure', path: 'seasonArc.seasonClimax' },
      { label: 'Ending / hook', path: 'seasonArc.seasonEndingHook' },
    ],
  },
  {
    id: 'series.pilotPromise',
    deck: 'series',
    section: 'pilot',
    sectionLabel: 'Blueprint',
    structuralLabel: 'Pilot promise',
    question: 'What does episode 1 promise?',
    helper: 'The hook that starts the show and the reason to watch episode 2.',
    mappingPath: 'seriesEngine.pilotPromise',
  },
]

export function getOutlineDeck(format: OutlineDeckFormat): OutlineCardDef[] {
  return format === 'series' ? SERIES_DECK : FEATURE_DECK
}

export function createOutlineUnit(id: string): OutlineUnit {
  const def = FEATURE_UNIT_BY_ID.get(id)
  return {
    id,
    number: def?.number ?? 999,
    actOrSequence: def?.actOrSequence ?? '',
    title: def?.title ?? id,
    location: '',
    characters: [],
    whatHappens: '',
    conflict: '',
    turn: '',
    consequence: '',
    whyNext: '',
    linkedSceneIds: [],
    draftNotes: '',
  }
}

function findOrCreateUnit(units: OutlineUnit[], id: string): OutlineUnit[] {
  if (units.some(unit => unit.id === id)) return units
  return [...units, createOutlineUnit(id)].sort((a, b) => a.number - b.number)
}

function parseUnitPath(path: string): { id: string; field: keyof OutlineUnit } | null {
  const match = path.match(/^units\[id=([^\]]+)\]\.([A-Za-z0-9_]+)$/)
  if (!match) return null
  return { id: match[1], field: match[2] as keyof OutlineUnit }
}

export function resolveOutlinePath(content: OutlineDocumentContent, path: string): string {
  const unitPath = parseUnitPath(path)
  if (unitPath) {
    const unit = content.units.find(item => item.id === unitPath.id)
    const value = unit?.[unitPath.field]
    return typeof value === 'string' ? value : ''
  }

  const [root, field] = path.split('.') as [keyof OutlineDocumentContent, string | undefined]
  if (!field) return ''
  const bucket = content[root]
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return ''
  const value = (bucket as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

export function setOutlinePath(content: OutlineDocumentContent, path: string, value: string): OutlineDocumentContent {
  const unitPath = parseUnitPath(path)
  if (unitPath) {
    const units = findOrCreateUnit(content.units, unitPath.id).map(unit =>
      unit.id === unitPath.id ? { ...unit, [unitPath.field]: value } : unit,
    )
    return { ...content, units }
  }

  const [root, field] = path.split('.') as [keyof OutlineDocumentContent, string | undefined]
  if (!field) return content
  const bucket = content[root]
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return content
  return {
    ...content,
    [root]: {
      ...(bucket as Record<string, unknown>),
      [field]: value,
    },
  }
}

export function createOutlineEpisode(number: number): OutlineEpisode {
  return {
    id: `episode-${number}`,
    number,
    label: `Episode ${number}`,
    title: '',
    hookLogline: '',
    aStory: '',
    bcStory: '',
    changeByEnd: '',
    endingHook: '',
  }
}

export function seedEpisodes101To103(content: OutlineDocumentContent): OutlineDocumentContent {
  if (content.episodes.length > 0) return content
  return {
    ...content,
    episodes: [createOutlineEpisode(101), createOutlineEpisode(102), createOutlineEpisode(103)],
  }
}

export function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

// Normalize a card's mappingPath (a single string OR an explicit binding list) into a
// binding list. Single shorthand: the card question is the binding label. Mirrors the
// inline logic in OutlineCard so per-card resolution lives in one place.
export function getOutlineCardBindings(card: OutlineCardDef): OutlineCardBinding[] {
  return typeof card.mappingPath === 'string'
    ? [{ label: card.question, path: card.mappingPath }]
    : card.mappingPath
}

// A card is answered only when EVERY binding resolves to non-empty text. Composite cards
// (e.g. spine.wantNeed: want + need) are not "answered" until both halves are filled.
export function isOutlineCardAnswered(content: OutlineDocumentContent, card: OutlineCardDef): boolean {
  return getOutlineCardBindings(card).every(binding => hasText(resolveOutlinePath(content, binding.path)))
}

export function hasFeatureOutlineAnswers(content: OutlineDocumentContent): boolean {
  return FEATURE_UNITS.some(def => {
    const unit = content.units.find(item => item.id === def.id)
    return hasText(unit?.whatHappens)
  })
}

export function hasSeriesOutlineAnswers(content: OutlineDocumentContent): boolean {
  const seriesValues = [
    ...Object.values(content.seriesEngine),
    ...Object.values(content.seasonArc),
    ...content.episodes.flatMap(episode => [
      episode.title,
      episode.hookLogline,
      episode.aStory,
      episode.bcStory,
      episode.changeByEnd,
      episode.endingHook,
    ]),
  ]
  return seriesValues.some(hasText)
}

export function hasOutlineAnswers(content: OutlineDocumentContent): boolean {
  return [
    ...Object.values(content.spine),
  ].some(hasText) || hasFeatureOutlineAnswers(content) || hasSeriesOutlineAnswers(content)
}
