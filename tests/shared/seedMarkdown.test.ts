import { describe, it, expect } from 'vitest'
import {
  createEmptySynopsisContent,
  createEmptyStoryBibleContent,
  createEmptyTreatmentContent,
  type StoryBibleDocumentContent,
  type StoryLock,
} from '../../shared/documents'
import {
  composeSeedMarkdown,
  seedFileName,
  LOCKS_PREFACE,
  OPEN_QUESTIONS_PREFACE,
} from '../../shared/seedMarkdown'

function buildLock(overrides: Partial<StoryLock> = {}): StoryLock {
  return {
    id: 'lock-1',
    statement: 'The protagonist goes to space in Act 3',
    scope: 'story',
    rationale: 'The whole third act depends on the launch.',
    source: 'Ben, initial pitch',
    status: 'active',
    createdAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  }
}

function buildInput() {
  const synopsis = createEmptySynopsisContent()
  const storyBible = createEmptyStoryBibleContent()
  const treatment = createEmptyTreatmentContent()
  return { synopsis, storyBible, treatment }
}

describe('composeSeedMarkdown — frontmatter', () => {
  it('emits title, logline, format, genre, tone, and comps when populated', () => {
    const input = buildInput()
    input.synopsis.header.title = 'My Film'
    input.synopsis.header.format = 'Feature'
    input.synopsis.header.genre = 'Drama'
    input.synopsis.header.comps = ['Alien', 'Heat']
    input.synopsis.logline.text = 'A widow returns home.'
    input.storyBible.toneAndStyle.toneWords = ['grim', 'tender']
    const md = composeSeedMarkdown(input)
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('title: "My Film"')
    expect(md).toContain('logline: "A widow returns home."')
    expect(md).toContain('format: "Feature"')
    expect(md).toContain('genre: "Drama"')
    expect(md).toContain('tone: ["grim", "tender"]')
    expect(md).toContain('comps: ["Alien", "Heat"]')
  })

  it('omits empty frontmatter keys', () => {
    const input = buildInput()
    input.synopsis.header.title = 'My Film'
    const md = composeSeedMarkdown(input)
    expect(md).toContain('title: "My Film"')
    expect(md).not.toContain('logline:')
    expect(md).not.toContain('genre:')
    expect(md).not.toContain('tone:')
    expect(md).not.toContain('comps:')
  })

  it('falls back to the story bible cover title when the synopsis header title is empty', () => {
    const input = buildInput()
    input.storyBible.cover.title = 'Bible Title'
    const md = composeSeedMarkdown(input)
    expect(md).toContain('title: "Bible Title"')
  })

  it('falls back to the project title when both document titles are empty', () => {
    const input = buildInput()
    const md = composeSeedMarkdown({ ...input, projectTitle: 'Launch Window' })
    expect(md).toContain('title: "Launch Window"')
  })

  it('prefers the synopsis header title over the project title', () => {
    const input = buildInput()
    input.synopsis.header.title = 'Header Title'
    const md = composeSeedMarkdown({ ...input, projectTitle: 'Launch Window' })
    expect(md).toContain('title: "Header Title"')
  })
})

describe('composeSeedMarkdown — synopsis section', () => {
  it('renders the prose sections in order', () => {
    const input = buildInput()
    input.synopsis.prose.opening = 'OPENING-TEXT'
    input.synopsis.prose.escalation = 'ESCALATION-TEXT'
    input.synopsis.prose.middle = 'MIDDLE-TEXT'
    input.synopsis.prose.climax = 'CLIMAX-TEXT'
    input.synopsis.prose.resolution = 'RESOLUTION-TEXT'
    const md = composeSeedMarkdown(input)
    expect(md).toContain('## Synopsis')
    expect(md).toMatch(/OPENING-TEXT[\s\S]+ESCALATION-TEXT[\s\S]+MIDDLE-TEXT[\s\S]+CLIMAX-TEXT[\s\S]+RESOLUTION-TEXT/)
  })

  it('omits the section when all prose is empty', () => {
    const md = composeSeedMarkdown(buildInput())
    expect(md).not.toContain('## Synopsis')
  })
})

