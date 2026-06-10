// shared/compose/synopsisFactSheet.ts
import type { SynopsisDocumentContent } from '../documents'
import type { FactKind, FactSheet, FactSheetField } from './types'

function clean(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : ''
}

const FEATURE_LOGLINE_FIELDS: { key: keyof SynopsisDocumentContent['logline']; label: string; kind: FactKind }[] = [
  { key: 'protagonist', label: 'Protagonist', kind: 'name' },
  { key: 'goal', label: 'Goal', kind: 'prose' },
  { key: 'obstacle', label: 'Obstacle', kind: 'prose' },
  { key: 'stakes', label: 'Stakes', kind: 'prose' },
  { key: 'hook', label: 'Hook', kind: 'prose' },
]

const PROSE_FIELDS: (keyof SynopsisDocumentContent['prose'])[] =
  ['opening', 'escalation', 'middle', 'climax', 'resolution']

function titleCase(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()
}

export function buildSynopsisFactSheet(content: SynopsisDocumentContent, format: 'feature' | 'series'): FactSheet {
  const fields: FactSheetField[] = []
  const push = (id: string, label: string, kind: FactKind, raw: unknown) => {
    const value = clean(raw)
    if (value) fields.push({ id, label, kind, value })
  }

  // The logline lead line is shared by both formats.
  push('logline.text', 'Logline', 'prose', content.logline.text)

  if (format === 'feature') {
    for (const f of FEATURE_LOGLINE_FIELDS) push(`logline.${String(f.key)}`, f.label, f.kind, content.logline[f.key])
    for (const key of PROSE_FIELDS) push(`prose.${String(key)}`, titleCase(String(key)), 'prose', content.prose[key])
  } else {
    const s = content.series
    if (s) {
      push('series.showOverview', 'Show overview', 'prose', s.showOverview)
      push('series.pilot.logline', 'Pilot logline', 'prose', s.pilot.logline)
      push('series.pilot.prose', 'Pilot synopsis', 'prose', s.pilot.prose)
      push('series.seasonOneArc', 'Season one arc', 'prose', s.seasonOneArc)
      for (const fsn of s.futureSeasons) {
        const label = clean(fsn.label) || `Future season ${fsn.id}`
        push(`series.futureSeasons.${fsn.id}.summary`, `Where it goes — ${label}`, 'prose', fsn.summary)
      }
      for (const ch of s.characters) {
        push(`series.characters.${ch.id}.name`, 'Character name', 'name', ch.name)
        push(`series.characters.${ch.id}.role`, 'Character role', 'prose', ch.role)
        push(`series.characters.${ch.id}.bio`, 'Character bio', 'prose', ch.bio)
        // arcPerSeason is string[]; join non-empty entries in order rather than dropping it.
        const arc = ch.arcPerSeason.map(a => clean(a)).filter(Boolean).join('; ')
        if (arc) fields.push({ id: `series.characters.${ch.id}.arcPerSeason`, label: 'Character arc per season', kind: 'prose', value: arc })
      }
      push('series.compsAndWhyThisShowNow', 'Comps and why this show now', 'prose', s.compsAndWhyThisShowNow)
    }
  }

  fields.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { surface: 'synopsis', format, fields }
}
