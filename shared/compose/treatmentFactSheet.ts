// shared/compose/treatmentFactSheet.ts
import type { TreatmentDocumentContent } from '../documents'
import type { FactKind, FactSheet, FactSheetField } from './types'

function clean(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : ''
}

const CONCEPT_FIELDS: { key: keyof TreatmentDocumentContent['concept']; label: string }[] = [
  { key: 'premise', label: 'Premise' },
  { key: 'tone', label: 'Tone' },
  { key: 'theme', label: 'Theme' },
  { key: 'emotionalPromise', label: 'Emotional promise' },
]

const PROSE_FIELDS: { key: 'opening' | 'actOne' | 'actTwo' | 'actThree'; label: string }[] = [
  { key: 'opening', label: 'Opening' },
  { key: 'actOne', label: 'Act one' },
  { key: 'actTwo', label: 'Act two' },
  { key: 'actThree', label: 'Act three' },
]

const VISUAL_FIELDS: { key: keyof TreatmentDocumentContent['visualAndTonal']; label: string }[] = [
  { key: 'overallTone', label: 'Overall tone' },
  { key: 'visualWorld', label: 'Visual world' },
  { key: 'recurringImagesOrMotifs', label: 'Recurring images or motifs' },
  { key: 'musicOrSoundFeeling', label: 'Music or sound feeling' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'genreRules', label: 'Genre rules' },
  { key: 'compsAndReferences', label: 'Comps and references' },
]

const CHARACTER_FIELDS: { key: 'role' | 'externalWant' | 'internalNeed' | 'flawOrWound' | 'secretOrContradiction' | 'arc' | 'relationshipPressure'; label: string }[] = [
  { key: 'role', label: 'Character role' },
  { key: 'externalWant', label: 'Character external want' },
  { key: 'internalNeed', label: 'Character internal need' },
  { key: 'flawOrWound', label: 'Character flaw or wound' },
  { key: 'secretOrContradiction', label: 'Character secret or contradiction' },
  { key: 'arc', label: 'Character arc' },
  { key: 'relationshipPressure', label: 'Character relationship pressure' },
]

export function buildTreatmentFactSheet(content: TreatmentDocumentContent, format: 'feature' | 'series'): FactSheet {
  const fields: FactSheetField[] = []
  const push = (id: string, label: string, kind: FactKind, raw: unknown) => {
    const value = clean(raw)
    if (value) fields.push({ id, label, kind, value })
  }

  push('logline', 'Logline', 'prose', content.logline)
  for (const f of CONCEPT_FIELDS) push(`concept.${String(f.key)}`, f.label, 'prose', content.concept[f.key])
  for (const f of PROSE_FIELDS) push(`prose.${f.key}`, f.label, 'prose', content.prose[f.key])
  for (const f of VISUAL_FIELDS) push(`visualAndTonal.${String(f.key)}`, f.label, 'prose', content.visualAndTonal[f.key])

  for (const ch of content.mainCharacters) {
    push(`mainCharacters.${ch.id}.name`, 'Character name', 'name', ch.name)
    for (const f of CHARACTER_FIELDS) push(`mainCharacters.${ch.id}.${f.key}`, f.label, 'prose', ch[f.key])
  }

  // A custom section's heading is not a separate fact; it labels the body fact.
  for (const section of content.prose.customSections) {
    const heading = clean(section.heading)
    push(
      `prose.customSections.${section.id}.body`,
      heading ? `Story passage — ${heading}` : 'Story passage',
      'prose',
      section.body,
    )
  }

  // openQuestions.*, aiProductionImplications.*, and header.* are never source material.

  fields.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { surface: 'treatment', format, fields }
}
