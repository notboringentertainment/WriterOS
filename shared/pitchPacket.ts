import { z } from 'zod'
import type { ProjectDocuments } from './documents'
import { LOCKS_PREFACE, OPEN_QUESTIONS_PREFACE, slugifyProjectTitle } from './seedMarkdown'

export const PITCH_PACKET_VERSION = 1 as const
export const PitchPacketOriginSchema = z.enum(['document', 'meeting', 'writer', 'ai_proposed'])
export type PitchPacketOrigin = z.infer<typeof PitchPacketOriginSchema>

export const PitchPacketFieldSchema = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  origin: PitchPacketOriginSchema,
  approved: z.boolean(),
  sourceRef: z.string().min(1).optional(),
  conflict: z.boolean().optional(),
  candidates: z.array(z.object({ value, origin: PitchPacketOriginSchema, sourceRef: z.string().min(1) })).optional(),
})

export const PitchPacketCharacterSchema = z.object({
  name: z.string(), role: z.string(), want: z.string(), need: z.string(), flawOrWound: z.string(),
  secretOrContradiction: z.string(), arc: z.string(), sourceRef: z.string().optional(),
})

export const PitchPacketLockSchema = z.object({
  statement: z.string(), originMarker: z.enum(['[SEED]', '[EXTRAPOLATED]', '[INVENTED]']),
  rationale: z.string().optional(), sourceRef: z.string().optional(),
})

export const PitchPacketOpenQuestionSchema = z.object({
  text: z.string(), category: z.string().optional(), sourceRef: z.string().optional(),
})

export const PitchPacketSchema = z.object({
  packetVersion: z.literal(PITCH_PACKET_VERSION),
  projectId: z.string().min(1),
  exportedAt: z.string().datetime({ offset: true }),
  directionRevision: z.number().int().nonnegative(),
  title: PitchPacketFieldSchema(z.string()),
  logline: PitchPacketFieldSchema(z.string()),
  format: PitchPacketFieldSchema(z.string()),
  genre: PitchPacketFieldSchema(z.string()),
  tone: PitchPacketFieldSchema(z.string()),
  premise: PitchPacketFieldSchema(z.string()),
  storyEngine: PitchPacketFieldSchema(z.string()),
  coreCharacters: PitchPacketFieldSchema(z.array(PitchPacketCharacterSchema)),
  locks: PitchPacketFieldSchema(z.array(PitchPacketLockSchema)),
  openQuestions: PitchPacketFieldSchema(z.array(PitchPacketOpenQuestionSchema)),
  comps: PitchPacketFieldSchema(z.array(z.string())).optional(),
  device: PitchPacketFieldSchema(z.string()).optional(),
})

export type PitchPacket = z.infer<typeof PitchPacketSchema>
export type PitchPacketField<T> = {
  value: T
  origin: PitchPacketOrigin
  approved: boolean
  sourceRef?: string
  conflict?: boolean
  candidates?: Array<{ value: T; origin: PitchPacketOrigin; sourceRef: string }>
}

export interface PitchMeetingDirectionItem {
  id: string
  area: string
  fieldPath: string
  statement: string
  mutability: 'locked' | 'leaning' | 'open'
  originMarker: '[SEED]' | '[EXTRAPOLATED]' | '[INVENTED]'
}

export interface PitchPacketOverride<T> { value: T; sourceRef?: string }
export type PitchPacketValues = {
  [K in keyof Omit<PitchPacket, 'packetVersion' | 'projectId' | 'exportedAt' | 'directionRevision'>]:
    PitchPacket[K] extends PitchPacketField<infer T> | undefined ? T : never
}
export type PitchPacketOverrides = Partial<{ [K in keyof PitchPacketValues]: PitchPacketOverride<PitchPacketValues[K]> }>

export interface ComposePitchPacketInput {
  projectId: string
  sessionId: string
  projectTitle?: string
  documents: ProjectDocuments
  activeMeetingDirection: readonly PitchMeetingDirectionItem[]
  storyLocks: string
  openQuestions: string
  directionRevision: number
  exportedAt: string
  writerOverrides?: PitchPacketOverrides
  approvedProposalOverrides?: PitchPacketOverrides
}

type Candidate<T> = { value: T; origin: PitchPacketOrigin; sourceRef: string }

