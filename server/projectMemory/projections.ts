import type {
  ProjectMemoryRecord,
  ProjectMemorySnapshot,
} from '../../shared/projectMemory'

function escapedInline(value: string): string {
  const normalized = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_\[\]{}()<>#+>!|~\-])/g, '\\$1')
  return normalized.replace(/^(\d{1,9})\./, '$1\\.')
}

function sourceLine(record: ProjectMemoryRecord): string {
  return `${escapedInline(record.source.workflow)} · ${escapedInline(record.source.sourceUri)}`
}

function renderRecord(record: ProjectMemoryRecord): string[] {
  const lines = [
    `## ${escapedInline(record.claim)}`,
    '',
    `- Memory ID: ${escapedInline(record.id)}`,
    `- Source: ${sourceLine(record)}`,
    `- Updated: ${record.updatedAt}`,
  ]
  if (record.source.authority !== undefined && 'verification' in record.source.authority) {
    lines.push('- Authority: legacy / unverified')
  }
  if (record.spoiler) lines.push('- Spoiler: yes')
  if (record.detail) lines.push('', escapedInline(record.detail))
  return lines
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
    `Revision: ${snapshot.revision}`,
    '',
  ]
  if (records.length === 0) {
    lines.push('No active canon.')
  } else {
    for (const record of records) lines.push(...renderRecord(record), '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function renderReviewProjection(snapshot: ProjectMemorySnapshot): string {
  const candidates = snapshot.records.filter(record => record.status === 'candidate')
  const conflicts = snapshot.conflicts.filter(conflict => conflict.status === 'open')
  const lines = [
    '# Project Memory Review',
    '',
    `Revision: ${snapshot.revision}`,
    '',
  ]

  if (candidates.length === 0 && conflicts.length === 0) {
    lines.push('No items awaiting review.')
    return `${lines.join('\n')}\n`
  }

  if (candidates.length > 0) {
    lines.push('# Candidates', '')
    for (const record of candidates) lines.push(...renderRecord(record), '')
  }

  if (conflicts.length > 0) {
    lines.push('# Open Conflicts', '')
    for (const conflict of conflicts) {
      lines.push(
        `## ${escapedInline(conflict.id)}`,
        '',
        `- Left: ${escapedInline(conflict.leftRecordId)}`,
        `- Right: ${escapedInline(conflict.rightRecordId)}`,
        `- Reason: ${escapedInline(conflict.reason)}`,
        '',
      )
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}
