import { describe, it, expect } from 'vitest'
import {
  FEATURE_SYNOPSIS_DECK,
  SERIES_SYNOPSIS_DECK,
  buildSynopsisPatch,
  getDeckForFormat,
  getMappingPaths,
  isComposite,
  resolveSynopsisPath,
  synopsisProbeContent,
  type SynopsisPromptDef,
} from '../../client/src/lib/synopsisDeck'
import {
  FEATURE_READINESS_CHECKS,
  deriveSeriesReadiness,
} from '../../client/src/lib/synopsisReadiness'
import {
  createEmptySeriesContent,
  createEmptySynopsisContent,
  SynopsisQaSchema,
} from '../../shared/documents'

const EXPECTED_FEATURE_IDS = [
  'feature-title',
  'feature-writer',
  'feature-genre-runtime',
  'feature-comps',
  'feature-logline',
  'feature-protagonist',
  'feature-goal',
  'feature-obstacle',
  'feature-stakes',
  'feature-hook',
  'feature-opening',
  'feature-escalation',
  'feature-middle',
  'feature-climax',
  'feature-resolution',
] as const

const EXPECTED_SERIES_IDS = [
  'series-title',
  'series-writer',
  'series-genre-type-length',
  'series-logline',
  'series-show-overview',
  'series-pilot-logline',
  'series-pilot-prose',
  'series-season-arc',
  'series-future-seasons',
  'series-characters',
  'series-comps-why-now',
] as const

describe('FEATURE_SYNOPSIS_DECK', () => {
  it('contains all V1 prompt IDs in fixed order', () => {
    expect(FEATURE_SYNOPSIS_DECK.map((p) => p.id)).toEqual([...EXPECTED_FEATURE_IDS])
  })

  it('marks every prompt as deck "feature"', () => {
    for (const p of FEATURE_SYNOPSIS_DECK) {
      expect(p.deck).toBe('feature')
    }
  })
})

describe('SERIES_SYNOPSIS_DECK', () => {
  it('contains all V1 prompt IDs in fixed order', () => {
    expect(SERIES_SYNOPSIS_DECK.map((p) => p.id)).toEqual([...EXPECTED_SERIES_IDS])
  })

  it('marks every prompt as deck "series"', () => {
    for (const p of SERIES_SYNOPSIS_DECK) {
      expect(p.deck).toBe('series')
    }
  })
})

describe('prompt input structure', () => {
  const ALL_PROMPTS: readonly SynopsisPromptDef[] = [
    ...FEATURE_SYNOPSIS_DECK,
    ...SERIES_SYNOPSIS_DECK,
  ]

  it('every prompt has at least one input', () => {
    for (const p of ALL_PROMPTS) {
      expect(p.inputs.length, `prompt ${p.id} must have at least one input`).toBeGreaterThan(0)
    }
  })

  it('every input has a valid kind', () => {
    const validKinds = new Set([
      'text',
      'textarea',
      'comps',
      'series-type',
      'episode-length',
      'future-seasons',
      'characters',
    ])
    for (const p of ALL_PROMPTS) {
      for (const i of p.inputs) {
        expect(validKinds.has(i.kind), `prompt ${p.id} kind "${i.kind}" must be valid`).toBe(true)
      }
    }
  })

  it('composite prompts (multiple inputs) carry a per-input label', () => {
    for (const p of ALL_PROMPTS) {
      if (p.inputs.length > 1) {
        for (const i of p.inputs) {
          expect(i.label, `composite prompt ${p.id} input ${i.path} must have a label`).toBeDefined()
        }
      }
    }
  })
})

