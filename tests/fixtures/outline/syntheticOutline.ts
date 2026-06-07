import { createEmptyOutlineContent } from '../../../shared/documents'
import type { OutlineDocumentContent } from '../../../shared/documents'
import { setOutlinePath } from '../../../client/src/lib/outlineDeck'

// createEmptyOutlineContent() seeds units: [] — build via setOutlinePath, which
// auto-creates feature units (createOutlineUnit) when writing units[id=...] paths.
const PATHS: Record<string, string> = {
  'spine.protagonist': 'Vera Solano, a disgraced forensic auditor',
  'spine.externalGoal': 'clear her name by exposing the shell-company fraud',
  'spine.internalNeed': 'to stop hiding behind ledgers and trust people again',
  'spine.centralOpposition': 'The Meridian Group, who buried the evidence',
  'spine.coreStakes': 'her freedom and her sister’s safety',
  'spine.theme': 'truth costs more than silence',
  'spine.ending': 'Vera testifies, losing everything but her integrity',
  'units[id=feature.openingNormalWorld].whatHappens': 'Vera reconciles audits alone in a basement office.',
  'units[id=feature.openingNormalWorld].whyNext': 'A flagged transaction lands on her desk.',
  'units[id=feature.incitingIncident].whatHappens': 'She finds a deleted ledger entry tying Meridian to a death.',
  'units[id=feature.incitingIncident].consequence': 'She copies the file before it vanishes.',
  'units[id=feature.actOneBreak].whatHappens': 'Meridian frees her contact and frames her for the leak.',
  'units[id=feature.actOneBreak].whyNext': 'She goes underground to prove it.',
  'units[id=feature.midpoint].whatHappens': 'Vera turns a Meridian insider, then learns her sister was the source.',
  'units[id=feature.midpoint].consequence': 'Trust and danger both spike.',
  'units[id=feature.allIsLostWithSubplot].whatHappens': 'The insider is killed and the evidence is seized.',
  'units[id=feature.allIsLostWithSubplot].consequence': 'Vera nearly runs.',
  'units[id=feature.climax].whatHappens': 'Vera walks into the hearing with the one copy they missed.',
  'units[id=feature.finalImage].whatHappens': 'Empty office, lights off, a subpoena on the desk.',
}

let content = createEmptyOutlineContent()
for (const [path, value] of Object.entries(PATHS)) content = setOutlinePath(content, path, value)

export const syntheticOutlineFeature: OutlineDocumentContent = content
