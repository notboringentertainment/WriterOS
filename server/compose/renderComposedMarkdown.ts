import type { ComposedBlock, ComposedDocument } from '../../shared/compose/types'

/**
 * Render a composed document as Markdown, for CLI output and for writing a report to a file.
 *
 * Block text originates in project memory, which is untrusted: a record can contain anything
 * the writer or an upstream tool put there. So text is escaped where it could change document
 * structure at the position it appears, and left alone where it cannot. Escaping every
 * Markdown-significant character instead would fill running prose with backslashes, which is
 * the exact unreadability this whole effort exists to remove.
 *
 * NOTE: `server/projectMemory/projections.ts` solves the same problem for the canon
 * projection. The two should collapse into one shared utility; that is deliberately not done
 * here because the projection change is still in review, and duplicating a small pure
 * function is safer than reaching across layers to a module in flight.
 */
function escapeBlockText(value: string): string {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line
      .trim()
      // Backslashes first: later escapes must not be neutralised, and a trailing backslash
      // would otherwise become a hard line break.
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/~/g, '\\~')
      .replace(/\|/g, '\\|')
      .replace(/</g, '\\<')
      .replace(/^(#+)/, '\\$1')
      .replace(/^(>+)/, '\\$1')
      .replace(/^([-+*])(\s)/, '\\$1$2')
      .replace(/^(\d{1,9})([.)])(\s)/, '$1\\$2$3'))
    .map(line => (/^[=-]{2,}$/.test(line) ? `\\${line}` : line))

  const collapsed: string[] = []
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(line)
  }
  while (collapsed[0] === '') collapsed.shift()
  while (collapsed[collapsed.length - 1] === '') collapsed.pop()
  return collapsed.join('\n')
}

function renderBlock(block: ComposedBlock): string {
  switch (block.type) {
    case 'heading':
      return `# ${escapeBlockText(block.text)}`
    case 'subheading':
      return `## ${escapeBlockText(block.text)}`
    case 'divider':
      return '---'
    case 'meta':
      return `*${escapeBlockText(block.text)}*`
    case 'logline':
    case 'paragraph':
      return escapeBlockText(block.text)
    case 'leadInParagraph':
      return `**${escapeBlockText(block.lead)}** ${escapeBlockText(block.text)}`
  }
}

export function renderComposedMarkdown(composed: ComposedDocument): string {
  const body = composed.blocks.map(renderBlock).join('\n\n')

  // A report that cannot be trusted must say so where it cannot be missed, not in a footer.
  // A flagged document means a fidelity check found something — most importantly a record
  // that exists in memory but was not cited by any block, i.e. silently omitted.
  const banner = composed.fidelity.status === 'flagged'
    ? [
      '> **INCOMPLETE — this report has unresolved problems and should not be relied on alone.**',
      ...composed.fidelity.warnings.map(w => `> - ${w.kind}: ${w.message}`),
      '',
    ].join('\n')
    : ''

  const footer = [
    '',
    '---',
    '',
    `*Generated ${composed.generatedAt}`
    + (composed.run ? ` · run ${composed.run.runId} · memory revision ${composed.run.snapshotRevision}` : '')
    + ` · source ${composed.sourceHash.slice(0, 12)}`
    + ` · ${composed.model === null ? 'composed deterministically, no model' : `model ${composed.model}`}*`,
  ].join('\n')

  return `${banner}${body}${footer}\n`
}
