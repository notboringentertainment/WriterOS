import { describe, expect, it } from 'vitest'
import { createEmptyDocuments, createEmptySeriesContent } from '../../shared/documents'
import {
  PITCH_PACKET_VERSION,
  PitchPacketSchema,
  composePitchPacket,
  validatePitchPacketForApproval,
} from '../../shared/pitchPacket'

function fixture() {
  const documents = createEmptyDocuments(() => '2026-07-14T00:00:00.000Z')
  documents.synopsis.content.header = { ...documents.synopsis.content.header, title: 'Synopsis title', format: 'Feature', genre: 'Drama', comps: ['Arrival'] }
  documents.synopsis.content.logline.text = 'A chef must save her family restaurant.'
  documents.treatment.content.header = { ...documents.treatment.content.header, title: 'Treatment title', format: 'Limited series', genre: 'Thriller' }
  documents.treatment.content.logline = 'A different treatment logline.'
  documents.treatment.content.concept = { ...documents.treatment.content.concept, premise: 'Treatment premise', tone: 'Tender dread' }
  documents.treatment.content.visualAndTonal.compsAndReferences = 'Arrival, The Bear'
  documents.treatment.content.openQuestions.story = ['Who buys the restaurant?']
  documents.storyBible.content.premiseAndWorld.premise = 'A homecoming tests whether inheritance is love or debt.'
  documents.storyBible.content.characters = [{
    id: 'mara', name: 'Mara', role: 'protagonist', want: 'Save the restaurant', need: 'Accept help', flaw: 'Pride', secret: 'She caused the fire', contradiction: 'Protective but withholding', arc: 'Learns to stay', relationshipPressure: '', behavioralAnchors: '', speechPatterns: '', neverWriteThemAs: '', continuityFacts: '',
  }]
  documents.storyBible.content.locks = [{ id: 'l1', statement: 'No time travel.', scope: 'story', rationale: 'Grounded drama', source: 'writer', status: 'active', createdAt: '2026-07-01T00:00:00Z' }]
  return {
    projectId: 'p1', sessionId: 's1', projectTitle: 'Project title', documents,
    activeMeetingDirection: [
      { id: 'd1', statement: 'Never become a spoof.', mutability: 'locked' as const, originMarker: '[SEED]' as const, fieldPath: 'story_locks', area: 'locks' },
      { id: 'd2', statement: 'Who buys the restaurant?', mutability: 'open' as const, originMarker: '[EXTRAPOLATED]' as const, fieldPath: 'open_questions', area: 'open_questions' },
    ],
    storyLocks: '## Surface-declared locks\nNone declared.\n\n## Meeting locks\n[SEED] Never become a spoof.',
    openQuestions: '- Who buys the restaurant?', directionRevision: 3,
    exportedAt: '2026-07-14T12:00:00.000Z',
  }
}

