import { describe, it, expect } from 'vitest'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { documentsToLegacy, legacyToDocuments } from '../../client/src/lib/documentMigration'

const FIXED_TS = '2026-05-15T00:00:00.000Z'
const now = () => FIXED_TS

describe('legacyToDocuments — synopsis', () => {
  it('maps legacy logline to documents.synopsis.content.logline.text', () => {
    const legacy = defaultProjectState()
    legacy.synopsis.logline = 'A widow returns home.'
    const docs = legacyToDocuments(legacy, now)
    expect(docs.synopsis.content.logline.text).toBe('A widow returns home.')
  })

  it('maps legacy sections to prose paragraphs in fixed order', () => {
    const legacy = defaultProjectState()
    legacy.synopsis.sections.setup = 'OPENING'
    legacy.synopsis.sections.act1Break = 'ESCALATION'
    legacy.synopsis.sections.midpoint = 'MIDDLE'
    legacy.synopsis.sections.act2Break = 'CLIMAX'
    legacy.synopsis.sections.resolution = 'RESOLUTION'
    const docs = legacyToDocuments(legacy, now)
    expect(docs.synopsis.content.prose).toEqual({
      opening: 'OPENING',
      escalation: 'ESCALATION',
      middle: 'MIDDLE',
      climax: 'CLIMAX',
      resolution: 'RESOLUTION',
    })
  })

  it('stamps updatedAt from the now() argument', () => {
    const legacy = defaultProjectState()
    expect(legacyToDocuments(legacy, now).synopsis.updatedAt).toBe(FIXED_TS)
  })
})

describe('legacyToDocuments — outline', () => {
  it('preserves beat type as outline mode', () => {
    const legacy = defaultProjectState()
    const docs = legacyToDocuments(legacy, now)
    expect(docs.outline.mode).toBe('beat_sheet_save_the_cat')
    expect(docs.outline.content.mode).toBe('beat_sheet_save_the_cat')
  })

  it('maps every legacy beat into an outline unit by id', () => {
    const legacy = defaultProjectState()
    legacy.outline.beats[0].notes = 'Hook in the cold open.'
    legacy.outline.beats[0].linkedSceneIds = ['scene-1']
    const docs = legacyToDocuments(legacy, now)
    const first = docs.outline.content.units[0]
    expect(first.id).toBe(legacy.outline.beats[0].id)
    expect(first.title).toBe(legacy.outline.beats[0].name)
    expect(first.whatHappens).toBe(legacy.outline.beats[0].description)
    expect(first.draftNotes).toBe('Hook in the cold open.')
    expect(first.linkedSceneIds).toEqual(['scene-1'])
    expect(first.number).toBe(1)
  })
})

describe('legacyToDocuments — storyBible', () => {
  it('maps legacy world fields to premiseAndWorld and toneAndStyle', () => {
    const legacy = defaultProjectState()
    legacy.storyBible.world.setting = 'A sealed city'
    legacy.storyBible.world.toneAnchors = 'Chinatown meets Nope'
    legacy.storyBible.world.voiceNotes = 'Spare and cold'
    legacy.storyBible.themes = 'Mercy under pressure'
    legacy.storyBible.rules = 'No one leaves after sunset'
    const docs = legacyToDocuments(legacy, now)
    expect(docs.storyBible.content.premiseAndWorld.premise).toBe('A sealed city')
    expect(docs.storyBible.content.premiseAndWorld.worldRules).toBe('No one leaves after sunset')
    expect(docs.storyBible.content.toneAndStyle.comps).toEqual(['Chinatown meets Nope'])
    expect(docs.storyBible.content.toneAndStyle.dialogueStyle).toBe('Spare and cold')
    expect(docs.storyBible.content.onePagePitch.whyThisMatters).toBe('Mercy under pressure')
  })

  it('maps each legacy character into a story bible character', () => {
    const legacy = defaultProjectState()
    legacy.storyBible.characters.push({
      id: 'c1',
      name: 'Sara',
      role: 'Protagonist',
      wound: 'killed her sister',
      want: 'home',
      need: 'forgive herself',
      arc: 'guilt -> mercy',
    })
    const docs = legacyToDocuments(legacy, now)
    const c = docs.storyBible.content.characters[0]
    expect(c.id).toBe('c1')
    expect(c.name).toBe('Sara')
    expect(c.role).toBe('Protagonist')
    expect(c.want).toBe('home')
    expect(c.need).toBe('forgive herself')
    expect(c.arc).toBe('guilt -> mercy')
    expect(c.flaw).toBe('killed her sister')
  })
})

describe('legacyToDocuments — treatment', () => {
  it('returns an empty treatment document (no legacy source)', () => {
    const legacy = defaultProjectState()
    const docs = legacyToDocuments(legacy, now)
    expect(docs.treatment.content.logline).toBe('')
    expect(docs.treatment.content.prose.opening).toBe('')
  })
})

describe('documentsToLegacy round-trip', () => {
  it('synopsis: legacy -> documents -> legacy preserves logline and all five sections', () => {
    const original = defaultProjectState()
    original.synopsis.logline = 'A widow returns home.'
    original.synopsis.sections.setup = 'OPENING'
    original.synopsis.sections.act1Break = 'ESCALATION'
    original.synopsis.sections.midpoint = 'MIDDLE'
    original.synopsis.sections.act2Break = 'CLIMAX'
    original.synopsis.sections.resolution = 'RESOLUTION'

    const docs = legacyToDocuments(original, now)
    const reverted = documentsToLegacy(docs)
    expect(reverted.synopsis).toEqual(original.synopsis)
  })

  it('outline: legacy -> documents -> legacy preserves beat ids, notes, and links', () => {
    const original = defaultProjectState()
    original.outline.beats[0].notes = 'Hook the audience.'
    original.outline.beats[0].linkedSceneIds = ['scene-1']

    const docs = legacyToDocuments(original, now)
    const reverted = documentsToLegacy(docs)
    expect(reverted.outline.beatType).toBe(original.outline.beatType)
    expect(reverted.outline.beats.map(b => b.id)).toEqual(original.outline.beats.map(b => b.id))
    expect(reverted.outline.beats[0].notes).toBe('Hook the audience.')
    expect(reverted.outline.beats[0].linkedSceneIds).toEqual(['scene-1'])
  })

  it('storyBible: legacy -> documents -> legacy preserves characters, world, themes, rules', () => {
    const original = defaultProjectState()
    original.storyBible.world.setting = 'A sealed city'
    original.storyBible.world.toneAnchors = 'Chinatown meets Nope'
    original.storyBible.world.voiceNotes = 'Spare and cold'
    original.storyBible.themes = 'Mercy under pressure'
    original.storyBible.rules = 'No one leaves after sunset'
    original.storyBible.characters.push({
      id: 'c1',
      name: 'Sara',
      role: 'Protagonist',
      wound: 'guilt',
      want: 'home',
      need: 'forgive',
      arc: 'guilt -> mercy',
    })

    const docs = legacyToDocuments(original, now)
    const reverted = documentsToLegacy(docs)
    expect(reverted.storyBible).toEqual(original.storyBible)
  })
})
