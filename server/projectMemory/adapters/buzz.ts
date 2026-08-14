import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PublishMemoryInput } from '../../../shared/projectMemory'
import { UnsafeProjectMemoryPathError } from '../safePaths'
import {
  buildImportCounts,
  ProjectMemoryImportInputError,
  promptInjectionLine,
  readImportSource,
  truncateImportText,
  type ImportPreview,
  type MemorySourceAdapter,
} from '../importer'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseAtom(content: string): {
  title: string
  headers: Map<string, { value: string; line: number }>
  sections: Map<string, string>
} {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const title = /^#\s+(.+?)\s*$/.exec(lines[0] ?? '')?.[1] ?? ''
  const headers = new Map<string, { value: string; line: number }>()
  let index = 1
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      if (headers.size > 0) break
      continue
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) break
    headers.set(match[1].toLowerCase(), { value: match[2].trim(), line: index + 1 })
    index += 1
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
  return { title, headers, sections }
}

async function statusDirectory(root: string, status: string): Promise<{
  exists: boolean
  files: string[]
}> {
  try {
    const entries = await readdir(path.join(root, 'atoms', status), { withFileTypes: true })
    if (entries.some(entry => entry.isSymbolicLink())) {
      throw new UnsafeProjectMemoryPathError('The source contains a symbolic link.')
    }
    return {
      exists: true,
      files: entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => entry.name)
        .sort(),
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, files: [] }
    }
    throw error
  }
}

function timestamp(value: string | undefined): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return undefined
  return date.toISOString()
}

function parseEvidenceIds(value: string | undefined): {
  ids: string[]
  malformed: boolean
  truncated: boolean
} {
  const match = /^\[([^\]]*)\]$/.exec(value ?? '')
  if (!match) return { ids: [], malformed: Boolean(value), truncated: false }
  const values = match[1].split(',').map(item => item.trim()).filter(Boolean)
  const valid = values.filter(value => /^[a-f0-9]{64}$/i.test(value))
  return {
    ids: valid.slice(0, 3),
    malformed: valid.length !== values.length,
    truncated: valid.length > 3,
  }
}