describe('Pitch Packet contract and composer', () => {
  it('parses version 1 and uses deterministic scalar precedence with visible conflicts', () => {
    const packet = composePitchPacket(fixture())
    expect(PitchPacketSchema.parse(packet).packetVersion).toBe(PITCH_PACKET_VERSION)
    expect(packet.title).toMatchObject({ value: 'Synopsis title', origin: 'document', conflict: true, approved: false })
    expect(packet.title.candidates?.map(candidate => candidate.value)).toEqual(['Synopsis title', 'Treatment title', 'Project title'])
    expect(packet.logline.candidates?.map(candidate => candidate.value)).toEqual(['A chef must save her family restaurant.', 'A different treatment logline.'])
    expect(packet.premise.value).toBe('A homecoming tests whether inheritance is love or debt.')
    expect(packet.tone.value).toBe('Tender dread')
  })

  it('maps core characters and unions list sources with exact-text dedupe and provenance', () => {
    const packet = composePitchPacket(fixture())
    expect(packet.coreCharacters.value[0]).toMatchObject({ name: 'Mara', flawOrWound: 'Pride', secretOrContradiction: 'She caused the fire / Protective but withholding' })
    expect(packet.locks.value.map(item => item.statement)).toEqual(['Never become a spoof.', 'No time travel.'])
    expect(packet.openQuestions.value.map(item => item.text)).toEqual(['Who buys the restaurant?'])
    expect(packet.comps?.value).toEqual(['Arrival', 'The Bear'])
    expect(packet.locks.sourceRef).toContain('meeting_decisions')
  })

  it('applies writer overrides before approved proposals and leaves proposals unapproved when not selected', () => {
    const input = fixture()
    const withProposal = composePitchPacket({ ...input, approvedProposalOverrides: { storyEngine: { value: 'A weekly moral tradeoff.', sourceRef: 'proposal:storyEngine' } } })
    expect(withProposal.storyEngine).toMatchObject({ value: 'A weekly moral tradeoff.', origin: 'ai_proposed', approved: true })
    const withWriter = composePitchPacket({ ...input, approvedProposalOverrides: { storyEngine: { value: 'AI engine' } }, writerOverrides: { storyEngine: { value: 'Writer engine' } } })
    expect(withWriter.storyEngine).toMatchObject({ value: 'Writer engine', origin: 'writer', approved: true })
  })

  it('falls through the complete default scalar and structured-character chains', () => {
    const input = fixture()
    input.documents.synopsis.content.header.title = ''
    input.documents.treatment.content.header.title = ''
    input.documents.storyBible.content.cover.title = 'Bible title'
    input.documents.synopsis.content.logline.text = ''
    input.documents.synopsis.content.header.format = ''
    input.documents.synopsis.content.header.genre = ''
    input.documents.treatment.content.concept.tone = ''
    input.documents.storyBible.content.toneAndStyle.toneWords = ['Wry', 'Intimate']
    input.documents.storyBible.content.premiseAndWorld.premise = ''
    input.documents.storyBible.content.characters = []
    const series = createEmptySeriesContent()
    series.characters = [{ id: 'ace', name: 'Ace', role: 'handler', bio: 'Control is her wound.', arcPerSeason: ['Learns to trust'] }]
    input.documents.synopsis.content.series = series
    const packet = composePitchPacket(input)
    expect(packet.title.value).toBe('Bible title')
    expect(packet.logline.value).toBe('A different treatment logline.')
    expect(packet.format.value).toBe('Limited series')
    expect(packet.genre.value).toBe('Thriller')
    expect(packet.tone.value).toBe('Wry, Intimate')
    expect(packet.premise.value).toBe('Treatment premise')
    expect(packet.coreCharacters.value[0]).toMatchObject({ name: 'Ace', flawOrWound: 'Control is her wound.', arc: 'Learns to trust' })
  })

  it('writer selection resolves a scalar conflict and a fully reviewed packet can be approved', () => {
    const input = fixture()
    const first = composePitchPacket(input)
    const writerOverrides = {
      title: { value: first.title.value }, logline: { value: first.logline.value }, format: { value: first.format.value },
      genre: { value: first.genre.value }, tone: { value: first.tone.value }, premise: { value: first.premise.value },
      storyEngine: { value: 'Every rescue exposes a deeper family debt.' }, coreCharacters: { value: first.coreCharacters.value },
      locks: { value: first.locks.value }, openQuestions: { value: first.openQuestions.value },
    }
    const reviewed = composePitchPacket({ ...input, writerOverrides })
    expect(reviewed.title).toMatchObject({ origin: 'writer', approved: true })
    expect(reviewed.title.conflict).toBeUndefined()
    expect(validatePitchPacketForApproval(reviewed)).toEqual({ ok: true, errors: [] })
  })

  it('blocks approval for empty, unapproved, or conflicted required fields', () => {
    const validation = validatePitchPacketForApproval(composePitchPacket(fixture()))
    expect(validation.ok).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([expect.stringContaining('title'), expect.stringContaining('storyEngine')]))
  })

  it('rejects unknown packet versions and non-ISO export timestamps', () => {
    const packet = composePitchPacket(fixture())
    expect(PitchPacketSchema.safeParse({ ...packet, packetVersion: 2 }).success).toBe(false)
    expect(PitchPacketSchema.safeParse({ ...packet, exportedAt: 'July 14' }).success).toBe(false)
  })
})