describe('composeSeedMarkdown — character notes', () => {
  it('renders each character with labeled fields, skipping empty fields', () => {
    const input = buildInput()
    input.storyBible.characters.push({
      id: 'c1',
      name: 'Sara',
      role: 'Protagonist',
      want: 'home',
      need: 'forgiveness',
      flaw: 'guilt',
      secret: 'she lit the fire',
      contradiction: '',
      arc: 'guilt -> mercy',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    const md = composeSeedMarkdown(input)
    expect(md).toContain('## Character notes')
    expect(md).toContain('### Sara')
    expect(md).toContain('Role: Protagonist')
    expect(md).toContain('Want: home')
    expect(md).toContain('Need: forgiveness')
    expect(md).toContain('Flaw: guilt')
    expect(md).toContain('Secret: she lit the fire')
    expect(md).toContain('Arc: guilt -> mercy')
  })

  it('skips empty character fields', () => {
    const input = buildInput()
    input.storyBible.characters.push({
      id: 'c1',
      name: 'Sara',
      role: 'Protagonist',
      want: '',
      need: '',
      flaw: '',
      secret: '',
      contradiction: '',
      arc: '',
      relationshipPressure: '',
      behavioralAnchors: '',
      speechPatterns: '',
      neverWriteThemAs: '',
      continuityFacts: '',
    })
    const md = composeSeedMarkdown(input)
    expect(md).toContain('### Sara')
    expect(md).not.toContain('Want:')
    expect(md).not.toContain('Secret:')
  })

  it('omits the section when there are no characters', () => {
    const md = composeSeedMarkdown(buildInput())
    expect(md).not.toContain('## Character notes')
  })
})

describe('composeSeedMarkdown — world section', () => {
  it('renders premise and world rules when present', () => {
    const input = buildInput()
    input.storyBible.premiseAndWorld.premise = 'PREMISE-TEXT'
    input.storyBible.premiseAndWorld.worldRules = 'WORLD-RULES-TEXT'
    const md = composeSeedMarkdown(input)
    expect(md).toContain('## World')
    expect(md).toContain('PREMISE-TEXT')
    expect(md).toContain('WORLD-RULES-TEXT')
  })

  it('omits the section when premise and world rules are empty', () => {
    const md = composeSeedMarkdown(buildInput())
    expect(md).not.toContain('## World')
  })
})

describe('composeSeedMarkdown — locks section', () => {
  it('renders active locks as bullets with statement and rationale after the preface', () => {
    const input = buildInput()
    input.storyBible.locks = [buildLock()]
    const md = composeSeedMarkdown(input)
    expect(md).toContain('## Locks — do not violate')
    expect(md).toContain(LOCKS_PREFACE)
    expect(md).toContain('- The protagonist goes to space in Act 3 — The whole third act depends on the launch.')
  })

  it('omits the rationale suffix when the rationale is empty', () => {
    const input = buildInput()
    input.storyBible.locks = [buildLock({ rationale: '' })]
    const md = composeSeedMarkdown(input)
    expect(md).toContain('- The protagonist goes to space in Act 3\n')
    expect(md).not.toContain('The protagonist goes to space in Act 3 —')
  })

  it('excludes retired locks', () => {
    const input = buildInput()
    input.storyBible.locks = [
      buildLock(),
      buildLock({ id: 'lock-2', statement: 'RETIRED-STATEMENT', status: 'retired' }),
    ]
    const md = composeSeedMarkdown(input)
    expect(md).not.toContain('RETIRED-STATEMENT')
  })

  it('omits the section when every lock is retired', () => {
    const input = buildInput()
    input.storyBible.locks = [buildLock({ status: 'retired' })]
    const md = composeSeedMarkdown(input)
    expect(md).not.toContain('## Locks')
    expect(md).not.toContain(LOCKS_PREFACE)
  })

  it('tolerates an old-shape story bible with no locks field', () => {
    const input = buildInput()
    const { locks: _locks, ...withoutLocks } = input.storyBible
    const md = composeSeedMarkdown({
      ...input,
      storyBible: withoutLocks as StoryBibleDocumentContent,
    })
    expect(md).not.toContain('## Locks')
  })
})

describe('composeSeedMarkdown — open questions section', () => {
  it('renders questions from all four treatment categories after the preface', () => {
    const input = buildInput()
    input.treatment.openQuestions.story = ['STORY-Q']
    input.treatment.openQuestions.character = ['CHARACTER-Q']
    input.treatment.openQuestions.worldOrMythology = ['WORLD-Q']
    input.treatment.openQuestions.production = ['PRODUCTION-Q']
    const md = composeSeedMarkdown(input)
    expect(md).toContain('## Open questions — invent here')
    expect(md).toContain(OPEN_QUESTIONS_PREFACE)
    expect(md).toContain('- STORY-Q')
    expect(md).toContain('- CHARACTER-Q')
    expect(md).toContain('- WORLD-Q')
    expect(md).toContain('- PRODUCTION-Q')
  })

  it('omits the section when all categories are empty', () => {
    const md = composeSeedMarkdown(buildInput())
    expect(md).not.toContain('## Open questions')
    expect(md).not.toContain(OPEN_QUESTIONS_PREFACE)
  })
})

describe('seedFileName', () => {
  it('slugifies the title into {project-title}-seed.md', () => {
    expect(seedFileName('My Film')).toBe('my-film-seed.md')
    expect(seedFileName("Winter's Edge: Part II")).toBe('winters-edge-part-ii-seed.md')
  })

  it('collapses runs of non-alphanumerics and trims edge dashes', () => {
    expect(seedFileName('  --Weird   Title!!  ')).toBe('weird-title-seed.md')
  })

  it('falls back to project when the title is empty', () => {
    expect(seedFileName('')).toBe('project-seed.md')
    expect(seedFileName('!!!')).toBe('project-seed.md')
  })
})

describe('composeSeedMarkdown — determinism', () => {
  it('produces identical output for identical input', () => {
    const input = buildInput()
    input.synopsis.header.title = 'My Film'
    input.synopsis.prose.opening = 'Opening.'
    input.storyBible.locks = [buildLock()]
    input.treatment.openQuestions.story = ['Q']
    expect(composeSeedMarkdown(input)).toBe(composeSeedMarkdown(input))
  })
})
