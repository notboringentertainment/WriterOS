import { describe, expect, it } from 'vitest'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { createEmptyOutlineContent } from '../../../shared/documents'
import { createOutlineUnit } from '../../../client/src/lib/outlineDeck'
import { resolveFeatureRoleUnitIds } from '../../../shared/featureRoleBindings'

describe('buildOutlineFactSheet', () => {
  it('drops empty fields and sorts by id', () => {
    const content = createEmptyOutlineContent()
    content.spine.protagonist = '  Mara  '
    content.spine.centralOpposition = 'The Syndicate'
    const fs = buildOutlineFactSheet(content, 'feature', resolveFeatureRoleUnitIds(content))
    const ids = fs.fields.map(f => f.id)
    expect(ids).toEqual([...ids].sort())
    expect(fs.fields.find(f => f.id === 'spine.protagonist')).toMatchObject({ value: 'Mara', kind: 'name' })
    expect(fs.fields.some(f => f.id === 'spine.theme')).toBe(false)
  })
  it('emits unit fields with composite ids', () => {
    const content = createEmptyOutlineContent()
    // createEmptyOutlineContent seeds units: [] — push the unit stub before accessing it
    content.units.push({
      id: 'feature.midpoint',
      number: 5,
      actOrSequence: 'Act II',
      title: 'Midpoint',
      location: '',
      characters: [],
      whatHappens: '',
      conflict: '',
      turn: '',
      consequence: '',
      whyNext: '',
      linkedSceneIds: [],
      draftNotes: '',
    })
    const unit = content.units.find(u => u.id === 'feature.midpoint')!
    unit.whatHappens = 'The plan collapses.'
    const fs = buildOutlineFactSheet(content, 'feature', resolveFeatureRoleUnitIds(content))
    expect(fs.fields.find(f => f.id === 'feature.midpoint.whatHappens')?.value).toBe('The plan collapses.')
  })
  it('emits episode fields for series', () => {
    const content = createEmptyOutlineContent()
    content.episodes = [{ id: 'episode-1', number: 1, label: 'Episode 1', title: '', hookLogline: 'A body is found.', aStory: '', bcStory: '', changeByEnd: '', endingHook: '' }]
    const fs = buildOutlineFactSheet(content, 'series', undefined)
    expect(fs.fields.find(f => f.id === 'episodes.1.hookLogline')?.value).toBe('A body is found.')
  })

  it('excludes unbound feature units but includes explicitly mapped units', () => {
    const content = {
      ...createEmptyOutlineContent(),
      units: [{ ...createOutlineUnit('feature.beat08'), whatHappens: 'A reversal.' }],
    }
    const unbound = buildOutlineFactSheet(content, 'feature', resolveFeatureRoleUnitIds(content))
    expect(unbound.fields).toEqual([])

    const mapped = { ...content, featureRoleUnitIds: { midpoint: 'feature.beat08' } }
    const bound = buildOutlineFactSheet(mapped, 'feature', resolveFeatureRoleUnitIds(mapped))
    expect(bound.fields.map(field => field.id)).toEqual(['feature.beat08.whatHappens'])
  })

  it('preserves the old no-map scaffold fact sheet for actTwoA', () => {
    const content = {
      ...createEmptyOutlineContent(),
      units: [{ ...createOutlineUnit('feature.actTwoA'), whatHappens: 'The chase begins.' }],
    }
    const oldScaffold = buildOutlineFactSheet(content, 'feature', resolveFeatureRoleUnitIds(content))
    expect(oldScaffold.fields.map(field => field.id)).toContain('feature.actTwoA.whatHappens')

    const explicitMap = { ...content, featureRoleUnitIds: {} }
    const mapped = buildOutlineFactSheet(explicitMap, 'feature', resolveFeatureRoleUnitIds(explicitMap))
    expect(mapped.fields).toEqual([])
  })
})
