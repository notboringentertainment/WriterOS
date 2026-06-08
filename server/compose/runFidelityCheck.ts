import type { ComposedBlock, FactSheet, FidelityWarning, Recipe } from '../../shared/compose/types'
import { traceEntity, traceNumber, type EntityInventory } from './entityInventory'

const PROSE_TYPES = new Set(['logline', 'paragraph', 'leadInParagraph'])
const INJECTION_PATTERNS = [
  /ignore (all |the )?(previous|prior|above) instructions/i,
  /mark everything (as )?verified/i,
  /disregard (the )?(system|rules)/i,
  /you are now/i,
]

// Includes the structural lead label — used for injection scanning, where a
// prompt-control phrase hidden in a lead must still be caught.
function injectionText(b: ComposedBlock): string {
  if (b.type === 'leadInParagraph') return `${b.lead} ${b.text}`
  if (b.type === 'logline' || b.type === 'paragraph') return b.text
  return ''
}

// Story-body text only. For leadInParagraph the `lead` is a fixed recipe label
// (e.g. "Point of No Return."), not authored story material, so it must NOT be
// entity/number-diffed against the source facts.
function entityText(b: ComposedBlock): string {
  if (b.type === 'leadInParagraph') return b.text
  if (b.type === 'logline' || b.type === 'paragraph') return b.text
  return ''
}

export function runFidelityCheck(
  blocks: ComposedBlock[],
  factSheet: FactSheet,
  recipe: Recipe,
  inventory: EntityInventory,
): { status: 'clean' | 'flagged'; warnings: FidelityWarning[] } {
  const warnings: FidelityWarning[] = []
  const validIds = new Set(factSheet.fields.map(f => f.id))
  const citedIds = new Set<string>()

  blocks.forEach((b, i) => {
    if (!PROSE_TYPES.has(b.type)) return
    const ids = (b as { sourceFieldIds?: string[] }).sourceFieldIds ?? []
    if (ids.length === 0) warnings.push({ kind: 'missing_provenance', message: 'Prose block has no sourceFieldIds.', blockIndex: i })
    for (const id of ids) {
      citedIds.add(id)
      if (!validIds.has(id)) warnings.push({ kind: 'dangling_source_id', message: `Unknown sourceFieldId: ${id}`, blockIndex: i, fieldId: id })
    }
    for (const p of INJECTION_PATTERNS) {
      if (p.test(injectionText(b))) warnings.push({ kind: 'injection_echo', message: 'Block echoes prompt-control phrasing.', blockIndex: i })
    }
    const text = entityText(b)
    for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)) {
      if (!traceEntity(m[1], inventory)) warnings.push({ kind: 'entity_diff', message: `Entity not in answers: ${m[1]}`, blockIndex: i, entity: m[1] })
    }
    for (const m of text.matchAll(/\b\d[\d,.:]*\b/g)) {
      if (!traceNumber(m[0], inventory)) warnings.push({ kind: 'entity_diff', message: `Number not in answers: ${m[0]}`, blockIndex: i, entity: m[0] })
    }
  })

  for (const section of recipe.sections) {
    for (const id of section.importantFieldIds) {
      if (validIds.has(id) && !citedIds.has(id)) {
        warnings.push({ kind: 'coverage', message: `Important answered field not covered: ${id}`, fieldId: id })
      }
    }
  }

  return { status: warnings.length > 0 ? 'flagged' : 'clean', warnings }
}

export function hasSevereInjection(blocks: ComposedBlock[]): boolean {
  return blocks.some(b => {
    const t = b.type === 'leadInParagraph' ? `${b.lead} ${b.text}` : (b as { text?: string }).text ?? ''
    return INJECTION_PATTERNS.some(p => p.test(t))
  })
}