function text(value: string | undefined): string { return value?.trim() ?? '' }

function scalarField(
  key: keyof PitchPacketValues,
  candidates: Array<Candidate<string>>,
  input: ComposePitchPacketInput,
): PitchPacketField<string> {
  const writer = input.writerOverrides?.[key] as PitchPacketOverride<string> | undefined
  if (writer && text(writer.value)) return { value: text(writer.value), origin: 'writer', approved: true, sourceRef: writer.sourceRef ?? `writer:${String(key)}` }
  const proposal = input.approvedProposalOverrides?.[key] as PitchPacketOverride<string> | undefined
  if (proposal && text(proposal.value)) return { value: text(proposal.value), origin: 'ai_proposed', approved: true, sourceRef: proposal.sourceRef ?? `proposal:${String(key)}` }
  const unique: Array<Candidate<string>> = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const value = text(candidate.value)
    if (!value || seen.has(value)) continue
    seen.add(value)
    unique.push({ ...candidate, value })
  }
  if (unique.length === 0) return { value: '', origin: 'writer', approved: false, sourceRef: `packet.${String(key)}` }
  return {
    value: unique[0].value, origin: unique[0].origin, approved: false, sourceRef: unique[0].sourceRef,
    ...(unique.length > 1 ? { conflict: true, candidates: unique } : {}),
  }
}

function overrideList<T>(key: keyof PitchPacketValues, input: ComposePitchPacketInput): PitchPacketField<T> | null {
  const writer = input.writerOverrides?.[key] as PitchPacketOverride<T> | undefined
  if (writer) return { value: writer.value, origin: 'writer', approved: true, sourceRef: writer.sourceRef ?? `writer:${String(key)}` }
  const proposal = input.approvedProposalOverrides?.[key] as PitchPacketOverride<T> | undefined
  if (proposal) return { value: proposal.value, origin: 'ai_proposed', approved: true, sourceRef: proposal.sourceRef ?? `proposal:${String(key)}` }
  return null
}

function splitList(value: string): string[] {
  return value.split(/[,\n]/).map(text).filter(Boolean)
}

function lockLines(value: string): Array<{ statement: string; originMarker: '[SEED]' | '[EXTRAPOLATED]' | '[INVENTED]' }> {
  return value.split(/\r?\n/).flatMap(line => {
    const trimmed = line.replace(/^[-*]\s+/, '').trim()
    if (!trimmed || trimmed.startsWith('## ') || trimmed === 'None declared.' || /^No locks/.test(trimmed)) return []
    const marker = trimmed.match(/^\[(SEED|EXTRAPOLATED|INVENTED)\]\s*/)?.[0]
    const originMarker = marker?.includes('EXTRAPOLATED') ? '[EXTRAPOLATED]' as const : marker?.includes('INVENTED') ? '[INVENTED]' as const : '[SEED]' as const
    return [{ statement: marker ? trimmed.slice(marker.length).trim() : trimmed, originMarker }]
  })
}

