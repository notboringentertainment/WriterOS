import type {
  ProjectMemoryRecord,
  ProjectMemorySnapshot,
} from '../../shared/projectMemory'

/**
 * Block escaping for record-controlled prose that renders as paragraphs.
 *
 * `escapedInline` is safe but unreadable: it escapes every hyphen, paren and
 * underscore, so a claim comes out as `One\-sheet ... \(also an open question\)`.
 * The file is meant to be read by a writer, and that noise is what made the
 * canon unreadable in the first place.
 *
 * This escapes only what can change document structure at the position it
 * appears, and leaves running prose alone:
 *
 * - backslashes first, so later escapes cannot be neutralised, and so a trailing
 *   backslash cannot become a hard line break
 * - leading `#`, blockquote `>`, bullet `-`/`+`/`*`, and ordered `1.` / `1)`
 *   markers, which would otherwise inject headings and lists
 * - leading indentation, which would otherwise become an indented code block
 * - backticks and tildes, which would otherwise open fenced code
 * - `|`, which would otherwise be read as a table cell
 * - `<`, which would otherwise open raw HTML
 * - setext underlines (`===` / `---` alone on a line), which would otherwise
 *   promote the paragraph above them into a heading
 *
 * Blank lines are preserved so paragraphs survive, but runs of them collapse to
 * one, so record text cannot pad the document.
 */
function escapeBlock(value: string): string {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => {
      const escaped = line
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/~/g, '\\~')
        .replace(/\|/g, '\\|')
        .replace(/</g, '\\<')
        .replace(/^(#+)/, '\\$1')
        .replace(/^(>+)/, '\\$1')
        .replace(/^([-+*])(\s)/, '\\$1$2')
        .replace(/^(\d{1,9})([.)])(\s)/, '$1\\$2$3')
      // A line of only = or - would make the paragraph above it a heading.
      return /^[=-]{2,}$/.test(escaped) ? `\\${escaped}` : escaped
    })

  const collapsed: string[] = []
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(line)
  }
  while (collapsed[0] === '') collapsed.shift()
  while (collapsed[collapsed.length - 1] === '') collapsed.pop()
  return collapsed.join('\n')
}

/**
 * Escaping for record-controlled values that render mid-line inside a metadata
 * blockquote. Whitespace is collapsed first, so the value cannot end its line —
 * which means no leading-marker construct (heading, list, fence, setext) can
 * apply to it, and only the mid-line constructs need neutralising: backslashes,
 * code spans, table cells, raw HTML, and link syntax.
 *
 * Kept separate from `escapedInline` because source URIs are mostly hyphens and
 * slashes; escaping every hyphen turns the provenance line into the loudest
 * thing on the page, which is the noise this change exists to remove.
 */
function escapedMetadata(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|')
    .replace(/</g, '\\<')
    .replace(/([\[\]])/g, '\\$1')
}

/**
 * Provenance for one record, as a single blockquote line. A blockquote reads as
 * visually secondary without requiring raw HTML — a `<details>` block would let
 * any record containing `</details>` break out of it.
 */
function provenanceLine(record: ProjectMemoryRecord): string {
  const parts = [
    `Source: ${escapedMetadata(record.source.workflow)} · ${escapedMetadata(record.source.sourceUri)}`,
    `Updated: ${record.updatedAt}`,
    `ID: ${escapedMetadata(record.id)}`,
  ]
  if (record.source.authority !== undefined && 'verification' in record.source.authority) {
    parts.push(record.source.authority.verification === 'writeros-promotion'
      ? 'Authority: promoted in WriterOS review'
      : 'Authority: legacy / unverified')
  }
  if (record.spoiler) parts.push('Spoiler: yes')
  return `> ${parts.join(' · ')}`
}

/**
 * YAML for a typed payload block. Every scalar is JSON-quoted (valid YAML), so
 * no value can change the structure; key order follows the block.
 */
function yamlLines(value: unknown, indent: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const [first, ...rest] = yamlLines(item, `${indent}  `)
        return [`${indent}- ${first.slice(indent.length + 2)}`, ...rest]
      }
      return [`${indent}- ${JSON.stringify(item)}`]
    })
  }
  const lines: string[] = []
  for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
    if (member === undefined) continue
    if (Array.isArray(member) && member.length === 0) {
      lines.push(`${indent}${key}: []`)
    } else if (member !== null && typeof member === 'object') {
      lines.push(`${indent}${key}:`, ...yamlLines(member, `${indent}  `))
    } else {
      lines.push(`${indent}${key}: ${JSON.stringify(member)}`)
    }
  }
  return lines
}

