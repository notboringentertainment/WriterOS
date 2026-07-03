import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { registerRoutes } from '../../server/routes'
import { OpenAIService } from '../../server/ai/openaiService'
import { defaultProjectState } from '../../client/src/lib/projectState'
import { buildProjectContext } from '../../client/src/lib/wpRouting'
import { createOutlineUnit } from '../../client/src/lib/outlineDeck'
import { rebuildScriptFactsCache } from '../../client/src/lib/scriptFacts'
import type { StoryMemory } from '../../shared/schema'

afterEach(() => {
  vi.restoreAllMocks()
})

async function startApp() {
  const app = express()
  app.use(express.json())
  const server = await registerRoutes(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return { server, port: address.port }
}

function postJson(port: number, path: string, body: unknown): Promise<{ status: number; json: any; text: string }> {
  const payload = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: res.statusCode ?? 0,
          text,
          json: text ? JSON.parse(text) : undefined,
        })
      })
    })

    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

describe('/api/wp-chat synopsis story-coach context', () => {
  it('sends Sam active Feature synopsis document content instead of stale header format', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.format = 'feature'
    state.documents.synopsis.content.header.format = 'series'
    state.documents.synopsis.content.logline.text = 'A medic exposes a rescue conspiracy before her brother vanishes.'
    state.documents.synopsis.content.prose.opening = 'A medic hears a missing patient on the emergency line.'
    state.documents.synopsis.content.prose.resolution = 'She exposes the network and saves her brother.'
    state.documents.synopsis.content.series = {
      seriesType: 'ongoing',
      episodeLength: 'hour',
      showOverview: 'Inactive show overview.',
      pilot: { logline: '', prose: '' },
      seasonOneArc: '',
      futureSeasons: [],
      characters: [],
      compsAndWhyThisShowNow: '',
    }

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Review the synopsis.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.project.format).toBe('feature')
      expect(storyMemory.project.logline).toBe('A medic exposes a rescue conspiracy before her brother vanishes.')
      expect(storyMemory.project.synopsis).toContain('Feature logline: A medic exposes')
      expect(storyMemory.project.synopsis).toContain('Opening: A medic hears a missing patient')
      expect(storyMemory.project.synopsis).toContain('Resolution: She exposes the network')
      expect(storyMemory.project.synopsis).not.toContain('Inactive show overview')
    } finally {
      server.close()
    }
  })

  it('sends Sam active Series synopsis document content when project format is Series', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.format = 'series'
    state.documents.synopsis.content.header.format = 'feature'
    state.documents.synopsis.content.prose.opening = 'Inactive feature prose.'
    state.synopsis.sections.setup = 'Legacy setup remains available.'
    state.documents.synopsis.content.series = {
      seriesType: 'limited',
      episodeLength: 'hour',
      showOverview: 'A renewable conflict in a sealed city.',
      pilot: {
        logline: 'A runner takes the wrong rescue call.',
        prose: 'The pilot traps the team inside the system they serve.',
      },
      seasonOneArc: 'The team learns the rescue network is choosing who lives.',
      futureSeasons: [{ id: 's2', label: 'Season 2', summary: 'The conspiracy moves outside the city.' }],
      characters: [{
        id: 'c1',
        name: 'Mara',
        role: 'Lead medic',
        bio: 'A disciplined medic with a personal stake.',
        arcPerSeason: ['Trusts no one'],
      }],
      compsAndWhyThisShowNow: 'Emergency procedural pressure with serialized civic paranoia.',
    }

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Review the series synopsis.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.project.format).toBe('series')
      expect(storyMemory.project.synopsis).toContain('Show Overview: A renewable conflict')
      expect(storyMemory.project.synopsis).toContain('Pilot logline: A runner takes the wrong rescue call.')
      expect(storyMemory.project.synopsis).toContain('Season One Arc: The team learns')
      expect(storyMemory.project.synopsis).toContain('Characters: Mara')
      expect(storyMemory.project.synopsis).not.toContain('Inactive feature prose')
      expect(storyMemory.project.synopsisSections?.setup).toBe('Legacy setup remains available.')
    } finally {
      server.close()
    }
  })

  it('sends Alex authored Treatment document content', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Alex response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.documents.treatment.content.logline = 'A medic hears impossible rescue calls.'
    state.documents.treatment.content.concept.premise = 'A city chooses who gets saved.'
    state.documents.treatment.content.prose.opening = 'Sara ends a night shift as the silent emergency line rings.'
    state.documents.treatment.content.visualAndTonal.musicOrSoundFeeling = 'Emergency line static over a warm synth pulse.'
    state.documents.treatment.content.openQuestions.production = ['Can the impossible calls be represented without expensive VFX?']

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'alex',
        message: 'Am I ready to draft?',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.project.treatment).toContain('Treatment logline: A medic hears impossible rescue calls.')
      expect(storyMemory.project.treatment).toContain('Premise: A city chooses who gets saved.')
      expect(storyMemory.project.treatment).toContain('Opening: Sara ends a night shift')
      expect(storyMemory.project.treatment).toContain('Music or sound feeling: Emergency line static')
      expect(storyMemory.project.treatment).toContain('Open production questions: Can the impossible calls')
    } finally {
      server.close()
    }
  })

  it('sends Casey character details from Treatment plus actual Outline content', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Casey response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.title = 'Lifeline'
    state.meta.format = 'series'
    state.documents.treatment.content.mainCharacters = [{
      id: 'isaiah',
      name: 'Isaiah',
      role: 'Emergency dispatcher',
      externalWant: 'Keep control of every rescue call.',
      internalNeed: 'Admit he cannot save everyone.',
      flawOrWound: 'He treats every missed call as a personal failure.',
      secretOrContradiction: '',
      arc: 'Learns to trust the team before the line consumes him.',
      relationshipPressure: 'Dante pushes him to stop playing martyr.',
    }]
    state.documents.treatment.content.prose.opening =
      'Isaiah stays after his shift because silence feels like betrayal.'
    const unit = createOutlineUnit('feature.openingNormalWorld')
    unit.whatHappens = 'Isaiah answers a rescue call that should not be possible.'
    unit.turn = 'The voice knows his private grief.'
    unit.characters = ['Isaiah']
    state.documents.outline.content.units = [unit]

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'casey',
        message: 'What does Isaiah need?',
        projectContext: buildProjectContext(state, 'What does Isaiah need?'),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      const isaiah = storyMemory.characters.isaiah
      expect(isaiah.name).toBe('Isaiah')
      expect(isaiah.motivation).toContain('need: Admit he cannot save everyone.')
      expect(isaiah.backstory).toContain('flaw/wound: He treats every missed call')
      expect(isaiah.backstory).toContain('relationship pressure: Dante pushes him')
      expect(storyMemory.project.treatment).toContain('Character: Isaiah')
      expect(storyMemory.project.treatment).toContain('Opening: Isaiah stays after his shift')
      expect(storyMemory.outline.beats[0].description).toContain('Isaiah answers a rescue call')
      expect(storyMemory.outline.beats[0].description).toContain('The voice knows his private grief')
    } finally {
      server.close()
    }
  })

  it('passes a Surface Awareness Contract through to StoryMemory when present', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.format = 'feature'
    const surface = {
      kind: 'intake' as const,
      surface: 'outline' as const,
      surfaceTitle: 'Outline',
      format: 'feature' as const,
      questions: [{ id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' as const }],
      nextQuestion: { id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' as const },
      selectionSource: 'first_unanswered' as const,
      answeredCount: 0,
      totalCount: 1,
      nextRecommendedAction: 'answer_next_question' as const,
    }

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: "What's the first question here?",
        projectContext: { ...buildProjectContext(state), surface },
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.surface).toEqual(surface)
    } finally {
      server.close()
    }
  })

  it('passes a valid location through to StoryMemory', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    const location = {
      activeSurface: 'script' as const,
      sourceKind: 'selected_text' as const,
      provenance: 'confirmed' as const,
      anchor: { kind: 'block' as const, stableId: 'block:1', label: 'a selected line' },
    }

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: "What's selected?",
        projectContext: { ...buildProjectContext(state), location },
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.location).toEqual(location)
    } finally {
      server.close()
    }
  })

  it('degrades a malformed location to undefined instead of failing the request', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: "What's selected?",
        projectContext: {
          ...buildProjectContext(state),
          location: { activeSurface: 'script', sourceKind: 'confirmed' },
        },
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.location).toBeUndefined()
    } finally {
      server.close()
    }
  })

  it('routes a Writer’s Room specialist (zoe) with surface to a 200, surface intact', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Zoe response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.meta.format = 'feature'
    const surface = {
      kind: 'intake' as const,
      surface: 'outline' as const,
      surfaceTitle: 'Outline',
      format: 'feature' as const,
      questions: [{ id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' as const }],
      nextQuestion: { id: 'spine.protagonist', label: 'Who are we following?', helper: 'Name the lead.', status: 'unanswered' as const },
      selectionSource: 'first_unanswered' as const,
      answeredCount: 0,
      totalCount: 1,
      nextRecommendedAction: 'answer_next_question' as const,
    }
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/wp-chat', {
        personaId: 'zoe',
        message: "What's the first question here?",
        projectContext: { ...buildProjectContext(state), surface },
        conversationHistory: [],
      })
      expect(res.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.surface).toEqual(surface)
    } finally {
      server.close()
    }
  })

  it('NEVER 500s on a malformed surface — degrades to no surface so chat still works', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    // totalCount disagrees with questions.length — exactly the kind of payload that must
    // not take down the whole chat (symptom 2: connection error from a 500).
    const badSurface = {
      kind: 'intake', surface: 'outline', surfaceTitle: 'Outline', format: 'feature',
      questions: [], nextQuestion: null, selectionSource: 'first_unanswered',
      answeredCount: 9, totalCount: 9, nextRecommendedAction: 'answer_next_question',
    }
    const { server, port } = await startApp()
    try {
      const res = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Review the synopsis.',
        projectContext: { ...buildProjectContext(state), surface: badSurface },
        conversationHistory: [],
      })
      expect(res.status).toBe(200) // chat works
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.surface).toBeUndefined() // malformed surface dropped, not fatal
    } finally {
      server.close()
    }
  })

  it('leaves StoryMemory.surface undefined when no surface is sent', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    const { server, port } = await startApp()
    try {
      await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Review the synopsis.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.surface).toBeUndefined()
    } finally {
      server.close()
    }
  })

  it('sends current Script Facts through Writer Room specialist context', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Maya response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    state.script.rawHtml = [
      '<p data-element-type="scene-heading">INT. SAFEHOUSE - NIGHT</p>',
      '<p data-element-type="character">ISAIAH</p>',
      '<p data-element-type="dialogue">I can still hear it.</p>',
    ].join('')
    state.script.facts = rebuildScriptFactsCache(state.script.rawHtml, '2026-06-02T10:00:00.000Z')

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'maya',
        message: 'Help with this dialogue.',
        projectContext: buildProjectContext(state, 'Help with this dialogue.'),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      const storyMemory = generateSpy.mock.calls[0][3] as StoryMemory
      expect(storyMemory.script?.facts).toEqual({
        rebuiltAt: '2026-06-02T10:00:00.000Z',
        characters: [{ label: 'ISAIAH', count: 1 }],
        locations: [{ label: 'INT. SAFEHOUSE - NIGHT', count: 1 }],
        times: [{ label: 'NIGHT', count: 1 }],
      })
    } finally {
      server.close()
    }
  })
})