function openQuestionLines(value: string): string[] {
  if (/^Nothing delegated/.test(value.trim())) return []
  return value.split(/\r?\n/).map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(line => line && !line.startsWith('## ') && !line.endsWith(':') && !/^… \(\+\d+ more/.test(line))
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter(item => seen.has(key(item)) ? false : (seen.add(key(item)), true))
}

export function composePitchPacket(input: ComposePitchPacketInput): PitchPacket {
  const synopsis = input.documents.synopsis.content
  const treatment = input.documents.treatment.content
  const storyBible = input.documents.storyBible.content
  const title = scalarField('title', [
    { value: synopsis.header.title, origin: 'document', sourceRef: 'synopsis.header.title' },
    { value: treatment.header.title, origin: 'document', sourceRef: 'treatment.header.title' },
    { value: storyBible.cover.title, origin: 'document', sourceRef: 'storyBible.cover.title' },
    { value: input.projectTitle ?? '', origin: 'document', sourceRef: 'project.title' },
  ], input)
  const logline = scalarField('logline', [
    { value: synopsis.logline.text, origin: 'document', sourceRef: 'synopsis.logline.text' },
    { value: treatment.logline, origin: 'document', sourceRef: 'treatment.logline' },
  ], input)
  const format = scalarField('format', [
    { value: synopsis.header.format, origin: 'document', sourceRef: 'synopsis.header.format' },
    { value: treatment.header.format, origin: 'document', sourceRef: 'treatment.header.format' },
  ], input)
  const genre = scalarField('genre', [
    { value: synopsis.header.genre, origin: 'document', sourceRef: 'synopsis.header.genre' },
    { value: treatment.header.genre, origin: 'document', sourceRef: 'treatment.header.genre' },
  ], input)
  const tone = scalarField('tone', [
    { value: treatment.concept.tone, origin: 'document', sourceRef: 'treatment.concept.tone' },
    { value: storyBible.toneAndStyle.toneWords.map(text).filter(Boolean).join(', '), origin: 'document', sourceRef: 'storyBible.toneAndStyle.toneWords' },
  ], input)
  const premise = scalarField('premise', [
    { value: storyBible.premiseAndWorld.premise, origin: 'document', sourceRef: 'storyBible.premiseAndWorld.premise' },
    { value: treatment.concept.premise, origin: 'document', sourceRef: 'treatment.concept.premise' },
  ], input)
  const storyEngine = scalarField('storyEngine', [], input)

  const storyBibleCharacters = storyBible.characters.filter(character => text(character.name)).map(character => ({
    name: text(character.name), role: text(character.role), want: text(character.want), need: text(character.need),
    flawOrWound: text(character.flaw), secretOrContradiction: [text(character.secret), text(character.contradiction)].filter(Boolean).join(' / '),
    arc: text(character.arc), sourceRef: `storyBible.characters.${character.id}`,
  }))
  const synopsisCharacters = (synopsis.series?.characters ?? []).filter(character => text(character.name)).map(character => ({
    name: text(character.name), role: text(character.role), want: '', need: '', flawOrWound: text(character.bio),
    secretOrContradiction: '', arc: character.arcPerSeason.map(text).filter(Boolean).join(' / '), sourceRef: `synopsis.series.characters.${character.id}`,
  }))
  const coreCharacters = overrideList<PitchPacket['coreCharacters']['value']>('coreCharacters', input) ?? {
    value: storyBibleCharacters.length ? storyBibleCharacters : synopsisCharacters,
    origin: 'document' as const, approved: false,
    sourceRef: storyBibleCharacters.length ? 'storyBible.characters' : 'synopsis.series.characters',
  }

  const meetingLocks = input.activeMeetingDirection.filter(item => item.mutability === 'locked').map(item => ({ statement: text(item.statement), originMarker: item.originMarker, sourceRef: `meeting_decisions:${item.id}` }))
  const blockLocks = lockLines(input.storyLocks).map(item => ({ ...item, sourceRef: 'story_locks' }))
  const documentLocks = storyBible.locks.filter(lock => lock.status === 'active' && text(lock.statement)).map(lock => ({ statement: text(lock.statement), originMarker: '[SEED]' as const, rationale: text(lock.rationale) || undefined, sourceRef: `storyBible.locks.${lock.id}` }))
  const locks = overrideList<PitchPacket['locks']['value']>('locks', input) ?? {
    value: dedupeBy([...meetingLocks, ...blockLocks, ...documentLocks], item => item.statement),
    origin: (meetingLocks.length || blockLocks.length ? 'meeting' : 'document') as PitchPacketOrigin,
    approved: false, sourceRef: 'meeting_decisions+story_locks+storyBible.locks',
  }

  const meetingOpen = input.activeMeetingDirection.filter(item => item.mutability === 'open').map(item => ({ text: text(item.statement), category: item.area, sourceRef: `meeting_decisions:${item.id}` }))
  const blockOpen = openQuestionLines(input.openQuestions).map(question => ({ text: question, sourceRef: 'open_questions' }))
  const treatmentOpen = (Object.entries(treatment.openQuestions) as Array<[string, string[]]>).flatMap(([category, questions]) => questions.map(question => ({ text: text(question), category, sourceRef: `treatment.openQuestions.${category}` }))).filter(item => item.text)
  const openQuestions = overrideList<PitchPacket['openQuestions']['value']>('openQuestions', input) ?? {
    value: dedupeBy([...meetingOpen, ...blockOpen, ...treatmentOpen], item => item.text),
    origin: (meetingOpen.length || blockOpen.length ? 'meeting' : 'document') as PitchPacketOrigin,
    approved: false, sourceRef: 'meeting_decisions+open_questions+treatment.openQuestions',
  }

  const compValues = dedupeBy([...synopsis.header.comps.map(text), ...splitList(treatment.visualAndTonal.compsAndReferences)].filter(Boolean), value => value)
  const comps = overrideList<string[]>('comps', input) ?? { value: compValues, origin: 'document' as const, approved: false, sourceRef: 'synopsis.header.comps+treatment.visualAndTonal.compsAndReferences' }
  const device = scalarField('device', [], input)

  return PitchPacketSchema.parse({ packetVersion: PITCH_PACKET_VERSION, projectId: input.projectId, exportedAt: input.exportedAt, directionRevision: input.directionRevision, title, logline, format, genre, tone, premise, storyEngine, coreCharacters, locks, openQuestions, comps, device })
}

const REQUIRED_FIELDS = ['title', 'logline', 'format', 'genre', 'tone', 'premise', 'storyEngine', 'coreCharacters', 'locks', 'openQuestions'] as const

export function validatePitchPacketForApproval(packet: PitchPacket): { ok: boolean; errors: string[] } {
  const parsed = PitchPacketSchema.safeParse(packet)
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(issue => issue.message) }
  const errors: string[] = []
  for (const key of REQUIRED_FIELDS) {
    const field = parsed.data[key]
    const empty = typeof field.value === 'string' ? !field.value.trim() : key === 'coreCharacters' ? field.value.length < 1 : false
    if (empty) errors.push(`${key} is required.`)
    if (!field.approved) errors.push(`${key} must be approved.`)
    if (field.conflict) errors.push(`${key} has an unresolved conflict.`)
    if (!field.sourceRef) errors.push(`${key} is missing source provenance.`)
  }
  return { ok: errors.length === 0, errors }
}

