import { describe, expect, it } from 'vitest'
import { buildSynthesisPrompt, parseSynthesisResponse } from '../../server/ai/openaiService'
import { voiceProfileSynthesizeSchema } from '../../server/routes'

// ── schema validation (covers route 400 path) ───────────────────────────────

describe('voiceProfileSynthesizeSchema', () => {
  it('accepts a non-empty record of string → string', () => {
    expect(() =>
      voiceProfileSynthesizeSchema.parse({ answers: { q1: 'A character.', q2: 'Villeneuve.' } })
    ).not.toThrow()
  })

  it('rejects an empty answers object', () => {
    expect(() => voiceProfileSynthesizeSchema.parse({ answers: {} })).toThrow()
  })

  it('rejects answers with non-string values', () => {
    expect(() => voiceProfileSynthesizeSchema.parse({ answers: { q1: 42 } })).toThrow()
  })

  it('rejects missing answers field', () => {
    expect(() => voiceProfileSynthesizeSchema.parse({})).toThrow()
  })
})

// ── buildSynthesisPrompt ─────────────────────────────────────────────────────

describe('buildSynthesisPrompt', () => {
  it('includes answered question text in the prompt', () => {
    const prompt = buildSynthesisPrompt({ q1: 'A character.', q3: 'Started with a moral question.' })
    expect(prompt).toContain('First creative impulse')
    expect(prompt).toContain('A character.')
    expect(prompt).toContain('Started with a moral question.')
  })

  it('omits blank answers', () => {
    const prompt = buildSynthesisPrompt({ q1: 'Present.', q2: '   ' })
    expect(prompt).toContain('Present.')
    // blank answer for q2 should not appear
    expect(prompt.split('###').filter(s => s.includes('writers or directors')).length).toBe(0)
  })

  it('uses fallback label for unknown question ids', () => {
    const prompt = buildSynthesisPrompt({ custom_q: 'Something.' })
    expect(prompt).toContain('custom_q')
    expect(prompt).toContain('Something.')
  })

  it('includes the VoiceProfileDocument JSON shape in instructions', () => {
    const prompt = buildSynthesisPrompt({ q1: 'x' })
    expect(prompt).toContain('"archetype"')
    expect(prompt).toContain('"coreStatement"')
    expect(prompt).toContain('"storytellingDNA"')
  })
})

// ── parseSynthesisResponse ───────────────────────────────────────────────────

function makeValidRaw(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    archetype: 'Humanist Genre Pressure',
    coreStatement: 'I write intimate stories where big ideas corner people into moral choices.',
    creativeNorthStars: ['moral pressure', 'genre momentum'],
    storytellingDNA: { principles: ['emotion through action'], recurringThemes: ['identity'], notes: 'grounded' },
    influences: { writers: ['Le Guin'], directors: ['Villeneuve'], filmsAndShows: ['Arrival'], scenesAndLines: [], notes: '' },
    characterInstincts: { drawnTo: ['competent grief'], rejects: ['cynicism'], notes: '' },
    dialogue: { rules: ['subtext first'], instinctsByMode: 'spare when emotional', avoidances: ['generic banter'] },
    visualLanguage: { instincts: ['clean frames'], notes: 'restraint' },
    process: { whenFlowing: 'outline then discover', stuckPatterns: ['over-explaining'], supportNeeds: ['concrete choice'] },
    strengths: ['premise'],
    growthEdges: ['externalize conflict earlier'],
    collaborationPreferences: { always: ['be direct'], never: ['flatten weirdness'], feedbackStyle: 'candid' },
    alexCoachingNotes: ['protect momentum'],
    ...overrides,
  })
}

describe('parseSynthesisResponse', () => {
  it('returns a valid VoiceProfileDocument from well-formed JSON', () => {
    const doc = parseSynthesisResponse(makeValidRaw())
    expect(doc.version).toBe(1)
    expect(doc.archetype).toBe('Humanist Genre Pressure')
    expect(doc.coreStatement).toContain('intimate stories')
    expect(doc.storytellingDNA.principles).toEqual(['emotion through action'])
    expect(doc.influences.writers).toEqual(['Le Guin'])
    expect(doc.collaborationPreferences.feedbackStyle).toBe('candid')
  })

  it('sets updatedAt to now (not the model value)', () => {
    const before = Date.now()
    const doc = parseSynthesisResponse(makeValidRaw({ updatedAt: '2000-01-01T00:00:00.000Z' }))
    expect(new Date(doc.updatedAt).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('throws on invalid JSON (covers route 502 path)', () => {
    expect(() => parseSynthesisResponse('not json at all')).toThrow('invalid JSON')
  })

  it('throws when archetype is missing (covers route 502 path)', () => {
    expect(() => parseSynthesisResponse(makeValidRaw({ archetype: '' }))).toThrow('archetype')
  })

  it('throws when coreStatement is missing (covers route 502 path)', () => {
    expect(() => parseSynthesisResponse(makeValidRaw({ coreStatement: undefined }))).toThrow('coreStatement')
  })

  it('strips displayName when model omits it', () => {
    const doc = parseSynthesisResponse(makeValidRaw({ displayName: undefined }))
    expect(doc.displayName).toBeUndefined()
  })

  it('includes displayName when model supplies it', () => {
    const doc = parseSynthesisResponse(makeValidRaw({ displayName: 'Ben' }))
    expect(doc.displayName).toBe('Ben')
  })

  it('coerces non-array fields to empty arrays', () => {
    const doc = parseSynthesisResponse(makeValidRaw({
      creativeNorthStars: null,
      strengths: 'whoops',
    }))
    expect(doc.creativeNorthStars).toEqual([])
    expect(doc.strengths).toEqual([])
  })

  it('accepts fenced-JSON model output (```json ... ```)', () => {
    const inner = makeValidRaw()
    const fenced = `\`\`\`json\n${inner}\n\`\`\``
    const doc = parseSynthesisResponse(fenced)
    expect(doc.archetype).toBe('Humanist Genre Pressure')
  })
})
