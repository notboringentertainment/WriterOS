import { describe, expect, it } from 'vitest'
import { buildTreatmentFactSheet } from '../../../shared/compose/treatmentFactSheet'
import { createEmptyTreatmentContent } from '../../../shared/documents'

describe('buildTreatmentFactSheet', () => {
  it('drops empty fields, sorts by id, cleans whitespace, marks character name as a name', () => {
    const content = createEmptyTreatmentContent()
    content.logline = '  A drowned city refuses to die.  '
    content.concept.premise = 'The tide took the city; the city took something back.'
    content.prose.opening = 'A quiet morning above the tideline.'
    content.mainCharacters = [{
      id: 'c1', name: '  Mara  ', role: 'Lead', externalWant: 'Escape',
      internalNeed: '', flawOrWound: '', secretOrContradiction: '', arc: '', relationshipPressure: '',
    }]
    const fs = buildTreatmentFactSheet(content, 'feature')

    const ids = fs.fields.map(f => f.id)
    expect(fs.surface).toBe('treatment')
    expect(fs.format).toBe('feature')
    expect(ids).toEqual([...ids].sort())
    expect(fs.fields.find(f => f.id === 'logline')?.value).toBe('A drowned city refuses to die.')
    expect(fs.fields.find(f => f.id === 'concept.premise')?.value).toBe('The tide took the city; the city took something back.')
    expect(fs.fields.find(f => f.id === 'prose.opening')?.value).toBe('A quiet morning above the tideline.')
    expect(fs.fields.find(f => f.id === 'mainCharacters.c1.name')).toMatchObject({ value: 'Mara', kind: 'name' })
    expect(fs.fields.find(f => f.id === 'mainCharacters.c1.role')?.value).toBe('Lead')
    expect(fs.fields.find(f => f.id === 'mainCharacters.c1.externalWant')?.value).toBe('Escape')
    expect(fs.fields.some(f => f.id === 'mainCharacters.c1.internalNeed')).toBe(false)
    expect(fs.fields.some(f => f.id === 'concept.tone')).toBe(false)
  })

  it('emits all fixed fields when answered, including the seven visualAndTonal fields', () => {
    const content = createEmptyTreatmentContent()
    content.logline = 'L'
    content.concept = { premise: 'P', tone: 'T', theme: 'Th', emotionalPromise: 'E' }
    content.prose.opening = 'O'
    content.prose.actOne = 'A1'
    content.prose.actTwo = 'A2'
    content.prose.actThree = 'A3'
    content.visualAndTonal = {
      overallTone: 'VT1', visualWorld: 'VT2', recurringImagesOrMotifs: 'VT3',
      musicOrSoundFeeling: 'VT4', pacing: 'VT5', genreRules: 'VT6', compsAndReferences: 'VT7',
    }
    const fs = buildTreatmentFactSheet(content, 'feature')

    const ids = fs.fields.map(f => f.id)
    expect(ids).toEqual([
      'concept.emotionalPromise', 'concept.premise', 'concept.theme', 'concept.tone',
      'logline',
      'prose.actOne', 'prose.actThree', 'prose.actTwo', 'prose.opening',
      'visualAndTonal.compsAndReferences', 'visualAndTonal.genreRules',
      'visualAndTonal.musicOrSoundFeeling', 'visualAndTonal.overallTone',
      'visualAndTonal.pacing', 'visualAndTonal.recurringImagesOrMotifs',
      'visualAndTonal.visualWorld',
    ])
    expect(fs.fields.find(f => f.id === 'visualAndTonal.visualWorld')?.label).toBe('Visual world')
    expect(fs.fields.find(f => f.id === 'prose.actOne')?.label).toBe('Act one')
  })

  it('labels custom sections with their heading and drops empty-body sections', () => {
    const content = createEmptyTreatmentContent()
    content.prose.customSections = [
      { id: 'p1', heading: 'The Flood Night', body: 'The water rose without a sound.' },
      { id: 'p2', heading: 'Dropped', body: '   ' },
    ]
    const fs = buildTreatmentFactSheet(content, 'feature')

    expect(fs.fields.find(f => f.id === 'prose.customSections.p1.body')).toMatchObject({
      label: 'Story passage — The Flood Night',
      value: 'The water rose without a sound.',
      kind: 'prose',
    })
    expect(fs.fields.some(f => f.id === 'prose.customSections.p2.body')).toBe(false)
  })

  it('two custom sections with empty headings yield two distinct "Story passage" facts in stable order', () => {
    const content = createEmptyTreatmentContent()
    content.prose.customSections = [
      { id: 'p1', heading: '   ', body: 'First passage.' },
      { id: 'p2', heading: '', body: 'Second passage.' },
    ]
    const fs = buildTreatmentFactSheet(content, 'feature')

    const passages = fs.fields.filter(f => f.id.startsWith('prose.customSections.'))
    expect(passages.map(f => f.id)).toEqual(['prose.customSections.p1.body', 'prose.customSections.p2.body'])
    expect(passages[0]).toMatchObject({ label: 'Story passage', value: 'First passage.' })
    expect(passages[1]).toMatchObject({ label: 'Story passage', value: 'Second passage.' })
  })

  it('never emits openQuestions, aiProductionImplications, or header fields', () => {
    const content = createEmptyTreatmentContent()
    content.header.title = 'Tidewrack'
    content.header.genre = 'Thriller'
    content.openQuestions.story = ['Does the city want her back?']
    content.aiProductionImplications = {
      visualSequenceRisks: 'Flood sims', characterContinuityRisks: 'Wet hair',
      locationContinuityRisks: 'Waterline', vfxOrGenerationChallenges: 'Crowds',
      referenceAssetsNeeded: 'Maps',
    }
    content.logline = 'L'
    const fs = buildTreatmentFactSheet(content, 'feature')

    expect(fs.fields.some(f => f.id.startsWith('openQuestions'))).toBe(false)
    expect(fs.fields.some(f => f.id.startsWith('aiProductionImplications'))).toBe(false)
    expect(fs.fields.some(f => f.id.startsWith('header'))).toBe(false)
    expect(fs.fields.map(f => f.id)).toEqual(['logline'])
  })

  it('series format carries through to the fact sheet with identical field behavior', () => {
    const content = createEmptyTreatmentContent()
    content.logline = 'L'
    const fs = buildTreatmentFactSheet(content, 'series')
    expect(fs.format).toBe('series')
    expect(fs.fields.map(f => f.id)).toEqual(['logline'])
  })
})
