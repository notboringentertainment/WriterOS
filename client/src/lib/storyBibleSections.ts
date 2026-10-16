import type { StoryBibleDocumentContent } from '@shared/documents'
import type { ProjectMemorySnapshot } from '@shared/projectMemory'
import type { ProjectFormat } from '@shared/projectFormat'
import { buildStandingEntries } from '@shared/compose/whatsStandingFactSheet'
import { promotedLooks, slugifyEntityName } from './lookDraftEdits'
import type { StoryBibleSection } from './shellState'

// The Story Bible, laid out in the six sections of the writer's story-bible
// template. Every Story Bible field appears in exactly one section; fields the
// project's format doesn't use are shown only when they already have text.

export type StoryBibleFieldKind = 'text' | 'textarea' | 'list'

export interface StoryBibleFieldDef {
  path: string
  label: string
  kind: StoryBibleFieldKind
  /** Shown only for this format unless the field already has text. */
  format?: ProjectFormat
}

export interface StoryBibleSectionDef {
  id: string
  title: string
  /** Morgan's specialist routing for this part of the Story Bible. */
  section: StoryBibleSection
  fields: readonly StoryBibleFieldDef[]
  /** People and locks have their own editors. */
  special?: 'characters' | 'locks'
}

export const STORY_BIBLE_SECTIONS: readonly StoryBibleSectionDef[] = [
  {
    id: 'story', title: 'The story', section: 'themes',
    fields: [
      { path: 'onePagePitch.logline', label: 'In one sentence', kind: 'textarea' },
      { path: 'onePagePitch.inANutshell', label: 'In a nutshell', kind: 'textarea' },
      { path: 'onePagePitch.centralQuestion', label: 'The question it argues', kind: 'textarea' },
      { path: 'onePagePitch.corePromise', label: 'The promise to the audience', kind: 'textarea' },
      { path: 'onePagePitch.whyThisMatters', label: 'Why it matters', kind: 'textarea' },
      { path: 'onePagePitch.whatMakesItDifferent', label: 'What makes it different', kind: 'textarea' },
      { path: 'cover.title', label: 'Title', kind: 'text' },
      { path: 'cover.writer', label: 'Written by', kind: 'text' },
      { path: 'cover.genre', label: 'Genre', kind: 'text' },
      { path: 'cover.version', label: 'Version', kind: 'text' },
      { path: 'cover.dateUpdated', label: 'Date', kind: 'text' },
    ],
  },
  {
    id: 'tone', title: 'Tone and style', section: 'tone',
    fields: [
      { path: 'toneAndStyle.toneWords', label: 'Tone words', kind: 'list' },
      { path: 'toneAndStyle.comps', label: 'Compare it to', kind: 'list' },
      { path: 'toneAndStyle.antiComps', label: 'Never confuse it with', kind: 'list' },
      { path: 'toneAndStyle.mustNeverFeelLike', label: 'It must never feel like', kind: 'textarea' },
      { path: 'toneAndStyle.dialogueStyle', label: 'Dialogue', kind: 'textarea' },
      { path: 'toneAndStyle.visualStyle', label: 'Visuals', kind: 'textarea' },
      { path: 'toneAndStyle.soundOrMusicStyle', label: 'Sound and music', kind: 'textarea' },
      { path: 'toneAndStyle.pacingRules', label: 'Pacing', kind: 'textarea' },
      { path: 'toneAndStyle.humorRules', label: 'Humor', kind: 'textarea' },
      { path: 'toneAndStyle.violenceOrIntensityRules', label: 'Intensity', kind: 'textarea' },
    ],
  },
  {
    id: 'world', title: 'World and rules', section: 'world',
    fields: [
      { path: 'premiseAndWorld.premise', label: 'The world', kind: 'textarea' },
      { path: 'premiseAndWorld.worldRules', label: 'Its rules', kind: 'textarea' },
      { path: 'premiseAndWorld.publicHistory', label: 'What everyone knows', kind: 'textarea' },
      { path: 'premiseAndWorld.hiddenHistory', label: 'What is hidden', kind: 'textarea' },
      { path: 'premiseAndWorld.mythologyReveals', label: 'Mythology and reveals', kind: 'textarea' },
    ],
  },
  { id: 'people', title: 'People', section: 'characters', fields: [], special: 'characters' },
  {
    id: 'engine', title: 'Story engine', section: 'rules',
    fields: [
      { path: 'storyEngine.featurePropulsion', label: 'Where the story starts', kind: 'textarea', format: 'feature' },
      { path: 'storyEngine.seriesEngine', label: 'What generates episodes', kind: 'textarea', format: 'series' },
      { path: 'storyEngine.pilotEngine', label: 'The pilot', kind: 'textarea', format: 'series' },
      { path: 'storyEngine.seasonArc', label: 'Season one', kind: 'textarea', format: 'series' },
      { path: 'storyEngine.whatKeepsThePremiseAlive', label: 'What keeps it alive', kind: 'textarea' },
      { path: 'storyEngine.futureSeasonPotential', label: 'Where it could go', kind: 'textarea' },
    ],
  },
  { id: 'locks', title: 'Always true', section: 'rules', fields: [], special: 'locks' },
]

