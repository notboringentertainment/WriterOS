import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PublishMemoryInput } from '../../../shared/projectMemory'
import { UnsafeProjectMemoryPathError } from '../safePaths'
import {
  buildImportCounts,
  promptInjectionLine,
  readImportSourceText,
  truncateImportText,
  type ImportPreview,
  type MemorySourceAdapter,
} from '../importer'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function markdownFiles(root: string, directory = root): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some(entry => entry.isSymbolicLink())) {
    throw new UnsafeProjectMemoryPathError('The source contains a symbolic link.')
  }
  for (const entry of entries.sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ))) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) results.push(...await markdownFiles(root, entryPath))
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.relative(root, entryPath).split(path.sep).join(path.posix.sep))
    }
  }
  return results
}

function parseExport(content: string): {
  headers: Map<string, { value: string; line: number }>
  sections: Map<string, string>
} {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const headers = new Map<string, { value: string; line: number }>()
  let index = 0
  if (lines[0] === '---') {
    index = 1
    while (index < lines.length && lines[index] !== '---') {
      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index] ?? '')
      if (match) headers.set(match[1].toLowerCase(), { value: match[2].trim(), line: index + 1 })
      index += 1
    }
    if (lines[index] === '---') index += 1
  }
  const sections = new Map<string, string>()
  let heading: string | undefined
  let body: string[] = []
  const save = () => {
    if (heading) sections.set(heading, body.join('\n').trim())
  }
  for (; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index] ?? '')
    if (match) {
      save()
      heading = match[1]
      body = []
    } else if (heading) {
      body.push(lines[index] ?? '')
    }
  }
  save()
  return { headers, sections }
}

function listItems(value: string | undefined, numbered: boolean): string[] {
  if (!value) return []
  return value.split('\n')
    .map(line => {
      if (numbered) return /^\s*\d+[.)]\s+(.+?)\s*$/.exec(line)?.[1]?.trim()
      const trimmed = line.trim()
      return trimmed ? trimmed.replace(/^(?:[-*]|\d+[.)])\s+/, '').trim() : undefined
    })
    .filter((item): item is string => Boolean(item))
}

function timestamp(date: string | undefined): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
    ? `${date}T00:00:00.000Z`
    : '1970-01-01T00:00:00.000Z'
}

export const pitchStudioMemorySourceAdapter: MemorySourceAdapter = {
  async preview({ projectId, sourceRoot }): Promise<ImportPreview> {
    const records: PublishMemoryInput[] = []
    const warnings: string[] = []
    let identifiedExports = 0
    for (const relativePath of await markdownFiles(sourceRoot)) {
      const content = await readImportSourceText(path.join(sourceRoot, relativePath))
      const parsed = parseExport(content)
      const sourceHeader = parsed.headers.get('source')?.value ?? ''
      if (!/^PitchStudio(?:\s|$)/i.test(sourceHeader) && !relativePath.includes('-pitchstudio-')) continue
      identifiedExports += 1
      const mode = parsed.headers.get('run_mode')
      if (mode?.value === 'scout') {
        warnings.push(`${relativePath}:${mode.line}: run_mode scout export rejected`)
        continue
      }
      if (mode?.value !== 'room' && mode?.value !== 'deep') {
        warnings.push(`${relativePath}:${mode?.line ?? 1}: malformed or missing run_mode; export rejected`)
        continue
      }
      const status = parsed.headers.get('status')
      if (status?.value !== 'unratified') {
        warnings.push(`${relativePath}:${status?.line ?? 1}: status must be unratified; export rejected`)
        continue
      }
      const incomingFrame = parsed.headers.get('incoming_frame')
      if (!incomingFrame || incomingFrame.value === '' || incomingFrame.value.toLowerCase() === 'none') {
        warnings.push(`${relativePath}:${incomingFrame?.line ?? 1}: frame not captured`)
      }
      const decisions = listItems(parsed.sections.get('Decisions made in this run'), true)
      const departuresBody = parsed.sections.get('Departures from the incoming frame')
      const departures = /^\s*None\.\s*$/i.test(departuresBody ?? '')
        ? []
        : listItems(departuresBody, false)
      if (decisions.length === 0) {
        warnings.push(`${relativePath}:1: no numbered PitchStudio decisions found`)
      }
      const sourceHash = sha256(content)
      const unsafeLine = promptInjectionLine(content)
      if (unsafeLine !== undefined) {
        warnings.push(`${relativePath}:${unsafeLine}: prompt-injection pattern detected; records imported as flagged candidates`)
      }
      const addRecord = (claim: string, type: 'decision' | 'departure', index: number) => {
        const sourceId = `${relativePath}#${type}-${index}`
        const boundedClaim = truncateImportText(claim, 600)
        if (boundedClaim !== claim) warnings.push(`${relativePath}:1: claim truncated to 600 characters`)
        records.push({
          projectId,
          dedupeKey: `import:pitchstudio:${sha256(`pitchstudio\0${sourceId}\0${sourceHash}`)}`,
          kind: 'decision',
          requestedStatus: type === 'departure' || unsafeLine !== undefined ? 'candidate' : 'active',
          claim: boundedClaim,
          tags: type === 'departure'
            ? ['pitchstudio:departure', 'memory:conflict']
            : ['pitchstudio:decision', 'pitchstudio:status:unratified'],
          source: {
            workflow: 'pitchstudio',
            sourceId,
            sourceUri: `pitchstudio:${sourceId}`,
            sourceHash,
            capturedAt: timestamp(parsed.headers.get('run_date')?.value),
            approval: 'none',
          },
          evidence: [{ excerpt: boundedClaim, locator: `pitchstudio:${sourceId}` }],
          safety: unsafeLine === undefined ? 'clear' : 'flagged',
          spoiler: false,
        })
      }
      decisions.forEach((claim, index) => addRecord(claim, 'decision', index + 1))
      departures.forEach((claim, index) => addRecord(claim, 'departure', index + 1))
    }
    if (identifiedExports === 0) warnings.push('source: no PitchStudio exports identified')
    return {
      source: 'pitchstudio',
      projectId,
      records,
      warnings,
      duplicates: 0,
      counts: buildImportCounts(records, 0),
    }
  },
}
