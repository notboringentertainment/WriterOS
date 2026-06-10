import { describe, expect, it } from 'vitest'
import { buildSynopsisFactSheet } from '../../../shared/compose/synopsisFactSheet'
import { createEmptySynopsisContent, createEmptySeriesContent } from '../../../shared/documents'

describe('buildSynopsisFactSheet', () => {
  it('feature: drops empty fields, sorts by id, cleans whitespace, marks protagonist as a name', () => {
    const content = createEmptySynopsisContent()
    content.logline.protagonist = '  Mara  '
    content.logline.goal = 'Escape the drowned city'
    content.prose.opening = 'A quiet morning above the tideline.'
    const fs = buildSynopsisFactSheet(content, 'feature')

    const ids = fs.fields.map(f => f.id)
    expect(fs.surface).toBe('synopsis')
    expect(ids).toEqual([...ids].sort())
    expect(fs.fields.find(f => f.id === 'logline.protagonist')).toMatchObject({ value: 'Mara', kind: 'name' })
    expect(fs.fields.find(f => f.id === 'logline.goal')?.value).toBe('Escape the drowned city')
    expect(fs.fields.find(f => f.id === 'prose.opening')?.value).toBe('A quiet morning above the tideline.')
    expect(fs.fields.some(f => f.id === 'logline.stakes')).toBe(false)
    expect(fs.fields.some(f => f.id.startsWith('series.'))).toBe(false)
  })

  it('series: emits show overview, pilot, season arc, and future-season summaries', () => {
    const content = createEmptySynopsisContent()
    content.logline.text = 'A heist crew resets each week.'
    content.series = createEmptySeriesContent()
    content.series.showOverview = 'A crew of thieves wakes with no memory of the last job.'
    content.series.pilot.logline = 'The first job goes wrong.'
    content.series.pilot.prose = 'They breach the vault and the floor gives way.'
    content.series.seasonOneArc = 'The crew learns who erased them.'
    content.series.futureSeasons = [{ id: 's2', label: 'Season 2', summary: 'A bigger mark.' }]
    const fs = buildSynopsisFactSheet(content, 'series')

    expect(fs.fields.find(f => f.id === 'logline.text')?.value).toBe('A heist crew resets each week.')
    expect(fs.fields.find(f => f.id === 'series.showOverview')?.value).toBe('A crew of thieves wakes with no memory of the last job.')
    expect(fs.fields.find(f => f.id === 'series.pilot.logline')?.value).toBe('The first job goes wrong.')
    expect(fs.fields.find(f => f.id === 'series.pilot.prose')?.value).toBe('They breach the vault and the floor gives way.')
    expect(fs.fields.find(f => f.id === 'series.seasonOneArc')?.value).toBe('The crew learns who erased them.')
    expect(fs.fields.find(f => f.id === 'series.futureSeasons.s2.summary')?.value).toBe('A bigger mark.')
  })

  it('series: joins per-character arcPerSeason in order, dropping empty entries, and keeps name/role/bio', () => {
    const content = createEmptySynopsisContent()
    content.series = createEmptySeriesContent()
    content.series.characters = [{
      id: 'c1', name: 'Mara', role: 'Lead', bio: 'A thief who never sleeps.',
      arcPerSeason: ['Learns to trust', '', 'Leads the crew'],
    }]
    const fs = buildSynopsisFactSheet(content, 'series')

    expect(fs.fields.find(f => f.id === 'series.characters.c1.name')).toMatchObject({ value: 'Mara', kind: 'name' })
    expect(fs.fields.find(f => f.id === 'series.characters.c1.role')?.value).toBe('Lead')
    expect(fs.fields.find(f => f.id === 'series.characters.c1.bio')?.value).toBe('A thief who never sleeps.')
    expect(fs.fields.find(f => f.id === 'series.characters.c1.arcPerSeason')?.value).toBe('Learns to trust; Leads the crew')
  })
})