export const buzzMemorySourceAdapter: MemorySourceAdapter = {
  async preview({ projectId, sourceRoot, linkedSourceId }): Promise<ImportPreview> {
    if (!linkedSourceId) {
      throw new ProjectMemoryImportInputError('Buzz import requires a linked channel source id.')
    }
    const records: PublishMemoryInput[] = []
    const warnings: string[] = []
    for (const status of ['canon', 'provisional', 'rejected'] as const) {
      const directory = await statusDirectory(sourceRoot, status)
      if (!directory.exists) {
        if (status === 'canon') warnings.push('atoms/canon: absent; no Buzz canon atoms found')
        else warnings.push(`atoms/${status}: absent (valid); no ${status} workflow dependency`)
        continue
      }
      if (status === 'canon' && directory.files.length === 0) {
        warnings.push('atoms/canon: empty; no Buzz canon atoms found')
      }
      for (const filename of directory.files) {
        const relativePath = path.posix.join('atoms', status, filename)
        const sourceFile = await readImportSource(path.join(sourceRoot, relativePath))
        const content = sourceFile.text
        const parsed = parseAtom(content)
        if (!parsed.title) {
          warnings.push(`${relativePath}:1: missing H1 title; record not imported`)
          continue
        }
        const typeHeader = parsed.headers.get('type')
        if (typeHeader?.value !== 'atom') {
          warnings.push(`${relativePath}:${typeHeader?.line ?? 1}: type must be atom; record not imported`)
          continue
        }
        const sourceHeader = parsed.headers.get('source')
        const sourceMatch = /^room-session ([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/([^/\s]+)$/.exec(
          sourceHeader?.value ?? '',
        )
        if (!sourceMatch) {
          throw new ProjectMemoryImportInputError(`${relativePath} has malformed Buzz source provenance.`)
        }
        if (sourceMatch[1] !== linkedSourceId) {
          throw new ProjectMemoryImportInputError(`${relativePath} does not match the linked Buzz channel.`)
        }
        const headerStatus = parsed.headers.get('status')
        if (headerStatus?.value !== status) {
          warnings.push(`${relativePath}:${headerStatus?.line ?? 1}: status does not match directory; record not imported`)
          continue
        }
        const createdHeader = parsed.headers.get('created')
        const createdAt = timestamp(createdHeader?.value)
        if (!createdAt) {
          warnings.push(
            `${relativePath}:${createdHeader?.line ?? 1}: created must be a valid YYYY-MM-DD date; record not imported`,
          )
          continue
        }
        const dateName = status === 'canon' ? 'canon-at' : status === 'rejected' ? 'rejected-at' : 'created'
        const dateHeader = parsed.headers.get(dateName)
        const capturedAt = status === 'provisional' ? createdAt : timestamp(dateHeader?.value)
        if (!capturedAt) {
          warnings.push(
            `${relativePath}:${dateHeader?.line ?? 1}: ${dateName} must be a valid YYYY-MM-DD date; record not imported`,
          )
          continue
        }
        const evidenceHeader = parsed.headers.get('evidence')
        const evidence = parseEvidenceIds(evidenceHeader?.value)
        const evidenceLine = evidenceHeader?.line ?? 1
        if (evidence.ids.length === 0) {
          warnings.push(
            `${relativePath}:${evidenceLine}: evidence requires at least one full Nostr event id; record not imported`,
          )
          continue
        }
        const rawClaim = parsed.sections.get('Decision')?.replace(/\s+/g, ' ').trim()
        if (!rawClaim) {
          warnings.push(`${relativePath}:1: missing Decision section; record not imported`)
          continue
        }
        const claim = truncateImportText(rawClaim, 600)
        if (claim !== rawClaim) warnings.push(`${relativePath}:1: claim truncated to 600 characters`)
        const unsafeLine = promptInjectionLine(content)
        if (unsafeLine !== undefined) {
          warnings.push(`${relativePath}:${unsafeLine}: prompt-injection pattern detected; imported as a flagged candidate`)
        }
        if (status === 'canon') {
          warnings.push(
            `${relativePath}:${headerStatus?.line ?? 1}: Buzz canon imported as a candidate; Ben arbitration or promotion is required`,
          )
        }
        const sourceHash = sourceFile.sourceHash
        if (evidence.malformed) {
          warnings.push(`${relativePath}:${evidenceLine}: malformed Buzz evidence locator discarded`)
        }
        if (evidence.truncated) {
          warnings.push(`${relativePath}:${evidenceLine}: Buzz evidence locators limited to 3`)
        }
        const tags = [`buzz:status:${status}`]
        if (`buzz:channel:${linkedSourceId}`.length <= 100) tags.push(`buzz:channel:${linkedSourceId}`)
        records.push({
          projectId,
          dedupeKey: `import:buzz:${sha256(`buzz\0${relativePath}\0${sourceHash}`)}`,
          kind: status === 'rejected' ? 'development' : 'canon',
          requestedStatus: 'candidate',
          claim,
          tags,
          source: {
            workflow: 'buzz',
            sourceId: relativePath,
            sourceUri: `buzz:${linkedSourceId}/${relativePath}`,
            sourceHash,
            capturedAt,
            approval: 'none',
          },
          evidence: evidence.ids.map(id => ({
            excerpt: 'Buzz evidence event.',
            locator: `nostr-event:${id}`,
          })),
          safety: unsafeLine === undefined ? 'clear' : 'flagged',
          spoiler: parsed.headers.get('spoiler')?.value.toLowerCase() === 'true',
        })
      }
    }
    return {
      source: 'buzz',
      projectId,
      records,
      warnings,
      duplicates: 0,
      counts: buildImportCounts(records, 0),
    }
  },
}