describe('deck prompt content discipline', () => {
  const ALL_PROMPTS: readonly SynopsisPromptDef[] = [
    ...FEATURE_SYNOPSIS_DECK,
    ...SERIES_SYNOPSIS_DECK,
  ]

  it('every prompt has a non-empty plain-language question', () => {
    for (const p of ALL_PROMPTS) {
      expect(p.question.trim().length, `prompt ${p.id} must have a question`).toBeGreaterThan(0)
      // Prompts are coaching sentences. PRD uses both interrogatives (?) and imperatives (.).
      expect(
        /[?.]$/.test(p.question.trim()),
        `prompt ${p.id} question must end with "?" or "."`,
      ).toBe(true)
    }
  })

  it('every prompt has a non-empty helper sentence', () => {
    for (const p of ALL_PROMPTS) {
      expect(p.helper.trim().length, `prompt ${p.id} must have a helper`).toBeGreaterThan(0)
    }
  })

  it('no prompt renders its documentLabel as its question', () => {
    for (const p of ALL_PROMPTS) {
      const docParts = p.documentLabel.split('/').map((s) => s.trim().toLowerCase())
      const q = p.question.trim().toLowerCase()
      for (const part of docParts) {
        expect(q, `prompt ${p.id} must not use documentLabel "${part}" as its question`).not.toBe(
          part,
        )
      }
    }
  })

  it('every group label is reader-facing (no schema/property casing)', () => {
    for (const p of ALL_PROMPTS) {
      expect(/^[A-Z]/.test(p.groupLabel), `prompt ${p.id} groupLabel should start uppercase`).toBe(
        true,
      )
      expect(p.groupLabel).not.toMatch(/[._]/)
      expect(p.groupLabel.length, `prompt ${p.id} groupLabel non-empty`).toBeGreaterThan(0)
    }
  })

  it('every mappingPath resolves against SynopsisDocumentContent (with series)', () => {
    const probe = synopsisProbeContent()
    for (const p of [...FEATURE_SYNOPSIS_DECK, ...SERIES_SYNOPSIS_DECK]) {
      for (const path of getMappingPaths(p)) {
        const result = resolveSynopsisPath(probe, path)
        expect(result.defined, `prompt ${p.id} path "${path}" must resolve`).toBe(true)
      }
    }
  })

  it('composite prompts have at least two mapping paths', () => {
    for (const p of [...FEATURE_SYNOPSIS_DECK, ...SERIES_SYNOPSIS_DECK]) {
      if (isComposite(p)) {
        expect(getMappingPaths(p).length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('getDeckForFormat', () => {
  it('returns the feature deck for "feature"', () => {
    expect(getDeckForFormat('feature')).toBe(FEATURE_SYNOPSIS_DECK)
  })

  it('returns the series deck for "series"', () => {
    expect(getDeckForFormat('series')).toBe(SERIES_SYNOPSIS_DECK)
  })
})

describe('resolveSynopsisPath', () => {
  it('returns defined for known leaves', () => {
    const probe = synopsisProbeContent()
    expect(resolveSynopsisPath(probe, 'header.title').defined).toBe(true)
    expect(resolveSynopsisPath(probe, 'series.pilot.logline').defined).toBe(true)
  })

  it('returns not-defined for unknown paths', () => {
    const probe = synopsisProbeContent()
    expect(resolveSynopsisPath(probe, 'header.bogus').defined).toBe(false)
    expect(resolveSynopsisPath(probe, 'series.does.not.exist').defined).toBe(false)
  })

  it('returns not-defined for series paths when series block is absent', () => {
    const noSeries = createEmptySynopsisContent()
    expect(resolveSynopsisPath(noSeries, 'series.showOverview').defined).toBe(false)
  })
})

describe('buildSynopsisPatch', () => {
  it('builds a top-level patch for a single-segment path', () => {
    const content = synopsisProbeContent()
    const patch = buildSynopsisPatch(content, 'header.title', 'Untitled')
    expect(patch).toEqual({
      header: { ...content.header, title: 'Untitled' },
    })
  })

  it('preserves untouched sibling fields when patching nested paths', () => {
    const content = synopsisProbeContent()
    content.logline.protagonist = 'A reluctant pilot'
    const patch = buildSynopsisPatch(content, 'logline.text', 'A reluctant pilot saves a city.')
    expect(patch.logline?.protagonist).toBe('A reluctant pilot')
    expect(patch.logline?.text).toBe('A reluctant pilot saves a city.')
  })

  it('patches a 3-level nested series path', () => {
    const content = synopsisProbeContent()
    const patch = buildSynopsisPatch(content, 'series.pilot.logline', 'A small thing breaks.')
    expect(patch.series?.pilot.logline).toBe('A small thing breaks.')
    expect(patch.series?.showOverview).toBe(content.series!.showOverview)
  })

  it('auto-inits content.series from createEmptySeriesContent when absent', () => {
    const content = { ...synopsisProbeContent(), series: undefined }
    const patch = buildSynopsisPatch(content, 'series.showOverview', 'A renewable engine.')
    expect(patch.series?.showOverview).toBe('A renewable engine.')
    expect(patch.series?.pilot).toEqual({ logline: '', prose: '' })
  })

  it('does not mutate the input content', () => {
    const content = synopsisProbeContent()
    const before = JSON.stringify(content)
    buildSynopsisPatch(content, 'header.title', 'X')
    buildSynopsisPatch(content, 'series.pilot.prose', 'Y')
    expect(JSON.stringify(content)).toBe(before)
  })

  it('is deterministic for identical input', () => {
    const content = synopsisProbeContent()
    const a = buildSynopsisPatch(content, 'series.pilot.logline', 'X')
    const b = buildSynopsisPatch(content, 'series.pilot.logline', 'X')
    expect(a).toEqual(b)
  })
})

describe('synopsisProbeContent', () => {
  it('includes a non-empty series block for path resolution', () => {
    const probe = synopsisProbeContent()
    expect(probe.series).toBeDefined()
    expect(probe.series).toEqual(createEmptySeriesContent())
  })
})

describe('FEATURE_READINESS_CHECKS', () => {
  it('covers every key of SynopsisQaSchema exactly once', () => {
    const qaKeys = Object.keys(SynopsisQaSchema.shape).sort()
    const checkIds = FEATURE_READINESS_CHECKS.map((c) => c.id as string).sort()
    expect(checkIds).toEqual(qaKeys)
  })

  it('every readiness question is plain-language and ends with "?"', () => {
    for (const c of FEATURE_READINESS_CHECKS) {
      expect(c.question.trim().length).toBeGreaterThan(0)
      expect(/\?$/.test(c.question.trim())).toBe(true)
    }
  })
})

describe('deriveSeriesReadiness', () => {
  it('returns 6 derived checks regardless of input', () => {
    const empty = synopsisProbeContent()
    expect(deriveSeriesReadiness(empty)).toHaveLength(6)
  })

  it('marks engine-clear satisfied when showOverview is filled', () => {
    const content = synopsisProbeContent()
    content.series!.showOverview = 'A renewable conflict driven by community-level pressure.'
    const checks = deriveSeriesReadiness(content)
    const engine = checks.find((c) => c.id === 'series-engine-clear')!
    expect(engine.satisfied).toBe(true)
  })

  it('marks pilot-complete only when both pilot logline and prose are filled', () => {
    const content = synopsisProbeContent()
    content.series!.pilot.logline = 'A small thing breaks open.'
    const onlyLogline = deriveSeriesReadiness(content).find((c) => c.id === 'series-pilot-complete')!
    expect(onlyLogline.satisfied).toBe(false)
    content.series!.pilot.prose = 'Then the rest of the pilot happens.'
    const both = deriveSeriesReadiness(content).find((c) => c.id === 'series-pilot-complete')!
    expect(both.satisfied).toBe(true)
  })

  it('marks characters-sustain satisfied only when at least one character has real substance', () => {
    const content = synopsisProbeContent()
    // Empty stub row must NOT count.
    content.series!.characters.push({
      id: 'c0',
      name: '',
      role: '',
      bio: '',
      arcPerSeason: [],
    })
    const stubChecks = deriveSeriesReadiness(content)
    expect(stubChecks.find((c) => c.id === 'series-characters-sustain')!.satisfied).toBe(false)

    // Named row with no role/bio/arc still must NOT count — name alone is not substance.
    content.series!.characters.push({
      id: 'c1',
      name: 'Lead',
      role: '',
      bio: '',
      arcPerSeason: [],
    })
    const nameOnlyChecks = deriveSeriesReadiness(content)
    expect(nameOnlyChecks.find((c) => c.id === 'series-characters-sustain')!.satisfied).toBe(false)

    // Named row WITH role (or bio or any arc) counts.
    content.series!.characters.push({
      id: 'c2',
      name: 'Lead',
      role: 'protagonist',
      bio: '',
      arcPerSeason: [],
    })
    const realChecks = deriveSeriesReadiness(content)
    expect(realChecks.find((c) => c.id === 'series-characters-sustain')!.satisfied).toBe(true)
  })

  it('treats whitespace-only text as not filled', () => {
    const content = synopsisProbeContent()
    content.series!.showOverview = '   \n\t'
    const engine = deriveSeriesReadiness(content).find((c) => c.id === 'series-engine-clear')!
    expect(engine.satisfied).toBe(false)
  })

  it('is deterministic for identical input', () => {
    const content = synopsisProbeContent()
    content.series!.showOverview = 'X'
    const a = deriveSeriesReadiness(content)
    const b = deriveSeriesReadiness(content)
    expect(a).toEqual(b)
  })
})
