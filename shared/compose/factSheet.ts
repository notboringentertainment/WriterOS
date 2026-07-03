// shared/compose/factSheet.ts
import type { OutlineDocumentContent } from '../documents'
import type { FactKind, FactSheet, FactSheetField } from './types'

function clean(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : ''
}

const SPINE_FIELDS: { key: keyof OutlineDocumentContent['spine']; label: string; kind: FactKind }[] = [
  { key: 'protagonist', label: 'Protagonist', kind: 'name' },
  { key: 'externalGoal', label: 'External goal', kind: 'prose' },
  { key: 'internalNeed', label: 'Internal need', kind: 'prose' },
  { key: 'centralOpposition', label: 'Central opposition', kind: 'prose' },
  { key: 'coreStakes', label: 'Core stakes', kind: 'prose' },
  { key: 'theme', label: 'Theme', kind: 'prose' },
  { key: 'ending', label: 'Ending', kind: 'prose' },
]

const UNIT_FIELDS: (keyof OutlineDocumentContent['units'][number])[] =
  ['whatHappens', 'conflict', 'turn', 'consequence', 'whyNext']

const ENGINE_FIELDS: (keyof OutlineDocumentContent['seriesEngine'])[] =
  ['showPitch', 'repeatableConflict', 'serialQuestion', 'episodeEngine', 'pilotPromise', 'premiseLongevity', 'worldPressure']

const SEASON_FIELDS: (keyof OutlineDocumentContent['seasonArc'])[] =
  ['seasonQuestion', 'seasonAntagonist', 'seasonMidpoint', 'seasonClimax', 'seasonEndingHook']

const EPISODE_FIELDS: (keyof OutlineDocumentContent['episodes'][number])[] =
  ['hookLogline', 'aStory', 'bcStory', 'changeByEnd', 'endingHook']

function titleCase(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()
}

export function buildOutlineFactSheet(content: OutlineDocumentContent, format: 'feature' | 'series'): FactSheet {
  const fields: FactSheetField[] = []
  const push = (id: string, label: string, kind: FactKind, raw: unknown) => {
    const value = clean(raw)
    if (value) fields.push({ id, label, kind, value })
  }

  for (const f of SPINE_FIELDS) push(`spine.${String(f.key)}`, f.label, f.kind, content.spine[f.key])

  if (format === 'feature') {
    for (const unit of content.units) {
      for (const fld of UNIT_FIELDS) {
        push(`${unit.id}.${String(fld)}`, `${unit.title} — ${titleCase(String(fld))}`, 'prose', unit[fld])
      }
    }
  } else {
    for (const fld of ENGINE_FIELDS) push(`seriesEngine.${String(fld)}`, titleCase(String(fld)), 'prose', content.seriesEngine[fld])
    for (const fld of SEASON_FIELDS) push(`seasonArc.${String(fld)}`, titleCase(String(fld)), 'prose', content.seasonArc[fld])
    for (const ep of content.episodes) {
      for (const fld of EPISODE_FIELDS) {
        push(`episodes.${ep.number}.${String(fld)}`, `Episode ${ep.number} — ${titleCase(String(fld))}`, 'prose', ep[fld])
      }
    }
  }

  fields.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { surface: 'outline', format, fields }
}
