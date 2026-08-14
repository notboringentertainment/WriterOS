import type {
  ProjectMemoryRecord,
  ProjectMemorySnapshot,
} from '../../shared/projectMemory'

function sourceLine(record: ProjectMemoryRecord): string {
  return `${record.source.workflow} · ${record.source.sourceUri}`
}

function renderRecord(record: ProjectMemoryRecord): string[] {
  const lines = [
    `## ${record.claim}`,
    '',
    `- Memory ID: \`${record.id}\``,
    `- Source: ${sourceLine(record)}`,
    `- Updated: ${record.updatedAt}`,
  ]
  if (record.spoiler) lines.push('- Spoiler: yes')
  if (record.detail) lines.push('', record.detail)
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
        `## ${conflict.id}`,
        '',
        `- Left: \`${conflict.leftRecordId}\``,
        `- Right: \`${conflict.rightRecordId}\``,
        `- Reason: ${conflict.reason}`,
        '',
      )
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}