function yaml(value: unknown): string { return JSON.stringify(value) }

export function renderPitchPacketMarkdown(packet: PitchPacket): string {
  const value = PitchPacketSchema.parse(packet)
  const frontmatter = [
    '---', `packet_version: ${value.packetVersion}`, `title: ${yaml(value.title.value)}`,
    `logline: ${yaml(value.logline.value)}`, `format: ${yaml(value.format.value)}`, `genre: ${yaml(value.genre.value)}`,
    `tone: ${yaml(value.tone.value)}`, `device: ${yaml(value.device?.value ?? '')}`, `comps: ${yaml(value.comps?.value ?? [])}`,
    `exported_at: ${yaml(value.exportedAt)}`, `direction_revision: ${value.directionRevision}`, '---', '',
  ].join('\n')
  const characters = value.coreCharacters.value.map(character => [
    `### ${character.name || '(unnamed)'}`,
    `- Role: ${character.role}`, `- Want: ${character.want}`, `- Need: ${character.need}`,
    `- Flaw or wound: ${character.flawOrWound}`, `- Secret or contradiction: ${character.secretOrContradiction}`, `- Arc: ${character.arc}`,
  ].join('\n')).join('\n\n')
  const locks = value.locks.value.map(lock => `- ${lock.originMarker} ${lock.statement}${lock.rationale ? ` — ${lock.rationale}` : ''}`).join('\n') || '- None reviewed.'
  const questions = value.openQuestions.value.map(question => `- ${question.category ? `${question.category}: ` : ''}${question.text}`).join('\n') || '- None; the writer holds all remaining intent.'
  return `${frontmatter}## Premise\n\n${value.premise.value}\n\n## Story Engine\n\n${value.storyEngine.value}\n\n## Core Characters\n\n${characters}\n\n## Locks — do not violate\n\n${LOCKS_PREFACE}\n\n${locks}\n\n## Open Questions — invent here\n\n${OPEN_QUESTIONS_PREFACE}\n\n${questions}\n`
}

export function renderPitchPacketJson(packet: PitchPacket): string {
  return `${JSON.stringify(PitchPacketSchema.parse(packet), null, 2)}\n`
}

export function pitchPacketFileNames(packet: Pick<PitchPacket, 'title' | 'packetVersion' | 'directionRevision'>): { markdown: string; json: string } {
  const base = `${slugifyProjectTitle(packet.title.value)}-pitch-packet-v${packet.packetVersion}-r${packet.directionRevision}`
  return { markdown: `${base}.md`, json: `${base}.json` }
}
