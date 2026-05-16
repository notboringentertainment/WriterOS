import type {
  AuthoredDocumentState,
  ProjectDocuments,
  SynopsisDocumentContent,
  OutlineDocumentContent,
  TreatmentDocumentContent,
  StoryBibleDocumentContent,
} from '@shared/documents'

function lines(...xs: (string | undefined | false)[]): string {
  return xs.filter(Boolean).join('\n')
}

function section(heading: string, body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed) return undefined
  return `${heading}\n\n${trimmed}\n`
}

export function synopsisToMarkdown(doc: AuthoredDocumentState<SynopsisDocumentContent>): string {
  const content = doc.content
  const titleSuffix = content.header.title ? ` — ${content.header.title}` : ''
  const prose = [
    content.prose.opening,
    content.prose.escalation,
    content.prose.middle,
    content.prose.climax,
    content.prose.resolution,
  ]
    .filter(Boolean)
    .join('\n\n')

  return lines(
    `# Synopsis${titleSuffix}`,
    section('## Logline', content.logline.text),
    section('## Synopsis', prose),
  ).trim() + '\n'
}

export function outlineToMarkdown(doc: AuthoredDocumentState<OutlineDocumentContent>): string {
  const content = doc.content
  const unitBlocks = content.units.map(unit => {
    const lineParts = [`### ${unit.number}. ${unit.title || '(untitled)'}`]
    if (unit.actOrSequence) lineParts.push(`*${unit.actOrSequence}*`)
    if (unit.whatHappens) lineParts.push(unit.whatHappens)
    if (unit.conflict) lineParts.push(`Conflict: ${unit.conflict}`)
    if (unit.turn) lineParts.push(`Turn: ${unit.turn}`)
    if (unit.consequence) lineParts.push(`Consequence: ${unit.consequence}`)
    if (unit.whyNext) lineParts.push(`Why next: ${unit.whyNext}`)
    if (unit.draftNotes) lineParts.push(`Notes: ${unit.draftNotes}`)
    return lineParts.join('\n\n')
  })

  return lines(
    '# Outline',
    unitBlocks.length ? unitBlocks.join('\n\n') : undefined,
  ).trim() + '\n'
}

export function treatmentToMarkdown(doc: AuthoredDocumentState<TreatmentDocumentContent>): string {
  const content = doc.content
  const titleSuffix = content.header.title ? ` — ${content.header.title}` : ''

  return lines(
    `# Treatment${titleSuffix}`,
    section('## Logline', content.logline),
    section('## Premise', content.concept.premise),
    section('## Opening', content.prose.opening),
    section('## Act One', content.prose.actOne),
    section('## Act Two', content.prose.actTwo),
    section('## Act Three', content.prose.actThree),
  ).trim() + '\n'
}

export function storyBibleToMarkdown(doc: AuthoredDocumentState<StoryBibleDocumentContent>): string {
  const content = doc.content
  const titleSuffix = content.cover.title ? ` — ${content.cover.title}` : ''
  const characterBlocks = content.characters.map(character => {
    const parts = [`### ${character.name || '(unnamed)'}`]
    if (character.role) parts.push(`*${character.role}*`)
    if (character.want) parts.push(`Want: ${character.want}`)
    if (character.need) parts.push(`Need: ${character.need}`)
    if (character.flaw) parts.push(`Flaw: ${character.flaw}`)
    if (character.arc) parts.push(`Arc: ${character.arc}`)
    return parts.join('\n\n')
  })

  return lines(
    `# Story Bible${titleSuffix}`,
    section('## Premise', content.premiseAndWorld.premise),
    section('## World Rules', content.premiseAndWorld.worldRules),
    characterBlocks.length ? `## Characters\n\n${characterBlocks.join('\n\n')}\n` : undefined,
  ).trim() + '\n'
}

export function documentsToMarkdown(docs: ProjectDocuments): Record<keyof ProjectDocuments, string> {
  return {
    synopsis: synopsisToMarkdown(docs.synopsis),
    outline: outlineToMarkdown(docs.outline),
    treatment: treatmentToMarkdown(docs.treatment),
    storyBible: storyBibleToMarkdown(docs.storyBible),
  }
}
