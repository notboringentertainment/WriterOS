import { describe, expect, it } from 'vitest'
import { buildOutlineFactSheet } from '../../../shared/compose/factSheet'
import { createEmptyOutlineContent } from '../../../shared/documents'

describe('buildOutlineFactSheet', () => {
  it('drops empty fields and sorts by id', () => {
    const content = createEmptyOutlineContent()
    content.spine.protagonist = '  Mara  '
    content.spine.centralOpposition = 'The Syndicate'
    const fs = buildOutlineFactSheet(content, 'feature')
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
    const fs = buildOutlineFactSheet(content, 'feature')
    expect(fs.fields.find(f => f.id === 'feature.midpoint.whatHappens')?.value).toBe('The plan collapses.')
  })
  it('emits episode fields for series', () => {
    const content = createEmptyOutlineContent()
    content.episodes = [{ id: 'episode-1', number: 1, label: 'Episode 1', title: '', hookLogline: 'A body is found.', aStory: '', bcStory: '', changeByEnd: '', endingHook: '' }]
    const fs = buildOutlineFactSheet(content, 'series')
    expect(fs.fields.find(f => f.id === 'episodes.1.hookLogline')?.value).toBe('A body is found.')
  })
})