describe('/api/wp-chat voice profile pass-through', () => {
  function completedVoiceProfile() {
    return {
      version: 1,
      createdAt: '2026-06-14T00:00:00.000Z',
      updatedAt: '2026-06-14T00:00:00.000Z',
      displayName: 'Ben',
      archetype: 'The Moral-Complexity Dramatist',
      coreStatement: 'Elevated genre with a conscience.',
      creativeNorthStars: ['Earn every beat'],
      storytellingDNA: { principles: ['No filler'], recurringThemes: ['loyalty'], notes: '' },
      influences: { writers: [], directors: [], filmsAndShows: [], scenesAndLines: [], notes: 'Sheridan' },
      characterInstincts: { drawnTo: [], rejects: [], notes: '' },
      dialogue: { rules: [], instinctsByMode: '', avoidances: [] },
      visualLanguage: { instincts: ['negative space'], notes: '' },
      process: { whenFlowing: '', stuckPatterns: [], supportNeeds: [] },
      strengths: [],
      growthEdges: [],
      collaborationPreferences: { always: [], never: [], feedbackStyle: 'blunt' },
      alexCoachingNotes: [],
    }
  }

  it('forwards a completed voiceProfile as the 6th generatePersonaResponse argument', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()
    const profile = completedVoiceProfile()

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Help me.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
        voiceProfile: profile,
      })

      expect(response.status).toBe(200)
      expect(generateSpy.mock.calls[0][5]).toEqual(profile)
    } finally {
      server.close()
    }
  })

  it('degrades a malformed voiceProfile to undefined and still returns 200', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Help me.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
        voiceProfile: { version: 1, archetype: 42 }, // malformed
      })

      expect(response.status).toBe(200)
      expect(generateSpy.mock.calls[0][5]).toBeUndefined()
    } finally {
      server.close()
    }
  })

  it('passes undefined when no voiceProfile is sent', async () => {
    const generateSpy = vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Sam response.',
      suggestions: [],
    })
    const state = defaultProjectState()

    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'sam',
        message: 'Help me.',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })

      expect(response.status).toBe(200)
      expect(generateSpy.mock.calls[0][5]).toBeUndefined()
    } finally {
      server.close()
    }
  })
})

