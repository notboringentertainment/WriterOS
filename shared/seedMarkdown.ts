import type {
  SynopsisDocumentContent,
  StoryBibleDocumentContent,
  TreatmentDocumentContent,
} from './documents'

// Composes a project's documents into a single markdown "seed" file for
// external story-development workflows (e.g. PitchStudio). Deterministic and
// pure: same input, same output. Sections with no content are omitted
// entirely — no empty headers.
//
// This is a markdown emitter in the style of client/src/lib/documentMarkdown.ts,
// NOT a compose-pipeline recipe (shared/compose/*Recipe.ts are declarative
// LLM-pipeline metadata and have factSheet/readiness/sourceHash companions).

export const LOCKS_PREFACE =
  'Any development that violates these must be rejected, regardless of craft merit.'

export const OPEN_QUESTIONS_PREFACE =
  'These are deliberately unresolved. Propose options.'

export interface SeedMarkdownInput {
  synopsis: SynopsisDocumentContent
  storyBible: StoryBibleDocumentContent
  treatment: TreatmentDocumentContent
  /** Project meta title; used when neither the story bible cover nor the synopsis header has one. */
  projectTitle?: string
  /** The synopsis page Morgan writes; replaces the frozen synopsis prose when it has text. */
  synopsisPage?: string
}

function lines(...xs: (string | undefined | false)[]): string {
  return xs.filter(Boolean).join('\n')
}

function section(heading: string, body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed) return undefined
  return `${heading}\n\n${trimmed}\n`
}

function labeledLines(entries: Array<[string, string | undefined]>): string {
  return entries
    .map(([label, value]) => {
      const trimmed = value?.trim()
      return trimmed ? `${label}: ${trimmed}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function yamlList(values: string[]): string {
  return `[${values.map(yamlString).join(', ')}]`
}

/** Title used in the seed frontmatter; export filenames should use the same resolution. */
export function resolveSeedTitle(
  input: Pick<SeedMarkdownInput, 'synopsis' | 'storyBible' | 'projectTitle'>,
): string {
  return (
    input.storyBible.cover.title.trim() ||
    input.synopsis.header.title.trim() ||
    input.projectTitle?.trim() ||
    ''
  )
}

function frontmatter(input: SeedMarkdownInput): string | undefined {
  const { synopsis, storyBible } = input
  const title = resolveSeedTitle(input)
  const toneWords = storyBible.toneAndStyle.toneWords.filter(word => word.trim())
  // Fact rule: Story Bible first, then the frozen legacy synopsis header.
  const storyBibleComps = storyBible.toneAndStyle.comps.filter(comp => comp.trim())
  const comps = storyBibleComps.length ? storyBibleComps : synopsis.header.comps.filter(comp => comp.trim())
  const logline = storyBible.onePagePitch.logline.trim() || synopsis.logline.text.trim()
  const genre = storyBible.cover.genre.trim() || synopsis.header.genre.trim()

  const entries: Array<[string, string]> = []
  if (title) entries.push(['title', yamlString(title)])
  if (logline) entries.push(['logline', yamlString(logline)])
  if (synopsis.header.format.trim()) entries.push(['format', yamlString(synopsis.header.format.trim())])
  if (genre) entries.push(['genre', yamlString(genre)])
  if (toneWords.length) entries.push(['tone', yamlList(toneWords)])
  if (comps.length) entries.push(['comps', yamlList(comps)])

  if (!entries.length) return undefined
  return ['---', ...entries.map(([key, value]) => `${key}: ${value}`), '---', ''].join('\n')
}

function synopsisSection(synopsis: SynopsisDocumentContent, synopsisPage = ''): string | undefined {
  if (synopsisPage.trim()) return section('## Synopsis', synopsisPage.replace(/^#\s+Synopsis\s*\n/i, ''))
  const prose = [
    synopsis.prose.opening,
    synopsis.prose.escalation,
    synopsis.prose.middle,
    synopsis.prose.climax,
    synopsis.prose.resolution,
  ]
    .map(text => text.trim())
    .filter(Boolean)
    .join('\n\n')
  return section('## Synopsis', prose)
}

function characterNotesSection(storyBible: StoryBibleDocumentContent): string | undefined {
  const blocks = storyBible.characters
    .map(character => {
      const body = labeledLines([
        ['Role', character.role],
        ['Want', character.want],
        ['Need', character.need],
        ['Flaw', character.flaw],
        ['Secret', character.secret],
        ['Arc', character.arc],
      ])
      if (!character.name.trim() && !body) return ''
      return [`### ${character.name.trim() || '(unnamed)'}`, body].filter(Boolean).join('\n\n')
    })
    .filter(Boolean)
  if (!blocks.length) return undefined
  return section('## Character notes', blocks.join('\n\n'))
}

function worldSection(storyBible: StoryBibleDocumentContent): string | undefined {
  const premise = storyBible.premiseAndWorld.premise.trim()
  const worldRules = storyBible.premiseAndWorld.worldRules.trim()
  const body = [premise, worldRules ? `World rules:\n${worldRules}` : ''].filter(Boolean).join('\n\n')
  return section('## World', body)
}

function locksSection(storyBible: StoryBibleDocumentContent): string | undefined {
  const activeLocks = (storyBible.locks ?? []).filter(
    lock => lock.status === 'active' && lock.statement.trim(),
  )
  if (!activeLocks.length) return undefined
  const bullets = activeLocks
    .map(lock => {
      const rationale = lock.rationale.trim()
      return `- ${lock.statement.trim()}${rationale ? ` — ${rationale}` : ''}`
    })
    .join('\n')
  return section('## Locks — do not violate', `${LOCKS_PREFACE}\n\n${bullets}`)
}

function openQuestionsSection(treatment: TreatmentDocumentContent): string | undefined {
  const categories: Array<[string, string[]]> = [
    ['Story', treatment.openQuestions.story],
    ['Character', treatment.openQuestions.character],
    ['World or mythology', treatment.openQuestions.worldOrMythology],
    ['Production', treatment.openQuestions.production],
  ]
  const groups = categories
    .map(([label, questions]) => {
      const bullets = questions
        .map(question => question.trim())
        .filter(Boolean)
        .map(question => `- ${question}`)
        .join('\n')
      return bullets ? `${label}:\n${bullets}` : ''
    })
    .filter(Boolean)
  if (!groups.length) return undefined
  return section('## Open questions — invent here', `${OPEN_QUESTIONS_PREFACE}\n\n${groups.join('\n\n')}`)
}

export function seedFileName(title: string): string {
  return `${slugifyProjectTitle(title)}-seed.md`
}

export function slugifyProjectTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

export function composeSeedMarkdown(input: SeedMarkdownInput): string {
  return (
    lines(
      frontmatter(input),
      synopsisSection(input.synopsis, input.synopsisPage),
      characterNotesSection(input.storyBible),
      worldSection(input.storyBible),
      locksSection(input.storyBible),
      openQuestionsSection(input.treatment),
    ).trim() + '\n'
  )
}