export function readField(content: StoryBibleDocumentContent, path: string): string {
  const [group, key] = path.split('.') as [keyof StoryBibleDocumentContent, string]
  const value = (content[group] as unknown as Record<string, unknown>)[key]
  return Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : ''
}

export function writeField(
  content: StoryBibleDocumentContent,
  field: StoryBibleFieldDef,
  text: string,
): Partial<StoryBibleDocumentContent> {
  const [group, key] = field.path.split('.') as [keyof StoryBibleDocumentContent, string]
  const value = field.kind === 'list' ? text.split(/[,\n]/).map(item => item.trim()).filter(Boolean) : text
  return { [group]: { ...(content[group] as object), [key]: value } } as Partial<StoryBibleDocumentContent>
}

export function visibleFields(
  section: StoryBibleSectionDef,
  content: StoryBibleDocumentContent,
  format: ProjectFormat,
): StoryBibleFieldDef[] {
  return section.fields.filter(field => !field.format || field.format === format || readField(content, field.path).trim())
}

/** The episode or sequence map has no field of its own here; written entries show under Story engine. */
export function writtenMapEntries(content: StoryBibleDocumentContent) {
  return content.episodeOrSequenceMap.filter(entry => entry.title.trim() || entry.storyEvents.trim())
}

export function sectionIsWritten(section: StoryBibleSectionDef, content: StoryBibleDocumentContent): boolean {
  if (section.special === 'characters') return content.characters.some(character => character.name.trim())
  if (section.special === 'locks') return content.locks.some(lock => lock.status === 'active' && lock.statement.trim())
  if (section.id === 'engine' && writtenMapEntries(content).length) return true
  return section.fields.some(field => readField(content, field.path).trim())
}

/** "Still open": the ledger's active open questions, the same records What's Standing lists. */
export function stillOpen(snapshot: ProjectMemorySnapshot | undefined): Array<{ id: string; text: string }> {
  if (!snapshot) return []
  return buildStandingEntries(snapshot)
    .filter(entry => entry.group === 'openQuestion')
    .map(entry => ({ id: entry.record.id, text: entry.record.claim }))
}

export interface CanonLook {
  text: string
  /** Where the look was settled, in the writer's words. */
  origin: string
}

/**
 * A character's look as canon holds it: a look promoted from WriterOS's Look
 * panel, or a look ticket settled in Story-drive. Read-only.
 */
export function canonLookFor(snapshot: ProjectMemorySnapshot | undefined, name: string): CanonLook | null {
  const trimmed = name.trim()
  if (!snapshot || !trimmed) return null
  const promoted = promotedLooks(snapshot).find(look => look.entityKind === 'character' && look.entityName === trimmed)
  if (promoted) {
    const record = snapshot.records.find(item => item.id === promoted.recordId)
    const date = promoted.promotedAt ? new Date(promoted.promotedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
    return { text: (record?.claim ?? '').replace(/^Look:\s*[^—]*—\s*/, ''), origin: `Promoted from WriterOS${date ? ` ${date}` : ''}` }
  }
  const ticket = `resolved/look-character-${slugifyEntityName(trimmed)}.md`
  const settled = snapshot.records.find(record => record.kind === 'canon' && record.status === 'active' && record.source.workflow === 'story-wayfinder' && record.source.sourceId === ticket)
  return settled ? { text: settled.claim, origin: 'Settled in Story-drive' } : null
}