describe('/api/wp-chat debug metadata gating (Slice 2)', () => {
  const sampleDebug = {
    runId: 'morgan_test',
    consults: [{ specialistId: 'casey', question: 'Ace?', status: 'ok' as const, durationMs: 12 }],
    guardrails: [{ name: 'specialist_attribution', status: 'passed' as const }],
  }

  afterEach(() => {
    delete process.env.MORGAN_DEBUG_API
  })

  it('omits debug from the response by default (flag off), keeping the contract { message, suggestions }', async () => {
    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Morgan response.',
      suggestions: [],
      debug: sampleDebug,
    })
    const state = defaultProjectState()
    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'writingPartner',
        message: 'Hi Morgan',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })
      expect(response.status).toBe(200)
      expect(response.json.message).toBe('Morgan response.')
      expect(response.json.debug).toBeUndefined()
    } finally {
      server.close()
    }
  })

  it('includes debug when MORGAN_DEBUG_API=on', async () => {
    process.env.MORGAN_DEBUG_API = 'on'
    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Morgan response.',
      suggestions: [],
      debug: sampleDebug,
    })
    const state = defaultProjectState()
    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/wp-chat', {
        personaId: 'writingPartner',
        message: 'Hi Morgan',
        projectContext: buildProjectContext(state),
        conversationHistory: [],
      })
      expect(response.status).toBe(200)
      expect(response.json.debug).toEqual(sampleDebug)
    } finally {
      server.close()
    }
  })
})

