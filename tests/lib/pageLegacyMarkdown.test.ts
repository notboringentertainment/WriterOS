import { describe, expect, it } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { synopsisToMarkdown, treatmentToMarkdown } from '../../client/src/lib/documentMarkdown'
import { createEmptySeriesContent } from '../../shared/documents'

describe('legacy page rendering', () => {
  it('keeps every populated string, including series, headers and production notes', () => {
    const docs = defaultProjectState().documents
    docs.synopsis.content.series = {
      ...createEmptySeriesContent(),
      futureSeasons: [{ id: 'season-id', label: 'Next season', summary: 'A wider journey.' }],
      characters: [{ id: 'person-id', name: 'The Visitor', role: 'Lead', bio: 'A traveler.', arcPerSeason: ['Learns to stay.'] }],
    }
    docs.synopsis.content.aiProductionImplications = { visuallyImportantSequences: '', continuitySensitiveMoments: '', difficultWorldOrVfx: '', likelyReferenceImageNeeds: '' }
    docs.treatment.content.mainCharacters = [{ id: 'character-id', name: 'The Guide', role: '', externalWant: '', internalNeed: '', flawOrWound: '', secretOrContradiction: '', arc: '', relationshipPressure: '' }]
    docs.treatment.content.prose.customSections = [{ id: 'section-id', heading: 'Another movement', body: 'A new path.' }]
    let index = 0
    const fill = (value: unknown): unknown => typeof value === 'string' ? `Text ${++index}`
      : Array.isArray(value) ? value.map(fill)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, fill(child)])) : value
    const strings = (value: unknown): string[] => typeof value === 'string' ? [value]
      : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
    const synopsis = { ...docs.synopsis, content: fill(docs.synopsis.content) as typeof docs.synopsis.content }
    const treatment = { ...docs.treatment, content: fill(docs.treatment.content) as typeof docs.treatment.content }
    for (const text of strings(synopsis.content)) expect(synopsisToMarkdown(synopsis)).toContain(text)
    for (const text of strings(treatment.content)) expect(treatmentToMarkdown(treatment)).toContain(text)
  })
})
