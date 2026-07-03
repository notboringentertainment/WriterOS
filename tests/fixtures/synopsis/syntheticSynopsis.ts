import { createEmptySynopsisContent, createEmptySeriesContent } from '../../../shared/documents'
import type { SynopsisDocumentContent } from '../../../shared/documents'

// Synthetic, in-repo fixtures only — no external template files are committed or read.

const feature = createEmptySynopsisContent()
feature.header = { title: 'Tideline', writer: 'B. Vance', format: 'feature', genre: 'Thriller', targetRuntime: '105', comps: [] }
feature.logline = {
  text: 'A forensic auditor races a rising flood to expose the company that drowned her town.',
  protagonist: 'Vera Solano, a disgraced forensic auditor',
  goal: 'expose the shell-company fraud before the levee vote',
  obstacle: 'The Meridian Group, who buried the evidence',
  stakes: 'her freedom and her sister’s safety',
  hook: 'the audit trail only surfaces at low tide',
}
feature.prose = {
  opening: 'Vera reconciles audits alone in a flooded basement office as the river creeps up the walls.',
  escalation: 'A deleted ledger entry ties Meridian to a drowning, and she copies the file before it vanishes.',
  middle: 'Framed for the leak, she goes underground and turns a Meridian insider — who turns out to be her sister.',
  climax: 'Vera walks into the levee hearing with the one copy they missed as the water reaches the doors.',
  resolution: 'She testifies, loses everything but her integrity, and the town votes to rebuild.',
}
export const syntheticSynopsisFeature: SynopsisDocumentContent = feature

const series = createEmptySynopsisContent()
series.header = { title: 'Reset Crew', writer: 'B. Vance', format: 'series', genre: 'Heist', targetRuntime: '', comps: [] }
series.logline = { text: 'A heist crew wakes each week with no memory of the last job.', protagonist: '', goal: '', obstacle: '', stakes: '', hook: '' }
series.series = createEmptySeriesContent()
series.series.showOverview = 'Every episode, a crew of thieves wakes with the previous job erased from their minds and a new mark already in motion.'
series.series.pilot = {
  logline: 'The first job goes wrong when one of them remembers.',
  prose: 'They breach the vault clean until Mara recalls the last crew that tried — and the floor gives way beneath them.',
}
series.series.seasonOneArc = 'The crew pieces together who keeps erasing them, and why they keep saying yes.'
series.series.futureSeasons = [{ id: 's2', label: 'Season 2', summary: 'The crew runs the operation that once ran them.' }]
series.series.characters = [
  { id: 'c1', name: 'Mara', role: 'The one who remembers', bio: 'A thief who never fully forgets.', arcPerSeason: ['Learns to trust the crew', 'Leads them out'] },
]
series.series.compsAndWhyThisShowNow = 'Heat by way of Memento, for a streaming audience that binges memory-box mysteries.'
export const syntheticSynopsisSeries: SynopsisDocumentContent = series