describe('/api/chat debug metadata gating (Slice 2)', () => {
  const sampleDebug = {
    runId: 'morgan_test',
    consults: [{ specialistId: 'casey', question: 'Ace?', status: 'ok' as const, durationMs: 12 }],
    guardrails: [{ name: 'specialist_attribution', status: 'passed' as const }],
  }
  const profile = {
    entryState: 'idea_only' as const,
    existingWork: [],
    immediateNeed: 'help',
    feedbackStyle: 'direct' as const,
    writerName: 'Ben',
  }
  const chatPayload = {
    personaId: 'writingPartner',
    message: 'Hi Morgan',
    userProfile: profile,
    storyMemory: {
      project: {},
      characters: {},
      outline: { acts: 3, beats: [] },
      worldRules: {},
      dialogue: {},
      userProfile: profile,
      decisions: [],
    },
    conversationHistory: [],
  }

  afterEach(() => {
    delete process.env.MORGAN_DEBUG_API
  })

  it('omits debug from /api/chat by default, even for the Morgan persona', async () => {
    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Morgan response.',
      suggestions: [],
      debug: sampleDebug,
    })
    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/chat', chatPayload)
      expect(response.status).toBe(200)
      expect(response.json.message).toBe('Morgan response.')
      expect(response.json.debug).toBeUndefined()
    } finally {
      server.close()
    }
  })

  it('includes debug on /api/chat when MORGAN_DEBUG_API=on', async () => {
    process.env.MORGAN_DEBUG_API = 'on'
    vi.spyOn(OpenAIService.prototype, 'generatePersonaResponse').mockResolvedValue({
      message: 'Morgan response.',
      suggestions: [],
      debug: sampleDebug,
    })
    const { server, port } = await startApp()
    try {
      const response = await postJson(port, '/api/chat', chatPayload)
      expect(response.status).toBe(200)
      expect(response.json.debug).toEqual(sampleDebug)
    } finally {
      server.close()
    }
  })
})