/**
 * A code fence longer than any backtick run in the body, so record text
 * cannot close it early (CommonMark closes only on a run at least as long).
 */
function fenced(language: string, body: string): string[] {
  const longestRun = Math.max(0, ...Array.from(body.matchAll(/`+/g), match => match[0].length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return [`${fence}${language}`, body, fence]
}

/** A look block as JSON-quoted YAML (also used as the record's detail for agent context). */
export function renderLookYaml(spec: unknown): string {
  return yamlLines(spec, '').join('\n')
}

function renderRecord(record: ProjectMemoryRecord): string[] {
  const lines = [escapeBlock(record.claim)]
  if (record.payload?.kind === 'look_spec') {
    // The typed block replaces detail here; detail keeps it for agent context.
    const { spec, lookHash } = record.payload
    lines.push(
      '',
      `Look — ${escapedMetadata(spec.entity_id)} (${spec.entity_kind}) · look_hash ${lookHash.slice(0, 12)}`,
      '',
      ...fenced('yaml', renderLookYaml(spec)),
    )
  } else if (record.detail) {
    lines.push('', escapeBlock(record.detail))
  }
  lines.push('', provenanceLine(record))
  return lines
}

/** Latest `updatedAt` across a set of records, as a plain YYYY-MM-DD. */
function lastChanged(records: readonly ProjectMemoryRecord[]): string | undefined {
  let latest: string | undefined
  for (const record of records) {
    if (latest === undefined || record.updatedAt > latest) latest = record.updatedAt
  }
  return latest?.slice(0, 10)
}

function headerLine(revision: number, records: readonly ProjectMemoryRecord[]): string {
  const changed = lastChanged(records)
  const parts = [`Revision: ${revision}`]
  if (changed !== undefined) parts.push(`last changed ${changed}`)
  return parts.join(' · ')
}

export function renderCanonProjection(snapshot: ProjectMemorySnapshot): string {
  const records = snapshot.records.filter(record => (
    record.kind === 'canon'
    && record.status === 'active'
    && record.safety === 'clear'
  ))
  const lines = [
    '# Project Canon',
    '',
    headerLine(snapshot.revision, records),
    '',
  ]
  if (records.length === 0) {
    lines.push('No active canon.')
  } else {
    lines.push(
      records.length === 1 ? '1 settled decision.' : `${records.length} settled decisions.`,
      '',
    )
    for (const record of records) lines.push(...renderRecord(record), '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function renderReviewProjection(snapshot: ProjectMemorySnapshot): string {
  const candidates = snapshot.records.filter(record => record.status === 'candidate')
  const scopedOut = candidates.filter(record => record.source.workflow === 'story-wayfinder'
    && record.detail?.startsWith('Scoped-out answer:'))
  const awaitingDecision = candidates.filter(record => !scopedOut.includes(record))
  const conflicts = snapshot.conflicts.filter(conflict => conflict.status === 'open')
  const lines = [
    '# Project Memory Review',
    '',
    headerLine(snapshot.revision, candidates),
    '',
  ]

  if (candidates.length === 0 && conflicts.length === 0) {
    lines.push('No items awaiting review.')
    return `${lines.join('\n')}\n`
  }

  if (awaitingDecision.length > 0) {
    lines.push('## Awaiting your decision', '')
    for (const record of awaitingDecision) lines.push(...renderRecord(record), '')
  }

  if (scopedOut.length > 0) {
    lines.push('## Scoped-out answers on file', '')
    for (const record of scopedOut) lines.push(...renderRecord(record), '')
  }

  if (conflicts.length > 0) {
    lines.push('## Open conflicts', '')
    for (const conflict of conflicts) {
      lines.push(
        escapeBlock(conflict.reason),
        '',
        `> Conflict: ${escapedMetadata(conflict.id)} · Left: ${escapedMetadata(conflict.leftRecordId)}`
        + ` · Right: ${escapedMetadata(conflict.rightRecordId)}`,
        '',
      )
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}
